"""
Report Generator — Combines Django queries with Qwen AI insights.

Flow:
1. Run ORM queries to gather raw stats
2. Build a concise prompt with summary data (no raw entries — privacy)
3. Qwen generates markdown report (~500 words max)
4. Package everything into a Report model instance

The markdown is the AI's contribution. Charts use raw data directly.
"""
import time
import logging
from datetime import date

from langchain_ollama import OllamaLLM

from apps.users.models import User
from .models import Report
from .queries import (
    get_date_range,
    get_lnd_summary,
    get_sbu_summary,
    get_charts_data,
    get_overview_stats,
)

logger = logging.getLogger(__name__)


def _build_report_prompt(
    user: User,
    period: str,
    start: date,
    end: date,
    overview: dict,
    lnd: dict,
    sbu: dict,
) -> str:
    """
    Build a concise prompt for Qwen to generate personalized report insights.
    Only sends summary stats — no raw entry text (privacy).
    """
    # Build topic details
    topic_lines = []
    for t in lnd.get('topics_worked', [])[:8]:
        status = "✅ Completed" if t['is_completed'] else f"{t['coverage_pct']:.0f}% coverage"
        efficiency = ""
        if t['benchmark_hours'] > 0:
            ratio = t['hours'] / t['benchmark_hours']
            if ratio < 0.8:
                efficiency = " (ahead of schedule)"
            elif ratio > 1.5:
                efficiency = " (taking longer than expected)"
        topic_lines.append(
            f"  - {t['name']}: {t['hours']}h logged, {status}{efficiency}"
        )
    topics_block = "\n".join(topic_lines) if topic_lines else "  No L&D activity this period."

    # Build project details
    project_lines = []
    for p in sbu.get('projects_worked', [])[:5]:
        feat_status = f"{p['features_done']}/{p['features_total']} features done" if p['features_total'] > 0 else "no features tracked"
        project_lines.append(
            f"  - {p['name']}: {p['hours']}h logged, {p['entries']} entries, {feat_status}"
        )
    projects_block = "\n".join(project_lines) if project_lines else "  No project work this period."

    prompt = f"""You are writing a formal intern performance assessment report for BrainStation-23.
This will be printed as an official document. Write professionally — no emoji, no casual language.

OUTPUT FORMAT (use these exact markdown headers):

## Performance Summary
One concise paragraph summarizing overall performance with specific numbers.

## Key Strengths
3-4 bullet points. Each must reference a specific data point.

## Areas Requiring Attention
2-3 bullet points identifying gaps. Be specific and constructive.

## Recommendations
2-3 actionable next steps.

RULES:
- Reference ONLY numbers from the data below — do NOT invent statistics
- Maximum 400 words total
- Professional tone suitable for management review
- Do NOT include any title/headers before "Performance Summary"
- Do NOT mention "AI", "Qwen", "generated", or "this report"

--- EMPLOYEE ---
Name: {user.full_name or user.email}
Role: {user.get_role_display()}
Domain: {user.get_primary_domain_display()}

--- PERIOD ---
{period.title()}: {start.strftime('%b %d')} to {end.strftime('%b %d, %Y')}

--- METRICS ---
Total: {overview['total_hours']}h across {overview['total_entries']} entries
L&D: {overview['lnd_hours']}h ({overview['lnd_entries']} entries) | SBU: {overview['sbu_hours']}h ({overview['sbu_entries']} entries)
Approval Rate: {overview['approval_rate']}%
AI Confidence: {overview['avg_confidence']}%
Active Days: {overview['active_days']}/{overview['days_in_period']} ({overview['consistency_pct']}%)

--- L&D ---
Completed: {lnd['topics_completed_count']} | In Progress: {lnd['topics_in_progress_count']}
{topics_block}

--- PROJECTS ---
{projects_block}

Write the report now:"""

    return prompt


def generate_report(user_id: int, period: str = 'weekly') -> Report:
    """
    Generate a full report for the given user and period.
    
    1. Compute date range
    2. Run all ORM queries
    3. Check for empty period (skip AI if no data)
    4. Call Qwen for markdown insights
    5. Save and return Report instance
    """
    t0 = time.monotonic()

    user = User.objects.get(id=user_id)
    start, end = get_date_range(period)

    # Run all queries
    overview = get_overview_stats(user_id, start, end)
    lnd = get_lnd_summary(user_id, start, end)
    sbu = get_sbu_summary(user_id, start, end)
    charts = get_charts_data(user_id, start, end)

    # Short-circuit: no entries in period
    if overview['total_entries'] == 0:
        markdown = (
            f"## {period.title()} Report\n"
            f"**{start.strftime('%b %d')} — {end.strftime('%b %d, %Y')}**\n\n"
            f"No activity recorded during this period. "
            f"Start logging your L&D or project work to see insights here!"
        )
    else:
        # Build prompt and call Qwen
        prompt = _build_report_prompt(user, period, start, end, overview, lnd, sbu)

        try:
            llm = OllamaLLM(model="qwen2.5:7b", temperature=0.3, timeout=30)
            markdown = llm.invoke(prompt).strip()
        except Exception as e:
            logger.warning(f"Report AI generation failed for user {user_id}: {e}")
            # Fallback: structured summary without AI flair
            markdown = _generate_fallback_markdown(
                user, period, start, end, overview, lnd, sbu
            )

    generation_time = time.monotonic() - t0

    # Save report
    report = Report.objects.create(
        user=user,
        period=period,
        period_start=start,
        period_end=end,
        markdown_content=markdown,
        charts_data=charts,
        raw_stats={
            'overview': overview,
            'lnd': lnd,
            'sbu': sbu,
        },
        generation_time_seconds=round(generation_time, 2),
    )

    logger.info(
        f"Report generated for {user.email}: {period} "
        f"({start} to {end}), {generation_time:.1f}s"
    )

    return report


def _generate_fallback_markdown(
    user: User,
    period: str,
    start: date,
    end: date,
    overview: dict,
    lnd: dict,
    sbu: dict,
) -> str:
    """
    Fallback markdown when Qwen is unavailable.
    Pure data summary — no AI insights but still useful.
    """
    md = f"## {period.title()} Progress Report\n"
    md += f"**{start.strftime('%b %d')} — {end.strftime('%b %d, %Y')}**\n\n"
    md += f"*AI insights unavailable — showing data summary.*\n\n"

    md += f"### Overview\n"
    md += f"- **Total Hours:** {overview['total_hours']}h across {overview['total_entries']} entries\n"
    md += f"- **Approval Rate:** {overview['approval_rate']}%\n"
    md += f"- **Consistency:** {overview['active_days']}/{overview['days_in_period']} active days ({overview['consistency_pct']}%)\n"
    md += f"- **L&D:** {overview['lnd_hours']}h | **SBU:** {overview['sbu_hours']}h\n\n"

    if lnd['topics_worked']:
        md += f"### Learning & Development\n"
        md += f"- Completed: {lnd['topics_completed_count']} topics\n"
        md += f"- In Progress: {lnd['topics_in_progress_count']} topics\n\n"
        for t in lnd['topics_worked'][:5]:
            status = "✅" if t['is_completed'] else f"{t['coverage_pct']:.0f}%"
            md += f"- **{t['name']}**: {t['hours']}h ({status})\n"
        md += "\n"

    if sbu['projects_worked']:
        md += f"### Project Work\n"
        for p in sbu['projects_worked'][:5]:
            md += f"- **{p['name']}**: {p['hours']}h, {p['entries']} entries\n"
        md += "\n"

    return md
