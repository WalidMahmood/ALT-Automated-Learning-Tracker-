"""
Serializers for LND Bridge — ERP employees, approval workflow, LMS courses.
"""
from rest_framework import serializers
from apps.users.models import User
from .models import TrainingPlanRequest


class ERPEmployeeSerializer(serializers.Serializer):
    """Read-only serializer for ERP employee data fetched from LND sidecar."""
    employee_id = serializers.CharField(help_text="e.g. BS0733")
    name = serializers.CharField()
    email = serializers.EmailField()
    department = serializers.CharField(allow_blank=True, default='')
    designation = serializers.CharField(allow_blank=True, default='')
    sbu_name = serializers.CharField(allow_blank=True, allow_null=True, default='')
    is_active = serializers.BooleanField(default=True)
    joining_date = serializers.DateField(allow_null=True, required=False)
    total_experience = serializers.FloatField(allow_null=True, required=False)
    # Whether this employee already has an ALTS account
    has_alts_account = serializers.BooleanField(default=False, read_only=True)


class CreateUserFromERPSerializer(serializers.Serializer):
    """Serializer for creating an ALTS user from ERP employee data."""
    employee_id = serializers.CharField(max_length=20, help_text="e.g. BS0733")
    name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    department = serializers.CharField(max_length=100, allow_blank=True, default='')
    designation = serializers.CharField(max_length=100, allow_blank=True, default='')
    sbu_name = serializers.CharField(max_length=100, allow_blank=True, default='')
    erp_role = serializers.CharField(max_length=100, allow_blank=True, default='')
    joining_date = serializers.DateField(allow_null=True, required=False)
    total_experience = serializers.FloatField(allow_null=True, required=False)

    def validate_email(self, value):
        """Ensure email is brainstation domain and not already taken."""
        if not value.endswith('@brainstation-23.com'):
            raise serializers.ValidationError("Email must be @brainstation-23.com domain")
        if User.objects.filter(email=value, is_active=True).exists():
            raise serializers.ValidationError("A user with this email already exists")
        return value

    def validate_employee_id(self, value):
        """Ensure employee_id is not already taken."""
        if User.objects.filter(employee_id=value, is_active=True).exists():
            raise serializers.ValidationError("A user with this employee ID already exists")
        return value


class TrainingPlanRequestSerializer(serializers.ModelSerializer):
    """Full serializer for training plan requests."""
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    plan_name = serializers.CharField(source='plan.plan_name', read_only=True)
    pm_reviewer_name = serializers.CharField(
        source='pm_reviewer.full_name', read_only=True, default=None
    )
    lnd_reviewer_name = serializers.CharField(
        source='lnd_reviewer.full_name', read_only=True, default=None
    )

    class Meta:
        model = TrainingPlanRequest
        fields = [
            'id', 'user', 'user_name', 'user_email',
            'plan', 'plan_name',
            'status', 'initiated_by', 'request_reason',
            'pm_reviewer', 'pm_reviewer_name', 'pm_reviewed_at', 'pm_notes',
            'lnd_reviewer', 'lnd_reviewer_name', 'lnd_reviewed_at', 'lnd_notes',
            'activated_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'status', 'pm_reviewed_at', 'lnd_reviewed_at',
            'activated_at', 'created_at', 'updated_at',
        ]


class TrainingPlanRequestCreateSerializer(serializers.Serializer):
    """Serializer for creating a new plan request."""
    user_id = serializers.IntegerField()
    plan_id = serializers.IntegerField()
    initiated_by = serializers.ChoiceField(choices=['user', 'admin'], default='user')
    request_reason = serializers.CharField(max_length=500, required=False, default='')


class TrainingPlanRequestReviewSerializer(serializers.Serializer):
    """Serializer for PM or LND admin reviewing a request."""
    action = serializers.ChoiceField(choices=['approve', 'reject'])
    notes = serializers.CharField(max_length=500, required=False, default='')


class LMSCourseSerializer(serializers.Serializer):
    """Read-only serializer for LMS course data fetched from LND sidecar."""
    id = serializers.IntegerField()
    fullname = serializers.CharField()
    shortname = serializers.CharField(allow_blank=True, default='')
    summary = serializers.CharField(allow_blank=True, default='')
    categoryname = serializers.CharField(allow_blank=True, default='')
    startdate = serializers.IntegerField(allow_null=True, required=False)
    enddate = serializers.IntegerField(allow_null=True, required=False)
    is_mandatory = serializers.BooleanField(default=False)


class LMSUserProgressSerializer(serializers.Serializer):
    """Read-only serializer for a user's progress on an LMS course."""
    course_id = serializers.IntegerField()
    course_name = serializers.CharField()
    progress = serializers.FloatField(default=0)
    completed = serializers.BooleanField(default=False)
    completion_date = serializers.DateTimeField(allow_null=True, required=False)
    last_access = serializers.DateTimeField(allow_null=True, required=False)
