from django.db import models
from django.conf import settings
from django.core.exceptions import PermissionDenied


class AuditLog(models.Model):
    """
    Immutable Audit Log table to track all user and admin activities.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_logs',
        help_text="The user (Actor) who performed the action"
    )
    action = models.CharField(max_length=50, help_text="Action performed (e.g., 'create_entry')")
    entity_type = models.CharField(max_length=50, help_text="Type of entity affected (e.g., 'entry')")
    entity_id = models.IntegerField(help_text="ID of the affected entity")
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='target_audit_logs',
        help_text="The user affected by an admin action (Optional)"
    )
    before_state = models.JSONField(null=True, blank=True, help_text="Snapshot before change")
    after_state = models.JSONField(null=True, blank=True, help_text="Snapshot after change")
    reason = models.TextField(null=True, blank=True, help_text="Reason for the action (e.g., override reason)")
    comment = models.TextField(null=True, blank=True, help_text="Additional comments")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['action']),
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['created_at']),
        ]

    def save(self, *args, **kwargs):
        if self.pk:
            raise PermissionDenied("Audit logs are immutable and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionDenied("Audit logs are immutable and cannot be deleted.")

    def __str__(self):
        return f"{self.user} - {self.action} on {self.entity_type} ({self.created_at})"
