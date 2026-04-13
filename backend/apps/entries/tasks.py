"""
AI Brain Pipeline v7.0 — RAG-Enhanced Dual Pipeline Agentic Validator
=====================================================================
Two separate pipelines for comprehensive entry validation:

Pipeline A (Learning — lnd_tasks):
  Node 0: Context Gatherer     (Logic — learner history, copy-paste, progress, blockers)
  Node 1: RAG Context Builder  (Logic — topic knowledge, subtopic coverage, admin corrections)
  Node 2: Time Reasoner        (LLM — hours + blockers assessment with full context + RAG)
  Node 3: Content Validator     (LLM — genuine learning, topic match, depth vs hours + RAG)
  Node 4: Progress Analyzer     (LLM — completion, progress coherence, subtopic coverage + RAG)
  Node 5: Verdict Agent         (LLM — synthesizes ALL nodes → confidence → decision)

Pipeline B (Project — sbu_tasks):
  Node 0: Context Gatherer     (Logic — project history, description, timeline)
  Node 1: RAG Context Builder  (Logic — admin corrections for projects)
  Node 2: Time Reasoner        (LLM — hours + blockers for project work)
  Node 3: Work Validator        (LLM — real incremental work, matches project scope + admin corrections)
  Node 4: Scope Tracker         (LLM — project completion %, pace, remaining work)
  Node 5: Verdict Agent         (LLM — synthesizes ALL nodes → confidence → decision)

v7.0 Design Changes (from v6.0):
- RAG Context Builder: Retrieves topic knowledge, subtopic coverage, admin corrections
- Confidence = probability of legitimacy. Decision DERIVED from confidence:
    80%+ → approve, 40-79% → pending (human review), <40% → flag
- Parallel fan-out: Time/Content/Progress run simultaneously after RAG
- Enhanced prompts: injected with topic knowledge, learning objectives, subtopics
- Semantic admin wisdom via ChromaDB (replaces brittle icontains keyword match)

Safety:
- Circuit Breaker: LLM unresponsive >15s per node → logic fallback
- Pipeline Guard: Total elapsed >55s → remaining nodes use fallback
- Fallback Penalty: Entries with fallback nodes → PENDING (never auto-approved)
- Admin Override: Human Priority Lock preserved
- Graceful degradation: Missing topic knowledge → works like v6.0
"""
import logging
import json
import re
import time
from decimal import Decimal
from typing import TypedDict, Annotated, List, Dict, Literal, Optional, Any
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
# Fuzzy Keyword Matching (v7.6)
# =============================================================================

def fuzzy_keyword_match(text_lower: str, keyword: str, threshold: float = 0.8) -> bool:
    """
    Bidirectional fuzzy keyword matching for ALL domains.

    Handles:
    - Acronyms → Full forms: "knn" matches "k-nearest neighbors"
    - Full forms → Acronyms: "k-nearest neighbors" matches "knn"
    - Variations: "cross validation" matches "cross-validation"
    - Compound terms: "useState" matches "use state hook"

    Works for: ML, frontend, backend, cybersecurity, DevOps, databases, etc.
    """
    keyword = keyword.lower().strip()
    # Normalize both keyword AND text punctuation equally
    keyword = re.sub(r'[^\w\s-]', '', keyword).strip()
    if not keyword or not text_lower:
        return False

    # Strategy 1: Word-boundary match (not raw substring)
    # Prevents "supervised learning" matching inside "unsupervised learning"
    if re.search(rf'\b{re.escape(keyword)}\b', text_lower):
        return True

    # Strategy 2a: Keyword is multi-word → extract acronym → check text
    # "k-nearest neighbors" → "knn"
    words = re.findall(r'\b\w+', keyword)
    if len(words) > 1:
        acronym = ''.join(w[0] for w in words).lower()
        if len(acronym) >= 2 and re.search(rf'\b{re.escape(acronym)}s?\b', text_lower):
            return True

    # Strategy 2b: Keyword IS a short acronym → expand → check text
    if len(keyword) <= 5 and re.match(r'^[a-z0-9]+$', keyword):
        expansions = {
            'knn': ['k-nearest neighbor', 'k nearest neighbor', 'k-nearest neighbors', 'k nearest neighbors'],
            'knns': ['k-nearest neighbor', 'k nearest neighbor', 'k-nearest neighbors', 'k nearest neighbors'],
            'svm': ['support vector machine', 'support vector machines'],
            'svms': ['support vector machine', 'support vector machines'],
            'cnn': ['convolutional neural network', 'convolutional neural networks'],
            'cnns': ['convolutional neural network', 'convolutional neural networks'],
            'rnn': ['recurrent neural network', 'recurrent neural networks'],
            'rnns': ['recurrent neural network', 'recurrent neural networks'],
            'lstm': ['long short-term memory', 'long short term memory'],
            'lstms': ['long short-term memory', 'long short term memory'],
            'gru': ['gated recurrent unit', 'gated recurrent units'],
            'grus': ['gated recurrent unit', 'gated recurrent units'],
            'gan': ['generative adversarial network', 'generative adversarial networks'],
            'gans': ['generative adversarial network', 'generative adversarial networks'],
            'pca': ['principal component analysis'],
            'nlp': ['natural language processing'],
            'jwt': ['json web token', 'json web tokens'],
            'jwts': ['json web token', 'json web tokens'],
            'api': ['application programming interface'],
            'apis': ['application programming interface'],
            'rest': ['representational state transfer'],
            'crud': ['create read update delete'],
            'orm': ['object relational mapping', 'object-relational mapping'],
            'orms': ['object relational mapping', 'object-relational mapping'],
            'xss': ['cross-site scripting', 'cross site scripting'],
            'csrf': ['cross-site request forgery', 'cross site request forgery'],
            'sql': ['structured query language'],
            'dom': ['document object model'],
            'jsx': ['javascript xml'],
            'tsx': ['typescript xml'],
            'npm': ['node package manager'],
            'cli': ['command line interface'],
            'sdk': ['software development kit'],
            'sdks': ['software development kit'],
            'ci': ['continuous integration'],
            'cd': ['continuous deployment', 'continuous delivery'],
            'oop': ['object oriented programming', 'object-oriented programming'],
            'mvc': ['model view controller', 'model-view-controller'],
            'ssl': ['secure sockets layer'],
            'tls': ['transport layer security'],
            'dns': ['domain name system'],
            'ssh': ['secure shell'],
        }
        # v8.0: Try direct match first, then singular-stripping fallback
        lookup_key = keyword
        if keyword not in expansions and keyword.endswith('s') and len(keyword) > 2:
            lookup_key = keyword.rstrip('s')  # svms → svm
        if lookup_key in expansions:
            for expansion in expansions[lookup_key]:
                if expansion in text_lower:
                    return True

    # Strategy 3: Fuzzy n-gram match for close variations
    keyword_normalized = re.sub(r'[-_\s]+', ' ', keyword.strip())
    # Normalize punctuation for cleaner token matching
    text_cleaned = re.sub(r'[^\w\s-]', ' ', text_lower)
    text_words = text_cleaned.split()
    keyword_word_count = len(keyword_normalized.split())
    for i in range(len(text_words) - keyword_word_count + 1):
        text_ngram = ' '.join(text_words[i:i + keyword_word_count])
        similarity = SequenceMatcher(None, keyword_normalized, text_ngram).ratio()
        if similarity >= threshold:
            return True

    # Strategy 4: Compound term decomposition
    keyword_parts = re.split(r'[-_\s]+', keyword)
    if len(keyword_parts) > 1:
        significant_parts = [p for p in keyword_parts if len(p) > 2]
        if significant_parts and all(
            any(part in word for word in text_words)
            for part in significant_parts
        ):
            return True

    # Strategy 5: Core-term matching (ignore generic qualifiers)
    # When KB has "mse loss function" but entry just says "MSE",
    # the core term "mse" is what matters — "loss", "function" are generic.
    GENERIC_QUALIFIERS = {
        'function', 'functions', 'method', 'methods', 'algorithm', 'algorithms',
        'technique', 'techniques', 'model', 'models', 'architecture', 'architectures',
        'parameter', 'parameters', 'metric', 'metrics', 'index', 'indices',
        'loss', 'score', 'layer', 'layers', 'network', 'networks',
        'learning', 'analysis', 'process', 'processing', 'system', 'systems',
        'structure', 'structures', 'operation', 'operations', 'evaluation',
        'initialization', 'optimization', 'regularization', 'classification',
        'regression', 'clustering', 'detection', 'recognition', 'generation',
    }
    if len(keyword_parts) > 1:
        core_parts = [p for p in keyword_parts if p.lower() not in GENERIC_QUALIFIERS and len(p) > 2]
        if core_parts and len(core_parts) < len(significant_parts):
            # We have at least one generic qualifier stripped
            if all(
                any(part in word for word in text_words)
                for part in core_parts
            ):
                return True

    # Strategy 6: Stem-aware matching
    # Handles: "evaluated" vs "evaluation", "configured" vs "configuration"
    STEM_SUFFIXES = ['tion', 'sion', 'ment', 'ing', 'ed', 'er', 'ize', 'ise', 'ity', 'ness', 'ous', 'ive', 'al', 'ly']
    def stem(word):
        w = word.lower()
        for suffix in sorted(STEM_SUFFIXES, key=len, reverse=True):
            if w.endswith(suffix) and len(w) - len(suffix) >= 3:
                return w[:-len(suffix)]
        return w

    keyword_stems = set(stem(p) for p in keyword_parts if len(p) > 2)
    if keyword_stems:
        text_stems = set(stem(w) for w in text_words if len(w) > 2)
        if keyword_stems.issubset(text_stems):
            return True

    return False

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
    v8.0: Extract the Verdict Agent's final decision.
    Decision is DERIVED from confidence score:
      ≥70% → approve, <70% → pending
    Returns (decision: str, confidence: int, reasoning: str)
    """
    if not response:
        return 'pending', 50, ''

    reasoning = ''
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

    # Extract confidence FIRST (v7.0: decision derived from confidence)
    conf_match = re.search(r'Confidence:\s*(\d+)', response, re.IGNORECASE)
    if conf_match:
        confidence = max(0, min(100, int(conf_match.group(1))))
    else:
        # Fallback: try to infer from LLM's stated decision
        decision_match = re.search(
            r'(?:Decision|Verdict|Final):\s*(APPROVE|FLAG|PENDING|PASS|CONCERN|FAIL)',
            response, re.IGNORECASE
        )
        if decision_match:
            raw = decision_match.group(1).upper()
            confidence = {'APPROVE': 85, 'PASS': 85, 'FLAG': 30, 'CONCERN': 55, 'PENDING': 55, 'FAIL': 20}.get(raw, 50)
        else:
            confidence = 50

    # v8.0: Binary decision DERIVED from confidence score
    if confidence >= 70:
        decision = 'approve'
    else:
        decision = 'pending'

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



def merge_dicts(a: Dict, b: Dict) -> Dict:
    res = (a or {}).copy()
    res.update(b or {})
    return res

def max_ints(a: int, b: int) -> int:
    return max(a or 0, b or 0)

def merge_lists(a: list, b: list) -> list:
    res = (a or []).copy()
    for item in (b or []):
        if item not in res: res.append(item)
    return res

class BrainStateCore(TypedDict):
    """Required core fields for the v7.5 RAG-Enhanced Dual Pipeline AI Brain."""
    entry_id: int
    entry_data: Dict
    topic_name: str
    topic_difficulty: int
    user_experience: float
    benchmark_hours: float
    intent: IntentType
    project_name: Optional[str]
    project_description: Optional[str]
    # Rich estimation context (v7.5 — from UserPlanEstimateView formula)
    topic_domain: str
    topic_language: Optional[str]
    user_tech_stack: List[str]
    user_primary_domain: str
    experience_tier: str
    estimation_breakdown: Dict
    # Context from Node 0
    prior_entries_count: int
    prior_entries_summaries: List[str]
    prior_entries_full: List[str]  # v7.6: Full 500-char entries for LLM prompts (max 20)
    prior_entries_compact: str     # v8.0: Token-efficient 3-line summary
    prior_full_texts: List[str]  # v7.0: Full learned_text for subtopic matching (ALL entries)
    copy_paste_max_similarity: float
    copy_paste_flagged: bool
    progress_coherent: bool
    is_completed: bool
    learning_status: str  # v8.0: 'in_progress' or 'completed'
    total_hours_invested: float
    progress_trajectory: List[Dict]
    estimated_total_hours: float
    context_summary: str
    blocker_summary: str
    # Learner velocity
    learner_avg_hours: float
    learner_entry_count: int
    # RAG context (v7.0 — populated by RAG Context Builder)
    rag_topic_knowledge: Optional[Dict]       # Full knowledge dict from DB/ChromaDB
    rag_relevant_subtopics: List[str]          # All subtopics for this topic
    rag_validation_keywords: List[str]         # All keywords for validation
    rag_what_it_is: str                        # Topic description
    rag_what_you_will_learn: List[str]          # Learning objectives list
    rag_concepts_covered_prior: List[str]      # Subtopics demonstrated in PRIOR entries
    rag_concepts_covered_current: List[str]    # Subtopics THIS entry appears to cover
    rag_concepts_new: List[str]                # NEW subtopics (current - prior)
    rag_concepts_remaining: List[str]          # Subtopics NOT YET covered
    rag_coverage_ratio: float                  # covered/total subtopics
    rag_topic_mismatch: Optional[Dict]         # Topic mismatch detection result (if content matches a different topic)
    rag_admin_corrections: List[str]           # Semantically matched admin wisdom
    rag_context_summary: str                   # Full RAG context for prompt injection
    rag_concepts_related_unlisted: List[str]   # v9.0: Related concepts not in subtopic list
    # Node verdicts (accumulated by each node)
    node_verdicts: Annotated[Dict[str, Dict], merge_dicts]
    # Circuit breaker
    llm_latency: float
    ai_failures: Annotated[int, max_ints]
    pipeline_start: float
    # Final outputs
    final_confidence: float
    final_decision: str
    reasoning_logs: Annotated[Dict[str, Any], merge_dicts]
    errors: Annotated[List[str], merge_lists]


class BrainStateOptional(TypedDict, total=False):
    """
    Optional/dynamic keys populated at runtime by pipeline nodes.
    total=False means none are required in the constructor.
    """
    # RAG v9.0 extension
    rag_concepts_related_unlisted: List[str]
    # Project context (v7.7+ — populated by Node 0 for SBU tasks)
    project_key_modules: List[str]
    project_out_of_scope: List[str]
    project_tech_stack: str
    project_success_criteria: str
    project_start_date: Any
    project_end_date: Any
    project_tech_frontend: str
    project_tech_backend: str
    project_tech_database: str
    project_tech_cloud: str
    project_features: List[Dict]
    project_team: List[Dict]
    project_is_team: bool
    user_project_role: str
    db_module_status: Dict
    target_module: str
    feature_status: str
    # Per-user and project-parallel hours (v9.0)
    user_hours_invested: float
    project_parallel_hours: float
    # Feature-level hours (v7.8)
    feature_total_hours: float
    user_feature_hours: float
    feature_team_size: int
    # Module tracking (v9.0 — populated by RAG Context Builder for SBU)
    project_modules_completed: List[str]
    project_modules_in_progress: List[str]
    project_modules_current: str
    project_modules_remaining: List[str]
    project_module_coverage: float
    project_exact_module_tracking: Dict
    # Git Commit Validation (Phase 2 — advisory signal, SBU entries only)
    git_validation_result: str
    git_score_adjustment: float
    git_evidence: Dict


class BrainState(BrainStateCore, BrainStateOptional):  # type: ignore[misc]
    """Combined AI Brain state: required core fields + optional dynamic SBU fields."""
    pass


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
    "You are part of a 6-Node  Brain Pipeline of a responsible Manager  that validates learning  entries for an IT firm where learners track their daily learning activities.\n"
    "This is a learning tracking system where employees log daily learning activities.\n"
    "\n"
    "Pipeline architecture:\n"
    "  Node 0 - Context Gatherer: Gathers ALL learner history for this topic \n"
    "  Node 1 - RAG Context Builder: Retrieves topic knowledge, subtopic coverage, admin corrections (no LLM)\n"
    "  Node 2 - Time Reasoner: Assesses if claimed hours are reasonable [PARALLEL]\n"
    "  Node 3 - Content Validator: Evaluates genuine learning, topic match, depth [PARALLEL]\n"
    "  Node 4 - Progress Analyzer: Checks progress coherence, subtopic coverage [PARALLEL]\n"
    "  Node 5 - Verdict Agent: Synthesizes ALL findings → confidence score → decision\n"
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
    "You are part of a 6-Node  Brain Pipeline of a responsible Manager of an reputated IT firm that validates project work entries.\n"
    "This is a learning tracking system where employees log daily project/debugging work.\n"
    "\n"
    "Pipeline architecture:\n"
    "  Node 0 - Context Gatherer: Gathers ALL project history and description (no LLM)\n"
    "  Node 1 - RAG Context Builder: Retrieves admin corrections for project validation (no LLM)\n"
    "  Node 2 - Time Reasoner: Assesses if claimed hours are reasonable for project work + blockers\n"
    "  Node 3 - Work Validator: Evaluates if description shows real incremental project progress\n"
    "  Node 4 - Scope Tracker: Checks project completion %, pace, remaining work\n"
    "  Node 5 - Verdict Agent: Synthesizes ALL node findings into final decision\n"
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

    # v7.7 Phase 2: Fetch Project object + team for project entries
    if is_project and entry_data.get('user_id'):
        try:
            from .models import Project, ProjectAssignment, ProjectFeature
            project_obj = Project.objects.filter(
                name=state.get('project_name'), is_active=True
            ).first()
            if project_obj:
                state['project_key_modules'] = project_obj.key_modules or []
                state['project_out_of_scope'] = project_obj.out_of_scope or []
                state['project_tech_stack'] = project_obj.tech_stack or ''
                state['project_success_criteria'] = project_obj.success_criteria or ''
                # v9.0: Pass timeline for deadline awareness
                state['project_start_date'] = project_obj.start_date
                state['project_end_date'] = project_obj.end_date
                # v9.0: Read structured tech fields
                state['project_tech_frontend'] = project_obj.tech_frontend or ''
                state['project_tech_backend'] = project_obj.tech_backend or ''
                state['project_tech_database'] = project_obj.tech_database or ''
                state['project_tech_cloud'] = project_obj.tech_cloud or ''
                # v9.0: Read ProjectFeature objects (overrides flat key_modules)
                features_qs = ProjectFeature.objects.filter(project=project_obj)
                features_list = list(features_qs)
                if features_list:
                    state['project_features'] = [
                        {
                            'name': f.name,
                            'description': f.description,
                            'success_criteria': f.success_criteria,
                            'out_of_scope': f.out_of_scope or [],
                            'status': f.status,
                        }
                        for f in features_list
                    ]
                    # Override key_modules with feature names
                    state['project_key_modules'] = [f.name for f in features_list]
                    # Merge per-feature out_of_scope into global
                    all_oos = list(project_obj.out_of_scope or [])
                    for f in features_list:
                        all_oos.extend(f.out_of_scope or [])
                    state['project_out_of_scope'] = list(set(all_oos))
                # v7.8: Read target_module and feature_status from entry
                entry_obj = Entry.objects.filter(id=entry_id).first()
                if entry_obj:
                    state['target_module'] = entry_obj.target_module or ''
                    state['feature_status'] = entry_obj.feature_status or 'in_progress'
                # v7.8: Compute module completion from DB (exact data, no fuzzy matching needed)
                if project_obj.key_modules:
                    module_entries = Entry.objects.filter(
                        project=project_obj, is_active=True,
                        target_module__isnull=False
                    ).exclude(id=entry_id).values('target_module', 'feature_status', 'user__email')
                    db_module_status = {}  # {module: {status, users}}
                    for me in module_entries:
                        mod = me['target_module']
                        if mod not in db_module_status:
                            db_module_status[mod] = {'status': 'in_progress', 'users': set()}
                        if me['feature_status'] == 'completed':
                            db_module_status[mod]['status'] = 'completed'
                        db_module_status[mod]['users'].add(me.get('user__email', ''))
                    state['db_module_status'] = {
                        k: {'status': v['status'], 'users': list(v['users'])}
                        for k, v in db_module_status.items()
                    }
                # Fetch team with roles
                assignments = ProjectAssignment.objects.filter(
                    project=project_obj
                ).select_related('user')
                team = []
                user_role = 'general'
                for a in assignments:
                    member = {
                        'id': a.user_id,
                        'name': a.user.full_name or a.user.email,
                        'email': a.user.email,
                        'role': a.role,
                    }
                    team.append(member)
                    if a.user_id == entry_data.get('user_id'):
                        user_role = a.role
                state['project_team'] = team
                state['user_project_role'] = user_role
                state['project_is_team'] = len(team) > 1
                logger.debug(
                    f"Project fetch: {project_obj.name} — "
                    f"{len(project_obj.key_modules or [])} modules, "
                    f"{len(team)} team members, role={user_role}"
                )
        except Exception as e:
            logger.debug(f"Project object fetch failed: {e}")

    # ── Fetch ALL prior entries for this user+topic/project ──
    if state['topic_name'] and state['topic_name'] != 'N/A':
        prior_qs = Entry.objects.filter(
            user_id=entry_data.get('user_id'),
            topic__name=state['topic_name'],
            is_active=True,
        ).exclude(id=entry_id).order_by('-date')
    elif state.get('project_name'):
        prior_qs = Entry.objects.filter(
            project_name=state['project_name'],
            is_active=True,
        ).exclude(id=entry_id).order_by('-date')
    else:
        prior_qs = Entry.objects.none()

    prior_entries = list(prior_qs.values(
        'id', 'date', 'hours', 'learned_text', 'progress_percent',
        'is_completed', 'ai_decision', 'status', 'user_id',
        'target_module', 'feature_status'
    ))
    prior_count = len(prior_entries)

    # ── Total hours invested ──
    total_hours = sum(float(e.get('hours', 0)) for e in prior_entries) + float(entry_data.get('hours', 0))

    # v9.0: Team project parallel hours
    if is_project and state.get('project_is_team'):
        # Per-user hours (for this user's time assessment)
        user_hours = sum(
            float(e.get('hours', 0)) for e in prior_entries
            if e.get('user_id') == entry_data.get('user_id')
        ) + float(entry_data.get('hours', 0))
        state['user_hours_invested'] = round(user_hours, 2)
        # Project-parallel hours (max per date, for project pace)
        from collections import defaultdict
        hours_by_date = defaultdict(float)
        for e in prior_entries:
            d = str(e['date'])
            hours_by_date[d] = max(hours_by_date[d], float(e.get('hours', 0)))
        hours_by_date['current'] = float(entry_data.get('hours', 0))
        state['project_parallel_hours'] = round(sum(hours_by_date.values()), 2)
    else:
        state['user_hours_invested'] = round(total_hours, 2)
        state['project_parallel_hours'] = round(total_hours, 2)

    # ─── SBU-4: FEATURE-LEVEL HOURS TRACKING ───
    # Uses the already-fetched prior_entries list — zero additional DB queries.
    if is_project and state.get('target_module'):
        try:
            _tm = state.get('target_module', '')
            _feature_entries = [
                e for e in prior_entries
                if e.get('target_module') == _tm
            ]
            _feat_total = sum(float(e.get('hours', 0)) for e in _feature_entries) + float(entry_data.get('hours', 0))
            _uid = entry_data.get('user_id')
            _feat_user = sum(
                float(e.get('hours', 0)) for e in _feature_entries
                if e.get('user_id') == _uid
            ) + float(entry_data.get('hours', 0))
            _feat_users = set(e.get('user_id') for e in _feature_entries if e.get('user_id'))
            _feat_users.add(_uid)
            state['feature_total_hours'] = round(_feat_total, 2)
            state['user_feature_hours'] = round(_feat_user, 2)
            state['feature_team_size'] = len(_feat_users)
        except Exception as _e:
            logger.debug(f"Feature hours tracking failed: {_e}")
            state['feature_total_hours'] = 0.0
            state['user_feature_hours'] = 0.0
            state['feature_team_size'] = 1
    else:
        state['feature_total_hours'] = 0.0
        state['user_feature_hours'] = 0.0
        state['feature_team_size'] = 1

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

    # ── Estimated total hours (v7.5: Rich formula from UserPlanEstimateView) ──
    benchmark = state['benchmark_hours']
    difficulty = state['topic_difficulty']
    exp = state['user_experience']

    # Experience factor (5-tier system — matches UserPlanEstimateView)
    if exp < 1.0:
        exp_factor, exp_tier = 1.4, 'junior'
    elif exp < 2.5:
        exp_factor, exp_tier = 1.2, 'rising'
    elif exp < 5.0:
        exp_factor, exp_tier = 1.0, 'mid'
    elif exp < 8.0:
        exp_factor, exp_tier = 0.85, 'senior'
    else:
        exp_factor, exp_tier = 0.75, 'expert'

    # Domain penalty (+30% base if topic domain ≠ user domain, scaled by difficulty)
    domain_penalty = 0.0
    topic_domain = state.get('topic_domain', 'general')
    user_domain = state.get('user_primary_domain', 'general')
    if topic_domain != 'general' and topic_domain != user_domain:
        diff_mult = 0.5 if difficulty <= 2 else (1.5 if difficulty >= 4 else 1.0)
        domain_penalty = 0.3 * diff_mult

    # Language friction (+20% base if topic language not in user stack)
    language_penalty = 0.0
    topic_lang = state.get('topic_language')
    user_stack = set(t.lower().strip() for t in state.get('user_tech_stack', []))
    if topic_lang and topic_lang.lower().strip() not in user_stack:
        diff_mult = 0.5 if difficulty <= 2 else (1.5 if difficulty >= 4 else 1.0)
        language_penalty = 0.2 * diff_mult

    # Combined: Estimate = Base × (ExpFactor + DomainPenalty + LanguagePenalty)
    total_factor = exp_factor + domain_penalty + language_penalty
    estimated_total = round(benchmark * total_factor, 1)
    if is_project:
        estimated_total = max(estimated_total, 10.0)

    state['experience_tier'] = exp_tier
    state['estimation_breakdown'] = {
        'exp_factor': round(exp_factor, 2),
        'exp_tier': exp_tier,
        'domain_penalty': round(domain_penalty, 2),
        'language_penalty': round(language_penalty, 2),
        'total_factor': round(total_factor, 2),
    }

    # ── Copy-paste detection (last 10 for performance) ──
    max_sim = 0.0
    for prev in prior_entries[:10]:
        prev_text = prev.get('learned_text', '')
        j_sim = jaccard_similarity(current_text, prev_text)
        s_sim = sequence_similarity(current_text, prev_text)
        max_sim = max(max_sim, j_sim, s_sim)
    copy_paste_flagged = max_sim > 0.85  # v8.0: raised from 0.70 — sequential subtopic entries share vocabulary

    # ── Full texts for RAG subtopic matching (ALL entries, no cap) ──
    full_prior_texts = []
    for prev in prior_entries:  # v7.6: NO cap — RAG needs ALL entries
        full_prior_texts.append(prev.get('learned_text', ''))

    # ── Full-text entries for LLM prompts (max 20 most recent) ──
    MAX_ENTRIES_FOR_LLM = 20
    prior_entries_full = []
    for prev in prior_entries[:MAX_ENTRIES_FOR_LLM]:
        entry_text = (prev.get('learned_text') or '')[:500]
        # v7.7: For project entries, show which user wrote the entry
        user_tag = ''
        if is_project:
            prev_uid = prev.get('user_id')
            team = state.get('project_team', [])
            member = next((m for m in team if m['id'] == prev_uid), None)
            if member:
                user_tag = f" [{member.get('name') or member.get('email', '?')} ({member.get('role', 'member')})]"
        prior_entries_full.append(
            f"[{prev['date']}]{user_tag} {float(prev['hours'])}h — "
            f"Status: {'completed' if prev.get('is_completed') else 'in_progress'} — "
            f"Review: {prev.get('status', '?')}\n"
            f"Description: \"{entry_text}\""
        )

    # ── Legacy summaries (kept for backwards compat) ──
    summaries = []
    for prev in prior_entries[:10]:
        summaries.append(
            f"[{prev['date']}] {float(prev['hours'])}h — "
            f"\"{(prev.get('learned_text') or '')[:120]}\" "
            f"(status: {'completed' if prev.get('is_completed') else 'in_progress'}, "
            f"review: {prev.get('status', '?')})"
        )

    # ── Progress coherence check (v8.0: binary) ──
    is_completed = entry_data.get('is_completed', False)
    learning_status = 'completed' if is_completed else 'in_progress'
    progress_coherent = True
    progress_note = ""

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

    # ── Pace analysis (v8.0: uses hours + coverage, not progress_percent) ──
    if prior_count > 0 and total_hours > 0:
        hours_per_entry = total_hours / (prior_count + 1)
        coverage_ratio = state.get('rag_coverage_ratio', 0)
        if estimated_total > 0:
            time_usage_pct = (total_hours / estimated_total) * 100
            est_remaining = max(0, estimated_total - total_hours)
        else:
            time_usage_pct = 0
            est_remaining = 0
        pace = (
            f"Pace: {hours_per_entry:.2f}h/entry avg, "
            f"coverage: {coverage_ratio:.0%}, "
            f"time used: {time_usage_pct:.0f}% of benchmark, "
            f"~{est_remaining:.1f}h remaining."
        )
    else:
        pace = "First entry — no pace baseline yet."

    # ── Build rich context summary ──
    ctx = []
    est_info = state.get('estimation_breakdown', {})
    if is_project:
        ctx.append(
            f"PROJECT '{state.get('project_name', '?')}' — "
            f"Entry #{prior_count + 1}, {total_hours:.2f}h invested, status: {learning_status}."
        )
        if state.get('project_description'):
            ctx.append(f"Description: \"{state['project_description'][:200]}\"")
    else:
        ctx.append(
            f"TOPIC '{state['topic_name']}' (difficulty {difficulty}/5) — "
            f"Entry #{prior_count + 1}, {total_hours:.2f}h invested, "
            f"~{estimated_total:.2f}h estimated ({est_info.get('exp_tier', 'mid')} tier, {est_info.get('total_factor', 1.0):.2f}x), "
            f"status: {learning_status}."
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
    # v8.0: Build compact prior entries summary for LLM prompts (~100 tokens vs ~3500)
    recent_3 = prior_entries[:3]
    compact_lines = []
    for prev in recent_3:
        compact_lines.append(
            f"[{prev.get('date', '?')}] {float(prev.get('hours', 0))}h | {(prev.get('learned_text') or '')[:80].strip()}"
        )
    if prior_count > 3:
        older_hours = sum(float(e.get('hours', 0)) for e in prior_entries[3:])
        compact_lines.append(f"[+{prior_count - 3} earlier entries — {older_hours:.1f}h total]")

    state['prior_entries_count'] = prior_count
    state['prior_entries_summaries'] = summaries  # Legacy (120-char)
    state['prior_entries_full'] = prior_entries_full  # v7.6: Full 500-char (max 20)
    state['prior_entries_compact'] = "\n".join(compact_lines) if compact_lines else "No prior entries."  # v8.0: token-efficient
    state['prior_full_texts'] = full_prior_texts  # v7.0: full texts for RAG (ALL entries)
    state['copy_paste_max_similarity'] = round(max_sim, 3)
    state['copy_paste_flagged'] = copy_paste_flagged
    state['progress_coherent'] = progress_coherent
    state['is_completed'] = is_completed
    state['learning_status'] = learning_status  # v8.0: replaces progress_percent
    state['total_hours_invested'] = round(total_hours, 2)
    state['progress_trajectory'] = trajectory
    state['estimated_total_hours'] = estimated_total
    state['context_summary'] = context_summary
    state['blocker_summary'] = blocker_summary

    context_evidence = (
        f"Prior entries: {prior_count} | Total hours: {total_hours:.2f}h\n"
        f"Status: {learning_status} {'(Complete)' if is_completed else ''}\n"
        f"Estimated total: ~{estimated_total:.2f}h\n"
        f"{pace}\n"
        f"Blockers: {blocker_summary}\n"
        f"Copy-paste: {'FLAGGED ' + str(round(max_sim * 100, 1)) + '%' if copy_paste_flagged else 'Clear'}\n"
        f"Coherence: {'OK' if progress_coherent else progress_note}"
    )
    state['reasoning_logs']['context_analysis'] = {
        'summary': context_summary,
        'score': None,
        'verdict': None,
        'path': 'logic',
        'path_reason': (
            f'Context Gatherer is logic-only — aggregates data for downstream AI nodes. '
            f'Gathered {prior_count} prior entries, {total_hours:.2f}h total invested, '
            f'{"copy-paste flagged" if copy_paste_flagged else "no copy-paste"}, '
            f'{"incoherent progress" if not progress_coherent else "coherent progress"}.'
        ),
        'details': context_evidence,
        'evidence': context_evidence,
        'llm_reasoning': None,
        'rag_analysis': None,
        'guards': [],
        'remaining': None,
    }
    return state


# =============================================================================
# Shared Node 1: RAG Context Builder (Logic only — no LLM)
# =============================================================================

def rag_context_builder(state: BrainState) -> BrainState:
    """
    v7.0 RAG Context Builder. Pure retrieval — no LLM call.
    Fetches topic knowledge + admin wisdom + computes concept coverage.
    Runs AFTER context_gatherer, BEFORE all validation nodes.
    Handles both learning and project pipelines.
    Degrades gracefully if no topic knowledge found.
    """
    intent = state['intent']
    is_project = intent == 'sbu_tasks'
    topic_name = state['topic_name']

    try:
        from .rag_engine import RAGEngine
        rag = RAGEngine.get_instance()
    except Exception as e:
        logger.warning(f"RAGEngine init failed: {e}. Continuing without RAG.")
        state['rag_context_summary'] = "No RAG available — RAG engine failed to initialize."
        state['reasoning_logs']['rag_context'] = {
            'summary': f"RAG unavailable: {str(e)[:80]}",
            'score': None, 'verdict': None, 'path': 'breaker',
            'path_reason': f"RAG engine initialization failed: {str(e)[:100]}",
            'details': f"Error: {str(e)[:200]}. Pipeline continues without RAG (v6.0 fallback).",
            'evidence': f"Error: {str(e)[:200]}",
            'llm_reasoning': None,
            'rag_analysis': None,
            'guards': [],
            'remaining': None,
        }
        return state

    # ── Resolve roadmap_id from user's training plan ──
    roadmap_id = None
    try:
        from apps.training_plans.models import PlanAssignment
        user_id = state['entry_data'].get('user_id')
        if user_id:
            assignment = PlanAssignment.objects.filter(
                user_id=user_id
            ).select_related('plan').first()
            if assignment and hasattr(assignment.plan, 'source_template'):
                roadmap_id = assignment.plan.source_template
    except Exception as e:
        logger.debug(f"Roadmap resolution failed: {e}")

    exact_matched = False
    knowledge = None

    if not is_project:
        # ── PRIMARY: Exact PostgreSQL lookup ──
        knowledge = rag.get_exact_topic_knowledge(topic_name, roadmap_id)
        if knowledge:
            exact_matched = True
        else:
            # ── FALLBACK: Semantic search from ChromaDB ──
            results = rag.query_topic_knowledge(
                topic_name,
                state['entry_data'].get('learned_text', ''),
                roadmap_id=roadmap_id, n=1,
            )
            if results:
                # Convert dict result to "knowledge-like" object
                knowledge = type('SemanticResult', (), results[0])()

    # ── Populate RAG state fields ──
    if knowledge and not is_project:
        what_it_is = getattr(knowledge, 'what_it_is', '') or ''
        what_you_will_learn = getattr(knowledge, 'what_you_will_learn', []) or []
        subtopics = getattr(knowledge, 'subtopics', []) or []
        validation_keywords = getattr(knowledge, 'validation_keywords', []) or []

        state['rag_what_it_is'] = what_it_is
        state['rag_what_you_will_learn'] = what_you_will_learn
        state['rag_relevant_subtopics'] = subtopics
        state['rag_validation_keywords'] = validation_keywords
        state['rag_topic_knowledge'] = {
            'what_it_is': what_it_is,
            'what_you_will_learn': what_you_will_learn,
            'subtopics': subtopics,
            'validation_keywords': validation_keywords,
        }

        # ── Compute concept coverage across prior entries ──
        all_concepts = set(
            [s.lower() for s in subtopics] +
            [k.lower() for k in validation_keywords]
        )

        # What prior entries covered (v7.6: fuzzy matching)
        concepts_covered = set()
        for prev_text in state.get('prior_full_texts', []):
            prev_lower = (prev_text or '').lower()
            for kw in all_concepts:
                if fuzzy_keyword_match(prev_lower, kw, threshold=0.8):
                    concepts_covered.add(kw)

        # What THIS entry covers (v7.6: fuzzy matching)
        current_lower = state['entry_data'].get('learned_text', '').lower()
        concepts_current = set()
        for kw in all_concepts:
            if fuzzy_keyword_match(current_lower, kw, threshold=0.8):
                concepts_current.add(kw)

        # Auto-credit topic name — submitting under "Unsupervised Learning" implies the topic
        topic_lower = state['topic_name'].lower()
        if topic_lower in all_concepts:
            concepts_current.add(topic_lower)

        concepts_new = concepts_current - concepts_covered
        concepts_remaining = all_concepts - concepts_covered - concepts_current
        coverage_ratio = len(concepts_covered | concepts_current) / len(all_concepts) if all_concepts else 0

        state['rag_concepts_covered_prior'] = list(concepts_covered)
        state['rag_concepts_covered_current'] = list(concepts_current)
        state['rag_concepts_new'] = list(concepts_new)
        state['rag_concepts_remaining'] = list(concepts_remaining)
        # Subtopic-only remaining (for display pills — excludes keyword-only items)
        subtopics_remaining = set(s.lower() for s in subtopics) - concepts_covered - concepts_current
        state['rag_subtopics_remaining'] = list(subtopics_remaining)
        state['rag_coverage_ratio'] = round(coverage_ratio, 3)

        # v8.0: Subtopic depth tracking — how many entries mention each concept
        subtopic_frequency = {}
        for kw in all_concepts:
            count = 0
            for prev_text in state.get('prior_full_texts', []):
                prev_lower = (prev_text or '').lower()
                if fuzzy_keyword_match(prev_lower, kw, threshold=0.8):
                    count += 1
            if fuzzy_keyword_match(current_lower, kw, threshold=0.8):
                count += 1
            if count > 0:
                subtopic_frequency[kw] = count
        state['rag_subtopic_frequency'] = subtopic_frequency
        # Summary: concepts touched 3+ times = deep, 1 time = shallow
        deep_concepts = [k for k, v in subtopic_frequency.items() if v >= 3]
        shallow_concepts = [k for k, v in subtopic_frequency.items() if v == 1]
        state['rag_depth_summary'] = {
            'deep': deep_concepts,
            'shallow': shallow_concepts,
            'avg_frequency': round(sum(subtopic_frequency.values()) / len(subtopic_frequency), 1) if subtopic_frequency else 0,
        }

        # v7.6 Fix 9: Identify valid related concepts NOT in knowledge base
        # Recognized in prompts but NOT added to coverage_ratio
        unmatched_valid_concepts = set()
        entry_terms = set()
        acronym_pattern = r'\b[A-Z]{2,}\b'
        compound_pattern = r'\b\w+[-_]\w+\b'
        entry_raw = state['entry_data'].get('learned_text', '')

        for term in re.findall(acronym_pattern, entry_raw):
            term_lower = term.lower()
            # Fix C: Also check if term is a substring of any KB concept
            in_kb = term_lower in all_concepts or any(term_lower in c for c in all_concepts)
            if not in_kb and len(term) > 1:
                entry_terms.add(term_lower)

        for term in re.findall(compound_pattern, entry_raw):
            term_lower = term.lower()
            # Fix C: Also check if term is a substring of any KB concept
            in_kb = term_lower in all_concepts or any(term_lower in c for c in all_concepts)
            if not in_kb and len(term) > 3:
                entry_terms.add(term_lower)

        # Check if unmatched terms appear near matched concepts
        if entry_terms and concepts_current:
            entry_lower = current_lower
            for term in entry_terms:
                term_pos = entry_lower.find(term)
                if term_pos >= 0:
                    ctx_start = max(0, term_pos - 50)
                    ctx_end = min(len(entry_lower), term_pos + len(term) + 50)
                    context = entry_lower[ctx_start:ctx_end]
                    if any(kw in context for kw in concepts_current):
                        unmatched_valid_concepts.add(term)

        state['rag_concepts_related_unlisted'] = list(unmatched_valid_concepts)

        # ── TOPIC MISMATCH DETECTION ──
        # Semantic search across ALL topics using content-only query (no topic_name bias).
        # Uses RANK-based detection (not absolute similarity) because ChromaDB uses L2 distance.
        # If the assigned topic doesn't appear in top results, content likely belongs elsewhere.
        try:
            entry_text_for_search = state['entry_data'].get('learned_text', '')
            if entry_text_for_search and len(entry_text_for_search) > 20:
                _coll_count = rag.topic_collection.count()
                if _coll_count == 0:
                    logger.warning("Topic mismatch: ChromaDB topic collection is empty. Run build_topic_index().")
                else:
                    _words = entry_text_for_search.lower().split()[:25]
                    _content_query = f"Learning concepts: {entry_text_for_search[:400]}. Key terms: {', '.join(_words)}"
                    try:
                        _raw = rag.topic_collection.query(
                            query_texts=[_content_query],
                            n_results=min(10, _coll_count),
                        )
                    except Exception as _qe:
                        logger.warning(f"Topic mismatch ChromaDB query failed: {_qe}")
                        _raw = None

                    if _raw and _raw.get('ids') and _raw['ids'][0]:
                        assigned_lower = topic_name.lower().strip()
                        assigned_rank = None
                        assigned_dist = None
                        best_other = None

                        for _i, _doc_id in enumerate(_raw['ids'][0]):
                            _meta = _raw['metadatas'][0][_i] if _raw.get('metadatas') else {}
                            _dist = _raw['distances'][0][_i] if _raw.get('distances') else 999.0
                            _r_name = _meta.get('topic_name', '').lower().strip()

                            if _r_name == assigned_lower and assigned_rank is None:
                                assigned_rank = _i
                                assigned_dist = _dist
                            elif _r_name != assigned_lower and best_other is None:
                                best_other = {'topic_name': _meta.get('topic_name', '?'), 'dist': _dist, 'rank': _i}

                        logger.info(
                            f"TOPIC MISMATCH check ({_coll_count} docs): "
                            f"assigned='{topic_name}' rank={assigned_rank} "
                            f"dist={assigned_dist if assigned_dist is not None else 'N/A'}, "
                            f"best_other='{best_other['topic_name'] if best_other else 'N/A'}' "
                            f"rank={best_other['rank'] if best_other else 'N/A'} "
                            f"dist={best_other['dist'] if best_other else 'N/A'}"
                        )

                        # Rank-based mismatch detection (works with any distance metric)
                        if best_other:
                            mismatch = False
                            if assigned_rank is None:
                                # Assigned topic not in top 10 at all → strong mismatch
                                mismatch = True
                            elif best_other['rank'] < assigned_rank:
                                # Different topic ranks higher — check meaningful gap
                                if assigned_dist is not None and best_other['dist'] < assigned_dist * 0.85:
                                    mismatch = True

                            if mismatch:
                                # Compute display similarity as relative closeness (0-1 scale)
                                _all_dists = [_raw['distances'][0][j] for j in range(len(_raw['ids'][0]))]
                                _min_d, _max_d = min(_all_dists), max(_all_dists)
                                _range = _max_d - _min_d if _max_d > _min_d else 1.0
                                _bo_sim = round(1.0 - (best_other['dist'] - _min_d) / _range, 3)
                                _as_sim = round(1.0 - (assigned_dist - _min_d) / _range, 3) if assigned_dist is not None else 0.0

                                state['rag_topic_mismatch'] = {
                                    'best_match_topic': best_other['topic_name'],
                                    'best_match_similarity': _bo_sim,
                                    'assigned_topic_similarity': _as_sim,
                                    'score_gap': round(_bo_sim - _as_sim, 3),
                                }
                                logger.info(
                                    f"TOPIC MISMATCH detected: entry best matches '{best_other['topic_name']}' "
                                    f"(rank {best_other['rank']}) vs assigned '{topic_name}' "
                                    f"(rank {assigned_rank if assigned_rank is not None else 'NOT IN TOP 10'})"
                                )
        except Exception as e:
            logger.warning(f"Topic mismatch detection failed (non-fatal): {e}")

    else:
        # v7.7 Phase 2: Project-specific RAG tracking with key_modules
        if is_project:
            key_modules = state.get('project_key_modules', [])
            out_of_scope = state.get('project_out_of_scope', [])
            project_tech = state.get('project_tech_stack', '')
            success_criteria = state.get('project_success_criteria', '')
            team = state.get('project_team', [])
            user_role = state.get('user_project_role', 'general')

            if key_modules:
                # v7.8: Use exact DB module status when available (target_module field)
                db_module_status = state.get('db_module_status', {})
                entry_target_module = state.get('target_module', '')

                if db_module_status or entry_target_module:
                    # ── EXACT TRACKING (from target_module field) ──
                    all_modules_lower = {m.lower(): m for m in key_modules}
                    modules_completed = set()
                    modules_in_progress = set()
                    for mod_name, mod_info in db_module_status.items():
                        mod_lower = mod_name.lower()
                        if mod_lower in all_modules_lower or mod_name in key_modules:
                            if mod_info['status'] == 'completed':
                                modules_completed.add(mod_lower)
                            else:
                                modules_in_progress.add(mod_lower)

                    # Current entry's module
                    current_module_lower = entry_target_module.lower() if entry_target_module else ''
                    modules_current = {current_module_lower} if current_module_lower and current_module_lower in all_modules_lower else set()

                    modules_remaining = set(all_modules_lower.keys()) - modules_completed - modules_in_progress - modules_current
                    module_coverage = len(modules_completed | modules_current) / len(all_modules_lower) if all_modules_lower else 0

                    state['project_modules_completed'] = sorted([all_modules_lower.get(m, m) for m in modules_completed])
                    state['project_modules_in_progress'] = sorted([all_modules_lower.get(m, m) for m in modules_in_progress])
                    state['project_modules_current'] = [entry_target_module] if entry_target_module else []
                    state['project_modules_remaining'] = sorted([all_modules_lower.get(m, m) for m in modules_remaining])
                    state['project_module_coverage'] = round(module_coverage, 3)
                    state['project_exact_module_tracking'] = True
                else:
                    # ── FALLBACK: Fuzzy matching (old entries without target_module) ──
                    all_modules = set(m.lower() for m in key_modules)

                    modules_completed = set()
                    for prev_text in state.get('prior_full_texts', []):
                        prev_lower = (prev_text or '').lower()
                        if not prev_lower:
                            continue
                        for mod in all_modules:
                            if fuzzy_keyword_match(prev_lower, mod, threshold=0.75):
                                modules_completed.add(mod)

                    current_lower = state['entry_data'].get('learned_text', '').lower()
                    modules_current = set()
                    for mod in all_modules:
                        if fuzzy_keyword_match(current_lower, mod, threshold=0.75):
                            modules_current.add(mod)

                    modules_new = modules_current - modules_completed
                    modules_remaining = all_modules - modules_completed - modules_current
                    module_coverage = len(modules_completed | modules_current) / len(all_modules) if all_modules else 0

                    mod_lower_to_orig = {m.lower(): m for m in key_modules}
                    state['project_modules_completed'] = sorted([mod_lower_to_orig.get(m, m) for m in modules_completed])
                    state['project_modules_current'] = sorted([mod_lower_to_orig.get(m, m) for m in modules_current])
                    state['project_modules_remaining'] = sorted([mod_lower_to_orig.get(m, m) for m in modules_remaining])
                    state['project_module_coverage'] = round(module_coverage, 3)
                    state['project_exact_module_tracking'] = False

            else:
                # ── FALLBACK: Fix 8 keyword extraction (no key_modules defined) ──
                WORK_AREA_KEYWORDS = [
                    'authentication', 'auth', 'login', 'signup', 'registration',
                    'api', 'endpoint', 'route', 'controller', 'middleware',
                    'database', 'migration', 'schema', 'model', 'orm',
                    'frontend', 'ui', 'component', 'page', 'layout', 'responsive',
                    'payment', 'checkout', 'billing', 'subscription',
                    'notification', 'email', 'sms', 'webhook', 'alert',
                    'dashboard', 'admin', 'analytics', 'reporting',
                    'deployment', 'ci/cd', 'docker', 'hosting', 'ssl',
                    'testing', 'unit test', 'integration test', 'e2e', 'qa',
                    'search', 'filter', 'sorting', 'pagination',
                    'upload', 'file', 'image', 'media', 'storage',
                    'chat', 'messaging', 'real-time', 'socket',
                    'security', 'validation', 'encryption', 'permissions',
                    'documentation', 'readme', 'onboarding',
                ]
                work_areas_completed = set()
                for prev_text in state.get('prior_full_texts', []):
                    prev_lower = (prev_text or '').lower()
                    if not prev_lower:
                        continue
                    for area in WORK_AREA_KEYWORDS:
                        if fuzzy_keyword_match(prev_lower, area, threshold=0.8):
                            work_areas_completed.add(area)

                current_lower = state['entry_data'].get('learned_text', '').lower()
                current_work_areas = set()
                for area in WORK_AREA_KEYWORDS:
                    if fuzzy_keyword_match(current_lower, area, threshold=0.8):
                        current_work_areas.add(area)

                new_work_areas = current_work_areas - work_areas_completed
                state['project_work_areas_prior'] = sorted(work_areas_completed)
                state['project_work_areas_current'] = sorted(current_work_areas)
                state['project_work_areas_new'] = sorted(new_work_areas)

            # ── Also extract tech keywords from entries (always, for extra context) ──
            TECH_KEYWORDS = [
                'react', 'vue', 'angular', 'svelte', 'next', 'nuxt',
                'django', 'flask', 'fastapi', 'express', 'spring', 'rails',
                'node', 'deno', 'bun',
                'python', 'javascript', 'typescript', 'java', 'go', 'rust',
                'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'sqlite',
                'aws', 'azure', 'gcp', 'heroku', 'vercel', 'netlify',
                'docker', 'kubernetes', 'graphql', 'rest', 'websocket',
                'jwt', 'oauth', 'stripe', 'firebase',
            ]
            tech_stack_used = set()
            current_lower = state['entry_data'].get('learned_text', '').lower()
            for prev_text in state.get('prior_full_texts', []):
                prev_lower = (prev_text or '').lower()
                for tech in TECH_KEYWORDS:
                    if fuzzy_keyword_match(prev_lower, tech, threshold=0.8):
                        tech_stack_used.add(tech)
            for tech in TECH_KEYWORDS:
                if fuzzy_keyword_match(current_lower, tech, threshold=0.8):
                    tech_stack_used.add(tech)
            state['project_detected_tech'] = sorted(tech_stack_used)

            logger.debug(
                f"Project RAG: key_modules={'YES' if key_modules else 'NO (fallback)'}, "
                f"coverage={state.get('project_module_coverage', 'N/A')}, "
                f"tech={len(tech_stack_used)} keywords"
            )
        else:
            # No knowledge for missing topics (learning without KB)
            pass

        state['rag_concepts_covered_prior'] = []
        state['rag_concepts_covered_current'] = []
        state['rag_concepts_new'] = []
        state['rag_concepts_remaining'] = []
        state['rag_coverage_ratio'] = 0.0

    # ── Fetch admin wisdom semantically ──
    admin_corrections = []
    try:
        admin_corrections = rag.query_admin_wisdom(
            topic_name,
            state['entry_data'].get('learned_text', ''), n=3
        )
    except Exception as e:
        logger.debug(f"Admin wisdom query failed: {e}")
    state['rag_admin_corrections'] = admin_corrections

    # ── Build RAG context summary string (injected into downstream prompts) ──
    if knowledge and not is_project:
        what_you_will_learn = state['rag_what_you_will_learn']
        concepts_covered = state['rag_concepts_covered_prior']
        concepts_current = state['rag_concepts_covered_current']
        concepts_new = state['rag_concepts_new']
        coverage_ratio = state['rag_coverage_ratio']

        subtopics_list = state['rag_relevant_subtopics']
        keywords_list = state['rag_validation_keywords']
        related_unlisted = state.get('rag_concepts_related_unlisted', [])

        rag_summary = (
            f"--- TOPIC KNOWLEDGE ---\n"
            f"What this topic covers: {state['rag_what_it_is']}\n\n"
            f"Expected learning objectives ({len(what_you_will_learn)} items):\n"
            + '\n'.join(f'- {item}' for item in what_you_will_learn)
            + f"\n\nExpected subtopics ({len(subtopics_list)} items):\n"
            + '\n'.join(f'- {s}' for s in subtopics_list)
            + f"\n\nValidation keywords ({len(keywords_list)} items): {', '.join(keywords_list)}\n"
            + f"\n--- LEARNING HISTORY ---\n"
            f"Previously covered subtopics: {', '.join(concepts_covered) or 'None yet (first entry)'}\n"
            f"This entry covers: {', '.join(concepts_current) or 'No recognized subtopics detected'}\n"
            f"NEW subtopics this entry: {', '.join(concepts_new) or 'None new'}\n"
            f"Remaining uncovered concepts: {', '.join(list(concepts_remaining)) or 'All covered'}\n"
            f"Coverage: {len(set(concepts_covered) | set(concepts_current))}/{len(set(subtopics_list) | set(keywords_list))} "
            f"concepts ({coverage_ratio:.0%})\n"
            + (f"\n--- RELATED CONCEPTS (not in knowledge base but valid) ---\n"
               f"Detected: {', '.join(related_unlisted)}\n"
               f"These concepts are RELATED to the topic. Do NOT penalize for covering them.\n"
               if related_unlisted else '')
            + f"\n--- ADMIN CORRECTIONS ---\n"
            + ('\n'.join(admin_corrections) if admin_corrections else 'No relevant corrections found.')
        )
    elif is_project:
        # v7.7 Phase 2: Project RAG summary with structured tracking
        prior_count = state.get('prior_entries_count', 0)
        team = state.get('project_team', [])
        user_role = state.get('user_project_role', 'general')
        out_of_scope = state.get('project_out_of_scope', [])
        project_tech = state.get('project_tech_stack', '')
        detected_tech = state.get('project_detected_tech', [])
        key_modules = state.get('project_key_modules', [])

        team_str = ', '.join(f"{m['name']} ({m['role']})" for m in team) if team else 'Solo project'

        if key_modules:
            # Structured summary (like learning)
            completed = state.get('project_modules_completed', [])
            current = state.get('project_modules_current', [])
            in_progress = state.get('project_modules_in_progress', [])
            remaining = state.get('project_modules_remaining', [])
            coverage = state.get('project_module_coverage', 0)
            exact_tracking = state.get('project_exact_module_tracking', False)
            entry_target = state.get('target_module', '')
            entry_fstatus = state.get('feature_status', 'in_progress')
            rag_summary = (
                f"--- PROJECT SCOPE (from key_modules) ---\n"
                f"Defined modules ({len(key_modules)}): {', '.join(key_modules)}\n"
                + (f"TARGET MODULE: '{entry_target}' (status: {entry_fstatus})\n" if entry_target else '')
                + f"Modules completed: {', '.join(completed) or 'None yet'}\n"
                + (f"Modules in progress: {', '.join(in_progress)}\n" if in_progress else '')
                + f"Modules in THIS entry: {', '.join(current) or 'None detected'}\n"
                f"Remaining: {', '.join(remaining) or 'All covered'}\n"
                f"Module coverage: {coverage:.0%} {'(exact from DB)' if exact_tracking else '(fuzzy matched)'}\n"
            )
            # v9.0: Add per-feature success criteria if available
            features = state.get('project_features', [])
            if features:
                feature_lines = []
                for feat in features:
                    line = f"  - {feat['name']} ({feat['status']})"
                    if feat.get('success_criteria'):
                        line += f" — criteria: {feat['success_criteria']}"
                    feature_lines.append(line)
                rag_summary += "\n--- FEATURE DETAILS ---\n" + "\n".join(feature_lines) + "\n"

            rag_summary += (
                (f"\n--- OUT OF SCOPE ---\n"
                   f"NOT allowed: {', '.join(out_of_scope)}\n"
                   f"If this entry describes out-of-scope work, flag it.\n"
                   if out_of_scope else '')
                + f"\n--- TEAM ---\n"
                f"Team: {team_str}\n"
                f"YOUR role: {user_role}\n"
                + (f"Tech stack (defined): {project_tech}\n" if project_tech else '')
                + (f"Frontend: {state.get('project_tech_frontend')}\n" if state.get('project_tech_frontend') else '')
                + (f"Backend: {state.get('project_tech_backend')}\n" if state.get('project_tech_backend') else '')
                + (f"Database: {state.get('project_tech_database')}\n" if state.get('project_tech_database') else '')
                + (f"Cloud: {state.get('project_tech_cloud')}\n" if state.get('project_tech_cloud') else '')
                + (f"Tech stack (detected): {', '.join(detected_tech)}\n" if detected_tech else '')
                + (f"\n--- TEAM HOURS ---\n"
                   f"Your hours: {state.get('user_hours_invested', 0):.2f}h\n"
                   f"Project parallel hours: {state.get('project_parallel_hours', 0):.2f}h\n"
                   if state.get('project_is_team') else '')
                + (f"\n--- ADMIN CORRECTIONS ---\n" + '\n'.join(admin_corrections) if admin_corrections else '')
            )
        else:
            # Fallback summary (Fix 8 extraction)
            prior_areas = state.get('project_work_areas_prior', [])
            current_areas = state.get('project_work_areas_current', [])
            new_areas = state.get('project_work_areas_new', [])
            rag_summary = (
                f"--- PROJECT TRACKING (RAG Extracted from ALL {prior_count} entries) ---\n"
                f"Work areas completed in prior entries: {', '.join(prior_areas) or 'None yet (first entry)'}\n"
                f"Work areas in THIS entry: {', '.join(current_areas) or 'None detected'}\n"
                f"NEW work areas this entry: {', '.join(new_areas) or 'No new areas'}\n"
                + (f"\n--- OUT OF SCOPE ---\n"
                   f"NOT allowed: {', '.join(out_of_scope)}\n"
                   if out_of_scope else '')
                + f"\n--- TEAM ---\n"
                f"Team: {team_str}\n"
                f"YOUR role: {user_role}\n"
                + (f"Tech stack (detected): {', '.join(detected_tech)}\n" if detected_tech else '')
                + (f"\n--- ADMIN CORRECTIONS ---\n" + '\n'.join(admin_corrections) if admin_corrections else '')
            )
    elif admin_corrections:
        rag_summary = (
            f"--- ADMIN CORRECTIONS ---\n"
            + '\n'.join(admin_corrections)
        )
    else:
        rag_summary = "No topic knowledge available. Validating without RAG context."

    state['rag_context_summary'] = rag_summary

    # ── Store in reasoning_logs for chain-of-thought UI ──
    if knowledge and not is_project:
        log_summary = (
            f"RAG: Found {len(state['rag_what_you_will_learn'])} learning objectives, "
            f"{len(state['rag_concepts_covered_current'])} subtopics matched in entry, "
            f"{len(state['rag_concepts_new'])} new concepts, "
            f"{state['rag_coverage_ratio']:.0%} total coverage."
        )
    elif is_project and state.get('project_work_areas_prior') is not None:
        prior_areas = state.get('project_work_areas_prior', [])
        current_areas = state.get('project_work_areas_current', [])
        log_summary = (
            f"RAG: Project tracking — {len(prior_areas)} work areas from prior entries, "
            f"{len(current_areas)} in current entry, "
            f"{len(state.get('project_tech_stack', []))} tech keywords. "
            f"{len(admin_corrections)} admin correction(s)."
        )
    else:
        log_summary = f"RAG: No topic knowledge found. {len(admin_corrections)} admin correction(s)."

    # Use subtopics-only for remaining (filter concepts to only include actual subtopics)
    rag_remaining_candidates = list(state.get('rag_subtopics_remaining', state.get('rag_concepts_remaining', [])))
    all_subtopics = state.get('rag_relevant_subtopics', [])
    if all_subtopics:
        # Filter to ONLY items that are in the defined subtopics list (exclude keyword-only items)
        subtopics_lower_set = set(s.lower() for s in all_subtopics)
        rag_remaining = [item for item in rag_remaining_candidates if item.lower() in subtopics_lower_set]
    else:
        rag_remaining = rag_remaining_candidates

    # Build data-specific evidence (distinct from summary sentence)
    if knowledge and not is_project:
        concepts_current = state.get('rag_concepts_covered_current', [])
        concepts_new = state.get('rag_concepts_new', [])
        coverage_ratio = state.get('rag_coverage_ratio', 0)
        rag_evidence = (
            f"Source: {'PostgreSQL (exact)' if exact_matched else 'ChromaDB (semantic)'}\n"
            f"Roadmap: {roadmap_id or 'unknown'}\n"
            f"Objectives: {len(state.get('rag_what_you_will_learn', []))}\n"
            f"Subtopics matched: {', '.join(concepts_current) or 'none'}\n"
            f"New concepts: {', '.join(concepts_new) or 'none'}\n"
            f"Coverage: {coverage_ratio:.0%}"
        )
    elif is_project:
        completed = state.get('project_modules_completed', [])
        current = state.get('project_modules_current', [])
        coverage = state.get('project_module_coverage', 0)
        detected_tech = state.get('project_detected_tech', [])
        rag_evidence = (
            f"Modules completed: {', '.join(completed[:10]) or 'none'}\n"
            f"Modules this entry: {', '.join(current[:10]) or 'none'}\n"
            f"Module coverage: {coverage:.0%}\n"
            f"Tech detected: {', '.join(detected_tech[:10]) or 'none'}\n"
            f"Admin corrections: {len(admin_corrections)}"
        )
    else:
        rag_evidence = f"No topic knowledge found for '{topic_name}'. Admin corrections: {len(admin_corrections)}."

    state['reasoning_logs']['rag_context'] = {
        'summary': log_summary,
        'score': None,  # No score — this is retrieval, not judgment
        'verdict': None,
        'path': 'logic',
        'path_reason': (
            f"RAG retrieval from {'PostgreSQL (exact match)' if exact_matched else 'ChromaDB (semantic)'} "
            f"for '{topic_name}' in roadmap '{roadmap_id or 'unknown'}'."
            if knowledge and not is_project else
            f"{'Project entry — no topic knowledge needed.' if is_project else 'No topic knowledge found.'} "
            f"Admin corrections: {len(admin_corrections)}."
        ),
        'details': rag_summary,
        'evidence': rag_evidence,
        'llm_reasoning': None,
        'rag_analysis': rag_summary if (knowledge and not is_project) else None,
        'guards': [],
        'remaining': rag_remaining if rag_remaining else None,
    }

    return state


# =============================================================================
# PIPELINE A: Learning (lnd_tasks)
# =============================================================================

# ── A1: Time Reasoner (Learning) ──

def learning_time_reasoner(state: BrainState) -> BrainState:
    """
    v7.0 Learning Time Reasoner. LLM assesses if hours are reasonable
    given topic, difficulty, experience, blockers, learning history, and RAG context.
    Blockers are handled HERE — not a separate node.
    """
    hours = float(state['entry_data']['hours'])
    topic = state['topic_name']
    difficulty = state['topic_difficulty']
    exp = state['user_experience']
    benchmark = state['benchmark_hours']
    total_invested = state['total_hours_invested']
    estimated_total = state['estimated_total_hours']
    learning_status = state.get('learning_status', 'in_progress')
    prior_count = state['prior_entries_count']
    blocker_summary = state.get('blocker_summary', 'No blockers.')
    intent = state['intent']

    prior_work = ""
    if state.get('prior_entries_full'):
        prior_work = "\n\n".join(state['prior_entries_full'])
    else:
        prior_work = ""

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="qwen2.5:7b", temperature=0, timeout=15)

        # ── Scoped RAG for Time (no keyword/subtopic lists — prevents content leakage) ──
        _time_what_it_is = state.get('rag_what_it_is', '')
        _time_obj_count = len(state.get('rag_what_you_will_learn', []))
        _time_sub_count = len(state.get('rag_relevant_subtopics', []))
        _time_kw_count = len(state.get('rag_validation_keywords', []))
        _time_coverage = state.get('rag_coverage_ratio', 0)
        _time_covered_cur = len(state.get('rag_concepts_covered_current', []))
        _time_covered_prior = len(state.get('rag_concepts_covered_prior', []))
        _time_admin = state.get('rag_admin_corrections', [])
        rag_time_context = (
            f"--- TOPIC SCOPE ---\n"
            f"Topic: {_time_what_it_is}\n"
            f"This topic has {_time_obj_count} learning objectives, "
            f"{_time_sub_count} subtopics, {_time_kw_count} validation keywords.\n"
            f"Current coverage: {_time_coverage:.0%} "
            f"({_time_covered_cur} subtopics this entry, {_time_covered_prior} from prior entries)."
        )
        if _time_admin:
            rag_time_context += f"\nAdmin corrections: {'; '.join(_time_admin)}"

        # ── Pre-LLM guard signals (time-specific) ──
        time_guard_signals = []
        has_blocker = blocker_summary and blocker_summary not in ('No blockers.', 'No blockers reported.')
        if estimated_total > 0 and hours > benchmark * 2.5 and not has_blocker:
            time_guard_signals.append(
                f"NOTE: Session is {hours / benchmark:.1f}x the benchmark "
                f"({hours}h vs ~{benchmark}h) with no blocker reported."
            )
        if has_blocker and estimated_total > 0 and hours > estimated_total:
            over_pct = ((hours / estimated_total) - 1) * 100
            time_guard_signals.append(
                f"NOTE: Blocker reported. Hours are {over_pct:.0f}% over estimate "
                f"— assess if blocker justifies the extra time."
            )
        time_guard_block = (
            "\n--- GUARD SIGNALS (computed from data — factor these into your assessment) ---\n"
            + "\n".join(f"  - {s}" for s in time_guard_signals)
            if time_guard_signals
            else "\n--- GUARD SIGNALS ---\n  No concerns detected."
        )

        # v7.6 Fix 4: Clear over/under language (not "107% OVER budget")
        if estimated_total > 0:
            if hours > estimated_total:
                session_overage = ((hours / estimated_total) - 1) * 100
                session_status = f"{session_overage:.0f}% over estimate"
            elif hours < estimated_total:
                session_underage = (1 - (hours / estimated_total)) * 100
                session_status = f"{session_underage:.0f}% under estimate"
            else:
                session_status = "exactly on estimate"

            if total_invested > estimated_total:
                total_overage = ((total_invested / estimated_total) - 1) * 100
                invested_status = f"{total_overage:.0f}% over estimate"
            elif total_invested < estimated_total:
                total_underage = (1 - (total_invested / estimated_total)) * 100
                invested_status = f"{total_underage:.0f}% under estimate"
            else:
                invested_status = "exactly on estimate"
        else:
            session_status = "no estimate available"
            invested_status = "no estimate available"

        # ── v8.0: Compute time reference score (baseline 70, simplified ±5-15) ──
        time_ref_score = 70
        time_ref_parts = ["Baseline 70"]
        if estimated_total > 0 and hours <= estimated_total:
            time_ref_score += 5
            time_ref_parts.append("Within estimate(+5)")
        elif estimated_total > 0 and not has_blocker:
            _over_pct = (hours / estimated_total - 1) * 100
            if _over_pct <= 30:
                time_ref_score -= 5
                time_ref_parts.append(f"Over {_over_pct:.0f}% no blocker(-5)")
            elif _over_pct <= 80:
                time_ref_score -= 10
                time_ref_parts.append(f"Over {_over_pct:.0f}% no blocker(-10)")
            else:
                time_ref_score -= 15
                time_ref_parts.append(f"Way over estimate(-15)")
        elif estimated_total > 0 and has_blocker:
            _over_pct = max(0, (hours / estimated_total - 1) * 100)
            if _over_pct <= 50:
                time_ref_parts.append(f"Over {_over_pct:.0f}% with blocker(+0)")
            else:
                time_ref_score -= 5
                time_ref_parts.append(f"Over {_over_pct:.0f}% with blocker(-5)")
        # v8.0 BUG FIX: Cumulative pacing vs coverage
        if estimated_total > 0 and total_invested > estimated_total:
            _overshoot = (total_invested / estimated_total - 1) * 100
            _coverage = state.get('rag_coverage_ratio', 0)
            if _overshoot > 50 and _coverage < 0.50:
                if has_blocker:
                    time_ref_score -= 5
                    time_ref_parts.append(f"Overspent {_overshoot:.0f}% at {_coverage:.0%} coverage with blocker(-5)")
                else:
                    time_ref_score -= 10
                    time_ref_parts.append(f"Overspent {_overshoot:.0f}% at {_coverage:.0%} coverage(-10)")
            elif _overshoot > 20 and _coverage < 0.30:
                if has_blocker:
                    time_ref_score -= 3
                    time_ref_parts.append(f"Pacing concern with blocker(-3)")
                else:
                    time_ref_score -= 5
                    time_ref_parts.append(f"Pacing concern(-5)")
        # First entry leniency
        if prior_count == 0:
            time_ref_score += 5
            time_ref_parts.append("First entry(+5)")
        time_ref_score = max(0, min(100, time_ref_score))
        time_ref_math = " + ".join(time_ref_parts) + f" = {time_ref_score}%"

        prompt = f"""{LEARNING_BRIEFING}
You are Node 2 (Time Reasoner). Assess if the claimed hours are reasonable for this learning session.

YOUR SCOPE — ONLY assess if the claimed hours are reasonable for THIS SESSION.
Do NOT judge: completion claims, progress %, coverage gaps, or overall topic mastery.
Those are Node 4 (Progress Analyzer)'s responsibility.
Ask yourself ONLY: "For a {difficulty}/5 topic, is {hours}h a reasonable amount of time to do the work described in the entry?"

--- CONTEXT ---
CRITICAL: learning_status indicates the current state: 'in_progress' or 'completed'.
'in_progress' with many hours is NORMAL — it means "not finished yet", NOT "no work done". No matter the hours or sub topic coverage it won't change to 'completed' until the learner marks it complete. So 'in_progress' means they are still working.
ONLY validate completion claims when is_completed=True.

Topic: "{topic}" (Difficulty: {difficulty}/5)
Intent: {'L&D Tasks' if intent == 'lnd_tasks' else 'SBU Tasks'}
Learner: {exp} years experience ({state.get('experience_tier', 'mid')} tier)
Personalized estimate for topic: ~{estimated_total:.2f}h (base {benchmark}h × {state.get('estimation_breakdown', {}).get('total_factor', 1.0):.2f}x)
Total hours invested so far: {total_invested:.2f}h{' (= this session only; NO prior entries exist)' if prior_count == 0 else f' (across {prior_count + 1} entries)'}
Status: {state.get('learning_status', 'in_progress')}
Hours remaining: ~{max(0, estimated_total - total_invested):.2f}h
This session claimed: {hours}h
Session: {hours}h vs ~{estimated_total:.2f}h estimate ({session_status})
Total invested: {total_invested:.2f}h vs ~{estimated_total:.2f}h estimate ({invested_status})
This is entry #{prior_count + 1} for this topic
{"NOTE: Total invested equals session hours because this is entry #1 — there are ZERO prior hours." if prior_count == 0 else ""}
{rag_time_context}
{time_guard_block}

Blockers: {blocker_summary}

{"Prior entries:" if prior_work else "First entry — no prior work."}
{prior_work}

Description (NOTE: entries are limited to 50-500 characters, so summary style is EXPECTED and NORMAL):
"{sanitize_input(state['entry_data']['learned_text'])}"

Think step-by-step:
1. For a {'L&D Tasks' if intent == 'lnd_tasks' else 'SBU Tasks'} session on "{topic}" at difficulty {difficulty}/5, is {hours}h reasonable?
2. Given {total_invested:.2f}h already invested with {round(state.get('rag_coverage_ratio', 0) * 100, 0):.0f}% subtopic coverage and ~{max(0, estimated_total - total_invested):.1f}h remaining, does {hours}h more make sense?
3. Does the description length/depth roughly match {hours}h of work?
4. BLOCKER ANALYSIS (CRITICAL):
   Blocker reported: {blocker_summary}

   Blocker Impact Guidelines:
   - Resource blockers (missing docs, broken tools, unavailable mentors): Can justify +20-40% extra time
   - Technical blockers (complex debugging, dependency conflicts, environment setup): Can justify +30-50% extra time
   - Environmental blockers (internet down, power outage, system crashes): Can justify +40-60% extra time
   - Personal blockers (health, family emergency): Use judgment, be lenient
   - Vague blockers ("didn't have enough resources", "faced some issues"): Skeptical, max +10% extra time

   Does THIS blocker justify the extra time? {hours}h vs ~{estimated_total:.2f}h estimated = {((hours / estimated_total - 1) * 100) if estimated_total > 0 else 0:.0f}% over estimate.
5. Is this a first entry (be lenient) or later entry (compare with history)?

Verdict Guidelines:
- PASS (80-100 confidence): Hours are within reasonable range for this topic/difficulty/experience
- CONCERN (40-79 confidence): Hours seem high or low relative to the work described
- FAIL (0-39 confidence): Hours are clearly unreasonable (e.g., 8h for a trivial topic with no blockers)

COMPUTED REFERENCE (verified arithmetic): {time_ref_math}
Your confidence MUST equal {time_ref_score}% unless you have a specific reason to deviate.
DO NOT recalculate — this math is already verified.

OUTPUT FORMAT (STRICT):
Step-by-step: [Walk through the COMPUTED REFERENCE factors. Cite which applied.]
Reasoning: [2-3 sentences interpreting the result]
Verdict: [PASS or CONCERN or FAIL — one word only]
Confidence: [0-100 — number only]"""

        t0 = time.monotonic()
        response = llm.invoke(prompt).strip()
        state['llm_latency'] = time.monotonic() - t0

        verdict, confidence, reasoning = extract_verdict(response)

        # Save pure LLM reasoning before guards
        llm_reasoning_only = reasoning
        guards_list = []
        llm_raw_verdict, llm_raw_confidence = verdict, confidence

        # ── v8.0 MATH CORRECTION guard (±20 tolerance) ──
        if abs(confidence - time_ref_score) > 20:
            pre_conf = confidence
            confidence = time_ref_score
            if confidence >= 70:
                verdict = 'PASS'
            else:
                verdict = 'CONCERN'
            guards_list.append(
                f"MATH CORRECTION: LLM gave {pre_conf}% but verified math is {time_ref_math}. "
                f"Confidence: {pre_conf} → {confidence}"
            )

        # Final bookend — only if guards changed something
        if verdict != llm_raw_verdict or confidence != llm_raw_confidence:
            guards_list.insert(0, f"LLM raw: {llm_raw_verdict} at {llm_raw_confidence}%")
            guards_list.append(f"Final: {verdict} at {confidence}%")

        state['node_verdicts']['time'] = {
            'verdict': verdict,
            'confidence': confidence,
            'reasoning': reasoning,
        }
        est_info = state.get('estimation_breakdown', {})
        time_evidence = (
            f"Hours claimed: {hours}h\n"
            f"Estimated total: ~{estimated_total:.2f}h ({est_info.get('exp_tier', 'mid')})\n"
            f"Total invested: {total_invested:.2f}h\n"
            f"Status: {state.get('learning_status', 'in_progress')}\n"
            f"Difficulty: {difficulty}/5\n"
            f"Blockers: {blocker_summary}"
        )
        state['reasoning_logs']['time_analysis'] = {
            'summary': (
                f"⏱ Time: {verdict} ({confidence}%). "
                f"{hours}h vs ~{estimated_total:.2f}h est ({est_info.get('exp_tier', 'mid')}). "
                f"{'Blocker: ' + blocker_summary[:60] if blocker_summary != 'No blockers reported.' else 'No blockers'}."
            ),
            'score': confidence,
            'verdict': verdict,
            'path': 'ai',
            'path_reason': (
                f"LLM (qwen2.5:7b) assessed {hours}h for '{topic}' "
                f"(difficulty {difficulty}/5, {total_invested:.2f}h invested, status: {state.get('learning_status', 'in_progress')}). "
                f"Blockers factored in: {blocker_summary[:80]}"
            ),
            'details': reasoning,
            'llm_raw_response': response,
            'evidence': time_evidence,
            'llm_reasoning': llm_reasoning_only,
            'rag_analysis': None,
            'guards': guards_list,
            'remaining': None,
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
            'reasoning': f'Fallback: {hours}h vs expected ~{expected:.2f}h.',
        }
        state['reasoning_logs']['time_analysis'] = {
            'summary': f"Time Reasoner (fallback): {verdict} ({confidence}%). {hours}h vs ~{expected:.2f}h.",
            'score': confidence, 'verdict': verdict, 'path': 'breaker',
            'path_reason': f"LLM failed ({str(e)[:60]}). Math fallback used.",
            'details': f"Expected ~{expected:.2f}h, claimed {hours}h. Error: {str(e)[:80]}",
            'evidence': f"Hours claimed: {hours}h\nExpected: ~{expected:.2f}h\nError: {str(e)[:80]}",
            'llm_reasoning': None,
            'rag_analysis': None,
            'guards': [],
            'remaining': None,
        }

    return {k: state[k] for k in ['node_verdicts', 'reasoning_logs', 'ai_failures', 'errors'] if k in state}
# ── A2: Content Validator (Learning) ──

def learning_content_validator(state: BrainState) -> BrainState:
    """
    v7.0 Content Validator for learning entries.
    Checks: topic match, genuine learning vs fluff, depth vs hours,
    first/middle/last entry handling, subtopic coverage analysis.
    Uses RAG context for topic knowledge and admin corrections.
    """
    text = sanitize_input(state['entry_data']['learned_text'])
    hours = float(state['entry_data']['hours'])
    topic = state['topic_name']
    difficulty = state['topic_difficulty']
    intent = state['intent']
    prior_count = state['prior_entries_count']
    total_invested = state['total_hours_invested']
    learning_status = state.get('learning_status', 'in_progress')
    is_completed = state['is_completed']
    copy_paste_flagged = state['copy_paste_flagged']
    copy_paste_sim = state['copy_paste_max_similarity']

    prior_context = ""
    if state.get('prior_entries_full'):
        prior_count_display = state.get('prior_entries_count', 0)
        prior_context = (
            f"\n--- PRIOR WORK HISTORY ({prior_count_display} {'entry' if prior_count_display == 1 else 'entries'}) ---\n"
            + "\n\n".join(state['prior_entries_full'])
        )
    else:
        prior_context = "\nFirst entry on this topic — no prior work history."

    rag_block = state.get('rag_context_summary', '')

    if prior_count == 0:
        position = "FIRST entry on this topic. Be lenient — learner is just starting."
    elif is_completed:
        position = f"FINAL entry (marked complete). {prior_count} prior entries exist. Verify completion is justified."
    else:
        position = f"MIDDLE entry (#{prior_count + 1}). Compare with prior work for new learning."

    # v7.0: Concept coverage stats for prompt
    concepts_covered = state.get('rag_concepts_covered_prior', [])
    concepts_new = state.get('rag_concepts_new', [])
    coverage_ratio = state.get('rag_coverage_ratio', 0)

    # ── Pre-LLM guard signals (content-specific) ──
    all_keywords_pre = state.get('rag_validation_keywords', [])
    matched_keywords_pre = state.get('rag_concepts_covered_current', [])
    keyword_match_ratio_pre = len(matched_keywords_pre) / len(all_keywords_pre) if all_keywords_pre else 0
    topic_mismatch_info = state.get('rag_topic_mismatch')

    content_guard_signals = []
    if all_keywords_pre and keyword_match_ratio_pre < 0.05:
        content_guard_signals.append(
            f"CRITICAL: Only {keyword_match_ratio_pre:.0%} keyword match "
            f"({len(matched_keywords_pre)}/{len(all_keywords_pre)}) — near-zero alignment with this topic."
        )
    elif all_keywords_pre and keyword_match_ratio_pre < 0.15:
        # Scale threshold by topic size
        _low_thresh = 0.20 if len(all_keywords_pre) <= 8 else 0.15 if len(all_keywords_pre) <= 20 else 0.10
        if keyword_match_ratio_pre < _low_thresh:
            content_guard_signals.append(
                f"WARNING: Only {keyword_match_ratio_pre:.0%} keyword match "
                f"({len(matched_keywords_pre)}/{len(all_keywords_pre)}) — low overlap with expected topic knowledge."
            )
    if topic_mismatch_info:
        content_guard_signals.append(
            f"WARNING: Entry content best matches '{topic_mismatch_info.get('best_match_topic', '?')}' "
            f"({topic_mismatch_info.get('best_match_similarity', 0):.0%}), "
            f"not assigned topic '{state.get('topic_name', '?')}' "
            f"({topic_mismatch_info.get('assigned_topic_similarity', 0):.0%})."
        )
    if copy_paste_flagged:
        content_guard_signals.append(
            f"WARNING: {round(copy_paste_sim * 100)}% similarity with previous entry detected."
        )
    if all_keywords_pre and keyword_match_ratio_pre >= 0.80 and coverage_ratio >= 0.80:
        content_guard_signals.append(
            f"STRONG: {keyword_match_ratio_pre:.0%} keyword match, {coverage_ratio:.0%} coverage "
            f"— data strongly supports topic alignment."
        )
    content_guard_block = (
        "\n--- GUARD SIGNALS (computed from data — factor these into your assessment) ---\n"
        + "\n".join(f"  - {s}" for s in content_guard_signals)
        if content_guard_signals
        else "\n--- GUARD SIGNALS ---\n  No concerns detected."
    )

    # ── Compute content reference score (Python does the arithmetic) ──
    content_ref_score = 70  # baseline
    content_ref_parts = ["Baseline 70"]
    if all_keywords_pre:
        # v8.0: Content ref_score thresholds aligned with guard thresholds (3-5%)
        _n_kw_pre = len(all_keywords_pre)
        if _n_kw_pre <= 10:
            _ref_fail, _ref_c45, _ref_c55 = 0.05, 0.08, 0.12
        elif _n_kw_pre <= 20:
            _ref_fail, _ref_c45, _ref_c55 = 0.04, 0.07, 0.10
        else:
            _ref_fail, _ref_c45, _ref_c55 = 0.03, 0.05, 0.08

        if keyword_match_ratio_pre >= 0.80:
            content_ref_score += 15
            content_ref_parts.append(f"Keyword {keyword_match_ratio_pre:.0%}(+15)")
        elif keyword_match_ratio_pre >= 0.50:
            content_ref_score += 10
            content_ref_parts.append(f"Keyword {keyword_match_ratio_pre:.0%}(+10)")
        elif keyword_match_ratio_pre >= _ref_c55:
            content_ref_score += 5
            content_ref_parts.append(f"Keyword {keyword_match_ratio_pre:.0%}(+5)")
        elif keyword_match_ratio_pre >= _ref_c45:
            content_ref_parts.append(f"Keyword {keyword_match_ratio_pre:.0%}(+0)")
        elif keyword_match_ratio_pre >= _ref_fail:
            content_ref_score -= 15
            content_ref_parts.append(f"Keyword {keyword_match_ratio_pre:.0%}(-15)")
        else:
            content_ref_score -= 25
            content_ref_parts.append(f"Keyword {keyword_match_ratio_pre:.0%}(-25)")
    if topic_mismatch_info:
        content_ref_score -= 15
        content_ref_parts.append("Topic mismatch(-15)")
    if copy_paste_flagged:
        content_ref_score -= 25
        content_ref_parts.append("Copy-paste(-25)")
    if coverage_ratio >= 0.50:
        content_ref_score += 5
        content_ref_parts.append(f"Coverage {coverage_ratio:.0%}(+5)")
    if prior_count == 0:
        content_ref_score += 5
        content_ref_parts.append("First entry(+5)")
    content_ref_score = max(0, min(100, content_ref_score))
    content_ref_math = " + ".join(content_ref_parts) + f" = {content_ref_score}%"

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="qwen2.5:7b", temperature=0, timeout=15)

        prompt = f"""{LEARNING_BRIEFING}
You are Node 3 (Content Validator). Evaluate if this description shows genuine learning.
You must judge INDEPENDENTLY based only on the description and context — not other nodes.

--- CONTEXT ---
CRITICAL: learning_status indicates the current state: 'in_progress' or 'completed'.
'in_progress' with many hours is NORMAL — it means "not finished yet", NOT "no work done".
ONLY validate completion claims when is_completed=True.

Topic: "{topic}" (Difficulty: {difficulty}/5)
Intent: {'L&D Tasks' if intent == 'lnd_tasks' else 'SBU Tasks'}
Hours claimed: {hours}h
Status: {state.get('learning_status', 'in_progress')} | Total invested: {total_invested:.2f}h
Entry position: {position}
{"COPY-PASTE WARNING: " + str(round(copy_paste_sim * 100)) + "% similarity with previous entry!" if copy_paste_flagged else ""}
{prior_context}

{rag_block}

IMPORTANT: Entry descriptions are limited to 50-500 characters. Learners CANNOT write essays.
A summary/listing style is EXPECTED and NORMAL for this character limit.
Do NOT penalize for lack of depth when the entry covers many concepts — that is the appropriate format for 500 chars.

--- DESCRIPTION TO EVALUATE ---
"{text}"

{"FIRST ENTRY SPECIAL HANDLING:" if prior_count == 0 else ""}
{"This is the learner's FIRST entry on this topic. First entries are EXPLORATORY." if prior_count == 0 else ""}
{"Expectations for first entry:" if prior_count == 0 else ""}
{"- Coverage can be as low as 10-20% (just starting)" if prior_count == 0 else ""}
{"- Description may be high-level/conceptual (learning WHAT the topic is)" if prior_count == 0 else ""}
{"- Keywords: 2-5 matched is NORMAL for first entry" if prior_count == 0 else ""}
{"- Verdict: PASS if topic-relevant and shows curiosity, even if shallow" if prior_count == 0 else ""}

{"--- SEQUENTIAL LEARNING CONTEXT ---" if prior_count > 0 else ""}
{"This is a SEQUENTIAL learning journey across multiple entries." if prior_count > 0 else ""}
{"Prior entries covered: " + str(len(state.get('rag_concepts_covered_prior', []))) + " concepts: " + ', '.join(list(state.get('rag_concepts_covered_prior', []))) if prior_count > 0 and state.get('rag_concepts_covered_prior') else ""}
{"THIS entry covers: " + str(len(state.get('rag_concepts_covered_current', []))) + " concepts: " + ', '.join(list(state.get('rag_concepts_covered_current', []))) if state.get('rag_concepts_covered_current') else ""}
{"NEW concepts this entry: " + str(len(state.get('rag_concepts_new', []))) + ": " + ', '.join(list(state.get('rag_concepts_new', []))) if state.get('rag_concepts_new') else "No new concepts (reinforcing prior learning)"}
{"Remaining to cover: " + str(len(state.get('rag_concepts_remaining', []))) + ": " + ', '.join(list(state.get('rag_concepts_remaining', []))) if state.get('rag_concepts_remaining') else "All concepts covered!"}

{"SEQUENTIAL LEARNING RULES:" if prior_count > 0 else ""}
{"- First entries (0-30% coverage): EXPLORATORY = PASS if on-topic" if prior_count > 0 else ""}
{"- Middle entries (30-70% coverage): BUILDING = PASS if adding NEW concepts" if prior_count > 0 else ""}
{"- Final entries (70-100% coverage): MASTERY = PASS if comprehensive depth" if prior_count > 0 else ""}
{"- Sequential learning is NORMAL and ENCOURAGED" if prior_count > 0 else ""}

{"RELATED CONCEPTS (not in knowledge base but valid):" if state.get('rag_concepts_related_unlisted') else ""}
{"Detected: " + ', '.join(state.get('rag_concepts_related_unlisted', [])) if state.get('rag_concepts_related_unlisted') else ""}
{"These are RELATED to the topic. Do NOT penalize for covering related concepts. This shows deeper exploration." if state.get('rag_concepts_related_unlisted') else ""}
{content_guard_block}

Think step-by-step:
1. Does this description relate to "{topic}"? Use the TOPIC KNOWLEDGE above — the expected subtopics are listed. Check if the entry mentions concepts from that list.
2. Does it show GENUINE understanding? Compare against expected learning objectives — does the entry demonstrate knowledge at the right depth?
3. LEARNING HISTORY: The learner has already covered {len(concepts_covered)} subtopics. Does this entry add NEW learning ({len(concepts_new)} new subtopics detected) or repeat previous content?
4. COVERAGE CHECK: Coverage is {coverage_ratio:.0%} of expected concepts. {"Progress is 100% (complete) — does coverage justify this claim?" if is_completed else "Learner is still in progress — coverage level is informational only, do NOT penalize."}
5. Admin corrections above (if any) — have previous similar entries been misjudged? Incorporate that learning.
{"6. HIGH SIMILARITY with prior entry — is this genuinely different content?" if copy_paste_flagged else ""}

Verdict Guidelines:
- PASS (80-100 confidence): Description clearly demonstrates genuine learning on "{topic}", covers expected subtopics, adds new knowledge
- CONCERN (40-79 confidence): Description is vague, lacks depth, or doesn't clearly align with expected subtopics
- FAIL (0-39 confidence): Description is off-topic, copy-pasted, or shows no genuine learning

COMPUTED REFERENCE (verified arithmetic): {content_ref_math}
Your confidence MUST equal {content_ref_score}% unless you have a specific reason to deviate.
DO NOT recalculate — this math is already verified.

OUTPUT FORMAT (STRICT):
Step-by-step: [Walk through the COMPUTED REFERENCE factors. Cite which applied.]
Reasoning: [2-3 sentences interpreting the result]
Verdict: [PASS or CONCERN or FAIL — one word only]
Confidence: [0-100 — number only]"""

        response = llm.invoke(prompt).strip()
        verdict, confidence, reasoning = extract_verdict(response)

        # Save pure LLM reasoning before mixing with RAG/guards
        llm_reasoning_only = reasoning
        guards_list = []
        llm_raw_verdict, llm_raw_confidence = verdict, confidence

        # ── v8.0 MATH CORRECTION guard (±20 tolerance) ──
        if abs(confidence - content_ref_score) > 20:
            pre_conf = confidence
            confidence = content_ref_score
            if confidence >= 70:
                verdict = 'PASS'
            else:
                verdict = 'CONCERN'
            guards_list.append(
                f"MATH CORRECTION: LLM gave {pre_conf}% but verified math is {content_ref_math}. "
                f"Confidence: {pre_conf} → {confidence}"
            )

        # Fix 1: Append RAG analysis to reasoning for chain-of-thought visibility
        all_keywords = state.get('rag_validation_keywords', [])
        all_subtopics = state.get('rag_relevant_subtopics', [])
        learning_objectives = state.get('rag_what_you_will_learn', [])
        matched_keywords = state.get('rag_concepts_covered_current', [])
        remaining = state.get('rag_concepts_remaining', [])
        keyword_match_ratio = len(matched_keywords) / len(all_keywords) if all_keywords else 0

        rag_analysis = "\n\n--- RAG ANALYSIS ---\n"
        rag_analysis += f"Expected Learning Objectives: {len(learning_objectives)}\n"
        if learning_objectives:
            rag_analysis += f"  Objectives: {', '.join(learning_objectives)}\n"
        rag_analysis += f"Expected Keywords ({len(all_keywords)}): {', '.join(all_keywords)}\n"
        rag_analysis += f"Matched Keywords ({len(matched_keywords)}): {', '.join(matched_keywords)}\n"
        rag_analysis += f"Keyword Match Rate: {keyword_match_ratio:.0%}\n"
        rag_analysis += f"Concept Coverage: {coverage_ratio:.0%}\n"
        if all_subtopics:
            rag_analysis += f"  All Expected Subtopics: {', '.join(all_subtopics)}\n"
        if matched_keywords:
            rag_analysis += f"  Covered This Entry: {', '.join(matched_keywords)}\n"
        if remaining:
            rag_analysis += f"  Still Remaining Concepts: {', '.join(remaining)}\n"
        reasoning = reasoning + rag_analysis

        # Hard coverage override: if data overwhelmingly supports PASS, force it
        if keyword_match_ratio >= 0.80 and coverage_ratio >= 0.80 and verdict != 'PASS':
            original_verdict = verdict
            pre_conf = confidence
            verdict = 'PASS'
            confidence = max(confidence, 75)
            reasoning += f"\n[COVERAGE OVERRIDE] Keyword match {keyword_match_ratio:.0%} and coverage {coverage_ratio:.0%} both ≥80%. Overrode {original_verdict} ({pre_conf}%) → PASS ({confidence}%)."
            guards_list.append(f"COVERAGE OVERRIDE: Keyword match {keyword_match_ratio:.0%} and coverage {coverage_ratio:.0%} both ≥80%. Overrode {original_verdict} → PASS. Confidence: {pre_conf} → {confidence}")



        # v8.0: Guards as helpers — lowered thresholds to 3-5%
        _n_kw = len(all_keywords) if all_keywords else 0
        if _n_kw <= 10:
            _fail_thresh, _concern45_thresh, _concern55_thresh = 0.05, 0.08, 0.12
        elif _n_kw <= 20:
            _fail_thresh, _concern45_thresh, _concern55_thresh = 0.04, 0.07, 0.10
        else:
            _fail_thresh, _concern45_thresh, _concern55_thresh = 0.03, 0.05, 0.08

        if all_keywords and keyword_match_ratio < _concern55_thresh:
            pre_conf = confidence
            topic_mismatch = state.get('rag_topic_mismatch')
            if keyword_match_ratio < _fail_thresh:
                verdict = 'FAIL'
                confidence = min(confidence, 35)
                reasoning += (
                    f"\n[LOW MATCH GUARD] Only {keyword_match_ratio:.0%} keyword match "
                    f"({len(matched_keywords)}/{len(all_keywords)}) — below FAIL threshold "
                    f"({_fail_thresh:.0%} for {_n_kw}-keyword topic). Forced FAIL."
                )
                guard_msg = (
                    f"LOW MATCH GUARD: {keyword_match_ratio:.0%} keyword match "
                    f"({len(matched_keywords)}/{len(all_keywords)}). "
                    f"Below {_fail_thresh:.0%} FAIL threshold → FAIL. Confidence: {pre_conf} → {confidence}"
                )
            elif keyword_match_ratio < _concern45_thresh:
                verdict = 'CONCERN'
                confidence = min(confidence, 45)
                reasoning += (
                    f"\n[LOW MATCH GUARD] Only {keyword_match_ratio:.0%} keyword match "
                    f"({len(matched_keywords)}/{len(all_keywords)}) — below CONCERN threshold "
                    f"({_concern45_thresh:.0%} for {_n_kw}-keyword topic). Downgraded to CONCERN."
                )
                guard_msg = (
                    f"LOW MATCH GUARD: {keyword_match_ratio:.0%} keyword match "
                    f"({len(matched_keywords)}/{len(all_keywords)}). "
                    f"Below {_concern45_thresh:.0%} threshold → CONCERN 45. Confidence: {pre_conf} → {confidence}"
                )
            else:
                verdict = 'CONCERN'
                confidence = min(confidence, 55)
                reasoning += (
                    f"\n[LOW MATCH GUARD] Only {keyword_match_ratio:.0%} keyword match "
                    f"({len(matched_keywords)}/{len(all_keywords)}) — below {_concern55_thresh:.0%} "
                    f"threshold for {_n_kw}-keyword topic. Downgraded to CONCERN."
                )
                guard_msg = (
                    f"LOW MATCH GUARD: {keyword_match_ratio:.0%} keyword match "
                    f"({len(matched_keywords)}/{len(all_keywords)}). "
                    f"Below {_concern55_thresh:.0%} threshold → CONCERN 55. Confidence: {pre_conf} → {confidence}"
                )
            # If topic mismatch detected, strengthen the guard message
            if topic_mismatch:
                best_topic = topic_mismatch.get('best_match_topic', '?')
                best_sim = topic_mismatch.get('best_match_similarity', 0)
                guard_msg += f" | TOPIC MISMATCH: content best matches '{best_topic}' ({best_sim:.0%})"
                reasoning += f" Content best matches '{best_topic}' ({best_sim:.0%}), not the assigned topic."
                # Strengthen penalty for confirmed mismatch
                if verdict != 'FAIL':
                    verdict = 'FAIL'
                    confidence = min(confidence, 30)
                    guard_msg += f" → Forced FAIL at {confidence}%"
            guards_list.append(guard_msg)

        # Final bookend — only if guards changed something
        if verdict != llm_raw_verdict or confidence != llm_raw_confidence:
            guards_list.insert(0, f"LLM raw: {llm_raw_verdict} at {llm_raw_confidence}%")
            guards_list.append(f"Final: {verdict} at {confidence}%")

        state['node_verdicts']['content'] = {
            'verdict': verdict, 'confidence': confidence, 'reasoning': reasoning,
        }
        content_evidence = (
            f"Keyword match: {len(matched_keywords)}/{len(all_keywords)} ({keyword_match_ratio:.0%})\n"
            f"Subtopic coverage: {coverage_ratio:.0%}\n"
            f"Prior subtopics covered: {len(state.get('rag_concepts_covered_prior', []))}\n"
            f"New subtopics this entry: {len(state.get('rag_concepts_new', []))}\n"
            f"Entry position: {'first' if prior_count == 0 else 'final' if is_completed else f'#{prior_count + 1}'}\n"
            f"Copy-paste: {'FLAGGED (' + str(round(copy_paste_sim * 100, 1)) + '%)' if copy_paste_flagged else 'Clear'}"
        )
        state['reasoning_logs']['content_analysis'] = {
            'summary': (
                f"📝 Content: {verdict} ({confidence}%). "
                f"Match: {len(matched_keywords)}/{len(all_keywords)} keywords ({keyword_match_ratio:.0%}), "
                f"coverage: {coverage_ratio:.0%}."
            ),
            'score': confidence, 'verdict': verdict, 'path': 'ai',
            'path_reason': (
                f"LLM validated content for '{topic}' — "
                f"keyword match {keyword_match_ratio:.0%}, coverage {coverage_ratio:.0%}, "
                f"entry position: {'first' if prior_count == 0 else 'final' if is_completed else f'#{prior_count + 1}'}."
            ),
            'details': reasoning,
            'llm_raw_response': response,
            'evidence': content_evidence,
            'llm_reasoning': llm_reasoning_only,
            'rag_analysis': rag_analysis,
            'guards': guards_list,
            'remaining': [item for item in list(state.get('rag_subtopics_remaining', state.get('rag_concepts_remaining', []))) 
                         if item.lower() in set(s.lower() for s in all_subtopics)] if all_subtopics else list(state.get('rag_subtopics_remaining', [])),
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
            'evidence': f"Word count: {word_count}\nTech markers: {tech_matches}\nError: {str(e)[:80]}",
            'llm_reasoning': None,
            'rag_analysis': None,
            'guards': [],
            'remaining': None,
        }

    return {k: state[k] for k in ['node_verdicts', 'reasoning_logs', 'ai_failures', 'errors'] if k in state}
# ── A3: Progress Analyzer (Learning) ──

def learning_progress_analyzer(state: BrainState) -> BrainState:
    """
    v7.0 Progress Analyzer for learning entries.
    Checks: progress % coherence, completion justification, pace analysis,
    subtopic coverage vs claimed progress.
    """
    learning_status = state.get('learning_status', 'in_progress')
    is_completed = state['is_completed']
    total_invested = state['total_hours_invested']
    estimated_total = state['estimated_total_hours']
    prior_count = state['prior_entries_count']
    topic = state['topic_name']
    difficulty = state['topic_difficulty']
    hours = float(state['entry_data']['hours'])
    text = sanitize_input(state['entry_data']['learned_text'])

    prior_context = ""
    if state.get('prior_entries_full'):
        prior_count_display = state.get('prior_entries_count', 0)
        prior_context = (
            f"\n--- PRIOR WORK HISTORY ({prior_count_display} {'entry' if prior_count_display == 1 else 'entries'}) ---\n"
            + "\n\n".join(state['prior_entries_full'])
        )
    else:
        prior_context = "\nFirst entry on this topic — no prior work history."

    # Build trajectory summary for the prompt
    traj_summary = ""
    if state.get('progress_trajectory') and len(state['progress_trajectory']) > 1:
        traj_lines = []
        for t in state['progress_trajectory'][-6:]:
            traj_lines.append(
                f"  {t['date']}: {t['progress']}% (+{t['hours']}h) — {t['summary'][:60]}"
            )
        traj_summary = "Progress timeline:\n" + "\n".join(traj_lines)

    # ── Pre-LLM guard signals (progress-specific) ──
    _prog_new_concepts = state.get('rag_concepts_new', [])
    _prog_all_keywords = state.get('rag_validation_keywords', [])
    _prog_matched = state.get('rag_concepts_covered_current', [])
    _prog_kw_ratio = len(_prog_matched) / len(_prog_all_keywords) if _prog_all_keywords else 0
    _prog_coverage = state.get('rag_coverage_ratio', 0)
    _prog_hours_ratio = total_invested / estimated_total if estimated_total > 0 else 0

    # v8.0: Scale threshold by topic size (lowered to 8-12%)
    if len(_prog_all_keywords) <= 8:
        _prog_healthy_thresh = 0.12
    elif len(_prog_all_keywords) <= 20:
        _prog_healthy_thresh = 0.10
    else:
        _prog_healthy_thresh = 0.08

    progress_guard_signals = []
    if not is_completed and len(_prog_new_concepts) > 0 and _prog_kw_ratio >= _prog_healthy_thresh:
        progress_guard_signals.append(
            f"HEALTHY: Not completed, {len(_prog_new_concepts)} new concepts added, "
            f"{_prog_kw_ratio:.0%} keyword match — learning in progress."
        )
    elif not is_completed and len(_prog_new_concepts) > 0 and _prog_all_keywords and _prog_kw_ratio < _prog_healthy_thresh:
        progress_guard_signals.append(
            f"WARNING: {len(_prog_new_concepts)} new concepts claimed but only {_prog_kw_ratio:.0%} keyword match "
            f"({len(_prog_matched)}/{len(_prog_all_keywords)}) — content may not match this topic."
        )
    if is_completed and state.get('rag_relevant_subtopics') and _prog_coverage < 0.30:
        progress_guard_signals.append(
            f"WARNING: Only {_prog_coverage:.0%} coverage — may be insufficient for completion claim."
        )
    if is_completed and _prog_hours_ratio < 0.40 and estimated_total > 0:
        progress_guard_signals.append(
            f"WARNING: Only {_prog_hours_ratio:.0%} of estimated hours invested "
            f"({total_invested:.2f}h / ~{estimated_total:.2f}h) — may be insufficient for completion."
        )
    if not state.get('progress_coherent', True):
        progress_guard_signals.append(
            f"WARNING: Progress/completion data is inconsistent."
        )
    progress_guard_block = (
        "\n--- GUARD SIGNALS (computed from data — factor these into your assessment) ---\n"
        + "\n".join(f"  - {s}" for s in progress_guard_signals)
        if progress_guard_signals
        else "\n--- GUARD SIGNALS ---\n  No concerns detected."
    )

    # ── Compute progress reference score (Python does the arithmetic) ──
    progress_ref_score = 70  # baseline
    progress_ref_parts = ["Baseline 70"]

    # Scaled keyword thresholds for progress (same scale as content)
    # v8.0: Lowered progress guard thresholds to 3-5%
    if len(_prog_all_keywords) <= 10:
        _prog_fail_thresh, _prog_c45_thresh = 0.05, 0.08
    elif len(_prog_all_keywords) <= 20:
        _prog_fail_thresh, _prog_c45_thresh = 0.04, 0.07
    else:
        _prog_fail_thresh, _prog_c45_thresh = 0.03, 0.05

    if not is_completed:
        if len(_prog_new_concepts) > 0 and _prog_all_keywords and _prog_kw_ratio >= _prog_healthy_thresh:
            progress_ref_score += 10
            progress_ref_parts.append(f"New concepts + kw {_prog_kw_ratio:.0%}(+10)")
        elif len(_prog_new_concepts) > 0 and _prog_all_keywords and _prog_kw_ratio < _prog_fail_thresh:
            # Very low match — strong penalty
            progress_ref_score -= 20
            progress_ref_parts.append(f"Low kw match {_prog_kw_ratio:.0%} < {_prog_fail_thresh:.0%}(-20)")
        elif len(_prog_new_concepts) > 0 and _prog_all_keywords and _prog_kw_ratio < _prog_healthy_thresh:
            progress_ref_score -= 10
            progress_ref_parts.append(f"Low kw match {_prog_kw_ratio:.0%}(-10)")
        elif len(_prog_new_concepts) == 0 and _prog_all_keywords:
            progress_ref_score -= 10
            progress_ref_parts.append("No new concepts(-10)")
        # Coverage growing bonus (only if content genuinely matches this topic)
        if len(_prog_new_concepts) > 0 and (not _prog_all_keywords or _prog_kw_ratio >= _prog_healthy_thresh):
            progress_ref_score += 5
            progress_ref_parts.append("Coverage growing(+5)")
    else:  # completed
        if _prog_coverage >= 0.60:
            progress_ref_score += 10
            progress_ref_parts.append(f"Coverage {_prog_coverage:.0%}(+10)")
        elif _prog_coverage >= 0.30:
            progress_ref_parts.append(f"Coverage {_prog_coverage:.0%}(+0)")
        else:
            progress_ref_score -= 20
            progress_ref_parts.append(f"Coverage {_prog_coverage:.0%}(-20)")
        if _prog_hours_ratio >= 0.60:
            progress_ref_score += 5
            progress_ref_parts.append(f"Hours {_prog_hours_ratio:.0%}(+5)")
        elif _prog_hours_ratio >= 0.40:
            progress_ref_parts.append(f"Hours {_prog_hours_ratio:.0%}(+0)")
        else:
            progress_ref_score -= 15
            progress_ref_parts.append(f"Hours {_prog_hours_ratio:.0%}(-15)")
    if not state.get('progress_coherent', True):
        progress_ref_score -= 15
        progress_ref_parts.append("Coherence issue(-15)")
    if prior_count == 0:
        progress_ref_score += 5
        progress_ref_parts.append("First entry(+5)")
    progress_ref_score = max(0, min(100, progress_ref_score))
    progress_ref_math = " + ".join(progress_ref_parts) + f" = {progress_ref_score}%"

    # Full RAG knowledge block for progress assessment
    rag_block = state.get('rag_context_summary', '')

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="qwen2.5:7b", temperature=0, timeout=15)

        # v7.0: RAG subtopic coverage for progress assessment
        rag_coverage = ""
        # Pure subtopic-only remaining (used for display in prompt + evidence)
        _subtopics_set = set(s.lower() for s in state.get('rag_relevant_subtopics', []))
        _all_covered = set(s.lower() for s in (state.get('rag_concepts_covered_prior', []) + state.get('rag_concepts_covered_current', [])))
        _subtopics_remaining = _subtopics_set - _all_covered
        if state.get('rag_relevant_subtopics'):
            coverage_ratio = state.get('rag_coverage_ratio', 0)
            concepts_remaining = state.get('rag_concepts_remaining', [])
            rag_coverage = (
                f"\n--- COVERAGE ---\n"
                f"Concept coverage (subtopics + keywords): {coverage_ratio:.0%}\n"
                f"Subtopics remaining: {len(_subtopics_remaining)}/{len(_subtopics_set)}\n"
                f"Remaining uncovered concepts: {', '.join(concepts_remaining) or 'All covered'}\n"
            )

        prompt = f"""{LEARNING_BRIEFING}
You are Node 4 (Progress Analyzer). Assess if the claimed progress makes sense.
You must judge INDEPENDENTLY based only on progress data and context — not other nodes.

--- CONTEXT ---
learning_status indicates the current state: 'in_progress' or 'completed'.
'in_progress' with many hours is NORMAL — it means "not finished yet", NOT "no work done".
No matter the hours or subtopic coverage it won't change status until the learner marks it complete.
ONLY validate completion claims when learning_status='completed'.

Topic: "{topic}" (Difficulty: {difficulty}/5)
Status: {state.get('learning_status', 'in_progress')}
Completed: {is_completed}
Total hours invested: {total_invested:.2f}h
Estimated total hours for this topic: ~{estimated_total:.2f}h
This is entry #{prior_count + 1}
This session: {hours}h

{traj_summary}
{prior_context}
{rag_block}
{rag_coverage}

IMPORTANT: Entry descriptions are limited to 50-500 characters. Learners CANNOT write essays.
A summary/listing style is EXPECTED and NORMAL for this character limit.
Do NOT penalize for lack of depth — judge by concepts covered, not explanation depth.

Description: "{text}"

--- SEQUENTIAL PROGRESS TRACKING ---
{"Prior coverage: " + str(len(state.get('rag_concepts_covered_prior', []))) + " concepts" if state.get('rag_concepts_covered_prior') else "Starting fresh (first entry)"}
{"This entry adds: +" + str(len(state.get('rag_concepts_new', []))) + " NEW concepts" if state.get('rag_concepts_new') else "No new concepts"}
{"Total coverage now: " + str(len(set(state.get('rag_concepts_covered_prior', [])) | set(state.get('rag_concepts_covered_current', [])))) + " / " + str(len(state.get('rag_relevant_subtopics', []))) + " (" + str(round(state.get('rag_coverage_ratio', 0) * 100)) + "%)" if state.get('rag_relevant_subtopics') else ""}
{"Depth: " + str(len(state.get('rag_depth_summary', {}).get('deep', []))) + " concepts studied deeply (3+ entries), " + str(len(state.get('rag_depth_summary', {}).get('shallow', []))) + " only touched once" if state.get('rag_depth_summary') else ""}

Sequential progress check:
1. Is the learner making STEADY progress? (not stagnating, not jumping)
2. Does each entry add NEW knowledge? (check NEW concepts above)
3. For NON-COMPLETED entries: Uncovered subtopics are NORMAL — the learner is still working. Judge by CONTRIBUTION (new concepts added), not by absolute coverage level. For COMPLETED entries: Does coverage justify completion?
4. For completion claims: Is coverage sufficient?
{progress_guard_block}

Think step-by-step:
1. HOURS ASSESSMENT: With {total_invested:.2f}h invested vs ~{estimated_total:.2f}h estimated, is the time investment reasonable for this topic (difficulty {difficulty}/5)?
2. {"COMPLETION VALIDATION: The learner marked this COMPLETE. Check: (a) Hours ratio: " + str(round(total_invested, 2)) + "h of ~" + str(round(estimated_total, 2)) + "h (" + str(round(total_invested / estimated_total * 100 if estimated_total > 0 else 0)) + "%) — acceptable if ≥40%, ideal if ≥80%. (b) Subtopic coverage: " + str(round(state.get('rag_coverage_ratio', 0) * 100)) + "% — does this justify marking complete? (c) Work quality: Does the description demonstrate mastery-level understanding?" if is_completed else "SEQUENTIAL LEARNING: The learner is still in progress. This is NORMAL — they haven't marked it complete yet. Check: (a) Is subtopic coverage INCREASING across entries? Currently at " + str(round(state.get('rag_coverage_ratio', 0) * 100)) + "% with +" + str(len(state.get('rag_concepts_new', []))) + " new concepts this entry. (b) Is each entry adding meaningful NEW knowledge? (c) At this coverage level with " + str(round(total_invested, 2)) + "h invested, is the learning trajectory healthy?"}
3. SUBTOPIC COVERAGE ANALYSIS: At {round(state.get('rag_coverage_ratio', 0) * 100):.0f}% subtopic coverage (the REAL progress metric), {"is this sufficient to justify completion? Check remaining uncovered subtopics." if is_completed else "is the learner making appropriate progress? Each entry should add new concepts."}
4. For a difficulty {difficulty}/5 topic with {total_invested:.2f}h invested and {round(state.get('rag_coverage_ratio', 0) * 100):.0f}% coverage, does the learning pace make sense?

IMPORTANT — MATCHING IMPRECISION:
Keyword fuzzy matching has inherent limitations. ~5-10% of keywords may not match due to:
- Phrasing differences (entry says "evaluated models using metrics" but keyword is "clustering evaluation metrics")
- Multi-word concepts where only the core term appears (entry says "MSE" but keyword is "mse loss function")
- Special characters in technical terms (e.g., "k-means++")
A coverage of 90%+ should be treated as essentially COMPLETE — the gap is almost certainly matching noise.
{f"This topic has {len(state.get('rag_relevant_subtopics', []))} subtopics and {len(set(s.lower() for s in state.get('rag_relevant_subtopics', [])) | set(k.lower() for k in state.get('rag_validation_keywords', [])))} total concepts (subtopics + keywords). {len(_subtopics_remaining)} subtopics are unmatched." if state.get('rag_relevant_subtopics') else ""}
{"The learner has NOT marked this topic complete — remaining uncovered subtopics are EXPECTED and NORMAL. Do NOT penalize low coverage on non-completed entries. Judge this entry by whether it CONTRIBUTES new learning (new concepts added), not by how much remains uncovered." if not is_completed else f"COMPLETION CLAIM: {len(_subtopics_remaining)} unmatched subtopics out of {len(_subtopics_set)}. This is {'normal (matching noise)' if len(_subtopics_remaining) <= 3 else 'worth investigating' if len(_subtopics_remaining) <= 6 else 'a genuine coverage gap — verify carefully'}." if state.get('rag_relevant_subtopics') else ""}

{"--- MANDATORY COMPLETION VERIFICATION ---" if is_completed else ""}
{"CHECK 1 - Subtopic Coverage: " + str(round(state.get('rag_coverage_ratio', 0) * 100)) + "% covered. Minimum ≥50% for completion (but remember: 90%+ = essentially complete, matching imprecision accounts for the rest)." if is_completed and state.get('rag_relevant_subtopics') else ""}
{"CHECK 2 - Hours Investment: " + str(round(total_invested, 2)) + "h of ~" + str(round(estimated_total, 2)) + "h (" + str(round(total_invested / estimated_total * 100 if estimated_total > 0 else 0)) + "%). Minimum 40% for completion." if is_completed else ""}
{"CHECK 3 - Description Depth: Does the final entry demonstrate mastery-level understanding?" if is_completed else ""}
{"If ANY check fails, verdict MUST be CONCERN or FAIL." if is_completed else ""}

Verdict Guidelines:
- PASS (80-100 confidence): Progress is consistent with hours invested and description quality
- CONCERN (40-79 confidence): Progress seems inflated, or completion claim lacks sufficient coverage/hours
- FAIL (0-39 confidence): Clear mismatch between claimed progress and evidence

COMPUTED REFERENCE (verified arithmetic): {progress_ref_math}
Your confidence MUST equal {progress_ref_score}% unless you have a specific reason to deviate.
DO NOT recalculate — this math is already verified.

OUTPUT FORMAT (STRICT):
Step-by-step: [Walk through the COMPUTED REFERENCE factors. Cite which applied.]
Reasoning: [2-3 sentences interpreting the result]
Verdict: [PASS or CONCERN or FAIL — one word only]
Confidence: [0-100 — number only]"""

        response = llm.invoke(prompt).strip()
        verdict, confidence, reasoning = extract_verdict(response)

        # Save pure LLM reasoning before mixing with RAG/guards
        llm_reasoning_only = reasoning
        guards_list = []
        llm_raw_verdict, llm_raw_confidence = verdict, confidence

        # ── v8.0 MATH CORRECTION guard (±20 tolerance) ──
        if abs(confidence - progress_ref_score) > 20:
            pre_conf = confidence
            confidence = progress_ref_score
            if confidence >= 70:
                verdict = 'PASS'
            else:
                verdict = 'CONCERN'
            guards_list.append(
                f"MATH CORRECTION: LLM gave {pre_conf}% but verified math is {progress_ref_math}. "
                f"Confidence: {pre_conf} → {confidence}"
            )

        # ── PROGRESS LOW MATCH GUARD (for non-completed entries with very low keyword match) ──
        if not is_completed and _prog_all_keywords and _prog_kw_ratio < _prog_c45_thresh:
            pre_conf = confidence
            topic_mismatch = state.get('rag_topic_mismatch')
            if _prog_kw_ratio < _prog_fail_thresh:
                verdict = 'CONCERN'
                confidence = min(confidence, 40)
                _pg_msg = (
                    f"PROGRESS LOW MATCH: {_prog_kw_ratio:.0%} keyword match "
                    f"({len(_prog_matched)}/{len(_prog_all_keywords)}) below "
                    f"{_prog_fail_thresh:.0%} FAIL threshold. Capped at {confidence}%."
                )
            else:
                verdict = 'CONCERN'
                confidence = min(confidence, 50)
                _pg_msg = (
                    f"PROGRESS LOW MATCH: {_prog_kw_ratio:.0%} keyword match "
                    f"({len(_prog_matched)}/{len(_prog_all_keywords)}) below "
                    f"{_prog_c45_thresh:.0%} threshold. Capped at {confidence}%."
                )
            if topic_mismatch:
                best_t = topic_mismatch.get('best_match_topic', '?')
                _pg_msg += f" | TOPIC MISMATCH: content best matches '{best_t}'"
                confidence = min(confidence, 35)
                verdict = 'FAIL'
                _pg_msg += f" → Forced FAIL at {confidence}%"
            reasoning += f"\n[{_pg_msg}]"
            guards_list.append(f"Confidence: {pre_conf} → {confidence}. {_pg_msg}")

        # ── Fix 11: Non-completed progress floor ──
        # If learner hasn't claimed completion and is adding new concepts,
        # progress is inherently healthy. Override LLM if it gave non-PASS.
        # BUT: only if keyword match proves the entry actually matches this topic.
        new_concepts = state.get('rag_concepts_new', [])
        _floor_kw_ratio = _prog_kw_ratio  # computed pre-LLM above
        _floor_kw_threshold = _prog_healthy_thresh  # scaled by topic size
        if not is_completed and len(new_concepts) > 0 and (not _prog_all_keywords or _floor_kw_ratio >= _floor_kw_threshold):
            if verdict != 'PASS':
                original_verdict = verdict
                pre_conf = confidence
                verdict = 'PASS'
                confidence = max(confidence, 80)
                guards_list.append(
                    f"NON-COMPLETED FLOOR: Entry not marked complete + {len(new_concepts)} new concepts added "
                    f"(keyword match {_floor_kw_ratio:.0%} ≥ {_floor_kw_threshold:.0%} threshold). "
                    f"LLM gave {original_verdict} ({pre_conf}%) — overrode to PASS. Confidence: {pre_conf} → {confidence}"
                )
            elif confidence < 80:
                pre_conf = confidence
                confidence = 80
                guards_list.append(
                    f"NON-COMPLETED FLOOR: Entry not marked complete + {len(new_concepts)} new concepts "
                    f"(keyword match {_floor_kw_ratio:.0%} ≥ {_floor_kw_threshold:.0%}). "
                    f"LLM PASS raised. Confidence: {pre_conf} → {confidence}"
                )

        # ── Fix 12: Hallucination visibility guard ──
        # Check if LLM cited a coverage % that differs from actual
        actual_coverage_pct = round(state.get('rag_coverage_ratio', 0) * 100)
        coverage_mentions = re.findall(r'(\d+)%\s*(?:subtopic|coverage|covered)', llm_reasoning_only, re.IGNORECASE)
        for cited in coverage_mentions:
            cited_int = int(cited)
            if abs(cited_int - actual_coverage_pct) > 5:
                guards_list.append(
                    f"HALLUCINATION CHECK: LLM cited {cited_int}% coverage but actual is {actual_coverage_pct}%."
                )

        # Fix 1: Append RAG coverage analysis to reasoning
        coverage_ratio = state.get('rag_coverage_ratio', 0)
        all_subtopics = state.get('rag_relevant_subtopics', [])
        matched_keywords = state.get('rag_concepts_covered_current', [])
        remaining = state.get('rag_concepts_remaining', [])

        # v7.6 Fix 3: Use TOTAL concepts (subtopics + keywords) for threshold
        keywords_list = state.get('rag_validation_keywords', [])
        all_concepts_unique = list(set(
            [s.lower() for s in all_subtopics] +
            [k.lower() for k in keywords_list]
        ))
        num_concepts = len(all_concepts_unique)

        # Compute pure subtopic-only remaining for accurate display
        subtopics_set = set(s.lower() for s in all_subtopics)
        all_covered_set = set(s.lower() for s in (state.get('rag_concepts_covered_prior', []) + state.get('rag_concepts_covered_current', [])))
        subtopics_remaining_set = subtopics_set - all_covered_set
        concepts_covered_count = len(set(all_concepts_unique) & all_covered_set)

        rag_analysis = "\n\n--- RAG COVERAGE ANALYSIS ---\n"
        rag_analysis += f"Concepts Covered: {concepts_covered_count}/{num_concepts} ({coverage_ratio:.0%})\n"
        rag_analysis += f"Subtopics Remaining: {len(subtopics_remaining_set)}/{len(subtopics_set)}\n"
        rag_analysis += f"Status: {learning_status}\n"
        rag_analysis += f"Completion Claimed: {is_completed}\n"
        if remaining:
            rag_analysis += f"Still Remaining: {', '.join(remaining)}\n"
        rag_analysis += f"Hours Ratio: {total_invested:.2f}h / ~{estimated_total:.2f}h ({(total_invested / estimated_total * 100) if estimated_total > 0 else 0:.0f}%)\n"
        reasoning = reasoning + rag_analysis

        if num_concepts <= 10:
            min_coverage = 0.50  # Small topic: need 50%
        elif num_concepts <= 20:
            min_coverage = 0.40  # Medium topic: need 40%
        elif num_concepts <= 30:
            min_coverage = 0.30  # Large topic: need 30%
        else:
            min_coverage = 0.20  # Huge topic: need 20%

        if is_completed and all_subtopics and coverage_ratio < min_coverage:
            original_verdict = verdict
            pre_conf = confidence
            verdict = 'CONCERN'
            confidence = max(30, min(confidence - 30, 50))
            reasoning += f"\n[COVERAGE GUARD] Only {coverage_ratio:.0%} coverage (min {min_coverage:.0%} for {num_concepts}-concept topic). Overrode {original_verdict} → CONCERN."
            guards_list.append(f"COVERAGE GUARD: Only {coverage_ratio:.0%} coverage (min {min_coverage:.0%} for {num_concepts}-concept topic). Overrode {original_verdict} → CONCERN. Confidence: {pre_conf} → {confidence}")

        completion_hours_ratio = total_invested / estimated_total if estimated_total > 0 else 0
        if is_completed and completion_hours_ratio < 0.40:
            pre_conf = confidence
            if verdict != 'FAIL':
                verdict = 'CONCERN'
            confidence = max(25, min(confidence - 25, 45))
            reasoning += f"\n[HOURS GUARD] Only {total_invested:.2f}h of ~{estimated_total:.2f}h estimated ({completion_hours_ratio:.0%}). Min 40% for completion."
            guards_list.append(f"HOURS GUARD: Only {total_invested:.2f}h of ~{estimated_total:.2f}h estimated ({completion_hours_ratio:.0%}). Min 40% for completion. Confidence: {pre_conf} → {confidence}")

        # Fix 3: Coverage/progress mismatch penalty — ONLY for completion claims
        # With binary progress (0%=working, 100%=complete), comparing coverage vs progress
        # is meaningless when not completed — 0% progress with high coverage is NORMAL.
        if is_completed and all_subtopics and coverage_ratio > 0:
            if coverage_ratio < 0.70:
                pre_conf = confidence
                penalty = min(20, int((70 - coverage_ratio * 100) / 2))
                confidence = max(20, confidence - penalty)
                reasoning += f"\n[MISMATCH PENALTY] Completed but coverage only {coverage_ratio:.0%}: -{penalty}%"
                guards_list.append(f"MISMATCH PENALTY: Completed but coverage only {coverage_ratio:.0%}: -{penalty}%. Confidence: {pre_conf} → {confidence}")

        # Coherence penalty
        if not state['progress_coherent']:
            pre_conf = confidence
            confidence = max(20, confidence - 20)
            reasoning += " [Progress coherence issue detected]"
            guards_list.append(f"COHERENCE: Progress coherence issue detected. Confidence: {pre_conf} → {confidence}")
            if verdict == 'PASS':
                verdict = 'CONCERN'

        if verdict != llm_raw_verdict or confidence != llm_raw_confidence:
            guards_list.insert(0, f"LLM raw: {llm_raw_verdict} at {llm_raw_confidence}%")
            guards_list.append(f"Final: {verdict} at {confidence}%")

        state['node_verdicts']['progress'] = {
            'verdict': verdict, 'confidence': confidence, 'reasoning': reasoning,
        }

        progress_evidence = (
            f"Status: {learning_status}\n"
            f"Completion: {is_completed}\n"
            f"Hours: {total_invested:.2f}h / ~{estimated_total:.2f}h ({(total_invested/estimated_total*100) if estimated_total > 0 else 0:.0f}%)\n"
            f"Concept coverage: {coverage_ratio:.0%}\n"
            f"Subtopics remaining: {len(subtopics_remaining_set)}/{len(subtopics_set)}\n"
            f"Concepts remaining: {len(remaining)}/{num_concepts}\n"
            f"Coherence: {'OK' if state['progress_coherent'] else 'ISSUE'}"
        )

        state['reasoning_logs']['progress_analysis'] = {
            'summary': (
                f"📊 Progress: {verdict} ({confidence}%). "
                f"Coverage: {coverage_ratio:.0%} (status: {learning_status}), "
                f"hours: {total_invested:.2f}h/{estimated_total:.2f}h ({(total_invested/estimated_total*100) if estimated_total > 0 else 0:.0f}%)."
            ),
            'score': confidence, 'verdict': verdict, 'path': 'ai',
            'path_reason': (
                f"LLM analyzed progress: status={learning_status} with {total_invested:.2f}h invested "
                f"vs ~{estimated_total:.2f}h estimated, coverage {coverage_ratio:.0%}. "
                f"{'Completion guards triggered.' if is_completed and (coverage_ratio < 0.60 or completion_hours_ratio < 0.40) else 'Ongoing progress assessed.' if not is_completed else 'Completion verified.'}"
            ),
            'details': reasoning,
            'llm_raw_response': response,
            'evidence': progress_evidence,
            'llm_reasoning': llm_reasoning_only,
            'rag_analysis': rag_analysis,
            'guards': guards_list,
            'remaining': [item for item in list(state.get('rag_subtopics_remaining', state.get('rag_concepts_remaining', []))) 
                         if item.lower() in set(s.lower() for s in all_subtopics)] if all_subtopics else list(state.get('rag_subtopics_remaining', [])),
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
        elif not is_completed and total_invested > 0:
            # Still in progress (0%) with hours invested = PASS (ongoing learning is healthy)
            # Binary progress: 0% just means "not marked complete yet", not "no work done"
            verdict, confidence = 'PASS', 60
        else:
            verdict, confidence = 'CONCERN', 45

        state['node_verdicts']['progress'] = {
            'verdict': verdict, 'confidence': confidence,
            'reasoning': f'Fallback: {learning_status} at {total_invested:.2f}h of ~{estimated_total:.2f}h ({round(completion_ratio*100, 0):.0f}% of estimate).',
        }
        state['reasoning_logs']['progress_analysis'] = {
            'summary': f"Progress Analyzer (fallback): {verdict} ({confidence}%).",
            'score': confidence, 'verdict': verdict, 'path': 'breaker',
            'path_reason': f"LLM failed ({str(e)[:60]}). Ratio-based fallback.",
            'details': f"Status: {learning_status}, invested: {total_invested:.2f}h, estimated: {estimated_total:.2f}h.",
            'evidence': f"Status: {learning_status}\nInvested: {total_invested:.2f}h\nEstimated: {estimated_total:.2f}h\nCompletion ratio: {round(completion_ratio*100, 0):.0f}%",
            'llm_reasoning': None,
            'rag_analysis': None,
            'guards': [],
            'remaining': None,
        }

    return {k: state[k] for k in ['node_verdicts', 'reasoning_logs', 'ai_failures', 'errors'] if k in state}
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
    learning_status = state.get('learning_status', 'in_progress')
    prior_count = state['prior_entries_count']
    blocker_summary = state.get('blocker_summary', 'No blockers.')
    intent = state['intent']

    prior_work = ""
    if state.get('prior_entries_full'):
        prior_work = "\n\n".join(state['prior_entries_full'])
    else:
        prior_work = ""

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="qwen2.5:7b", temperature=0, timeout=15)

        prompt = f"""{PROJECT_BRIEFING}
You are Node 2 (Time Reasoner). Assess if the claimed hours are reasonable for this project work.

--- PROJECT CONTEXT ---
learning_status indicates the current state: 'in_progress' or 'completed'.
'in_progress' with many hours is NORMAL — it means "not finished yet", NOT "no work done".
ONLY validate completion claims when learning_status='completed'.

Project: "{project_name}"
Description: "{project_desc[:300]}"
Intent: {'SBU Tasks' if intent == 'sbu_tasks' else 'L&D Tasks'}
Learner: {exp} years experience ({state.get('experience_tier', 'mid')} tier)
Total hours invested in this project: {total_invested:.2f}h
Status: {learning_status}
Entry #{prior_count + 1}
This session claimed: {hours}h

Blockers: {blocker_summary}
{f"Deadline: {state.get('project_start_date')} to {state.get('project_end_date')}" if state.get('project_start_date') and state.get('project_end_date') else ''}
{f"Your hours: {state.get('user_hours_invested', total_invested):.2f}h (project parallel: {state.get('project_parallel_hours', total_invested):.2f}h)" if state.get('project_is_team') else ''}

{"Prior entries:" if prior_work else "First entry — no prior work."}
{prior_work}

Work description: "{sanitize_input(state['entry_data']['learned_text'])}"

IMPORTANT: Project work descriptions are limited to 50-500 characters.
A concise, bullet-point style is EXPECTED and NORMAL for daily project logs.
Judge by SUBSTANCE (what was done), not LENGTH (how many words).

COMPUTED REFERENCE (verified arithmetic): {{proj_time_ref_math}}
Your confidence MUST equal {{proj_time_ref_score}}% unless you have a specific reason to deviate.
DO NOT recalculate — this math is already verified.

Think step-by-step:
1. For {intent.replace('_', ' ')} on "{project_name}", is {hours}h reasonable for a single session?
2. Given the project scope and {total_invested:.2f}h already invested (status: {learning_status}), does {hours}h more make sense?
3. Does the work description detail match roughly {hours}h of effort?
4. BLOCKER ANALYSIS (CRITICAL):
   Blocker reported: {blocker_summary}

   Blocker Impact Guidelines:
   - Resource blockers (missing docs, broken tools, unavailable mentors): Can justify +20-40% extra time
   - Technical blockers (complex debugging, dependency conflicts, environment setup): Can justify +30-50% extra time
   - Environmental blockers (internet down, power outage, system crashes): Can justify +40-60% extra time
   - Personal blockers (health, family emergency): Use judgment, be lenient
   - Vague blockers ("didn't have enough resources", "faced some issues"): Skeptical, max +10% extra time
5. With {exp} years experience, is this time reasonable for this type of work?

OUTPUT FORMAT (STRICT):
Step-by-step: [Walk through the COMPUTED REFERENCE factors. Cite which applied.]
Reasoning: [2-4 sentences max. Be concise. State key points only]
Verdict: [PASS or CONCERN or FAIL — one word only]
Confidence: [0-100 — number only]"""

        # v9.0: Project time ref_score — experience-based + deadline + cumulative pacing
        has_blocker = blocker_summary and 'No blockers' not in blocker_summary
        proj_time_ref_score = 70
        proj_time_ref_parts = ["Baseline 70"]

        # Session reasonableness (experience-based threshold)
        max_reasonable = 10 if exp >= 3 else 8
        if hours <= max_reasonable:
            proj_time_ref_score += 5
            proj_time_ref_parts.append(f"Within {max_reasonable}h(+5)")
        elif hours > max_reasonable and has_blocker:
            proj_time_ref_parts.append(f"Over {max_reasonable}h with blocker(+0)")
        elif hours > max_reasonable * 1.5:
            proj_time_ref_score -= 10
            proj_time_ref_parts.append(f"Extreme session(-10)")
        else:
            proj_time_ref_score -= 5
            proj_time_ref_parts.append(f"Over {max_reasonable}h no blocker(-5)")

        # Deadline awareness
        _start = state.get('project_start_date')
        _end = state.get('project_end_date')
        _mod_coverage = state.get('project_module_coverage', 0)
        if _start and _end:
            from datetime import date as _date_cls
            _today = _date_cls.today()
            _total_days = max((_end - _start).days, 1)
            _elapsed_days = max((_today - _start).days, 0)
            _deadline_pct = _elapsed_days / _total_days * 100
            if _deadline_pct > 90 and _mod_coverage < 0.50:
                proj_time_ref_score -= 10
                proj_time_ref_parts.append(f"Near deadline {_deadline_pct:.0f}% at {_mod_coverage:.0%} done(-10)")
            elif _deadline_pct > 70 and _mod_coverage < 0.30:
                proj_time_ref_score -= 5
                proj_time_ref_parts.append(f"Deadline concern {_deadline_pct:.0f}%(-5)")

        # Cumulative pacing (user hours vs module coverage)
        _user_total = state.get('user_hours_invested', total_invested)
        if _user_total > 20 and _mod_coverage < 0.30:
            if has_blocker:
                proj_time_ref_score -= 5
                proj_time_ref_parts.append(f"High hours {_user_total:.0f}h low progress with blocker(-5)")
            else:
                proj_time_ref_score -= 10
                proj_time_ref_parts.append(f"High hours {_user_total:.0f}h low progress(-10)")

        # First entry leniency
        if prior_count == 0:
            proj_time_ref_score += 5
            proj_time_ref_parts.append("First entry(+5)")
        proj_time_ref_score = max(0, min(100, proj_time_ref_score))
        proj_time_ref_math = " + ".join(proj_time_ref_parts) + f" = {proj_time_ref_score}%"

        # Inject ref_score into prompt
        prompt = prompt.replace('{{proj_time_ref_math}}', proj_time_ref_math)
        prompt = prompt.replace('{{proj_time_ref_score}}', str(proj_time_ref_score))

        t0 = time.monotonic()
        response = llm.invoke(prompt).strip()
        state['llm_latency'] = time.monotonic() - t0

        verdict, confidence, reasoning = extract_verdict(response)

        # v8.0: SBU MATH CORRECTION (±20 tolerance)
        guards_list = []
        llm_raw_verdict, llm_raw_confidence = verdict, confidence
        if abs(confidence - proj_time_ref_score) > 20:
            pre_conf = confidence
            confidence = proj_time_ref_score
            if confidence >= 70:
                verdict = 'PASS'
            else:
                verdict = 'CONCERN'
            guards_list.append(
                f"MATH CORRECTION: LLM gave {pre_conf}% but verified math is {proj_time_ref_math}. "
                f"Confidence: {pre_conf} → {confidence}"
            )

        state['node_verdicts']['time'] = {
            'verdict': verdict, 'confidence': confidence, 'reasoning': reasoning,
        }
        proj_time_evidence = (
            f"Hours claimed: {hours}h\n"
            f"Project: {project_name}\n"
            f"Total invested: {total_invested:.2f}h\n"
            f"Status: {learning_status}\n"
            f"Blockers: {blocker_summary}"
        )
        state['reasoning_logs']['time_analysis'] = {
            'summary': f"Time Reasoner: {verdict} ({confidence}%). {hours}h for project '{project_name}'.",
            'score': confidence, 'verdict': verdict, 'path': 'ai',
            'path_reason': (
                f"LLM assessed {hours}h for project '{project_name}' "
                f"({total_invested:.2f}h invested, status: {learning_status}). "
                f"Blockers factored in: {blocker_summary[:80]}"
            ),
            'details': reasoning,
            'llm_raw_response': response,
            'evidence': proj_time_evidence,
            'llm_reasoning': reasoning,
            'rag_analysis': None,
            'guards': guards_list,
            'remaining': None,
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
            'evidence': f"Hours claimed: {hours}h\nError: {str(e)[:80]}",
            'llm_reasoning': None,
            'rag_analysis': None,
            'guards': [],
            'remaining': None,
        }

    return {k: state[k] for k in ['node_verdicts', 'reasoning_logs', 'ai_failures', 'errors'] if k in state}
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
    learning_status = state.get('learning_status', 'in_progress')
    copy_paste_flagged = state['copy_paste_flagged']
    copy_paste_sim = state['copy_paste_max_similarity']

    prior_context = ""
    if state.get('prior_entries_full'):
        prior_count_display = state.get('prior_entries_count', 0)
        prior_context = (
            f"\n--- PRIOR WORK HISTORY ({prior_count_display} {'entry' if prior_count_display == 1 else 'entries'}) ---\n"
            + "\n\n".join(state['prior_entries_full'])
        )
    else:
        prior_context = "\nFirst entry on this project — no prior work history."

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="qwen2.5:7b", temperature=0, timeout=15)

        # v7.0: Inject admin corrections from RAG
        admin_corrections_block = ""
        admin_corrections = state.get('rag_admin_corrections', [])
        if admin_corrections:
            admin_corrections_block = (
                "\n--- ADMIN CORRECTIONS (learn from these) ---\n"
                + '\n'.join(admin_corrections)
            )

        # v7.6 Fix 11: Extract and match tech stack from project description
        expected_tech = set()
        tech_mentioned = set()
        tech_context = ""

        if project_desc and project_desc != 'No description':
            tech_keywords = [
                'react', 'vue', 'angular', 'svelte', 'next', 'nuxt',
                'django', 'flask', 'fastapi', 'express', 'spring', 'rails',
                'node', 'deno', 'bun',
                'python', 'javascript', 'typescript', 'java', 'csharp', 'go', 'rust',
                'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
                'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'heroku',
                'stripe', 'paypal', 'twilio', 'sendgrid',
                'jwt', 'oauth', 'saml', 'auth0',
                'rest', 'graphql', 'websocket', 'grpc',
                'webpack', 'vite', 'rollup', 'esbuild',
                'jest', 'pytest', 'mocha', 'cypress',
            ]

            desc_lower = project_desc.lower()
            for tech in tech_keywords:
                if fuzzy_keyword_match(desc_lower, tech, threshold=0.8):
                    expected_tech.add(tech)

            entry_lower = text.lower()
            for tech in expected_tech:
                if fuzzy_keyword_match(entry_lower, tech, threshold=0.8):
                    tech_mentioned.add(tech)

            if expected_tech:
                tech_context = (
                    f"\n--- TECH STACK ANALYSIS ---\n"
                    f"Expected Tech (from project description): {', '.join(expected_tech)}\n"
                    f"Mentioned in this entry: {', '.join(tech_mentioned) if tech_mentioned else 'None'}\n"
                    f"Tech coverage: {len(tech_mentioned)}/{len(expected_tech)} ({len(tech_mentioned)/len(expected_tech)*100:.0f}%)\n"
                )

        # v9.0: Work Validator ref_score (baseline 70 ± adjustments)
        work_ref_score = 70
        work_ref_parts = ["Baseline 70"]

        # Copy-paste in ref_score
        if copy_paste_flagged:
            work_ref_score -= 25
            work_ref_parts.append(f"Copy-paste({round(copy_paste_sim*100)}%)(-25)")

        # Out-of-scope check
        out_of_scope = state.get('project_out_of_scope', [])
        entry_lower = text.lower()
        oos_flagged = False
        oos_term = ''
        for forbidden in out_of_scope:
            if fuzzy_keyword_match(entry_lower, forbidden.lower(), threshold=0.75):
                work_ref_score -= 15
                work_ref_parts.append(f"Out of scope '{forbidden}'(-15)")
                oos_flagged = True
                oos_term = forbidden
                break

        # Tech deviation
        if expected_tech and tech_mentioned:
            if not any(t in expected_tech for t in tech_mentioned):
                work_ref_score -= 5
                work_ref_parts.append(f"Tech deviation(-5)")
        elif expected_tech and not tech_mentioned and len(text.split()) > 30:
            work_ref_score -= 5
            work_ref_parts.append(f"No expected tech mentioned(-5)")

        # First entry leniency
        if prior_count == 0:
            work_ref_score += 5
            work_ref_parts.append("First entry(+5)")

        work_ref_score = max(0, min(100, work_ref_score))
        work_ref_math = " + ".join(work_ref_parts) + f" = {work_ref_score}%"

        prompt = f"""{PROJECT_BRIEFING}
You are Node 3 (Work Validator). Evaluate if this describes real incremental project work.
You must judge INDEPENDENTLY based only on the work description and project context — not other nodes.

--- PROJECT CONTEXT ---
CRITICAL: learning_status indicates the current state: 'in_progress' or 'completed'.
'in_progress' with many hours is NORMAL — it means "not finished yet", NOT "no work done".
ONLY validate completion claims when is_completed=True.

Project: "{project_name}"
Description: "{project_desc[:300]}"
Intent: {'SBU Tasks' if intent == 'sbu_tasks' else 'L&D Tasks'}
Hours claimed: {hours}h
Status: {learning_status} | Total invested: {total_invested:.2f}h
Entry #{prior_count + 1}
{"COPY-PASTE WARNING: " + str(round(copy_paste_sim * 100)) + "% similarity with previous entry!" if copy_paste_flagged else ""}
{prior_context}
{state.get('rag_context_summary', '')}
{tech_context}

--- WORK DESCRIPTION TO EVALUATE ---
"{text}"

IMPORTANT: Project work descriptions are limited to 50-500 characters.
A concise, bullet-point style is EXPECTED and NORMAL for daily project logs.
Judge by SUBSTANCE (what was done), not LENGTH (how many words).

COMPUTED REFERENCE (verified arithmetic): {work_ref_math}
Your confidence MUST equal {work_ref_score}% unless you have a specific reason to deviate.
DO NOT recalculate — this math is already verified.

Think step-by-step:
1. Does this description relate to the PROJECT ("{project_name}")? Does it match the project description?
2. Is this REAL, SPECIFIC work (names features, functions, files, bugs) or vague filler?
3. Does this represent INCREMENTAL progress beyond prior entries?
4. For {hours}h of {intent.replace('_', ' ')}, is the amount of work described reasonable?
5. Is the learner actually building/fixing/debugging things, or just describing plans/intentions?
{"6. HIGH SIMILARITY with prior entry — is this genuinely different work?" if copy_paste_flagged else ""}
{"7. Admin corrections above — have similar project entries been misjudged?" if admin_corrections else ""}
{"8. Does the entry mention expected tech stack components?" if expected_tech else ""}

OUTPUT FORMAT (STRICT):
Step-by-step: [Walk through the COMPUTED REFERENCE factors. Cite which applied.]
Reasoning: [2-4 sentences max. Be concise. State key points only]
Verdict: [PASS or CONCERN or FAIL — one word only]
Confidence: [0-100 — number only]"""

        response = llm.invoke(prompt).strip()
        verdict, confidence, reasoning = extract_verdict(response)

        # Save pure LLM reasoning before any guard modifications
        llm_reasoning_only = reasoning
        guards_list = []
        llm_raw_verdict, llm_raw_confidence = verdict, confidence

        # v9.0: MATH CORRECTION (±20 tolerance)
        if abs(confidence - work_ref_score) > 20:
            pre_conf = confidence
            confidence = work_ref_score
            if confidence >= 70:
                verdict = 'PASS'
            else:
                verdict = 'CONCERN'
            guards_list.append(
                f"MATH CORRECTION: LLM gave {pre_conf}% but verified math is {work_ref_math}. "
                f"Confidence: {pre_conf} → {confidence}"
            )

        # Out-of-scope guard (force FAIL regardless of LLM)
        if oos_flagged and confidence > 35:
            pre_conf = confidence
            verdict = 'FAIL'
            confidence = min(confidence, 35)
            reasoning += f" [OUT OF SCOPE: Entry mentions '{oos_term}' which is excluded]"
            guards_list.append(
                f"OUT OF SCOPE: Entry mentions '{oos_term}' (forbidden). "
                f"Forced FAIL. Confidence: {pre_conf} → {confidence}"
            )

        # Tech deviation guard (only if ZERO overlap with expected tech)
        if expected_tech and tech_mentioned and not any(t in expected_tech for t in tech_mentioned):
            if confidence > 50:
                pre_conf = confidence
                confidence = min(confidence, 50)
                reasoning += f" [TECH DEVIATION: Using {', '.join(tech_mentioned)} not in expected stack]"
                guards_list.append(
                    f"TECH DEVIATION: Using {', '.join(tech_mentioned)} "
                    f"not in expected {', '.join(expected_tech)}. "
                    f"Confidence: {pre_conf} → {confidence}"
                )

        # Final bookend — only if guards changed something
        if verdict != llm_raw_verdict or confidence != llm_raw_confidence:
            guards_list.insert(0, f"LLM raw: {llm_raw_verdict} at {llm_raw_confidence}%")
            guards_list.append(f"Final: {verdict} at {confidence}%")

        state['node_verdicts']['content'] = {
            'verdict': verdict, 'confidence': confidence, 'reasoning': reasoning,
        }
        state['reasoning_logs']['content_analysis'] = {
            'summary': f"Work Validator: {verdict} ({confidence}%). Project '{project_name}'.",
            'score': confidence, 'verdict': verdict, 'path': 'ai',
            'path_reason': (
                f"LLM validated work for project '{project_name}' — "
                f"checked project match, real work, incremental progress."
            ),
            'details': reasoning,
            'llm_raw_response': response,
            'evidence': f"Project: {project_name}\nHours: {hours}h\nStatus: {learning_status}\nCopy-paste: {'FLAGGED (' + str(round(copy_paste_sim * 100, 1)) + '%)' if copy_paste_flagged else 'Clear'}",
            'llm_reasoning': llm_reasoning_only,
            'rag_analysis': None,
            'guards': guards_list,
            'remaining': None,
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
            'evidence': f"Word count: {word_count}\nTech markers: {tech_matches}\nError: {str(e)[:80]}",
            'llm_reasoning': None,
            'rag_analysis': None,
            'guards': [],
            'remaining': None,
        }

    return {k: state[k] for k in ['node_verdicts', 'reasoning_logs', 'ai_failures', 'errors'] if k in state}
# ── B3: Scope Tracker (Project) ──

def project_scope_tracker(state: BrainState) -> BrainState:
    """
    v8.0 Scope Tracker for project entries.
    Real validation with baseline 70, ref_score, and MATH CORRECTION.
    """
    learning_status = state.get('learning_status', 'in_progress')
    is_completed = state['is_completed']
    total_invested = state['total_hours_invested']
    prior_count = state['prior_entries_count']
    project_name = state.get('project_name', '?')
    project_desc = state.get('project_description') or 'No description'
    hours = float(state['entry_data']['hours'])
    text = sanitize_input(state['entry_data']['learned_text'])

    prior_context = ""
    if state.get('prior_entries_compact'):
        prior_context = (
            f"\n--- PRIOR WORK HISTORY ({prior_count} {'entry' if prior_count == 1 else 'entries'}) ---\n"
            + state['prior_entries_compact']
        )
    else:
        prior_context = "\nFirst entry on this project — no prior work history."

    traj_summary = ""
    if state.get('progress_trajectory') and len(state['progress_trajectory']) > 1:
        traj_lines = []
        for t in state['progress_trajectory'][-6:]:
            traj_lines.append(
                f"  {t['date']}: +{t['hours']}h — {t['summary'][:60]}"
            )
        traj_summary = "Work timeline:\n" + "\n".join(traj_lines)

    # v8.0: Compute scope ref_score
    proj_scope_ref_score = 70
    proj_scope_ref_parts = ["Baseline 70"]
    project_module_coverage = state.get('project_module_coverage', 0)
    # guards_list initialized early so SBU-2/SBU-3 guards can populate it
    guards_list = []

    if not is_completed:
        # v9.0: Reward active progress, penalize stagnation
        modules_current = state.get('project_modules_current', [])
        if len(modules_current) > 0:
            proj_scope_ref_score += 7
            proj_scope_ref_parts.append(f"Active progress on {len(modules_current)} module(s)(+7)")
        else:
            proj_scope_ref_score -= 5
            proj_scope_ref_parts.append("No module progress detected(-5)")
    else:
        if project_module_coverage >= 0.60:
            proj_scope_ref_score += 10
            proj_scope_ref_parts.append(f"Coverage {project_module_coverage:.0%}(+10)")
        elif project_module_coverage >= 0.30:
            proj_scope_ref_score += 5
            proj_scope_ref_parts.append(f"Coverage {project_module_coverage:.0%}(+5)")
        else:
            proj_scope_ref_score -= 10
            proj_scope_ref_parts.append(f"Low coverage {project_module_coverage:.0%}(-10)")
        if total_invested < 2.0:
            proj_scope_ref_score -= 15
            proj_scope_ref_parts.append(f"Very low hours {total_invested:.1f}h(-15)")
    if prior_count == 0:
        proj_scope_ref_score += 5
        proj_scope_ref_parts.append("First entry(+5)")

    # v9.0 Phase 4: Per-feature success criteria validation
    _entry_fstatus = state.get('feature_status', 'in_progress')
    _target_module = state.get('target_module', '').lower()
    _features = state.get('project_features', [])

    # ─── SBU-3: COMPLETION WITHOUT TARGET MODULE GUARD ───
    # Cannot approve a completion claim that doesn't specify what was completed.
    if _entry_fstatus == 'completed' and not _target_module.strip():
        proj_scope_ref_score = 25
        proj_scope_ref_parts = ["Baseline 25 (invalid: completion without target_module)"]
        guards_list.append(
            "INVALID COMPLETION: feature_status='completed' but target_module is empty. "
            "Cannot complete an unspecified feature."
        )
        logger.warning(
            f"Entry {state['entry_id']}: Completion claim without target_module. "
            f"Forced ref_score=25."
        )

    # ─── SBU-2: DUPLICATE COMPLETION DETECTION ───
    # Penalize if another APPROVED entry already marked this feature complete.
    if _entry_fstatus == 'completed' and _target_module.strip():
        try:
            recent_completions = Entry.objects.filter(
                project__name=state.get('project_name'),
                target_module__iexact=state.get('target_module', ''),
                feature_status='completed',
                status='approved',
                is_active=True,
            ).exclude(id=state['entry_id']).order_by('-ai_analyzed_at').select_related('user')

            if recent_completions.exists():
                latest = recent_completions.first()
                current_user_id = state['entry_data'].get('user_id')
                hours_since = 0
                if latest.ai_analyzed_at:
                    hours_since = (timezone.now() - latest.ai_analyzed_at).total_seconds() / 3600

                if latest.user_id != current_user_id and hours_since < 168:  # within 1 week
                    proj_scope_ref_score -= 25
                    proj_scope_ref_parts.append(
                        f"Already completed by {latest.user.email} {hours_since:.0f}h ago(-25)"
                    )
                    guards_list.append(
                        f"DUPLICATE COMPLETION: Feature already completed by "
                        f"{latest.user.email} on "
                        f"{latest.ai_analyzed_at.strftime('%Y-%m-%d %H:%M') if latest.ai_analyzed_at else '?'}"
                    )
                elif latest.user_id == current_user_id and hours_since < 24:  # same person within 24h
                    proj_scope_ref_score -= 15
                    proj_scope_ref_parts.append("Duplicate completion within 24h(-15)")
                    guards_list.append(
                        f"DUPLICATE COMPLETION: You completed this feature "
                        f"{hours_since:.1f}h ago. Possible duplicate submission."
                    )
        except Exception as _dup_e:
            logger.debug(f"Duplicate completion check failed: {_dup_e}")

    if _entry_fstatus == 'completed' and _target_module and _features:
        _target_feat = next((f for f in _features if f['name'].lower() == _target_module), None)
        if _target_feat and _target_feat.get('success_criteria'):
            _criteria = [c.strip().lower() for c in _target_feat['success_criteria'].split(',') if c.strip()]
            if _criteria:
                _matched = [c for c in _criteria if fuzzy_keyword_match(text.lower(), c, threshold=0.75)]
                _criteria_met = len(_matched) / len(_criteria)
                if _criteria_met >= 0.50:
                    proj_scope_ref_score += 10
                    proj_scope_ref_parts.append(f"Success criteria {_criteria_met:.0%} met(+10)")
                elif _criteria_met > 0:
                    proj_scope_ref_score += 5
                    proj_scope_ref_parts.append(f"Partial criteria {_criteria_met:.0%}(+5)")
                else:
                    proj_scope_ref_score -= 10
                    proj_scope_ref_parts.append(f"No success criteria met(-10)")

                # ─── SBU-5: HARD GUARD — <30% criteria met on completion ───
                # Caps ref_score at 50 to force PENDING for human review.
                if _criteria_met < 0.30 and proj_scope_ref_score > 50:
                    pre_score = proj_scope_ref_score
                    proj_scope_ref_score = min(proj_scope_ref_score, 50)
                    guards_list.append(
                        f"CRITERIA GUARD: Only {_criteria_met:.0%} criteria met "
                        f"({len(_matched)}/{len(_criteria)}). "
                        f"Min 30% required for completion. "
                        f"Score: {pre_score} → {proj_scope_ref_score}"
                    )

    proj_scope_ref_score = max(0, min(100, proj_scope_ref_score))
    proj_scope_ref_math = " + ".join(proj_scope_ref_parts) + f" = {proj_scope_ref_score}%"

    try:
        elapsed = time.monotonic() - state['pipeline_start']
        if elapsed > 55.0:
            raise Exception("Pipeline guard: elapsed > 55s")

        llm = OllamaLLM(model="qwen2.5:7b", temperature=0, timeout=15)

        prompt = f"""{PROJECT_BRIEFING}
You are Node 4 (Scope Tracker). Assess project completion and pace.
You must judge INDEPENDENTLY based only on project scope and progress data — not other nodes.

--- PROJECT CONTEXT ---
learning_status indicates the current state: 'in_progress' or 'completed'.
'in_progress' with many hours is NORMAL — it means "not finished yet", NOT "no work done".
ONLY validate completion claims when learning_status='completed'.

Project: "{project_name}"
Description: "{project_desc[:300]}"
Status: {learning_status}
Completed: {is_completed}
Total hours invested: {total_invested:.2f}h
Entry #{prior_count + 1} | This session: {hours}h
{f"User role: {state.get('user_project_role', 'general')} — assess if work is role-appropriate." if state.get('user_project_role') and state.get('user_project_role') != 'general' else ''}

{traj_summary}
{prior_context}
{state.get('rag_context_summary', '')}

Work description: "{text}"

IMPORTANT: Project work descriptions are limited to 50-500 characters.
A concise, bullet-point style is EXPECTED and NORMAL for daily project logs.
Judge by SUBSTANCE (what was done), not LENGTH (how many words).

COMPUTED REFERENCE (verified arithmetic): {proj_scope_ref_math}
Your confidence MUST equal {proj_scope_ref_score}% unless you have a specific reason to deviate.
DO NOT recalculate — this math is already verified.

Think step-by-step:
1. Given the project description, is the reported work substantive and relevant?
2. Is {total_invested:.2f}h reasonable for this type of project?
3. {"The project is marked COMPLETE. Does the combined work across all entries justify completion? (Completion can happen efficiently — judge by work quality & scope coverage, not just hours.)" if is_completed else "At status 'in_progress', what major parts of the project likely remain?"}
4. Is the pace reasonable? (check progress timeline — steady or stagnant?)
5. Does this session's work meaningfully advance the project? Is the description detailed enough for {hours}h of work?

OUTPUT FORMAT (STRICT):
Step-by-step: [Walk through the COMPUTED REFERENCE factors. Cite which applied.]
Reasoning: <your assessment>
Verdict: <PASS or CONCERN or FAIL>
Confidence: <0-100>"""

        response = llm.invoke(prompt).strip()
        verdict, confidence, reasoning = extract_verdict(response)

        # Save pure LLM reasoning before any guard modifications
        llm_reasoning_only = reasoning
        guards_list = []
        llm_raw_verdict, llm_raw_confidence = verdict, confidence

        # v8.0: MATH CORRECTION (±20 tolerance) — replaces rubber stamp
        if abs(confidence - proj_scope_ref_score) > 20:
            pre_conf = confidence
            confidence = proj_scope_ref_score
            if confidence >= 70:
                verdict = 'PASS'
            else:
                verdict = 'CONCERN'
            guards_list.append(
                f"MATH CORRECTION: LLM gave {pre_conf}% but verified math is {proj_scope_ref_math}. "
                f"Confidence: {pre_conf} → {confidence}"
            )

        # Coherence penalty
        if not state['progress_coherent']:
            pre_conf = confidence
            confidence = max(20, confidence - 20)
            reasoning += " [Progress coherence issue detected]"
            guards_list.append(f"COHERENCE: Progress coherence issue detected. Confidence: {pre_conf} → {confidence}")
            if verdict == 'PASS':
                verdict = 'CONCERN'

        if verdict != llm_raw_verdict or confidence != llm_raw_confidence:
            guards_list.insert(0, f"LLM raw: {llm_raw_verdict} at {llm_raw_confidence}%")
            guards_list.append(f"Final: {verdict} at {confidence}%")

        state['node_verdicts']['progress'] = {
            'verdict': verdict, 'confidence': confidence, 'reasoning': reasoning,
        }
        state['reasoning_logs']['progress_analysis'] = {
            'summary': f"Scope Tracker: {verdict} ({confidence}%). Project '{project_name}' status: {learning_status}.",
            'score': confidence, 'verdict': verdict, 'path': 'ai',
            'path_reason': (
                f"LLM tracked project scope: status={learning_status} with {total_invested:.2f}h invested. "
                f"{'Completion evaluated.' if is_completed else 'Ongoing progress assessed.'}"
            ),
            'details': reasoning,
            'llm_raw_response': response,
            'evidence': f"Status: {learning_status}\nCompletion: {is_completed}\nTotal invested: {total_invested:.2f}h\nThis session: {hours}h\nCoherence: {'OK' if state['progress_coherent'] else 'ISSUE'}",
            'llm_reasoning': llm_reasoning_only,
            'rag_analysis': None,
            'guards': guards_list,
            'remaining': None,
        }

    except Exception as e:
        logger.warning(f"Project scope tracker failed: {e}")
        state['ai_failures'] += 1
        # v9.0: Fixed fallback — uses module coverage instead of removed progress_percent
        _fb_coverage = state.get('project_module_coverage', 0)
        if is_completed and total_invested >= 2 and _fb_coverage >= 0.60:
            verdict, confidence = 'PASS', 70
        elif is_completed and _fb_coverage >= 0.30:
            verdict, confidence = 'PASS', 60
        elif is_completed and total_invested < 1:
            verdict, confidence = 'FAIL', 25
        elif not is_completed:
            verdict, confidence = 'PASS', 55
        else:
            verdict, confidence = 'CONCERN', 40

        state['node_verdicts']['progress'] = {
            'verdict': verdict, 'confidence': confidence,
            'reasoning': f'Fallback: {learning_status} at {total_invested:.2f}h.',
        }
        state['reasoning_logs']['progress_analysis'] = {
            'summary': f"Scope Tracker (fallback): {verdict} ({confidence}%).",
            'score': confidence, 'verdict': verdict, 'path': 'breaker',
            'path_reason': f"LLM failed ({str(e)[:60]}). Basic fallback.",
            'details': f"Status: {learning_status}, invested: {total_invested:.2f}h.",
            'evidence': f"Status: {learning_status}\nInvested: {total_invested:.2f}h\nCompletion: {is_completed}",
            'llm_reasoning': None,
            'rag_analysis': None,
            'guards': [],
            'remaining': None,
        }

    return {k: state[k] for k in ['node_verdicts', 'reasoning_logs', 'ai_failures', 'errors'] if k in state}
# =============================================================================
# Shared Node 5: Verdict Agent (LLM — Final Connected Decision)
# =============================================================================

def verdict_agent(state: BrainState) -> BrainState:
    """
    v7.0 Verdict Agent. Synthesizes ALL prior node outputs into a final
    confidence score. Decision is DERIVED from confidence:
      80%+ → approve, 40-79% → pending, <40% → flag
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

    # ── Collect guards from each node for the Verdict Agent ──
    time_guards = state.get('reasoning_logs', {}).get('time_analysis', {}).get('guards', [])
    content_guards = state.get('reasoning_logs', {}).get('content_analysis', {}).get('guards', [])
    progress_guards = state.get('reasoning_logs', {}).get('progress_analysis', {}).get('guards', [])

    def _format_node_guards(guards_list_inner):
        if not guards_list_inner:
            return "Guards triggered: None."
        return "Guards triggered:\n" + "\n".join(f"    - {g}" for g in guards_list_inner)

    evidence = f"""--- CONTEXT (Node 0 — gathered data, no LLM) ---
{context_summary}

--- RAG KNOWLEDGE (Node 1 — topic knowledge + admin corrections, no LLM) ---
{state.get('rag_context_summary', 'No RAG context available.')}

--- TIME REASONER (Node 2) ---
Verdict: {time_verdict.get('verdict', 'N/A')} | Confidence: {time_verdict.get('confidence', 'N/A')}%
Reasoning: {time_verdict.get('reasoning', 'N/A')}
{_format_node_guards(time_guards)}

--- {content_label} (Node 3) ---
Verdict: {content_verdict.get('verdict', 'N/A')} | Confidence: {content_verdict.get('confidence', 'N/A')}%
Reasoning: {content_verdict.get('reasoning', 'N/A')}
{_format_node_guards(content_guards)}

--- {progress_label} (Node 4) ---
Verdict: {progress_verdict.get('verdict', 'N/A')} | Confidence: {progress_verdict.get('confidence', 'N/A')}%
Reasoning: {progress_verdict.get('reasoning', 'N/A')}
{_format_node_guards(progress_guards)}"""

    # ── Phase 2: Inject Git evidence if available (SBU only) ──
    git_evidence_data = state.get('git_evidence', {})
    if git_evidence_data and git_evidence_data.get('match_level') and git_evidence_data.get('match_level') != 'pending':
        git_section = f"""\n\n--- GIT COMMIT ANALYSIS (Node 6 — advisory signal only, DO NOT penalize based on this) ---
Result: {state.get('git_validation_result', 'skipped')}
Commits found: {git_evidence_data.get('commits_found', 0)} | User commits: {git_evidence_data.get('user_commits', 0)}
Lines added: {git_evidence_data.get('additions', 0)} | Lines deleted: {git_evidence_data.get('deletions', 0)}
File types: {', '.join(git_evidence_data.get('file_extensions', [])) or 'N/A'}
Match level: {git_evidence_data.get('match_level', 'N/A')}
Reasoning: {git_evidence_data.get('reasoning', 'N/A')}
NOTE: Git evidence is ADVISORY ONLY. Do NOT reduce confidence based on git results. It can only BOOST confidence slightly (+2 to +5 for match)."""
        evidence += git_section

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

        llm = OllamaLLM(model="qwen2.5:7b", temperature=0, timeout=15)

        # ── Pre-compute reference score (Python does the arithmetic) ──
        # v8.0: Fixed verdict adjustments: +7 PASS, -10 CONCERN, -15 FAIL
        ref_score = 70
        ref_parts = []
        for _name, _nv in [("Time", time_verdict), ("Content", content_verdict), ("Progress", progress_verdict)]:
            _v = _nv.get('verdict', '?')
            if _v == 'PASS':
                _adj = 7
            elif _v == 'CONCERN':
                _adj = -10
            elif _v == 'FAIL':
                _adj = -15
            else:
                _adj = 0
            ref_score += _adj
            ref_parts.append(f"{_name}({'+' if _adj >= 0 else ''}{_adj})")
        ref_score = max(0, min(100, ref_score))
        ref_math = f"Baseline 70 + {' + '.join(ref_parts)} = {ref_score}%"

        display_intent = 'SBU Tasks' if intent == 'sbu_tasks' else 'L&D Tasks'
        prompt = f"""{briefing}
You are Node 5 (Verdict Agent). You are the FINAL decision-maker.
Review ALL evidence from prior nodes and make a connected, justified decision.

--- ENTRY SUMMARY ---
{'Topic' if not is_project else 'Project'}: "{subject}"
Intent: {display_intent}
Hours: {hours}h | Status: {state['learning_status']} | Completed: {state['is_completed']}

{evidence}

--- WARNING FLAGS ---
{flag_text}

Your job: Synthesize ALL evidence into ONE CONFIDENCE SCORE (0-100).

YOUR CONFIDENCE SCORE DETERMINES THE FINAL STATUS:
- Confidence ≥70 → APPROVED (genuine entry)
- Confidence <70 → PENDING (queued for human review)

Your Decision label MUST match your confidence range.
If confidence is 72, Decision MUST be APPROVE, not PENDING.
If confidence is 65, Decision MUST be PENDING, not APPROVE.

SYNTHESIS RULES (MANDATORY — follow this math):
1. Start at 70% baseline
2. Each node PASS: +7
3. Each node CONCERN: -10
4. Each node FAIL: -15
5. Completion guard fired: -20 minimum
6. Copy-paste detected: force <40
7. Fallback nodes used: -10 to -15 per node

CRITICAL: Admin feedback warnings in the context were ALREADY factored into each node's verdict.
Do NOT double-penalize. If all 3 nodes gave PASS, your confidence MUST be ≥70 (APPROVE).
The nodes are the subject-matter experts. You are the SYNTHESIZER, not a second-guesser.

DECISION THRESHOLDS:
- Confidence 70-100%: APPROVE (genuine entry)
- Confidence 0-69%: PENDING (needs human review)

Your reasoning must:
- Be CONCISE (max 100 words)
- SHOW YOUR MATH: "Baseline 70 + Time(+X) + Content(+Y) + Progress(+Z) [- penalties] = N%"
- Reference ALL 3 nodes explicitly with their verdicts and confidences
- State any guard triggers
- Explain final number

DO NOT:
- Repeat evidence verbatim
- Write essays
- Contradict yourself
- Ignore guard triggers
- Reduce confidence below what the SYNTHESIS RULES produce

COMPUTED REFERENCE (verified arithmetic): {ref_math}
Your confidence MUST equal {ref_score}% unless you have a specific reason to deviate. DO NOT recalculate — this math is already verified.

Reasoning: <100 words max. MUST include: {ref_math}. Reference each node.>
Decision: <APPROVE or PENDING>
Confidence: <0-100>"""

        response = llm.invoke(prompt).strip()
        decision, confidence, reasoning = extract_final_verdict(response)

        llm_reasoning_only = reasoning
        guards_list = []
        llm_raw_decision, llm_raw_confidence = decision, confidence

        # ── v8.0 MATH CORRECTION guard (±20 tolerance) ──
        if abs(confidence - ref_score) > 20:
            pre_conf = confidence
            confidence = ref_score
            # v8.0: Binary decision
            if confidence >= 70:
                decision = 'approve'
            else:
                decision = 'pending'
            guards_list.append(f"MATH CORRECTION: LLM gave {pre_conf}% but verified math is {ref_math}. Confidence: {pre_conf} → {confidence}")

        # ── Fix 10: Post-LLM confidence floor ──
        # If all 3 nodes PASS with high confidence, the Verdict Agent must respect that.
        # This prevents the LLM from being overly cautious when all evidence is positive.
        node_verdicts_list = [time_verdict, content_verdict, progress_verdict]
        all_pass = all(v.get('verdict') == 'PASS' for v in node_verdicts_list)
        avg_node_conf = sum(v.get('confidence', 50) for v in node_verdicts_list) / 3

        if all_pass and avg_node_conf >= 80 and confidence < 80:
            old_confidence = confidence
            # Floor: at least avg_node_confidence - 7 (small margin for synthesis)
            confidence = max(confidence, round(avg_node_conf - 7))
            if confidence != old_confidence:
                reasoning += f"\n[CONFIDENCE FLOOR] All 3 nodes PASS (avg {avg_node_conf:.0f}%). LLM gave {old_confidence}%, raised to {confidence}%."
                guards_list.append(f"CONFIDENCE FLOOR: All 3 nodes PASS (avg {avg_node_conf:.0f}%). LLM gave {old_confidence}%. Confidence: {old_confidence} → {confidence}")
        elif all_pass and avg_node_conf >= 70 and confidence < 70:
            old_confidence = confidence
            confidence = max(confidence, round(avg_node_conf - 10))
            if confidence != old_confidence:
                reasoning += f"\n[CONFIDENCE FLOOR] All 3 nodes PASS (avg {avg_node_conf:.0f}%). LLM gave {old_confidence}%, raised to {confidence}%."
                guards_list.append(f"CONFIDENCE FLOOR: All 3 nodes PASS (avg {avg_node_conf:.0f}%). LLM gave {old_confidence}%. Confidence: {old_confidence} → {confidence}")

        # ── Fix 5: Completion penalties (coverage + hours) ──
        is_completed = state.get('is_completed', False)
        coverage_ratio = state.get('rag_coverage_ratio', 0)
        all_subtopics = state.get('rag_relevant_subtopics', [])
        estimated_total = state.get('estimated_total_hours', 0)
        total_invested = state.get('total_hours_invested', 0)

        # v7.6 Fix 5: Tiered completion penalties (stricter)
        completion_penalties = []

        # v7.7: For projects, use module coverage if key_modules defined
        project_modules = state.get('project_modules_completed', [])
        if is_completed and project_modules and not all_subtopics:
            coverage_ratio = state.get('project_module_coverage', 0)

        has_coverage_data = bool(all_subtopics) or bool(project_modules)
        if is_completed and has_coverage_data:
            # COVERAGE PENALTIES (3 tiers)
            if coverage_ratio < 0.30:
                pre_conf = confidence
                gap_penalty = min(40, int((0.30 - coverage_ratio) * 100))
                confidence = max(20, confidence - gap_penalty)
                completion_penalties.append(f"Coverage {coverage_ratio:.0%} < 30% minimum: -{gap_penalty}%. Confidence: {pre_conf} → {confidence}")
            elif coverage_ratio < 0.50:
                pre_conf = confidence
                gap_penalty = min(25, int((0.50 - coverage_ratio) * 80))
                confidence = max(20, confidence - gap_penalty)
                completion_penalties.append(f"Coverage {coverage_ratio:.0%} < 50% expected: -{gap_penalty}%. Confidence: {pre_conf} → {confidence}")
            elif coverage_ratio < 0.60:
                pre_conf = confidence
                gap_penalty = min(15, int((0.60 - coverage_ratio) * 50))
                confidence = max(20, confidence - gap_penalty)
                completion_penalties.append(f"Coverage {coverage_ratio:.0%} < 60% ideal: -{gap_penalty}%. Confidence: {pre_conf} → {confidence}")

        if is_completed and estimated_total > 0:
            hours_ratio = total_invested / estimated_total
            # HOURS PENALTIES (3 tiers)
            if hours_ratio < 0.30:
                pre_conf = confidence
                hours_penalty = min(35, int((0.30 - hours_ratio) * 100))
                confidence = max(20, confidence - hours_penalty)
                completion_penalties.append(f"Hours {hours_ratio:.0%} < 30% minimum: -{hours_penalty}%. Confidence: {pre_conf} → {confidence}")
            elif hours_ratio < 0.40:
                pre_conf = confidence
                hours_penalty = min(25, int((0.40 - hours_ratio) * 80))
                confidence = max(20, confidence - hours_penalty)
                completion_penalties.append(f"Hours {hours_ratio:.0%} < 40% expected: -{hours_penalty}%. Confidence: {pre_conf} → {confidence}")
            elif hours_ratio < 0.60:
                pre_conf = confidence
                hours_penalty = min(15, int((0.60 - hours_ratio) * 40))
                confidence = max(20, confidence - hours_penalty)
                completion_penalties.append(f"Hours {hours_ratio:.0%} < 60% typical: -{hours_penalty}%. Confidence: {pre_conf} → {confidence}")

        if completion_penalties:
            reasoning += f"\n[COMPLETION PENALTIES] " + "; ".join(completion_penalties)
            guards_list.append("COMPLETION PENALTIES: " + "; ".join(completion_penalties))

        # Auto-downgrade: very low coverage + approve = force pending
        if is_completed and all_subtopics and coverage_ratio < 0.40 and decision == 'approve':
            pre_conf = confidence
            decision = 'pending'
            confidence = min(confidence, 60)
            reasoning += " [Safety: downgraded — coverage too low for approve]"
            guards_list.append(f"Safety: downgraded — coverage too low for approve. Confidence: {pre_conf} → {confidence}")

        # ── Safety guardrails ──
        # LND-1: Consensus-aware fallback penalty.
        # Only downgrade if fallback nodes DISAGREED with each other.
        # If all fallbacks agreed on PASS, trust them (transient network issue).
        if state.get('ai_failures', 0) > 1 and decision == 'approve':
            _node_key_map = {
                'time_analysis': 'time',
                'content_analysis': 'content',
                'progress_analysis': 'progress',
            }
            fallback_verdicts = []
            for _log_key, _nv_key in _node_key_map.items():
                _node_log = state.get('reasoning_logs', {}).get(_log_key, {})
                if _node_log.get('path') == 'breaker':
                    _fb_v = state['node_verdicts'].get(_nv_key, {}).get('verdict', 'CONCERN')
                    fallback_verdicts.append(_fb_v)

            if len(fallback_verdicts) > 1:
                _all_pass = all(v == 'PASS' for v in fallback_verdicts)
                _all_same = len(set(fallback_verdicts)) == 1
                if _all_pass or _all_same:
                    # All fallbacks agreed — no penalty (transient issue)
                    logger.info(
                        f"Entry {state['entry_id']}: {len(fallback_verdicts)} fallbacks "
                        f"agreed on {fallback_verdicts[0]} — no penalty applied"
                    )
                else:
                    # Fallbacks disagreed — apply safety downgrade
                    pre_conf = confidence
                    decision = 'pending'
                    confidence = min(confidence, 75)
                    reasoning += f" [Safety: fallback disagreement {fallback_verdicts}]"
                    guards_list.append(
                        f"FALLBACK DISAGREEMENT: {fallback_verdicts}. "
                        f"Confidence: {pre_conf} → {confidence}"
                    )
            else:
                # Can't determine consensus (0 or 1 fallback node identified) — apply original penalty
                pre_conf = confidence
                decision = 'pending'
                confidence = min(confidence, 75)
                reasoning += " [Safety: downgraded — multiple node fallbacks]"
                guards_list.append(
                    f"Safety: downgraded — multiple node fallbacks. "
                    f"Confidence: {pre_conf} → {confidence}"
                )

        # Never approve if copy-paste detected
        if state.get('copy_paste_flagged') and decision == 'approve':
            pre_conf = confidence
            decision = 'pending'
            confidence = min(confidence, 69)
            reasoning += " [Safety: downgraded — copy-paste detected]"
            guards_list.append(f"Safety: downgraded — copy-paste detected. Confidence: {pre_conf} → {confidence}")

        if decision != llm_raw_decision or confidence != llm_raw_confidence:
            guards_list.insert(0, f"LLM raw: {llm_raw_decision.upper()} at {llm_raw_confidence}%")
            guards_list.append(f"Final: {decision.upper()} at {confidence}%")

        state['final_decision'] = decision
        state['final_confidence'] = round(confidence, 2)

        # ── Map node confidences to scorecard for frontend ──
        scores = {
            'time': time_verdict.get('confidence', 50),
            'quality': content_verdict.get('confidence', 50),
            'relevance': progress_verdict.get('confidence', 50),
        }

        verdict_evidence = (
            f"Node verdicts — Time: {time_verdict.get('verdict', '?')} ({time_verdict.get('confidence', '?')}%), "
            f"Content: {content_verdict.get('verdict', '?')} ({content_verdict.get('confidence', '?')}%), "
            f"Progress: {progress_verdict.get('verdict', '?')} ({progress_verdict.get('confidence', '?')}%)\n"
            f"Avg node confidence: {avg_node_conf:.0f}%\n"
            f"Completed: {is_completed}"
        )
        if completion_penalties:
            verdict_evidence += f"\nCompletion penalties applied: {'; '.join(completion_penalties)}"

        state['reasoning_logs']['final_decision'] = {
            'summary': f"{decision.upper()} at {confidence}% confidence.",
            'confidence': confidence,
            'decision': decision,
            'reason': reasoning,
            'verdict': decision.upper(),
            'scores': scores,
            'weights': None,  # No weights in v7.0 — LLM decides holistically
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
            'evidence': verdict_evidence,
            'llm_reasoning': llm_reasoning_only,
            'rag_analysis': None,
            'guards': guards_list,
            'remaining': None,
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
            'evidence': (
                f"Node verdicts — Time: {time_verdict.get('verdict', '?')} ({time_verdict.get('confidence', '?')}%), "
                f"Content: {content_verdict.get('verdict', '?')} ({content_verdict.get('confidence', '?')}%), "
                f"Progress: {progress_verdict.get('verdict', '?')} ({progress_verdict.get('confidence', '?')}%)\n"
                f"Avg confidence: {avg_conf:.0f}%\n"
                f"Error: {str(e)[:80]}"
            ),
            'llm_reasoning': None,
            'rag_analysis': None,
            'guards': ['Verdict Agent fallback — no auto-approve'],
            'remaining': None,
        }

    return state


# =============================================================================
# Phase 2: Git Commit Validator Node (Logic only — no LLM call)
# =============================================================================

def git_commit_validator(state: BrainState) -> BrainState:
    """
    Phase 2: Git commit validation for SBU entries.
    Runs in PARALLEL with time/content/progress nodes.
    
    Advisory signal ONLY — never reduces confidence, only boosts.
    Gracefully skips on any error (timeout, rate limit, private repo).
    """
    import time as _time

    # Safety: Check pipeline elapsed time
    elapsed = _time.monotonic() - state.get('pipeline_start', _time.monotonic())
    if elapsed > 50.0:
        logger.warning(f"Git node skipped: pipeline elapsed {elapsed:.1f}s > 50s")
        state['git_validation_result'] = 'skipped'
        state['git_score_adjustment'] = 0
        state['git_evidence'] = {'match_level': 'skipped', 'reasoning': 'Pipeline time guard (>50s)'}
        return state

    entry_data = state.get('entry_data', {})
    entry_id = state.get('entry_id', 0)

    # Only runs for SBU (project) entries
    if state.get('intent') != 'sbu_tasks':
        state['git_validation_result'] = 'skipped'
        state['git_score_adjustment'] = 0
        state['git_evidence'] = {'match_level': 'skipped', 'reasoning': 'Not a project entry'}
        return state

    try:
        from .models import Entry, Project
        from .github_client import validate_git_for_entry, extract_github_username

        entry_obj = Entry.objects.select_related('user', 'project').filter(id=entry_id).first()
        if not entry_obj:
            state['git_validation_result'] = 'skipped'
            state['git_score_adjustment'] = 0
            state['git_evidence'] = {'match_level': 'skipped', 'reasoning': 'Entry not found'}
            return state

        # Check if user marked this as non-coding work
        if getattr(entry_obj, 'is_non_coding', False):
            logger.info(f"Entry {entry_id}: Git skipped (non-coding work)")
            state['git_validation_result'] = 'skipped'
            state['git_score_adjustment'] = 0
            state['git_evidence'] = {'match_level': 'skipped', 'reasoning': 'User marked as non-coding work'}
            return state

        # Get repo URL from project
        project_obj = entry_obj.project
        if not project_obj:
            # Try finding project by name
            project_obj = Project.objects.filter(
                name=state.get('project_name'), is_active=True
            ).first()

        repo_url = getattr(project_obj, 'repo_url', '') if project_obj else ''
        if not repo_url:
            logger.info(f"Entry {entry_id}: Git skipped (no repo URL)")
            state['git_validation_result'] = 'skipped'
            state['git_score_adjustment'] = 0
            state['git_evidence'] = {'match_level': 'skipped', 'reasoning': 'No repository URL configured'}
            return state

        # Get GitHub username from user profile
        github_username = extract_github_username(
            getattr(entry_obj.user, 'github_url', '') or ''
        )

        # Run validation
        entry_date = str(entry_obj.date)
        claimed_hours = float(entry_data.get('hours', 0))

        result = validate_git_for_entry(
            repo_url=repo_url,
            entry_date=entry_date,
            github_username=github_username,
            user_email=entry_obj.user.email,
            claimed_hours=claimed_hours,
        )

        state['git_validation_result'] = result['result']
        state['git_score_adjustment'] = result['score_adjustment']
        state['git_evidence'] = result['evidence']

        logger.info(
            f"Entry {entry_id}: Git validation = {result['result']} "
            f"(adj: {result['score_adjustment']:+.1f}, "
            f"commits: {result['evidence'].get('commits_found', 0)})"
        )

    except Exception as e:
        logger.warning(f"Entry {entry_id}: Git validation error (skipping): {str(e)[:200]}")
        state['git_validation_result'] = 'skipped'
        state['git_score_adjustment'] = 0
        state['git_evidence'] = {'match_level': 'skipped', 'reasoning': f'Error: {str(e)[:100]}'}

    return state


# =============================================================================
# Graph Assembly — Two Separate Pipelines
# =============================================================================

def build_learning_brain():
    """Pipeline A: Learning (lnd_tasks) — 6 nodes (v7.0: context → RAG → [time|content|progress] → verdict)."""
    workflow = StateGraph(BrainState)

    workflow.add_node("context", context_gatherer)
    workflow.add_node("rag", rag_context_builder)
    workflow.add_node("time", learning_time_reasoner)
    workflow.add_node("content", learning_content_validator)
    workflow.add_node("progress", learning_progress_analyzer)
    workflow.add_node("verdict", verdict_agent)

    workflow.set_entry_point("context")
    workflow.add_edge("context", "rag")
    # v7.0: Parallel fan-out from RAG to time/content/progress
    workflow.add_edge("rag", "time")
    workflow.add_edge("rag", "content")
    workflow.add_edge("rag", "progress")
    # Fan-in to verdict
    workflow.add_edge("time", "verdict")
    workflow.add_edge("content", "verdict")
    workflow.add_edge("progress", "verdict")
    workflow.add_edge("verdict", END)

    return workflow.compile()


def build_project_brain():
    """Pipeline B: Project (sbu_tasks) — 6 nodes (v7.0: context → RAG → [time|content|progress] → verdict).
    Phase 2: Optionally adds git_commit_validator as 4th parallel node when ENABLE_GIT_VALIDATION=True."""
    workflow = StateGraph(BrainState)

    workflow.add_node("context", context_gatherer)
    workflow.add_node("rag", rag_context_builder)
    workflow.add_node("time", project_time_reasoner)
    workflow.add_node("content", project_work_validator)
    workflow.add_node("progress", project_scope_tracker)
    workflow.add_node("verdict", verdict_agent)

    workflow.set_entry_point("context")
    workflow.add_edge("context", "rag")
    # v7.0: Parallel fan-out from RAG to time/content/progress
    workflow.add_edge("rag", "time")
    workflow.add_edge("rag", "content")
    workflow.add_edge("rag", "progress")

    # Phase 2: Conditionally add Git validation as 4th parallel node
    if getattr(settings, 'ENABLE_GIT_VALIDATION', False):
        workflow.add_node("git", git_commit_validator)
        workflow.add_edge("rag", "git")
        workflow.add_edge("git", "verdict")
        logger.info("Git validation node ENABLED in project pipeline")

    # Fan-in to verdict
    workflow.add_edge("time", "verdict")
    workflow.add_edge("content", "verdict")
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
    """The main Celery task — routes to Learning or Project pipeline (v7.0)."""
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

        # ── Benchmark (v7.0: prefer TopicKnowledge enriched data) ──
        if entry.topic:
            topic_name = entry.topic.name
            topic_difficulty = getattr(entry.topic, 'difficulty', 3)
            # Try enriched TopicKnowledge first (has per-topic benchmark from roadmaps)
            from apps.topics.models import TopicKnowledge
            tk = TopicKnowledge.objects.filter(topic=entry.topic).first()
            if tk and tk.benchmark_hours and float(tk.benchmark_hours) > 0:
                benchmark = float(tk.benchmark_hours)
                logger.info(f"Entry {entry_id}: Using TopicKnowledge benchmark: {benchmark}h for '{topic_name}'")
            else:
                raw_benchmark = getattr(entry.topic, 'benchmark_hours', None)
                benchmark = float(raw_benchmark) if raw_benchmark and float(raw_benchmark) > 0 else 3.0
                logger.info(f"Entry {entry_id}: Using Topic/default benchmark: {benchmark}h for '{topic_name}'")
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
                'learning_status': 'completed' if entry.is_completed else 'in_progress',
            },
            'topic_name': topic_name,
            'topic_difficulty': topic_difficulty,
            'user_experience': float(getattr(entry.user, 'experience_years', 0) or 0),
            'benchmark_hours': benchmark,
            'intent': intent,
            'project_name': entry.project_name or None,
            'project_description': entry.project_description or None,
            # v7.7 Phase 2: Project structured fields
            'project_key_modules': [],
            'project_out_of_scope': [],
            'project_tech_stack': '',
            'project_success_criteria': '',
            'project_team': [],
            'user_project_role': 'general',
            'project_modules_completed': [],
            'project_modules_current': '',  # str: current module being worked on
            'project_modules_remaining': [],
            'project_module_coverage': 0.0,
            # Rich estimation context (v7.5)
            'topic_domain': getattr(entry.topic, 'domain', 'general') if entry.topic else 'general',
            'topic_language': getattr(entry.topic, 'language', None) if entry.topic else None,
            'user_tech_stack': entry.user.tech_stack or [],
            'user_primary_domain': getattr(entry.user, 'primary_domain', 'general'),
            'experience_tier': '',
            'estimation_breakdown': {},
            # Context (populated by Node 0)
            'prior_entries_count': 0,
            'prior_entries_summaries': [],
            'prior_entries_full': [],  # v7.6
            'prior_entries_compact': '',  # v8.0: Token-efficient 3-line summary
            'prior_full_texts': [],  # v7.0
            'copy_paste_max_similarity': 0.0,
            'copy_paste_flagged': False,
            'progress_coherent': True,
            'is_completed': entry.is_completed,
            'learning_status': 'completed' if entry.is_completed else 'in_progress',
            'total_hours_invested': 0.0,
            'progress_trajectory': [],
            'estimated_total_hours': float(benchmark),
            'context_summary': '',
            'blocker_summary': '',
            # RAG fields (v7.0 — populated by Node 1)
            'rag_topic_knowledge': None,
            'rag_relevant_subtopics': [],
            'rag_validation_keywords': [],
            'rag_what_it_is': '',
            'rag_what_you_will_learn': [],
            'rag_concepts_covered_prior': [],
            'rag_concepts_covered_current': [],
            'rag_concepts_new': [],
            'rag_concepts_remaining': [],
            'rag_coverage_ratio': 0.0,
            'rag_topic_mismatch': None,
            'rag_admin_corrections': [],
            'rag_context_summary': '',
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

        # ── v7.0: Decision derived from confidence score ──
        entry.ai_status = 'analyzed'
        entry.ai_decision = final_state['final_decision']
        entry.ai_confidence = Decimal(str(final_state['final_confidence']))
        entry.ai_chain_of_thought = final_state['reasoning_logs']
        entry.ai_analyzed_at = timezone.now()

        # v8.0: Binary decision — ≥70 approve, <70 pending
        confidence = float(final_state['final_confidence'])
        if confidence >= 70:
            entry.status = 'approved'
        else:
            entry.status = 'pending'  # human review

        entry.save(update_fields=[
            'ai_status', 'ai_decision', 'ai_confidence',
            'ai_chain_of_thought', 'ai_analyzed_at', 'status',
        ])

        # ── Phase 2: Save git validation results (SBU entries only) ──
        if is_project and final_state.get('git_validation_result'):
            try:
                entry.git_validation_result = final_state.get('git_validation_result', 'pending')
                entry.git_score_adjustment = Decimal(str(final_state.get('git_score_adjustment', 0)))
                entry.git_evidence = final_state.get('git_evidence', {})
                entry.save(update_fields=['git_validation_result', 'git_score_adjustment', 'git_evidence'])
            except Exception as git_save_err:
                logger.warning(f"Entry {entry_id}: Git results save failed: {git_save_err}")

        # ─── SBU-1: AUTO-UPDATE FEATURE STATUS ON APPROVAL ───
        # Automatically transitions ProjectFeature state based on approved entry.
        if entry.status == 'approved' and entry.intent == 'sbu_tasks' and entry.target_module:
            try:
                from .models import ProjectFeature
                feature = ProjectFeature.objects.filter(
                    project=entry.project,
                    name=entry.target_module
                ).first()

                if feature:
                    # TRANSITION 1: not_started → in_progress (first touch)
                    if feature.status == 'not_started' and entry.feature_status in ('in_progress', 'completed'):
                        feature.status = 'in_progress'
                        feature.started_at = timezone.now()
                        feature.started_by = entry.user
                        feature.save(update_fields=['status', 'started_at', 'started_by'])
                        logger.info(
                            f"▶️  Feature '{feature.name}' STARTED by {entry.user.email} "
                            f"(project '{entry.project.name}', entry #{entry.id})"
                        )

                    # TRANSITION 2: in_progress → completed
                    if entry.feature_status == 'completed' and feature.status != 'completed':
                        feature.status = 'completed'
                        feature.completed_at = timezone.now()
                        feature.completed_by = entry.user
                        feature.save(update_fields=['status', 'completed_at', 'completed_by'])
                        logger.info(
                            f"✅  Feature '{feature.name}' COMPLETED by {entry.user.email} "
                            f"(project '{entry.project.name}', entry #{entry.id})"
                        )

                    # TRANSITION 3: completed → in_progress (reopen for bug fix / maintenance)
                    elif entry.feature_status == 'in_progress' and feature.status == 'completed':
                        feature.status = 'in_progress'
                        feature.reopened_at = timezone.now()
                        feature.reopened_by = entry.user
                        feature.save(update_fields=['status', 'reopened_at', 'reopened_by'])
                        logger.info(
                            f"🔄  Feature '{feature.name}' REOPENED by {entry.user.email} "
                            f"(project '{entry.project.name}', entry #{entry.id})"
                        )
                else:
                    logger.warning(
                        f"⚠️  Feature '{entry.target_module}' not found in project "
                        f"'{entry.project.name}' for entry #{entry.id}"
                    )
            except Exception as _feat_e:
                # Non-fatal: entry is saved. Log and continue.
                logger.error(f"❌  Feature status update failed for entry #{entry.id}: {str(_feat_e)[:200]}")

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
