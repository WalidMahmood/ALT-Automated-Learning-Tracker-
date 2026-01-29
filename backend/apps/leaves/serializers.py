from rest_framework import serializers
from .models import LeaveRequest
from django.db.models import Q

class LeaveRequestSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_name = serializers.CharField(source='user.name', read_only=True)

    class Meta:
        model = LeaveRequest
        fields = [
            'id', 'user', 'user_email', 'user_name', 
            'start_date', 'end_date', 'status', 
            'admin_id', 'admin_comment', 
            'requested_at', 'reviewed_at'
        ]
        read_only_fields = ['id', 'user', 'status', 'admin_id', 'requested_at', 'reviewed_at']

    def validate(self, data):
        """
        Validate that end_date is after start_date and no overlap exists.
        """
        start_date = data.get('start_date')
        end_date = data.get('end_date')

        # If updating, fall back to instance values if not provided
        if self.instance:
            if not start_date:
                start_date = self.instance.start_date
            if not end_date:
                end_date = self.instance.end_date

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError("End date must be after or same as start date.")

        # Check for overlaps for the same user
        user = self.context['request'].user
        
        # When updating (admin rejecting), we exclude the current instance
        request_id = self.instance.id if self.instance else None
        
        overlap_query = LeaveRequest.objects.filter(
            user=user,
            status='approved'
        ).filter(
            Q(start_date__lte=end_date) & Q(end_date__gte=start_date)
        )
        
        if request_id:
            overlap_query = overlap_query.exclude(id=request_id)
            
        if overlap_query.exists():
            raise serializers.ValidationError("This date range overlaps with an existing leave.")

        return data
