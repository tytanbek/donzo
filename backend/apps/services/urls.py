from django.urls import path
from . import views

urlpatterns = [
    # Public
    path('', views.ServiceListView.as_view(), name='service-list'),
    path('top/', views.top_services, name='service-top'),
    path('stats/', views.public_stats, name='service-public-stats'),
    path('<slug:slug>/', views.ServiceDetailView.as_view(), name='service-detail'),
]
