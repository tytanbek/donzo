from rest_framework import generics, permissions, filters, viewsets
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count, Min, Q, Prefetch
from .models import Category, Service, Package, ServiceField
from .serializers import (
    CategorySerializer, ServiceListSerializer, ServiceDetailSerializer,
    ServiceWriteSerializer, PackageWriteSerializer, ServiceFieldWriteSerializer,
    AdminServiceDetailSerializer,
)
from apps.users.permissions import IsAdmin

# N+1 ni yo'qotish: list'larda count'lar bitta SQL so'rovda annotate qilinadi,
# serializer esa annotatsiyani o'qiydi (fallback: count()).


from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page


class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.filter(is_active=True).annotate(
        services_count=Count('services', filter=Q(services__is_active=True), distinct=True)
    )
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]

    @method_decorator(cache_page(30))
    def get(self, *args, **kwargs):
        return super().get(*args, **kwargs)


class ServiceListView(generics.ListAPIView):
    queryset = (
        Service.objects.filter(is_active=True)
        .select_related('category')
        .annotate(
            min_price=Min('packages__price', filter=Q(packages__is_active=True)),
            packages_count=Count('packages', filter=Q(packages__is_active=True), distinct=True),
        )
    )
    serializer_class = ServiceListSerializer
    permission_classes = [permissions.AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']

    @method_decorator(cache_page(30))
    def get(self, *args, **kwargs):
        return super().get(*args, **kwargs)


class ServiceDetailView(generics.RetrieveAPIView):
    queryset = Service.objects.filter(is_active=True).select_related('category').prefetch_related(
        Prefetch(
            'packages',
            queryset=Package.objects.filter(is_active=True).order_by('order_index', 'id'),
            to_attr='_active_packages',
        ),
        Prefetch('fields', queryset=ServiceField.objects.all().order_by('order_index', 'id')),
    )
    serializer_class = ServiceDetailSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = 'slug'


# Admin Views
class AdminCategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminServiceViewSet(viewsets.ModelViewSet):
    queryset = Service.objects.all()
    serializer_class = ServiceWriteSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    search_fields = ['name', 'description']

    def get_serializer_class(self):
        # retrieve/update javobida BARCHA paketlar va maydonlar qaytadi —
        # admin tahrirlash formasi to'liq ma'lumot oladi (N+1 yo'q: prefetch).
        if self.action in ('retrieve', 'update', 'partial_update'):
            from .serializers import AdminServiceDetailSerializer
            return AdminServiceDetailSerializer
        return ServiceWriteSerializer

    def get_queryset(self):
        qs = Service.objects.all()
        if self.action in ('retrieve', 'update', 'partial_update'):
            qs = qs.prefetch_related('packages', 'fields')
        return qs


class AdminPackageViewSet(viewsets.ModelViewSet):
    queryset = Package.objects.all()
    serializer_class = PackageWriteSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class AdminServiceFieldViewSet(viewsets.ModelViewSet):
    queryset = ServiceField.objects.all()
    serializer_class = ServiceFieldWriteSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


# ── Ochiq marketing ma'lumotlari (Mini App bosh sahifasi uchun) ──

from rest_framework.decorators import api_view, permission_classes as perm_classes
from rest_framework.response import Response

TOP_PERIODS = {'today': 1, 'week': 7, 'month': 30}


@api_view(['GET'])
@perm_classes([permissions.AllowAny])
def top_services(request):
    """GET /api/v1/services/top/?period=today|week|month

    Shu davrda eng ko'p BAJARILGAN buyurtma olgan xizmatlar (haqiqiy sotuv).
    Mijoz ma'lumotlari yo'q — faqat xizmat va sotuv soni.
    """
    from datetime import timedelta
    from django.utils import timezone
    period = request.query_params.get('period', 'week')
    days = TOP_PERIODS.get(period, 7)
    since = timezone.now() - timedelta(days=days)
    rows = (
        Service.objects.filter(is_active=True)
        .annotate(
            sold=Count('orders', filter=Q(orders__status='completed', orders__updated_at__gte=since), distinct=True),
            min_price=Min('packages__price', filter=Q(packages__is_active=True)),
        )
        .filter(sold__gt=0)
        .order_by('-sold', 'name')[:10]
    )
    return Response({'period': period, 'results': [
        {'id': s.id, 'slug': s.slug, 'name': s.name, 'image_url': s.image_url,
         'sold': s.sold, 'min_price': float(s.min_price) if s.min_price is not None else None}
        for s in rows
    ]})


@api_view(['GET'])
@perm_classes([permissions.AllowAny])
def public_stats(request):
    """GET /api/v1/services/stats/ — ishonch belgilari uchun haqiqiy raqamlar."""
    from datetime import timedelta
    from django.utils import timezone
    from apps.orders.models import Order
    from apps.settings_app.marketing_ads import _bot_username, _public_proof_channel
    since = timezone.now() - timedelta(days=7)
    return Response({
        'completed_7d': Order.objects.filter(status='completed', updated_at__gte=since).count(),
        'proof_channel': _public_proof_channel(),
        'bot_username': _bot_username(),
    })
