from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """
    Standard pagination with flexible page size.
    Frontend can control page size via ?page_size=N (max 1000).
    Default: 50 items per page.
    """
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000
