from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from apps.entries.models import Entry
from apps.topics.models import LearnerTopicMastery

@receiver(post_save, sender=Entry)
def update_mastery_on_save(sender, instance, **kwargs):
    """Recalculate mastery when an entry is saved or updated."""
    mastery, _ = LearnerTopicMastery.objects.get_or_create(
        user=instance.user,
        topic=instance.topic
    )
    mastery.recalculate_mastery()

@receiver(post_delete, sender=Entry)
def update_mastery_on_delete(sender, instance, **kwargs):
    """Recalculate mastery when an entry is deleted."""
    mastery, _ = LearnerTopicMastery.objects.get_or_create(
        user=instance.user,
        topic=instance.topic
    )
    mastery.recalculate_mastery()
