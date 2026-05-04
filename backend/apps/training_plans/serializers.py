"""
Serializers for Training Plan models
"""
from rest_framework import serializers
from .models import TrainingPlan, PlanTopic, PlanAssignment, PlanTopicEdge
from apps.topics.serializers import TopicSerializer
from apps.users.serializers import UserSerializer


class PlanTopicEdgeSerializer(serializers.ModelSerializer):
    """Serializer for plan topic edges (graph connections)"""
    class Meta:
        model = PlanTopicEdge
        fields = ['id', 'plan_id', 'source_topic_id', 'target_topic_id']
        read_only_fields = ['id', 'plan_id']


class PlanTopicEdgeWriteSerializer(serializers.Serializer):
    """Serializer for writing plan topic edges"""
    source_topic_id = serializers.IntegerField()
    target_topic_id = serializers.IntegerField()


class PlanTopicSerializer(serializers.ModelSerializer):
    """Serializer for plan topics with topic details"""
    topic = TopicSerializer(read_only=True)
    topic_id = serializers.IntegerField(required=False, allow_null=True)
    
    class Meta:
        model = PlanTopic
        fields = [
            'id',
            'plan_id',
            'topic_id',
            'topic',
            'sequence_order',
            'expected_hours',
            'node_type',
            # LND Bridge fields
            'source',
            'lms_course_id',
            'lms_course_name',
        ]
        read_only_fields = ['id', 'plan_id']


class PlanTopicWriteSerializer(serializers.Serializer):
    """Serializer for writing plan topics (curated or LMS)"""
    topic_id = serializers.IntegerField(required=False, allow_null=True)
    sequence_order = serializers.IntegerField(default=1)
    expected_hours = serializers.DecimalField(max_digits=5, decimal_places=1)
    node_type = serializers.ChoiceField(
        choices=[('topic', 'Topic'), ('section', 'Section Header')],
        default='topic'
    )
    # LND Bridge fields
    source = serializers.ChoiceField(
        choices=[('curated', 'Curated'), ('lms', 'LMS')],
        default='curated'
    )
    lms_course_id = serializers.IntegerField(required=False, allow_null=True)
    lms_course_name = serializers.CharField(required=False, default='')


class PlanAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for plan assignments"""
    user = UserSerializer(read_only=True)
    user_id = serializers.IntegerField(write_only=True)
    assigned_by_admin = UserSerializer(read_only=True)
    
    class Meta:
        model = PlanAssignment
        fields = [
            'id',
            'plan',
            'user_id',
            'user',
            'assigned_by_admin_id',
            'assigned_by_admin',
            'assigned_at',
        ]
        read_only_fields = ['id', 'plan', 'assigned_by_admin_id', 'assigned_at', 'user_id']


class TrainingPlanSerializer(serializers.ModelSerializer):
    """Full training plan serializer with nested topics, assignments, and edges"""
    plan_topics = PlanTopicSerializer(many=True, read_only=True)
    assignments = PlanAssignmentSerializer(many=True, read_only=True)
    edges = PlanTopicEdgeSerializer(many=True, read_only=True)
    
    class Meta:
        model = TrainingPlan
        fields = [
            'id',
            'plan_name',
            'description',
            'is_active',
            'is_archived',
            'source_template',
            'target_role',
            'plan_topics',
            'assignments',
            'edges',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class TrainingPlanListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing training plans"""
    assignment_count = serializers.SerializerMethodField()
    topic_count = serializers.SerializerMethodField()
    assignment_user_ids = serializers.SerializerMethodField()

    class Meta:
        model = TrainingPlan
        fields = [
            'id',
            'plan_name',
            'description',
            'is_active',
            'is_archived',
            'source_template',
            'target_role',
            'assignment_count',
            'topic_count',
            'assignment_user_ids',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_assignment_count(self, obj):
        # Use annotated value if available, else count from prefetch cache
        if hasattr(obj, 'assignment_count'):
            return obj.assignment_count
        return obj.assignments.count()

    def get_assignment_user_ids(self, obj):
        return list(obj.assignments.values_list('user_id', flat=True))

    def get_topic_count(self, obj):
        # Use annotated value if available (counts all plan_topics), else filter
        if hasattr(obj, 'topic_count'):
            return obj.topic_count
        return obj.plan_topics.filter(node_type='topic').count()


class TrainingPlanCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating training plans with topics and edges"""
    plan_topics = PlanTopicWriteSerializer(many=True, required=False)
    edges = PlanTopicEdgeWriteSerializer(many=True, required=False)
    
    class Meta:
        model = TrainingPlan
        fields = [
            'plan_name',
            'description',
            'is_active',
            'source_template',
            'target_role',
            'plan_topics',
            'edges',
        ]
    
    def validate_plan_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Plan name cannot be empty")
        return value.strip()
    
    def create(self, validated_data):
        plan_topics_data = validated_data.pop('plan_topics', [])
        edges_data = validated_data.pop('edges', [])
        plan = TrainingPlan.objects.create(**validated_data)
        
        for pt_data in plan_topics_data:
            PlanTopic.objects.create(
                plan=plan,
                topic_id=pt_data['topic_id'],
                sequence_order=pt_data.get('sequence_order', 1),
                expected_hours=pt_data['expected_hours'],
                node_type=pt_data.get('node_type', 'topic'),
            )
        
        for edge_data in edges_data:
            PlanTopicEdge.objects.create(
                plan=plan,
                source_topic_id=edge_data['source_topic_id'],
                target_topic_id=edge_data['target_topic_id'],
            )
        
        return plan
    
    from django.db import transaction

    @transaction.atomic
    def update(self, instance, validated_data):
        plan_topics_data = validated_data.pop('plan_topics', None)
        edges_data = validated_data.pop('edges', None)
        
        # Update plan fields
        instance.plan_name = validated_data.get('plan_name', instance.plan_name)
        instance.description = validated_data.get('description', instance.description)
        instance.is_active = validated_data.get('is_active', instance.is_active)
        instance.source_template = validated_data.get('source_template', instance.source_template)
        instance.target_role = validated_data.get('target_role', instance.target_role)
        instance.save()
        
        # Update plan topics if provided
        if plan_topics_data is not None:
            instance.plan_topics.all().delete()
            for pt_data in plan_topics_data:
                PlanTopic.objects.create(
                    plan=instance,
                    topic_id=pt_data['topic_id'],
                    sequence_order=pt_data.get('sequence_order', 1),
                    expected_hours=pt_data['expected_hours'],
                    node_type=pt_data.get('node_type', 'topic'),
                )
        
        # Update edges if provided
        if edges_data is not None:
            instance.edges.all().delete()
            for edge_data in edges_data:
                PlanTopicEdge.objects.create(
                    plan=instance,
                    source_topic_id=edge_data['source_topic_id'],
                    target_topic_id=edge_data['target_topic_id'],
                )
        
        return instance


class AssignUsersSerializer(serializers.Serializer):
    """Serializer for assigning users to a plan"""
    user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text="List of user IDs to assign"
    )


class ImportTemplateSerializer(serializers.Serializer):
    """Serializer for importing a roadmap template"""
    template_id = serializers.CharField(
        max_length=100,
        help_text="ID of the template to import (e.g., 'frontend-developer')"
    )
