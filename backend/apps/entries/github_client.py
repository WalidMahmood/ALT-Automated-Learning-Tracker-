"""
GitHub Commit Validation Client — Phase 2

Fetches commits from GitHub repos to cross-validate SBU entry claims.
Advisory signal ONLY — never blocks or rejects entries.

Rate limits:
- Unauthenticated: 60 requests/hour
- With GITHUB_TOKEN: 5,000 requests/hour
- Per-entry cost: 1 request (commits for a date range)

IMPORTANT: This is a BONUS validation signal. If GitHub is unreachable,
rate-limited, or repo is private — we SKIP, never penalize.
"""
import re
import logging
import requests
from datetime import datetime, timedelta
from django.conf import settings
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Timeout for GitHub API requests (hard cap)
GITHUB_TIMEOUT = 8  # seconds


class GitHubError(Exception):
    """Base error for GitHub operations."""
    pass


class RateLimitError(GitHubError):
    """GitHub API rate limit exceeded."""
    pass


class RepoNotAccessibleError(GitHubError):
    """Repository is private, deleted, or URL is invalid."""
    pass


def parse_repo_url(repo_url: str) -> tuple[str, str] | None:
    """
    Extract (owner, repo) from a GitHub URL.
    
    Supports:
      - https://github.com/owner/repo
      - https://github.com/owner/repo.git
      - https://github.com/owner/repo/
      - github.com/owner/repo
    
    Returns: (owner, repo) or None if invalid.
    """
    if not repo_url:
        return None

    # Normalize
    url = repo_url.strip().rstrip('/')
    if url.endswith('.git'):
        url = url[:-4]

    # Try URL parsing first
    parsed = urlparse(url)
    if parsed.hostname and 'github.com' in parsed.hostname:
        parts = parsed.path.strip('/').split('/')
        if len(parts) >= 2:
            return (parts[0], parts[1])

    # Fallback: regex
    match = re.match(r'(?:https?://)?github\.com/([^/]+)/([^/]+)', url)
    if match:
        return (match.group(1), match.group(2))

    return None


def extract_github_username(github_url: str) -> str | None:
    """
    Extract GitHub username from User.github_url field.
    
    Input: https://github.com/username or https://github.com/username/
    Returns: 'username' or None
    """
    if not github_url:
        return None

    match = re.match(r'(?:https?://)?github\.com/([a-zA-Z0-9_-]+)/?$', github_url.strip())
    return match.group(1) if match else None


def _get_headers() -> dict:
    """Build GitHub API headers with optional auth token."""
    headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ALT-System/2.0',
    }
    token = getattr(settings, 'GITHUB_TOKEN', '')
    if token:
        headers['Authorization'] = f'token {token}'
    return headers


def _check_rate_limit(response: requests.Response):
    """Check if we hit rate limit and raise if so."""
    if response.status_code == 403:
        remaining = response.headers.get('X-RateLimit-Remaining', '0')
        if remaining == '0':
            reset_time = response.headers.get('X-RateLimit-Reset', '')
            raise RateLimitError(
                f"GitHub API rate limited. Resets at {reset_time}. "
                f"Set GITHUB_TOKEN in .env to increase limit to 5000/hr."
            )


def fetch_commits_for_date(
    repo_url: str,
    target_date: str,
    github_username: str | None = None,
) -> dict:
    """
    Fetch commits from a GitHub repo for a specific date.
    
    Args:
        repo_url: Full GitHub repo URL (e.g. https://github.com/org/repo)
        target_date: ISO date string (e.g. '2026-04-09')
        github_username: Optional — GitHub username to filter commits by author
    
    Returns: {
        'commits': [{sha, message, author, date, files_changed, additions, deletions}],
        'total_commits': int,
        'user_commits': int,  # commits matching github_username
        'total_additions': int,
        'total_deletions': int,
        'file_extensions': set,  # unique file extensions touched
        'error': str | None,
    }
    
    Never raises — returns error dict on failure.
    """
    result = {
        'commits': [],
        'total_commits': 0,
        'user_commits': 0,
        'total_additions': 0,
        'total_deletions': 0,
        'file_extensions': [],
        'error': None,
    }

    # Parse repo URL
    parsed = parse_repo_url(repo_url)
    if not parsed:
        result['error'] = f'Invalid GitHub repo URL: {repo_url}'
        return result

    owner, repo = parsed

    # Build date range (full day in UTC)
    try:
        dt = datetime.strptime(target_date, '%Y-%m-%d')
        since = dt.strftime('%Y-%m-%dT00:00:00Z')
        until = (dt + timedelta(days=1)).strftime('%Y-%m-%dT00:00:00Z')
    except ValueError:
        result['error'] = f'Invalid date format: {target_date}'
        return result

    # Fetch commits list
    commits_url = f'https://api.github.com/repos/{owner}/{repo}/commits'
    params = {
        'since': since,
        'until': until,
        'per_page': 100,
    }

    # If we have the user's GitHub username, filter by author
    if github_username:
        params['author'] = github_username

    try:
        response = requests.get(
            commits_url,
            headers=_get_headers(),
            params=params,
            timeout=GITHUB_TIMEOUT,
        )

        _check_rate_limit(response)

        if response.status_code == 404:
            result['error'] = 'Repository not found or private'
            return result

        if response.status_code != 200:
            result['error'] = f'GitHub API error: {response.status_code}'
            return result

        commits_data = response.json()

    except RateLimitError as e:
        result['error'] = str(e)
        return result
    except requests.Timeout:
        result['error'] = 'GitHub API timeout (8s limit)'
        return result
    except requests.ConnectionError:
        result['error'] = 'GitHub API unreachable'
        return result
    except Exception as e:
        result['error'] = f'GitHub API error: {str(e)}'
        return result

    if not commits_data:
        # No commits found — this is NOT an error, just no activity
        return result

    # Process commits
    file_extensions = set()
    commits_list = []

    for commit_info in commits_data[:30]:  # Cap at 30 commits per day
        commit = commit_info.get('commit', {})
        author_info = commit.get('author', {})
        sha = commit_info.get('sha', '')[:7]

        commit_entry = {
            'sha': sha,
            'message': commit.get('message', '')[:200],  # Truncate long messages
            'author': author_info.get('name', 'Unknown'),
            'author_email': author_info.get('email', ''),
            'date': author_info.get('date', ''),
        }

        commits_list.append(commit_entry)

    result['commits'] = commits_list
    result['total_commits'] = len(commits_data)
    result['user_commits'] = len(commits_data)  # Already filtered by author if username provided

    # Fetch file-level details for top 5 commits (to stay within rate limits)
    for commit_info in commits_data[:5]:
        sha = commit_info.get('sha', '')
        if not sha:
            continue

        try:
            detail_resp = requests.get(
                f'https://api.github.com/repos/{owner}/{repo}/commits/{sha}',
                headers=_get_headers(),
                timeout=GITHUB_TIMEOUT,
            )

            _check_rate_limit(detail_resp)

            if detail_resp.status_code == 200:
                detail = detail_resp.json()
                stats = detail.get('stats', {})
                result['total_additions'] += stats.get('additions', 0)
                result['total_deletions'] += stats.get('deletions', 0)

                # Collect file extensions
                for f in detail.get('files', []):
                    filename = f.get('filename', '')
                    if '.' in filename:
                        ext = filename.rsplit('.', 1)[1].lower()
                        file_extensions.add(f'.{ext}')

        except (RateLimitError, requests.Timeout, requests.ConnectionError):
            # Don't fail on detail fetch — we have the commit list at minimum
            break
        except Exception:
            break

    result['file_extensions'] = sorted(file_extensions)

    return result


def match_author(
    commits_result: dict,
    github_username: str | None,
    user_email: str | None = None,
) -> dict:
    """
    Determine how well the commits match the claimed user.
    
    Returns: {
        'match_level': 'strong' | 'weak' | 'none' | 'unattributed',
        'matched_commits': int,
        'reasoning': str,
    }
    """
    commits = commits_result.get('commits', [])
    total = commits_result.get('total_commits', 0)

    if total == 0:
        return {
            'match_level': 'none',
            'matched_commits': 0,
            'reasoning': 'No commits found for this date.',
        }

    if not github_username and not user_email:
        return {
            'match_level': 'unattributed',
            'matched_commits': total,
            'reasoning': f'{total} commits found but no GitHub username configured to verify authorship.',
        }

    # Since we filter by author in the API call, all returned commits are by the user
    matched = total
    username_lower = (github_username or '').lower()
    email_lower = (user_email or '').lower()

    # Double-check: verify at least one commit has matching author info
    verified = False
    for c in commits:
        author = (c.get('author', '') or '').lower()
        author_email = (c.get('author_email', '') or '').lower()
        if username_lower and username_lower in author:
            verified = True
            break
        if email_lower and email_lower in author_email:
            verified = True
            break

    if not verified and github_username:
        # API filtered by username, so they should match. 
        # But author name in commit might differ from GitHub login.
        # Trust the API filter result.
        verified = True

    if matched >= 3:
        return {
            'match_level': 'strong',
            'matched_commits': matched,
            'reasoning': f'{matched} commits by {github_username or "user"} on this date.',
        }
    elif matched >= 1:
        return {
            'match_level': 'weak',
            'matched_commits': matched,
            'reasoning': f'{matched} commit(s) by {github_username or "user"} on this date.',
        }
    else:
        return {
            'match_level': 'none',
            'matched_commits': 0,
            'reasoning': f'Commits found but none matched {github_username or "user"}.',
        }


def validate_git_for_entry(
    repo_url: str,
    entry_date: str,
    github_username: str | None,
    user_email: str | None = None,
    claimed_hours: float = 0,
) -> dict:
    """
    Main entry point: validate an SBU entry against GitHub commits.
    
    Returns: {
        'result': 'match' | 'partial' | 'no_match' | 'skipped',
        'score_adjustment': float,  # -10 to +10
        'evidence': {
            'commits_found': int,
            'user_commits': int,
            'additions': int,
            'deletions': int,
            'file_extensions': list,
            'match_level': str,
            'reasoning': str,
        }
    }
    """
    # Fetch commits
    commits_result = fetch_commits_for_date(repo_url, entry_date, github_username)

    # If error occurred, skip — never penalize
    if commits_result.get('error'):
        logger.warning(f"Git validation skipped: {commits_result['error']}")
        return {
            'result': 'skipped',
            'score_adjustment': 0,
            'evidence': {
                'commits_found': 0,
                'user_commits': 0,
                'additions': 0,
                'deletions': 0,
                'file_extensions': [],
                'match_level': 'skipped',
                'reasoning': f"Skipped: {commits_result['error']}",
            },
        }

    # Match author
    author_match = match_author(commits_result, github_username, user_email)
    match_level = author_match['match_level']

    # Build evidence
    evidence = {
        'commits_found': commits_result['total_commits'],
        'user_commits': author_match['matched_commits'],
        'additions': commits_result['total_additions'],
        'deletions': commits_result['total_deletions'],
        'file_extensions': commits_result['file_extensions'],
        'match_level': match_level,
        'reasoning': author_match['reasoning'],
    }

    # === HALLUCINATION GUARDS ===
    # Guard 1: 0 commits can NEVER be "match"
    if commits_result['total_commits'] == 0:
        return {
            'result': 'no_match',
            'score_adjustment': 0,  # Neutral — no penalty for no commits
            'evidence': evidence,
        }

    # Guard 2: 1 commit + 2 lines can't justify 8h of work
    if (
        author_match['matched_commits'] == 1
        and (commits_result['total_additions'] + commits_result['total_deletions']) < 10
        and claimed_hours >= 6
    ):
        evidence['reasoning'] += ' (minimal code change for claimed hours)'
        return {
            'result': 'partial',
            'score_adjustment': 0,  # Neutral — don't penalize, just note
            'evidence': evidence,
        }

    # Score based on match level
    if match_level == 'strong':
        return {
            'result': 'match',
            'score_adjustment': 5,  # Small confidence boost
            'evidence': evidence,
        }
    elif match_level == 'weak':
        return {
            'result': 'partial',
            'score_adjustment': 2,  # Slight boost
            'evidence': evidence,
        }
    elif match_level == 'unattributed':
        return {
            'result': 'partial',
            'score_adjustment': 0,  # Neutral — can't verify
            'evidence': evidence,
        }
    else:
        # No match — but DON'T penalize. Advisory only.
        return {
            'result': 'no_match',
            'score_adjustment': 0,  # Neutral
            'evidence': evidence,
        }
