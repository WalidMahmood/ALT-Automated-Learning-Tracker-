from django.dispatch import receiver
from django.db.models.signals import pre_save, post_save, post_delete
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.forms.models import model_to_dict
from django.core.serializers.json import DjangoJSONEncoder
import json
from .services import log_audit
from .utils import get_current_user, get_request_id

# Import ALL models to track
from apps.users.models import User
from apps.entries.models import Entry
from apps.topics.models import Topic
from apps.training_plans.models import TrainingPlan, PlanAssignment
from apps.leaves.models import LeaveRequest

# Explicit whitelist of models to track
TRACKED_MODELS = [User, Entry, Topic, TrainingPlan, PlanAssignment, LeaveRequest]

def serialize_state(instance):
    """
    Helper to serialize model instance to a JSON-compatible dict.
    """
    try:
        data = model_to_dict(instance)
        return json.loads(json.dumps(data, cls=DjangoJSONEncoder))
    except Exception:
        return {}

def get_diff(old_state, new_state):
    """
    Compare two states and return the changed fields.
    """
    diff = {}
    for key, new_value in new_state.items():
        old_value = old_state.get(key)
        if new_value != old_value:
            diff[key] = {'from': old_value, 'to': new_value}
    return diff

@receiver(pre_save)
def capture_old_state(sender, instance, **kwargs):
    if sender not in TRACKED_MODELS:
        return
    
    if instance.pk:
        try:
            old_instance = sender.objects.get(pk=instance.pk)
            instance._old_state = serialize_state(old_instance)
        except sender.DoesNotExist:
            instance._old_state = None
    else:
        instance._old_state = None

@receiver(post_save)
def log_model_create_update(sender, instance, created, **kwargs):
    try:
        if sender not in TRACKED_MODELS:
            return

        user = get_current_user()
        if user and not user.is_authenticated:
            user = None

        request_id = get_request_id()
        current_state = serialize_state(instance)
        
        if created:
            # Human-readable action names for CREATE operations
            action_map = {
                'Entry': 'Created Entry',
                'User': 'Created User',
                'Topic': 'Created Topic',
                'TrainingPlan': 'Created Training Plan',
                'PlanAssignment': 'Assigned Plan',
                'LeaveRequest': 'Marked Leave'
            }
            action = action_map.get(sender.__name__, f"Created {sender.__name__}")
            before_state = None
            after_state = current_state
            metadata = {}
        else:
            before_state = getattr(instance, '_old_state', {})
            after_state = current_state
            
            # Default UPDATE action
            action_map = {
                'Entry': 'Updated Entry',
                'User': 'Updated User',
                'Topic': 'Updated Topic',
                'TrainingPlan': 'Updated Training Plan',
                'PlanAssignment': 'Updated Plan Assignment',
                'LeaveRequest': 'Updated Leave'
            }
            action = action_map.get(sender.__name__, f"Updated {sender.__name__}")
            
            # INTELLIGENT ACTION NAMING BASED ON FIELD CHANGES
            if before_state:
                changes = get_diff(before_state, after_state)
                
                # Soft Delete Detection (is_active: true -> false)
                if 'is_active' in changes and changes['is_active']['to'] == False:
                    delete_map = {
                        'Entry': 'Deleted Entry',
                        'User': 'Deleted User',
                        'Topic': 'Deleted Topic',
                        'TrainingPlan': 'Deleted Training Plan'
                    }
                    action = delete_map.get(sender.__name__, f"Deleted {sender.__name__}")
                
                # Restore Detection (is_active: false -> true)
                elif 'is_active' in changes and changes['is_active']['to'] == True:
                    restore_map = {
                        'Entry': 'Restored Entry',
                        'User': 'Restored User',
                        'Topic': 'Restored Topic',
                        'TrainingPlan': 'Restored Training Plan'
                    }
                    action = restore_map.get(sender.__name__, f"Restored {sender.__name__}")
                
                # LeaveRequest status changes
                elif sender == LeaveRequest and 'status' in changes:
                    new_status = changes['status']['to']
                    if new_status == 'rejected':
                        action = 'Rejected Leave'
                    elif new_status == 'approved':
                        action = 'Approved Leave'
                    elif new_status == 'cancelled':
                        action = 'Cancelled Leave'
                
                # Entry status changes (approval workflow)
                elif sender == Entry and 'status' in changes:
                    new_status = changes['status']['to']
                    if new_status == 'approved':
                        action = 'Approved Entry'
                    elif new_status == 'rejected':
                        action = 'Rejected Entry'
                    elif new_status == 'flagged':
                        action = 'Flagged Entry'
                
                # Store changed fields for reference
                metadata = {'changed_fields': list(changes.keys())}
            else:
                metadata = {}

        log_audit(
            user=user,
            action=action,
            entity_type=sender.__name__,
            entity_id=instance.pk,
            request_id=request_id,
            before_state=before_state,
            after_state=after_state,
            metadata=metadata
        )
    except Exception as e:
        print(f"[AUDIT ERROR] post_save: {sender.__name__}: {str(e)}")
        pass

@receiver(post_delete)
def log_model_delete(sender, instance, **kwargs):
    try:
        if sender not in TRACKED_MODELS:
            return

        user = get_current_user()
        if user and not user.is_authenticated:
            user = None

        before_state = serialize_state(instance)
        
        # Human-readable DELETE action names
        delete_map = {
            'Entry': 'Deleted Entry (Hard)',
            'User': 'Deleted User (Hard)',
            'Topic': 'Deleted Topic (Hard)',
            'TrainingPlan': 'Deleted Training Plan (Hard)',
            'PlanAssignment': 'Removed Plan Assignment',
            'LeaveRequest': 'Deleted Leave (Hard)'
        }
        action = delete_map.get(sender.__name__, f"Deleted {sender.__name__}")

        log_audit(
            user=user,
            action=action,
            entity_type=sender.__name__,
            entity_id=instance.pk,
            request_id=get_request_id(),
            before_state=before_state,
            after_state=None
        )
    except Exception as e:
        print(f"[AUDIT ERROR] post_delete: {sender.__name__}: {str(e)}")
        pass

# AUTHENTICATION SIGNALS
@receiver(user_logged_in)
def log_user_login(sender, request, user, **kwargs):
    request_id = get_request_id() or getattr(request, 'request_id', None)
    
    log_audit(
        user=user,
        action='User Login',
        entity_type='User',
        entity_id=user.id,
        status='SUCCESS',
        request_id=request_id,
        metadata={
            'ip_address': request.META.get('REMOTE_ADDR'),
            'user_agent': request.META.get('HTTP_USER_AGENT', '')
        }
    )

@receiver(user_logged_out)
def log_user_logout(sender, request, user, **kwargs):
    request_id = get_request_id() or getattr(request, 'request_id', None)
    
    log_audit(
        user=user,
        action='User Logout',
        entity_type='User',
        entity_id=user.id if user else 'unknown',
        status='SUCCESS',
        request_id=request_id,
        metadata={
            'ip_address': request.META.get('REMOTE_ADDR'),
            'user_agent': request.META.get('HTTP_USER_AGENT', '')
        }
    )

@receiver(user_login_failed)
def log_user_login_failed(sender, credentials, request, **kwargs):
    request_id = get_request_id() or getattr(request, 'request_id', None)
    
    username = credentials.get('username') or credentials.get('email')
    
    log_audit(
        user=None,
        action='Failed Login Attempt',
        entity_type='User',
        entity_id=username or 'unknown',
        status='FAILURE',
        request_id=request_id,
        metadata={
            'ip_address': request.META.get('REMOTE_ADDR'),
            'user_agent': request.META.get('HTTP_USER_AGENT', ''),
            'reason': 'Invalid credentials'
        }
    )
