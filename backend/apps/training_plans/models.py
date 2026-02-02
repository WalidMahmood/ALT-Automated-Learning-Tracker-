from django.db import models
from apps.users.models import User
from apps.topics.models import Topic


class TrainingPlan(models.Model):
    """
    Training plan model with archive support.
    """
    plan_name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(
        default=True,
        help_text="True = Active (available for assignment), False = Draft"
    )
    is_archived = models.BooleanField(
        default=False,
        help_text="Soft delete flag - True means archived"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Training Plan'
        verbose_name_plural = 'Training Plans'

    def __str__(self):
        return self.plan_name

    def archive(self):
        """Archive this plan (soft delete) and deactivate assignments"""
        self.is_archived = True
        
        # Optional: Decide if we want to DELETE assignments or just hide them.
        # User requested: "what happens? ... think of these scenarios"
        # Safest bet: Keep the assignment record but the frontend filters by plan.is_archived.
        # However, to be cleaner, let's mark the plan as archived and rely on the frontend 
        # filtering or backend querysets to exclude archived plans from "Active Assignments".
        
        self.save()

    def restore(self):
        """Restore from archive"""
        self.is_archived = False
        self.save()


class PlanTopic(models.Model):
    """
    Many-to-many relationship between plans and topics with ordering.
    """
    plan = models.ForeignKey(
        TrainingPlan,
        on_delete=models.CASCADE,
        related_name='plan_topics'
    )
    topic = models.ForeignKey(
        Topic,
        on_delete=models.RESTRICT,
        related_name='plan_topics'
    )
    sequence_order = models.IntegerField(default=1)
    expected_hours = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        help_text="Custom hours for this topic in this plan"
    )

    class Meta:
        ordering = ['sequence_order']
        unique_together = ['plan', 'topic']
        verbose_name = 'Plan Topic'
        verbose_name_plural = 'Plan Topics'

    def __str__(self):
        return f"{self.plan.plan_name} - {self.topic.name}"


class PlanAssignment(models.Model):
    """
    Assignment of users to training plans.
    """
    plan = models.ForeignKey(
        TrainingPlan,
        on_delete=models.CASCADE,
        related_name='assignments'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.RESTRICT,
        related_name='plan_assignments'
    )
    assigned_by_admin = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='assignments_made'
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-assigned_at']
        unique_together = ['plan', 'user']
        verbose_name = 'Plan Assignment'
        verbose_name_plural = 'Plan Assignments'

    def __str__(self):
        return f"{self.user.email} - {self.plan.plan_name}"
