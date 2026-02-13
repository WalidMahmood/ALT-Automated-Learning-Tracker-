"""
AI Brain Pipeline v6.0 — Dual Pipeline Agentic Validator
==========================================================
Two separate pipelines for comprehensive entry validation:

Pipeline A (Learning — lnd_tasks):
  Node 0: Context Gatherer     (Logic — learner history, copy-paste, progress, blockers)
  Node 1: Time Reasoner        (LLM — hours + blockers assessment with full context)
  Node 2: Content Validator     (LLM — genuine learning, topic match, depth vs hours)
  Node 3: Progress Analyzer     (LLM — completion, progress coherence, pace analysis)
  Node 4: Verdict Agent         (LLM — synthesizes ALL nodes → APPROVE/FLAG/PENDING)

Pipeline B (Project — sbu_tasks):
  Node 0: Context Gatherer     (Logic — project history, description, timeline)
  Node 1: Time Reasoner        (LLM — hours + blockers for project work)
  Node 2: Work Validator        (LLM — real incremental work, matches project scope)
  Node 3: Scope Tracker         (LLM — project completion %, pace, remaining work)
  Node 4: Verdict Agent         (LLM — synthesizes ALL nodes → APPROVE/FLAG/PENDING)

v6.0 Design Principles:
- LLM is the SOLE decision-maker. No math-only verdict.
- Separate pipelines: different analysis for learning vs project work.
- Each node produces VERDICT (PASS/CONCERN/FAIL) + confidence + reasoning.
- Verdict Agent sees ALL prior node outputs → connected, contextual final decision.
- Blockers folded into Time Reasoner (blockers affect time justification).
- Chain of thought at every step — fully transparent and explainable.

Safety:
- Circuit Breaker: LLM unresponsive >15s per node → logic fallback
- Pipeline Guard: Total elapsed >55s → remaining nodes use fallback
- Fallback Penalty: Entries with fallback nodes → PENDING (never auto-approved)
- Admin Override: Human Priority Lock preserved
"""
import logging
import json
import re
import time
from decimal import Decimal
from typing import TypedDict, List, Dict, Literal, Optional, Any
from difflib import SequenceMatcher

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded, MaxRetriesExceededError
from django.utils import timezone
from django.db.models import Avg, Count
from langchain_ollama import OllamaLLM
from langgraph.graph import StateGraph, END

from .models import Entry, GlobalWisdom
from apps.users.models import User

logger = logging.getLogger(__name__)


# =============================================================================
# Security: Input Sanitization
# =============================================================================

PROMPT_INJECTION_PATTERNS = [
    r'ignore\s+(all\s+)?previous\s+instructions?',
    r'forget\s+(all\s+)?previous',
    r'disregard\s+(all\s+)?above',
    r'new\s+instructions?:',
    r'system\s*:',
    r'\[system\]',
    r'\[assistant\]',
    r'you\s+are\s+now',
    r'pretend\s+to\s+be',
    r'act\s+as\s+if',
]


def sanitize_input(text: str) -> str:
    """Sanitize user input to prevent prompt injection attacks."""
    if not text:
        return ''
    sanitized = text
    for pattern in PROMPT_INJECTION_PATTERNS:
        sanitized = re.sub(pattern, '[REMOVED]', sanitized, flags=re.IGNORECASE)
    sanitized = sanitized.replace('"""', '"')
    sanitized = sanitized.replace("'''", "'")
    return sanitized[:500]


# =============================================================================
# Verdict Extraction Helpers
# =============================================================================

def extract_verdict(response: str) -> tuple:
    """
    Extract verdict, confidence, and reasoning from LLM response.
    Expected format:
        Reasoning: <chain of thought>
        Verdict: PASS | CONCERN | FAIL
        Confidence: <0-100>
    Returns (verdict: str, confidence: int, reasoning: str)
    """
    if not response:
        return 'CONCERN', 50, ''

    reasoning = ''
    verdict = 'CONCERN'
    confidence = 50

    # Extract reasoning
    reasoning_match = re.search(
        r'(?:Reasoning|Analysis|Assessment|Chain[- ]of[- ]Thought):\s*(.+?)(?=\n\s*(?:Verdict|Decision|Final|Confidence)[:\s]|$)',
        response, re.IGNORECASE | re.DOTALL
    )
    if reasoning_match:
        reasoning = reasoning_match.group(1).strip()
    else:
        verdict_pos = re.search(r'(?:Verdict|Decision)[:\s]', response, re.IGNORECASE)
        if verdict_pos:
            reasoning = response[:verdict_pos.start()].strip()
        else:
            reasoning = response.strip()

    reasoning = re.sub(r'\n{3,}', '\n\n', reasoning).strip()
    if len(reasoning) > 1000:
        reasoning = reasoning[:1000] + '...'

    # Extract verdict
    verdict_match = re.search(
        r'(?:Verdict|Decision):\s*(PASS|CONCERN|FAIL|APPROVE|FLAG|PENDING)',
        response, re.IGNORECASE
    )
    if verdict_match:
        raw = verdict_match.group(1).upper()
        if raw in ('PASS', 'APPROVE'):
            verdict = 'PASS'
        elif raw in ('CONCERN', 'FLAG'):
            verdict = 'CONCERN'
        else:
            verdict = 'FAIL'

    # Extract confidence
    conf_match = re.search(r'Confidence:\s*(\d+)', response, re.IGNORECASE)
    if conf_match:
        confidence = max(0, min(100, int(conf_match.group(1))))
    else:
        confidence = {'PASS': 82, 'CONCERN': 55, 'FAIL': 30}.get(verdict, 50)

    return verdict, confidence, reasoning


def extract_final_verdict(response: str) -> tuple:
    """
    Extract the Verdict Agent's final decision.
    Expected: Reasoning → Decision: APPROVE|FLAG|PENDING → Confidence
    Returns (decision: str, confidence: int, reasoning: str)
    """
    if not response:
        return 'pending', 50, ''

    reasoning = ''
    decision = 'pending'
    confidence = 50

    # Extract reasoning
    reasoning_match = re.search(
        r'(?:Reasoning|Analysis|Synthesis):\s*(.+?)(?=\n\s*(?:Decision|Verdict|Final|Confidence)[:\s]|$)',
        response, re.IGNORECASE | re.DOTALL
    )
    if reasoning_match:
        reasoning = reasoning_match.group(1).strip()
    else:
        decision_pos = re.search(r'(?:Decision|Verdict)[:\s]', response, re.IGNORECASE)
        if decision_pos:
            reasoning = response[:decision_pos.start()].strip()
        else:
            reasoning = response.strip()

    reasoning = re.sub(r'\n{3,}', '\n\n', reasoning).strip()
    if len(reasoning) > 1200:
        reasoning = reasoning[:1200] + '...'

    # Extract decision
    decision_match = re.search(
        r'(?:Decision|Verdict|Final):\s*(APPROVE|FLAG|PENDING|PASS|CONCERN|FAIL)',
        response, re.IGNORECASE
    )
    if decision_match:
        raw = decision_match.group(1).upper()
        if raw in ('APPROVE', 'PASS'):
            decision = 'approve'
        elif raw in ('FLAG', 'CONCERN'):
            decision = 'flag'
        else:
            decision = 'pending'

    # Extract confidence
    conf_match = re.search(r'Confidence:\s*(\d+)', response, re.IGNORECASE)
    if conf_match:
        confidence = max(0, min(100, int(conf_match.group(1))))
    else:
        confidence = {'approve': 85, 'flag': 65, 'pending': 40}.get(decision, 50)

    return decision, confidence, reasoning


# =============================================================================
# Copy-Paste Detection
# =============================================================================

def jaccard_similarity(text_a: str, text_b: str) -> float:
    """Jaccard similarity between two texts based on word sets."""
    if not text_a or not text_b:
        return 0.0
    words_a = set(text_a.lower().split())
    words_b = set(text_b.lower().split())
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union) if union else 0.0


def sequence_similarity(text_a: str, text_b: str) -> float:
    """Sequence similarity (catches reordered copy-paste)."""
    if not text_a or not text_b:
        return 0.0
    return SequenceMatcher(None, text_a.lower(), text_b.lower()).ratio()


# =============================================================================
# Blocker Parsing
# =============================================================================

KNOWN_BLOCKER_CATEGORIES = {'technical', 'environmental', 'personal', 'resource'}


def parse_blocker(blockers_text: str) -> tuple:
    """Parse 'Category: comment' format. Returns (category|None, comment)."""
    if not blockers_text or not blockers_text.strip():
        return None, ''
    text = blockers_text.strip()
    if ':' in text:
        prefix, _, comment = text.partition(':')
        prefix_clean = prefix.strip().lower()
        if prefix_clean in KNOWN_BLOCKER_CATEGORIES or prefix_clean == 'other':
            return prefix_clean, comment.strip()
    return None, text


# =============================================================================
# Type Definitions
# =============================================================================

IntentType = Literal['lnd_tasks', 'sbu_tasks']


class BrainState(TypedDict):
    """The internal state of the v6.0 Dual Pipeline AI Brain."""
    entry_id: int
    entry_data: Dict
    topic_name: str
    topic_difficulty: int
    user_experience: float
    benchmark_hours: float
    intent: IntentType
    project_name: Optional[str]
    project_description: Optional[str]
    # Context from Node 0
    prior_entries_count: int
    prior_entries_summaries: List[str]
    copy_paste_max_similarity: float
    copy_paste_flagged: bool
    progress_coherent: bool
    is_completed: bool
    progress_percent: float
    total_hours_invested: float
    progress_trajectory: List[Dict]
    estimated_total_hours: float
    context_summary: str
    blocker_summary: str
    # Learner velocity
    learner_avg_hours: float
    learner_entry_count: int
    # Node verdicts (accumulated by each node)
    node_verdicts: Dict[str, Dict]
    # Circuit breaker
    llm_latency: float
    ai_failures: int
    pipeline_start: float
    # Final outputs
    final_confidence: float
    final_decision: str
    reasoning_logs: Dict[str, Any]
    errors: List[str]


# =============================================================================
# Specificity Markers (used by fallback paths)
# =============================================================================

SPECIFICITY_MARKERS = [
    'implement', 'function', 'class', 'method', 'variable', 'loop',
    'condition', 'import', 'export', 'algorithm', 'structure', 'pattern',
    'module', 'library', 'framework', 'interface', 'abstract', 'inherit',
    'polymorphism', 'encapsulat', 'recursion', 'callback', 'promise',
    'async', 'await', 'thread', 'concurren', 'exception', 'syntax',
    'api', 'endpoint', 'route', 'server', 'client', 'database', 'query',
    'migration', 'schema', 'model', 'view', 'middleware', 'serializ',
    'authenticat', 'authoriz', 'token', 'session', 'cache', 'orm',
    'crud', 'rest', 'graphql', 'websocket', 'microservice',
    'component', 'hook', 'state', 'props', 'render', 'dom', 'css',
    'html', 'layout', 'responsive', 'flexbox', 'grid', 'animation',
    'event', 'listener', 'selector', 'stylesheet', 'bundl', 'webpack',
    'vite', 'redux', 'context', 'router', 'jsx', 'tsx', 'virtual dom',
    'tensor', 'epoch', 'gradient', 'train', 'dataset', 'feature',
    'regression', 'classificat', 'cluster', 'neural', 'layer', 'weight',
    'bias', 'loss', 'accurac', 'precision', 'recall', 'pandas',
    'numpy', 'matplotlib', 'sklearn', 'pytorch', 'tensorflow',
    'deploy', 'config', 'docker', 'container', 'pipeline', 'ci/cd',
    'kubernetes', 'nginx', 'ssl', 'dns', 'load balanc', 'monitor',
    'logging', 'terraform', 'ansible', 'cloud', 'aws', 'azure',
    'test', 'assert', 'mock', 'fixture', 'coverage', 'unit test',
    'integrat', 'e2e', 'debug', 'error', 'bug', 'stack trace',
    'breakpoint', 'lint', 'refactor',
    'android', 'ios', 'swift', 'kotlin', 'flutter', 'react native',
    'navigation', 'gesture', 'notification',
    'encrypt', 'hash', 'cors', 'csrf', 'xss', 'injection', 'firewall',
    'vulnerab', 'oauth', 'jwt', 'ssl', 'certificate',
    'sql', 'nosql', 'index', 'join', 'normali', 'transaction',
    'foreign key', 'primary key', 'constraint', 'trigger', 'stored proc',
    'redis', 'mongo', 'postgres', 'mysql',
    'git', 'branch', 'merge', 'commit', 'pull request', 'repository',
]


# =============================================================================
# System Briefings (pipeline-specific)
# =============================================================================

LEARNING_BRIEFING = (
    "You are part of a 5-Node AI Brain Pipeline (v6.0) that validates learning journal entries.\n"
    "This is a learning tracking system where employees log daily learning activities.\n"
    "\n"
    "Pipeline architecture:\n"
    "  Node 0 - Context Gatherer: Gathers ALL learner history for this topic (no LLM)\n"
    "  Node 1 - Time Reasoner: Assesses if claimed hours are reasonable given context + blockers\n"
    "  Node 2 - Content Validator: Evaluates if description shows genuine learning for the topic\n"
    "  Node 3 - Progress Analyzer: Checks if claimed progress/completion makes sense\n"
    "  Node 4 - Verdict Agent: Synthesizes ALL node findings into final APPROVE/FLAG/PENDING\n"
    "\n"
    "Topics work hierarchically (e.g., Frontend > React > React Hooks). L&D Tasks track\n"
    "depth-wise progress per topic. When a topic is marked complete, child topics auto-complete.\n"
    "Learners enter: hours (0-12h, 9h = full office day), description, progress %, completion, blockers.\n"
    "\n"
    "You MUST respond in this EXACT format:\n"
    "Reasoning: <your detailed chain-of-thought analysis, 3-5 sentences>\n"
    "Verdict: <PASS or CONCERN or FAIL>\n"
    "Confidence: <0-100>\n"
)

PROJECT_BRIEFING = (
    "You are part of a 5-Node AI Brain Pipeline (v6.0) that validates project work entries.\n"
    "This is a learning tracking system where employees log daily project/debugging work.\n"
    "\n"
    "Pipeline architecture:\n"
    "  Node 0 - Context Gatherer: Gathers ALL project history and description (no LLM)\n"
    "  Node 1 - Time Reasoner: Assesses if claimed hours are reasonable for project work + blockers\n"
    "  Node 2 - Work Validator: Evaluates if description shows real incremental project progress\n"
    "  Node 3 - Scope Tracker: Checks project completion %, pace, remaining work\n"
    "  Node 4 - Verdict Agent: Synthesizes ALL node findings into final APPROVE/FLAG/PENDING\n"
    "\n"
    "Projects are tracked by name + description (set on first entry). SBU Tasks are logged\n"
    "until the project is marked complete. Each entry describes what was done that session.\n"
    "Learners enter: hours (0-12h, 9h = full office day), description, progress %, completion, blockers.\n"
    "\n"
    "You MUST respond in this EXACT format:\n"
    "Reasoning: <your detailed chain-of-thought analysis, 3-5 sentences>\n"
    "Verdict: <PASS or CONCERN or FAIL>\n"
    "Confidence: <0-100>\n"
)


# =============================================================================
# Shared Node 0: Context Gatherer (Logic only — no LLM)
# =============================================================================

def context_gatherer(state: BrainState) -> BrainState:
    """
    v6.0: Gathers comprehensive context for downstream LLM nodes.
    Works for both learning and project pipelines. No LLM call.
    """
    entry_data = state['entry_data']
    entry_id = state['entry_id']
    current_text = entry_data.get('learned_text', '')
    intent = state['intent']
    is_project = intent == 'sbu_tasks'

    # ── Fetch ALL prior entries for this user+topic/project ──
    if state['topic_name'] and state['topic_name'] != 'N/A':
        prior_qs = Entry.objects.filter(
            user_id=entry_data.get('user_id'),
            topic__name=state['topic_name'],
            is_active=True,
        ).exclude(id=entry_id).order_by('-date')
    elif state.get('project_name'):
        prior_qs = Entry.objects.filter(
            user_id=entry_data.get('user_id'),
            project_name=state['project_name'],
            is_active=True,
        ).exclude(id=entry_id).order_by('-date')
    else:
        prior_qs = Entry.objects.none()

    prior_entries = list(prior_qs.values(
        'id', 'date', 'hours', 'learned_text', 'progress_percent',
        'is_completed', 'ai_decision', 'status'
    ))
    prior_count = len(prior_entries)

    # ── Total hours invested ──
    total_hours = sum(float(e.get('hours', 0)) for e in prior_entries) + float(entry_data.get('hours', 0))

    # ── Progress trajectory (chronological) ──
    trajectory = []
    for prev in reversed(prior_entries):  # oldest first
        trajectory.append({
            'date': str(prev['date']),
            'progress': float(prev.get('progress_percent', 0)),
            'hours': float(prev.get('hours', 0)),
            'summary': (prev.get('learned_text') or '')[:100],
            'status': prev.get('status', '?'),
        })
    trajectory.append({
        'date': 'current',
        'progress': float(entry_data.get('progress_percent', 0)),
        'hours': float(entry_data.get('hours', 0)),
        'summary': current_text[:100],
        'status': 'new',
    })

    # ── Estimated total hours ──
    benchmark = state['benchmark_hours']
    difficulty = state['topic_difficulty']
    difficulty_factors = {1: 0.6, 2: 0.8, 3: 1.0, 4: 1.5, 5: 2.0}
    difficulty_factor = difficulty_factors.get(difficulty, 1.0)
    estimated_total = round(benchmark * difficulty_factor, 1)
    if is_project:
        estimated_total = max(estimated_total, 10.0)

    # ── Copy-paste detection (last 10 for performance) ──
    max_sim = 0.0
    for prev in prior_entries[:10]:
        prev_text = prev.get('learned_text', '')
        j_sim = jaccard_similarity(current_text, prev_text)
        s_sim = sequence_similarity(current_text, prev_text)
        max_sim = max(max_sim, j_sim, s_sim)
    copy_paste_flagged = max_sim > 0.70

    # ── Prior entry summaries (for AI prompts) ──
    summaries = []
    for prev in prior_entries[:5]:
        summaries.append(
            f"[{prev['date']}] {float(prev['hours'])}h — "
            f"\"{(prev.get('learned_text') or '')[:120]}\" "
            f"(progress: {prev.get('progress_percent', 0)}%, "
            f"status: {prev.get('status', '?')})"
        )

    # ── Progress coherence check ──
    is_completed = entry_data.get('is_completed', False)
    progress = float(entry_data.get('progress_percent', 0))
    progress_coherent = True
    progress_note = ""
    if is_completed and progress < 100:
        progress_coherent = False
        progress_note = "Marked complete but progress < 100%."
    elif not is_completed and progress >= 100:
        progress_coherent = False
        progress_note = "Progress at 100% but not marked complete."

    # ── Blocker parsing (for Time Reasoner) ──
    raw_blockers = entry_data.get('blockers_text') or ''
    blocker_text = sanitize_input(raw_blockers)
    blocker_summary = "No blockers reported."
    if blocker_text and blocker_text.strip():
        category, comment = parse_blocker(blocker_text)
        if category in KNOWN_BLOCKER_CATEGORIES:
            blocker_summary = f"Blocker [{category.title()}]: {comment[:200] if comment else 'No details.'}"
        elif category == 'other':
            blocker_summary = f"Blocker [Other]: {comment[:200] if comment else blocker_text[:200]}"
        else:
            blocker_summary = f"Blocker: {blocker_text[:200]}"

    # ── Pace analysis ──
    if prior_count > 0 and total_hours > 0:
        hours_per_entry = total_hours / (prior_count + 1)
        progress_per_hour = progress / total_hours if total_hours > 0 else 0
        if progress_per_hour > 0:
            est_remaining = max(0, (100 - progress) / progress_per_hour)
        else:
            est_remaining = max(0, estimated_total - total_hours)
        pace = (
            f"Pace: {hours_per_entry:.1f}h/entry avg, "
            f"{progress_per_hour:.1f}%/hour, "
            f"~{est_remaining:.1f}h remaining."
        )
    else:
        pace = "First entry — no pace baseline yet."

    # ── Build rich context summary ──
    ctx = []
    if is_project:
        ctx.append(
            f"PROJECT '{state.get('project_name', '?')}' — "
            f"Entry #{prior_count + 1}, {total_hours:.1f}h invested, {progress}% progress."
        )
        if state.get('project_description'):
            ctx.append(f"Description: \"{state['project_description'][:200]}\"")
    else:
        ctx.append(
            f"TOPIC '{state['topic_name']}' (difficulty {difficulty}/5) — "
            f"Entry #{prior_count + 1}, {total_hours:.1f}h of ~{estimated_total:.1f}h estimated, "
            f"{progress}% progress."
        )
    ctx.append(pace)
    ctx.append(blocker_summary)
    if copy_paste_flagged:
        ctx.append(f"WARNING: COPY-PASTE {max_sim:.0%} similarity with previous entry.")
    if not progress_coherent:
        ctx.append(f"WARNING: {progress_note}")

    # ── Admin Feedback Loop: learn from override history ──
    try:
        user_id = entry_data.get('user_id')
        overridden_entries = Entry.objects.filter(
            user_id=user_id,
            admin_override=True,
            ai_status='analyzed',
            is_active=True,
        ).values('ai_decision', 'status', 'override_reason')[:20]

        if overridden_entries:
            override_count = len(overridden_entries)
            # AI said flag/pending but admin approved
            ai_too_strict = sum(
                1 for e in overridden_entries
                if e['ai_decision'] in ('flag', 'pending', 'reject')
                and e['status'] == 'approved'
            )
            # AI said approve but admin flagged/rejected
            ai_too_lenient = sum(
                1 for e in overridden_entries
                if e['ai_decision'] == 'approve'
                and e['status'] in ('flagged', 'rejected')
            )

            if ai_too_strict > 0 or ai_too_lenient > 0:
                feedback = (
                    f"ADMIN FEEDBACK: {override_count} override(s) for this learner. "
                )
                if ai_too_strict > ai_too_lenient:
                    feedback += (
                        f"AI was overruled {ai_too_strict}x (flagged but admin approved). "
                        f"The AI may be TOO STRICT for this learner — give benefit of the doubt."
                    )
                elif ai_too_lenient > ai_too_strict:
                    feedback += (
                        f"AI was overruled {ai_too_lenient}x (approved but admin flagged/rejected). "
                        f"The AI may be TOO LENIENT for this learner — be more careful."
                    )
                else:
                    feedback += f"Mixed overrides ({ai_too_strict} too strict, {ai_too_lenient} too lenient)."
                ctx.append(feedback)
    except Exception as e:
        logger.debug(f"Admin feedback lookup failed: {e}")

    context_summary = ' '.join(ctx)

    # ── Store enriched context in state ──
    state['prior_entries_count'] = prior_count
    state['prior_entries_summaries'] = summaries
    state['copy_paste_max_similarity'] = round(max_sim, 3)
    state['copy_paste_flagged'] = copy_paste_flagged
    state['progress_coherent'] = progress_coherent
    state['is_completed'] = is_completed
    state['progress_percent'] = progress
    state['total_hours_invested'] = round(total_hours, 2)
    state['progress_trajectory'] = trajectory
    state['estimated_total_hours'] = estimated_total
    state['context_summary'] = context_summary
    state['blocker_summary'] = blocker_summary

    state['reasoning_logs']['context_analysis'] = {
        'summary': context_summary,
        'score': None,
        'verdict': None,
        'path': 'logic',
        'path_reason': (
            f'Context Gatherer is logic-only — aggregates data for downstream AI nodes. '
            f'Gathered {prior_count} prior entries, {total_hours:.1f}h total invested, '
            f'{"copy-paste flagged" if copy_paste_flagged else "no copy-paste"}, '
            f'{"incoherent progress" if not progress_coherent else "coherent progress"}.'
        ),
        'details': (
            f"Prior entries: {prior_count} | Total hours: {total_hours:.1f}h\n"
            f"Progress: {progress}% {'(Complete)' if is_completed else ''}\n"
            f"Estimated total: ~{estimated_total:.1f}h\n"
            f"{pace}\n"
            f"Blockers: {blocker_summary}\n"
            f"Copy-paste: {'FLAGGED ' + str(round(max_sim * 100, 1)) + '%' if copy_paste_flagged else 'Clear'}\n"
            f"Coherence: {'OK' if progress_coherent else progress_note}"
        ),
    }
    return state


# =============================================================================
# PIPELINE A: Learning (lnd_tasks)
# =============================================================================

# ── A1: Time Reasoner (Learning) ──

def learning_time_reasoner(state: BrainState) -> BrainState:
    """
    v6.0 Learning Time Reasoner. LLM assesses if hours are reasonable
    given topic, difficulty, experience, blockers, and learning history.
    Blockers are handled HERE — not a separate node.
    """
    hours = float(state['entry_data']['hours'])
    topic = state['topic_name']
    difficulty = state['topic_difficulty']
    exp = state['user_experience']
    benchmark = state['benchmark_hours']
    total_invested = state['total_hours_invested']
    estimated_total = state['estimated_total_hours']
    progress = state['progress_percent']
    prior_count = state['prior_entries_count']
    blocker_summary = state.get('blocker_summary', 'No blockers.')
    intent = state['intent']

    prior_work = ""
    if state.get('prior_entries_summaries'):
        prior_work = "\n".join(state['prior_entries_summaries'][:3])

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="llama3.1", temperature=0, timeout=15)

        prompt = f"""{LEARNING_BRIEFING}
You are Node 1 (Time Reasoner). Assess if the claimed hours are reasonable for this learning session.

--- CONTEXT ---
Topic: "{topic}" (Difficulty: {difficulty}/5)
Intent: {'L&D Tasks' if intent == 'lnd_tasks' else 'SBU Tasks'}
Learner experience: {exp} years
Benchmark hours per session: {benchmark}h
Total hours invested in this topic so far: {total_invested:.1f}h
Estimated total hours for topic completion: ~{estimated_total:.1f}h
Current progress: {progress}%
This is entry #{prior_count + 1} for this topic
Hours claimed this session: {hours}h (office day = 9h max typical)

Blockers: {blocker_summary}

{"Prior entries:" if prior_work else "First entry — no prior work."}
{prior_work}

Description: "{sanitize_input(state['entry_data']['learned_text'])}"

Think step-by-step:
1. For a {'L&D Tasks' if intent == 'lnd_tasks' else 'SBU Tasks'} session on "{topic}" at difficulty {difficulty}/5, is {hours}h reasonable?
2. Given {total_invested:.1f}h already invested with {progress}% progress, does {hours}h more make sense?
3. Does the description length/depth roughly match {hours}h of work?
4. Do the reported blockers justify any extra time? (blockers can make sessions longer)
5. Is this a first entry (be lenient) or later entry (compare with history)?

Reasoning: <your assessment>
Verdict: <PASS or CONCERN or FAIL>
Confidence: <0-100>"""

        t0 = time.monotonic()
        response = llm.invoke(prompt).strip()
        state['llm_latency'] = time.monotonic() - t0

        verdict, confidence, reasoning = extract_verdict(response)

        state['node_verdicts']['time'] = {
            'verdict': verdict,
            'confidence': confidence,
            'reasoning': reasoning,
        }
        state['reasoning_logs']['time_analysis'] = {
            'summary': f"Time Reasoner: {verdict} ({confidence}%). {reasoning[:150]}",
            'score': confidence,
            'verdict': verdict,
            'path': 'ai',
            'path_reason': (
                f"LLM (llama3.1) assessed {hours}h for '{topic}' "
                f"(difficulty {difficulty}/5, {total_invested:.1f}h invested, {progress}% progress). "
                f"Blockers factored in: {blocker_summary[:80]}"
            ),
            'details': reasoning,
            'llm_raw_response': response,
        }

    except Exception as e:
        logger.warning(f"Learning time reasoner failed: {e}")
        state['ai_failures'] += 1
        # Fallback: basic reasonableness
        expected = benchmark * {1: 0.6, 2: 0.8, 3: 1.0, 4: 1.5, 5: 2.0}.get(difficulty, 1.0)
        if hours <= expected * 1.5:
            verdict, confidence = 'PASS', 70
        elif hours <= expected * 2.5:
            verdict, confidence = 'CONCERN', 50
        else:
            verdict, confidence = 'FAIL', 30

        state['node_verdicts']['time'] = {
            'verdict': verdict, 'confidence': confidence,
            'reasoning': f'Fallback: {hours}h vs expected ~{expected:.1f}h.',
        }
        state['reasoning_logs']['time_analysis'] = {
            'summary': f"Time Reasoner (fallback): {verdict} ({confidence}%). {hours}h vs ~{expected:.1f}h.",
            'score': confidence, 'verdict': verdict, 'path': 'breaker',
            'path_reason': f"LLM failed ({str(e)[:60]}). Math fallback used.",
            'details': f"Expected ~{expected:.1f}h, claimed {hours}h. Error: {str(e)[:80]}",
        }

    return state


# ── A2: Content Validator (Learning) ──

def learning_content_validator(state: BrainState) -> BrainState:
    """
    v6.0 Content Validator for learning entries.
    Checks: topic match, genuine learning vs fluff, depth vs hours,
    first/middle/last entry handling, tricky learner detection.
    """
    text = sanitize_input(state['entry_data']['learned_text'])
    hours = float(state['entry_data']['hours'])
    topic = state['topic_name']
    difficulty = state['topic_difficulty']
    intent = state['intent']
    prior_count = state['prior_entries_count']
    total_invested = state['total_hours_invested']
    progress = state['progress_percent']
    is_completed = state['is_completed']
    copy_paste_flagged = state['copy_paste_flagged']
    copy_paste_sim = state['copy_paste_max_similarity']

    prior_context = ""
    if state.get('prior_entries_summaries'):
        prior_context = "\nPrior entries:\n" + "\n".join(state['prior_entries_summaries'])

    # ── Global Wisdom corrections ──
    wisdom_context = ""
    if topic and topic != 'N/A':
        topic_words = [w for w in topic.lower().split() if len(w) > 2]
        from django.db.models import Q
        wisdom_q = Q()
        for word in topic_words:
            wisdom_q |= Q(topic_name__icontains=word)
        wisdom_entries = (
            GlobalWisdom.objects.filter(wisdom_q).order_by('-created_at')[:3]
            if topic_words else GlobalWisdom.objects.none()
        )
        if wisdom_entries.exists():
            wisdom_context = "\n--- ADMIN CORRECTIONS (learn from these) ---\n"
            for w in wisdom_entries:
                wisdom_context += (
                    f"- '{w.topic_name}': {w.admin_correction_reason} "
                    f"(AI:{w.ai_original_decision} -> Admin:{w.admin_corrected_decision})\n"
                )

    # ── Entry position context ──
    if prior_count == 0:
        position = "FIRST entry on this topic. Be lenient — learner is just starting."
    elif is_completed:
        position = f"FINAL entry (marked complete). {prior_count} prior entries exist. Verify completion is justified."
    else:
        position = f"MIDDLE entry (#{prior_count + 1}). Compare with prior work for new learning."

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="llama3.1", temperature=0, timeout=15)

        prompt = f"""{LEARNING_BRIEFING}
You are Node 2 (Content Validator). Evaluate if this description shows genuine learning.
You must judge INDEPENDENTLY based only on the description and context — not other nodes.

--- CONTEXT ---
Topic: "{topic}" (Difficulty: {difficulty}/5)
Intent: {'L&D Tasks' if intent == 'lnd_tasks' else 'SBU Tasks'}
Hours claimed: {hours}h
Progress: {progress}% | Total invested: {total_invested:.1f}h
Entry position: {position}
{"COPY-PASTE WARNING: " + str(round(copy_paste_sim * 100)) + "% similarity with previous entry!" if copy_paste_flagged else ""}
{prior_context}
{wisdom_context}

--- DESCRIPTION TO EVALUATE ---
"{text}"

Think step-by-step:
1. Does this description ACTUALLY relate to "{topic}"? (Learners can be tricky — they might write about something completely different. Check carefully.)
2. Does it show GENUINE understanding (explains concepts, gives examples, names techniques) or is it vague fluff?
3. For {hours}h of {'L&D Tasks' if intent == 'lnd_tasks' else 'SBU Tasks'}, is the depth/detail appropriate?
4. {position} — does this add NEW content beyond prior entries, or is it a repeat?
5. Are there specific technical terms, tools, or concepts that match "{topic}"?
{"6. HIGH SIMILARITY with prior entry — is this genuinely different content?" if copy_paste_flagged else ""}

Reasoning: <your assessment>
Verdict: <PASS or CONCERN or FAIL>
Confidence: <0-100>"""

        response = llm.invoke(prompt).strip()
        verdict, confidence, reasoning = extract_verdict(response)

        # Copy-paste penalty
        if copy_paste_flagged and confidence > 40:
            penalty = min(25, round(copy_paste_sim * 30))
            confidence = max(20, confidence - penalty)
            reasoning += f" [Copy-paste penalty: -{penalty}%]"

        state['node_verdicts']['content'] = {
            'verdict': verdict, 'confidence': confidence, 'reasoning': reasoning,
        }
        state['reasoning_logs']['content_analysis'] = {
            'summary': f"Content Validator: {verdict} ({confidence}%). {reasoning[:150]}",
            'score': confidence, 'verdict': verdict, 'path': 'ai',
            'path_reason': (
                f"LLM validated content for '{topic}' — "
                f"checked topic match, genuine learning, depth vs {hours}h, "
                f"entry position: {'first' if prior_count == 0 else 'final' if is_completed else f'#{prior_count + 1}'}."
            ),
            'details': reasoning,
            'llm_raw_response': response,
        }

    except Exception as e:
        logger.warning(f"Learning content validator failed: {e}")
        state['ai_failures'] += 1
        # Fallback: text analysis with specificity markers
        text_lower = text.lower()
        words = text.split()
        word_count = len(words)
        tech_matches = sum(1 for m in SPECIFICITY_MARKERS if m in text_lower)

        if word_count >= 40 and tech_matches >= 2:
            verdict, confidence = 'PASS', 65
        elif word_count >= 20 and tech_matches >= 1:
            verdict, confidence = 'CONCERN', 45
        else:
            verdict, confidence = 'FAIL', 25

        state['node_verdicts']['content'] = {
            'verdict': verdict, 'confidence': confidence,
            'reasoning': f'Fallback: {word_count} words, {tech_matches} tech terms.',
        }
        state['reasoning_logs']['content_analysis'] = {
            'summary': f"Content Validator (fallback): {verdict} ({confidence}%).",
            'score': confidence, 'verdict': verdict, 'path': 'breaker',
            'path_reason': f"LLM failed ({str(e)[:60]}). Word count + tech marker fallback.",
            'details': f"Words: {word_count}, tech markers: {tech_matches}. Error: {str(e)[:80]}",
        }

    return state


# ── A3: Progress Analyzer (Learning) ──

def learning_progress_analyzer(state: BrainState) -> BrainState:
    """
    v6.0 Progress Analyzer for learning entries.
    Checks: progress % coherence, completion justification, pace analysis.
    Even if not complete, verifies claimed progress matches actual work.
    """
    progress = state['progress_percent']
    is_completed = state['is_completed']
    total_invested = state['total_hours_invested']
    estimated_total = state['estimated_total_hours']
    prior_count = state['prior_entries_count']
    topic = state['topic_name']
    difficulty = state['topic_difficulty']
    hours = float(state['entry_data']['hours'])
    text = sanitize_input(state['entry_data']['learned_text'])

    prior_context = ""
    if state.get('prior_entries_summaries'):
        prior_context = "\nPrior entries:\n" + "\n".join(state['prior_entries_summaries'])

    # Build trajectory summary for the prompt
    traj_summary = ""
    if state.get('progress_trajectory') and len(state['progress_trajectory']) > 1:
        traj_lines = []
        for t in state['progress_trajectory'][-6:]:
            traj_lines.append(
                f"  {t['date']}: {t['progress']}% (+{t['hours']}h) — {t['summary'][:60]}"
            )
        traj_summary = "Progress timeline:\n" + "\n".join(traj_lines)

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="llama3.1", temperature=0, timeout=15)

        prompt = f"""{LEARNING_BRIEFING}
You are Node 3 (Progress Analyzer). Assess if the claimed progress makes sense.
You must judge INDEPENDENTLY based only on progress data and context — not other nodes.

--- CONTEXT ---
Topic: "{topic}" (Difficulty: {difficulty}/5)
Current progress claimed: {progress}%
Completed: {is_completed}
Total hours invested: {total_invested:.1f}h
Estimated total hours for this topic: ~{estimated_total:.1f}h
This is entry #{prior_count + 1}
This session: {hours}h

{traj_summary}
{prior_context}

Description: "{text}"

Think step-by-step:
1. At {progress}% with {total_invested:.1f}h invested (estimated total ~{estimated_total:.1f}h), is the claimed progress realistic?
2. {"The learner marked this as COMPLETE. They invested " + str(round(total_invested, 1)) + "h (estimated ~" + str(round(estimated_total, 1)) + "h, i.e., " + str(round(total_invested / estimated_total * 100, 0)) + "% of estimate). This ratio is ACCEPTABLE IF ≥80% — learners may be more efficient than estimated. Does the work described justify completion? Has enough ground been covered?" if is_completed else "The learner is at " + str(progress) + "%. Based on what has been described across all entries, does " + str(progress) + "% feel accurate — not too high, not too low?"}
3. Look at the progress timeline — is progress increasing at a reasonable rate or jumping suspiciously?
4. For a difficulty {difficulty}/5 topic, does the pace (hours per % progress) make sense?
5. {"If completion is justified (good coverage of topics, solid work), PASS. If the hours are very low (<50% of estimate) without explanation, FLAG." if is_completed else "What key parts might still be remaining at " + str(progress) + "%?"}

Reasoning: <your assessment>
Verdict: <PASS or CONCERN or FAIL>
Confidence: <0-100>"""

        response = llm.invoke(prompt).strip()
        verdict, confidence, reasoning = extract_verdict(response)

        # Coherence penalty
        if not state['progress_coherent']:
            confidence = max(20, confidence - 20)
            reasoning += " [Progress coherence issue detected]"
            if verdict == 'PASS':
                verdict = 'CONCERN'

        state['node_verdicts']['progress'] = {
            'verdict': verdict, 'confidence': confidence, 'reasoning': reasoning,
        }
        state['reasoning_logs']['progress_analysis'] = {
            'summary': f"Progress Analyzer: {verdict} ({confidence}%). {reasoning[:150]}",
            'score': confidence, 'verdict': verdict, 'path': 'ai',
            'path_reason': (
                f"LLM analyzed progress: {progress}% with {total_invested:.1f}h invested "
                f"vs ~{estimated_total:.1f}h estimated. "
                f"{'Completion claim evaluated.' if is_completed else 'Ongoing progress assessed.'}"
            ),
            'details': reasoning,
            'llm_raw_response': response,
        }

    except Exception as e:
        logger.warning(f"Learning progress analyzer failed: {e}")
        state['ai_failures'] += 1
        # Basic fallback — consider completion at ≥50% of estimated as acceptable
        completion_ratio = total_invested / estimated_total if estimated_total > 0 else 0
        
        if is_completed and total_invested < estimated_total * 0.3:
            verdict, confidence = 'FAIL', 25
        elif is_completed and completion_ratio >= 0.8:
            # Completion at ≥80% of estimated = PASS with high confidence (efficient learning)
            verdict, confidence = 'PASS', 75
        elif is_completed and total_invested >= estimated_total * 0.5:
            # Completion at 50-80% of estimated = PASS but moderate confidence
            verdict, confidence = 'PASS', 65
        elif progress > 0 and total_invested > 0:
            # Still in progress = PASS (ongoing is healthy)
            verdict, confidence = 'PASS', 60
        else:
            verdict, confidence = 'CONCERN', 45

        state['node_verdicts']['progress'] = {
            'verdict': verdict, 'confidence': confidence,
            'reasoning': f'Fallback: {progress}% at {total_invested:.1f}h of ~{estimated_total:.1f}h ({round(completion_ratio*100, 0):.0f}% of estimate).',
        }
        state['reasoning_logs']['progress_analysis'] = {
            'summary': f"Progress Analyzer (fallback): {verdict} ({confidence}%).",
            'score': confidence, 'verdict': verdict, 'path': 'breaker',
            'path_reason': f"LLM failed ({str(e)[:60]}). Ratio-based fallback.",
            'details': f"Progress: {progress}%, invested: {total_invested:.1f}h, estimated: {estimated_total:.1f}h.",
        }

    return state


# =============================================================================
# PIPELINE B: Project (project_work + debugging)
# =============================================================================

# ── B1: Time Reasoner (Project) ──

def project_time_reasoner(state: BrainState) -> BrainState:
    """
    v6.0 Project Time Reasoner. LLM assesses if hours are reasonable
    for project work given description, scope, experience, and blockers.
    """
    hours = float(state['entry_data']['hours'])
    project_name = state.get('project_name', '?')
    project_desc = state.get('project_description') or 'No description'
    exp = state['user_experience']
    total_invested = state['total_hours_invested']
    progress = state['progress_percent']
    prior_count = state['prior_entries_count']
    blocker_summary = state.get('blocker_summary', 'No blockers.')
    intent = state['intent']

    prior_work = ""
    if state.get('prior_entries_summaries'):
        prior_work = "\n".join(state['prior_entries_summaries'][:3])

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="llama3.1", temperature=0, timeout=15)

        prompt = f"""{PROJECT_BRIEFING}
You are Node 1 (Time Reasoner). Assess if the claimed hours are reasonable for this project work.

--- PROJECT CONTEXT ---
Project: "{project_name}"
Description: "{project_desc[:300]}"
Intent: {'SBU Tasks' if intent == 'sbu_tasks' else 'L&D Tasks'}
Learner experience: {exp} years
Total hours invested in this project: {total_invested:.1f}h
Current progress: {progress}%
Entry #{prior_count + 1}
Hours claimed this session: {hours}h (office day = 9h max typical)

Blockers: {blocker_summary}

{"Prior entries:" if prior_work else "First entry — no prior work."}
{prior_work}

Work description: "{sanitize_input(state['entry_data']['learned_text'])}"

Think step-by-step:
1. For {intent.replace('_', ' ')} on "{project_name}", is {hours}h reasonable for a single session?
2. Given the project scope and {total_invested:.1f}h already invested at {progress}%, does {hours}h more make sense?
3. Does the work description detail match roughly {hours}h of effort?
4. Do the blockers justify any extra time for this project work?
5. With {exp} years experience, is this time reasonable for this type of work?

Reasoning: <your assessment>
Verdict: <PASS or CONCERN or FAIL>
Confidence: <0-100>"""

        t0 = time.monotonic()
        response = llm.invoke(prompt).strip()
        state['llm_latency'] = time.monotonic() - t0

        verdict, confidence, reasoning = extract_verdict(response)

        state['node_verdicts']['time'] = {
            'verdict': verdict, 'confidence': confidence, 'reasoning': reasoning,
        }
        state['reasoning_logs']['time_analysis'] = {
            'summary': f"Time Reasoner: {verdict} ({confidence}%). {reasoning[:150]}",
            'score': confidence, 'verdict': verdict, 'path': 'ai',
            'path_reason': (
                f"LLM assessed {hours}h for project '{project_name}' "
                f"({total_invested:.1f}h invested, {progress}% progress). "
                f"Blockers factored in: {blocker_summary[:80]}"
            ),
            'details': reasoning,
            'llm_raw_response': response,
        }

    except Exception as e:
        logger.warning(f"Project time reasoner failed: {e}")
        state['ai_failures'] += 1
        if hours <= 4:
            verdict, confidence = 'PASS', 70
        elif hours <= 8:
            verdict, confidence = 'CONCERN', 50
        else:
            verdict, confidence = 'CONCERN', 40

        state['node_verdicts']['time'] = {
            'verdict': verdict, 'confidence': confidence,
            'reasoning': f'Fallback: {hours}h project work.',
        }
        state['reasoning_logs']['time_analysis'] = {
            'summary': f"Time Reasoner (fallback): {verdict} ({confidence}%).",
            'score': confidence, 'verdict': verdict, 'path': 'breaker',
            'path_reason': f"LLM failed ({str(e)[:60]}). Basic fallback.",
            'details': f"{hours}h claimed. Error: {str(e)[:80]}",
        }

    return state


# ── B2: Work Validator (Project) ──

def project_work_validator(state: BrainState) -> BrainState:
    """
    v6.0 Work Validator for project entries.
    Checks: real incremental work, matches project description, specific enough.
    """
    text = sanitize_input(state['entry_data']['learned_text'])
    hours = float(state['entry_data']['hours'])
    project_name = state.get('project_name', '?')
    project_desc = state.get('project_description') or 'No description'
    intent = state['intent']
    prior_count = state['prior_entries_count']
    total_invested = state['total_hours_invested']
    progress = state['progress_percent']
    copy_paste_flagged = state['copy_paste_flagged']
    copy_paste_sim = state['copy_paste_max_similarity']

    prior_context = ""
    if state.get('prior_entries_summaries'):
        prior_context = "\nPrior entries:\n" + "\n".join(state['prior_entries_summaries'])

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="llama3.1", temperature=0, timeout=15)

        prompt = f"""{PROJECT_BRIEFING}
You are Node 2 (Work Validator). Evaluate if this describes real incremental project work.
You must judge INDEPENDENTLY based only on the work description and project context — not other nodes.

--- PROJECT CONTEXT ---
Project: "{project_name}"
Description: "{project_desc[:300]}"
Intent: {'SBU Tasks' if intent == 'sbu_tasks' else 'L&D Tasks'}
Hours claimed: {hours}h
Progress: {progress}% | Total invested: {total_invested:.1f}h
Entry #{prior_count + 1}
{"COPY-PASTE WARNING: " + str(round(copy_paste_sim * 100)) + "% similarity with previous entry!" if copy_paste_flagged else ""}
{prior_context}

--- WORK DESCRIPTION TO EVALUATE ---
"{text}"

Think step-by-step:
1. Does this description relate to the PROJECT ("{project_name}")? Does it match the project description?
2. Is this REAL, SPECIFIC work (names features, functions, files, bugs) or vague filler?
3. Does this represent INCREMENTAL progress beyond prior entries?
4. For {hours}h of {intent.replace('_', ' ')}, is the amount of work described reasonable?
5. Is the learner actually building/fixing/debugging things, or just describing plans/intentions?
{"6. HIGH SIMILARITY with prior entry — is this genuinely different work?" if copy_paste_flagged else ""}

Reasoning: <your assessment>
Verdict: <PASS or CONCERN or FAIL>
Confidence: <0-100>"""

        response = llm.invoke(prompt).strip()
        verdict, confidence, reasoning = extract_verdict(response)

        # Copy-paste penalty
        if copy_paste_flagged and confidence > 40:
            penalty = min(25, round(copy_paste_sim * 30))
            confidence = max(20, confidence - penalty)
            reasoning += f" [Copy-paste penalty: -{penalty}%]"

        state['node_verdicts']['content'] = {
            'verdict': verdict, 'confidence': confidence, 'reasoning': reasoning,
        }
        state['reasoning_logs']['content_analysis'] = {
            'summary': f"Work Validator: {verdict} ({confidence}%). {reasoning[:150]}",
            'score': confidence, 'verdict': verdict, 'path': 'ai',
            'path_reason': (
                f"LLM validated work for project '{project_name}' — "
                f"checked project match, real work, incremental progress."
            ),
            'details': reasoning,
            'llm_raw_response': response,
        }

    except Exception as e:
        logger.warning(f"Project work validator failed: {e}")
        state['ai_failures'] += 1
        text_lower = text.lower()
        words = text.split()
        word_count = len(words)
        tech_matches = sum(1 for m in SPECIFICITY_MARKERS if m in text_lower)

        if word_count >= 40 and tech_matches >= 2:
            verdict, confidence = 'PASS', 60
        elif word_count >= 20:
            verdict, confidence = 'CONCERN', 40
        else:
            verdict, confidence = 'FAIL', 25

        state['node_verdicts']['content'] = {
            'verdict': verdict, 'confidence': confidence,
            'reasoning': f'Fallback: {word_count} words, {tech_matches} tech terms.',
        }
        state['reasoning_logs']['content_analysis'] = {
            'summary': f"Work Validator (fallback): {verdict} ({confidence}%).",
            'score': confidence, 'verdict': verdict, 'path': 'breaker',
            'path_reason': f"LLM failed ({str(e)[:60]}). Word count fallback.",
            'details': f"Words: {word_count}, tech: {tech_matches}. Error: {str(e)[:80]}",
        }

    return state


# ── B3: Scope Tracker (Project) ──

def project_scope_tracker(state: BrainState) -> BrainState:
    """
    v6.0 Scope Tracker for project entries.
    Checks: project completion %, pace, remaining work estimate.
    """
    progress = state['progress_percent']
    is_completed = state['is_completed']
    total_invested = state['total_hours_invested']
    prior_count = state['prior_entries_count']
    project_name = state.get('project_name', '?')
    project_desc = state.get('project_description') or 'No description'
    hours = float(state['entry_data']['hours'])
    text = sanitize_input(state['entry_data']['learned_text'])

    prior_context = ""
    if state.get('prior_entries_summaries'):
        prior_context = "\nPrior entries:\n" + "\n".join(state['prior_entries_summaries'])

    traj_summary = ""
    if state.get('progress_trajectory') and len(state['progress_trajectory']) > 1:
        traj_lines = []
        for t in state['progress_trajectory'][-6:]:
            traj_lines.append(
                f"  {t['date']}: {t['progress']}% (+{t['hours']}h) — {t['summary'][:60]}"
            )
        traj_summary = "Progress timeline:\n" + "\n".join(traj_lines)

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="llama3.1", temperature=0, timeout=15)

        prompt = f"""{PROJECT_BRIEFING}
You are Node 3 (Scope Tracker). Assess project completion and pace.
You must judge INDEPENDENTLY based only on project scope and progress data — not other nodes.

--- PROJECT CONTEXT ---
Project: "{project_name}"
Description: "{project_desc[:300]}"
Current progress: {progress}%
Completed: {is_completed}
Total hours invested: {total_invested:.1f}h
Entry #{prior_count + 1} | This session: {hours}h

{traj_summary}
{prior_context}

Work description: "{text}"

Think step-by-step:
1. Given the project description, how much of it is realistically done at {progress}%?
2. Is {total_invested:.1f}h a reasonable amount of time for {progress}% of this project?
3. {"The project is marked COMPLETE. Does the combined work across all entries justify completion? (Completion can happen efficiently — judge by work quality & scope coverage, not just hours.)" if is_completed else "At " + str(progress) + "%, what major parts of the project likely remain?"}
4. Is the pace reasonable? (check progress timeline — steady or stagnant?)
5. Does this session's work meaningfully advance the project? Is the description detailed enough for {hours}h of work?

Reasoning: <your assessment>
Verdict: <PASS or CONCERN or FAIL>
Confidence: <0-100>"""

        response = llm.invoke(prompt).strip()
        verdict, confidence, reasoning = extract_verdict(response)

        # Coherence penalty
        if not state['progress_coherent']:
            confidence = max(20, confidence - 20)
            reasoning += " [Progress coherence issue detected]"
            if verdict == 'PASS':
                verdict = 'CONCERN'

        state['node_verdicts']['progress'] = {
            'verdict': verdict, 'confidence': confidence, 'reasoning': reasoning,
        }
        state['reasoning_logs']['progress_analysis'] = {
            'summary': f"Scope Tracker: {verdict} ({confidence}%). {reasoning[:150]}",
            'score': confidence, 'verdict': verdict, 'path': 'ai',
            'path_reason': (
                f"LLM tracked project scope: {progress}% with {total_invested:.1f}h invested. "
                f"{'Completion evaluated.' if is_completed else 'Ongoing progress assessed.'}"
            ),
            'details': reasoning,
            'llm_raw_response': response,
        }

    except Exception as e:
        logger.warning(f"Project scope tracker failed: {e}")
        state['ai_failures'] += 1
        # Basic fallback — be lenient with project completion
        if is_completed and total_invested >= 2 and progress >= 80:
            # Completion at 80%+ with ≥2h invested = PASS (efficient work)
            verdict, confidence = 'PASS', 70
        elif is_completed and progress >= 60:
            # Completion at 60%+ = PASS (reasonable project closure)
            verdict, confidence = 'PASS', 60
        elif is_completed and total_invested < 1:
            # Completion with minimal effort = FAIL (suspicious)
            verdict, confidence = 'FAIL', 25
        elif progress > 0:
            # Ongoing project = PASS
            verdict, confidence = 'PASS', 55
        else:
            verdict, confidence = 'CONCERN', 40

        state['node_verdicts']['progress'] = {
            'verdict': verdict, 'confidence': confidence,
            'reasoning': f'Fallback: {progress}% at {total_invested:.1f}h.',
        }
        state['reasoning_logs']['progress_analysis'] = {
            'summary': f"Scope Tracker (fallback): {verdict} ({confidence}%).",
            'score': confidence, 'verdict': verdict, 'path': 'breaker',
            'path_reason': f"LLM failed ({str(e)[:60]}). Basic fallback.",
            'details': f"Progress: {progress}%, invested: {total_invested:.1f}h.",
        }

    return state


# =============================================================================
# Shared Node 4: Verdict Agent (LLM — Final Connected Decision)
# =============================================================================

def verdict_agent(state: BrainState) -> BrainState:
    """
    v6.0 Verdict Agent. Synthesizes ALL prior node outputs into a final
    APPROVE / FLAG / PENDING decision. This is the SOLE decision-maker.
    No math. No weights. Pure agentic reasoning.
    """
    intent = state['intent']
    is_project = intent == 'sbu_tasks'
    briefing = PROJECT_BRIEFING if is_project else LEARNING_BRIEFING

    context_summary = state.get('context_summary', 'No context.')
    time_verdict = state['node_verdicts'].get('time', {})
    content_verdict = state['node_verdicts'].get('content', {})
    progress_verdict = state['node_verdicts'].get('progress', {})

    # ── Build the full evidence brief for the LLM ──
    content_label = 'WORK VALIDATOR' if is_project else 'CONTENT VALIDATOR'
    progress_label = 'SCOPE TRACKER' if is_project else 'PROGRESS ANALYZER'

    evidence = f"""--- CONTEXT (Node 0 — gathered data, no LLM) ---
{context_summary}

--- TIME REASONER (Node 1) ---
Verdict: {time_verdict.get('verdict', 'N/A')} | Confidence: {time_verdict.get('confidence', 'N/A')}%
Reasoning: {time_verdict.get('reasoning', 'N/A')[:500]}

--- {content_label} (Node 2) ---
Verdict: {content_verdict.get('verdict', 'N/A')} | Confidence: {content_verdict.get('confidence', 'N/A')}%
Reasoning: {content_verdict.get('reasoning', 'N/A')[:500]}

--- {progress_label} (Node 3) ---
Verdict: {progress_verdict.get('verdict', 'N/A')} | Confidence: {progress_verdict.get('confidence', 'N/A')}%
Reasoning: {progress_verdict.get('reasoning', 'N/A')[:500]}"""

    # ── Additional warning flags ──
    flags = []
    if state.get('copy_paste_flagged'):
        flags.append(
            f"COPY-PASTE DETECTED ({state['copy_paste_max_similarity']:.0%} similarity)"
        )
    if not state.get('progress_coherent', True):
        flags.append("PROGRESS/COMPLETION MISMATCH")
    if state.get('ai_failures', 0) > 0:
        flags.append(
            f"{state['ai_failures']} node(s) used FALLBACK (LLM was unavailable)"
        )
    flag_text = "\n".join(f"  - {f}" for f in flags) if flags else "  None."

    subject = state.get('project_name') if is_project else state.get('topic_name', '?')
    hours = float(state['entry_data']['hours'])

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="llama3.1", temperature=0, timeout=15)

        display_intent = 'SBU Tasks' if intent == 'sbu_tasks' else 'L&D Tasks'
        prompt = f"""{briefing}
You are Node 4 (Verdict Agent). You are the FINAL decision-maker.
Review ALL evidence from prior nodes and make a connected, justified decision.

--- ENTRY SUMMARY ---
{'Topic' if not is_project else 'Project'}: "{subject}"
Intent: {display_intent}
Hours: {hours}h | Progress: {state['progress_percent']}% | Completed: {state['is_completed']}

{evidence}

--- WARNING FLAGS ---
{flag_text}

Your job: Synthesize ALL the evidence above into ONE final decision.

Rules:
- APPROVE: All nodes PASS or minor concerns with clear reasoning. Entry appears genuine.
- FLAG: Mixed signals, some concerns but not clearly fraudulent. Needs human review.
- PENDING: Multiple FAIL/CONCERN verdicts, or evidence of gaming/fabrication. Needs admin review.
- If any node used FALLBACK (LLM unavailable), be cautious — prefer FLAG over APPROVE.
- Copy-paste detection is serious — always FLAG or PENDING if detected.
- Your decision MUST reference specific node findings. Explain exactly WHY.

Reasoning: <synthesize evidence from ALL nodes, explain your decision, 4-6 sentences>
Decision: <APPROVE or FLAG or PENDING>
Confidence: <0-100>"""

        response = llm.invoke(prompt).strip()
        decision, confidence, reasoning = extract_final_verdict(response)

        # ── Safety guardrails ──
        # Never auto-approve if multiple nodes used fallback
        if state.get('ai_failures', 0) > 1 and decision == 'approve':
            decision = 'flag'
            confidence = min(confidence, 75)
            reasoning += " [Safety: downgraded — multiple node fallbacks]"

        # Never approve if copy-paste detected
        if state.get('copy_paste_flagged') and decision == 'approve':
            decision = 'flag'
            confidence = min(confidence, 70)
            reasoning += " [Safety: downgraded — copy-paste detected]"

        state['final_decision'] = decision
        state['final_confidence'] = round(confidence, 2)

        # ── Map node confidences to scorecard for frontend ──
        scores = {
            'time': time_verdict.get('confidence', 50),
            'quality': content_verdict.get('confidence', 50),
            'relevance': progress_verdict.get('confidence', 50),
        }

        state['reasoning_logs']['final_decision'] = {
            'summary': f"{decision.upper()} at {confidence}% confidence.",
            'confidence': confidence,
            'decision': decision,
            'reason': reasoning,
            'verdict': decision.upper(),
            'scores': scores,
            'weights': None,  # No weights in v6.0 — LLM decides holistically
            'blocker_boost': 0,  # Blockers handled in Time Reasoner
            'penalty': (
                f"{state.get('ai_failures', 0)} fallback(s)"
                if state.get('ai_failures', 0) > 0 else ''
            ),
            'node_verdicts': {
                'time': time_verdict.get('verdict', '?'),
                'content': content_verdict.get('verdict', '?'),
                'progress': progress_verdict.get('verdict', '?'),
            },
            'path': 'ai',
            'path_reason': (
                "Verdict Agent (LLM) synthesized all node findings into final decision. "
                f"Time: {time_verdict.get('verdict', '?')}, "
                f"Content: {content_verdict.get('verdict', '?')}, "
                f"Progress: {progress_verdict.get('verdict', '?')}. "
                f"Decision: {decision.upper()} ({confidence}%)."
            ),
            'details': reasoning,
            'llm_raw_response': response,
        }

    except Exception as e:
        logger.warning(f"Verdict agent failed: {e}")
        # ── Ultimate fallback: vote on node verdicts ──
        verdicts = [
            time_verdict.get('verdict', 'CONCERN'),
            content_verdict.get('verdict', 'CONCERN'),
            progress_verdict.get('verdict', 'CONCERN'),
        ]
        fail_count = verdicts.count('FAIL')
        concern_count = verdicts.count('CONCERN')
        pass_count = verdicts.count('PASS')

        avg_conf = (
            time_verdict.get('confidence', 50)
            + content_verdict.get('confidence', 50)
            + progress_verdict.get('confidence', 50)
        ) / 3

        # Never auto-approve on fallback
        if fail_count >= 2:
            decision, confidence = 'pending', min(avg_conf, 45)
        elif fail_count >= 1 or concern_count >= 2:
            decision, confidence = 'flag', min(avg_conf, 70)
        elif pass_count == 3 and avg_conf >= 75:
            decision, confidence = 'flag', min(avg_conf, 80)
        else:
            decision, confidence = 'flag', min(avg_conf, 65)

        state['final_decision'] = decision
        state['final_confidence'] = round(confidence, 2)

        scores = {
            'time': time_verdict.get('confidence', 50),
            'quality': content_verdict.get('confidence', 50),
            'relevance': progress_verdict.get('confidence', 50),
        }

        fallback_reason = (
            f"Verdict Agent LLM failed. Node voting fallback: "
            f"Time={time_verdict.get('verdict', '?')}, "
            f"Content={content_verdict.get('verdict', '?')}, "
            f"Progress={progress_verdict.get('verdict', '?')}. "
            f"Avg confidence: {avg_conf:.0f}%. Never auto-approve on fallback."
        )

        state['reasoning_logs']['final_decision'] = {
            'summary': f"{decision.upper()} at {confidence:.0f}% (verdict agent fallback).",
            'confidence': confidence,
            'decision': decision,
            'reason': fallback_reason,
            'verdict': decision.upper(),
            'scores': scores,
            'weights': None,
            'blocker_boost': 0,
            'penalty': 'Verdict Agent fallback — no auto-approve.',
            'node_verdicts': {
                'time': time_verdict.get('verdict', '?'),
                'content': content_verdict.get('verdict', '?'),
                'progress': progress_verdict.get('verdict', '?'),
            },
            'path': 'breaker',
            'path_reason': f"Verdict Agent LLM failed ({str(e)[:60]}). Node-voting fallback.",
            'details': f"Error: {str(e)[:100]}. Verdicts: {verdicts}.",
        }

    return state


# =============================================================================
# Graph Assembly — Two Separate Pipelines
# =============================================================================

def build_learning_brain():
    """Pipeline A: Learning (lnd_tasks) — 5 nodes."""
    workflow = StateGraph(BrainState)

    workflow.add_node("context", context_gatherer)
    workflow.add_node("time", learning_time_reasoner)
    workflow.add_node("content", learning_content_validator)
    workflow.add_node("progress", learning_progress_analyzer)
    workflow.add_node("verdict", verdict_agent)

    workflow.set_entry_point("context")
    workflow.add_edge("context", "time")
    workflow.add_edge("time", "content")
    workflow.add_edge("content", "progress")
    workflow.add_edge("progress", "verdict")
    workflow.add_edge("verdict", END)

    return workflow.compile()


def build_project_brain():
    """Pipeline B: Project (sbu_tasks) — 5 nodes."""
    workflow = StateGraph(BrainState)

    workflow.add_node("context", context_gatherer)
    workflow.add_node("time", project_time_reasoner)
    workflow.add_node("content", project_work_validator)
    workflow.add_node("progress", project_scope_tracker)
    workflow.add_node("verdict", verdict_agent)

    workflow.set_entry_point("context")
    workflow.add_edge("context", "time")
    workflow.add_edge("time", "content")
    workflow.add_edge("content", "progress")
    workflow.add_edge("progress", "verdict")
    workflow.add_edge("verdict", END)

    return workflow.compile()


# =============================================================================
# Celery Task
# =============================================================================

@shared_task(
    name="apps.entries.tasks.analyze_entry_task",
    bind=True,
    max_retries=3,
    soft_time_limit=60,
    time_limit=90,
    autoretry_for=(ConnectionError, TimeoutError, Exception),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
)
def analyze_entry_task(self, entry_id: int):
    """The main Celery task — routes to Learning or Project pipeline (v6.0)."""
    try:
        entry = Entry.objects.select_related('user', 'topic').get(id=entry_id)

        # Human Priority Lock
        if entry.admin_override:
            logger.info(f"Entry {entry_id} has admin override. Skipping.")
            return f"Entry {entry_id} skipped (admin override)."

        # ── Historical velocity ──
        if entry.topic:
            prior_entries = Entry.objects.filter(
                user=entry.user, topic=entry.topic, is_active=True,
            ).exclude(id=entry_id)
        elif entry.project_name:
            prior_entries = Entry.objects.filter(
                user=entry.user, project_name=entry.project_name, is_active=True,
            ).exclude(id=entry_id)
        else:
            prior_entries = Entry.objects.none()

        velocity_stats = prior_entries.aggregate(
            avg_hours=Avg('hours'), entry_count=Count('id'),
        )
        learner_avg = float(velocity_stats['avg_hours'] or 0)
        entry_count = velocity_stats['entry_count'] or 0

        # ── Benchmark ──
        if entry.topic:
            raw_benchmark = getattr(entry.topic, 'benchmark_hours', None)
            benchmark = float(raw_benchmark) if raw_benchmark and float(raw_benchmark) > 0 else 3.0
            topic_name = entry.topic.name
            topic_difficulty = getattr(entry.topic, 'difficulty', 3)
        else:
            benchmark = 3.0
            topic_name = 'N/A'
            topic_difficulty = 3

        intent = entry.intent or 'lnd_tasks'
        is_project = intent == 'sbu_tasks'

        # ── Initialize Brain State ──
        state: BrainState = {
            'entry_id': entry_id,
            'entry_data': {
                'user_id': entry.user_id,
                'hours': float(entry.hours),
                'learned_text': entry.learned_text or '',
                'blockers_text': entry.blockers_text or '',
                'is_completed': entry.is_completed,
                'progress_percent': float(entry.progress_percent or 0),
            },
            'topic_name': topic_name,
            'topic_difficulty': topic_difficulty,
            'user_experience': float(getattr(entry.user, 'experience_years', 0) or 0),
            'benchmark_hours': benchmark,
            'intent': intent,
            'project_name': entry.project_name or None,
            'project_description': entry.project_description or None,
            # Context (populated by Node 0)
            'prior_entries_count': 0,
            'prior_entries_summaries': [],
            'copy_paste_max_similarity': 0.0,
            'copy_paste_flagged': False,
            'progress_coherent': True,
            'is_completed': entry.is_completed,
            'progress_percent': float(entry.progress_percent or 0),
            'total_hours_invested': 0.0,
            'progress_trajectory': [],
            'estimated_total_hours': float(benchmark),
            'context_summary': '',
            'blocker_summary': '',
            # Node verdicts
            'node_verdicts': {},
            # Velocity
            'learner_avg_hours': learner_avg,
            'learner_entry_count': entry_count,
            # Defaults
            'reasoning_logs': {},
            'errors': [],
            'llm_latency': 0.0,
            'ai_failures': 0,
            'pipeline_start': time.monotonic(),
            'final_confidence': 0.0,
            'final_decision': 'pending',
        }

        # ── Route to correct pipeline ──
        if is_project:
            brain = build_project_brain()
            logger.info(f"Entry {entry_id}: Running PROJECT pipeline ({intent})")
        else:
            brain = build_learning_brain()
            logger.info(f"Entry {entry_id}: Running LEARNING pipeline ({intent})")

        final_state = brain.invoke(state)

        # ── Race Condition Guard ──
        entry.refresh_from_db()
        if entry.admin_override:
            return f"Entry {entry_id} overridden by admin during analysis."

        # ── Save Results ──
        entry.ai_status = 'analyzed'
        entry.ai_decision = final_state['final_decision']
        entry.ai_confidence = Decimal(str(final_state['final_confidence']))
        entry.ai_chain_of_thought = final_state['reasoning_logs']
        entry.ai_analyzed_at = timezone.now()

        if entry.ai_decision == 'approve':
            entry.status = 'approved'
        elif entry.ai_decision == 'flag':
            entry.status = 'flagged'

        entry.save(update_fields=[
            'ai_status', 'ai_decision', 'ai_confidence',
            'ai_chain_of_thought', 'ai_analyzed_at', 'status',
        ])

        logger.info(f"Entry {entry_id}: {entry.ai_decision} ({entry.ai_confidence}%)")
        return f"Entry {entry_id}: {entry.ai_decision} ({entry.ai_confidence}%)"

    except Entry.DoesNotExist:
        logger.error(f"Entry {entry_id} not found.")
        return f"Entry {entry_id} not found."

    except SoftTimeLimitExceeded:
        logger.warning(f"Entry {entry_id}: Soft time limit exceeded.")
        try:
            Entry.objects.filter(id=entry_id, admin_override=False).update(
                ai_status='timeout',
                ai_decision='flag',
                ai_confidence=-1,
                ai_chain_of_thought={'error': 'Analysis timed out. Flagged for manual review.'},
                ai_analyzed_at=timezone.now(),
                status='flagged',
            )
        except Exception:
            pass
        return f"Entry {entry_id}: Timed out, flagged for review."

    except MaxRetriesExceededError:
        logger.error(f"Entry {entry_id}: Max retries exceeded.")
        try:
            Entry.objects.filter(id=entry_id, admin_override=False).update(
                ai_status='error',
                ai_chain_of_thought={'error': 'Max retries exceeded. Needs manual review.'},
                ai_analyzed_at=timezone.now(),
                status='pending',
            )
        except Exception:
            pass
        return f"Entry {entry_id}: Max retries exceeded."

    except Exception as e:
        logger.exception(f"AI analysis failed for Entry {entry_id}: {e}")

        if 'connection refused' in str(e).lower() or 'ollama' in str(e).lower():
            logger.error(f"Ollama connection issue for Entry {entry_id}.")
            try:
                Entry.objects.filter(id=entry_id, admin_override=False).update(
                    ai_status='error',
                    ai_chain_of_thought={'error': f'Ollama unavailable: {str(e)[:200]}'},
                    ai_analyzed_at=timezone.now(),
                    status='pending',
                )
            except Exception:
                pass
            return f"Entry {entry_id}: Ollama unavailable."

        try:
            Entry.objects.filter(id=entry_id).update(ai_status='error')
        except Exception:
            pass

        raise self.retry(exc=e, countdown=2 ** self.request.retries)
