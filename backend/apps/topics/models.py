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
        on_delete=models.SET_NULL,
        related_name='children'
    )
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

    @property
    def depth(self) -> int:
        """Calculate depth in hierarchy (0 = root)"""
        depth = 0
        current = self.parent
        while current:
            depth += 1
            current = current.parent
        return depth

    def soft_delete(self):
        """Soft delete this topic"""
        self.is_active = False
        self.save()
