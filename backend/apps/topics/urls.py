"""
URL routes for Topics API
"""
from django.urls import path
from .views import TopicListCreateView, TopicDetailView

urlpatterns = [
    path('', TopicListCreateView.as_view(), name='topic-list-create'),
    path('<int:pk>/', TopicDetailView.as_view(), name='topic-detail'),
]
