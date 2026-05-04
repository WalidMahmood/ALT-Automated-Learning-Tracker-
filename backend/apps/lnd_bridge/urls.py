"""
URL Configuration for LND Bridge

All endpoints under /api/lnd-bridge/
"""
from django.urls import path
from . import views

urlpatterns = [
    # ERP Employee Bridge
    path('erp-employees/', views.erp_employees_view, name='lnd_bridge_erp_employees'),
    path('create-from-erp/', views.create_user_from_erp_view, name='lnd_bridge_create_from_erp'),

    # LMS Course Bridge
    path('lms-courses/', views.lms_courses_view, name='lnd_bridge_lms_courses'),
    path('lms-progress/<str:employee_id>/', views.lms_user_progress_view, name='lnd_bridge_lms_progress'),

    # Health Check
    path('health/', views.health_view, name='lnd_bridge_health'),

    # Training Plan Approval Workflow
    path('plan-requests/', views.plan_requests_view, name='lnd_bridge_plan_requests'),
    path('plan-requests/<int:pk>/pm-review/', views.plan_request_pm_review_view, name='lnd_bridge_pm_review'),
    path('plan-requests/<int:pk>/lnd-review/', views.plan_request_lnd_review_view, name='lnd_bridge_lnd_review'),
]
