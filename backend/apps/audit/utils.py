from threading import local

_thread_locals = local()

def set_current_request(request):
    _thread_locals.request = request

def get_current_request():
    return getattr(_thread_locals, 'request', None)

def get_current_user():
    request = get_current_request()
    if request:
        return getattr(request, 'user', None)
    return None

def get_request_id():
    request = get_current_request()
    if request:
        return getattr(request, 'request_id', None)
    return getattr(_thread_locals, 'request_id', None) # Fallback if set manually

def clear_thread_locals():
    if hasattr(_thread_locals, 'request'):
        del _thread_locals.request
    if hasattr(_thread_locals, 'request_id'):
        del _thread_locals.request_id
