"""
Custom permissions for role-based access control
"""
from rest_framework import permissions


class IsAdmin(permissions.BasePermission):
    """Permission check for admin users only"""
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == 'admin' and
            request.user.is_active
        )


class IsLearner(permissions.BasePermission):
    """Permission check for learner users only"""
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == 'learner' and
            request.user.is_active
        )


class IsOwnerOrAdmin(permissions.BasePermission):
    """Permission check for resource owner or admin"""
    
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_active
    
    def has_object_permission(self, request, view, obj):
        # Admin can access all objects
        if request.user.role == 'admin':
            return True
        
        # Users can access their own objects
        if hasattr(obj, 'user'):
            return obj.user == request.user
        
        # For User objects
        if isinstance(obj, type(request.user)):
            return obj == request.user
        
        return False
