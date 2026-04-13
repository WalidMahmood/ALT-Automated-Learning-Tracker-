from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator, MinLengthValidator, MaxLengthValidator
from apps.users.models import User
from apps.topics.models import Topic


class Project(models.Model):
    """
    Admin-owned project model for SBU Tasks.
    Projects are created by admins and assigned to users via ProjectAssignment.
    Supports full CRUD, soft-delete, timelines, and stacked entry history.
    """
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_projects',
        help_text="Admin who created the project"
    )
    name = models.CharField(max_length=200)
    description = models.TextField(max_length=1000, blank=True, default='')
    key_modules = models.JSONField(
        default=list, blank=True,
        help_text="List of key modules/features to build (e.g. ['Authentication', 'API', 'Dashboard'])"
    )
    out_of_scope = models.JSONField(
        default=list, blank=True,
        help_text="List of explicitly excluded features (e.g. ['Mobile app', 'ML features'])"
    )
    tech_stack = models.CharField(
        max_length=200, blank=True, default='',
        help_text="Tech stack summary (e.g. 'React + Django + PostgreSQL + Docker') — legacy, use structured fields"
    )
    # v9.0: Structured tech stack fields
    tech_frontend = models.CharField(
        max_length=200, blank=True, default='',
        help_text="Frontend tech (e.g. 'React, Next.js, TailwindCSS')"
    )
    tech_backend = models.CharField(
        max_length=200, blank=True, default='',
        help_text="Backend tech (e.g. 'Django, Celery, Redis')"
    )
    tech_database = models.CharField(
        max_length=200, blank=True, default='',
        help_text="Database tech (e.g. 'PostgreSQL, Redis')"
    )
    tech_cloud = models.CharField(
        max_length=200, blank=True, default='',
        help_text="Cloud/DevOps tech (e.g. 'AWS, Docker, GitHub Actions')"
    )
    success_criteria = models.CharField(
        max_length=300, blank=True, default='',
        help_text="Performance targets or completion criteria (e.g. '<200ms API, 99.9% uptime')"
    )
    start_date = models.DateField(null=True, blank=True, help_text="Project start date")
    end_date = models.DateField(null=True, blank=True, help_text="Project end/deadline date")
    is_completed = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    repo_url = models.URLField(
        max_length=500, blank=True, default='',
        help_text="GitHub repository URL (e.g. https://github.com/org/repo)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'projects'
        ordering = ['-updated_at']
        verbose_name = 'Project'
        verbose_name_plural = 'Projects'

    def __str__(self):
        return self.name

    def soft_delete(self):
        self.is_active = False
        self.save()


class ProjectFeature(models.Model):
    """
    Per-feature tracking for projects.
    Each feature has its own success criteria and out-of-scope items.
    Replaces the flat key_modules JSONField for structured tracking.
    """
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name='features'
    )
    name = models.CharField(max_length=200)
    description = models.TextField(max_length=500, blank=True, default='')
    success_criteria = models.TextField(
        max_length=500, blank=True, default='',
        help_text="Comma-separated criteria (e.g. 'Token expiry, refresh logic')"
    )
    out_of_scope = models.JSONField(
        default=list, blank=True,
        help_text="Items excluded from this feature"
    )
    FEATURE_STATUS_CHOICES = [
        ('not_started', 'Not Started'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    ]
    status = models.CharField(
        max_length=20, choices=FEATURE_STATUS_CHOICES, default='not_started'
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='completed_features',
        help_text="User whose approved entry marked this feature complete"
    )
    started_at = models.DateTimeField(null=True, blank=True)
    started_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='started_features',
        help_text="User who first worked on this feature (first approved entry)"
    )
    reopened_at = models.DateTimeField(null=True, blank=True)
    reopened_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reopened_features',
        help_text="User whose approved entry reopened this completed feature"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_features'
        ordering = ['project', 'name']
        unique_together = ['project', 'name']
        verbose_name = 'Project Feature'
        verbose_name_plural = 'Project Features'

    def __str__(self):
        return f"{self.project.name} — {self.name} ({self.status})"


class ProjectAssignment(models.Model):
    """
    M2M assignment linking projects to users.
    Allows admins to assign a project to one or multiple users.
    """
    PROJECT_ROLE_CHOICES = [
        ('frontend', 'Frontend'),
        ('backend', 'Backend'),
        ('fullstack', 'Full Stack'),
        ('devops', 'DevOps'),
        ('devsecops', 'DevSecOps'),
        ('mobile', 'Mobile'),
        ('android', 'Android'),
        ('ios', 'iOS'),
        ('game', 'Game Developer'),
        ('game_server', 'Server Side Game Developer'),
        ('qa', 'QA'),
        ('test_automation', 'Test Automation'),
        ('data', 'Data Analyst'),
        ('data_engineer', 'Data Engineer'),
        ('ai', 'AI Engineer'),
        ('ai_data_scientist', 'AI and Data Scientist'),
        ('ml', 'Machine Learning'),
        ('mlops', 'MLOps'),
        ('bi', 'BI Analyst'),
        ('blockchain', 'Blockchain'),
        ('cyber_security', 'Cyber Security'),
        ('architect', 'Software Architect'),
        ('db_admin', 'PostgreSQL / DBA'),
        ('product_manager', 'Product Manager'),
        ('engineering_manager', 'Engineering Manager'),
        ('design', 'UX Design'),
        ('technical_writer', 'Technical Writer'),
        ('devrel', 'Developer Relations'),
        ('fundamentals', 'Computer Science / Fundamentals'),
        ('soft_skills', 'Soft Skills'),
        ('lead', 'Lead'),
        ('general', 'General'),
    ]

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='assignments'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='project_assignments'
    )
    role = models.CharField(
        max_length=50,
        choices=PROJECT_ROLE_CHOICES,
        default='general',
        help_text="User's role on this project"
    )
    assigned_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_project_assignments',
        help_text="Admin who made this assignment"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_assignments'
        unique_together = ['project', 'user']
        ordering = ['-assigned_at']
        verbose_name = 'Project Assignment'
        verbose_name_plural = 'Project Assignments'

    def __str__(self):
        return f"{self.user.email} -> {self.project.name}"


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

    @property
    def learning_status(self):
        """v8.0: Binary status derived from is_completed. No migration needed."""
        return 'completed' if self.is_completed else 'in_progress'

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

    # Module-level tracking for SBU entries
    FEATURE_STATUS_CHOICES = [
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    ]
    target_module = models.CharField(
        max_length=200,
        null=True,
        blank=True,
        help_text='Key module/feature the user worked on (for SBU entries)'
    )
    feature_status = models.CharField(
        max_length=20,
        choices=FEATURE_STATUS_CHOICES,
        default='in_progress',
        help_text='Status of the target module: in_progress or completed'
    )

    # Git Commit Validation (Phase 2 — advisory signal only)
    GIT_RESULT_CHOICES = [
        ('pending', 'Pending'),
        ('match', 'Match'),
        ('partial', 'Partial Match'),
        ('no_match', 'No Match'),
        ('skipped', 'Skipped'),
    ]
    is_non_coding = models.BooleanField(
        default=False,
        help_text='User self-reports this as non-coding work (design, meetings, docs)'
    )
    git_validation_result = models.CharField(
        max_length=20,
        choices=GIT_RESULT_CHOICES,
        default='pending',
        help_text='Git commit validation result (advisory only)'
    )
    git_score_adjustment = models.DecimalField(
        max_digits=4, decimal_places=2,
        default=0,
        help_text='Confidence adjustment from git analysis (-10 to +10)'
    )
    git_evidence = models.JSONField(
        default=dict, blank=True,
        help_text='Git commit evidence: {commits_found, files_changed, lines_added, reasoning}'
    )

    # Soft Delete & Timestamps
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'entries'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['is_active', 'status'], name='idx_entry_active_status'),
            models.Index(fields=['is_active', 'ai_status'], name='idx_entry_active_ai_status'),
            models.Index(fields=['is_active', 'date'], name='idx_entry_active_date'),
            models.Index(fields=['is_active', 'topic_id'], name='idx_entry_active_topic'),
        ]
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
