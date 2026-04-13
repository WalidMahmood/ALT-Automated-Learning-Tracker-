from django.contrib import admin
from .models import Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ['user', 'period', 'period_start', 'period_end', 'generated_at', 'generation_time_seconds']
    list_filter = ['period', 'generated_at']
    search_fields = ['user__email', 'user__full_name']
    readonly_fields = ['generated_at']
