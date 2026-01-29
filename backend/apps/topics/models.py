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
        """Soft delete this topic"""
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

    def update_mastery(self, progress, hours, entry_date):
        """Update progress and handle propagation"""
        self.current_progress = max(self.current_progress, progress)
        self.total_hours += hours
        if not self.last_entry_at or entry_date > self.last_entry_at.date():
             # Store highest date seen
             pass 

        if self.current_progress >= 100:
            self.is_locked = True
        
        self.save()
        
        # Propagation Logic
        if self.is_locked:
            self.propagate_down()
            self.propagate_up()

    def recalculate_mastery(self, trigger_propagation=True):
        """
        Scan all active entries to rebuild mastery state.
        Useful after deletion or bulk updates.
        """
        from apps.entries.models import Entry
        entries = Entry.objects.filter(
            user=self.user,
            topic=self.topic,
            is_active=True
        ).order_by('date', 'created_at')

        was_locked = self.is_locked

        if not entries.exists():
            self.current_progress = 0
            self.total_hours = 0
            self.is_locked = False
            self.last_entry_at = None
        else:
            total_h = sum(e.hours for e in entries)
            latest_entry = entries.last()
            
            self.total_hours = total_h
            self.current_progress = latest_entry.progress_percent
            self.last_entry_at = latest_entry.created_at
            
            if self.current_progress >= 100:
                self.is_locked = True
            else:
                self.is_locked = False

        self.save()
        
        if trigger_propagation:
            # Always propagate to ensure siblings/parents/children sync
            self.propagate_down()
            self.propagate_up()

    def propagate_down(self):
        """
        Reactive down-propagation. 
        Children are locked if parent is locked OR if they are 100% themselves.
        """
        children = Topic.objects.filter(parent=self.topic, is_active=True)
        for child in children:
            child_mastery, _ = LearnerTopicMastery.objects.get_or_create(
                user=self.user,
                topic=child
            )
            
            was_locked = child_mastery.is_locked
            
            # If parent is locked, child MUST be locked/100%
            if self.is_locked:
                child_mastery.is_locked = True
                child_mastery.current_progress = 100
                child_mastery.save()
            else:
                # Parent is NOT locking this child.
                # Revert child to its actual progress from entries
                child_mastery.recalculate_mastery(trigger_propagation=False)
            
            # Continue propagation if child state actually changed
            if child_mastery.is_locked != was_locked:
                child_mastery.propagate_down()

    def propagate_up(self):
        """
        Reactive up-propagation.
        Parent is 100% only if ALL direct children are 100%.
        """
        if not self.topic.parent:
            return

        parent = self.topic.parent
        siblings = Topic.objects.filter(parent=parent, is_active=True)
        
        all_mastered = True
        for sibling in siblings:
            sibling_mastery, _ = LearnerTopicMastery.objects.get_or_create(
                user=self.user,
                topic=sibling
            )
            if not sibling_mastery.is_locked or sibling_mastery.current_progress < 100:
                all_mastered = False
                break
        
        parent_mastery, _ = LearnerTopicMastery.objects.get_or_create(
            user=self.user,
            topic=parent
        )
        
        was_locked = parent_mastery.is_locked
        if all_mastered:
            parent_mastery.is_locked = True
            parent_mastery.current_progress = 100
        else:
            # If not all children mastered, parent is unlocked 
            # (unless fixed manually, but we follow auto-propagation)
            parent_mastery.is_locked = False
            # Recalculate parent progress from its own entries if any
            parent_mastery.recalculate_mastery(trigger_propagation=False)

        if parent_mastery.is_locked != was_locked:
            parent_mastery.save()
            parent_mastery.propagate_up()
            # If parent unlocked, we MUST tell other children/siblings to check themselves
            if not parent_mastery.is_locked:
                parent_mastery.propagate_down()
