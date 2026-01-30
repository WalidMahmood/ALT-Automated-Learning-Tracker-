from rest_framework import serializers
from .models import Entry
from apps.topics.serializers import TopicSerializer
from apps.topics.models import Topic, LearnerTopicMastery

class EntrySerializer(serializers.ModelSerializer):
    topic_details = TopicSerializer(source='topic', read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = Entry
        fields = [
            'id', 'user', 'user_email', 'topic', 'topic_details', 'admin',
            'date', 'hours', 'learned_text', 'progress_percent', 'blockers_text',
            'is_completed', 'status', 'ai_status', 'ai_decision', 'ai_confidence',
            'ai_reasoning', 'ai_analyzed_at', 'admin_override',
            'override_reason', 'override_comment', 'override_at',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'user', 'status', 'ai_status', 'ai_decision', 'ai_confidence',
            'ai_reasoning', 'ai_analyzed_at', 'admin_override',
            'override_at', 'created_at', 'updated_at'
        ]

    def validate_hours(self, value):
        if value < 0.1 or value > 12.0:
            raise serializers.ValidationError("Hours must be between 0.1 and 12.0")
        return value

    def validate_learned_text(self, value):
        if len(value) < 50:
            raise serializers.ValidationError("Description must be at least 50 characters")
        if len(value) > 500:
            raise serializers.ValidationError("Description cannot exceed 500 characters")
        return value

    def validate(self, data):
        """
        Comprehensive mastery and hierarchy validation.
        """
        user = self.context['request'].user
        date = data.get('date')
        topic = data.get('topic')
        new_progress = data.get('progress_percent', 0)
        
        # 1. Check if the topic itself or any ancestor is already mastered (Top-Down Lock)
        # BUG FIX: Skip this check if we are updating an EXISTING entry. 
        # This allows users to unmark 'is_completed' for the entry that triggered the lock.
        if not self.instance:
            ancestors = []
            curr = topic
            while curr:
                ancestors.append(curr)
                curr = curr.parent

            mastered_ancestor = LearnerTopicMastery.objects.filter(
                user=user, 
                topic__in=ancestors,
                is_locked=True
            ).first()

            if mastered_ancestor:
                source = "this topic" if mastered_ancestor.topic == topic else f"ancestor '{mastered_ancestor.topic.name}'"
                raise serializers.ValidationError({
                    "topic": f"This area is mastered. Locked by {source}."
                })
            
        # 2. Duplicate Check (Uniqueness)
        queryset = Entry.objects.filter(
            user=user, 
            date=date, 
            topic=topic, 
            is_active=True
        )
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
            
        if queryset.exists():
            raise serializers.ValidationError({
                "topic": "Topic already entered for this date. Your performance won't be increased by inputting the same topic twice on one day."
            })

        # 3. Progress Continuity Check
        # (Ensure they don't decrease progress)
        current_mastery = LearnerTopicMastery.objects.filter(user=user, topic=topic).first()
        if current_mastery and new_progress < current_mastery.current_progress and not self.instance:
             raise serializers.ValidationError({
                "progress_percent": f"Progress cannot decrease. Your current mastery is {current_mastery.current_progress}%."
            })
            
        return data
