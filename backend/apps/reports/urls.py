from django.urls import path
from .views import GenerateReportView, ReportListView, ReportDetailView, TeamReportView

urlpatterns = [
    path('generate/', GenerateReportView.as_view(), name='report-generate'),
    path('team/', TeamReportView.as_view(), name='report-team'),
    path('', ReportListView.as_view(), name='report-list'),
    path('<int:pk>/', ReportDetailView.as_view(), name='report-detail'),
]
