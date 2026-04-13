from rest_framework import serializers
from .models import Report


class ReportSerializer(serializers.ModelSerializer):
    """Full report serializer with all content."""
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_name = serializers.CharField(source='user.full_name', read_only=True)

    class Meta:
        model = Report
        fields = [
            'id', 'user', 'user_email', 'user_name',
            'period', 'period_start', 'period_end',
            'markdown_content', 'charts_data', 'raw_stats',
            'generated_at', 'generation_time_seconds', 'ai_model',
        ]
        read_only_fields = fields


class ReportListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for report list (no heavy content)."""
    user_email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = Report
        fields = [
            'id', 'user', 'user_email',
            'period', 'period_start', 'period_end',
            'generated_at', 'generation_time_seconds',
        ]
        read_only_fields = fields
