from rest_framework import serializers
from .models import AuditLog

class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    target_entity = serializers.SerializerMethodField()
    
    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'user_email', 'action', 
            'entity_type', 'entity_id', 'status', 
            'metadata', 'request_id', 'created_at',
            'before_state', 'after_state', 'target_entity'
        ]
        read_only_fields = fields
    
    def get_target_entity(self, obj):
        """
        Extract the target user/entity from the state data.
        Returns human-readable name or "N/A" if not applicable.
        """
        try:
            # For PlanAssignment: show assigned user
            if obj.entity_type == 'PlanAssignment':
                state = obj.after_state or obj.before_state
                if state and 'user' in state:
                    try:
                        from apps.users.models import User
                        user = User.objects.get(id=state['user'])
                        return user.email
                    except User.DoesNotExist:
                        return f"User ID {state['user']}"
                    except Exception as e:
                        print(f"[AUDIT] Error getting user for PlanAssignment: {e}")
                        return f"User ID {state.get('user', 'unknown')}"
            
            # For LeaveRequest: show requester
            elif obj.entity_type == 'LeaveRequest':
                state = obj.after_state or obj.before_state
                if state and 'user' in state:
                    try:
                        from apps.users.models import User
                        user = User.objects.get(id=state['user'])
                        return user.email
                    except User.DoesNotExist:
                        return f"User ID {state['user']}"
                    except Exception as e:
                        print(f"[AUDIT] Error getting user for LeaveRequest: {e}")
                        return f"User ID {state.get('user', 'unknown')}"
            
            # For Entry: show entry owner
            elif obj.entity_type == 'Entry':
                state = obj.after_state or obj.before_state
                if state and 'user' in state:
                    try:
                        from apps.users.models import User
                        user = User.objects.get(id=state['user'])
                        return user.email
                    except User.DoesNotExist:
                        return f"User ID {state['user']}"
                    except Exception as e:
                        print(f"[AUDIT] Error getting user for Entry: {e}")
                        return f"User ID {state.get('user', 'unknown')}"
            
            # For User operations: show the user themselves
            elif obj.entity_type == 'User':
                state = obj.after_state or obj.before_state
                if state and 'email' in state:
                    return state['email']
            
            # For Topic/TrainingPlan: not user-specific
            return "N/A"
        except Exception as e:
            print(f"[AUDIT] Unexpected error in get_target_entity: {e}")
            return "N/A"
