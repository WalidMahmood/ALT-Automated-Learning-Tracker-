"""
API Views for user authentication and profile management
"""
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework_simplejwt.exceptions import TokenError

from .models import User
from .serializers import (
    LoginSerializer,
    UserSerializer,
    UserProfileSerializer,
    TokenSerializer,
)
from .permissions import IsAdmin, IsOwnerOrAdmin


class LoginView(APIView):
    """
    POST /api/users/auth/login/
    User login - returns JWT tokens and user profile
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        
        user = serializer.validated_data['user']
        
        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        
        # Return tokens and user profile
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
        }, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    POST /api/users/auth/logout/
    User logout - blacklist refresh token
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return Response(
                    {'error': 'Refresh token is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            token = RefreshToken(refresh_token)
            token.blacklist()
            
            return Response(
                {'message': 'Logged out successfully'},
                status=status.HTTP_200_OK
            )
        except TokenError as e:
            return Response(
                {'error': 'Invalid or expired token'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class UserProfileView(generics.RetrieveUpdateAPIView):
    """
    GET/PUT /api/users/profile/
    Get or update current user profile
    """
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]
    
    def get_object(self):
        return self.request.user


class UserListCreateView(generics.ListCreateAPIView):
    """
    GET /api/users/ - List all users (admin only)
    POST /api/users/ - Create new user (admin only)
    """
    queryset = User.objects.filter(is_active=True)
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
    
    def get_queryset(self):
        """Filter active users, optionally by role"""
        queryset = User.objects.filter(is_active=True)
        role = self.request.query_params.get('role', None)
        if role in ['learner', 'admin']:
            queryset = queryset.filter(role=role)
        return queryset.order_by('-created_at')


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PUT/DELETE /api/users/<id>/
    Retrieve, update, or soft-delete a user (admin only)
    """
    queryset = User.objects.filter(is_active=True)
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
    
    def perform_destroy(self, instance):
        """Soft delete user instead of hard delete"""
        instance.soft_delete()
