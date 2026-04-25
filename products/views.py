from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Sum, Q

from .models import Category, Product, ChannelListing, StockLocation, StockLevel, StockMovement, UnitOfMeasure, UoMConversion
from .serializers import (
    CategorySerializer, ProductSerializer, ProductListSerializer,
    StockLocationSerializer, StockLevelSerializer, StockMovementSerializer,
    StockAdjustmentSerializer, ChannelListingSerializer,
    UnitOfMeasureSerializer, UoMConversionSerializer,
)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['name']
    ordering_fields = ['name']


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related('category').prefetch_related(
        'stock_levels__location', 'channel_listings'
    ).all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'category', 'brand']
    search_fields = ['sku', 'barcode', 'title', 'brand', 'description']
    ordering_fields = ['sku', 'title', 'sell_price', 'buy_price', 'created_at']
    ordering = ['sku']

    def get_serializer_class(self):
        if self.action == 'list':
            return ProductListSerializer
        return ProductSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['get'], url_path='stock')
    def stock(self, request, pk=None):
        product = self.get_object()
        levels = StockLevel.objects.filter(product=product).select_related('location')
        return Response(StockLevelSerializer(levels, many=True).data)

    @action(detail=True, methods=['get'], url_path='movements')
    def movements(self, request, pk=None):
        product = self.get_object()
        movements = StockMovement.objects.filter(product=product).select_related(
            'location', 'created_by'
        )[:100]
        return Response(StockMovementSerializer(movements, many=True).data)

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        products = []
        for level in StockLevel.objects.select_related('product', 'location').all():
            if level.is_low_stock:
                products.append({
                    'product_id': level.product.id,
                    'sku': level.product.sku,
                    'title': level.product.title,
                    'location': level.location.code,
                    'qty_available': level.qty_available,
                    'low_stock_threshold': level.product.low_stock_threshold,
                })
        return Response(products)

    @action(detail=False, methods=['get'], url_path='search-by-barcode')
    def search_by_barcode(self, request):
        barcode = request.query_params.get('barcode', '')
        if not barcode:
            return Response({'detail': 'barcode param required'}, status=400)
        products = Product.objects.filter(barcode=barcode)
        return Response(ProductListSerializer(products, many=True).data)


class StockLocationViewSet(viewsets.ModelViewSet):
    queryset = StockLocation.objects.all()
    serializer_class = StockLocationSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['code', 'name']
    filterset_fields = ['is_active']


class StockLevelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockLevel.objects.select_related('product', 'location').all()
    serializer_class = StockLevelSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['product', 'location']
    search_fields = ['product__sku', 'product__title', 'location__code']
    ordering_fields = ['product__sku', 'qty_on_hand', 'updated_at']


class UnitOfMeasureViewSet(viewsets.ModelViewSet):
    queryset = UnitOfMeasure.objects.select_related('base_unit').all()
    serializer_class = UnitOfMeasureSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'base_unit']
    search_fields = ['name', 'abbreviation']
    ordering_fields = ['name']
    ordering = ['name']


class UoMConversionViewSet(viewsets.ModelViewSet):
    queryset = UoMConversion.objects.select_related('from_uom', 'to_uom', 'product').all()
    serializer_class = UoMConversionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['from_uom', 'to_uom', 'product']
    search_fields = ['from_uom__name', 'to_uom__name', 'product__sku']
    ordering_fields = ['from_uom__name']
    ordering = ['from_uom__name']


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockMovement.objects.select_related('product', 'location', 'created_by').all()
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['product', 'location', 'movement_type', 'reference_type']
    search_fields = ['product__sku', 'product__title', 'reference_number', 'notes']
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    @action(detail=False, methods=['post'], url_path='adjust')
    def adjust(self, request):
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        product = data['product']
        location = data['location']
        quantity = data['quantity']
        notes = data.get('notes', '')
        unit_cost = data.get('unit_cost')

        with transaction.atomic():
            level, _ = StockLevel.objects.get_or_create(
                product=product, location=location,
                defaults={'qty_on_hand': 0}
            )
            qty_before = level.qty_on_hand
            level.qty_on_hand += quantity
            if level.qty_on_hand < 0:
                level.qty_on_hand = 0
            level.save()

            movement = StockMovement.objects.create(
                product=product,
                location=location,
                movement_type=StockMovement.TYPE_ADJUSTMENT,
                quantity=quantity,
                qty_before=qty_before,
                qty_after=level.qty_on_hand,
                unit_cost=unit_cost,
                notes=notes,
                created_by=request.user,
            )

        from audit.utils import log_action
        log_action(request, 'update', 'StockLevel', str(level.pk),
                   f"{product.sku} adjusted by {quantity} at {location.code}",
                   {'qty_before': qty_before, 'qty_after': level.qty_on_hand, 'notes': notes})

        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)
