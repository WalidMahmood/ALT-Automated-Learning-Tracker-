"""
Models for LND Bridge — Training Plan Approval Workflow.

These models live in the ALTS database (alt_system), NOT in the LND database.
"""
from django.db import models
from apps.users.models import User
from apps.training_plans.models import TrainingPlan


class TrainingPlanRequest(models.Model):
    """
    Multi-step approval workflow for training plan assignments.

    Flow: User requests (or admin initiates)
      → Project Manager reviews (approve/reject)
      → L&D Admin reviews (approve/reject)
      → Plan activated for the user

    PM role is determined by the user's erp_role field (fetched from ERP).
    """

    STATUS_CHOICES = [
        ('requested', 'Requested'),
        ('pm_approved', 'PM Approved'),
        ('pm_rejected', 'PM Rejected'),
        ('lnd_approved', 'LND Approved'),
        ('lnd_rejected', 'LND Rejected'),
        ('active', 'Active'),
        ('cancelled', 'Cancelled'),
    ]

    INITIATED_BY_CHOICES = [
        ('user', 'User Request'),
        ('admin', 'Admin Assignment'),
    ]

    # Who and what
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='plan_requests',
        help_text="Learner requesting or being assigned the plan"
    )
    plan = models.ForeignKey(
        TrainingPlan,
        on_delete=models.CASCADE,
        related_name='requests',
        help_text="Training plan being requested"
    )

    # Workflow state
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='requested'
    )
    initiated_by = models.CharField(
        max_length=10,
        choices=INITIATED_BY_CHOICES,
        default='user'
    )

    # Request details
    request_reason = models.TextField(
        max_length=500,
        blank=True,
        default='',
        help_text="Why the user wants this plan (user-initiated requests)"
    )

    # PM review
    pm_reviewer = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pm_reviewed_requests',
        help_text="Project Manager who reviewed this request"
    )
    pm_reviewed_at = models.DateTimeField(null=True, blank=True)
    pm_notes = models.TextField(max_length=500, blank=True, default='')

    # LND Admin review
    lnd_reviewer = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='lnd_reviewed_requests',
        help_text="L&D Admin who gave final approval"
    )
    lnd_reviewed_at = models.DateTimeField(null=True, blank=True)
    lnd_notes = models.TextField(max_length=500, blank=True, default='')

    # Activation
    activated_at = models.DateTimeField(null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'training_plan_requests'
        ordering = ['-created_at']
        verbose_name = 'Training Plan Request'
        verbose_name_plural = 'Training Plan Requests'
        # Prevent duplicate active requests for same user+plan
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'plan'],
                condition=models.Q(status__in=['requested', 'pm_approved', 'active']),
                name='unique_active_plan_request'
            )
        ]

    def __str__(self):
        return f"{self.user.email} → {self.plan.plan_name} ({self.get_status_display()})"
