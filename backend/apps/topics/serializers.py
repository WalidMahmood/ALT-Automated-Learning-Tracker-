"""
Serializers for Topic model
"""
from rest_framework import serializers
from .models import Topic, LearnerTopicMastery, TopicKnowledge, TopicResource


class TopicLiteSerializer(serializers.ModelSerializer):
    """Lightweight serializer for admin — no mastery, minimal fields.
    Cuts payload from ~1.2MB to ~200KB for 4700+ topics."""
    parent_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Topic
        fields = ['id', 'name', 'parent_id', 'depth', 'benchmark_hours',
                  'difficulty', 'domain', 'language',
                  'is_active', 'created_at', 'updated_at']
        read_only_fields = fields


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
            'domain',
            'language',
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

        # Skip mastery computation for admins — they don't need it and it's expensive
        if user.role == 'admin':
            return None

        # Use prefetched mastery cache if available (from prefetch_related in view)
        if hasattr(obj, 'user_mastery_cache'):
            mastery = obj.user_mastery_cache[0] if obj.user_mastery_cache else None
        else:
            # Fallback to direct query if not prefetched (backward compatibility)
            mastery = LearnerTopicMastery.objects.filter(user=user, topic=obj).first()
        
        # Calculate lock reason if locked
        lock_reason = None
        if mastery and mastery.is_locked:
            # 1. Check if the topic itself has 100% progress
            if mastery.current_progress >= 100:
                lock_reason = "this topic"
            else:
                # 2. Check if locked by an ancestor
                # Create mastery lookup cache once per serialization to avoid repeated queries
                if not hasattr(self, '_mastery_cache'):
                    self._mastery_cache = {}
                
                curr = obj.parent
                while curr:
                    # Check cache first
                    if curr.id in self._mastery_cache:
                        anc_mastery = self._mastery_cache[curr.id]
                    elif hasattr(curr, 'user_mastery_cache'):
                        # Use prefetched data
                        anc_mastery = curr.user_mastery_cache[0] if curr.user_mastery_cache else None
                        self._mastery_cache[curr.id] = anc_mastery
                    else:
                        # Fallback to query
                        anc_mastery = LearnerTopicMastery.objects.filter(user=user, topic=curr).first()
                        self._mastery_cache[curr.id] = anc_mastery
                    
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
            'domain',
            'language',
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


class TopicResourceSerializer(serializers.ModelSerializer):
    """Serializer for YouTube video resources linked to topics."""

    class Meta:
        model = TopicResource
        fields = [
            'id', 'topic', 'title', 'url', 'youtube_video_id',
            'channel_name', 'duration_minutes', 'view_count', 'like_count',
            'thumbnail_url', 'description', 'generated_by',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_url(self, value):
        if value and 'youtube.com' not in value and 'youtu.be' not in value:
            raise serializers.ValidationError("URL must be a YouTube link")
        return value


class TopicResourceCreateSerializer(serializers.ModelSerializer):
    """Serializer for admin manually adding a resource."""

    class Meta:
        model = TopicResource
        fields = [
            'title', 'url', 'youtube_video_id', 'channel_name',
            'duration_minutes', 'view_count', 'like_count',
            'thumbnail_url', 'description',
        ]

    def validate_url(self, value):
        if value and 'youtube.com' not in value and 'youtu.be' not in value:
            raise serializers.ValidationError("URL must be a YouTube link")
        return value


class TopicKnowledgeSerializer(serializers.ModelSerializer):
    """Serializer for viewing/editing TopicKnowledge entries."""

    class Meta:
        model = TopicKnowledge
        fields = [
            'id', 'roadmap_id', 'section_id', 'section_name',
            'topic_name', 'topic', 'benchmark_hours', 'difficulty',
            'what_it_is', 'what_you_will_learn', 'subtopics',
            'validation_keywords', 'version_hash', 'version',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'roadmap_id', 'section_id', 'section_name',
            'topic_name', 'topic', 'version_hash', 'version',
            'created_at', 'updated_at',
        ]

