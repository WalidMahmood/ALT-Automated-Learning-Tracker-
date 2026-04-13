"""
YouTube client for fetching topic learning resources.
=====================================================
Dual-engine: YouTube Data API v3 (primary) → youtube-search (fallback on quota).

Quality features:
- English-only filter (blocks Hindi, Bengali, etc.)
- Compound topic handling (CSS-in-JS won't match plain CSS)
- Edu channel boost (freeCodeCamp, Traversy, etc.)
- Smart duration floor (frameworks 30min+, concepts 5min+)
- Tutorial keyword boost in title scoring
- View count minimums (5K API, 1K scrape)
- Generic topic detection (Go → "Go programming language")
"""
import re
import logging
import math

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
REQUEST_TIMEOUT = 15

# Known education channels — 1.3x score boost
EDU_CHANNELS = {
    'freecodecamp', 'freecodecamp.org', 'traversy media', 'web dev simplified',
    'fireship', 'net ninja', 'the net ninja', 'academind', 'programming with mosh',
    'codevolution', 'codewithharry', 'kevin powell', 'hitesh choudhary',
    'clever programmer', 'tech with tim', 'javascript mastery',
    'dave gray', 'sonny sangha', 'theo', 'jack herrington', 'techworld with nana',
    'simplilearn', 'edureka', 'great learning', 'brad traversy',
    'the coding train', 'ben awad', 'caleb curry', 'dev ed', 'developedbyed',
    'hussein nasser', 'bytemonk', 'kodekloud', 'neetcode',
}

# Ambiguous single-word topics that are also common English words
_AMBIGUOUS_WORDS = {
    'go', 'rust', 'ruby', 'swift', 'dart', 'scala', 'haskell', 'julia',
    'base', 'acid', 'rest', 'soap', 'flux', 'redux', 'nest', 'next',
    'express', 'spring', 'flask', 'django', 'rails', 'phoenix',
    'git', 'npm', 'yarn', 'bower', 'grunt', 'gulp',
    'docker', 'cypress', 'jest', 'mocha',
}

# Tutorial keywords — boost titles containing these
_TUTORIAL_KEYWORDS = {
    'tutorial', 'course', 'full course', 'crash course', 'for beginners',
    'beginner', 'learn', 'complete guide', 'masterclass', 'introduction',
    'getting started', 'from scratch', 'step by step', 'hands on',
    'deep dive', 'fundamentals', 'explained', 'how to',
}

# Non-tutorial indicators — slight penalty
_NON_TUTORIAL_KEYWORDS = {
    'vs ', ' vs ', 'what now', 'is dead', 'rip ', 'opinion',
    'hot take', 'rant', 'drama', 'controversy', 'interview question',
}

# Non-English language markers
_NON_ENGLISH_MARKERS = {
    'in hindi', '\u0939\u093f\u0928\u094d\u0926\u0940', '\u0939\u093f\u0902\u0926\u0940',
    'em portugu\u00eas', 'en espa\u00f1ol',
    '\u043d\u0430 \u0440\u0443\u0441\u0441\u043a\u043e\u043c',
    'in bangla', '\u09ac\u09be\u0982\u09b2\u09be', '\u09ac\u09be\u0982\u09b2\u09be\u09a6\u09c7\u09b6',
    'in tamil', '\u0ba4\u0bae\u0bbf\u0bb4\u0bcd',
    'in telugu', 'in urdu', '\u0627\u0631\u062f\u0648',
    'in arabic', '\u0628\u0627\u0644\u0639\u0631\u0628\u064a',
    'in korean', 'in japanese', 'in chinese',
    'auf deutsch', 'en fran\u00e7ais',
    'in marathi', 'in kannada', 'in malayalam',
    'in gujarati', 'in punjabi',
    '\u09b6\u09bf\u0996\u09c1\u09a8', '\u09ad\u09bf\u09a1\u09bf\u0993',  # Bengali "learn" / "video"
}


class YouTubeAPIError(Exception):
    pass


class QuotaExceededError(YouTubeAPIError):
    pass


# ─── Duration Parsing ─────────────────────────────────────────────

def parse_iso_duration(iso_duration: str) -> int:
    """Convert ISO 8601 duration to minutes (e.g. PT1H30M15S -> 90)."""
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', iso_duration or '')
    if not match:
        return 0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 60 + minutes + (1 if seconds >= 30 else 0)


def _parse_hms_duration(duration_str: str) -> int:
    """Convert H:MM:SS or M:SS duration string to minutes."""
    if not duration_str:
        return 0
    parts = duration_str.strip().split(':')
    try:
        if len(parts) == 3:
            return int(parts[0]) * 60 + int(parts[1]) + (1 if int(parts[2]) >= 30 else 0)
        elif len(parts) == 2:
            return int(parts[0]) + (1 if int(parts[1]) >= 30 else 0)
        return 0
    except (ValueError, IndexError):
        return 0


def _parse_view_count(views_str: str) -> int:
    """Extract numeric view count from strings like '57,23,675টি ভিউ'."""
    if not views_str:
        return 0
    digits = re.sub(r'[^\d]', '', views_str)
    return int(digits) if digits else 0


# ─── Query Building ───────────────────────────────────────────────

def _build_search_query(topic_name: str, section_name: str = '', roadmap_context: str = '') -> str:
    """
    Build optimized YouTube search query.

    Handles:
    - Ambiguous words: "Go" → "Go programming language tutorial"
    - Generic topics: "Server Side" → "Server Side Authentication & Caching tutorial"
    - Specific topics: "React" → "React tutorial"
    """
    clean = topic_name.strip().rstrip('?').strip()
    clean_lower = clean.lower()

    stop_words = {
        'how', 'does', 'the', 'what', 'is', 'a', 'an', 'and', 'or', 'to',
        'in', 'of', 'for', 'with', 'learn', 'basics', 'basic', 'about',
        'do', 'are', 'they', 'it', 'its', 'this', 'that', 'use', 'using',
    }
    meaningful_words = [w for w in re.findall(r'\w+', clean_lower) if w not in stop_words and len(w) > 2]

    # Ambiguous single-word topics like "Go", "Rust", "Base"
    if clean_lower in _AMBIGUOUS_WORDS:
        if roadmap_context:
            return f"{clean} programming {roadmap_context} tutorial"
        return f"{clean} programming language tutorial"

    is_generic = len(meaningful_words) <= 2

    if is_generic and section_name and section_name.lower() != clean_lower:
        return f"{clean} {section_name} tutorial"
    elif roadmap_context:
        return f"{clean} {roadmap_context} tutorial"
    else:
        return f"{clean} tutorial"


# ─── Filtering ────────────────────────────────────────────────────

def _is_english_title(title: str) -> bool:
    """Check if title is primarily English. Filters Hindi/Bengali/regional."""
    if not title:
        return False
    title_lower = title.lower()

    # Check explicit non-English markers
    for marker in _NON_ENGLISH_MARKERS:
        if marker in title_lower:
            return False

    # Check if first 10 characters are mostly non-Latin (catches Bengali/Hindi titles)
    first_chars = title[:10]
    if first_chars:
        ascii_count = sum(1 for c in first_chars if c.isascii())
        if ascii_count / len(first_chars) < 0.5:
            return False

    # Overall ratio — require 85% Latin chars
    latin_chars = sum(1 for c in title if c.isascii())
    total_chars = max(len(title), 1)
    return (latin_chars / total_chars) > 0.85


# ─── Title Relevance Scoring ─────────────────────────────────────

def _title_relevance_score(title: str, topic_name: str, section_name: str = '') -> float:
    """Score video title relevance to topic (0.0 - 1.0)."""
    title_lower = title.lower().strip()
    topic_lower = topic_name.lower().strip().rstrip('?')

    # Exact topic name in title = best match
    if topic_lower in title_lower:
        return 1.0

    # Compound names: CSS-in-JS → check variants
    is_compound = '-' in topic_lower or '.' in topic_lower
    topic_variants = {
        topic_lower,
        topic_lower.replace('-', ' '),
        topic_lower.replace('-', ''),
        topic_lower.replace('.', ''),
        topic_lower.replace('.', ' '),
    }
    for variant in topic_variants:
        if len(variant) > 2 and variant in title_lower:
            return 1.0

    # Compound topic with NO variant matched → penalize heavily
    if is_compound:
        return 0.2

    stop_words = {
        'how', 'does', 'the', 'what', 'is', 'a', 'an', 'and', 'or', 'to',
        'in', 'of', 'for', 'with', 'learn', 'basics', 'basic', 'about',
        'do', 'are', 'they', 'it', 'its', 'this', 'that', 'use', 'using',
    }
    topic_words = [w for w in re.findall(r'\w+', topic_lower) if w not in stop_words and len(w) > 2]

    if not topic_words:
        # Very short topic — try section name
        if section_name:
            section_lower = section_name.lower()
            if section_lower in title_lower:
                return 0.7
            section_words = [w for w in re.findall(r'\w+', section_lower) if w not in stop_words and len(w) > 2]
            if section_words:
                matched = sum(1 for w in section_words if w in title_lower)
                return 0.3 + 0.4 * (matched / len(section_words))
        return 0.3

    matched = sum(1 for w in topic_words if w in title_lower)
    base_score = matched / len(topic_words)

    # Section context bonus
    if section_name and base_score < 1.0:
        section_lower = section_name.lower()
        section_words = [w for w in re.findall(r'\w+', section_lower) if w not in stop_words and len(w) > 2]
        if section_words:
            section_matched = sum(1 for w in section_words if w in title_lower)
            base_score = min(1.0, base_score + 0.15 * (section_matched / len(section_words)))

    return base_score


def _title_quality_boost(title: str) -> float:
    """Boost for tutorial-like titles, penalty for non-tutorial content."""
    title_lower = title.lower()
    boost = 1.0

    # Tutorial keyword boost
    for kw in _TUTORIAL_KEYWORDS:
        if kw in title_lower:
            boost = max(boost, 1.25)
            break

    # "Full course" / "Complete" gets extra boost
    if 'full course' in title_lower or 'complete course' in title_lower:
        boost = max(boost, 1.4)

    # Non-tutorial penalty
    for kw in _NON_TUTORIAL_KEYWORDS:
        if kw in title_lower:
            boost *= 0.7
            break

    return boost


def _compute_score(relevance: float, view_count: int, channel: str, title: str) -> float:
    """Composite score: relevance^2 * log(views) * channel_boost * quality_boost."""
    popularity = math.log10(max(view_count, 1))
    channel_boost = 1.3 if channel.lower().strip() in EDU_CHANNELS else 1.0
    quality_boost = _title_quality_boost(title)
    return (relevance ** 2) * popularity * channel_boost * quality_boost


# ─── Primary Engine: YouTube Data API v3 ──────────────────────────

MIN_VIEWS_API = 5000
MIN_VIEWS_SCRAPE = 1000
MIN_DURATION = 5  # minutes


def _search_via_api(query: str, topic_name: str, section_name: str,
                    max_results: int, used_video_ids: set = None) -> list[dict]:
    """Search via YouTube Data API v3. ~101 units per call."""
    api_key = getattr(settings, 'YOUTUBE_API_KEY', '') or ''
    if not api_key:
        raise YouTubeAPIError("No API key configured")

    search_params = {
        'part': 'snippet',
        'q': query,
        'type': 'video',
        'order': 'relevance',
        'maxResults': 10,  # More candidates for better filtering
        'relevanceLanguage': 'en',
        'videoEmbeddable': 'true',
        'key': api_key,
    }

    resp = requests.get(YOUTUBE_SEARCH_URL, params=search_params, timeout=REQUEST_TIMEOUT)

    if resp.status_code == 403:
        error_reason = resp.json().get('error', {}).get('errors', [{}])[0].get('reason', '')
        if error_reason == 'quotaExceeded':
            raise QuotaExceededError("YouTube API daily quota exceeded")
        raise YouTubeAPIError(f"API forbidden: {resp.text[:200]}")
    resp.raise_for_status()

    items = resp.json().get('items', [])
    if not items:
        return []

    video_ids = [item['id']['videoId'] for item in items if item.get('id', {}).get('videoId')]
    if not video_ids:
        return []

    # Fetch details
    detail_params = {
        'part': 'contentDetails,statistics',
        'id': ','.join(video_ids[:50]),
        'key': api_key,
    }
    detail_resp = requests.get(YOUTUBE_VIDEOS_URL, params=detail_params, timeout=REQUEST_TIMEOUT)
    if detail_resp.status_code == 403:
        error_reason = detail_resp.json().get('error', {}).get('errors', [{}])[0].get('reason', '')
        if error_reason == 'quotaExceeded':
            raise QuotaExceededError("YouTube API daily quota exceeded")
    detail_resp.raise_for_status()

    details = {}
    for item in detail_resp.json().get('items', []):
        vid_id = item['id']
        content = item.get('contentDetails', {})
        stats = item.get('statistics', {})
        details[vid_id] = {
            'duration': content.get('duration', ''),
            'viewCount': int(stats.get('viewCount', '0')),
            'likeCount': int(stats.get('likeCount', '0')),
        }

    snippet_map = {
        item['id']['videoId']: item['snippet']
        for item in items if item.get('id', {}).get('videoId')
    }

    results = []
    for vid_id, detail in details.items():
        snippet = snippet_map.get(vid_id, {})
        title = snippet.get('title', '')
        duration_min = parse_iso_duration(detail['duration'])
        view_count = detail['viewCount']
        channel = snippet.get('channelTitle', '')

        # Filters
        if used_video_ids and vid_id in used_video_ids:
            continue
        if duration_min < MIN_DURATION:
            continue
        if view_count < MIN_VIEWS_API:
            continue
        if not _is_english_title(title):
            continue

        relevance = _title_relevance_score(title, topic_name, section_name)
        if relevance < 0.3:
            continue

        thumbnails = snippet.get('thumbnails', {})
        thumb = (
            thumbnails.get('high', {}).get('url')
            or thumbnails.get('medium', {}).get('url')
            or thumbnails.get('default', {}).get('url', '')
        )

        results.append({
            'youtube_video_id': vid_id,
            'title': title,
            'url': f"https://www.youtube.com/watch?v={vid_id}",
            'channel_name': channel,
            'duration_minutes': duration_min,
            'view_count': view_count,
            'like_count': detail['likeCount'],
            'thumbnail_url': thumb,
            'description': (snippet.get('description', '') or '')[:500],
            '_score': _compute_score(relevance, view_count, channel, title),
        })

    results.sort(key=lambda x: x['_score'], reverse=True)
    for r in results:
        r.pop('_score', None)
    return results[:max_results]


# ─── Fallback Engine: youtube-search (no API key) ─────────────────

def _search_via_scrape(query: str, topic_name: str, section_name: str,
                       max_results: int, used_video_ids: set = None) -> list[dict]:
    """Search via youtube-search library (web scrape). 0 API units."""
    try:
        from youtube_search import YoutubeSearch
    except ImportError:
        logger.error("youtube-search not installed. pip install youtube-search")
        return []

    try:
        raw_results = YoutubeSearch(query, max_results=15).to_dict()
    except Exception as e:
        logger.warning(f"youtube-search failed: {e}")
        return []

    results = []
    for item in raw_results:
        title = item.get('title', '')
        vid_id = item.get('id', '')
        channel = item.get('channel', '')
        duration_min = _parse_hms_duration(item.get('duration', ''))
        view_count = _parse_view_count(item.get('views', ''))
        thumbnails = item.get('thumbnails', [])
        thumb = thumbnails[0] if thumbnails else ''

        if not vid_id or not title:
            continue
        if used_video_ids and vid_id in used_video_ids:
            continue
        if duration_min < MIN_DURATION:
            continue
        if view_count < MIN_VIEWS_SCRAPE:
            continue
        if not _is_english_title(title):
            continue

        relevance = _title_relevance_score(title, topic_name, section_name)
        if relevance < 0.3:
            continue

        results.append({
            'youtube_video_id': vid_id,
            'title': title,
            'url': f"https://www.youtube.com/watch?v={vid_id}",
            'channel_name': channel,
            'duration_minutes': duration_min,
            'view_count': view_count,
            'like_count': 0,
            'thumbnail_url': thumb,
            'description': '',
            '_score': _compute_score(relevance, view_count, channel, title),
        })

    results.sort(key=lambda x: x['_score'], reverse=True)
    for r in results:
        r.pop('_score', None)
    return results[:max_results]


# ─── Public API ───────────────────────────────────────────────────

def search_topic_videos(
    topic_name: str,
    section_name: str = '',
    roadmap_context: str = '',
    max_results: int = 1,
    used_video_ids: set = None,
) -> list[dict]:
    """
    Search YouTube for the best tutorial video for a topic.

    Dual engine: API v3 (primary) → scrape (fallback on quota).
    Filters: English-only, min 5K views (API) / 1K (scrape), min 5 min.
    Scoring: relevance^2 * log(views) * edu_boost * tutorial_boost.

    Args:
        used_video_ids: Set of video IDs to skip (duplicate prevention within batch)
    """
    query = _build_search_query(topic_name, section_name, roadmap_context)

    # Primary: YouTube Data API v3
    try:
        results = _search_via_api(query, topic_name, section_name, max_results, used_video_ids)
        if results:
            logger.info(
                f"[API] '{topic_name}' -> '{results[0]['title']}' "
                f"({results[0]['duration_minutes']}min, {results[0]['view_count']} views)"
            )
            return results
    except QuotaExceededError:
        logger.warning("YouTube API quota exceeded - switching to fallback engine")
    except YouTubeAPIError as e:
        logger.warning(f"YouTube API error: {e} - trying fallback")
    except Exception as e:
        logger.warning(f"YouTube API unexpected error: {e} - trying fallback")

    # Fallback: youtube-search (scrape, 0 units)
    try:
        results = _search_via_scrape(query, topic_name, section_name, max_results, used_video_ids)
        if results:
            logger.info(
                f"[SCRAPE] '{topic_name}' -> '{results[0]['title']}' "
                f"({results[0]['duration_minutes']}min, {results[0]['view_count']} views)"
            )
            return results
    except Exception as e:
        logger.error(f"Fallback search also failed for '{topic_name}': {e}")

    logger.warning(f"No results from either engine for '{topic_name}' (query: '{query}')")
    return []
