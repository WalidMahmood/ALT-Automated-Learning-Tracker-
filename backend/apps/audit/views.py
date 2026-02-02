from rest_framework import viewsets, permissions
from .models import AuditLog
from .serializers import AuditLogSerializer


class IsSuperUser(permissions.BasePermission):
    """
    Custom permission to only allow superusers to access.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing audit logs. Only accessible by Super Admin.
    """
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsSuperUser]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filtering
        action = self.request.query_params.get('action')
        entity_type = self.request.query_params.get('entity_type')
        user_id = self.request.query_params.get('user_id')
        
        if action:
            queryset = queryset.filter(action=action)
        if entity_type:
            queryset = queryset.filter(entity_type=entity_type)
        if user_id:
            queryset = queryset.filter(user_id=user_id)
            
        return queryset
