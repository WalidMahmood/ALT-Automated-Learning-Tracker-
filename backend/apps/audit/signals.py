from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from apps.entries.models import Entry
from apps.leaves.models import LeaveRequest
from apps.topics.models import Topic
from apps.training_plans.models import TrainingPlan, PlanAssignment, PlanTopic
from .utils import log_action, get_state
from .middleware import get_current_request

User = get_user_model()

# List of models to track
TRACKED_MODELS = [User, Entry, LeaveRequest, Topic, TrainingPlan, PlanAssignment, PlanTopic]

def get_entity_type(instance):
    return instance._meta.model_name

@receiver(pre_save)
def capture_before_state(sender, instance, **kwargs):
    if sender not in TRACKED_MODELS:
        return
    
    if instance.pk:
        try:
            # We fetch a fresh copy from the database to get the state BEFORE the save
            old_instance = sender.objects.get(pk=instance.pk)
            instance._before_state = get_state(old_instance)
        except sender.DoesNotExist:
            instance._before_state = None
    else:
        instance._before_state = None

@receiver(post_save)
def log_save_action(sender, instance, created, **kwargs):
    if sender not in TRACKED_MODELS:
        return

    request = get_current_request()
    
    # Determine Action Name
    entity_type = get_entity_type(instance)
    if created:
        action = f"create_{entity_type}"
    else:
        action = f"update_{entity_type}"

    # Special case mappings for better readability
    if sender == PlanAssignment and created:
        action = "assign_plan"
    elif sender == LeaveRequest and created:
        action = "request_leave"
    elif sender == User and not created and not instance.is_active:
        action = "soft_delete_user"
    elif sender == Entry and not created and not instance.is_active:
        action = "delete_entry"
    elif sender == TrainingPlan and not created and instance.is_archived:
        action = "archive_training_plan"

    # Capture after state
    after_state = get_state(instance)
    before_state = getattr(instance, '_before_state', None)

    # Determine Target User
    target_user = None
    if hasattr(instance, 'user'):
        request_user = getattr(request, 'user', None) if request else None
        if instance.user != request_user:
            target_user = instance.user
    elif sender == User:
        target_user = instance

    log_action(
        request=request,
        action=action,
        entity_type=entity_type,
        entity_id=instance.id,
        target_user=target_user,
        before_state=before_state,
        after_state=after_state
    )

@receiver(post_delete)
def log_delete_action(sender, instance, **kwargs):
    if sender not in TRACKED_MODELS:
        return

    request = get_current_request()
    entity_type = get_entity_type(instance)
    
    log_action(
        request=request,
        action=f"hard_delete_{entity_type}",
        entity_type=entity_type,
        entity_id=instance.id,
        before_state=get_state(instance),
        after_state=None
    )
