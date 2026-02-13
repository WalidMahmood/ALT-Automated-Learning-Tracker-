# AI Brain Documentation — v3.1

## Overview

The AI Brain is a **6-node sequential pipeline** built with LangGraph that analyzes every learning entry for legitimacy. It runs as a Celery background task triggered by Django signals on entry create/edit.

**File:** `apps/entries/tasks.py`

---

## Architecture Diagram

```
Entry Created/Edited
        │
        ▼
┌─────────────────────┐
│  Node 0: Intent     │  AI (Few-Shot + CoT)
│  Classifier          │  ← starts llm_latency timer
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Node 1: Time Check │  Pure logic (no AI)
│  (Context-Aware)     │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Node 2: Quality    │  Risk-based: logic OR AI
│  Analysis            │  ← circuit breaker gate
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Node 3: Relevance  │  Always AI + Global Wisdom
│  Check               │  ← ai_failures on exception
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Node 4: Blocker    │  Category-aware + conditional AI
│  Analysis            │  ← circuit breaker gate
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Node 5: Decision   │  Weighted scores + Smart Penalty
│  (Weighted)          │  → APPROVE / FLAG / PENDING
└─────────────────────┘
```

---

## BrainState (Internal State Object)

| Field | Type | Set By | Description |
|---|---|---|---|
| `entry_id` | int | Celery task | Database PK |
| `entry_data` | Dict | Celery task | `hours`, `learned_text`, `blockers_text` |
| `topic_name` | str | Celery task | e.g. "React Hooks" |
| `topic_difficulty` | int (1-5) | Celery task | From Topic model |
| `user_experience` | float | Celery task | Years of experience |
| `benchmark_hours` | float | Celery task | Topic's expected hours (default 3.0) |
| `learner_avg_hours` | float | Celery task | User's avg hours for this topic |
| `learner_entry_count` | int | Celery task | Prior entries for this topic |
| `intent` | str | Node 0 | `deep_learning` / `review` / `project_work` / `debugging` |
| `time_score` | float (0-1) | Node 1 | How reasonable the hours are |
| `quality_score` | float (0-1) | Node 2 | Description substance score |
| `relevance_score` | float (0-1) | Node 3 | Topic match score |
| `blocker_impact` | float (0-0.2) | Node 4 | Boost applied to time_score |
| **`llm_latency`** | **float** | **Node 0** | **Seconds Node 0's LLM call took (0.0 on failure)** |
| **`ai_failures`** | **int** | **Nodes 0-4** | **Count of nodes that skipped/failed AI** |
| `final_confidence` | float (0-100) | Node 5 | Percentage after penalty |
| `final_decision` | str | Node 5 | `approve` / `flag` / `pending` |
| `reasoning_logs` | Dict | All nodes | Transparent chain-of-thought |
| `errors` | List[str] | Any node | Error messages |

---

## Safety Systems (v3.1)

### Circuit Breaker

**Problem:** If Ollama is slow (cold start, GPU thermal throttle, concurrent requests), stacking 3-4 more LLM calls will hit the 25s Celery soft limit → entry gets flagged with zero analysis.

**Solution:** Node 0 times its LLM call using `time.monotonic()`. If it took **>6 seconds**:

| Node | Normal behavior | Circuit breaker behavior |
|---|---|---|
| Node 0 | AI classify | Always runs (it IS the timer) |
| Node 1 | Pure logic | No change (never uses AI) |
| Node 2 | AI when risk ≥ 2 | **Forced logic-only** for all risk levels |
| Node 3 | Always AI | Always runs (relevance too important to skip) |
| Node 4 | AI for Other/uncat | **Forced logic-only** (category partial credit) |
| Node 5 | Weighted decision | Applies smart penalty |

**Threshold:** 6 seconds (LLM timeout is 8s, so 6s means "just barely made it").

### Smart Penalty

**Problem:** When AI nodes are skipped or fail, the logic-only fallbacks are generous (e.g., quality defaults to 0.5-0.7). This could auto-approve entries that deserved deeper scrutiny.

**Solution:** Each AI failure/skip increments `ai_failures`. Node 5 discounts final confidence:

```
penalty_factor = max(0.50, 1.0 - (ai_failures × 0.10))
final_confidence = raw_confidence × penalty_factor
```

| AI failures | Penalty | Effect |
|---|---|---|
| 0 | 0% | Normal scoring |
| 1 | -10% | Slight discount |
| 2 | -20% | Moderate discount |
| 3 | -30% | Heavy discount, likely → FLAG or PENDING |
| 4 | -40% | Almost certainly → PENDING |
| 5+ | -50% (cap) | Definitely → PENDING for human review |

**Result:** An entry that would have been 85% (APPROVE) with 2 AI failures becomes 85% × 0.80 = 68% → **PENDING** for human review. The system fails safe.

---

## Node Details

### Node 0: Intent Classifier

- **Purpose:** Determines what kind of learning activity the entry represents
- **Method:** Few-Shot (4 examples) + Chain-of-Thought prompting
- **Categories:** `deep_learning`, `review`, `project_work`, `debugging`
- **Circuit breaker:** Starts `time.monotonic()` timer, stores `llm_latency` in state
- **Extraction:** Regex for `Classification: xxx` → keyword scan → default `deep_learning`
- **Fallback:** Default to `deep_learning`, increment `ai_failures`
- **Why it matters:** Intent shifts weight distribution in Node 5 (e.g., debugging tolerates more time, review expects higher quality)

### Node 1: Context-Aware Time Check

- **Purpose:** Checks if logged hours are reasonable
- **Method:** Pure math, no AI
- **4 multipliers:**
  - Difficulty: 1→0.70x, 3→1.0x, 5→1.30x
  - Experience: ≤1yr→1.5x, ≥3yr→0.8x, else→1.2x
  - Intent: deep_learning→1.0x, review→0.5x, project→1.5x, debug→2.0x
  - Velocity: personal history (0, 1-2, 3+ entries = skip / blend / full)
- **Scoring:**
  - ≤120% expected → 1.0 (perfect)
  - 120-200% → linear degradation
  - >200% → 0.1 (suspicious)
- **First-entry leniency:** Floor at 0.6 when `entry_count == 0`
- **Guard:** benchmark ≤ 0 or None → defaults to 3.0h

### Node 2: Description Analysis (Quality)

- **Purpose:** Validates description substance, not just length
- **Method:** Risk-signal approach
- **4 risk signals:**
  1. Low chars-per-hour ratio (intent-adjusted thresholds)
  2. Low word variety (<40% unique words)
  3. Missing technical keywords (0 of 30+ markers found)
  4. Hours vs chars extreme mismatch (e.g., 9h + 60 chars)
- **Routing:**
  - Risk 0-1: **Fast path** (logic-only blend of density/variety/tech)
  - Risk 2: **Medium path** (AI substance check OR circuit-breaker logic fallback)
  - Risk 3-4: **High risk** (AI deep legitimacy check OR circuit-breaker logic fallback)
- **Circuit breaker:** If `llm_latency > 6.0`, forces fast path for medium & high risk, increments `ai_failures`

### Node 3: Topic Relevance

- **Purpose:** Verifies learned_text relates to the assigned topic
- **Method:** Always AI (relevance is too subjective for pure logic)
- **Global Wisdom:** OR-matches topic words against admin corrections
- **Prompting:** Few-shot (3 examples: relevant, partial, unrelated)
- **Fallback:** 3-tier keyword matching (full name → individual words → default 0.5)
- **On failure:** Increments `ai_failures`, uses keyword fallback

### Node 4: Smart Blocker Analysis

- **Purpose:** Validates blockers for legitimacy
- **Frontend format:** `"Category: comment"` (categories: Technical, Environmental, Personal, Resource, Other)
- **Logic:**
  - No blocker → boost 0.0
  - Known category + comment → 0.15-0.20 (no AI needed)
  - Known category only → 0.10
  - 'Other' or uncategorized → AI validation (or circuit-breaker fallback)
- **Circuit breaker:** If `llm_latency > 6.0`, skips AI, gives conservative partial credit (0.05-0.10), increments `ai_failures`

### Node 5: Weighted Decision

- **Purpose:** Combines all scores into final confidence and decision
- **Intent-based weight matrix:**

| Intent | Time | Quality | Relevance |
|---|---|---|---|
| deep_learning | 40% | 40% | 20% |
| review | 20% | 50% | 30% |
| project_work | 50% | 30% | 20% |
| debugging | 30% | 30% | 40% |

- **Blocker boost:** `time_score = min(1.0, time_score + blocker_impact)`
- **Smart penalty:** See Safety Systems section above
- **Decision thresholds:**
  - ≥85% → **APPROVE** (auto-approved)
  - 70-84% → **FLAG** (flagged for review)
  - <70% → **PENDING** (human review required)
- **Reasoning log:** Full transparency including penalty disclosure

---

## Celery Task Configuration

| Setting | Value | Purpose |
|---|---|---|
| `soft_time_limit` | 25s | Raises `SoftTimeLimitExceeded` |
| `time_limit` | 30s | Hard kill |
| `max_retries` | 3 | Auto-retry on generic exceptions |
| `retry_countdown` | 10s | Delay between retries |
| LLM timeout | 8s/call | Per-node Ollama timeout |
| Circuit breaker | 6s | Threshold for skipping optional AI |

### Exception Handling

| Exception | Handler |
|---|---|
| `Entry.DoesNotExist` | Log + return (no retry) |
| `SoftTimeLimitExceeded` | Save as flagged, confidence 0% |
| `MaxRetriesExceededError` | Save as error, status pending |
| Generic `Exception` | Retry up to 3 times |

---

## Edge Cases & Fallbacks Matrix

| Scenario | What happens | Score effect |
|---|---|---|
| Ollama down (all nodes) | All AI fails, 4 ai_failures | Penalty -40%, → PENDING |
| Ollama slow (>6s on Node 0) | Nodes 2 & 4 skip AI, ~2-3 ai_failures | Penalty -20-30%, → FLAG/PENDING |
| Zero prior entries | No velocity, first-entry leniency 0.6 floor | Lenient time scoring |
| 1-2 prior entries | Sparse velocity blending (50% toward 1.0) | Moderate velocity influence |
| benchmark_hours = 0/None | Defaults to 3.0h with warning | Safe fallback |
| Blocker: known category | Parsed directly, no AI call needed | Boost 0.10-0.20 |
| Blocker: 'Other' + Ollama slow | Circuit breaker, partial credit | Boost 0.05-0.10 |
| All nodes succeed, good entry | 0 ai_failures, no penalty | Full confidence → APPROVE |
| Admin override during analysis | Race condition guard, skips save | No change |

---

## Decision Flow Summary

```
Normal Ollama (fast):
  Node 0 AI ✓ → Node 1 logic → Node 2 AI (if needed) → Node 3 AI → Node 4 AI (if needed) → Node 5
  ai_failures = 0 → raw confidence = final confidence
  85%+ → APPROVE | 70-84% → FLAG | <70% → PENDING

Slow Ollama (>6s):
  Node 0 AI ✓ (slow) → Node 1 logic → Node 2 LOGIC (forced) → Node 3 AI → Node 4 LOGIC (forced)
  ai_failures = 2+ → confidence discounted 20%+
  Entry that was 85% raw → 68% after penalty → PENDING ✓

Ollama completely down:
  Node 0 FAIL → Node 1 logic → Node 2 FAIL → Node 3 FAIL → Node 4 FAIL → Node 5
  ai_failures = 4 → confidence discounted 40%
  Any entry → very likely PENDING for human review ✓
```

---

## File Dependencies

- `apps/entries/models.py` — `Entry` (AI fields), `GlobalWisdom`
- `apps/entries/signals.py` — Trigger on create/edit (tracks `AI_SENSITIVE_FIELDS`)
- `apps/users/models.py` — `User` (experience_years)
- `apps/topics/models.py` — `Topic` (difficulty, benchmark_hours)
- Frontend: `entry-form-modal.tsx` — `BLOCKER_OPTIONS`, sends `"Category: comment"` format

---

## Version History

| Version | Changes |
|---|---|
| v1.0 | Basic 4-node brain |
| v2.0 | Enhanced to 6 nodes, added Global Wisdom |
| v3.0 | Few-shot + CoT prompting, risk-based quality, category-aware blockers, safe_extract_score, 4 exception types |
| **v3.1** | **Circuit breaker (llm_latency timer, forced fast path), Smart penalty (ai_failures × 10% discount), fail-safe to PENDING** |
