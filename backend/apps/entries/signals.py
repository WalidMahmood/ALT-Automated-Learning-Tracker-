from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Entry
from apps.topics.models import LearnerTopicMastery
import logging

logger = logging.getLogger(__name__)

@receiver(post_save, sender=Entry)
def update_mastery_on_save(sender, instance, created, **kwargs):
    """Update or recalculate mastery when entry saved"""
    mastery, _ = LearnerTopicMastery.objects.get_or_create(
        user=instance.user,
        topic=instance.topic
    )
    logger.info(f"SIGNAL: post_save entry for {instance.topic.name}. Recalculating mastery...")
    mastery.recalculate_mastery()

@receiver(post_delete, sender=Entry)
def update_mastery_on_delete(sender, instance, **kwargs):
    """Recalculate mastery when entry hard deleted"""
    try:
        mastery = LearnerTopicMastery.objects.get(
            user=instance.user,
            topic=instance.topic
        )
        logger.info(f"SIGNAL: post_delete entry for {instance.topic.name}. Recalculating mastery...")
        mastery.recalculate_mastery()
    except LearnerTopicMastery.DoesNotExist:
        pass
