from rest_framework import generics, permissions, viewsets
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from .models import Banner
from .serializers import BannerSerializer
from apps.users.permissions import IsAdmin


class BannerListView(generics.ListAPIView):
    queryset = Banner.objects.filter(is_active=True)
    serializer_class = BannerSerializer
    permission_classes = [permissions.AllowAny]

    @method_decorator(cache_page(30))
    def get(self, *args, **kwargs):
        return super().get(*args, **kwargs)


class AdminBannerViewSet(viewsets.ModelViewSet):
    queryset = Banner.objects.all()
    serializer_class = BannerSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
