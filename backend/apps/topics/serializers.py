"""
Serializers for Topic model
"""
from rest_framework import serializers
from .models import Topic, LearnerTopicMastery


class TopicSerializer(serializers.ModelSerializer):
    """Full topic serializer with computed depth"""
    depth = serializers.ReadOnlyField()
    parent_id = serializers.PrimaryKeyRelatedField(
        queryset=Topic.objects.filter(is_active=True),
        source='parent',
        allow_null=True,
        required=False
    )
    mastery = serializers.SerializerMethodField()
    
    class Meta:
        model = Topic
        fields = [
            'id',
            'name',
            'parent_id',
            'depth',
            'benchmark_hours',
            'difficulty',
            'mastery',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'depth', 'mastery', 'created_at', 'updated_at']

    def get_mastery(self, obj):
        request = self.context.get('request')
        if not request:
            return {'progress': 0, 'is_locked': False, 'total_hours': 0, 'lock_reason': None}
            
        user = request.user
        if not user or user.is_anonymous:
            return None
        
        mastery = LearnerTopicMastery.objects.filter(user=user, topic=obj).first()
        
        # Calculate lock reason if locked
        lock_reason = None
        if mastery and mastery.is_locked:
            # 1. Check if the topic itself has 100% progress
            if mastery.current_progress >= 100:
                lock_reason = "this topic"
            else:
                # 2. Check if locked by an ancestor
                curr = obj.parent
                while curr:
                    anc_mastery = LearnerTopicMastery.objects.filter(user=user, topic=curr).first()
                    if anc_mastery and anc_mastery.is_locked:
                        lock_reason = f"ancestor '{curr.name}'"
                        break
                    curr = curr.parent
        
        if mastery:
            return {
                'progress': mastery.current_progress,
                'is_locked': mastery.is_locked,
                'total_hours': mastery.total_hours,
                'lock_reason': lock_reason
            }
        return {'progress': 0, 'is_locked': False, 'total_hours': 0, 'lock_reason': None}


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
