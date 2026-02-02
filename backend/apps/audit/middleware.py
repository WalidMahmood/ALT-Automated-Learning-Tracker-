import threading

_thread_locals = threading.local()

def get_current_request():
    """
    Returns the current request from thread-local storage.
    """
    return getattr(_thread_locals, 'request', None)

class AuditMiddleware:
    """
    Middleware that stores the current request in thread-local storage
    so it can be accessed by signals.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _thread_locals.request = request
        try:
            response = self.get_response(request)
        finally:
            # Clean up to avoid memory leaks
            if hasattr(_thread_locals, 'request'):
                del _thread_locals.request
        return response
