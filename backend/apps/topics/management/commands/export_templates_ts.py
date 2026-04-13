"""
Management command to export DB training plan data to enriched-roadmaps.ts.

Reads all active plans from the DB, reconstructs the section/topic hierarchy,
and writes a TypeScript file matching the RoadmapTemplate format used by the
Browse Templates frontend page.

Usage:
    python manage.py export_templates_ts
    python manage.py export_templates_ts --output /path/to/enriched-roadmaps.ts
    python manage.py export_templates_ts --dry-run    # prints to stdout
"""

import json
import re
from django.core.management.base import BaseCommand
from apps.training_plans.models import TrainingPlan, PlanTopic
from apps.topics.models import Topic


# ═══════════════════════════════════════════════════════════════════════════
# PLAN METADATA — icon, category, description per source_template slug
# ═══════════════════════════════════════════════════════════════════════════

PLAN_META = {
    'ai-data-scientist':       {'icon': '🧪', 'category': 'role',  'description': 'Detailed roadmap for ai data scientist.'},
    'ai-engineer':             {'icon': '🤖', 'category': 'role',  'description': 'Detailed roadmap for ai engineer.'},
    'android':                 {'icon': '📱', 'category': 'role',  'description': 'Detailed roadmap for android.'},
    'backend-developer':       {'icon': '⚙️', 'category': 'role',  'description': 'Detailed roadmap for backend.'},
    'backend':                 {'icon': '⚙️', 'category': 'role',  'description': 'Detailed roadmap for backend.'},
    'bi-analyst':              {'icon': '📈', 'category': 'role',  'description': 'Detailed roadmap for bi analyst.'},
    'blockchain':              {'icon': '⛓️', 'category': 'role',  'description': 'Detailed roadmap for blockchain.'},
    'cyber-security':          {'icon': '🛡️', 'category': 'role',  'description': 'Detailed roadmap for cyber security.'},
    'data-analyst':            {'icon': '📊', 'category': 'role',  'description': 'Detailed roadmap for data analyst.'},
    'data-engineer':           {'icon': '🔧', 'category': 'role',  'description': 'Detailed roadmap for data engineer.'},
    'developer-relations':     {'icon': '🤝', 'category': 'role',  'description': 'Detailed roadmap for developer relations.'},
    'devops':                  {'icon': '🚀', 'category': 'role',  'description': 'Detailed roadmap for devops.'},
    'devsecops':               {'icon': '🔐', 'category': 'role',  'description': 'Detailed roadmap for devsecops.'},
    'engineering-manager':     {'icon': '👔', 'category': 'role',  'description': 'Detailed roadmap for engineering manager.'},
    'frontend-developer':      {'icon': '🎨', 'category': 'role',  'description': 'Detailed roadmap for frontend.'},
    'frontend':                {'icon': '🎨', 'category': 'role',  'description': 'Detailed roadmap for frontend.'},
    'frontend-fundamentals':   {'icon': '🎨', 'category': 'skill', 'description': 'Detailed roadmap for frontend fundamentals.'},
    'full-stack':              {'icon': '🔄', 'category': 'role',  'description': 'Detailed roadmap for full stack.'},
    'game-developer':          {'icon': '🎮', 'category': 'role',  'description': 'Detailed roadmap for game developer.'},
    'ios':                     {'icon': '🍎', 'category': 'role',  'description': 'Detailed roadmap for ios.'},
    'machine-learning':        {'icon': '🧠', 'category': 'role',  'description': 'Detailed roadmap for machine learning.'},
    'mlops':                   {'icon': '⚡', 'category': 'role',  'description': 'Detailed roadmap for mlops.'},
    'postgresql':              {'icon': '🐘', 'category': 'skill', 'description': 'Detailed roadmap for postgresql.'},
    'product-manager':         {'icon': '📋', 'category': 'role',  'description': 'Detailed roadmap for product manager.'},
    'qa':                      {'icon': '✅', 'category': 'role',  'description': 'Detailed roadmap for qa.'},
    'server-side-game-developer': {'icon': '🖥️', 'category': 'role', 'description': 'Detailed roadmap for server side game developer.'},
    'software-architect':      {'icon': '🏗️', 'category': 'role',  'description': 'Detailed roadmap for software architect.'},
    'technical-writer':        {'icon': '✍️', 'category': 'role',  'description': 'Detailed roadmap for technical writer.'},
    'ux-design':               {'icon': '🎯', 'category': 'role',  'description': 'Detailed roadmap for ux design.'},
    'backend-with-python':     {'icon': '🐍', 'category': 'skill', 'description': 'Detailed roadmap for backend with python.'},
}

# Plans to SKIP (duplicates or test plans)
SKIP_PLAN_IDS = set()


def slugify(text):
    """Convert text to URL-friendly slug."""
    s = text.lower().strip()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s]+', '-', s)
    s = re.sub(r'-+', '-', s)
    return s.strip('-')


class Command(BaseCommand):
    help = 'Export DB training plan data to enriched-roadmaps.ts'

    def add_arguments(self, parser):
        parser.add_argument(
            '--output', type=str,
            default=r'c:\Users\Walid\Desktop\Automated learning tracker system\frontend\src\data\roadmap-templates\enriched-roadmaps.ts',
            help='Output file path',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Print to stdout instead of writing file',
        )

    def handle(self, *args, **options):
        output_path = options['output']
        dry_run = options['dry_run']

        # Get all active plans that have a source_template (imported from templates)
        plans = TrainingPlan.objects.filter(
            is_active=True,
            source_template__isnull=False,
        ).exclude(
            source_template='',
        ).exclude(
            id__in=SKIP_PLAN_IDS,
        ).order_by('plan_name')

        # Deduplicate by source_template — keep the one with more topics
        seen_templates = {}
        for plan in plans:
            slug = plan.source_template
            if slug not in seen_templates:
                seen_templates[slug] = plan
            else:
                existing = seen_templates[slug]
                existing_count = PlanTopic.objects.filter(plan=existing).count()
                new_count = PlanTopic.objects.filter(plan=plan).count()
                if new_count > existing_count:
                    seen_templates[slug] = plan

        unique_plans = sorted(seen_templates.values(), key=lambda p: p.plan_name)

        self.stdout.write(f'Found {len(unique_plans)} unique template plans')

        templates = []
        for plan in unique_plans:
            template_data = self._build_template(plan)
            if template_data:
                templates.append(template_data)
                self.stdout.write(f'  [OK] {plan.plan_name} ({len(template_data["sections"])} sections, '
                                  f'~{template_data["estimatedHours"]}h)')

        # Generate TypeScript
        ts_content = self._generate_ts(templates)

        if dry_run:
            self.stdout.write(ts_content[:2000])
            self.stdout.write(f'\n... ({len(ts_content)} chars total)')
        else:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(ts_content)
            self.stdout.write(
                f'\n[DONE] Written {len(templates)} templates to {output_path}'
            )
            self.stdout.write(f'   File size: {len(ts_content):,} chars')

    def _build_template(self, plan):
        """Build a template dict from a DB plan."""
        slug = plan.source_template
        meta = PLAN_META.get(slug, {})

        if not meta:
            self.stdout.write(
                f'  [WARN] No metadata for template "{slug}" (plan: {plan.plan_name}), skipping'
            )
            return None

        # Get all plan topics ordered by sequence
        pts = PlanTopic.objects.filter(plan=plan).select_related(
            'topic', 'topic__parent'
        ).order_by('sequence_order')

        # Build topic ID set and find containers
        topic_ids = set(pts.values_list('topic_id', flat=True))
        parent_ids = set(
            Topic.objects.filter(
                id__in=topic_ids,
                children__id__in=topic_ids
            ).values_list('id', flat=True)
        )

        # Group topics into sections
        sections = []
        current_section = None

        for pt in pts:
            topic = pt.topic
            is_container = topic.id in parent_ids

            if is_container:
                # This is a section header
                current_section = {
                    'id': slugify(topic.name),
                    'name': topic.name,
                    'topics': [],
                }
                sections.append(current_section)
            else:
                # This is a leaf topic
                topic_data = {
                    'name': topic.name,
                    'benchmarkHours': int(float(topic.benchmark_hours)) if float(topic.benchmark_hours) == int(float(topic.benchmark_hours)) else float(topic.benchmark_hours),
                    'difficulty': topic.difficulty or 2,
                    'children': [],
                }

                # Check if this topic has children that are also in the plan
                child_topics = Topic.objects.filter(
                    parent=topic, id__in=topic_ids
                ).order_by('id')

                for child in child_topics:
                    child_data = {
                        'name': child.name,
                        'benchmarkHours': int(float(child.benchmark_hours)) if float(child.benchmark_hours) == int(float(child.benchmark_hours)) else float(child.benchmark_hours),
                        'difficulty': child.difficulty or 2,
                    }
                    topic_data['children'].append(child_data)

                if current_section is not None:
                    # Only add if not already added as a child of another topic
                    # Check: is this topic a child of another non-container topic in the plan?
                    if topic.parent_id and topic.parent_id in topic_ids and topic.parent_id not in parent_ids:
                        # This is a child of a non-container topic — skip, it was added as children[]
                        continue
                    current_section['topics'].append(topic_data)
                else:
                    # Orphan topic before any section — create implicit section
                    current_section = {
                        'id': 'general',
                        'name': 'General',
                        'topics': [topic_data],
                    }
                    sections.append(current_section)

        # Calculate total hours
        total_hours = 0
        for section in sections:
            for topic in section['topics']:
                total_hours += topic['benchmarkHours']
                for child in topic.get('children', []):
                    total_hours += child['benchmarkHours']

        return {
            'id': slug,
            'name': plan.plan_name,
            'description': meta['description'],
            'category': meta['category'],
            'estimatedHours': total_hours,
            'icon': meta['icon'],
            'sections': sections,
        }

    def _generate_ts(self, templates):
        """Generate TypeScript file content."""
        lines = []
        lines.append('import { RoadmapTemplate } from "@/lib/types";')
        lines.append('')
        lines.append('export const enrichedRoadmaps: RoadmapTemplate[] = [')

        for t_idx, template in enumerate(templates):
            lines.append('  {')
            lines.append(f'    "id": {json.dumps(template["id"])},')
            lines.append(f'    "name": {json.dumps(template["name"])},')
            lines.append(f'    "description": {json.dumps(template["description"])},')
            lines.append(f'    "category": {json.dumps(template["category"])},')
            lines.append(f'    "estimatedHours": {template["estimatedHours"]},')
            lines.append(f'    "icon": {json.dumps(template["icon"], ensure_ascii=False)},')
            lines.append(f'    "sections": [')

            for s_idx, section in enumerate(template['sections']):
                lines.append('      {')
                lines.append(f'        "id": {json.dumps(section["id"])},')
                lines.append(f'        "name": {json.dumps(section["name"], ensure_ascii=False)},')
                lines.append(f'        "topics": [')

                for topic_idx, topic in enumerate(section['topics']):
                    lines.append('          {')
                    lines.append(f'            "name": {json.dumps(topic["name"], ensure_ascii=False)},')
                    lines.append(f'            "benchmarkHours": {topic["benchmarkHours"]},')
                    lines.append(f'            "difficulty": {topic["difficulty"]},')

                    if topic.get('children'):
                        lines.append(f'            "children": [')
                        for c_idx, child in enumerate(topic['children']):
                            comma = ',' if c_idx < len(topic['children']) - 1 else ''
                            lines.append('              {')
                            lines.append(f'                "name": {json.dumps(child["name"], ensure_ascii=False)},')
                            lines.append(f'                "benchmarkHours": {child["benchmarkHours"]},')
                            lines.append(f'                "difficulty": {child["difficulty"]}')
                            lines.append(f'              }}{comma}')
                        lines.append('            ]')
                    else:
                        lines.append(f'            "children": []')

                    topic_comma = ',' if topic_idx < len(section['topics']) - 1 else ''
                    lines.append(f'          }}{topic_comma}')

                lines.append('        ]')
                section_comma = ',' if s_idx < len(template['sections']) - 1 else ''
                lines.append(f'      }}{section_comma}')

            lines.append('    ]')
            template_comma = ',' if t_idx < len(templates) - 1 else ''
            lines.append(f'  }}{template_comma}')

        lines.append('];')
        lines.append('')

        return '\n'.join(lines)
