"""
URL routes for Training Plans API
"""
from django.urls import path
from .views import (
    TrainingPlanListCreateView,
    TrainingPlanDetailView,
    TrainingPlanRestoreView,
    TrainingPlanAssignView,
    UserAssignmentsView,
)

urlpatterns = [
    path('', TrainingPlanListCreateView.as_view(), name='training-plan-list-create'),
    path('<int:pk>/', TrainingPlanDetailView.as_view(), name='training-plan-detail'),
    path('<int:pk>/restore/', TrainingPlanRestoreView.as_view(), name='training-plan-restore'),
    path('<int:pk>/assign/', TrainingPlanAssignView.as_view(), name='training-plan-assign'),
    path('assignments/my_assignments/', UserAssignmentsView.as_view(), name='my-assignments'),
]
