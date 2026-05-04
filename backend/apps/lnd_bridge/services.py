"""
LND Bridge Services — Business logic for data bridges between ALTS and LND.

Handles:
- Fetching ERP employees via the LND sidecar
- Creating ALTS users from ERP data
- Fetching LMS courses via the LND sidecar
- Training plan approval workflow state machine
"""
import httpx
import logging
from typing import Optional
from django.utils import timezone
from django.db import transaction

from apps.users.models import User
from apps.training_plans.models import TrainingPlan, PlanAssignment
from .models import TrainingPlanRequest

logger = logging.getLogger(__name__)

# LND Sidecar internal URL (same as proxy)
LND_SIDECAR_URL = "http://127.0.0.1:8001/api/v1"


class LndSidecarClient:
    """
    HTTP client for communicating with the LND FastAPI sidecar.
    Used internally by bridge services — never exposed to frontend directly.
    """

    @staticmethod
    def _get_sidecar_token():
        """Generate a short-lived JWT that the sidecar's verify_token will accept."""
        try:
            from jose import jwt as jose_jwt
            from datetime import datetime, timedelta, timezone as tz
            from django.conf import settings as django_settings
            from pathlib import Path

            env_path = Path(django_settings.BASE_DIR) / 'lnd_sidecar' / '.env'
            config = {}
            if env_path.exists():
                for line in env_path.read_text().splitlines():
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, _, value = line.partition('=')
                        config[key.strip()] = value.strip()

            secret = config.get('SECRET_KEY', 'lnd-sidecar-secret-key-change-this')
            algorithm = config.get('ALGORITHM', 'HS256')
            admin_email = config.get('ADMIN_EMAIL', 'admin@brainstation-23.com')

            expire = datetime.now(tz.utc) + timedelta(minutes=5)
            payload = {
                "sub": admin_email,
                "exp": int(expire.timestamp()),
                "role": "admin",
            }
            return jose_jwt.encode(payload, secret, algorithm=algorithm)
        except Exception as e:
            logger.error("Failed to generate sidecar JWT: %s", e)
            return None

    @classmethod
    def _get_client(cls):
        headers = {'X-Forwarded-By': 'ALTS-Bridge-Service'}
        token = cls._get_sidecar_token()
        if token:
            headers['Authorization'] = f'Bearer {token}'
        return httpx.Client(
            base_url=LND_SIDECAR_URL,
            timeout=30.0,
            headers=headers,
            follow_redirects=True,
        )

    @classmethod
    def get_erp_employees(cls, search: str = '', limit: int = 50, offset: int = 0):
        """Fetch ERP employees from the LND sidecar's cached student list."""
        try:
            with cls._get_client() as client:
                params = {'limit': limit, 'skip': offset}
                if search:
                    params['search'] = search
                response = client.get('/students', params=params)
                response.raise_for_status()
                return response.json()
        except httpx.ConnectError:
            logger.warning("LND sidecar unreachable for ERP employee fetch")
            return []
        except Exception as e:
            logger.error("Error fetching ERP employees: %s", str(e))
            return []

    @classmethod
    def get_lms_courses(cls, include_enrollment_counts: bool = False):
        """Fetch LMS courses from the LND sidecar's cached Moodle data."""
        try:
            with cls._get_client() as client:
                params = {'include_enrollment_counts': include_enrollment_counts}
                response = client.get('/lms/courses', params=params)
                response.raise_for_status()
                data = response.json()
                return data.get('courses', [])
        except httpx.ConnectError:
            logger.warning("LND sidecar unreachable for LMS course fetch")
            return []
        except Exception as e:
            logger.error("Error fetching LMS courses: %s", str(e))
            return []

    @classmethod
    def get_user_lms_progress(cls, employee_id: str):
        """Fetch a user's LMS course progress from the LND sidecar."""
        try:
            with cls._get_client() as client:
                response = client.get(f'/lms/users/{employee_id}/courses')
                response.raise_for_status()
                data = response.json()
                return data.get('courses', [])
        except httpx.ConnectError:
            logger.warning("LND sidecar unreachable for user LMS progress")
            return []
        except Exception as e:
            logger.error("Error fetching user LMS progress: %s", str(e))
            return []

    @classmethod
    def check_health(cls):
        """Check if the LND sidecar is running."""
        try:
            with cls._get_client() as client:
                response = client.get('/health')
                return response.status_code == 200
        except Exception:
            return False


class ERPUserService:
    """Service for creating ALTS users from ERP employee data."""

    @staticmethod
    @transaction.atomic
    def create_user_from_erp(employee_data: dict) -> User:
        """
        Create a new ALTS user from ERP employee data.

        Args:
            employee_data: Dict with keys from CreateUserFromERPSerializer

        Returns:
            The created User instance
        """
        import secrets
        import string

        # Generate a random temporary password (user will reset on first login)
        temp_password = ''.join(
            secrets.choice(string.ascii_letters + string.digits + '!@#$%')
            for _ in range(16)
        )

        user = User.objects.create_user(
            email=employee_data['email'],
            password=temp_password,
            full_name=employee_data['name'],
            role='learner',
            # New LND bridge fields
            employee_id=employee_data.get('employee_id', ''),
            department=employee_data.get('department', ''),
            designation=employee_data.get('designation', ''),
            sbu_name=employee_data.get('sbu_name', ''),
            erp_role=employee_data.get('erp_role', ''),
            joining_date=employee_data.get('joining_date'),
        )

        # Set experience if provided
        total_exp = employee_data.get('total_experience')
        if total_exp is not None:
            user.experience_years = round(total_exp, 1)
            user.save(update_fields=['experience_years'])

        logger.info(
            "Created ALTS user from ERP: %s (%s)",
            user.email, user.employee_id
        )
        return user


class ApprovalWorkflowService:
    """
    State machine for training plan request approvals.

    Flow: requested → pm_approved → lnd_approved → active
    """

    @staticmethod
    @transaction.atomic
    def create_request(
        user: User,
        plan: TrainingPlan,
        initiated_by: str = 'user',
        reason: str = ''
    ) -> TrainingPlanRequest:
        """Create a new training plan request."""
        request = TrainingPlanRequest.objects.create(
            user=user,
            plan=plan,
            initiated_by=initiated_by,
            request_reason=reason,
            status='requested',
        )
        logger.info(
            "Plan request created: %s → %s (by %s)",
            user.email, plan.plan_name, initiated_by
        )
        return request

    @staticmethod
    @transaction.atomic
    def pm_review(
        request_obj: TrainingPlanRequest,
        reviewer: User,
        action: str,
        notes: str = ''
    ) -> TrainingPlanRequest:
        """PM approves or rejects a plan request."""
        if request_obj.status != 'requested':
            raise ValueError(f"Cannot PM-review a request in '{request_obj.status}' status")

        request_obj.pm_reviewer = reviewer
        request_obj.pm_reviewed_at = timezone.now()
        request_obj.pm_notes = notes

        if action == 'approve':
            request_obj.status = 'pm_approved'
        elif action == 'reject':
            request_obj.status = 'pm_rejected'
        else:
            raise ValueError(f"Invalid action: {action}")

        request_obj.save()
        logger.info(
            "PM %s %s plan request #%d",
            reviewer.email,
            'approved' if action == 'approve' else 'rejected',
            request_obj.id
        )
        return request_obj

    @staticmethod
    @transaction.atomic
    def lnd_review(
        request_obj: TrainingPlanRequest,
        reviewer: User,
        action: str,
        notes: str = ''
    ) -> TrainingPlanRequest:
        """LND admin gives final approval or rejects."""
        if request_obj.status != 'pm_approved':
            raise ValueError(f"Cannot LND-review a request in '{request_obj.status}' status")

        request_obj.lnd_reviewer = reviewer
        request_obj.lnd_reviewed_at = timezone.now()
        request_obj.lnd_notes = notes

        if action == 'approve':
            request_obj.status = 'lnd_approved'
            # Auto-activate: create the PlanAssignment
            PlanAssignment.objects.get_or_create(
                plan=request_obj.plan,
                user=request_obj.user,
                defaults={'assigned_by_admin': reviewer}
            )
            request_obj.status = 'active'
            request_obj.activated_at = timezone.now()
        elif action == 'reject':
            request_obj.status = 'lnd_rejected'
        else:
            raise ValueError(f"Invalid action: {action}")

        request_obj.save()
        logger.info(
            "LND admin %s %s plan request #%d",
            reviewer.email,
            'approved+activated' if action == 'approve' else 'rejected',
            request_obj.id
        )
        return request_obj
