"""
API Views for Topic management
"""
import logging
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Topic
from .serializers import TopicSerializer, TopicCreateUpdateSerializer
from apps.users.permissions import IsAdmin

logger = logging.getLogger(__name__)


class TopicListCreateView(generics.ListCreateAPIView):
    """
    GET /api/topics/ - List all active topics
    POST /api/topics/ - Create new topic (admin only)
    """
    
    pagination_class = None
    
    def get_queryset(self):
        """Return only active topics"""
        return Topic.objects.filter(is_active=True).select_related('parent').order_by('name').distinct()
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return TopicCreateUpdateSerializer
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
            TopicSerializer(topic).data,
            status=status.HTTP_201_CREATED
        )


class TopicDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET /api/topics/<id>/ - Get single topic
    PUT /api/topics/<id>/ - Update topic (admin only)
    DELETE /api/topics/<id>/ - Soft delete topic (admin only)
    """
    
    def get_queryset(self):
        return Topic.objects.filter(is_active=True).select_related('parent')
    
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
        return Response(TopicSerializer(topic).data)
    
    def destroy(self, request, *args, **kwargs):
        """Soft delete - set is_active to False"""
        instance = self.get_object()
        instance.soft_delete()
        logger.info(f"Topic soft deleted: {instance.name} (ID: {instance.id})")
        return Response(
            {'message': 'Topic deleted successfully'},
            status=status.HTTP_200_OK
        )
