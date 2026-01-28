"""
Serializers for Topic model
"""
from rest_framework import serializers
from .models import Topic


class TopicSerializer(serializers.ModelSerializer):
    """Full topic serializer with computed depth"""
    depth = serializers.ReadOnlyField()
    parent_id = serializers.PrimaryKeyRelatedField(
        queryset=Topic.objects.filter(is_active=True),
        source='parent',
        allow_null=True,
        required=False
    )
    
    class Meta:
        model = Topic
        fields = [
            'id',
            'name',
            'parent_id',
            'depth',
            'benchmark_hours',
            'difficulty',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'depth', 'created_at', 'updated_at']


class TopicCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating topics"""
    parent_id = serializers.PrimaryKeyRelatedField(
        queryset=Topic.objects.filter(is_active=True),
        source='parent',
        allow_null=True,
        required=False
    )
    
    class Meta:
        model = Topic
        fields = [
            'name',
            'parent_id',
            'benchmark_hours',
            'difficulty',
        ]
    
    def validate_name(self, value):
        """Ensure topic name is not empty"""
        if not value or not value.strip():
            raise serializers.ValidationError("Topic name cannot be empty")
        return value.strip()
    
    def validate_benchmark_hours(self, value):
        """Ensure benchmark hours is non-negative"""
        if value < 0:
            raise serializers.ValidationError("Benchmark hours cannot be negative")
        return value
