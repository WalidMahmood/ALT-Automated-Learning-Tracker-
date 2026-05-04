"""Rate limiting utilities to prevent brute force attacks."""
from functools import wraps
from time import time
from collections import defaultdict
from fastapi import HTTPException, status, Request
from typing import Callable

# In-memory store for rate limiting (use Redis in production)
_rate_limit_store = defaultdict(list)

def rate_limit(max_requests: int = 5, window_seconds: int = 60):
    """
    Rate limiting decorator to prevent brute force attacks.
    
    Args:
        max_requests: Maximum number of requests allowed
        window_seconds: Time window in seconds
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            # Get client IP - check for proxy headers
            client_ip = request.client.host if request.client else "unknown"
            
            # Check for X-Forwarded-For header (if behind proxy)
            forwarded_for = request.headers.get("X-Forwarded-For")
            if forwarded_for:
                # Take the first IP (original client)
                client_ip = forwarded_for.split(",")[0].strip()
            
            # Clean old entries
            current_time = time()
            _rate_limit_store[client_ip] = [
                req_time for req_time in _rate_limit_store[client_ip]
                if current_time - req_time < window_seconds
            ]
            
            # Check rate limit
            if len(_rate_limit_store[client_ip]) >= max_requests:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please try again later.",
                    headers={"Retry-After": str(window_seconds)}
                )
            
            # Record this request
            _rate_limit_store[client_ip].append(current_time)
            
            return await func(request, *args, **kwargs)
        return wrapper
    return decorator

