"""
URL patterns for users app
"""
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    LoginView,
    LogoutView,
    UserProfileView,
    UserListCreateView,
    UserDetailView,
)

app_name = 'users'

urlpatterns = [
    # Authentication endpoints
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    
    # User profile
    path('profile/', UserProfileView.as_view(), name='user_profile'),
    
    # User management (admin only)
    path('', UserListCreateView.as_view(), name='user_list_create'),
    path('<int:pk>/', UserDetailView.as_view(), name='user_detail'),
]
