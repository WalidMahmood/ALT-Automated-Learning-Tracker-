from .models import AuditLog
import json
from django.core.serializers.json import DjangoJSONEncoder
from django.forms.models import model_to_dict


def get_state(instance):
    """
    Returns a dictionary representation of a model instance, 
    ensuring it is JSON serializable.
    """
    if not instance:
        return None
    
    # model_to_dict includes many-to-many but converts dates to objects
    data = model_to_dict(instance)
    
    # We use DjangoJSONEncoder to handle dates, decimals, etc.
    # We serialize and deserialize to get a clean dictionary of primitives
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))


def log_action(request, action, entity_type, entity_id, target_user=None, before_state=None, after_state=None, reason=None, comment=None):
    """
    Helper function to create an audit log entry.
    """
    ip_address = None
    user_agent = None
    user = None

    if request:
        # Extract IP address
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip_address = x_forwarded_for.split(',')[0]
        else:
            ip_address = request.META.get('REMOTE_ADDR')

        # Extract User Agent
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        
        # User
        if hasattr(request, 'user') and request.user.is_authenticated:
            user = request.user

    # Create the log
    return AuditLog.objects.create(
        user=user,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        target_user=target_user,
        before_state=before_state,
        after_state=after_state,
        reason=reason,
        comment=comment,
        ip_address=ip_address,
        user_agent=user_agent
    )
