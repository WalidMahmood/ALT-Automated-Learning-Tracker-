from rest_framework import viewsets, pagination
from .models import AuditLog
from .serializers import AuditLogSerializer
from apps.users.permissions import IsAdmin

class StandardResultsSetPagination(pagination.PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 100

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin] 
    pagination_class = StandardResultsSetPagination
    filterset_fields = ['action', 'entity_type', 'status', 'user']
    search_fields = ['entity_id', 'request_id', 'action']
