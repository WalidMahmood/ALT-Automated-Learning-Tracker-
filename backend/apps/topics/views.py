"""
API Views for Topic management
"""
import logging
from django.db.models import Prefetch
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Topic, LearnerTopicMastery
from .serializers import TopicSerializer, TopicLiteSerializer, TopicCreateUpdateSerializer
from apps.users.permissions import IsAdmin
logger = logging.getLogger(__name__)


class TopicListCreateView(generics.ListCreateAPIView):
    """
    GET /api/topics/ - List all active topics
    POST /api/topics/ - Create new topic (admin only)
    """
    
    pagination_class = None
    
    def get_queryset(self):
        """Return only active topics with optimized mastery prefetch"""
        queryset = Topic.objects.filter(is_active=True).select_related('parent').order_by('name').distinct()
        
        # Skip mastery prefetch for admins — they don't need it
        if self.request and self.request.user and self.request.user.is_authenticated:
            if getattr(self.request.user, 'role', None) != 'admin':
                mastery_prefetch = Prefetch(
                    'learner_masteries',
                    queryset=LearnerTopicMastery.objects.filter(user=self.request.user),
                    to_attr='user_mastery_cache'
                )
                queryset = queryset.prefetch_related(mastery_prefetch)
        
        return queryset
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return TopicCreateUpdateSerializer
        # Admin gets lite serializer — no mastery, minimal fields, ~6x smaller payload
        if getattr(self.request.user, 'role', None) == 'admin':
            return TopicLiteSerializer
        return TopicSerializer
    
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAuthenticated()]
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        topic = serializer.save()
        
        logger.info(f"Topic created: {topic.name} (ID: {topic.id})")
        return Response(
            TopicSerializer(topic, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED
        )


class TopicDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET /api/topics/<id>/ - Get single topic
    PUT /api/topics/<id>/ - Update topic (admin only)
    DELETE /api/topics/<id>/ - Soft delete topic (admin only)
    """
    
    def get_queryset(self):
        queryset = Topic.objects.filter(is_active=True).select_related('parent')
        
        # Prefetch mastery for current user
        if self.request and self.request.user and self.request.user.is_authenticated:
            mastery_prefetch = Prefetch(
                'learner_masteries',
                queryset=LearnerTopicMastery.objects.filter(user=self.request.user),
                to_attr='user_mastery_cache'
            )
            queryset = queryset.prefetch_related(mastery_prefetch)
        
        return queryset
    
    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return TopicCreateUpdateSerializer
        return TopicSerializer
    
    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            return [IsAdmin()]
        return [IsAuthenticated()]
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        topic = serializer.save()
        
        logger.info(f"Topic updated: {topic.name} (ID: {topic.id})")
        return Response(TopicSerializer(topic, context=self.get_serializer_context()).data)
    
    def destroy(self, request, *args, **kwargs):
        """Soft delete - set is_active to False"""
        instance = self.get_object()
        instance.soft_delete()
        
        logger.info(f"Topic soft deleted: {instance.name} (ID: {instance.id})")
        return Response(
            {'message': 'Topic deleted successfully'},
            status=status.HTTP_200_OK
        )


# ─── Topic Resources (YouTube Videos) ──────────────────────────────

class TopicResourceListCreateView(APIView):
    """
    GET /api/topics/<id>/resources/ — List resources for a topic (on-demand)
    POST /api/topics/<id>/resources/ — Admin adds a resource manually
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, topic_id):
        from .models import TopicResource
        from .serializers import TopicResourceSerializer

        resources = TopicResource.objects.filter(
            topic_id=topic_id, is_active=True
        ).order_by('-view_count')
        return Response(TopicResourceSerializer(resources, many=True).data)

    def post(self, request, topic_id):
        if not request.user.is_staff:
            return Response({'error': 'Admin only'}, status=status.HTTP_403_FORBIDDEN)

        from .models import Topic, TopicResource
        from .serializers import TopicResourceCreateSerializer

        try:
            topic = Topic.objects.get(id=topic_id, is_active=True)
        except Topic.DoesNotExist:
            return Response({'error': 'Topic not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = TopicResourceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        resource = TopicResource.objects.create(
            topic=topic,
            generated_by='admin',
            **serializer.validated_data,
        )
        from .serializers import TopicResourceSerializer
        return Response(
            TopicResourceSerializer(resource).data,
            status=status.HTTP_201_CREATED,
        )


class TopicResourceDetailView(APIView):
    """
    PATCH /api/topics/resources/<id>/ — Edit a resource
    DELETE /api/topics/resources/<id>/ — Soft-delete a resource
    """
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        from .models import TopicResource
        from .serializers import TopicResourceSerializer

        try:
            resource = TopicResource.objects.get(id=pk, is_active=True)
        except TopicResource.DoesNotExist:
            return Response({'error': 'Resource not found'}, status=status.HTTP_404_NOT_FOUND)

        for field in ['title', 'url', 'channel_name', 'duration_minutes',
                       'view_count', 'like_count', 'thumbnail_url', 'description']:
            if field in request.data:
                setattr(resource, field, request.data[field])
        resource.save()

        return Response(TopicResourceSerializer(resource).data)

    def delete(self, request, pk):
        from .models import TopicResource

        try:
            resource = TopicResource.objects.get(id=pk, is_active=True)
        except TopicResource.DoesNotExist:
            return Response({'error': 'Resource not found'}, status=status.HTTP_404_NOT_FOUND)

        resource.is_active = False
        resource.save()
        return Response({'message': 'Resource deleted'})


# ─── Topic Knowledge (KB) View / Edit ──────────────────────────────

class TopicKnowledgeView(APIView):
    """
    GET /api/topics/knowledge/<topic_id>/ — View KB for a topic
    PATCH /api/topics/knowledge/<topic_id>/ — Admin edits KB fields
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, topic_id):
        from .models import TopicKnowledge
        from .serializers import TopicKnowledgeSerializer

        # Try to find KB by topic FK first, then by topic name
        kb = TopicKnowledge.objects.filter(topic_id=topic_id, is_active=True).first()
        if not kb:
            # Try matching by name
            try:
                topic = Topic.objects.get(id=topic_id)
                kb = TopicKnowledge.objects.filter(
                    topic_name__iexact=topic.name, is_active=True
                ).first()
            except Topic.DoesNotExist:
                pass

        if not kb:
            return Response({'exists': False}, status=status.HTTP_200_OK)

        data = TopicKnowledgeSerializer(kb).data
        data['exists'] = True
        return Response(data)

    def patch(self, request, topic_id):
        if not request.user.is_staff:
            return Response({'error': 'Admin only'}, status=status.HTTP_403_FORBIDDEN)

        import hashlib
        import json
        from .models import TopicKnowledge

        kb = TopicKnowledge.objects.filter(topic_id=topic_id, is_active=True).first()
        if not kb:
            try:
                topic = Topic.objects.get(id=topic_id)
                kb = TopicKnowledge.objects.filter(
                    topic_name__iexact=topic.name, is_active=True
                ).first()
            except Topic.DoesNotExist:
                pass

        if not kb:
            return Response({'error': 'No KB entry found for this topic'}, status=status.HTTP_404_NOT_FOUND)

        # Update editable fields
        changed = False
        for field in ['what_it_is', 'what_you_will_learn', 'subtopics',
                       'validation_keywords', 'benchmark_hours', 'difficulty']:
            if field in request.data:
                setattr(kb, field, request.data[field])
                changed = True

        if changed:
            # Recompute version hash
            content = json.dumps({
                'what_it_is': kb.what_it_is,
                'what_you_will_learn': kb.what_you_will_learn,
                'subtopics': kb.subtopics,
                'validation_keywords': kb.validation_keywords,
            }, sort_keys=True)
            kb.version_hash = hashlib.sha256(content.encode()).hexdigest()[:16]
            kb.version += 1
            kb.save()

            # Re-index in ChromaDB (single document)
            try:
                from apps.entries.rag_engine import RAGEngine
                rag = RAGEngine.get_instance()
                rag.build_topic_index_single(kb)
                logger.info(f"Re-indexed KB for topic '{kb.topic_name}' in ChromaDB")
            except Exception as e:
                logger.warning(f"ChromaDB re-index failed for '{kb.topic_name}': {e}")

        from .serializers import TopicKnowledgeSerializer
        data = TopicKnowledgeSerializer(kb).data
        data['exists'] = True
        return Response(data)


# ─── Dynamic Baseline Hours ────────────────────────────────────────

def get_baseline_hours(topic_id: int) -> dict:
    """
    Three-tier fallback for topic baseline hours.
    Returns dict with value and source for transparency.
    """
    from .models import LearnerTopicMastery, Topic, TopicResource

    # Priority 1: Avg from completed learners (≥3)
    completions = list(
        LearnerTopicMastery.objects.filter(
            topic_id=topic_id, current_progress__gte=100
        ).values_list('total_hours', flat=True)
    )

    if len(completions) >= 3:
        avg = round(sum(float(h) for h in completions) / len(completions), 1)
        return {'hours': avg, 'source': 'avg_completion', 'sample_size': len(completions)}

    # Priority 2: Avg resource duration
    durations = list(
        TopicResource.objects.filter(
            topic_id=topic_id, is_active=True, duration_minutes__gt=0
        ).values_list('duration_minutes', flat=True)
    )

    if durations:
        avg_minutes = sum(durations) / len(durations)
        avg_hours = round(avg_minutes / 60, 1)
        return {'hours': avg_hours, 'source': 'resource_duration', 'sample_size': len(durations)}

    # Priority 3: Template default
    try:
        topic = Topic.objects.get(id=topic_id)
        return {'hours': float(topic.benchmark_hours or 3.0), 'source': 'template', 'sample_size': 0}
    except Topic.DoesNotExist:
        return {'hours': 3.0, 'source': 'default', 'sample_size': 0}


# ─── Generation Triggers ───────────────────────────────────────────

class GenerateResourcesView(APIView):
    """
    POST /api/topics/resources/generate/ — Trigger YouTube resource generation
    Body: { "plan_id": 162 } or { "topic_id": 45 }
    """
    permission_classes = [IsAdmin]

    def post(self, request):
        plan_id = request.data.get('plan_id')
        topic_id = request.data.get('topic_id')

        if not plan_id and not topic_id:
            return Response(
                {'error': 'Provide plan_id or topic_id'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .tasks import generate_resources_task
        force = request.data.get('force', False)
        task = generate_resources_task.delay(
            plan_id=plan_id,
            topic_id=topic_id,
            force=bool(force),
        )

        return Response({
            'task_id': task.id,
            'status': 'queued',
            'message': 'Resource generation started',
        })


class GenerateKnowledgeView(APIView):
    """
    POST /api/topics/knowledge/generate/ — Trigger KB generation
    Body: { "plan_id": 162 } or { "topic_id": 45 }
    """
    permission_classes = [IsAdmin]

    def post(self, request):
        plan_id = request.data.get('plan_id')
        topic_id = request.data.get('topic_id')

        if not plan_id and not topic_id:
            return Response(
                {'error': 'Provide plan_id or topic_id'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .tasks import generate_knowledge_task
        task = generate_knowledge_task.delay(
            plan_id=plan_id,
            topic_id=topic_id,
        )

        return Response({
            'task_id': task.id,
            'status': 'queued',
            'message': 'KB generation started',
        })


class GenerationStatusView(APIView):
    """
    GET /api/topics/generation/status/<task_id>/ — Poll task progress
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        from celery.result import AsyncResult

        result = AsyncResult(task_id)
        response = {
            'task_id': task_id,
            'status': result.status,
        }

        if result.ready():
            if result.successful():
                response['result'] = result.result
            else:
                response['error'] = str(result.result)
        elif result.info and isinstance(result.info, dict):
            # Progress updates from task
            response['progress'] = result.info

        return Response(response)

