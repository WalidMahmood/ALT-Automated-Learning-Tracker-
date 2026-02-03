from .models import AuditLog
import logging

logger = logging.getLogger(__name__)

def log_audit(user, action, entity_type, entity_id, status='SUCCESS', metadata=None, request_id=None, before_state=None, after_state=None):
    """
    Fail-safe helper to create an audit log entry.
    """
    if metadata is None:
        metadata = {}

    try:
        AuditLog.objects.create(
            user=user if user and user.is_authenticated else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            status=status,
            metadata=metadata,
            request_id=request_id,
            before_state=before_state,
            after_state=after_state
        )
    except Exception as e:
        # Standard logging fallback - NEVER crash the app for an audit log failure
        logger.error(f"FAILED TO WRITE AUDIT LOG: {e} | Action: {action} | Entity: {entity_type}:{entity_id}")
