"""
Topic Knowledge Generator for RAG Knowledge Base
=================================================
Reads enriched-roadmaps.ts, extracts all topics per roadmap,
calls Ollama (Llama 3.1) to generate 4-section knowledge for each topic,
saves per-roadmap JSON files with checkpointing.

Output: topic_knowledge/<roadmap_id>.json
"""

import json
import os
import re
import sys
import time
import hashlib
import requests
from pathlib import Path
from datetime import datetime, timezone

# ─── Configuration ───────────────────────────────────────────────
ENRICHED_FILE = Path("frontend/src/data/roadmap-templates/enriched-roadmaps.ts")
OUTPUT_DIR = Path("topic_knowledge")
CHECKPOINT_FILE = OUTPUT_DIR / "_checkpoint.json"
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "llama3.1"
TIMEOUT = 120  # seconds per LLM call
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds

# ─── Step 1: Parse enriched-roadmaps.ts ──────────────────────────

def parse_enriched_roadmaps(filepath: Path) -> list:
    """
    Extract the JSON array from the TypeScript file.
    The file is: export const enrichedRoadmaps: RoadmapTemplate[] = [ ...JSON... ]
    """
    print(f"[*] Reading {filepath}...")
    content = filepath.read_text(encoding="utf-8")
    
    # Find the start of the actual JSON array (after "= [")
    match = re.search(r'=\s*\[', content)
    if not match:
        raise ValueError("Could not find '= [' in the TS file")
    start = match.start() + match.group().index('[')
    
    # Find the matching closing bracket (last ] before potential ;)
    end = content.rindex("]") + 1
    json_str = content[start:end]
    
    # Remove trailing commas before } or ] (TS allows them, JSON doesn't)
    json_str = re.sub(r',\s*([}\]])', r'\1', json_str)
    
    roadmaps = json.loads(json_str)
    print(f"[+] Parsed {len(roadmaps)} roadmaps")
    return roadmaps


# ─── Step 2: Checkpoint Management ──────────────────────────────

def load_checkpoint() -> dict:
    """Load checkpoint of completed topics."""
    if CHECKPOINT_FILE.exists():
        return json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
    return {"completed": {}}  # {"completed": {"frontend-developer::React::pick-a-framework": true}}


def save_checkpoint(checkpoint: dict):
    """Save checkpoint."""
    CHECKPOINT_FILE.write_text(json.dumps(checkpoint, indent=2), encoding="utf-8")


def make_topic_key(roadmap_id: str, section_id: str, topic_name: str) -> str:
    """Create a unique key for checkpointing."""
    return f"{roadmap_id}::{section_id}::{topic_name}"


# ─── Step 3: LLM Knowledge Generation ───────────────────────────

def build_prompt(roadmap_name: str, roadmap_id: str, section_name: str, 
                 topic_name: str, benchmark_hours: float, difficulty: int,
                 sibling_topics: list, all_section_names: list) -> str:
    """Build the prompt for Llama 3.1 to generate topic knowledge."""
    
    siblings_str = ", ".join([f"{t['name']} ({t['benchmarkHours']}h)" for t in sibling_topics if t['name'] != topic_name])
    sections_str = ", ".join(all_section_names)
    
    # Scale expected bullets by benchmark hours
    min_bullets = max(5, int(benchmark_hours * 0.8))
    max_bullets = max(8, int(benchmark_hours * 1.5))
    if max_bullets > 25:
        max_bullets = 25
    if min_bullets > max_bullets:
        min_bullets = max_bullets - 2
    
    # Scale keywords
    min_keywords = max(10, int(benchmark_hours * 0.8))
    max_keywords = max(18, int(benchmark_hours * 1.5))
    if max_keywords > 35:
        max_keywords = 35
    
    prompt = f"""You are a senior technical education specialist creating a detailed learning knowledge base. This is for Brain Station 23, a top IT firm in Bangladesh. The knowledge will be used for RAG-based validation of daily learning entries.

CONTEXT:
- Role Roadmap: {roadmap_name} (id: {roadmap_id})
- Section: {section_name}
- Topic: {topic_name}
- Benchmark Hours: {benchmark_hours}h
- Difficulty: {difficulty}/5
- Other topics in this section: {siblings_str if siblings_str else "None (standalone topic)"}
- All sections in this roadmap: {sections_str}

HERE IS A GOLD STANDARD EXAMPLE of the quality and depth expected. This is for "React" (25h, difficulty 2) in the Frontend Developer roadmap, section "Pick a Framework":

{{
  "what_it_is": "React is the world's most-used JavaScript UI library, created and maintained by Meta (Facebook). It is component-based, uses a virtual DOM for efficient rendering, and has a rich ecosystem of tools and libraries. It is the industry standard for most frontend developer roles and powers major applications like Facebook, Instagram, Netflix, and Airbnb.",
  "what_you_will_learn": [
    "JSX — JavaScript XML: writing HTML-like syntax in JS, compiled by Babel/SWC",
    "Functional components — the modern standard for building React UIs, replacing class components",
    "Props — passing data down the component tree (read-only in child components)",
    "useState — local component state management, triggers re-render when updated",
    "useEffect — handling side effects: data fetching, subscriptions, DOM manipulation after render",
    "useContext — consuming React Context without prop drilling through intermediate components",
    "useReducer — managing complex state logic with a reducer pattern similar to Redux",
    "useMemo — memoizing expensive computed values to avoid unnecessary recalculation on re-render",
    "useCallback — memoizing callback functions to prevent unnecessary child component re-renders",
    "useRef — accessing DOM nodes directly and persisting mutable values across renders without triggering re-render",
    "Custom hooks — extracting reusable stateful logic into standalone functions (useLocalStorage, useFetch, useDebounce)",
    "Context API — sharing global state across the component tree without external state management libraries",
    "React.memo — preventing unnecessary re-renders of functional components via shallow prop comparison",
    "Code splitting — using React.lazy() and Suspense for dynamic imports and better bundle loading performance",
    "Error Boundaries — catching and handling JavaScript errors in the component tree gracefully (class component requirement)",
    "Reconciliation and virtual DOM diffing — understanding how React decides what to update in the real DOM using its fiber architecture"
  ],
  "subtopics": ["jsx", "functional components", "class components", "props", "state", "usestate", "useeffect", "usecontext", "usereducer", "usememo", "usecallback", "useref", "custom hooks", "context api", "react.memo", "suspense", "error boundaries", "virtual dom", "reconciliation", "fiber architecture", "react router", "code splitting"],
  "validation_keywords": ["react", "jsx", "component", "props", "state", "usestate", "useeffect", "usecontext", "usereducer", "usememo", "usecallback", "useref", "hook", "hooks", "context", "suspense", "virtual dom", "reconciliation", "memo", "fiber", "render", "re-render", "lifecycle", "functional component", "class component", "react.lazy", "error boundary", "dom diffing", "component tree"]
}}

NOTICE THE QUALITY:
- what_it_is: Mentions creator (Meta), purpose, why it matters for the role, real-world usage
- what_you_will_learn: Each item has a SPECIFIC concept name followed by "—" then a detailed technical explanation. NOT vague statements like "Understanding components". Instead: "Functional components — the modern standard for building React UIs, replacing class components"
- subtopics: Granular, specific sub-areas. Not generic. Includes specific API names, patterns, architectural concepts.
- validation_keywords: Comprehensive. Includes the topic name, all key APIs, patterns, abbreviations. A learner who genuinely studied React MUST mention some of these words.

NOW GENERATE for the topic "{topic_name}" in the "{roadmap_name}" roadmap.

CRITICAL RULES:
1. Content MUST be specific to the "{roadmap_name}" role context. "Python" for Data Scientist ≠ "Python" for Backend Developer ≠ "Python" for DevOps.
2. what_you_will_learn MUST have {min_bullets}-{max_bullets} items (scale with benchmark hours: ~1 item per 1-2h).
3. Each what_you_will_learn item MUST follow "ConceptName — detailed technical explanation" format.
4. subtopics: 8-22 granular items, all lowercase. Include specific tools, APIs, patterns, NOT generic categories.
5. validation_keywords: {min_keywords}-{max_keywords} items, all lowercase. Include topic name, abbreviations, specific tools/libraries/concepts.
6. Be technically accurate as of 2025. Include current tools and practices.
7. Output ONLY the raw JSON object. No markdown, no code fences, no explanation before or after.
8. For difficulty 4-5 topics, include advanced/cutting-edge concepts.
9. NEVER be vague. Every bullet point must teach something specific a learner would actually write about in their daily log."""

    return prompt


def call_ollama(prompt: str, retries: int = MAX_RETRIES) -> dict:
    """Call Ollama API and parse JSON response."""
    for attempt in range(1, retries + 1):
        try:
            response = requests.post(
                OLLAMA_URL,
                json={
                    "model": MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,  # Low temp for factual content
                        "num_predict": 4096,
                        "top_p": 0.9,
                    }
                },
                timeout=TIMEOUT
            )
            response.raise_for_status()
            
            raw_text = response.json()["response"].strip()
            
            # Try to extract JSON from the response
            # Sometimes LLM wraps in ```json ... ```
            json_match = re.search(r'\{[\s\S]*\}', raw_text)
            if not json_match:
                raise ValueError(f"No JSON object found in response: {raw_text[:200]}")
            
            json_str = json_match.group()
            knowledge = json.loads(json_str)
            
            # Validate required fields
            required = ["what_it_is", "what_you_will_learn", "subtopics", "validation_keywords"]
            for field in required:
                if field not in knowledge:
                    raise ValueError(f"Missing required field: {field}")
                    
            # Ensure lists are actually lists
            for field in ["what_you_will_learn", "subtopics", "validation_keywords"]:
                if not isinstance(knowledge[field], list):
                    raise ValueError(f"{field} is not a list")
                if len(knowledge[field]) < 3:
                    raise ValueError(f"{field} has too few items ({len(knowledge[field])})")
            
            # Normalize: lowercase subtopics and keywords
            knowledge["subtopics"] = [s.lower().strip() for s in knowledge["subtopics"]]
            knowledge["validation_keywords"] = [k.lower().strip() for k in knowledge["validation_keywords"]]
            
            return knowledge
            
        except requests.exceptions.Timeout:
            print(f"    [!] Timeout on attempt {attempt}/{retries}")
            if attempt < retries:
                time.sleep(RETRY_DELAY)
        except requests.exceptions.ConnectionError:
            print(f"    [!] Connection error on attempt {attempt}/{retries} - is Ollama running?")
            if attempt < retries:
                time.sleep(RETRY_DELAY * 2)
        except (json.JSONDecodeError, ValueError) as e:
            print(f"    [!] Parse error on attempt {attempt}/{retries}: {e}")
            if attempt < retries:
                time.sleep(RETRY_DELAY)
        except Exception as e:
            print(f"    [!] Unexpected error on attempt {attempt}/{retries}: {e}")
            if attempt < retries:
                time.sleep(RETRY_DELAY)
    
    return None  # All retries failed


def compute_version_hash(knowledge: dict) -> str:
    """Compute SHA256 hash of knowledge content for change detection."""
    content = json.dumps(knowledge, sort_keys=True)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


# ─── Step 4: Main Generator ─────────────────────────────────────

def generate_roadmap_knowledge(roadmap: dict, checkpoint: dict) -> dict:
    """Generate knowledge for all topics in a single roadmap."""
    roadmap_id = roadmap["id"]
    roadmap_name = roadmap["name"]
    
    # Collect all section names for context
    all_section_names = [s["name"] for s in roadmap["sections"]]
    
    # Load existing output file if present (for resume)
    output_file = OUTPUT_DIR / f"{roadmap_id}.json"
    if output_file.exists():
        existing = json.loads(output_file.read_text(encoding="utf-8"))
        existing_topics = {t["topic_name"] + "::" + t["section_id"]: t for t in existing.get("topics", [])}
    else:
        existing_topics = {}
    
    result = {
        "roadmap_id": roadmap_id,
        "roadmap_name": roadmap_name,
        "estimated_hours": roadmap.get("estimatedHours", 0),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator_model": MODEL,
        "version": 1,
        "topics": []
    }
    
    total_topics = sum(len(s["topics"]) for s in roadmap["sections"])
    completed = 0
    skipped = 0
    failed = 0
    
    print(f"\n{'='*60}")
    print(f"ROADMAP: {roadmap_name} ({roadmap_id})")
    print(f"Sections: {len(roadmap['sections'])} | Topics: {total_topics}")
    print(f"{'='*60}")
    
    for section in roadmap["sections"]:
        section_id = section["id"]
        section_name = section["name"]
        topics = section["topics"]
        
        print(f"\n  Section: {section_name} ({len(topics)} topics)")
        
        for topic in topics:
            topic_name = topic["name"]
            benchmark_hours = topic.get("benchmarkHours", 2)
            difficulty = topic.get("difficulty", 2)
            topic_key = make_topic_key(roadmap_id, section_id, topic_name)
            
            # Check if already completed
            if topic_key in checkpoint.get("completed", {}):
                # Load from existing file
                existing_key = topic_name + "::" + section_id
                if existing_key in existing_topics:
                    result["topics"].append(existing_topics[existing_key])
                completed += 1
                skipped += 1
                print(f"    [SKIP] {topic_name} (already generated)")
                continue
            
            print(f"    [GEN]  {topic_name} ({benchmark_hours}h, diff {difficulty})...", end=" ", flush=True)
            
            start_time = time.time()
            
            prompt = build_prompt(
                roadmap_name=roadmap_name,
                roadmap_id=roadmap_id,
                section_name=section_name,
                topic_name=topic_name,
                benchmark_hours=benchmark_hours,
                difficulty=difficulty,
                sibling_topics=topics,
                all_section_names=all_section_names,
            )
            
            knowledge = call_ollama(prompt)
            elapsed = time.time() - start_time
            
            if knowledge is None:
                print(f"FAILED ({elapsed:.1f}s)")
                failed += 1
                # Still add a placeholder so we know it failed
                result["topics"].append({
                    "section_id": section_id,
                    "section_name": section_name,
                    "topic_name": topic_name,
                    "benchmark_hours": benchmark_hours,
                    "difficulty": difficulty,
                    "knowledge": None,
                    "generation_status": "failed",
                    "version_hash": None,
                })
                continue
            
            version_hash = compute_version_hash(knowledge)
            
            topic_entry = {
                "section_id": section_id,
                "section_name": section_name,
                "topic_name": topic_name,
                "benchmark_hours": benchmark_hours,
                "difficulty": difficulty,
                "knowledge": knowledge,
                "generation_status": "success",
                "version_hash": version_hash,
            }
            
            result["topics"].append(topic_entry)
            
            # Mark as completed in checkpoint
            checkpoint.setdefault("completed", {})[topic_key] = True
            save_checkpoint(checkpoint)
            
            # Save intermediate result after each topic
            output_file.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
            
            completed += 1
            print(f"OK ({elapsed:.1f}s)")
    
    # Final save
    output_file.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    
    print(f"\n  Summary: {completed} completed, {skipped} skipped, {failed} failed")
    return result


def main():
    """Main entry point."""
    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    # Parse roadmaps
    roadmaps = parse_enriched_roadmaps(ENRICHED_FILE)
    
    # Load checkpoint
    checkpoint = load_checkpoint()
    
    # Count totals
    grand_total = sum(
        sum(len(s["topics"]) for s in r["sections"]) 
        for r in roadmaps
    )
    already_done = len(checkpoint.get("completed", {}))
    
    print(f"\n{'#'*60}")
    print(f"  TOPIC KNOWLEDGE GENERATOR")
    print(f"  Roadmaps: {len(roadmaps)}")
    print(f"  Total topics: {grand_total}")
    print(f"  Already completed: {already_done}")
    print(f"  Remaining: {grand_total - already_done}")
    print(f"  Model: {MODEL}")
    print(f"  Output: {OUTPUT_DIR}/")
    print(f"{'#'*60}")
    
    # Check if specific roadmap requested via CLI
    target_roadmap = None
    if len(sys.argv) > 1:
        target_roadmap = sys.argv[1]
        print(f"\n  [*] Targeting roadmap: {target_roadmap}")
    
    # Check Ollama connectivity
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=5)
        r.raise_for_status()
        print(f"  [+] Ollama connected. Model available: {MODEL}")
    except Exception as e:
        print(f"  [!] Cannot connect to Ollama: {e}")
        print(f"  [!] Make sure Ollama is running: ollama serve")
        sys.exit(1)
    
    start_time = time.time()
    total_generated = 0
    total_failed = 0
    
    for roadmap in roadmaps:
        if target_roadmap and roadmap["id"] != target_roadmap:
            continue
        
        result = generate_roadmap_knowledge(roadmap, checkpoint)
        
        generated = sum(1 for t in result["topics"] if t.get("generation_status") == "success" and t["topic_name"] + "::" + t["section_id"] not in {})
        failed = sum(1 for t in result["topics"] if t.get("generation_status") == "failed")
        total_generated += generated
        total_failed += failed
    
    elapsed = time.time() - start_time
    
    print(f"\n{'#'*60}")
    print(f"  GENERATION COMPLETE")
    print(f"  Total time: {elapsed/60:.1f} minutes")
    print(f"  Topics generated: {total_generated}")
    print(f"  Topics failed: {total_failed}")
    print(f"  Output directory: {OUTPUT_DIR}/")
    print(f"{'#'*60}")
    
    if total_failed > 0:
        print(f"\n  [!] {total_failed} topics failed. Re-run the script to retry them.")
        print(f"  [!] Failed topics are saved with generation_status='failed' and can be regenerated.")


if __name__ == "__main__":
    main()
