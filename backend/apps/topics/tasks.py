"""
Celery tasks for Topic Resource + KB generation.
=================================================
Runs in background so admin doesn't wait for YouTube API / Ollama calls.
"""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=1, soft_time_limit=600, time_limit=900)
def generate_resources_task(self, plan_id=None, topic_id=None, force=False):
    """
    Generate YouTube resources for topics in a plan or a single topic.
    Dual engine: YouTube Data API v3 (primary) → youtube-search scrape (fallback).

    force=True → re-generates even for topics that already have resources.
    Old AI resources are cleared per-topic ONLY after successful regeneration.
    """
    from apps.topics.models import Topic, TopicResource
    from apps.topics.youtube_client import search_topic_videos

    topic_ids = []

    if topic_id:
        topic_ids = [topic_id]
    elif plan_id:
        from apps.training_plans.models import PlanTopic
        topic_ids = list(
            PlanTopic.objects.filter(
                plan_id=plan_id, node_type='topic',
            ).values_list('topic_id', flat=True)
        )

    if not topic_ids:
        return {'status': 'no_topics', 'generated': 0, 'skipped': 0, 'failed': 0}

    # Determine which topics need generation
    if force:
        # Force mode: regenerate all (clear old AFTER new ones arrive)
        topics_to_generate = topic_ids
        skipped = 0
    else:
        # Normal mode: skip topics that already have resources
        topics_with_resources = set(
            TopicResource.objects.filter(
                topic_id__in=topic_ids, is_active=True,
            ).values_list('topic_id', flat=True).distinct()
        )
        topics_to_generate = [tid for tid in topic_ids if tid not in topics_with_resources]
        skipped = len(topics_with_resources & set(topic_ids))

    total = len(topics_to_generate)
    generated = 0
    failed = 0

    if total == 0:
        return {'status': 'all_exist', 'generated': 0, 'skipped': skipped, 'failed': 0}

    # Get roadmap context from plan if available
    roadmap_context = ''
    if plan_id:
        from apps.training_plans.models import TrainingPlan
        try:
            plan = TrainingPlan.objects.get(id=plan_id)
            roadmap_context = plan.target_role or plan.plan_name or ''
        except TrainingPlan.DoesNotExist:
            pass

    # Track used video IDs to prevent duplicates within this batch
    used_video_ids = set()

    for i, tid in enumerate(topics_to_generate):
        try:
            topic = Topic.objects.select_related('parent').get(id=tid, is_active=True)
        except Topic.DoesNotExist:
            failed += 1
            continue

        # Get section name from parent topic for context
        section_name = topic.parent.name if topic.parent else ''

        # Update progress
        self.update_state(state='PROGRESS', meta={
            'current': i + 1,
            'total': total,
            'topic': topic.name,
            'generated': generated,
            'failed': failed,
        })

        try:
            videos = search_topic_videos(
                topic_name=topic.name,
                section_name=section_name,
                roadmap_context=roadmap_context,
                max_results=1,
                used_video_ids=used_video_ids,
            )

            if videos:
                video = videos[0]

                # If force mode, clear old AI resources for THIS topic first
                if force:
                    TopicResource.objects.filter(
                        topic_id=tid, is_active=True, generated_by='ai',
                    ).update(is_active=False)

                TopicResource.objects.update_or_create(
                    topic=topic,
                    youtube_video_id=video['youtube_video_id'],
                    defaults={
                        'title': video['title'],
                        'url': video['url'],
                        'channel_name': video['channel_name'],
                        'duration_minutes': video['duration_minutes'],
                        'view_count': video['view_count'],
                        'like_count': video['like_count'],
                        'thumbnail_url': video['thumbnail_url'],
                        'description': video['description'],
                        'generated_by': 'ai',
                        'is_active': True,
                    },
                )

                # Track this video ID to prevent duplicate assignment
                used_video_ids.add(video['youtube_video_id'])

                # Sync benchmark_hours from resource duration
                resource_hours = round(video['duration_minutes'] / 60, 1)
                if resource_hours > 0:
                    topic.benchmark_hours = resource_hours
                    topic.save(update_fields=['benchmark_hours'])

                generated += 1
                logger.info(
                    f"Resource for '{topic.name}': '{video['title']}' "
                    f"({video['duration_minutes']}min -> benchmark={resource_hours}h)"
                )
            else:
                logger.warning(f"No relevant video found for '{topic.name}'")
                failed += 1

        except Exception as e:
            logger.error(f"Error for '{topic.name}': {e}")
            failed += 1

        # Rate limiting — avoid IP throttling on fallback engine
        import time
        time.sleep(0.5)

    return {
        'status': 'completed',
        'generated': generated,
        'skipped': skipped,
        'failed': failed,
    }


@shared_task(bind=True, max_retries=1, soft_time_limit=3600, time_limit=3900)
def generate_knowledge_task(self, plan_id=None, topic_id=None):
    """
    Generate TopicKnowledge (KB) for topics in a plan or a single topic.
    Uses Ollama/Llama to generate what_it_is, what_you_will_learn, subtopics, keywords.

    Only generates for topics missing KB or with failed status.
    After generation, re-indexes in ChromaDB.
    """
    import hashlib
    import json
    import time
    import re
    import requests as http_requests

    from apps.topics.models import Topic, TopicKnowledge
    from apps.training_plans.models import PlanTopic, TrainingPlan

    topic_ids = []
    roadmap_id = ''
    roadmap_name = ''

    if topic_id:
        topic_ids = [topic_id]
    elif plan_id:
        topic_ids = list(
            PlanTopic.objects.filter(
                plan_id=plan_id, node_type='topic',
            ).values_list('topic_id', flat=True)
        )
        try:
            plan = TrainingPlan.objects.get(id=plan_id)
            roadmap_id = plan.source_template or ''
            roadmap_name = plan.target_role or plan.plan_name or ''
        except TrainingPlan.DoesNotExist:
            pass

    if not topic_ids:
        return {'status': 'no_topics', 'generated': 0, 'skipped': 0, 'failed': 0}

    # Filter to topics missing KB
    topics_with_kb = set()
    for tid in topic_ids:
        topic_obj = Topic.objects.filter(id=tid).first()
        if topic_obj:
            has_kb = TopicKnowledge.objects.filter(
                topic_id=tid, is_active=True,
            ).exists() or TopicKnowledge.objects.filter(
                topic_name__iexact=topic_obj.name, is_active=True,
            ).exists()
            if has_kb:
                topics_with_kb.add(tid)

    topics_to_generate = [tid for tid in topic_ids if tid not in topics_with_kb]

    total = len(topics_to_generate)
    generated = 0
    skipped = len(topics_with_kb)
    failed = 0

    if total == 0:
        return {'status': 'all_exist', 'generated': 0, 'skipped': skipped, 'failed': 0}

    # Check Ollama connectivity
    ollama_url = 'http://localhost:11434'
    try:
        r = http_requests.get(f"{ollama_url}/api/tags", timeout=5)
        r.raise_for_status()
    except Exception as e:
        logger.error(f"Ollama not available: {e}")
        return {'status': 'ollama_unavailable', 'error': str(e)}

    for i, tid in enumerate(topics_to_generate):
        try:
            topic = Topic.objects.select_related('parent').get(id=tid, is_active=True)
        except Topic.DoesNotExist:
            failed += 1
            continue

        # Update progress
        self.update_state(state='PROGRESS', meta={
            'current': i + 1,
            'total': total,
            'topic': topic.name,
            'generated': generated,
            'failed': failed,
        })

        section_name = topic.parent.name if topic.parent else 'General'
        section_id = topic.parent.name.lower().replace(' ', '-') if topic.parent else 'general'

        prompt = _build_kb_prompt(
            roadmap_name=roadmap_name or 'General',
            topic_name=topic.name,
            section_name=section_name,
            benchmark_hours=float(topic.benchmark_hours or 3),
            difficulty=topic.difficulty or 3,
        )

        try:
            response = http_requests.post(
                f"{ollama_url}/api/generate",
                json={
                    'model': 'llama3.1',
                    'prompt': prompt,
                    'stream': False,
                    'options': {'temperature': 0.3, 'num_predict': 4096, 'top_p': 0.9},
                },
                timeout=120,
            )
            response.raise_for_status()
            raw_text = response.json().get('response', '').strip()

            # Parse JSON from response
            json_match = re.search(r'\{[\s\S]*\}', raw_text)
            if not json_match:
                logger.warning(f"No JSON in KB response for '{topic.name}'")
                failed += 1
                continue

            knowledge = json.loads(json_match.group())

            # Validate required fields
            for field in ['what_it_is', 'what_you_will_learn', 'subtopics', 'validation_keywords']:
                if field not in knowledge:
                    raise ValueError(f"Missing field: {field}")

            # Normalize
            knowledge['subtopics'] = [s.lower().strip() for s in knowledge['subtopics']]
            knowledge['validation_keywords'] = [k.lower().strip() for k in knowledge['validation_keywords']]

            # Compute version hash
            content_str = json.dumps(knowledge, sort_keys=True)
            version_hash = hashlib.sha256(content_str.encode()).hexdigest()[:16]

            # Save to DB
            kb, created = TopicKnowledge.objects.update_or_create(
                roadmap_id=roadmap_id or 'custom',
                section_id=section_id,
                topic_name=topic.name,
                defaults={
                    'section_name': section_name,
                    'topic': topic,
                    'benchmark_hours': topic.benchmark_hours or 0,
                    'difficulty': topic.difficulty or 3,
                    'what_it_is': knowledge['what_it_is'],
                    'what_you_will_learn': knowledge['what_you_will_learn'],
                    'subtopics': knowledge['subtopics'],
                    'validation_keywords': knowledge['validation_keywords'],
                    'version_hash': version_hash,
                    'is_active': True,
                },
            )

            # Re-index in ChromaDB
            try:
                from apps.entries.rag_engine import RAGEngine
                rag = RAGEngine.get_instance()
                rag.build_topic_index_single(kb)
            except Exception as e:
                logger.warning(f"ChromaDB index failed for '{topic.name}': {e}")

            generated += 1
            logger.info(f"Generated KB for '{topic.name}' ({'created' if created else 'updated'})")

        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse error for '{topic.name}': {e}")
            failed += 1
        except http_requests.exceptions.Timeout:
            logger.warning(f"Ollama timeout for '{topic.name}'")
            failed += 1
        except Exception as e:
            logger.error(f"KB generation failed for '{topic.name}': {e}")
            failed += 1

        # Brief pause between LLM calls to avoid overloading
        time.sleep(1)

    return {
        'status': 'completed',
        'generated': generated,
        'skipped': skipped,
        'failed': failed,
    }


def _build_kb_prompt(roadmap_name, topic_name, section_name, benchmark_hours, difficulty):
    """Build Ollama prompt for KB generation — same structure as generate_topic_knowledge.py"""
    min_bullets = max(5, int(benchmark_hours * 0.8))
    max_bullets = max(8, int(benchmark_hours * 1.5))
    if max_bullets > 25:
        max_bullets = 25

    min_keywords = max(10, int(benchmark_hours * 0.8))
    max_keywords = max(18, int(benchmark_hours * 1.5))
    if max_keywords > 35:
        max_keywords = 35

    return f"""You are a senior technical education specialist. Generate a learning knowledge base entry.

CONTEXT:
- Roadmap: {roadmap_name}
- Section: {section_name}
- Topic: {topic_name}
- Benchmark Hours: {benchmark_hours}h
- Difficulty: {difficulty}/5

Generate a JSON object with these EXACT keys:
{{
  "what_it_is": "1-2 sentence description of what this topic covers and why it matters",
  "what_you_will_learn": ["ConceptName — detailed explanation", ...],
  "subtopics": ["subtopic1", "subtopic2", ...],
  "validation_keywords": ["keyword1", "keyword2", ...]
}}

RULES:
1. what_you_will_learn: {min_bullets}-{max_bullets} items, each as "ConceptName — explanation"
2. subtopics: 8-22 items, all lowercase
3. validation_keywords: {min_keywords}-{max_keywords} items, all lowercase
4. Content must be specific to the {roadmap_name} context
5. Output ONLY the raw JSON object. No markdown, no explanation."""
