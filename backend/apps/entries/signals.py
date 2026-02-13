from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from django.db import transaction
from .models import Entry
from apps.topics.models import LearnerTopicMastery
import logging

logger = logging.getLogger(__name__)

# Track fields that should trigger re-analysis
AI_SENSITIVE_FIELDS = {'hours', 'learned_text', 'blockers_text', 'topic_id'}


@receiver(pre_save, sender=Entry)
def track_changes_for_ai(sender, instance, **kwargs):
    """
    Track if AI-sensitive fields changed (for re-analysis on update).
    """
    if instance.pk:
        try:
            old_instance = Entry.objects.get(pk=instance.pk)
            instance._ai_needs_reanalysis = any(
                getattr(old_instance, field, None) != getattr(instance, field, None)
                for field in AI_SENSITIVE_FIELDS
            )
        except Entry.DoesNotExist:
            instance._ai_needs_reanalysis = False
    else:
        instance._ai_needs_reanalysis = False


@receiver(post_save, sender=Entry)
def update_mastery_and_trigger_ai(sender, instance, created, **kwargs):
    """
    1. Update mastery when entry saved (topic-based entries only)
    2. Trigger AI analysis for new entries or updated sensitive fields
    """
    # Skip if this is an internal AI update
    if kwargs.get('update_fields') and 'ai_status' in kwargs.get('update_fields', []):
        return
    
    # Update mastery (only for entries with a topic)
    if instance.topic:
        mastery, _ = LearnerTopicMastery.objects.get_or_create(
            user=instance.user,
            topic=instance.topic
        )
        logger.info(f"SIGNAL: post_save entry for {instance.topic.name}. Recalculating mastery...")
        mastery.recalculate_mastery()

    # Sync project completion from entry is_completed flag
    if instance.project and instance.is_completed and not instance.project.is_completed:
        instance.project.is_completed = True
        instance.project.save(update_fields=['is_completed', 'updated_at'])

    # Trigger AI Analysis
    # Conditions:
    # 1. Entry is active
    # 2. Not already overridden by admin
    # 3. Is new OR has changes to AI-sensitive fields
    should_analyze = (
        instance.is_active and 
        not instance.admin_override and
        (created or getattr(instance, '_ai_needs_reanalysis', False))
    )
    
    if should_analyze:
        # Reset AI status for re-analysis
        if not created:
            Entry.objects.filter(id=instance.id).update(ai_status='pending')
            logger.info(f"SIGNAL: Entry {instance.id} marked for re-analysis (fields changed).")
        
        # Import here to avoid circular import
        from .tasks import analyze_entry_task
        
        # Use transaction.on_commit to ensure the entry is saved before task runs
        transaction.on_commit(lambda: analyze_entry_task.delay(instance.id))
        logger.info(f"SIGNAL: AI analysis task queued for Entry {instance.id}.")


@receiver(post_delete, sender=Entry)
def update_mastery_on_delete(sender, instance, **kwargs):
    """Recalculate mastery when entry hard deleted (topic-based only)"""
    if not instance.topic:
        return
    try:
        mastery = LearnerTopicMastery.objects.get(
            user=instance.user,
            topic=instance.topic
        )
        logger.info(f"SIGNAL: post_delete entry for {instance.topic.name}. Recalculating mastery...")
        mastery.recalculate_mastery()
    except LearnerTopicMastery.DoesNotExist:
        pass
