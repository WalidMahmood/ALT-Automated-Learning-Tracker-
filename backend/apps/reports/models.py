"""
Report Model — Stores generated progress reports.

Each report is a snapshot: AI-generated markdown + structured chart data.
Reports are generated on-demand (user clicks Generate) or scheduled (Celery Beat).
"""
from django.db import models
from apps.users.models import User


class Report(models.Model):
    """
    Cached progress report for a user over a specific period.
    Contains AI-generated markdown insights and structured chart data.
    """
    PERIOD_CHOICES = [
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('all_time', 'All Time'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='reports',
        help_text="User this report is generated for"
    )
    period = models.CharField(
        max_length=20,
        choices=PERIOD_CHOICES,
        help_text="Report period type"
    )
    period_start = models.DateField(
        help_text="Start date of the report period"
    )
    period_end = models.DateField(
        help_text="End date of the report period"
    )

    # Report content
    markdown_content = models.TextField(
        default='',
        help_text="AI-generated markdown report with insights and recommendations"
    )
    charts_data = models.JSONField(
        default=dict,
        help_text="Structured data for frontend Recharts components"
    )
    raw_stats = models.JSONField(
        default=dict,
        help_text="Raw aggregated stats used to generate the report"
    )

    # Metadata
    generated_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When this report was generated"
    )
    generation_time_seconds = models.FloatField(
        default=0,
        help_text="How long the generation took (including AI call)"
    )
    ai_model = models.CharField(
        max_length=50,
        default='qwen2.5:7b',
        help_text="Which LLM generated the insights"
    )

    class Meta:
        db_table = 'reports'
        ordering = ['-generated_at']
        indexes = [
            models.Index(
                fields=['user', 'period', '-generated_at'],
                name='idx_report_user_period'
            ),
        ]
        verbose_name = 'Report'
        verbose_name_plural = 'Reports'

    def __str__(self):
        return f"{self.user.email} — {self.period} ({self.period_start} to {self.period_end})"
