"""
Serializers for Training Plan models
"""
from rest_framework import serializers
from .models import TrainingPlan, PlanTopic, PlanAssignment
from apps.topics.serializers import TopicSerializer
from apps.users.serializers import UserSerializer


class PlanTopicSerializer(serializers.ModelSerializer):
    """Serializer for plan topics with topic details"""
    topic = TopicSerializer(read_only=True)
    topic_id = serializers.IntegerField()
    
    class Meta:
        model = PlanTopic
        fields = [
            'id',
            'plan_id',
            'topic_id',
            'topic',
            'sequence_order',
            'expected_hours',
        ]
        read_only_fields = ['id', 'plan_id']


class PlanTopicWriteSerializer(serializers.Serializer):
    """Serializer for writing plan topics"""
    topic_id = serializers.IntegerField()
    sequence_order = serializers.IntegerField(default=1)
    expected_hours = serializers.DecimalField(max_digits=5, decimal_places=1)


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
    """Full training plan serializer with nested topics and assignments"""
    plan_topics = PlanTopicSerializer(many=True, read_only=True)
    assignments = PlanAssignmentSerializer(many=True, read_only=True)
    
    class Meta:
        model = TrainingPlan
        fields = [
            'id',
            'plan_name',
            'description',
            'is_active',
            'is_archived',
            'plan_topics',
            'assignments',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class TrainingPlanCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating training plans with topics"""
    plan_topics = PlanTopicWriteSerializer(many=True, required=False)
    
    class Meta:
        model = TrainingPlan
        fields = [
            'plan_name',
            'description',
            'is_active',
            'plan_topics',
        ]
    
    def validate_plan_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Plan name cannot be empty")
        return value.strip()
    
    def create(self, validated_data):
        plan_topics_data = validated_data.pop('plan_topics', [])
        plan = TrainingPlan.objects.create(**validated_data)
        
        for pt_data in plan_topics_data:
            PlanTopic.objects.create(
                plan=plan,
                topic_id=pt_data['topic_id'],
                sequence_order=pt_data.get('sequence_order', 1),
                expected_hours=pt_data['expected_hours']
            )
        
        return plan
    
    from django.db import transaction

    @transaction.atomic
    def update(self, instance, validated_data):
        plan_topics_data = validated_data.pop('plan_topics', None)
        
        # Update plan fields
        instance.plan_name = validated_data.get('plan_name', instance.plan_name)
        instance.description = validated_data.get('description', instance.description)
        instance.is_active = validated_data.get('is_active', instance.is_active)
        instance.save()
        
        # Update plan topics if provided
        if plan_topics_data is not None:
            # Delete existing topics and recreate
            instance.plan_topics.all().delete()
            for pt_data in plan_topics_data:
                PlanTopic.objects.create(
                    plan=instance,
                    topic_id=pt_data['topic_id'],
                    sequence_order=pt_data.get('sequence_order', 1),
                    expected_hours=pt_data['expected_hours']
                )
        
        return instance


class AssignUsersSerializer(serializers.Serializer):
    """Serializer for assigning users to a plan"""
    user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text="List of user IDs to assign"
    )
