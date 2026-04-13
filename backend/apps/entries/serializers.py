from rest_framework import serializers
from .models import Entry, Project, ProjectAssignment, ProjectFeature
from apps.topics.serializers import TopicSerializer
from apps.topics.models import Topic, LearnerTopicMastery


class ProjectAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for assignment info displayed on projects."""
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_full_name = serializers.CharField(source='user.full_name', read_only=True)

    class Meta:
        model = ProjectAssignment
        fields = ['id', 'user', 'user_email', 'user_full_name', 'role', 'assigned_by', 'assigned_at']
        read_only_fields = ['assigned_by', 'assigned_at']


class ProjectFeatureSerializer(serializers.ModelSerializer):
    """Serializer for per-feature tracking."""
    completed_by_email = serializers.CharField(
        source='completed_by.email', read_only=True, default=None
    )
    started_by_email = serializers.CharField(
        source='started_by.email', read_only=True, default=None
    )

    class Meta:
        model = ProjectFeature
        fields = [
            'id', 'project', 'name', 'description', 'success_criteria',
            'out_of_scope', 'status',
            'completed_at', 'completed_by', 'completed_by_email',
            'started_at', 'started_by', 'started_by_email',
            'reopened_at', 'reopened_by',
            'created_at',
        ]
        read_only_fields = [
            'project', 'completed_at', 'completed_by',
            'started_at', 'started_by',
            'reopened_at', 'reopened_by', 'created_at',
        ]


class ProjectSerializer(serializers.ModelSerializer):
    """Full CRUD serializer for Project model."""
    created_by_email = serializers.EmailField(source='created_by.email', read_only=True, default=None)
    assigned_users = serializers.SerializerMethodField()
    module_status = serializers.SerializerMethodField()
    entry_count = serializers.SerializerMethodField()
    latest_date = serializers.SerializerMethodField()
    features = ProjectFeatureSerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = [
            'id', 'created_by', 'created_by_email', 'name', 'description',
            'key_modules', 'out_of_scope', 'tech_stack',
            'tech_frontend', 'tech_backend', 'tech_database', 'tech_cloud',
            'success_criteria', 'repo_url',
            'start_date', 'end_date',
            'is_completed', 'is_active', 'assigned_users', 'module_status',
            'features',
            'entry_count', 'latest_date',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def get_assigned_users(self, obj):
        assignments = obj.assignments.select_related('user').all()
        return [
            {
                'id': a.user.id,
                'email': a.user.email,
                'full_name': a.user.full_name,
                'role': a.role,
            }
            for a in assignments
        ]

    def get_module_status(self, obj):
        """Return per-module completion status based on active entries."""
        key_modules = obj.key_modules or []
        if not key_modules:
            return []

        # Use prefetched entries cache if available (filter in Python),
        # otherwise fall back to DB query
        if hasattr(obj, '_prefetched_objects_cache') and 'entries' in obj._prefetched_objects_cache:
            entries = [e for e in obj.entries.all() if e.is_active and e.target_module]
        else:
            entries = obj.entries.filter(is_active=True, target_module__isnull=False)

        module_data = {}
        for entry in entries:
            mod = entry.target_module
            if mod not in module_data:
                module_data[mod] = {'entries': 0, 'hours': 0, 'status': 'in_progress', 'users': set()}
            module_data[mod]['entries'] += 1
            module_data[mod]['hours'] += float(entry.hours or 0)
            if entry.user:
                module_data[mod]['users'].add(entry.user.full_name or entry.user.email)
            if entry.feature_status == 'completed':
                module_data[mod]['status'] = 'completed'

        result = []
        for mod in key_modules:
            data = module_data.get(mod)
            if data:
                result.append({
                    'module': mod,
                    'status': data['status'],
                    'entry_count': data['entries'],
                    'total_hours': round(data['hours'], 1),
                    'users': list(data['users']),
                })
            else:
                result.append({
                    'module': mod,
                    'status': 'untouched',
                    'entry_count': 0,
                    'total_hours': 0,
                    'users': [],
                })
        return result

    def get_entry_count(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'entries' in obj._prefetched_objects_cache:
            return sum(1 for e in obj.entries.all() if e.is_active)
        return obj.entries.filter(is_active=True).count()

    def get_latest_date(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'entries' in obj._prefetched_objects_cache:
            active = [e for e in obj.entries.all() if e.is_active]
            if not active:
                return None
            latest = max(active, key=lambda e: e.date)
            return str(latest.date)
        latest = obj.entries.filter(is_active=True).order_by('-date').first()
        return str(latest.date) if latest else None


class ProjectDetailSerializer(ProjectSerializer):
    """Project with stacked entries for detail view."""
    entries = serializers.SerializerMethodField()

    class Meta(ProjectSerializer.Meta):
        fields = ProjectSerializer.Meta.fields + ['entries']

    def get_entries(self, obj):
        # Show entries from ALL assigned users for this project
        entries = obj.entries.filter(is_active=True).order_by('-date')
        return ProjectEntrySerializer(entries, many=True).data


class ProjectEntrySerializer(serializers.ModelSerializer):
    """Lightweight entry serializer for project detail stacking."""
    user_email = serializers.EmailField(source='user.email', read_only=True)
    learning_status = serializers.CharField(read_only=True)

    class Meta:
        model = Entry
        fields = [
            'id', 'user', 'user_email', 'date', 'hours', 'learned_text', 'blockers_text',
            'progress_percent', 'is_completed', 'learning_status', 'intent',
            'target_module', 'feature_status',
            'status', 'ai_status', 'ai_decision', 'ai_confidence',
            'created_at',
        ]

class EntrySerializer(serializers.ModelSerializer):
    topic_details = TopicSerializer(source='topic', read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    project_details = ProjectSerializer(source='project', read_only=True)
    learning_status = serializers.CharField(read_only=True)

    class Meta:
        model = Entry
        fields = [
            'id', 'user', 'user_email', 'topic', 'topic_details', 'admin',
            'project', 'project_details',
            'date', 'hours', 'learned_text', 'progress_percent', 'blockers_text',
            'is_completed', 'learning_status', 'intent', 'project_name', 'project_description',
            'target_module', 'feature_status',
            'is_non_coding', 'git_validation_result', 'git_score_adjustment', 'git_evidence',
            'status', 'ai_status', 'ai_decision', 'ai_confidence',
            'ai_chain_of_thought', 'ai_analyzed_at', 'admin_override',
            'override_reason', 'override_comment', 'override_at',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'user', 'status', 'ai_status', 'ai_decision', 'ai_confidence',
            'ai_chain_of_thought', 'ai_analyzed_at', 'admin_override',
            'override_at', 'created_at', 'updated_at',
            'git_validation_result', 'git_score_adjustment', 'git_evidence',
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
        project = data.get('project')
        project_name = data.get('project_name')
        # v8.0: progress_percent deprecated, is_completed is the only progress control

        # Intent-based validation
        if intent == 'lnd_tasks':
            if not topic:
                raise serializers.ValidationError({
                    "topic": "Topic is required for L&D Tasks entries."
                })
        elif intent == 'sbu_tasks':
            if not project:
                raise serializers.ValidationError({
                    "project": "Please select an assigned project for SBU Tasks entries."
                })
            # Verify user is assigned to this project
            project_obj = Project.objects.filter(id=project.id if hasattr(project, 'id') else project, is_active=True).first()
            if not project_obj:
                raise serializers.ValidationError({
                    "project": "Project not found."
                })
            is_assigned = ProjectAssignment.objects.filter(
                project=project_obj,
                user=user,
            ).exists()
            if not is_assigned and user.role != 'admin':
                raise serializers.ValidationError({
                    "project": "You are not assigned to this project."
                })
            # Auto-populate project_name from project
            data['project_name'] = project_obj.name
            data['project_description'] = project_obj.description

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
        # v8.0: Binary progress — is_completed is the only control.
        # No need to check progress_percent continuity.
            
        return data

    def create(self, validated_data):
        """Link the Project FK before saving."""
        # Remove internal helper fields
        validated_data.pop('_project', None)
        return super().create(validated_data)
