"""
LND Bridge Views — API endpoints for data bridges.

Endpoints:
  GET  /api/lnd-bridge/erp-employees/         — Search ERP employees (for user creation)
  POST /api/lnd-bridge/create-from-erp/        — Create ALTS user from ERP data
  GET  /api/lnd-bridge/lms-courses/            — Fetch LMS courses (for training plans)
  GET  /api/lnd-bridge/lms-progress/<employee_id>/ — User's LMS progress
  GET  /api/lnd-bridge/health/                 — LND sidecar health check

  POST /api/lnd-bridge/plan-requests/          — Create plan request
  GET  /api/lnd-bridge/plan-requests/          — List plan requests (filtered by status)
  PATCH /api/lnd-bridge/plan-requests/<id>/pm-review/  — PM review
  PATCH /api/lnd-bridge/plan-requests/<id>/lnd-review/ — LND admin review
"""
import logging
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.users.models import User
from apps.training_plans.models import TrainingPlan
from .models import TrainingPlanRequest
from .serializers import (
    ERPEmployeeSerializer,
    CreateUserFromERPSerializer,
    LMSCourseSerializer,
    TrainingPlanRequestSerializer,
    TrainingPlanRequestCreateSerializer,
    TrainingPlanRequestReviewSerializer,
)
from .services import LndSidecarClient, ERPUserService, ApprovalWorkflowService

logger = logging.getLogger(__name__)


def _is_admin(user):
    return user.is_authenticated and getattr(user, 'role', None) == 'admin'


# ============================================================================
# ERP Employee Endpoints
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def erp_employees_view(request):
    """
    Search ERP employees via the LND sidecar.
    Used by admin when creating new ALTS users from ERP data.

    Query params:
        search: Filter by name or employee ID
        limit: Max results (default 50)
        offset: Pagination offset
    """
    if not _is_admin(request.user):
        return Response({'detail': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)

    search = request.query_params.get('search', '')
    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))

    employees = LndSidecarClient.get_erp_employees(search=search, limit=limit, offset=offset)

    # Enrich with has_alts_account flag
    if employees:
        existing_emails = set(
            User.objects.filter(is_active=True)
            .values_list('email', flat=True)
        )
        existing_emp_ids = set(
            User.objects.filter(is_active=True, employee_id__isnull=False)
            .exclude(employee_id='')
            .values_list('employee_id', flat=True)
        )
        for emp in employees:
            email = emp.get('email', '')
            emp_id = emp.get('employee_id', '')
            emp['has_alts_account'] = (email in existing_emails) or (emp_id in existing_emp_ids)

    return Response(employees)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_user_from_erp_view(request):
    """
    Create a new ALTS user from ERP employee data.
    Admin selects an employee from ERP list, submits their data to create an account.
    """
    if not _is_admin(request.user):
        return Response({'detail': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)

    serializer = CreateUserFromERPSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        user = ERPUserService.create_user_from_erp(serializer.validated_data)
        return Response(
            {
                'id': user.id,
                'email': user.email,
                'full_name': user.full_name,
                'employee_id': user.employee_id,
                'message': f'User {user.full_name} created successfully from ERP data.'
            },
            status=status.HTTP_201_CREATED
        )
    except Exception as e:
        logger.error("Error creating user from ERP: %s", str(e))
        return Response(
            {'detail': f'Failed to create user: {str(e)}'},
            status=status.HTTP_400_BAD_REQUEST
        )


# ============================================================================
# LMS Course Endpoints
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def lms_courses_view(request):
    """Fetch LMS courses from the LND sidecar for training plan assignment."""
    if not _is_admin(request.user):
        return Response({'detail': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)

    courses = LndSidecarClient.get_lms_courses(
        include_enrollment_counts=request.query_params.get('include_counts', False)
    )
    return Response({'courses': courses})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def lms_user_progress_view(request, employee_id):
    """Fetch a user's LMS course progress for display in their profile/plan."""
    if not _is_admin(request.user) and request.user.employee_id != employee_id:
        return Response({'detail': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    courses = LndSidecarClient.get_user_lms_progress(employee_id)
    return Response({'courses': courses})


# ============================================================================
# Health Check
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def health_view(request):
    """Check if the LND sidecar is running."""
    is_healthy = LndSidecarClient.check_health()
    return Response({
        'lnd_sidecar': 'online' if is_healthy else 'offline',
        'proxy_status': 'active',
    }, status=200 if is_healthy else 503)


# ============================================================================
# Training Plan Request / Approval Workflow
# ============================================================================

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def plan_requests_view(request):
    """
    GET:  List plan requests (filterable by status, user)
    POST: Create a new plan request
    """
    if request.method == 'GET':
        queryset = TrainingPlanRequest.objects.select_related(
            'user', 'plan', 'pm_reviewer', 'lnd_reviewer'
        ).all()

        # Filter by status
        req_status = request.query_params.get('status')
        if req_status:
            queryset = queryset.filter(status=req_status)

        # Filter by user (learners see only their own)
        if not _is_admin(request.user):
            queryset = queryset.filter(user=request.user)

        serializer = TrainingPlanRequestSerializer(queryset, many=True)
        return Response(serializer.data)

    elif request.method == 'POST':
        serializer = TrainingPlanRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            user = User.objects.get(id=data['user_id'], is_active=True)
            plan = TrainingPlan.objects.get(id=data['plan_id'], is_archived=False)
        except (User.DoesNotExist, TrainingPlan.DoesNotExist) as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)

        # Permission check: learners can only request for themselves
        if not _is_admin(request.user) and user != request.user:
            return Response(
                {'detail': 'You can only request plans for yourself'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            plan_request = ApprovalWorkflowService.create_request(
                user=user,
                plan=plan,
                initiated_by=data.get('initiated_by', 'user'),
                reason=data.get('request_reason', ''),
            )
            return Response(
                TrainingPlanRequestSerializer(plan_request).data,
                status=status.HTTP_201_CREATED
            )
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def plan_request_pm_review_view(request, pk):
    """PM reviews (approves/rejects) a training plan request."""
    try:
        plan_request = TrainingPlanRequest.objects.get(pk=pk)
    except TrainingPlanRequest.DoesNotExist:
        return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = TrainingPlanRequestReviewSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        updated = ApprovalWorkflowService.pm_review(
            request_obj=plan_request,
            reviewer=request.user,
            action=serializer.validated_data['action'],
            notes=serializer.validated_data.get('notes', ''),
        )
        return Response(TrainingPlanRequestSerializer(updated).data)
    except ValueError as e:
        return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def plan_request_lnd_review_view(request, pk):
    """LND admin gives final approval or rejects a plan request."""
    if not _is_admin(request.user):
        return Response({'detail': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)

    try:
        plan_request = TrainingPlanRequest.objects.get(pk=pk)
    except TrainingPlanRequest.DoesNotExist:
        return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = TrainingPlanRequestReviewSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        updated = ApprovalWorkflowService.lnd_review(
            request_obj=plan_request,
            reviewer=request.user,
            action=serializer.validated_data['action'],
            notes=serializer.validated_data.get('notes', ''),
        )
        return Response(TrainingPlanRequestSerializer(updated).data)
    except ValueError as e:
        return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
