"""
Report Queries — Pure Django ORM aggregations for report data.

No LLM calls here. Returns structured dicts ready for:
1. Frontend Recharts components (charts_data)
2. Qwen prompt context (raw_stats)
3. Direct API response (summaries)

All queries are scoped to (user_id, date_range).
"""
import logging
from datetime import date, timedelta
from collections import defaultdict

from django.db.models import (
    Sum, Count, Avg, Q, F, Case, When, Value, CharField, Min, Max,
)
from django.db.models.functions import TruncWeek

from apps.entries.models import Entry, Project, ProjectFeature, ProjectAssignment
from apps.topics.models import Topic, LearnerTopicMastery, TopicKnowledge

logger = logging.getLogger(__name__)


def get_date_range(period: str, reference_date: date = None) -> tuple[date, date]:
    """
    Compute (start, end) dates for the given period.
    - weekly: last 7 days (Mon-Sun of previous week)
    - monthly: last 30 days
    - all_time: from 2020-01-01 to today
    """
    ref = reference_date or date.today()
    if period == 'weekly':
        # Last complete week (Mon-Sun)
        end = ref - timedelta(days=ref.weekday())  # This Monday
        start = end - timedelta(days=7)  # Last Monday
        end = end - timedelta(days=1)  # Last Sunday
        # If today is Monday, we want last Mon-Sun
        # If called mid-week, still return last complete week
        if start == ref:
            # Edge case: called on Monday — shift back one more week
            start -= timedelta(days=7)
            end -= timedelta(days=7)
        return start, end
    elif period == 'monthly':
        end = ref
        start = ref - timedelta(days=30)
        return start, end
    else:  # all_time
        return date(2020, 1, 1), ref


def get_lnd_summary(user_id: int, start: date, end: date) -> dict:
    """
    Learning & Development summary for the user in the date range.
    
    Returns: {
        total_hours, total_entries, 
        approved_count, pending_count, rejected_count, approval_rate,
        topics_worked: [{name, hours, entries, coverage_pct, is_completed}],
        topics_completed_count, topics_in_progress_count,
    }
    """
    entries = Entry.objects.filter(
        user_id=user_id,
        intent='lnd_tasks',
        is_active=True,
        date__gte=start,
        date__lte=end,
    )

    # Aggregate counts
    agg = entries.aggregate(
        total_hours=Sum('hours'),
        total_entries=Count('id'),
        approved=Count('id', filter=Q(status='approved')),
        pending=Count('id', filter=Q(status='pending')),
        rejected=Count('id', filter=Q(status='rejected') | Q(status='flagged')),
    )

    total = agg['total_entries'] or 0
    approved = agg['approved'] or 0

    # Per-topic breakdown
    topic_data = (
        entries.filter(topic_id__isnull=False)
        .values('topic_id', 'topic__name')
        .annotate(
            total_hours=Sum('hours'),
            entry_count=Count('id'),
        )
        .order_by('-total_hours')
    )

    # Enrich with mastery and benchmark data
    topics_worked = []
    for row in topic_data:
        topic_id = row['topic_id']
        mastery = LearnerTopicMastery.objects.filter(
            user_id=user_id, topic_id=topic_id
        ).first()

        # Get benchmark hours from TopicKnowledge
        tk = TopicKnowledge.objects.filter(topic_id=topic_id).first()
        benchmark = float(tk.benchmark_hours) if tk and tk.benchmark_hours else 0

        topics_worked.append({
            'name': row['topic__name'],
            'hours': round(float(row['total_hours'] or 0), 1),
            'entries': row['entry_count'],
            'coverage_pct': round(float(mastery.current_progress or 0), 0) if mastery else 0,
            'is_completed': mastery.is_locked if mastery else False,
            'benchmark_hours': benchmark,
        })

    completed_count = sum(1 for t in topics_worked if t['is_completed'])
    in_progress_count = sum(1 for t in topics_worked if not t['is_completed'])

    return {
        'total_hours': round(float(agg['total_hours'] or 0), 1),
        'total_entries': total,
        'approved_count': approved,
        'pending_count': agg['pending'] or 0,
        'rejected_count': agg['rejected'] or 0,
        'approval_rate': round(approved / total * 100, 1) if total > 0 else 0,
        'topics_worked': topics_worked,
        'topics_completed_count': completed_count,
        'topics_in_progress_count': in_progress_count,
    }


def get_sbu_summary(user_id: int, start: date, end: date) -> dict:
    """
    SBU (Project) work summary for the user in the date range.
    
    Returns: {
        total_hours, total_entries, approval_rate,
        projects_worked: [{name, hours, entries, features_done, features_total}],
    }
    """
    entries = Entry.objects.filter(
        user_id=user_id,
        intent='sbu_tasks',
        is_active=True,
        date__gte=start,
        date__lte=end,
    )

    agg = entries.aggregate(
        total_hours=Sum('hours'),
        total_entries=Count('id'),
        approved=Count('id', filter=Q(status='approved')),
    )

    total = agg['total_entries'] or 0
    approved = agg['approved'] or 0

    # Per-project breakdown
    project_data = (
        entries.filter(project_id__isnull=False)
        .values('project_id', 'project__name')
        .annotate(
            total_hours=Sum('hours'),
            entry_count=Count('id'),
        )
        .order_by('-total_hours')
    )

    projects_worked = []
    for row in project_data:
        project_id = row['project_id']
        features_total = ProjectFeature.objects.filter(project_id=project_id).count()
        features_done = ProjectFeature.objects.filter(
            project_id=project_id, status='completed'
        ).count()

        projects_worked.append({
            'name': row['project__name'],
            'hours': round(float(row['total_hours'] or 0), 1),
            'entries': row['entry_count'],
            'features_done': features_done,
            'features_total': features_total,
        })

    return {
        'total_hours': round(float(agg['total_hours'] or 0), 1),
        'total_entries': total,
        'approved_count': approved,
        'approval_rate': round(approved / total * 100, 1) if total > 0 else 0,
        'projects_worked': projects_worked,
    }


def get_charts_data(user_id: int, start: date, end: date) -> dict:
    """
    Structured data for frontend Recharts components.
    
    Returns: {
        time_breakdown: {lnd_hours, sbu_hours},
        daily_activity: [{date, hours, lnd_hours, sbu_hours, entries}],
        topic_progress: [{name, coverage_pct, hours, benchmark_hours}],
        approval_donut: {approved, pending, rejected, flagged},
        weekly_trend: [{week, hours, entries}],
    }
    """
    entries = Entry.objects.filter(
        user_id=user_id,
        is_active=True,
        date__gte=start,
        date__lte=end,
    )

    # 1. Time breakdown (LND vs SBU)
    breakdown = entries.values('intent').annotate(total_hours=Sum('hours'))
    time_breakdown = {'lnd_hours': 0, 'sbu_hours': 0}
    for row in breakdown:
        if row['intent'] == 'lnd_tasks':
            time_breakdown['lnd_hours'] = round(float(row['total_hours'] or 0), 1)
        elif row['intent'] == 'sbu_tasks':
            time_breakdown['sbu_hours'] = round(float(row['total_hours'] or 0), 1)

    # 2. Daily activity
    daily = (
        entries
        .values('date')
        .annotate(
            total_hours=Sum('hours'),
            entry_count=Count('id'),
            lnd_hours=Sum('hours', filter=Q(intent='lnd_tasks')),
            sbu_hours=Sum('hours', filter=Q(intent='sbu_tasks')),
        )
        .order_by('date')
    )
    daily_activity = [
        {
            'date': row['date'].isoformat(),
            'hours': round(float(row['total_hours'] or 0), 1),
            'lnd_hours': round(float(row['lnd_hours'] or 0), 1),
            'sbu_hours': round(float(row['sbu_hours'] or 0), 1),
            'entries': row['entry_count'],
        }
        for row in daily
    ]

    # 3. Topic progress (LND topics only)
    topic_entries = (
        entries
        .filter(intent='lnd_tasks', topic_id__isnull=False)
        .values('topic_id', 'topic__name')
        .annotate(total_hours=Sum('hours'))
        .order_by('-total_hours')[:10]
    )
    topic_progress = []
    for row in topic_entries:
        mastery = LearnerTopicMastery.objects.filter(
            user_id=user_id, topic_id=row['topic_id']
        ).first()
        tk = TopicKnowledge.objects.filter(topic_id=row['topic_id']).first()
        topic_progress.append({
            'name': row['topic__name'],
            'coverage_pct': round(float(mastery.current_progress or 0), 0) if mastery else 0,
            'hours': round(float(row['total_hours'] or 0), 1),
            'benchmark_hours': round(float(tk.benchmark_hours), 1) if tk and tk.benchmark_hours else 0,
        })

    # 4. Approval donut
    statuses = entries.values('status').annotate(count=Count('id'))
    approval_donut = {'approved': 0, 'pending': 0, 'rejected': 0, 'flagged': 0}
    for row in statuses:
        s = row['status']
        if s in approval_donut:
            approval_donut[s] = row['count']

    # 5. Weekly trend
    weekly = (
        entries
        .annotate(week=TruncWeek('date'))
        .values('week')
        .annotate(
            total_hours=Sum('hours'),
            entry_count=Count('id'),
        )
        .order_by('week')
    )
    weekly_trend = [
        {
            'week': row['week'].isoformat(),
            'hours': round(float(row['total_hours'] or 0), 1),
            'entries': row['entry_count'],
        }
        for row in weekly
    ]

    return {
        'time_breakdown': time_breakdown,
        'daily_activity': daily_activity,
        'topic_progress': topic_progress,
        'approval_donut': approval_donut,
        'weekly_trend': weekly_trend,
    }


def get_overview_stats(user_id: int, start: date, end: date) -> dict:
    """
    High-level overview stats combining LND + SBU.
    Used as quick summary in the report header.
    """
    entries = Entry.objects.filter(
        user_id=user_id,
        is_active=True,
        date__gte=start,
        date__lte=end,
    )

    agg = entries.aggregate(
        total_hours=Sum('hours'),
        total_entries=Count('id'),
        approved=Count('id', filter=Q(status='approved')),
        avg_confidence=Avg('ai_confidence', filter=Q(ai_confidence__isnull=False)),
        lnd_hours=Sum('hours', filter=Q(intent='lnd_tasks')),
        sbu_hours=Sum('hours', filter=Q(intent='sbu_tasks')),
        lnd_count=Count('id', filter=Q(intent='lnd_tasks')),
        sbu_count=Count('id', filter=Q(intent='sbu_tasks')),
    )

    total = agg['total_entries'] or 0
    approved = agg['approved'] or 0

    # Active days (days with at least one entry)
    active_days = entries.values('date').distinct().count()

    # Days in period
    days_in_period = max(1, (end - start).days + 1)

    return {
        'total_hours': round(float(agg['total_hours'] or 0), 1),
        'total_entries': total,
        'approval_rate': round(approved / total * 100, 1) if total > 0 else 0,
        'avg_confidence': round(float(agg['avg_confidence'] or 0), 1),
        'lnd_hours': round(float(agg['lnd_hours'] or 0), 1),
        'sbu_hours': round(float(agg['sbu_hours'] or 0), 1),
        'lnd_entries': agg['lnd_count'] or 0,
        'sbu_entries': agg['sbu_count'] or 0,
        'active_days': active_days,
        'days_in_period': days_in_period,
        'consistency_pct': round(active_days / days_in_period * 100, 1) if days_in_period > 0 else 0,
    }


# ──────────────────────────────────────────────────
#   TEAM-LEVEL QUERIES (aggregate across all users)
# ──────────────────────────────────────────────────

def get_team_overview(start: date, end: date) -> dict:
    """Aggregate overview stats across all non-admin users."""
    from apps.users.models import User

    entries = Entry.objects.filter(
        is_active=True,
        date__gte=start,
        date__lte=end,
        user__role='learner',
    )

    agg = entries.aggregate(
        total_hours=Sum('hours'),
        total_entries=Count('id'),
        approved=Count('id', filter=Q(status='approved')),
        avg_confidence=Avg('ai_confidence', filter=Q(ai_confidence__isnull=False)),
        lnd_hours=Sum('hours', filter=Q(intent='lnd_tasks')),
        sbu_hours=Sum('hours', filter=Q(intent='sbu_tasks')),
    )

    total = agg['total_entries'] or 0
    approved = agg['approved'] or 0
    active_users = entries.values('user_id').distinct().count()
    total_learners = User.objects.filter(role='learner', is_active=True).count()

    return {
        'total_hours': round(float(agg['total_hours'] or 0), 1),
        'total_entries': total,
        'approval_rate': round(approved / total * 100, 1) if total > 0 else 0,
        'avg_confidence': round(float(agg['avg_confidence'] or 0), 1),
        'lnd_hours': round(float(agg['lnd_hours'] or 0), 1),
        'sbu_hours': round(float(agg['sbu_hours'] or 0), 1),
        'active_users': active_users,
        'total_learners': total_learners,
    }


def get_team_charts(start: date, end: date) -> dict:
    """Chart data aggregated across all learners."""

    entries = Entry.objects.filter(
        is_active=True,
        date__gte=start,
        date__lte=end,
        user__role='learner',
    )

    # 1. Time breakdown (team total)
    breakdown = entries.values('intent').annotate(total_hours=Sum('hours'))
    time_breakdown = {'lnd_hours': 0, 'sbu_hours': 0}
    for row in breakdown:
        if row['intent'] == 'lnd_tasks':
            time_breakdown['lnd_hours'] = round(float(row['total_hours'] or 0), 1)
        elif row['intent'] == 'sbu_tasks':
            time_breakdown['sbu_hours'] = round(float(row['total_hours'] or 0), 1)

    # 2. Per-user detailed breakdown
    from apps.training_plans.models import PlanAssignment

    per_user = (
        entries
        .values('user_id', 'user__full_name', 'user__email')
        .annotate(
            total_hours=Sum('hours'),
            entry_count=Count('id'),
            approved=Count('id', filter=Q(status='approved')),
            lnd_hours=Sum('hours', filter=Q(intent='lnd_tasks')),
            sbu_hours=Sum('hours', filter=Q(intent='sbu_tasks')),
            first_date=Min('date'),
            last_date=Max('date'),
        )
        .order_by('-total_hours')
    )

    user_breakdown = []
    for row in per_user:
        user_id = row['user_id']
        total = row['entry_count'] or 0
        approved = row['approved'] or 0
        approval_rate = round(approved / total * 100, 1) if total > 0 else 0

        # Training plan
        assignment = PlanAssignment.objects.filter(user_id=user_id).select_related('plan').first()
        plan_name = assignment.plan.plan_name if assignment else '—'

        # Quick feedback based on data
        if approval_rate >= 80:
            feedback = 'Excellent'
        elif approval_rate >= 50:
            feedback = 'Good'
        elif approval_rate >= 25:
            feedback = 'Needs Improvement'
        elif total > 0:
            feedback = 'At Risk'
        else:
            feedback = '—'

        user_breakdown.append({
            'name': row['user__full_name'] or row['user__email'],
            'hours': round(float(row['total_hours'] or 0), 1),
            'lnd_hours': round(float(row['lnd_hours'] or 0), 1),
            'sbu_hours': round(float(row['sbu_hours'] or 0), 1),
            'entries': total,
            'approval_rate': approval_rate,
            'training_plan': plan_name,
            'feedback': feedback,
            'first_date': row['first_date'].isoformat() if row['first_date'] else '—',
            'last_date': row['last_date'].isoformat() if row['last_date'] else '—',
        })

    # 3. Daily activity (team total)
    daily = (
        entries
        .values('date')
        .annotate(
            total_hours=Sum('hours'),
            entry_count=Count('id'),
            lnd_hours=Sum('hours', filter=Q(intent='lnd_tasks')),
            sbu_hours=Sum('hours', filter=Q(intent='sbu_tasks')),
        )
        .order_by('date')
    )
    daily_activity = [
        {
            'date': row['date'].isoformat(),
            'hours': round(float(row['total_hours'] or 0), 1),
            'lnd_hours': round(float(row['lnd_hours'] or 0), 1),
            'sbu_hours': round(float(row['sbu_hours'] or 0), 1),
            'entries': row['entry_count'],
        }
        for row in daily
    ]

    # 4. Approval donut (team total)
    statuses = entries.values('status').annotate(count=Count('id'))
    approval_donut = {'approved': 0, 'pending': 0, 'rejected': 0, 'flagged': 0}
    for row in statuses:
        s = row['status']
        if s in approval_donut:
            approval_donut[s] = row['count']

    # 5. Weekly trend (team total)
    weekly = (
        entries
        .annotate(week=TruncWeek('date'))
        .values('week')
        .annotate(
            total_hours=Sum('hours'),
            entry_count=Count('id'),
        )
        .order_by('week')
    )
    weekly_trend = [
        {
            'week': row['week'].isoformat(),
            'hours': round(float(row['total_hours'] or 0), 1),
            'entries': row['entry_count'],
        }
        for row in weekly
    ]

    return {
        'time_breakdown': time_breakdown,
        'daily_activity': daily_activity,
        'user_breakdown': user_breakdown,
        'approval_donut': approval_donut,
        'weekly_trend': weekly_trend,
    }

