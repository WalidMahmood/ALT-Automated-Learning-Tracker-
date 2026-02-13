from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Count, Max, Q
from django_filters.rest_framework import DjangoFilterBackend
from .models import Entry, Project
from .serializers import EntrySerializer, ProjectSerializer, ProjectDetailSerializer
from .serializers import EntrySerializer


class ProjectViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for Projects with soft-delete support.
    Learners see only their own projects. Admins see all.
    """
    serializer_class = ProjectSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_fields = ['user', 'is_completed', 'is_active']
    ordering_fields = ['updated_at', 'created_at', 'name']
    search_fields = ['name']

    def get_queryset(self):
        user = self.request.user
        queryset = Project.objects.filter(is_active=True)
        if user.role == 'admin':
            return queryset
        return queryset.filter(user=user)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ProjectDetailSerializer
        return ProjectSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        """Soft delete the project."""
        instance.soft_delete()

    @action(detail=True, methods=['patch'])
    def toggle_complete(self, request, pk=None):
        """Toggle project completion status."""
        project = self.get_object()
        project.is_completed = not project.is_completed
        project.save()
        return Response(ProjectSerializer(project).data)

    @action(detail=False, methods=['get'])
    def all_projects(self, request):
        """Admin endpoint: all projects across all users with stats."""
        if request.user.role != 'admin':
            return Response({'error': 'Admin only'}, status=status.HTTP_403_FORBIDDEN)
        
        qs = Project.objects.filter(is_active=True).select_related('user')
        
        # Optional filters
        user_id = request.query_params.get('user')
        is_completed = request.query_params.get('is_completed')
        search = request.query_params.get('search')
        
        if user_id:
            qs = qs.filter(user_id=user_id)
        if is_completed is not None:
            qs = qs.filter(is_completed=is_completed.lower() == 'true')
        if search:
            qs = qs.filter(name__icontains=search)
        
        serializer = ProjectSerializer(qs, many=True)
        return Response(serializer.data)


class EntryViewSet(viewsets.ModelViewSet):
    queryset = Entry.objects.filter(is_active=True)
    serializer_class = EntrySerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['date', 'topic', 'user', 'status', 'project', 'intent']
    ordering_fields = ['date', 'created_at']

    def get_queryset(self):
        user = self.request.user
        queryset = Entry.objects.filter(is_active=True)
        
        if user.role == 'admin':
            return queryset
        return queryset.filter(user=user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        instance.soft_delete()

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def user_projects(self, request):
        """Return the authenticated user's projects from Project model."""
        user = request.user
        projects = Project.objects.filter(user=user, is_active=True).order_by('-updated_at')
        serializer = ProjectSerializer(projects, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def override(self, request, pk=None):
        """Admin override for AI decision"""
        entry = self.get_object()
        user = request.user
        
        # Only admins can override
        if user.role != 'admin':
            return Response(
                {'error': 'Only admins can override entries'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        new_status = request.data.get('status')
        reason = request.data.get('reason')
        comment = request.data.get('comment', '')
        
        if not new_status or not reason:
            return Response(
                {'error': 'Status and reason are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update entry
        entry.status = new_status
        entry.admin = user
        entry.admin_override = True
        entry.override_reason = reason
        entry.override_comment = comment
        entry.override_at = timezone.now()
        entry.save()
        
        serializer = self.get_serializer(entry)
        return Response(serializer.data)
