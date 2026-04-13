from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Count, Max, Q, Sum
from django_filters.rest_framework import DjangoFilterBackend
from .models import Entry, Project, ProjectAssignment, ProjectFeature
from .serializers import (
    EntrySerializer, ProjectSerializer, ProjectDetailSerializer,
    ProjectAssignmentSerializer, ProjectFeatureSerializer,
)
from .pagination import StandardResultsSetPagination


class ProjectViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for Projects.
    - Admins: Create, edit, delete, assign users, see all projects.
    - Learners: See only assigned projects, can edit description only.
    """
    serializer_class = ProjectSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_fields = ['is_completed', 'is_active']
    ordering_fields = ['updated_at', 'created_at', 'name']
    search_fields = ['name']

    def get_queryset(self):
        user = self.request.user
        queryset = Project.objects.filter(is_active=True).select_related(
            'created_by'
        ).prefetch_related(
            'assignments__user',
            'entries',
            'features',
        )
        if user.role == 'admin':
            return queryset
        # Learners see only projects they are assigned to
        return queryset.filter(
            assignments__user=user,
        ).distinct()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ProjectDetailSerializer
        return ProjectSerializer

    def perform_create(self, serializer):
        """Only admins can create projects."""
        if self.request.user.role != 'admin':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only admins can create projects.")
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        """
        Admins can update all fields.
        Learners can only update the description (scope updates).
        """
        user = self.request.user
        if user.role != 'admin':
            # Learners can only update description
            allowed_fields = {'description', 'key_modules', 'out_of_scope', 'tech_stack', 'success_criteria'}
            update_fields = set(serializer.validated_data.keys())
            disallowed = update_fields - allowed_fields
            if disallowed:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied(
                    f"Learners can only update project description. Cannot update: {', '.join(disallowed)}"
                )
        serializer.save()

    def perform_destroy(self, instance):
        """Only admins can delete projects. Soft delete."""
        if self.request.user.role != 'admin':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only admins can delete projects.")
        instance.soft_delete()

    @action(detail=True, methods=['patch'])
    def toggle_complete(self, request, pk=None):
        """Toggle project completion status. Admin only."""
        if request.user.role != 'admin':
            return Response({'error': 'Admin only'}, status=status.HTTP_403_FORBIDDEN)
        project = self.get_object()
        project.is_completed = not project.is_completed
        project.save()
        return Response(ProjectSerializer(project).data)

    @action(detail=True, methods=['post'])
    def assign_users(self, request, pk=None):
        """
        Admin endpoint: Assign users to a project with roles.
        Expects: { "user_ids": [1, 2, 3], "roles": { "1": "backend", "2": "frontend" } }
        Replaces all current assignments with the new list.
        """
        if request.user.role != 'admin':
            return Response({'error': 'Admin only'}, status=status.HTTP_403_FORBIDDEN)

        project = self.get_object()
        user_ids = request.data.get('user_ids', [])
        roles = request.data.get('roles', {})  # { user_id: role_string }

        if not isinstance(user_ids, list):
            return Response(
                {'error': 'user_ids must be a list'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.users.models import User
        # Validate all user IDs exist
        users = User.objects.filter(id__in=user_ids, is_active=True)
        if users.count() != len(user_ids):
            return Response(
                {'error': 'Some user IDs are invalid or inactive'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Remove existing assignments not in the new list
        project.assignments.exclude(user_id__in=user_ids).delete()

        # Create or update assignments with roles
        for user in users:
            user_role = roles.get(str(user.id), 'general')
            assignment, created = ProjectAssignment.objects.get_or_create(
                project=project,
                user=user,
                defaults={'assigned_by': request.user, 'role': user_role},
            )
            # Update role on existing assignment
            if not created and assignment.role != user_role:
                assignment.role = user_role
                assignment.save(update_fields=['role'])

        return Response(ProjectSerializer(project).data)

    @action(detail=True, methods=['post'])
    def manage_features(self, request, pk=None):
        """
        Bulk sync features for a project.
        Accessible by Admins, or assigned users (filtered via get_queryset).
        Expects: { "features": [ { "name": "...", "description": "...", "success_criteria": "...", "out_of_scope": [...] }, ... ] }
        """
        project = self.get_object()
        features_data = request.data.get('features', [])

        if not isinstance(features_data, list):
            return Response({'error': 'features must be a list'}, status=status.HTTP_400_BAD_REQUEST)

        # Track which feature names are in the new list
        incoming_names = set()
        for feat_data in features_data:
            name = feat_data.get('name', '').strip()
            if not name:
                continue
            incoming_names.add(name)
            feature, created = ProjectFeature.objects.get_or_create(
                project=project, name=name,
                defaults={
                    'description': feat_data.get('description', ''),
                    'success_criteria': feat_data.get('success_criteria', ''),
                    'out_of_scope': feat_data.get('out_of_scope', []),
                }
            )
            if not created:
                feature.description = feat_data.get('description', feature.description)
                feature.success_criteria = feat_data.get('success_criteria', feature.success_criteria)
                feature.out_of_scope = feat_data.get('out_of_scope', feature.out_of_scope)
                feature.save()

        # Remove features not in the new list
        ProjectFeature.objects.filter(project=project).exclude(name__in=incoming_names).delete()

        # Sync key_modules for backwards compat
        project.key_modules = list(incoming_names)
        project.save(update_fields=['key_modules'])

        return Response(ProjectSerializer(project).data)

    @action(detail=True, methods=['post'])
    def remove_user(self, request, pk=None):
        """Admin endpoint: Remove a single user from a project."""
        if request.user.role != 'admin':
            return Response({'error': 'Admin only'}, status=status.HTTP_403_FORBIDDEN)

        project = self.get_object()
        user_id = request.data.get('user_id')

        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        deleted_count, _ = ProjectAssignment.objects.filter(
            project=project,
            user_id=user_id,
        ).delete()

        if deleted_count == 0:
            return Response({'error': 'User not assigned to this project'}, status=status.HTTP_404_NOT_FOUND)

        return Response(ProjectSerializer(project).data)

    @action(detail=False, methods=['get'])
    def all_projects(self, request):
        """Admin endpoint: all projects across all users with stats. 
        Supports pagination via ?page=1&page_size=20
        """
        if request.user.role != 'admin':
            return Response({'error': 'Admin only'}, status=status.HTTP_403_FORBIDDEN)
        
        qs = Project.objects.filter(is_active=True).select_related(
            'created_by'
        ).prefetch_related(
            'assignments__user',
            'entries',
            'features',
        )
        
        # Optional filters
        user_id = request.query_params.get('user')
        is_completed = request.query_params.get('is_completed')
        search = request.query_params.get('search')
        
        if user_id:
            qs = qs.filter(assignments__user_id=user_id)
        if is_completed is not None:
            qs = qs.filter(is_completed=is_completed.lower() == 'true')
        if search:
            qs = qs.filter(name__icontains=search)
        
        qs = qs.distinct().order_by('-updated_at')
        
        # Use pagination
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = ProjectSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = ProjectSerializer(qs, many=True)
        return Response(serializer.data)


class EntryViewSet(viewsets.ModelViewSet):
    queryset = Entry.objects.filter(is_active=True)
    serializer_class = EntrySerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['date', 'topic', 'user', 'status', 'project', 'intent']
    ordering_fields = ['date', 'created_at']

    def get_queryset(self):
        user = self.request.user
        queryset = Entry.objects.filter(is_active=True)
        
        if user.role == 'admin':
            return queryset.select_related(
                'user', 'topic', 'topic__parent', 'project', 'project__created_by'
            ).prefetch_related(
                'project__assignments__user',
                'project__entries',
                'project__features',
            ).order_by('-created_at')
        return queryset.filter(user=user).select_related(
            'topic', 'topic__parent', 'project', 'project__created_by'
        ).prefetch_related(
            'project__assignments__user',
            'project__entries',
            'project__features',
        ).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        instance.soft_delete()

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def user_projects(self, request):
        """Return the authenticated user's assigned projects."""
        user = request.user
        # Get projects assigned to this user
        assigned_project_ids = ProjectAssignment.objects.filter(
            user=user,
        ).values_list('project_id', flat=True)
        projects = Project.objects.filter(
            id__in=assigned_project_ids,
            is_active=True,
        ).select_related('created_by').prefetch_related(
            'assignments__user',
            'entries',
            'features',
        ).order_by('-updated_at')
        serializer = ProjectSerializer(projects, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def override(self, request, pk=None):
        """Admin override for AI decision"""
        entry = self.get_object()
        user = request.user
        
        # Only admins can override
        if user.role != 'admin':
            return Response(
                {'error': 'Only admins can override entries'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        new_status = request.data.get('status')
        reason = request.data.get('reason')
        comment = request.data.get('comment', '')
        
        if not new_status or not reason:
            return Response(
                {'error': 'Status and reason are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update entry
        entry.status = new_status
        entry.admin = user
        entry.admin_override = True
        entry.override_reason = reason
        entry.override_comment = comment
        entry.override_at = timezone.now()
        entry.save()
        
        serializer = self.get_serializer(entry)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def topic_summary(self, request):
        """
        Server-side paginated topic summary for admin dashboard Entries Summary table.
        Returns root topics with aggregated entry counts, user counts, flagged counts, hours.
        Supports: ?page=1&page_size=10&search=&sort=name&order=asc&min_entries=0&flagged=all
        """
        if request.user.role != 'admin':
            return Response({'error': 'Admin only'}, status=status.HTTP_403_FORBIDDEN)

        from apps.topics.models import Topic

        # Step 1: Build root lookup (topic_id -> root_id) in memory
        all_topics = list(
            Topic.objects.filter(is_active=True).values_list('id', 'parent_id', 'name', 'created_at')
        )
        parent_map = {}
        topic_names = {}
        topic_created = {}
        for tid, pid, name, created_at in all_topics:
            parent_map[tid] = pid
            topic_names[tid] = name
            topic_created[tid] = created_at

        root_cache = {}
        def get_root(tid):
            if tid in root_cache:
                return root_cache[tid]
            chain = [tid]
            current = tid
            while parent_map.get(current) is not None:
                current = parent_map[current]
                chain.append(current)
            root = chain[-1]
            for c in chain:
                root_cache[c] = root
            return root

        # Step 2: Aggregate entries by topic_id in ONE query
        qs = Entry.objects.filter(is_active=True, topic_id__isnull=False)
        topic_agg = qs.values('topic_id').annotate(
            entry_count=Count('id'),
            total_hours=Sum('hours'),
            flagged_count=Count('id', filter=Q(status='flagged') | Q(status='rejected')),
        )

        # Step 3: Roll up to root topics
        root_totals = {}

        for row in topic_agg:
            root_id = get_root(row['topic_id'])
            if root_id not in root_totals:
                root_totals[root_id] = {
                    'id': root_id,
                    'name': topic_names.get(root_id, 'Unknown'),
                    'created_at': topic_created.get(root_id),
                    'entries': 0,
                    'hours': 0.0,
                    'flagged': 0,
                }
            root_totals[root_id]['entries'] += row['entry_count'] or 0
            root_totals[root_id]['hours'] += float(row['total_hours'] or 0)
            root_totals[root_id]['flagged'] += row['flagged_count'] or 0

        # Get accurate unique user counts per root topic
        root_user_ids = {}
        user_entries = qs.values_list('topic_id', 'user_id')
        for topic_id, user_id in user_entries:
            root_id = get_root(topic_id)
            if root_id not in root_user_ids:
                root_user_ids[root_id] = set()
            root_user_ids[root_id].add(user_id)

        for root_id in root_totals:
            root_totals[root_id]['userCount'] = len(root_user_ids.get(root_id, set()))

        # Include root topics with zero entries too
        root_topic_ids = {tid for tid, pid, _, _ in all_topics if pid is None}
        for root_id in root_topic_ids:
            if root_id not in root_totals:
                root_totals[root_id] = {
                    'id': root_id,
                    'name': topic_names.get(root_id, 'Unknown'),
                    'created_at': topic_created.get(root_id),
                    'entries': 0,
                    'hours': 0.0,
                    'flagged': 0,
                    'userCount': 0,
                }

        results = list(root_totals.values())

        # Step 5: Apply filters
        search = request.query_params.get('search', '').strip()
        if search:
            results = [r for r in results if search.lower() in r['name'].lower()]

        flagged_filter = request.query_params.get('flagged', 'all').strip().lower()
        if flagged_filter == 'has_flagged':
            results = [r for r in results if r['flagged'] > 0]
        elif flagged_filter == 'no_flagged':
            results = [r for r in results if r['flagged'] == 0]
        # else: 'all' or any other value = no filtering

        min_entries = int(request.query_params.get('min_entries', 0) or 0)
        if min_entries > 0:
            results = [r for r in results if r['entries'] >= min_entries]

        # Step 6: Sorting
        sort_key = request.query_params.get('sort', '')
        sort_order = request.query_params.get('order', 'asc')
        if sort_key and sort_key in ('name', 'entries', 'hours', 'flagged', 'userCount', 'created_at'):
            reverse = sort_order == 'desc'
            if sort_key == 'name':
                results.sort(key=lambda x: x.get('name', '').lower(), reverse=reverse)
            elif sort_key == 'created_at':
                results.sort(key=lambda x: x.get('created_at').timestamp() if x.get('created_at') else 0, reverse=reverse)
            else:
                results.sort(key=lambda x: x.get(sort_key) or 0, reverse=reverse)
        else:
            # Default: newest first - convert datetime to timestamp for comparison
            results.sort(key=lambda x: x.get('created_at').timestamp() if x.get('created_at') else 0, reverse=True)

        # Step 7: Pagination
        total = len(results)
        page_num = int(request.query_params.get('page', 1) or 1)
        page_size = int(request.query_params.get('page_size', 10) or 10)
        page_size = min(page_size, 100)
        start = (page_num - 1) * page_size
        end = start + page_size

        return Response({
            'count': total,
            'page': page_num,
            'page_size': page_size,
            'results': results[start:end],
        })

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def dashboard_stats(self, request):
        """
        Admin-only: Returns pre-computed dashboard analytics in ONE request.
        Optimized to use bulk aggregations — minimal DB round-trips.
        """
        from datetime import datetime, timedelta
        from apps.topics.models import Topic
        from apps.users.models import User
        from django.db.models import Sum, Avg, Case, When, Value, IntegerField, CharField

        if request.user.role != 'admin':
            return Response({'error': 'Admin only'}, status=status.HTTP_403_FORBIDDEN)

        qs = Entry.objects.filter(is_active=True)

        # ─── Status Counts — ONE query with conditional aggregation ───
        counts = qs.aggregate(
            total=Count('id'),
            approved=Count('id', filter=Q(status='approved')),
            flagged=Count('id', filter=Q(status='flagged') | Q(status='rejected')),
            needs_review=Count('id', filter=Q(status='pending', ai_status='analyzed')),
            processing=Count('id', filter=Q(status='pending') & ~Q(ai_status='analyzed') & ~Q(ai_status='error')),
            error_count=Count('id', filter=Q(ai_status='error')),
            total_hours=Sum('hours'),
            avg_confidence=Avg('ai_confidence', filter=Q(ai_confidence__isnull=False)),
        )
        total_learners = User.objects.filter(role='learner', is_active=True).count()

        # ─── Weekly Activity — ONE query with conditional aggregation per day ───
        today = datetime.now().date()
        day_labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        week_start = today - timedelta(days=6)

        weekly_qs = (
            qs.filter(date__gte=week_start, date__lte=today)
            .values('date')
            .annotate(
                approved_count=Count('id', filter=Q(status='approved')),
                pending_count=Count('id', filter=Q(status='pending')),
                flagged_count=Count('id', filter=Q(status='flagged') | Q(status='rejected')),
            )
        )
        # Build a lookup for fast access
        weekly_lookup = {row['date']: row for row in weekly_qs}
        weekly = []
        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            row = weekly_lookup.get(d, {})
            weekly.append({
                'date': d.isoformat(),
                'label': day_labels[d.weekday()],
                'approved': row.get('approved_count', 0),
                'pending': row.get('pending_count', 0),
                'flagged': row.get('flagged_count', 0),
            })

        # ─── Top Topics — ONE query: aggregate by topic, then roll up in Python ───
        # Step 1: Load all topics into memory (lightweight)
        all_topics = list(Topic.objects.filter(is_active=True).values_list('id', 'parent_id', 'name'))
        parent_map = {}  # topic_id -> parent_id
        topic_names = {}
        for tid, pid, name in all_topics:
            parent_map[tid] = pid
            topic_names[tid] = name

        # Step 2: Build root lookup — for each topic, find its root ancestor
        root_cache = {}
        def get_root(tid):
            if tid in root_cache:
                return root_cache[tid]
            chain = [tid]
            current = tid
            while parent_map.get(current) is not None:
                current = parent_map[current]
                chain.append(current)
            root = chain[-1]
            for c in chain:
                root_cache[c] = root
            return root

        # Step 3: ONE aggregate query — group by topic_id
        topic_agg = (
            qs.filter(topic_id__isnull=False)
            .values('topic_id')
            .annotate(
                total_hours=Sum('hours'),
                entry_count=Count('id'),
            )
        )

        # Step 4: Roll up to root topics in Python
        root_totals = {}
        for row in topic_agg:
            root_id = get_root(row['topic_id'])
            if root_id not in root_totals:
                root_totals[root_id] = {'name': topic_names.get(root_id, 'Unknown'), 'hours': 0.0, 'entries': 0}
            root_totals[root_id]['hours'] += float(row['total_hours'] or 0)
            root_totals[root_id]['entries'] += row['entry_count'] or 0

        top_topics = sorted(root_totals.values(), key=lambda x: x['hours'], reverse=True)[:8]

        # ─── Pending Leaves — ONE query ───
        from apps.leaves.models import LeaveRequest
        pending_leaves = LeaveRequest.objects.filter(status='approved').count()

        return Response({
            'counts': {
                'total': counts['total'] or 0,
                'approved': counts['approved'] or 0,
                'flagged': counts['flagged'] or 0,
                'needsReview': counts['needs_review'] or 0,
                'processing': counts['processing'] or 0,
                'error': counts['error_count'] or 0,
                'totalHours': float(counts['total_hours'] or 0),
                'totalLearners': total_learners,
                'pendingLeaves': pending_leaves,
            },
            'avgConfidence': round(float(counts['avg_confidence'] or 0), 1),
            'weeklyActivity': weekly,
            'topTopics': top_topics,
        })
