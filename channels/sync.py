"""
Channel synchronisation logic.

All functions are synchronous (no Celery). Call from views for manual syncs;
use a cron job / management command for background syncs in the future.
"""
import logging
import random
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_decimal(value, default='0') -> Decimal:
    try:
        return Decimal(str(value or default)).quantize(Decimal('0.01'))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _get_wc_client(channel):
    """Build a WooCommerceClient from channel.api_credentials. Raises ValueError if misconfigured."""
    from .integrations.woocommerce import WooCommerceClient
    creds = channel.api_credentials or {}
    missing = [k for k in ('store_url', 'consumer_key', 'consumer_secret') if not creds.get(k)]
    if missing:
        raise ValueError(
            f"WooCommerce channel '{channel.name}' is missing credentials: {', '.join(missing)}. "
            "Configure them on the channel settings page."
        )
    return WooCommerceClient(
        store_url=creds['store_url'],
        consumer_key=creds['consumer_key'],
        consumer_secret=creds['consumer_secret'],
    )


def _match_product(wc_sku: str, channel_type: str = 'woocommerce'):
    """
    Match a channel SKU to an internal Product using a three-tier hierarchy:
    1. ChannelListing.external_sku  (explicit mapping)
    2. Product.sku                  (direct SKU match)
    3. Product.barcode              (barcode fallback)
    Returns Product or None.
    """
    from products.models import Product, ChannelListing
    if not wc_sku:
        return None
    sku = wc_sku.strip()

    listing = (
        ChannelListing.objects
        .filter(channel=channel_type, external_sku__iexact=sku, is_active=True)
        .select_related('product')
        .first()
    )
    if listing:
        return listing.product

    product = Product.objects.filter(sku__iexact=sku).first()
    if product:
        return product

    return Product.objects.filter(barcode=sku).first()


def _ensure_channel_listing(product, channel_type: str, wc_product_id: str, wc_sku: str):
    """
    Create a ChannelListing if one doesn't already exist, so stock pushes
    can find the WooCommerce product ID later without an extra API call.
    """
    from products.models import ChannelListing
    if not product or not wc_product_id:
        return
    ChannelListing.objects.get_or_create(
        product=product,
        channel=channel_type,
        external_id=str(wc_product_id),
        defaults={'external_sku': wc_sku or product.sku, 'is_active': True},
    )


def _find_or_create_customer(billing: dict, user):
    """Look up a customer by email; create a marketplace customer if not found."""
    from customers.models import Customer
    email = (billing.get('email') or '').strip().lower()

    if email:
        customer = Customer.objects.filter(email__iexact=email).first()
        if customer:
            return customer

    first = (billing.get('first_name') or '').strip()
    last = (billing.get('last_name') or '').strip()
    company = (billing.get('company') or '').strip()

    # Generate unique customer number WC + timestamp + optional suffix
    ts = timezone.now().strftime('%y%m%d%H%M%S')
    cust_num = f"WC{ts}"
    attempts = 0
    while Customer.objects.filter(customer_number=cust_num).exists():
        cust_num = f"WC{ts}{random.randint(0, 999):03d}"
        attempts += 1
        if attempts > 50:
            raise RuntimeError("Could not generate unique customer number after 50 attempts")

    return Customer.objects.create(
        customer_number=cust_num,
        first_name=first,
        last_name=last,
        company_name=company,
        email=email or f"noemail+{cust_num.lower()}@import.local",
        customer_type=Customer.TYPE_MARKETPLACE,
        source='woocommerce',
        created_by=user,
    )


# ── Order import ──────────────────────────────────────────────────────────────

def _import_single_wc_order(channel, wc_order: dict, user) -> str:
    """
    Import one WooCommerce order into the ERP.
    Returns 'created', 'duplicate', or raises on unrecoverable error.
    """
    from .models import MarketplaceOrder
    from sales.models import SalesOrder, SalesOrderItem

    wc_id = str(wc_order['id'])

    # ── Duplicate check ──────────────────────────────────────────────────────
    existing = MarketplaceOrder.objects.filter(
        channel=channel, external_order_id=wc_id
    ).first()
    if existing:
        if existing.status == MarketplaceOrder.STATUS_IMPORTED and existing.sales_order_id:
            if SalesOrder.objects.filter(pk=existing.sales_order_id).exists():
                return 'duplicate'
        elif existing.status == MarketplaceOrder.STATUS_IMPORTED:
            return 'duplicate'
        # If failed or pending, fall through and re-attempt

    with transaction.atomic():
        billing = wc_order.get('billing') or {}
        shipping = wc_order.get('shipping') or {}
        # WC sometimes sends empty shipping — fall back to billing
        if not shipping.get('address_1') and not shipping.get('postcode'):
            shipping = billing
        line_items = wc_order.get('line_items') or []

        customer = _find_or_create_customer(billing, user)

        # WC status → ERP payment_status
        wc_status = wc_order.get('status', 'pending')
        payment_status = (
            SalesOrder.PAYMENT_STATUS_PAID
            if wc_status in ('processing', 'completed', 'on-hold')
            else SalesOrder.PAYMENT_STATUS_UNPAID
        )

        ship_name = (
            f"{(shipping.get('first_name') or '').strip()} "
            f"{(shipping.get('last_name') or '').strip()}"
        ).strip() or (
            f"{(billing.get('first_name') or '').strip()} "
            f"{(billing.get('last_name') or '').strip()}"
        ).strip()

        bill_name = (
            f"{(billing.get('first_name') or '').strip()} "
            f"{(billing.get('last_name') or '').strip()}"
        ).strip()

        # Use WC-provided totals directly (authoritative)
        subtotal = sum(
            _safe_decimal(li.get('subtotal', '0')) for li in line_items
        )

        so = SalesOrder.objects.create(
            channel='woocommerce',
            external_order_id=wc_id,
            marketplace_order_id=str(wc_order.get('number', wc_id)),
            customer=customer,
            status=SalesOrder.STATUS_CONFIRMED,
            payment_status=payment_status,
            # Shipping address
            ship_to_name=ship_name,
            ship_to_company=(shipping.get('company') or '').strip(),
            ship_to_address1=(shipping.get('address_1') or '').strip(),
            ship_to_address2=(shipping.get('address_2') or '').strip(),
            ship_to_city=(shipping.get('city') or '').strip(),
            ship_to_postcode=(shipping.get('postcode') or '').strip(),
            ship_to_country=(shipping.get('country') or 'GB').strip(),
            ship_to_phone=(billing.get('phone') or '').strip(),
            ship_to_email=(billing.get('email') or '').strip(),
            # Billing address
            bill_to_name=bill_name,
            bill_to_company=(billing.get('company') or '').strip(),
            bill_to_address1=(billing.get('address_1') or '').strip(),
            bill_to_city=(billing.get('city') or '').strip(),
            bill_to_postcode=(billing.get('postcode') or '').strip(),
            bill_to_country=(billing.get('country') or 'GB').strip(),
            # Financials — use WC totals, not recalculated
            subtotal=subtotal,
            discount_amount=_safe_decimal(wc_order.get('discount_total', '0')),
            shipping_cost=_safe_decimal(wc_order.get('shipping_total', '0')),
            vat_amount=_safe_decimal(wc_order.get('total_tax', '0')),
            total_value=_safe_decimal(wc_order.get('total', '0')),
            currency=(wc_order.get('currency') or 'GBP').upper(),
            notes=(wc_order.get('customer_note') or '').strip(),
            created_by=user,
        )

        # ── Line items ───────────────────────────────────────────────────────
        for li in line_items:
            wc_sku = (li.get('sku') or '').strip()
            wc_product_id = li.get('product_id')
            product = _match_product(wc_sku, 'woocommerce')

            # Auto-register ChannelListing so future stock pushes know the WC product ID
            if product and wc_product_id:
                _ensure_channel_listing(product, 'woocommerce', str(wc_product_id), wc_sku)

            SalesOrderItem.objects.create(
                order=so,
                product=product,
                sku=wc_sku or (product.sku if product else f"WC-{wc_product_id or '?'}"),
                title=(li.get('name') or '').strip(),
                quantity=max(1, int(li.get('quantity') or 1)),
                unit_price=_safe_decimal(li.get('price', '0')),
                vat_rate=Decimal('20.00'),
                buy_price_at_time=product.buy_price if product else Decimal('0.00'),
            )

        # ── Stage record ─────────────────────────────────────────────────────
        MarketplaceOrder.objects.update_or_create(
            channel=channel,
            external_order_id=wc_id,
            defaults={
                'external_order_number': str(wc_order.get('number', wc_id)),
                'raw_data': wc_order,
                'status': MarketplaceOrder.STATUS_IMPORTED,
                'sales_order': so,
                'imported_at': timezone.now(),
                'error_message': '',
            },
        )

    return 'created'


def import_woocommerce_orders(channel, user) -> dict:
    """
    Pull WooCommerce orders (processing, on-hold, pending) and import them.
    Returns: {created, duplicate, failed, processed}
    """
    from .integrations.woocommerce import WooCommerceError
    from .models import MarketplaceOrder

    client = _get_wc_client(channel)

    # Go back 1 h from last sync to catch any edge cases
    after = None
    if channel.last_synced:
        after = (channel.last_synced - timedelta(hours=1)).isoformat()

    stats = {'created': 0, 'duplicate': 0, 'failed': 0, 'processed': 0}
    page = 1
    target_statuses = ['processing', 'on-hold', 'pending']

    while True:
        try:
            orders = client.get_orders(
                statuses=target_statuses, page=page, per_page=100, after=after
            )
        except WooCommerceError as exc:
            if page == 1:
                raise  # Nothing fetched yet — propagate to log as failure
            logger.warning("WC order fetch stopped at page %d: %s", page, exc)
            break

        if not orders:
            break

        for wc_order in orders:
            stats['processed'] += 1
            wc_id = str(wc_order.get('id', ''))
            try:
                result = _import_single_wc_order(channel, wc_order, user)
                stats[result] += 1  # 'created' or 'duplicate'
            except Exception as exc:
                logger.error(
                    "Failed to import WC order %s: %s", wc_id, exc, exc_info=True
                )
                stats['failed'] += 1
                # Record the failure in the staging table
                try:
                    MarketplaceOrder.objects.update_or_create(
                        channel=channel,
                        external_order_id=wc_id,
                        defaults={
                            'external_order_number': str(wc_order.get('number', wc_id)),
                            'raw_data': wc_order,
                            'status': MarketplaceOrder.STATUS_FAILED,
                            'error_message': str(exc)[:500],
                        },
                    )
                except Exception:
                    pass

        if len(orders) < 100:
            break
        page += 1

    return stats


# ── Stock push ────────────────────────────────────────────────────────────────

def push_stock_to_woocommerce(channel) -> dict:
    """
    For every active ChannelListing with a WC product ID, push qty_available
    (on_hand − reserved across all locations) to WooCommerce.
    Returns: {success, failed, skipped}
    """
    from django.db.models import Sum
    from products.models import ChannelListing, StockLevel
    from .integrations.woocommerce import WooCommerceError

    client = _get_wc_client(channel)

    listings = (
        ChannelListing.objects
        .filter(channel='woocommerce', is_active=True)
        .exclude(external_id='')
        .select_related('product')
    )

    stats = {'success': 0, 'failed': 0, 'skipped': 0}

    for listing in listings:
        # Validate the external_id is numeric (WC product ID)
        try:
            wc_product_id = int(listing.external_id)
        except (ValueError, TypeError):
            stats['skipped'] += 1
            continue

        # Sum stock across all locations
        agg = StockLevel.objects.filter(product=listing.product).aggregate(
            on_hand=Sum('qty_on_hand'),
            reserved=Sum('qty_reserved'),
        )
        on_hand = int(agg['on_hand'] or 0)
        reserved = int(agg['reserved'] or 0)
        available = max(0, on_hand - reserved)

        try:
            client.update_product_stock(wc_product_id, available)
            listing.last_synced = timezone.now()
            listing.save(update_fields=['last_synced'])
            stats['success'] += 1
            logger.debug(
                "Stock push OK: %s → WC#%d qty=%d",
                listing.product.sku, wc_product_id, available,
            )
        except WooCommerceError as exc:
            logger.error(
                "Stock push FAILED: %s → WC#%d: %s",
                listing.product.sku, wc_product_id, exc,
            )
            stats['failed'] += 1

    return stats


# ── Tracking push ─────────────────────────────────────────────────────────────

def push_tracking_to_woocommerce(channel, sales_order) -> dict:
    """
    After dispatch, add a customer-visible note to the WC order with the
    tracking number and update the WC order status to 'completed'.
    Returns: {success: bool, tracking: str, wc_order_id: int, error: str}
    """
    from .models import MarketplaceOrder
    from shipping.models import Shipment
    from .integrations.woocommerce import WooCommerceError

    mp_order = MarketplaceOrder.objects.filter(
        channel=channel, sales_order=sales_order
    ).first()
    if not mp_order:
        return {
            'success': False,
            'error': 'This order was not imported from WooCommerce (no marketplace record found).',
        }

    shipment = (
        sales_order.shipments
        .filter(tracking_number__gt='')
        .order_by('-created_at')
        .first()
    )
    if not shipment:
        return {
            'success': False,
            'error': 'No dispatched shipment with a tracking number found on this order.',
        }

    try:
        wc_order_id = int(mp_order.external_order_id)
    except (ValueError, TypeError):
        return {'success': False, 'error': 'Invalid WooCommerce order ID in marketplace record.'}

    client = _get_wc_client(channel)
    courier_label = dict(Shipment.COURIER_CHOICES).get(shipment.courier, shipment.courier)
    tracking_url = shipment.tracking_link

    note_lines = [
        f"Your order has been dispatched via {courier_label}.",
        f"Tracking number: {shipment.tracking_number}",
    ]
    if tracking_url:
        note_lines.append(f"Track your parcel: {tracking_url}")
    note = '\n'.join(note_lines)

    try:
        client.add_order_note(wc_order_id, note, customer_note=True)
        client.update_order(wc_order_id, {'status': 'completed'})
        logger.info(
            "Tracking pushed: WC#%d tracking=%s", wc_order_id, shipment.tracking_number
        )
        return {
            'success': True,
            'tracking': shipment.tracking_number,
            'wc_order_id': wc_order_id,
        }
    except WooCommerceError as exc:
        logger.error("Tracking push FAILED for WC#%d: %s", wc_order_id, exc)
        return {'success': False, 'error': str(exc)}
