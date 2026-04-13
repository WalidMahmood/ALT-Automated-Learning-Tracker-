"""
URL routes for Topics API
"""
from django.urls import path
from .views import (
    TopicListCreateView,
    TopicDetailView,
    TopicResourceListCreateView,
    TopicResourceDetailView,
    TopicKnowledgeView,
    GenerateResourcesView,
    GenerateKnowledgeView,
    GenerationStatusView,
)

urlpatterns = [
    path('', TopicListCreateView.as_view(), name='topic-list-create'),
    path('<int:pk>/', TopicDetailView.as_view(), name='topic-detail'),

    # Topic Resources (YouTube videos) — on-demand
    path('<int:topic_id>/resources/', TopicResourceListCreateView.as_view(), name='topic-resources'),
    path('resources/<int:pk>/', TopicResourceDetailView.as_view(), name='topic-resource-detail'),

    # Topic Knowledge (KB) — view/edit
    path('knowledge/<int:topic_id>/', TopicKnowledgeView.as_view(), name='topic-knowledge'),

    # Generation triggers (Celery tasks)
    path('resources/generate/', GenerateResourcesView.as_view(), name='generate-resources'),
    path('knowledge/generate/', GenerateKnowledgeView.as_view(), name='generate-knowledge'),
    path('generation/status/<str:task_id>/', GenerationStatusView.as_view(), name='generation-status'),
]
