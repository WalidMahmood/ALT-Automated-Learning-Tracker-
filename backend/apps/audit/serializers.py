from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    target_user_email = serializers.EmailField(source='target_user.email', read_only=True)
    
    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'user_email', 'action', 'entity_type', 'entity_id',
            'target_user', 'target_user_email', 'before_state', 'after_state',
            'reason', 'comment', 'ip_address', 'user_agent', 'created_at'
        ]
        read_only_fields = fields
