import uuid
from .utils import set_current_request, clear_thread_locals

class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # 1. Generate/Get Request ID
        request_id = str(uuid.uuid4())
        request.request_id = request_id
        
        # 2. Store Request globally (for Signal access later)
        # Note: We store the request object itself so that when DRF authenticates
        # later in the view, we can still access the updated request.user
        set_current_request(request)

        try:
            response = self.get_response(request)
        finally:
            # 3. Clean up
            clear_thread_locals()

        response['X-Request-ID'] = request_id
        return response
