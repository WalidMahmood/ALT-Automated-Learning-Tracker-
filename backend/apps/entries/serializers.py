from rest_framework import serializers
from .models import Entry, Project
from apps.topics.serializers import TopicSerializer
from apps.topics.models import Topic, LearnerTopicMastery


class ProjectSerializer(serializers.ModelSerializer):
    """Full CRUD serializer for Project model."""
    user_email = serializers.EmailField(source='user.email', read_only=True)
    entry_count = serializers.SerializerMethodField()
    latest_date = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            'id', 'user', 'user_email', 'name', 'description',
            'is_completed', 'is_active', 'entry_count', 'latest_date',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['user', 'created_at', 'updated_at']

    def get_entry_count(self, obj):
        return obj.entries.filter(is_active=True).count()

    def get_latest_date(self, obj):
        latest = obj.entries.filter(is_active=True).order_by('-date').first()
        return str(latest.date) if latest else None


class ProjectDetailSerializer(ProjectSerializer):
    """Project with stacked entries for detail view."""
    entries = serializers.SerializerMethodField()

    class Meta(ProjectSerializer.Meta):
        fields = ProjectSerializer.Meta.fields + ['entries']

    def get_entries(self, obj):
        entries = obj.entries.filter(is_active=True).order_by('-date')
        return ProjectEntrySerializer(entries, many=True).data


class ProjectEntrySerializer(serializers.ModelSerializer):
    """Lightweight entry serializer for project detail stacking."""
    class Meta:
        model = Entry
        fields = [
            'id', 'date', 'hours', 'learned_text', 'blockers_text',
            'progress_percent', 'is_completed', 'intent',
            'status', 'ai_status', 'ai_decision', 'ai_confidence',
            'created_at',
        ]

class EntrySerializer(serializers.ModelSerializer):
    topic_details = TopicSerializer(source='topic', read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    project_details = ProjectSerializer(source='project', read_only=True)

    class Meta:
        model = Entry
        fields = [
            'id', 'user', 'user_email', 'topic', 'topic_details', 'admin',
            'project', 'project_details',
            'date', 'hours', 'learned_text', 'progress_percent', 'blockers_text',
            'is_completed', 'intent', 'project_name', 'project_description',
            'status', 'ai_status', 'ai_decision', 'ai_confidence',
            'ai_chain_of_thought', 'ai_analyzed_at', 'admin_override',
            'override_reason', 'override_comment', 'override_at',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'user', 'project', 'status', 'ai_status', 'ai_decision', 'ai_confidence',
            'ai_chain_of_thought', 'ai_analyzed_at', 'admin_override',
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
        Supports both topic-based (lnd_tasks) and project-based (sbu_tasks) entries.
        """
        user = self.context['request'].user
        date = data.get('date')
        topic = data.get('topic')
        intent = data.get('intent', 'lnd_tasks')
        project_name = data.get('project_name')
        new_progress = data.get('progress_percent', 0)

        # Intent-based validation
        if intent == 'lnd_tasks':
            if not topic:
                raise serializers.ValidationError({
                    "topic": "Topic is required for L&D Tasks entries."
                })
        elif intent == 'sbu_tasks':
            if not project_name:
                raise serializers.ValidationError({
                    "project_name": "Project name is required for SBU Tasks entries."
                })
            # First entry on a new project requires a project description
            project_description = data.get('project_description')
            if not self.instance:  # only on create
                existing_project = Project.objects.filter(
                    user=user,
                    name=project_name,
                    is_active=True,
                ).first()
                if not existing_project and not project_description:
                    raise serializers.ValidationError({
                        "project_description": "Project description is required for the first entry on a new project."
                    })
                # Auto-create or link project
                if existing_project:
                    data['_project'] = existing_project
                else:
                    data['_project'] = Project.objects.create(
                        user=user,
                        name=project_name,
                        description=project_description or '',
                    )

        # 1. Check if the topic itself or any ancestor is already mastered (Top-Down Lock)
        if topic and not self.instance:
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
        if topic:
            queryset = Entry.objects.filter(
                user=user, date=date, topic=topic, is_active=True
            )
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)
            if queryset.exists():
                raise serializers.ValidationError({
                    "topic": "Topic already entered for this date."
                })
        elif project_name:
            queryset = Entry.objects.filter(
                user=user, date=date, project_name=project_name, is_active=True
            )
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)
            if queryset.exists():
                raise serializers.ValidationError({
                    "project_name": "Project already entered for this date."
                })

        # 3. Progress Continuity Check (topic-based only)
        if topic:
            current_mastery = LearnerTopicMastery.objects.filter(user=user, topic=topic).first()
            if current_mastery and new_progress > 0 and new_progress < current_mastery.current_progress and not self.instance:
                raise serializers.ValidationError({
                    "progress_percent": f"Progress cannot decrease. Your current mastery is {current_mastery.current_progress}%."
                })
            
        return data

    def create(self, validated_data):
        """Link the auto-created/found Project FK before saving."""
        project = validated_data.pop('_project', None)
        if project:
            validated_data['project'] = project
        return super().create(validated_data)
