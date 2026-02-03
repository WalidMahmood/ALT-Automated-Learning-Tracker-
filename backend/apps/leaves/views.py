from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import LeaveRequest
from .serializers import LeaveRequestSerializer

class LeaveRequestViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return LeaveRequest.objects.exclude(status='cancelled')
        return LeaveRequest.objects.filter(user=user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, status='approved')

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def reject(self, request, pk=None):
        if request.user.role != 'admin':
            return Response({"detail": "Only admins can reject leaves."}, status=status.HTTP_403_FORBIDDEN)
        
        leave = self.get_object()
        # before_state = get_state(leave) # Assuming get_state exists or likely not needed for this replacement scope
        comment = request.data.get('admin_comment')
        
        if not comment:
            return Response({"admin_comment": "This field is mandatory for rejection."}, status=status.HTTP_400_BAD_REQUEST)
        
        leave.status = 'rejected'
        leave.admin_id = request.user
        leave.admin_comment = comment
        leave.reviewed_at = timezone.now()
        leave.save()
        
        return Response(self.get_serializer(leave).data)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def cancel(self, request, pk=None):
        leave = self.get_object()
        if leave.user != request.user:
            return Response({"detail": "You can only cancel your own leaves."}, status=status.HTTP_403_FORBIDDEN)
        
        if leave.status != 'approved':
            return Response({"detail": "Only approved leaves can be cancelled."}, status=status.HTTP_400_BAD_REQUEST)

        leave.status = 'cancelled'
        leave.save()
        
        return Response(self.get_serializer(leave).data)
