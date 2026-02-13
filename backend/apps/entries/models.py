from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator, MinLengthValidator, MaxLengthValidator
from apps.users.models import User
from apps.topics.models import Topic


class Project(models.Model):
    """
    Dedicated project model for project_work / debugging entries.
    Supports full CRUD, soft-delete, and stacked entry history.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.RESTRICT,
        related_name='projects'
    )
    name = models.CharField(max_length=200)
    description = models.TextField(max_length=500, blank=True, default='')
    is_completed = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'projects'
        ordering = ['-updated_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'name'],
                name='unique_user_project_name',
                condition=models.Q(is_active=True)
            ),
        ]
        verbose_name = 'Project'
        verbose_name_plural = 'Projects'

    def __str__(self):
        return f"{self.user.email} - {self.name}"

    def soft_delete(self):
        self.is_active = False
        self.save()


class Entry(models.Model):
    """
    Daily learning activity records.
    Strictly follows EER Schema v2.1 validation rules.
    (Reload Triggered)
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('flagged', 'Flagged'),
        ('rejected', 'Rejected'),
    ]

    AI_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('analyzed', 'Analyzed'),
        ('error', 'Error'),
    ]

    AI_DECISION_CHOICES = [
        ('approve', 'Approve'),
        ('flag', 'Flag'),
        ('reject', 'Reject'),
    ]

    INTENT_CHOICES = [
        ('lnd_tasks', 'L&D Tasks'),
        ('sbu_tasks', 'SBU Tasks'),
    ]

    # PK: id is auto-generated SERIAL

    # Relationships
    user = models.ForeignKey(
        User,
        on_delete=models.RESTRICT,
        related_name='entries'
    )
    topic = models.ForeignKey(
        Topic,
        on_delete=models.RESTRICT,
        related_name='entries',
        null=True,
        blank=True,
        help_text="Required for lnd_tasks. Optional for sbu_tasks."
    )
    admin = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_entries'
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='entries',
        help_text="FK to Project for sbu_tasks entries"
    )

    # Intent & Project tracking
    intent = models.CharField(
        max_length=20,
        choices=INTENT_CHOICES,
        default='lnd_tasks',
        help_text="Activity type: lnd_tasks, sbu_tasks"
    )
    project_name = models.CharField(
        max_length=200,
        null=True,
        blank=True,
        help_text="Project name for sbu_tasks entries"
    )
    project_description = models.TextField(
        null=True,
        blank=True,
        max_length=500,
        help_text="One-time project description for context"
    )

    # Core data
    date = models.DateField()
    hours = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        validators=[MinValueValidator(0.1), MaxValueValidator(12.0)],
        help_text="Time spent: 0.1 to 12.0 hours"
    )
    learned_text = models.TextField(
        validators=[MinLengthValidator(50), MaxLengthValidator(500)],
        help_text="What was learned (50-500 characters)"
    )
    progress_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Conceptual progress percentage (0-100)"
    )
    blockers_text = models.TextField(
        null=True,
        blank=True,
        help_text="Blocker details if any"
    )
    is_completed = models.BooleanField(
        default=False,
        help_text="True if the learner has finished this topic"
    )

    # AI Analysis Fields
    ai_status = models.CharField(
        max_length=20,
        choices=AI_STATUS_CHOICES,
        default='pending'
    )
    ai_decision = models.CharField(
        max_length=20,
        choices=AI_DECISION_CHOICES,
        null=True,
        blank=True
    )
    ai_confidence = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    ai_chain_of_thought = models.JSONField(default=dict, help_text="Multi-node AI reasoning logs")
    ai_analyzed_at = models.DateTimeField(null=True, blank=True)

    # Status & Override
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    admin_override = models.BooleanField(default=False)
    override_reason = models.CharField(max_length=255, null=True, blank=True)
    override_comment = models.TextField(null=True, blank=True)
    override_at = models.DateTimeField(null=True, blank=True)

    # Soft Delete & Timestamps
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'entries'
        ordering = ['-date', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'date', 'topic'],
                name='unique_user_date_topic_entry',
                condition=models.Q(is_active=True, topic__isnull=False)
            ),
            models.UniqueConstraint(
                fields=['user', 'date', 'project_name'],
                name='unique_user_date_project_entry',
                condition=models.Q(is_active=True, project_name__isnull=False)
            ),
        ]
        verbose_name = 'Entry'
        verbose_name_plural = 'Entries'

    def __str__(self):
        label = self.topic.name if self.topic else (self.project_name or 'Unknown')
        return f"{self.user.email} - {label} ({self.date})"

    def soft_delete(self):
        """Soft delete entry"""
        self.is_active = False
        self.save()


class GlobalWisdom(models.Model):
    """
    Stores Admin corrections to AI decisions.
    These corrections are injected into future AI prompts to prevent repeat mistakes.
    """
    CORRECTION_TYPES = [
        ('false_flag', 'AI flagged but should have approved'),
        ('false_approve', 'AI approved but should have flagged'),
        ('context_miss', 'AI missed important context'),
    ]

    # The entry that was corrected
    entry = models.ForeignKey(
        Entry,
        on_delete=models.CASCADE,
        related_name='wisdom_corrections'
    )
    admin = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='wisdom_corrections'
    )

    # What the AI did wrong
    correction_type = models.CharField(max_length=20, choices=CORRECTION_TYPES)
    ai_original_decision = models.CharField(max_length=20)
    admin_corrected_decision = models.CharField(max_length=20)

    # Context for future AI prompts
    topic_name = models.CharField(max_length=100)
    entry_hours = models.DecimalField(max_digits=4, decimal_places=2)
    entry_text_snippet = models.CharField(max_length=200)
    admin_correction_reason = models.TextField(max_length=500)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'global_wisdom'
        ordering = ['-created_at']
        verbose_name = 'Global Wisdom Entry'
        verbose_name_plural = 'Global Wisdom Pool'

    def __str__(self):
        return f"{self.correction_type}: {self.topic_name} ({self.created_at.date()})"
