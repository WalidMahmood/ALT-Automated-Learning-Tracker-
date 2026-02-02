from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class Topic(models.Model):
    """
    Hierarchical topic model for learning topics.
    Supports parent-child relationships and soft delete.
    """
    name = models.CharField(max_length=255)
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='children'
    )
    depth = models.IntegerField(default=0, help_text="Hierarchy depth (0=root)")
    benchmark_hours = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        default=0,
        help_text="Expected hours to complete this topic"
    )
    difficulty = models.IntegerField(
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Difficulty level 1-5"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Soft delete flag - False means deleted"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Topic'
        verbose_name_plural = 'Topics'

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        """Calculate depth before saving"""
        if self.parent:
            self.depth = self.parent.depth + 1
        else:
            self.depth = 0
        super().save(*args, **kwargs)
        
        # If this topic has children, their depth might need updating
        # (Only relevant if moving a topic, but good for data integrity)
        for child in self.children.all():
            if child.depth != self.depth + 1:
                child.save()

    def soft_delete(self):
        """
        [Reload Triggered]
        Soft delete this topic and all its descendants recursively.
        Also removes this topic from any Training Plans to prevent 'ghost' hours.
        """
        # 1. Recursive soft delete for children
        children = self.children.filter(is_active=True)
        for child in children:
            child.soft_delete()

        # 2. Remove from Training Plans (Hard delete the association, as the topic is effectively gone)
        # We import here to avoid circular imports if any
        from apps.training_plans.models import PlanTopic
        PlanTopic.objects.filter(topic=self).delete()

        # 3. Soft delete self
        self.is_active = False
        self.save()


class LearnerTopicMastery(models.Model):
    """
    Tracks a learner's conceptual progress and mastery status for a topic.
    Supports bidirectional propagation of mastery state.
    """
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='topic_masteries'
    )
    topic = models.ForeignKey(
        Topic,
        on_delete=models.CASCADE,
        related_name='learner_masteries'
    )
    current_progress = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Conceptual completion percentage (0-100%)"
    )
    total_hours = models.DecimalField(
        max_digits=7,
        decimal_places=2,
        default=0,
        help_text="Cumulative hours logged for this topic"
    )
    is_locked = models.BooleanField(
        default=False,
        help_text="Locked if mastered (100%) or via hierarchy propagation"
    )
    last_entry_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'learner_topic_masteries'
        unique_together = ['user', 'topic']
        verbose_name = 'Learner Topic Mastery'
        verbose_name_plural = 'Learner Topic Masteries'

    def __str__(self):
        return f"{self.user.email} - {self.topic.name} ({self.current_progress}%)"

    def update_mastery(self, progress, hours, is_completed, entry_date):
        """
        Update leaf progress and trigger automated parent calculation.
        """
        if is_completed:
            self.current_progress = 100
            self.is_locked = True
        
        self.total_hours += hours
        self.save()
        
        # Propagation Logic
        if self.is_locked:
            self.propagate_down()
        
        # Always propagate up to update parent averages
        self.propagate_up()

    def recalculate_mastery(self, trigger_propagation=True):
        """
        Scan all active entries and children to rebuild mastery state.
        For leaf topics: Uses entry status.
        For parents: Uses child averages.
        """
        from apps.entries.models import Entry
        
        # Check if topic is leaf (no active children)
        children = Topic.objects.filter(parent=self.topic, is_active=True)
        has_children = children.exists()

        if not has_children:
            # Leaf logic: check entries
            entries = Entry.objects.filter(
                user=self.user,
                topic=self.topic,
                is_active=True
            ).order_by('date', 'created_at')

            if not entries.exists():
                self.current_progress = 0
                self.total_hours = 0
                self.is_locked = False
                self.last_entry_at = None
            else:
                self.total_hours = sum(e.hours for e in entries)
                # If any entry is completed, progress is 100%
                if entries.filter(is_completed=True).exists():
                    self.current_progress = 100
                    self.is_locked = True
                else:
                    self.current_progress = entries.order_by('-progress_percent').first().progress_percent
                    self.is_locked = self.current_progress >= 100
                
                self.last_entry_at = entries.last().created_at
        else:
            # Parent logic: Average of children
            total_calc_progress = 0
            count = children.count()
            
            for child in children:
                child_m, _ = LearnerTopicMastery.objects.get_or_create(
                    user=self.user,
                    topic=child
                )
                # Force a refresh of the child's organic state before calculating parent average
                # This breaks the "Lock Trap" where children stay at 100% because they were forced previously.
                child_m.recalculate_mastery(trigger_propagation=False)
                total_calc_progress += child_m.current_progress

            # Check for direct completion on the parent
            direct_entries = Entry.objects.filter(user=self.user, topic=self.topic, is_active=True)
            parent_is_directly_completed = direct_entries.filter(is_completed=True).exists()

            if parent_is_directly_completed:
                self.current_progress = 100
                self.is_locked = True
            else:
                self.current_progress = total_calc_progress / count if count > 0 else 0
                
                # Parent is locked only if ALL children are 100% AND locked
                all_children_locked = True
                for child in children:
                    child_m, _ = LearnerTopicMastery.objects.get_or_create(user=self.user, topic=child)
                    if not child_m.is_locked or child_m.current_progress < 100:
                        all_children_locked = False
                        break
                
                self.is_locked = all_children_locked
            
            child_hours = sum(
                LearnerTopicMastery.objects.filter(user=self.user, topic__in=children).values_list('total_hours', flat=True)
            )
            self.total_hours = sum(e.hours for e in direct_entries) + child_hours
            
            if direct_entries.exists():
                self.last_entry_at = direct_entries.order_by('-created_at').first().created_at

        self.save()
        
        if trigger_propagation:
            self.propagate_up()
            if self.is_locked:
                self.propagate_down()

    def propagate_down(self):
        """
        Parent mastered -> All descendants mastered.
        Parent unlocked -> Trigger recalculation for all descendants to revert to organic state.
        """
        children = Topic.objects.filter(parent=self.topic, is_active=True)
        for child in children:
            child_mastery, _ = LearnerTopicMastery.objects.get_or_create(
                user=self.user,
                topic=child
            )
            
            if self.is_locked:
                # Parent is locked -> Force child to 100%
                if not child_mastery.is_locked:
                    child_mastery.current_progress = 100
                    child_mastery.is_locked = True
                    child_mastery.save()
                    child_mastery.propagate_down()
            else:
                # Parent is UNLOCKED -> Child must check its own "organic" state
                # If it was only 100% because of this parent, it will now drop/unlock.
                if child_mastery.is_locked:
                    # trigger_propagation=False to prevent circular upward calls
                    child_mastery.recalculate_mastery(trigger_propagation=False)
                    child_mastery.propagate_down()

    def propagate_up(self):
        """
        Update parent's progress based on children averages.
        """
        if not self.topic.parent:
            return

        parent = self.topic.parent
        siblings = Topic.objects.filter(parent=parent, is_active=True)
        sibling_count = siblings.count()
        
        if sibling_count == 0:
            return

        total_progress = 0
        all_mastered = True
        
        for sibling in siblings:
            sibling_mastery, _ = LearnerTopicMastery.objects.get_or_create(
                user=self.user,
                topic=sibling
            )
            total_progress += sibling_mastery.current_progress
            if not sibling_mastery.is_locked or sibling_mastery.current_progress < 100:
                all_mastered = False
        
        parent_mastery, _ = LearnerTopicMastery.objects.get_or_create(
            user=self.user,
            topic=parent
        )
        
        parent_mastery.current_progress = total_progress / sibling_count
        parent_mastery.is_locked = all_mastered
        parent_mastery.save()
        
        # Continue up
        parent_mastery.propagate_up()
