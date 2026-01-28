from django.contrib import admin
from .models import Topic


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ['name', 'parent', 'benchmark_hours', 'difficulty', 'is_active', 'created_at']
    list_filter = ['is_active', 'difficulty', 'parent']
    search_fields = ['name']
    ordering = ['name']
