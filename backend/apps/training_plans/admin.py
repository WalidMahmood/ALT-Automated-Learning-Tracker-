from django.contrib import admin
from .models import TrainingPlan, PlanTopic, PlanAssignment


class PlanTopicInline(admin.TabularInline):
    model = PlanTopic
    extra = 1


class PlanAssignmentInline(admin.TabularInline):
    model = PlanAssignment
    extra = 1
    readonly_fields = ['assigned_at']


@admin.register(TrainingPlan)
class TrainingPlanAdmin(admin.ModelAdmin):
    list_display = ['plan_name', 'is_active', 'is_archived', 'created_at']
    list_filter = ['is_active', 'is_archived']
    search_fields = ['plan_name', 'description']
    inlines = [PlanTopicInline, PlanAssignmentInline]


@admin.register(PlanTopic)
class PlanTopicAdmin(admin.ModelAdmin):
    list_display = ['plan', 'topic', 'sequence_order', 'expected_hours']
    list_filter = ['plan']


@admin.register(PlanAssignment)
class PlanAssignmentAdmin(admin.ModelAdmin):
    list_display = ['plan', 'user', 'assigned_by_admin', 'assigned_at']
    list_filter = ['plan', 'assigned_at']
