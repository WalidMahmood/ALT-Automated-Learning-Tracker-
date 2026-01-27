"""
User serializers for authentication and profile management
"""
from rest_framework import serializers
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model - full profile"""
    
    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'github_url',
            'expertise_level',
            'experience_years',
            'tech_stack',
            'role',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_email(self, value):
        """Validate email domain"""
        if not value.endswith('@brainstation-23.com'):
            raise serializers.ValidationError(
                'Email must be @brainstation-23.com domain'
            )
        return value


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new users (admin only)"""
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        min_length=12,
        help_text='Password must be at least 12 characters'
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        help_text='Confirm password'
    )
    
    class Meta:
        model = User
        fields = [
            'email',
            'password',
            'password_confirm',
            'github_url',
            'expertise_level',
            'experience_years',
            'tech_stack',
            'role',
        ]
    
    def validate_email(self, value):
        """Validate email domain"""
        if not value.endswith('@brainstation-23.com'):
            raise serializers.ValidationError(
                'Email must be @brainstation-23.com domain'
            )
        return value
    
    def validate(self, attrs):
        """Validate passwords match"""
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({
                'password_confirm': 'Passwords do not match'
            })
        return attrs
    
    def create(self, validated_data):
        """Create user with hashed password"""
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User.objects.create_user(password=password, **validated_data)
        return user


class LoginSerializer(serializers.Serializer):
    """Serializer for user login"""
    email = serializers.EmailField(required=True)
    password = serializers.CharField(
        required=True,
        write_only=True,
        style={'input_type': 'password'}
    )
    
    def validate(self, attrs):
        """Validate credentials and return user"""
        email = attrs.get('email')
        password = attrs.get('password')
        
        # Validate email domain
        if not email.endswith('@brainstation-23.com'):
            raise serializers.ValidationError(
                'Email must be @brainstation-23.com domain'
            )
        
        # Authenticate user
        user = authenticate(
            request=self.context.get('request'),
            username=email,
            password=password
        )
        
        if not user:
            raise serializers.ValidationError(
                'Invalid email or password'
            )
        
        if not user.is_active:
            raise serializers.ValidationError(
                'User account is disabled'
            )
        
        attrs['user'] = user
        return attrs


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for user profile (learner can update own profile)"""
    
    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'github_url',
            'expertise_level',
            'experience_years',
            'tech_stack',
            'role',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'email', 'role', 'created_at', 'updated_at']


class TokenSerializer(serializers.Serializer):
    """Serializer for JWT tokens"""
    access = serializers.CharField()
    refresh = serializers.CharField()
    user = UserSerializer()
