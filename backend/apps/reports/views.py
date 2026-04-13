"""
Report API Views.

POST /api/reports/generate/  — Generate a fresh report (on-demand)
GET  /api/reports/            — List past reports for current user
GET  /api/reports/{id}/       — Get a specific report
"""
import logging

from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import Report
from .serializers import ReportSerializer, ReportListSerializer
from .generator import generate_report

logger = logging.getLogger(__name__)


class GenerateReportView(APIView):
    """
    POST /api/reports/generate/
    
    Body: {"period": "weekly" | "monthly" | "all_time", "user_id": 5}
    Admin only. user_id is required.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role != 'admin':
            return Response(
                {'error': 'Only admins can generate reports'},
                status=status.HTTP_403_FORBIDDEN,
            )

        period = request.data.get('period', 'weekly')
        if period not in ('weekly', 'monthly', 'all_time'):
            return Response(
                {'error': 'period must be weekly, monthly, or all_time'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Admin must specify which user to generate for
        target_user_id = request.data.get('user_id')
        if not target_user_id:
            return Response(
                {'error': 'user_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            report = generate_report(int(target_user_id), period)
            serializer = ReportSerializer(report)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Report generation failed: {e}")
            return Response(
                {'error': f'Report generation failed: {str(e)[:200]}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ReportListView(APIView):
    """
    GET /api/reports/
    Query params: ?period=weekly&limit=10&user_id=5
    Admin only.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != 'admin':
            return Response(
                {'error': 'Only admins can view reports'},
                status=status.HTTP_403_FORBIDDEN,
            )

        period = request.query_params.get('period')
        limit = int(request.query_params.get('limit', 10))
        limit = min(limit, 50)

        target_user_id = request.query_params.get('user_id')
        if target_user_id:
            qs = Report.objects.filter(user_id=int(target_user_id))
        else:
            qs = Report.objects.all()

        if period:
            qs = qs.filter(period=period)

        qs = qs.order_by('-generated_at')[:limit]
        serializer = ReportListSerializer(qs, many=True)
        return Response(serializer.data)


class ReportDetailView(APIView):
    """
    GET /api/reports/{id}/
    Admin only.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        if request.user.role != 'admin':
            return Response(
                {'error': 'Only admins can view reports'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            report = Report.objects.select_related('user').get(id=pk)
        except Report.DoesNotExist:
            return Response(
                {'error': 'Report not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ReportSerializer(report)
        return Response(serializer.data)


class TeamReportView(APIView):
    """
    GET /api/reports/team/?period=weekly
    Admin only. Returns aggregate stats + charts for all learners.
    No AI insights (no individual user context).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != 'admin':
            return Response(
                {'error': 'Only admins can view team reports'},
                status=status.HTTP_403_FORBIDDEN,
            )

        period = request.query_params.get('period', 'weekly')
        if period not in ('weekly', 'monthly', 'all_time'):
            return Response(
                {'error': 'period must be weekly, monthly, or all_time'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .queries import get_date_range, get_team_overview, get_team_charts

        try:
            start, end = get_date_range(period)
            overview = get_team_overview(start, end)
            charts = get_team_charts(start, end)

            return Response({
                'period': period,
                'period_start': start.isoformat(),
                'period_end': end.isoformat(),
                'overview': overview,
                'charts_data': charts,
            })
        except Exception as e:
            logger.error(f"Team report failed: {e}")
            return Response(
                {'error': f'Team report failed: {str(e)[:200]}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
