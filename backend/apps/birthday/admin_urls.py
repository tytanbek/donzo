from django.urls import path
from . import views

urlpatterns = [
    path('birthday/stats/', views.admin_birthday_stats, name='birthday-admin-stats'),
    path('birthday/list/', views.admin_birthday_list, name='birthday-admin-list'),
]
