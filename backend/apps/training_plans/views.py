"""
API Views for Training Plan management
"""
import logging
from django.db import transaction
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import TrainingPlan, PlanAssignment, PlanTopic, PlanTopicEdge
from .serializers import (
    TrainingPlanSerializer,
    TrainingPlanListSerializer,
    TrainingPlanCreateUpdateSerializer,
    AssignUsersSerializer,
    PlanAssignmentSerializer,
    ImportTemplateSerializer,
)
from apps.users.permissions import IsAdmin
from apps.users.models import User
from apps.topics.models import Topic

logger = logging.getLogger(__name__)


class TrainingPlanListCreateView(generics.ListCreateAPIView):
    """
    GET /api/training-plans/ - List all non-archived plans
    POST /api/training-plans/ - Create new plan (admin only)
    """
    
    pagination_class = None
    
    def get_queryset(self):
        """Return non-archived plans with related data"""
        queryset = TrainingPlan.objects.all()
        
        # Filter by archived status if specified
        is_archived = self.request.query_params.get('archived', 'false')
        if is_archived.lower() == 'true':
            queryset = queryset.filter(is_archived=True)
        elif is_archived.lower() == 'false':
            queryset = queryset.filter(is_archived=False)
        # If 'all', no filtering on is_archived is applied, returns both
        
        # Filter by active status if specified
        is_active = self.request.query_params.get('active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
            
        if self.request.method == 'GET' and 'pk' not in self.kwargs:
            # Optimize list view with counts + prefetch for assignment_user_ids
            from django.db.models import Count
            queryset = queryset.annotate(
                assignment_count=Count('assignments', distinct=True),
                topic_count=Count('plan_topics', distinct=True)
            ).prefetch_related('assignments', 'plan_topics')
        else:
            # Detailed view needs relationships
            queryset = queryset.prefetch_related(
                'plan_topics__topic',
                'assignments__user',
                'assignments__assigned_by_admin',
                'edges',
            )
        
        return queryset
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return TrainingPlanCreateUpdateSerializer
        return TrainingPlanListSerializer

    
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAuthenticated()]
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan = serializer.save()
        
        logger.info(f"Training plan created: {plan.plan_name} (ID: {plan.id})")
        return Response(
            TrainingPlanSerializer(plan).data,
            status=status.HTTP_201_CREATED
        )


class TrainingPlanDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET /api/training-plans/<id>/ - Get single plan
    PUT /api/training-plans/<id>/ - Update plan (admin only)
    DELETE /api/training-plans/<id>/ - Archive plan (admin only)
    """
    
    def get_queryset(self):
        return TrainingPlan.objects.prefetch_related(
            'plan_topics__topic',
            'assignments__user',
            'assignments__assigned_by_admin',
            'edges',
        )
    
    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return TrainingPlanCreateUpdateSerializer
        return TrainingPlanSerializer
    
    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            return [IsAdmin()]
        return [IsAuthenticated()]
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        plan = serializer.save()
        
        logger.info(f"Training plan updated: {plan.plan_name} (ID: {plan.id})")
        return Response(TrainingPlanSerializer(plan).data)
    
    def destroy(self, request, *args, **kwargs):
        """Archive the plan (soft delete)"""
        instance = self.get_object()
        instance.archive()
        
        logger.info(f"Training plan archived: {instance.plan_name} (ID: {instance.id})")
        return Response(
            {'message': 'Training plan archived successfully'},
            status=status.HTTP_200_OK
        )


class TrainingPlanRestoreView(APIView):
    """
    POST /api/training-plans/<id>/restore/ - Restore plan from archive
    """
    permission_classes = [IsAdmin]
    
    def post(self, request, pk):
        try:
            plan = TrainingPlan.objects.get(pk=pk)
            plan.restore()
            
            logger.info(f"Training plan restored: {plan.plan_name} (ID: {plan.id})")
            return Response(
                TrainingPlanSerializer(plan).data,
                status=status.HTTP_200_OK
            )
        except TrainingPlan.DoesNotExist:
            return Response(
                {'error': 'Training plan not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class TrainingPlanAssignView(APIView):
    """
    POST /api/training-plans/<id>/assign/ - Assign users to plan
    """
    permission_classes = [IsAdmin]
    
    def post(self, request, pk):
        try:
            plan = TrainingPlan.objects.get(pk=pk)
        except TrainingPlan.DoesNotExist:
            return Response(
                {'error': 'Training plan not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = AssignUsersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user_ids = serializer.validated_data['user_ids']
        assigned_count = 0
        
        for user_id in user_ids:
            try:
                user = User.objects.get(pk=user_id, is_active=True)
                # Check if already assigned
                if not PlanAssignment.objects.filter(plan=plan, user=user).exists():
                    assignment = PlanAssignment.objects.create(
                        plan=plan,
                        user=user,
                        assigned_by_admin=request.user
                    )
                    assigned_count += 1
            except User.DoesNotExist:
                continue
        
        logger.info(f"Assigned {assigned_count} users to plan: {plan.plan_name}")
        return Response({
            'message': f'Assigned {assigned_count} users to plan',
            'plan': TrainingPlanSerializer(plan).data
        })


class UserAssignmentsView(generics.ListAPIView):
    """
    GET /api/training-plans/assignments/my_assignments/ - List user's assignments
    """
    permission_classes = [IsAuthenticated]
    serializer_class = PlanAssignmentSerializer
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        # Allow admins to view other users' assignments via query param
        user_id = self.request.query_params.get('user_id')
        if user_id and user.is_staff:
             return PlanAssignment.objects.filter(
                 user_id=user_id
             ).select_related('plan').prefetch_related('plan__plan_topics__topic', 'plan__edges')
             
        return PlanAssignment.objects.filter(
            user=user
        ).select_related('plan').prefetch_related('plan__plan_topics__topic', 'plan__edges')


class PlanProgressView(APIView):
    """
    GET /api/training-plans/<id>/progress/ - Lightweight plan progress for learners
    Returns only the plan's topics with pre-computed mastery status.
    Avoids loading all 600+ topics + all entries — returns only what's needed.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.topics.models import LearnerTopicMastery
        
        user = request.user
        
        # Get the plan
        try:
            plan = TrainingPlan.objects.prefetch_related(
                'plan_topics__topic',
                'edges'
            ).get(pk=pk)
        except TrainingPlan.DoesNotExist:
            return Response({'error': 'Plan not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Check access: either assigned to this plan or admin
        if user.role != 'admin':
            is_assigned = PlanAssignment.objects.filter(plan=plan, user=user).exists()
            if not is_assigned:
                return Response({'error': 'Not assigned to this plan'}, status=status.HTTP_403_FORBIDDEN)
        
        # Get all topic IDs in this plan
        plan_topic_ids = list(plan.plan_topics.values_list('topic_id', flat=True))
        
        # Fetch mastery for ONLY these topics (not all 600+)
        mastery_map = {}
        if user.role != 'admin':
            masteries = LearnerTopicMastery.objects.filter(
                user=user,
                topic_id__in=plan_topic_ids
            ).select_related('topic')
            mastery_map = {m.topic_id: m for m in masteries}
        
        # Build lightweight topic list
        topics_data = []
        completed_count = 0
        total_hours = 0.0

        # Batch fetch resource counts + KB status for all plan topics (avoid N+1)
        from apps.topics.models import TopicKnowledge, TopicResource
        from django.db.models import Count, Q

        resource_counts = dict(
            TopicResource.objects.filter(
                topic_id__in=plan_topic_ids, is_active=True,
            ).values_list('topic_id').annotate(cnt=Count('id')).values_list('topic_id', 'cnt')
        )

        # KB lookup: by topic FK or by name match
        topics_with_kb_by_fk = set(
            TopicKnowledge.objects.filter(
                topic_id__in=plan_topic_ids, is_active=True,
            ).values_list('topic_id', flat=True)
        )
        # Also check by name for topics not linked by FK
        topic_names = {pt.topic.id: pt.topic.name for pt in plan.plan_topics.all()}
        topics_with_kb_by_name = set()
        if topic_names:
            name_list = list(topic_names.values())
            kb_names = set(
                TopicKnowledge.objects.filter(
                    topic_name__in=name_list, is_active=True,
                ).values_list('topic_name', flat=True)
            )
            for tid, tname in topic_names.items():
                if tname in kb_names:
                    topics_with_kb_by_name.add(tid)
        topics_with_kb = topics_with_kb_by_fk | topics_with_kb_by_name
        
        for pt in plan.plan_topics.all():
            topic = pt.topic
            mastery = mastery_map.get(topic.id)
            
            is_completed = mastery is not None and mastery.is_completed if mastery else False
            if is_completed:
                completed_count += 1
            
            total_hours += float(topic.benchmark_hours or 0)
            
            topics_data.append({
                'id': topic.id,
                'name': topic.name,
                'benchmark_hours': topic.benchmark_hours,
                'depth': topic.depth,
                'is_completed': is_completed,
                'mastered_hours': float(mastery.mastered_hours) if mastery else 0.0,
                'sequence': pt.sequence,
                'resource_count': resource_counts.get(topic.id, 0),
                'has_knowledge': topic.id in topics_with_kb,
            })
        
        # Sort by sequence
        topics_data.sort(key=lambda x: x['sequence'])
        
        # Build edges for graph
        edges_data = [
            {
                'id': edge.id,
                'from_topic': edge.from_topic_id,
                'to_topic': edge.to_topic_id,
            }
            for edge in plan.edges.all()
        ]
        
        progress_percentage = (completed_count / len(plan_topic_ids) * 100) if plan_topic_ids else 0
        
        return Response({
            'plan': {
                'id': plan.id,
                'name': plan.plan_name,
                'description': plan.description,
                'total_topics': len(plan_topic_ids),
                'completed_topics': completed_count,
                'progress_percentage': round(progress_percentage, 1),
                'expected_hours': total_hours,
            },
            'topics': topics_data,
            'edges': edges_data,
        })


class ImportTemplateView(APIView):
    """
    POST /api/training-plans/import-template/ - Import a roadmap template as a training plan.
    Creates topics, plan, plan_topics, and edges from the template data.
    """
    permission_classes = [IsAdmin]

    @transaction.atomic
    def post(self, request):
        serializer = ImportTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        template_id = serializer.validated_data['template_id']
        
        # Import the template data (from frontend static data sent in the request)
        template_data = request.data.get('template_data')
        if not template_data:
            return Response(
                {'error': 'template_data is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create training plan
        plan = TrainingPlan.objects.create(
            plan_name=template_data.get('name', template_id),
            description=template_data.get('description', ''),
            is_active=True,
            source_template=template_id,
            target_role=template_data.get('name', ''),
        )
        
        # Create topics and plan_topics from sections
        topic_map = {}  # section_id -> topic_id  (for edge creation)
        processed_topic_ids = set() # Prevent duplicate topics in the same plan
        sequence = 1
        
        for section in template_data.get('sections', []):
            # Create or get section topic
            section_topic, _ = Topic.objects.get_or_create(
                name=section['name'],
                parent=None,
                defaults={
                    'depth': 0,
                    'benchmark_hours': 0,
                    'difficulty': 3,
                }
            )
            topic_map[section['id']] = section_topic.id
            
            # Add section as a plan topic if not already added
            if section_topic.id not in processed_topic_ids:
                PlanTopic.objects.get_or_create(
                    plan=plan,
                    topic=section_topic,
                    defaults={
                        'sequence_order': sequence,
                        'expected_hours': 0,
                        'node_type': 'section',
                    }
                )
                processed_topic_ids.add(section_topic.id)
                sequence += 1
            
            # Create child topics
            for topic_data in section.get('topics', []):
                child_topic, _ = Topic.objects.get_or_create(
                    name=topic_data['name'],
                    parent=section_topic,
                    defaults={
                        'depth': 1,
                        'benchmark_hours': topic_data.get('benchmarkHours', 5),
                        'difficulty': topic_data.get('difficulty', 3),
                    }
                )
                
                if child_topic.id not in processed_topic_ids:
                    PlanTopic.objects.get_or_create(
                        plan=plan,
                        topic=child_topic,
                        defaults={
                            'sequence_order': sequence,
                            'expected_hours': topic_data.get('benchmarkHours', 5),
                            'node_type': 'topic',
                        }
                    )
                    processed_topic_ids.add(child_topic.id)
                    sequence += 1
                
                # Create grandchild topics if any
                for sub_topic_data in topic_data.get('children', []):
                    sub_topic, _ = Topic.objects.get_or_create(
                        name=sub_topic_data['name'],
                        parent=child_topic,
                        defaults={
                            'depth': 2,
                            'benchmark_hours': sub_topic_data.get('benchmarkHours', 3),
                            'difficulty': sub_topic_data.get('difficulty', 3),
                        }
                    )
                    
                    if sub_topic.id not in processed_topic_ids:
                        PlanTopic.objects.get_or_create(
                            plan=plan,
                            topic=sub_topic,
                            defaults={
                                'sequence_order': sequence,
                                'expected_hours': sub_topic_data.get('benchmarkHours', 3),
                                'node_type': 'topic',
                            }
                        )
                        processed_topic_ids.add(sub_topic.id)
                        sequence += 1

        
        # Create edges from section dependencies
        for section in template_data.get('sections', []):
            for dep_id in section.get('dependsOn', []):
                if dep_id in topic_map and section['id'] in topic_map:
                    PlanTopicEdge.objects.get_or_create(
                        plan=plan,
                        source_topic_id=topic_map[dep_id],
                        target_topic_id=topic_map[section['id']],
                    )
        
        logger.info(f"Imported template '{template_id}' as plan: {plan.plan_name} (ID: {plan.id})")
        
        # Re-fetch with prefetched data
        plan = TrainingPlan.objects.prefetch_related(
            'plan_topics__topic', 'assignments', 'edges'
        ).get(pk=plan.id)
        
        return Response(
            TrainingPlanSerializer(plan).data,
            status=status.HTTP_201_CREATED
        )


class UserPlanEstimateView(APIView):
    """
    GET /api/training-plans/<plan_id>/estimate/<user_id>/
    Calculate personalized estimated completion time (V2 Context-Aware).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, user_id):
        try:
            plan = TrainingPlan.objects.prefetch_related('plan_topics__topic').get(pk=pk)
            user = User.objects.get(pk=user_id)
        except (TrainingPlan.DoesNotExist, User.DoesNotExist):
            return Response({'error': 'Plan or User not found'}, status=status.HTTP_404_NOT_FOUND)

        # 1. Global Speed Factors (Base capabilities)
        # Experience-based mapping (Granular Tiers)
        exp_years = float(user.experience_years) if user.experience_years else 0.0
        
        if exp_years <= 1.0:
            exp_factor = 1.4  # Junior / Learning
            exp_tier = 'junior'
        elif exp_years < 2.5:
            exp_factor = 1.2  # Rising
            exp_tier = 'rising'
        elif exp_years < 5.0:
            exp_factor = 1.0  # Mid / Standard
            exp_tier = 'mid'
        elif exp_years < 8.0:
            exp_factor = 0.85 # Senior / Efficient
            exp_tier = 'senior'
        else:
            exp_factor = 0.75 # Expert / Mastery
            exp_tier = 'expert'

        # Expertise level removed - baseline is now solely experience_years
        global_speed_factor = exp_factor

        # 2. Contextual Penalties (Per Topic)
        plan_topics = plan.plan_topics.all()
        total_benchmark_hours = 0.0
        total_estimated_hours = 0.0

        user_stack = set(t.lower().strip() for t in (user.tech_stack or []))
        user_domain = user.primary_domain or 'general'

        # Metrics for response
        total_domain_penalty = 0.0
        total_language_penalty = 0.0

        # Per-topic breakdown list (NEW)
        topics_data = []

        for pt in plan_topics:
            topic = pt.topic
            base_hours = float(pt.topic.benchmark_hours or 0) or 3.0  # Always use raw benchmark; fallback 3h
            total_benchmark_hours += base_hours

            # A. Domain Distance
            domain_penalty = 0.0
            topic_domain = topic.domain or 'general'
            # 'general' and 'fundamentals' are universal — no domain penalty
            neutral_domains = {'general', 'fundamentals', 'soft_skills'}
            if topic_domain not in neutral_domains and topic_domain != user_domain:
                base_penalty = 0.3
                difficulty_mult = 1.0
                if topic.difficulty <= 2:
                    difficulty_mult = 0.5
                elif topic.difficulty >= 4:
                    difficulty_mult = 1.5
                domain_penalty = base_penalty * difficulty_mult

            # B. Language Friction
            language_penalty = 0.0
            topic_lang = topic.language
            if topic_lang:
                lang_key = topic_lang.lower().strip()
                if lang_key not in user_stack:
                    base_penalty = 0.2
                    difficulty_mult = 1.0
                    if topic.difficulty <= 2:
                        difficulty_mult = 0.5
                    elif topic.difficulty >= 4:
                        difficulty_mult = 1.5
                    language_penalty = base_penalty * difficulty_mult

            # C. Combined
            topic_factor = global_speed_factor + domain_penalty + language_penalty
            estimated = base_hours * topic_factor

            total_estimated_hours += estimated
            total_domain_penalty += (base_hours * domain_penalty)
            total_language_penalty += (base_hours * language_penalty)

            # Collect per-topic data
            topics_data.append({
                'topic_id': topic.id,
                'topic_name': topic.name,
                'benchmark_hours': round(base_hours, 1),
                'estimated_hours': round(estimated, 1),
                'breakdown': {
                    'exp_factor': round(global_speed_factor, 2),
                    'domain_penalty': round(domain_penalty, 2),
                    'language_penalty': round(language_penalty, 2),
                    'total_factor': round(topic_factor, 2),
                }
            })

        # Calculate averages for display
        avg_factor = (total_estimated_hours / total_benchmark_hours) if total_benchmark_hours > 0 else global_speed_factor

        return Response({
            'plan_id': pk,
            'user_id': user_id,
            'benchmark_hours': round(total_benchmark_hours, 1),
            'estimated_hours': round(total_estimated_hours, 1),
            'experience_tier': exp_tier,
            'breakdown': {
                'global_speed_factor': round(global_speed_factor, 2),
                'domain_penalty_hours': round(total_domain_penalty, 1),
                'language_penalty_hours': round(total_language_penalty, 1),
            },
            'multipliers': {
                'experience': round(exp_factor, 2),
                'total': round(avg_factor, 2)
            },
            'topics': topics_data,  # NEW: per-topic estimates
        })



