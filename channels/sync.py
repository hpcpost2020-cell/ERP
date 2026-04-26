"""
Channel synchronisation logic.

All functions are synchronous (no Celery). Call from views for manual syncs;
wire into a management command / cron for automated background syncs later.

WooCommerce product types:
  - simple   : external_id = WC product_id,   parent_id = ""
  - variation: external_id = WC variation_id, parent_id = WC product_id

Stock push is gated by ChannelListing.is_active == True.
Auto-created listings start with is_active=False; the user confirms them in the
SKU Mapping screen before stock syncs.
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
    """Build WooCommerceClient from channel.api_credentials. Raises ValueError if incomplete."""
    from .integrations.woocommerce import WooCommerceClient
    creds = channel.api_credentials or {}
    missing = [k for k in ('store_url', 'consumer_key', 'consumer_secret') if not creds.get(k)]
    if missing:
        raise ValueError(
            f"Channel '{channel.name}' is missing WooCommerce credentials: {', '.join(missing)}. "
            "Configure them on the Credentials tab."
        )
    return WooCommerceClient(
        store_url=creds['store_url'],
        consumer_key=creds['consumer_key'],
        consumer_secret=creds['consumer_secret'],
    )


def _match_product(wc_sku: str, channel_type: str = 'woocommerce'):
    """
    Three-tier SKU matching:
      1. ChannelListing.external_sku  (explicit / confirmed mapping)
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
        .filter(channel=channel_type, external_sku__iexact=sku)
        .select_related('product')
        .first()
    )
    if listing:
        return listing.product

    product = Product.objects.filter(sku__iexact=sku).first()
    if product:
        return product

    return Product.objects.filter(barcode=sku).first()


def _ensure_channel_listing(
    product,
    channel_type: str,
    wc_product_id,
    wc_sku: str,
    wc_variation_id=None,
):
    """
    Auto-register a ChannelListing so the SKU mapping screen surfaces it.
    Sets is_active=False — user must confirm before stock is pushed.
    Does NOT overwrite an existing, user-confirmed listing.
    """
    from products.models import ChannelListing
    if not product:
        return

    if wc_variation_id and int(wc_variation_id or 0) > 0:
        # It's a variation
        ext_id = str(wc_variation_id)
        par_id = str(wc_product_id) if wc_product_id else ''
    else:
        ext_id = str(wc_product_id) if wc_product_id else ''
        par_id = ''

    if not ext_id:
        return

    ChannelListing.objects.get_or_create(
        product=product,
        channel=channel_type,
        external_id=ext_id,
        defaults={
            'external_sku': wc_sku or product.sku,
            'parent_id': par_id,
            'is_active': False,   # user must confirm before stock syncs
        },
    )


def _find_or_create_customer(billing: dict, user):
    """Find customer by email, or create a marketplace customer."""
    from customers.models import Customer
    email = (billing.get('email') or '').strip().lower()

    if email:
        customer = Customer.objects.filter(email__iexact=email).first()
        if customer:
            return customer

    first = (billing.get('first_name') or '').strip()
    last = (billing.get('last_name') or '').strip()
    company = (billing.get('company') or '').strip()

    ts = timezone.now().strftime('%y%m%d%H%M%S')
    cust_num = f"WC{ts}"
    attempts = 0
    while Customer.objects.filter(customer_number=cust_num).exists():
        cust_num = f"WC{ts}{random.randint(0, 999):03d}"
        attempts += 1
        if attempts > 50:
            raise RuntimeError("Could not generate unique customer number")

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
    Import a single WooCommerce order.
    Returns 'created' | 'duplicate' or raises on unrecoverable error.
    Handles both simple and variable products.
    """
    from .models import MarketplaceOrder
    from sales.models import SalesOrder, SalesOrderItem

    wc_id = str(wc_order['id'])

    # ── Duplicate guard ──────────────────────────────────────────────────────
    existing = MarketplaceOrder.objects.filter(
        channel=channel, external_order_id=wc_id
    ).first()
    if existing:
        if existing.status == MarketplaceOrder.STATUS_IMPORTED and existing.sales_order_id:
            if SalesOrder.objects.filter(pk=existing.sales_order_id).exists():
                return 'duplicate'
        elif existing.status == MarketplaceOrder.STATUS_IMPORTED:
            return 'duplicate'

    with transaction.atomic():
        billing = wc_order.get('billing') or {}
        shipping = wc_order.get('shipping') or {}
        if not (shipping.get('address_1') or shipping.get('postcode')):
            shipping = billing
        line_items = wc_order.get('line_items') or []

        customer = _find_or_create_customer(billing, user)

        wc_status = wc_order.get('status', 'pending')
        payment_status = (
            SalesOrder.PAYMENT_STATUS_PAID
            if wc_status in ('processing', 'completed', 'on-hold')
            else SalesOrder.PAYMENT_STATUS_UNPAID
        )

        def _name(*parts):
            return ' '.join(p.strip() for p in parts if p and p.strip())

        ship_name = _name(
            shipping.get('first_name', ''), shipping.get('last_name', '')
        ) or _name(billing.get('first_name', ''), billing.get('last_name', ''))

        subtotal = sum(_safe_decimal(li.get('subtotal', '0')) for li in line_items)

        so = SalesOrder.objects.create(
            channel='woocommerce',
            external_order_id=wc_id,
            marketplace_order_id=str(wc_order.get('number', wc_id)),
            customer=customer,
            status=SalesOrder.STATUS_CONFIRMED,
            payment_status=payment_status,
            ship_to_name=ship_name,
            ship_to_company=(shipping.get('company') or '').strip(),
            ship_to_address1=(shipping.get('address_1') or '').strip(),
            ship_to_address2=(shipping.get('address_2') or '').strip(),
            ship_to_city=(shipping.get('city') or '').strip(),
            ship_to_postcode=(shipping.get('postcode') or '').strip(),
            ship_to_country=(shipping.get('country') or 'GB').strip(),
            ship_to_phone=(billing.get('phone') or '').strip(),
            ship_to_email=(billing.get('email') or '').strip(),
            bill_to_name=_name(billing.get('first_name', ''), billing.get('last_name', '')),
            bill_to_company=(billing.get('company') or '').strip(),
            bill_to_address1=(billing.get('address_1') or '').strip(),
            bill_to_city=(billing.get('city') or '').strip(),
            bill_to_postcode=(billing.get('postcode') or '').strip(),
            bill_to_country=(billing.get('country') or 'GB').strip(),
            subtotal=subtotal,
            discount_amount=_safe_decimal(wc_order.get('discount_total', '0')),
            shipping_cost=_safe_decimal(wc_order.get('shipping_total', '0')),
            vat_amount=_safe_decimal(wc_order.get('total_tax', '0')),
            total_value=_safe_decimal(wc_order.get('total', '0')),
            currency=(wc_order.get('currency') or 'GBP').upper(),
            notes=(wc_order.get('customer_note') or '').strip(),
            created_by=user,
        )

        # ── Line items — handle simple + variable products ────────────────────
        for li in line_items:
            wc_sku = (li.get('sku') or '').strip()
            wc_product_id = li.get('product_id')      # always set
            wc_variation_id = li.get('variation_id')  # 0 or None for simple

            product = _match_product(wc_sku, 'woocommerce')

            # Auto-register ChannelListing (unconfirmed) so it appears in SKU mapping
            if wc_product_id:
                _ensure_channel_listing(
                    product, 'woocommerce',
                    wc_product_id, wc_sku,
                    wc_variation_id=wc_variation_id if wc_variation_id else None,
                )

            # When product not matched, record the WC product_id so the user
            # can map it later. The SalesOrderItem.product=None is intentional.
            fallback_sku = (
                wc_sku
                or (f"WC-VAR-{wc_variation_id}" if wc_variation_id else f"WC-{wc_product_id}")
            )

            SalesOrderItem.objects.create(
                order=so,
                product=product,
                sku=wc_sku or (product.sku if product else fallback_sku),
                title=(li.get('name') or '').strip(),
                quantity=max(1, int(li.get('quantity') or 1)),
                unit_price=_safe_decimal(li.get('price', '0')),
                vat_rate=Decimal('20.00'),
                buy_price_at_time=product.buy_price if product else Decimal('0.00'),
            )

        # ── Staging record ────────────────────────────────────────────────────
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
    Pull WooCommerce orders and import them.
    Returns: {created, duplicate, failed, processed, unmatched_skus}
    """
    from .integrations.woocommerce import WooCommerceError
    from .models import MarketplaceOrder

    client = _get_wc_client(channel)

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
                raise
            logger.warning("WC order fetch stopped at page %d: %s", page, exc)
            break

        if not orders:
            break

        for wc_order in orders:
            stats['processed'] += 1
            wc_id = str(wc_order.get('id', ''))
            try:
                result = _import_single_wc_order(channel, wc_order, user)
                stats[result] = stats.get(result, 0) + 1
            except Exception as exc:
                logger.error("Failed to import WC order %s: %s", wc_id, exc, exc_info=True)
                stats['failed'] += 1
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
    Push qty_available to WooCommerce for all CONFIRMED (is_active=True) listings.
    Handles both simple products and variations.
    Returns: {success, failed, skipped, not_confirmed}
    """
    from django.db.models import Sum
    from products.models import ChannelListing, StockLevel
    from .integrations.woocommerce import WooCommerceError

    client = _get_wc_client(channel)

    # Only confirmed listings — unconfirmed ones need user action in SKU mapping
    confirmed = (
        ChannelListing.objects
        .filter(channel='woocommerce', is_active=True)
        .exclude(external_id='')
        .select_related('product')
    )
    unconfirmed_count = (
        ChannelListing.objects
        .filter(channel='woocommerce', is_active=False)
        .exclude(external_id='')
        .count()
    )

    stats = {
        'success': 0, 'failed': 0, 'skipped': 0,
        'not_confirmed': unconfirmed_count,
    }

    for listing in confirmed:
        agg = StockLevel.objects.filter(product=listing.product).aggregate(
            on_hand=Sum('qty_on_hand'),
            reserved=Sum('qty_reserved'),
        )
        available = max(0, int(agg['on_hand'] or 0) - int(agg['reserved'] or 0))

        try:
            if listing.parent_id:
                # Variable product — push to variation
                client.update_variation_stock(
                    int(listing.parent_id), int(listing.external_id), available
                )
            else:
                # Simple product
                client.update_product_stock(int(listing.external_id), available)

            listing.last_synced = timezone.now()
            listing.save(update_fields=['last_synced'])
            stats['success'] += 1
            logger.debug(
                "Stock OK: %s → WC#%s%s qty=%d",
                listing.product.sku, listing.external_id,
                f" (var of {listing.parent_id})" if listing.parent_id else '',
                available,
            )
        except (ValueError, TypeError) as exc:
            logger.warning("Bad external_id for %s: %s", listing.product.sku, exc)
            stats['skipped'] += 1
        except WooCommerceError as exc:
            logger.error("Stock push FAILED: %s: %s", listing.product.sku, exc)
            stats['failed'] += 1

    return stats


# ── Tracking push ─────────────────────────────────────────────────────────────

def push_tracking_to_woocommerce(
    channel,
    sales_order,
    tracking_number: str = None,
    courier_override: str = None,
    tracking_url_override: str = None,
) -> dict:
    """
    Post a customer-visible tracking note to WooCommerce and mark the order completed.

    tracking_number / courier_override / tracking_url_override are optional overrides;
    if omitted the values are read from the most recent Shipment on the SalesOrder.

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
            'error': 'This order was not imported from this WooCommerce channel.',
        }

    # Resolve tracking details — override wins, then fall back to shipment
    shipment = (
        sales_order.shipments
        .filter(tracking_number__gt='')
        .order_by('-created_at')
        .first()
    )

    resolved_tracking = tracking_number or (shipment.tracking_number if shipment else '')
    resolved_courier = courier_override or (
        dict(Shipment.COURIER_CHOICES).get(shipment.courier, shipment.courier)
        if shipment else ''
    )
    resolved_url = tracking_url_override or (shipment.tracking_link if shipment else '')

    if not resolved_tracking:
        return {
            'success': False,
            'error': (
                'No tracking number available. Dispatch the order with a tracking number first, '
                'or provide one using the override field.'
            ),
        }

    try:
        wc_order_id = int(mp_order.external_order_id)
    except (ValueError, TypeError):
        return {'success': False, 'error': 'Invalid WooCommerce order ID in staging record.'}

    client = _get_wc_client(channel)

    note_lines = []
    if resolved_courier:
        note_lines.append(f"Your order has been dispatched via {resolved_courier}.")
    note_lines.append(f"Tracking number: {resolved_tracking}")
    if resolved_url:
        note_lines.append(f"Track your parcel: {resolved_url}")
    note = '\n'.join(note_lines)

    try:
        client.add_order_note(wc_order_id, note, customer_note=True)
        client.update_order(wc_order_id, {'status': 'completed'})
        logger.info("Tracking pushed: WC#%d tracking=%s", wc_order_id, resolved_tracking)
        return {
            'success': True,
            'tracking': resolved_tracking,
            'courier': resolved_courier,
            'wc_order_id': wc_order_id,
        }
    except WooCommerceError as exc:
        logger.error("Tracking push FAILED for WC#%d: %s", wc_order_id, exc)
        return {'success': False, 'error': str(exc)}
