from django.db import models
from django.conf import settings
from django.core.exceptions import PermissionDenied

class AuditLog(models.Model):
    """
    Immutable Audit Log table to track system activities.
    """
    # Actor
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_logs',
        help_text="The user who performed the action"
    )
    
    # Action Details
    action = models.CharField(max_length=50, help_text="Action performed (e.g., 'create_entry')")
    entity_type = models.CharField(max_length=50, help_text="Type of entity affected")
    entity_id = models.CharField(max_length=255, help_text="ID of the affected entity")
    status = models.CharField(max_length=20, default='SUCCESS', help_text="Status of the action")
    
    # Context
    metadata = models.JSONField(default=dict, blank=True, help_text="Additional context")
    request_id = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    
    # State Tracking
    before_state = models.JSONField(null=True, blank=True, help_text="State before the action")
    after_state = models.JSONField(null=True, blank=True, help_text="State after the action")
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['action']),
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['user']),
        ]

    def save(self, *args, **kwargs):
        if self.pk:
            raise PermissionDenied("Audit logs are immutable and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionDenied("Audit logs are immutable and cannot be deleted.")

    def __str__(self):
        return f"{self.action} on {self.entity_type} ({self.status})"
