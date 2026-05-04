from django.contrib import admin
from .models import TrainingPlanRequest


@admin.register(TrainingPlanRequest)
class TrainingPlanRequestAdmin(admin.ModelAdmin):
    list_display = ['user', 'plan', 'status', 'initiated_by', 'created_at']
    list_filter = ['status', 'initiated_by']
    search_fields = ['user__email', 'plan__plan_name']
    readonly_fields = ['created_at', 'updated_at']
