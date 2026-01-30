"""
API Views for Training Plan management
"""
import logging
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import TrainingPlan, PlanAssignment
from .serializers import (
    TrainingPlanSerializer,
    TrainingPlanCreateUpdateSerializer,
    AssignUsersSerializer,
    PlanAssignmentSerializer,
)
from apps.users.permissions import IsAdmin
from apps.users.models import User

logger = logging.getLogger(__name__)


class TrainingPlanListCreateView(generics.ListCreateAPIView):
    """
    GET /api/training-plans/ - List all non-archived plans
    POST /api/training-plans/ - Create new plan (admin only)
    """
    
    pagination_class = None
    
    def get_queryset(self):
        """Return non-archived plans with related data"""
        queryset = TrainingPlan.objects.prefetch_related(
            'plan_topics__topic',
            'assignments__user',
            'assignments__assigned_by_admin'
        )
        
        # Filter by archived status if specified
        is_archived = self.request.query_params.get('archived', 'false')
        if is_archived.lower() == 'true':
            queryset = queryset.filter(is_archived=True)
        else:
            queryset = queryset.filter(is_archived=False)
        
        # Filter by active status if specified
        is_active = self.request.query_params.get('active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return TrainingPlanCreateUpdateSerializer
        return TrainingPlanSerializer
    
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAuthenticated()]
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan = serializer.save()
        logger.info(f"Training plan created: {plan.plan_name} (ID: {plan.id})")
        return Response(
            TrainingPlanSerializer(plan).data,
            status=status.HTTP_201_CREATED
        )


class TrainingPlanDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET /api/training-plans/<id>/ - Get single plan
    PUT /api/training-plans/<id>/ - Update plan (admin only)
    DELETE /api/training-plans/<id>/ - Archive plan (admin only)
    """
    
    def get_queryset(self):
        return TrainingPlan.objects.prefetch_related(
            'plan_topics__topic',
            'assignments__user',
            'assignments__assigned_by_admin'
        )
    
    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return TrainingPlanCreateUpdateSerializer
        return TrainingPlanSerializer
    
    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            return [IsAdmin()]
        return [IsAuthenticated()]
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        plan = serializer.save()
        logger.info(f"Training plan updated: {plan.plan_name} (ID: {plan.id})")
        return Response(TrainingPlanSerializer(plan).data)
    
    def destroy(self, request, *args, **kwargs):
        """Archive the plan (soft delete)"""
        instance = self.get_object()
        instance.archive()
        logger.info(f"Training plan archived: {instance.plan_name} (ID: {instance.id})")
        return Response(
            {'message': 'Training plan archived successfully'},
            status=status.HTTP_200_OK
        )


class TrainingPlanRestoreView(APIView):
    """
    POST /api/training-plans/<id>/restore/ - Restore plan from archive
    """
    permission_classes = [IsAdmin]
    
    def post(self, request, pk):
        try:
            plan = TrainingPlan.objects.get(pk=pk)
            plan.restore()
            logger.info(f"Training plan restored: {plan.plan_name} (ID: {plan.id})")
            return Response(
                TrainingPlanSerializer(plan).data,
                status=status.HTTP_200_OK
            )
        except TrainingPlan.DoesNotExist:
            return Response(
                {'error': 'Training plan not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class TrainingPlanAssignView(APIView):
    """
    POST /api/training-plans/<id>/assign/ - Assign users to plan
    """
    permission_classes = [IsAdmin]
    
    def post(self, request, pk):
        try:
            plan = TrainingPlan.objects.get(pk=pk)
        except TrainingPlan.DoesNotExist:
            return Response(
                {'error': 'Training plan not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = AssignUsersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user_ids = serializer.validated_data['user_ids']
        assigned_count = 0
        
        for user_id in user_ids:
            try:
                user = User.objects.get(pk=user_id, is_active=True)
                # Check if already assigned
                if not PlanAssignment.objects.filter(plan=plan, user=user).exists():
                    PlanAssignment.objects.create(
                        plan=plan,
                        user=user,
                        assigned_by_admin=request.user
                    )
                    assigned_count += 1
            except User.DoesNotExist:
                continue
        
        logger.info(f"Assigned {assigned_count} users to plan: {plan.plan_name}")
        return Response({
            'message': f'Assigned {assigned_count} users to plan',
            'plan': TrainingPlanSerializer(plan).data
        })


class UserAssignmentsView(generics.ListAPIView):
    """
    GET /api/training-plans/assignments/my_assignments/ - List user's assignments
    """
    permission_classes = [IsAuthenticated]
    serializer_class = PlanAssignmentSerializer
    pagination_class = None

    def get_queryset(self):
        return PlanAssignment.objects.filter(
            user=self.request.user
        ).select_related('plan').prefetch_related('plan__plan_topics__topic')
