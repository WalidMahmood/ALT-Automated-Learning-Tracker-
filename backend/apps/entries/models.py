from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator, MinLengthValidator, MaxLengthValidator
from apps.users.models import User
from apps.topics.models import Topic

class Entry(models.Model):
    """
    Daily learning activity records.
    Strictly follows EER Schema v2.1 validation rules.
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
        related_name='entries'
    )
    admin = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_entries'
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
    ai_reasoning = models.TextField(null=True, blank=True)
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
                condition=models.Q(is_active=True)
            )
        ]
        verbose_name = 'Entry'
        verbose_name_plural = 'Entries'

    def __str__(self):
        return f"{self.user.email} - {self.topic.name} ({self.date})"

    def soft_delete(self):
        """Soft delete entry"""
        self.is_active = False
        self.save()
