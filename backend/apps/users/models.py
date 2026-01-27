"""
Custom User Model for ALT System
"""
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator
from django.core.exceptions import ValidationError
import re


class UserManager(BaseUserManager):
    """Custom user manager for email-based authentication"""
    
    def create_user(self, email, password=None, **extra_fields):
        """Create and save a regular user"""
        if not email:
            raise ValueError('Email is required')
        if not email.endswith('@brainstation-23.com'):
            raise ValueError('Email must be @brainstation-23.com domain')
        
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user
    
    def create_superuser(self, email, password=None, **extra_fields):
        """Create and save a superuser"""
        extra_fields.setdefault('role', 'admin')
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom User model extending Django's AbstractBaseUser"""
    
    ROLE_CHOICES = [
        ('learner', 'Learner'),
        ('admin', 'Admin'),
    ]
    
    # Basic fields
    email = models.EmailField(
        unique=True,
        max_length=255,
        help_text='Must be @brainstation-23.com domain'
    )
    
    # Profile fields
    github_url = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        validators=[
            RegexValidator(
                regex=r'^https://github\.com/[a-zA-Z0-9_-]+/?$',
                message='GitHub URL must be in format: https://github.com/username'
            )
        ],
        help_text='GitHub profile URL'
    )
    
    expertise_level = models.IntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        blank=True,
        null=True,
        help_text='Self-assessed skill level 1-10'
    )
    
    experience_years = models.DecimalField(
        max_digits=3,
        decimal_places=1,
        validators=[MinValueValidator(0)],
        blank=True,
        null=True,
        help_text='Years of professional experience'
    )
    
    tech_stack = models.JSONField(
        default=list,
        blank=True,
        help_text='Array of technologies/skills'
    )
    
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='learner',
        help_text='User role: learner or admin'
    )
    
    # Soft delete fields
    is_active = models.BooleanField(
        default=True,
        help_text='Designates whether this user should be treated as active'
    )
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Timestamp when user was soft deleted'
    )
    
    # Django admin fields
    is_staff = models.BooleanField(
        default=False,
        help_text='Designates whether the user can log into the admin site'
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    objects = UserManager()
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []
    
    class Meta:
        db_table = 'users'
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['role'], condition=models.Q(is_active=True), name='idx_users_role'),
            models.Index(fields=['is_active']),
        ]
        verbose_name = 'User'
        verbose_name_plural = 'Users'
    
    def clean(self):
        """Validate user data"""
        super().clean()
        
        # Validate email domain
        if self.email and not self.email.endswith('@brainstation-23.com'):
            raise ValidationError({
                'email': 'Email must be @brainstation-23.com domain'
            })
        
        # Validate GitHub URL format
        if self.github_url:
            pattern = r'^https://github\.com/[a-zA-Z0-9_-]+/?$'
            if not re.match(pattern, self.github_url):
                raise ValidationError({
                    'github_url': 'Invalid GitHub URL format. Must be: https://github.com/username'
                })
    
    def soft_delete(self):
        """Soft delete user instead of hard delete"""
        from django.utils import timezone
        self.is_active = False
        self.deleted_at = timezone.now()
        self.save()
    
    def restore(self):
        """Restore soft-deleted user"""
        self.is_active = True
        self.deleted_at = None
        self.save()
    
    def __str__(self):
        return f"{self.email} ({self.get_role_display()})"
