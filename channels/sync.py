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


# ══════════════════════════════════════════════════════════════════════════════
# eBay sync
# eBay item types stored in ChannelListing:
#   simple product : external_id = legacyItemId,         parent_id = ""
#   variation      : external_id = legacyVariationId,    parent_id = legacyItemId
#   inventory sku  : external_sku = eBay inventory SKU (for Inventory API stock push)
# ══════════════════════════════════════════════════════════════════════════════

def _get_ebay_client(channel):
    """Build EbayClient from channel.api_credentials. Raises ValueError on bad config."""
    from .integrations.ebay import EbayClient, EbayError
    try:
        return EbayClient.from_channel(channel)
    except EbayError as exc:
        raise ValueError(str(exc)) from exc


def _find_or_create_ebay_customer(ship_to: dict, buyer: dict, user):
    """Find an existing customer by email, or create a new marketplace customer."""
    from customers.models import Customer
    import random as _random

    email = (
        ship_to.get('email')
        or buyer.get('buyerRegistrationAddress', {}).get('email', '')
        or ''
    ).strip().lower()

    if email:
        customer = Customer.objects.filter(email__iexact=email).first()
        if customer:
            return customer

    full_name = ship_to.get('fullName', buyer.get('username', 'eBay Buyer'))
    name_parts = full_name.split(' ', 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else ''

    ts = timezone.now().strftime('%y%m%d%H%M%S')
    cust_num = f'EB{ts}'
    attempts = 0
    while Customer.objects.filter(customer_number=cust_num).exists():
        cust_num = f'EB{ts}{_random.randint(0, 999):03d}'
        attempts += 1
        if attempts > 50:
            raise RuntimeError('Could not generate unique eBay customer number')

    return Customer.objects.create(
        customer_number=cust_num,
        first_name=first_name,
        last_name=last_name,
        email=email or f'noemail+{cust_num.lower()}@import.local',
        phone=ship_to.get('primaryPhone', {}).get('phoneNumber', ''),
        customer_type=Customer.TYPE_MARKETPLACE,
        source='ebay',
        created_by=user,
    )


def _import_single_ebay_order(channel, ebay_order: dict, user) -> str:
    """
    Import a single eBay order from the Fulfillment API response.
    Returns 'created' | 'duplicate' or raises on error.
    """
    from .models import MarketplaceOrder
    from sales.models import SalesOrder, SalesOrderItem

    order_id = ebay_order['orderId']
    legacy_order_id = ebay_order.get('legacyOrderId', order_id)

    # Duplicate guard
    existing = MarketplaceOrder.objects.filter(
        channel=channel, external_order_id=order_id
    ).first()
    if existing:
        if (
            existing.status == MarketplaceOrder.STATUS_IMPORTED
            and existing.sales_order_id
            and SalesOrder.objects.filter(pk=existing.sales_order_id).exists()
        ):
            return 'duplicate'
        elif existing.status == MarketplaceOrder.STATUS_IMPORTED:
            return 'duplicate'

    # Resolve shipping address from fulfillmentStartInstructions
    instructions = ebay_order.get('fulfillmentStartInstructions', [])
    ship_to = {}
    if instructions:
        ship_to = instructions[0].get('shippingStep', {}).get('shipTo', {})

    contact_addr = ship_to.get('contactAddress', {})
    buyer = ebay_order.get('buyer', {})

    with transaction.atomic():
        customer = _find_or_create_ebay_customer(ship_to, buyer, user)

        # Pricing
        pricing = ebay_order.get('pricingSummary', {})
        subtotal_val = pricing.get('priceSubtotal', {}).get('value', '0')
        shipping_val = pricing.get('deliveryCost', {}).get('value', '0')
        total_val = pricing.get('total', {}).get('value', '0')
        currency = pricing.get('total', {}).get('currency', 'GBP')

        subtotal = _safe_decimal(subtotal_val)
        shipping_cost = _safe_decimal(shipping_val)
        total_value = _safe_decimal(total_val)

        # Payment status
        payments = ebay_order.get('paymentSummary', {}).get('payments', [])
        is_paid = any(p.get('paymentStatus') == 'PAID' for p in payments)
        payment_status = (
            SalesOrder.PAYMENT_STATUS_PAID if is_paid else SalesOrder.PAYMENT_STATUS_UNPAID
        )

        full_name = ship_to.get('fullName', buyer.get('username', 'eBay Buyer'))
        addr1 = contact_addr.get('addressLine1', '')
        addr2 = contact_addr.get('addressLine2', '')
        city = contact_addr.get('city', '')
        state = contact_addr.get('stateOrProvince', '')
        postcode = contact_addr.get('postalCode', '')
        country = contact_addr.get('countryCode', 'GB')
        phone = ship_to.get('primaryPhone', {}).get('phoneNumber', '')
        email = (
            ship_to.get('email')
            or buyer.get('buyerRegistrationAddress', {}).get('email', '')
        )

        so = SalesOrder.objects.create(
            channel='ebay',
            external_order_id=order_id,
            marketplace_order_id=legacy_order_id,
            customer=customer,
            status=SalesOrder.STATUS_CONFIRMED,
            payment_status=payment_status,
            ship_to_name=full_name,
            ship_to_company='',
            ship_to_address1=addr1,
            ship_to_address2=addr2,
            ship_to_city=city,
            ship_to_postcode=postcode,
            ship_to_country=country,
            ship_to_phone=phone,
            ship_to_email=email or '',
            bill_to_name=full_name,
            bill_to_company='',
            bill_to_address1=addr1,
            bill_to_city=city,
            bill_to_postcode=postcode,
            bill_to_country=country,
            subtotal=subtotal,
            shipping_cost=shipping_cost,
            total_value=total_value,
            currency=currency,
            notes=f'eBay Order: {order_id}\nBuyer: {buyer.get("username", "")}',
            created_by=user,
        )

        # Line items
        for li in ebay_order.get('lineItems', []):
            sku = (li.get('sku') or '').strip()
            legacy_item_id = li.get('legacyItemId', '')
            legacy_var_id = li.get('legacyVariationId') or ''
            line_item_id = li.get('lineItemId', '')
            title = (li.get('title') or '').strip()
            qty = max(1, int(li.get('quantity') or 1))
            unit_price = _safe_decimal(li.get('lineItemCost', {}).get('value', '0'))

            product = _match_product(sku, 'ebay') if sku else None

            if product and legacy_item_id:
                _ensure_channel_listing(
                    product=product,
                    channel_type='ebay',
                    wc_product_id=legacy_item_id,
                    wc_sku=sku,
                    wc_variation_id=legacy_var_id if legacy_var_id else None,
                )

            fallback_sku = (
                sku
                or (f'EBAY-VAR-{legacy_var_id}' if legacy_var_id else f'EBAY-{legacy_item_id}')
                or f'EBAY-LINE-{line_item_id}'
            )

            SalesOrderItem.objects.create(
                order=so,
                product=product,
                sku=sku or (product.sku if product else fallback_sku),
                title=title,
                quantity=qty,
                unit_price=unit_price,
                vat_rate=Decimal('20.00'),
                buy_price_at_time=product.buy_price if product else Decimal('0.00'),
            )

        MarketplaceOrder.objects.update_or_create(
            channel=channel,
            external_order_id=order_id,
            defaults={
                'external_order_number': legacy_order_id,
                'raw_data': ebay_order,
                'status': MarketplaceOrder.STATUS_IMPORTED,
                'sales_order': so,
                'imported_at': timezone.now(),
                'error_message': '',
            },
        )

    return 'created'


def import_ebay_orders(channel, user) -> dict:
    """
    Pull eBay orders from the Fulfillment API and import them into ERP.
    Paginates automatically.
    Returns: {created, duplicate, failed, processed}
    """
    from .integrations.ebay import EbayError
    from .models import MarketplaceOrder

    client = _get_ebay_client(channel)

    after = None
    if channel.last_synced:
        after = (channel.last_synced - timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%SZ')

    stats = {'created': 0, 'duplicate': 0, 'failed': 0, 'processed': 0}
    limit = 50
    offset = 0

    while True:
        try:
            resp = client.get_orders(after=after, limit=limit, offset=offset)
        except EbayError as exc:
            if offset == 0:
                raise
            logger.warning('eBay order fetch stopped at offset %d: %s', offset, exc)
            break

        orders = resp.get('orders') or []
        total = int(resp.get('total', 0))

        for ebay_order in orders:
            stats['processed'] += 1
            order_id = ebay_order.get('orderId', '')
            try:
                result = _import_single_ebay_order(channel, ebay_order, user)
                stats[result] = stats.get(result, 0) + 1
            except Exception as exc:
                logger.error('Failed to import eBay order %s: %s', order_id, exc, exc_info=True)
                stats['failed'] += 1
                try:
                    MarketplaceOrder.objects.update_or_create(
                        channel=channel,
                        external_order_id=order_id,
                        defaults={
                            'external_order_number': ebay_order.get('legacyOrderId', order_id),
                            'raw_data': ebay_order,
                            'status': MarketplaceOrder.STATUS_FAILED,
                            'error_message': str(exc)[:500],
                        },
                    )
                except Exception:
                    pass

        offset += len(orders)
        if offset >= total or not orders:
            break

    return stats


def push_stock_to_ebay(channel, dry_run: bool = False) -> dict:
    """
    Push qty_available to eBay for all CONFIRMED (is_active=True) ChannelListings.

    Uses the Inventory API (PUT /inventory_item/{sku}).  The ChannelListing must
    have external_sku set to the eBay inventory SKU.

    dry_run=True: calculates what would be pushed but makes NO eBay API calls.
                  Returns preview list in stats['preview'].

    Important: Only listings managed through the eBay Inventory API can be updated
    this way. Listings created via the traditional "Sell Your Item" flow will return
    a 404 or 422 from the Inventory API — they are counted in stats['legacy'].

    Returns: {success, failed, skipped, not_confirmed, legacy, dry_run, errors, preview}
    """
    from django.db.models import Sum
    from products.models import ChannelListing, StockLevel
    from .integrations.ebay import EbayError

    confirmed = (
        ChannelListing.objects
        .filter(channel='ebay', is_active=True)
        .exclude(external_sku='')
        .select_related('product')
    )
    not_confirmed_count = (
        ChannelListing.objects
        .filter(channel='ebay', is_active=False)
        .count()
    )
    id_only_count = ChannelListing.objects.filter(
        channel='ebay', is_active=True, external_sku=''
    ).count()

    stats = {
        'success': 0, 'failed': 0, 'skipped': id_only_count,
        'not_confirmed': not_confirmed_count,
        'legacy': 0,
        'dry_run': dry_run,
        'errors': [],
        'preview': [],
    }

    if dry_run:
        # No API calls — just show what would be pushed
        for listing in confirmed:
            agg = StockLevel.objects.filter(product=listing.product).aggregate(
                on_hand=Sum('qty_on_hand'),
                reserved=Sum('qty_reserved'),
            )
            available = max(0, int(agg['on_hand'] or 0) - int(agg['reserved'] or 0))
            stats['preview'].append({
                'erp_sku': listing.product.sku,
                'ebay_sku': listing.external_sku,
                'qty': available,
            })
            stats['success'] += 1
        return stats

    client = _get_ebay_client(channel)

    for listing in confirmed:
        agg = StockLevel.objects.filter(product=listing.product).aggregate(
            on_hand=Sum('qty_on_hand'),
            reserved=Sum('qty_reserved'),
        )
        available = max(0, int(agg['on_hand'] or 0) - int(agg['reserved'] or 0))
        try:
            # Probe first: if item doesn't exist in Inventory API, count as legacy
            existing = client.get_inventory_item(listing.external_sku)
            if existing is None:
                logger.warning(
                    'eBay stock: SKU %s (%s) not in Inventory API — legacy listing, skipping.',
                    listing.external_sku, listing.product.sku,
                )
                stats['legacy'] += 1
                stats['errors'].append({
                    'erp_sku': listing.product.sku,
                    'ebay_sku': listing.external_sku,
                    'error': (
                        'Not found in eBay Inventory API. This listing was probably created via '
                        'Sell Your Item (legacy flow) and cannot be updated via the Inventory API. '
                        'Re-list it using the eBay Inventory API, or update stock manually on eBay.'
                    ),
                    'legacy': True,
                })
                continue

            client.update_inventory_quantity(listing.external_sku, available)
            listing.last_synced = timezone.now()
            listing.save(update_fields=['last_synced'])
            stats['success'] += 1
            logger.info(
                'eBay stock OK: erp=%s ebay_sku=%s qty=%d',
                listing.product.sku, listing.external_sku, available,
            )
        except EbayError as exc:
            errmsg = (
                f'HTTP {exc.status_code}: {exc}' if exc.status_code else str(exc)
            )
            logger.error(
                'eBay stock push FAILED: erp=%s ebay_sku=%s — %s',
                listing.product.sku, listing.external_sku, errmsg,
            )
            stats['failed'] += 1
            stats['errors'].append({
                'erp_sku': listing.product.sku,
                'ebay_sku': listing.external_sku,
                'error': errmsg,
                'legacy': False,
            })

    return stats


# ══════════════════════════════════════════════════════════════════════════════
# Amazon SP-API sync
# ChannelListing storage for Amazon:
#   external_id  = AmazonOrderId (for order import correlation)
#   external_sku = Seller SKU (for stock push via Listings Items API)
# ══════════════════════════════════════════════════════════════════════════════

def _get_amazon_client(channel):
    """Build AmazonClient from channel.api_credentials. Raises ValueError on bad config."""
    from .integrations.amazon import AmazonClient, AmazonError
    try:
        return AmazonClient.from_channel(channel)
    except AmazonError as exc:
        raise ValueError(str(exc)) from exc


def _find_or_create_amazon_customer(order: dict, user):
    """Find customer by email or create a new marketplace customer from Amazon order data."""
    from customers.models import Customer
    import random as _random

    addr = order.get('ShippingAddress', {})
    buyer_info = order.get('BuyerInfo', {})
    email = (buyer_info.get('BuyerEmail') or '').strip().lower()

    if email:
        customer = Customer.objects.filter(email__iexact=email).first()
        if customer:
            return customer

    full_name = (addr.get('Name') or buyer_info.get('BuyerName') or 'Amazon Buyer').strip()
    name_parts = full_name.split(' ', 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else ''

    ts = timezone.now().strftime('%y%m%d%H%M%S')
    cust_num = f'AMZ{ts}'
    attempts = 0
    while Customer.objects.filter(customer_number=cust_num).exists():
        cust_num = f'AMZ{ts}{_random.randint(0, 999):03d}'
        attempts += 1
        if attempts > 50:
            raise RuntimeError('Could not generate unique Amazon customer number')

    return Customer.objects.create(
        customer_number=cust_num,
        first_name=first_name,
        last_name=last_name,
        email=email or f'noemail+{cust_num.lower()}@import.local',
        phone=(addr.get('Phone') or '').strip(),
        customer_type=Customer.TYPE_MARKETPLACE,
        source='amazon',
        created_by=user,
    )


def _import_single_amazon_order(channel, order: dict, client, user) -> str:
    """
    Import a single Amazon order.
    Returns 'created' | 'duplicate' or raises on error.
    """
    from .models import MarketplaceOrder
    from sales.models import SalesOrder, SalesOrderItem

    amazon_order_id = order['AmazonOrderId']

    existing = MarketplaceOrder.objects.filter(
        channel=channel, external_order_id=amazon_order_id
    ).first()
    if existing:
        if (
            existing.status == MarketplaceOrder.STATUS_IMPORTED
            and existing.sales_order_id
            and SalesOrder.objects.filter(pk=existing.sales_order_id).exists()
        ):
            return 'duplicate'
        elif existing.status == MarketplaceOrder.STATUS_IMPORTED:
            return 'duplicate'

    # Fetch line items from SP-API
    items = client.get_order_items(amazon_order_id)

    addr = order.get('ShippingAddress', {})

    with transaction.atomic():
        customer = _find_or_create_amazon_customer(order, user)

        order_total = _safe_decimal(
            (order.get('OrderTotal') or {}).get('Amount', '0')
        )
        currency = (order.get('OrderTotal') or {}).get('CurrencyCode', 'GBP')

        subtotal = sum(
            _safe_decimal((item.get('ItemPrice') or {}).get('Amount', '0'))
            for item in items
        )
        shipping_cost = sum(
            _safe_decimal((item.get('ShippingPrice') or {}).get('Amount', '0'))
            for item in items
        )

        payment_status = (
            SalesOrder.PAYMENT_STATUS_PAID
            if order.get('PaymentStatus') in ('PaymentComplete',)
            or order.get('OrderStatus') in ('Unshipped', 'PartiallyShipped', 'Shipped')
            else SalesOrder.PAYMENT_STATUS_UNPAID
        )

        full_name = (addr.get('Name') or customer.first_name + ' ' + customer.last_name).strip()
        addr1 = (addr.get('AddressLine1') or '').strip()
        addr2 = ' '.join(filter(None, [
            (addr.get('AddressLine2') or '').strip(),
            (addr.get('AddressLine3') or '').strip(),
        ]))
        city = (addr.get('City') or '').strip()
        postcode = (addr.get('PostalCode') or '').strip()
        country = (addr.get('CountryCode') or 'GB').strip()
        phone = (addr.get('Phone') or '').strip()

        so = SalesOrder.objects.create(
            channel='amazon',
            external_order_id=amazon_order_id,
            marketplace_order_id=amazon_order_id,
            customer=customer,
            status=SalesOrder.STATUS_CONFIRMED,
            payment_status=payment_status,
            ship_to_name=full_name,
            ship_to_company='',
            ship_to_address1=addr1,
            ship_to_address2=addr2,
            ship_to_city=city,
            ship_to_postcode=postcode,
            ship_to_country=country,
            ship_to_phone=phone,
            ship_to_email=customer.email,
            bill_to_name=full_name,
            bill_to_company='',
            bill_to_address1=addr1,
            bill_to_city=city,
            bill_to_postcode=postcode,
            bill_to_country=country,
            subtotal=subtotal,
            shipping_cost=shipping_cost,
            total_value=order_total or (subtotal + shipping_cost),
            currency=currency,
            notes=f'Amazon Order: {amazon_order_id}',
            created_by=user,
        )

        for item in items:
            seller_sku = (item.get('SellerSKU') or '').strip()
            asin = (item.get('ASIN') or '').strip()
            title = (item.get('Title') or '').strip()
            qty = max(1, int(item.get('QuantityOrdered') or 1))
            order_item_id = item.get('OrderItemId', '')

            item_price = _safe_decimal(
                (item.get('ItemPrice') or {}).get('Amount', '0')
            )
            unit_price = (item_price / qty) if qty else item_price

            product = _match_product(seller_sku, 'amazon') if seller_sku else None

            if product and seller_sku:
                ChannelListing_mod = None
                try:
                    from products.models import ChannelListing
                    ChannelListing_mod = ChannelListing
                except ImportError:
                    pass
                if ChannelListing_mod:
                    ChannelListing_mod.objects.get_or_create(
                        product=product,
                        channel='amazon',
                        external_id=asin or seller_sku,
                        defaults={
                            'external_sku': seller_sku,
                            'parent_id': '',
                            'is_active': False,
                        },
                    )

            fallback_sku = seller_sku or (f'AMZN-{asin}' if asin else f'AMZN-{order_item_id}')

            SalesOrderItem.objects.create(
                order=so,
                product=product,
                sku=seller_sku or (product.sku if product else fallback_sku),
                title=title,
                quantity=qty,
                unit_price=unit_price,
                vat_rate=Decimal('20.00'),
                buy_price_at_time=product.buy_price if product else Decimal('0.00'),
            )

        MarketplaceOrder.objects.update_or_create(
            channel=channel,
            external_order_id=amazon_order_id,
            defaults={
                'external_order_number': amazon_order_id,
                'raw_data': {**order, '_items': items},
                'status': MarketplaceOrder.STATUS_IMPORTED,
                'sales_order': so,
                'imported_at': timezone.now(),
                'error_message': '',
            },
        )

    return 'created'


def import_amazon_orders(channel, user) -> dict:
    """
    Pull FBM orders from Amazon SP-API and import them into ERP.
    Returns: {created, duplicate, failed, processed}
    """
    from .integrations.amazon import AmazonError
    from .models import MarketplaceOrder

    client = _get_amazon_client(channel)

    created_after = None
    if channel.last_synced:
        created_after = (channel.last_synced - timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%SZ')

    stats = {'created': 0, 'duplicate': 0, 'failed': 0, 'processed': 0}

    try:
        orders = client.get_orders(created_after=created_after)
    except AmazonError as exc:
        raise ValueError(f"Amazon order fetch failed: {exc}") from exc

    for order in orders:
        stats['processed'] += 1
        amazon_order_id = order.get('AmazonOrderId', '')
        try:
            result = _import_single_amazon_order(channel, order, client, user)
            stats[result] = stats.get(result, 0) + 1
        except Exception as exc:
            logger.error('Failed to import Amazon order %s: %s', amazon_order_id, exc, exc_info=True)
            stats['failed'] += 1
            try:
                MarketplaceOrder.objects.update_or_create(
                    channel=channel,
                    external_order_id=amazon_order_id,
                    defaults={
                        'external_order_number': amazon_order_id,
                        'raw_data': order,
                        'status': MarketplaceOrder.STATUS_FAILED,
                        'error_message': str(exc)[:500],
                    },
                )
            except Exception:
                pass

    return stats


def push_stock_to_amazon(channel, dry_run: bool = False) -> dict:
    """
    Push qty_available to Amazon for all CONFIRMED (is_active=True) ChannelListings.
    Uses the Listings Items API (PATCH fulfillment_availability).

    dry_run=True: calculates what would be pushed but makes NO Amazon API calls.
                  Returns preview list in stats['preview'].

    Returns: {success, failed, skipped, not_confirmed, dry_run, errors, preview}
    """
    from django.db.models import Sum
    from products.models import ChannelListing, StockLevel
    from .integrations.amazon import AmazonError

    confirmed = (
        ChannelListing.objects
        .filter(channel='amazon', is_active=True)
        .exclude(external_sku='')
        .select_related('product')
    )
    not_confirmed_count = (
        ChannelListing.objects
        .filter(channel='amazon', is_active=False)
        .count()
    )
    id_only_count = ChannelListing.objects.filter(
        channel='amazon', is_active=True, external_sku=''
    ).count()

    stats = {
        'success': 0, 'failed': 0, 'skipped': id_only_count,
        'not_confirmed': not_confirmed_count,
        'dry_run': dry_run,
        'errors': [],
        'preview': [],
    }

    if dry_run:
        for listing in confirmed:
            agg = StockLevel.objects.filter(product=listing.product).aggregate(
                on_hand=Sum('qty_on_hand'),
                reserved=Sum('qty_reserved'),
            )
            available = max(0, int(agg['on_hand'] or 0) - int(agg['reserved'] or 0))
            stats['preview'].append({
                'erp_sku': listing.product.sku,
                'amazon_sku': listing.external_sku,
                'qty': available,
            })
            stats['success'] += 1
        return stats

    client = _get_amazon_client(channel)

    for listing in confirmed:
        agg = StockLevel.objects.filter(product=listing.product).aggregate(
            on_hand=Sum('qty_on_hand'),
            reserved=Sum('qty_reserved'),
        )
        available = max(0, int(agg['on_hand'] or 0) - int(agg['reserved'] or 0))
        try:
            client.update_listing_quantity(listing.external_sku, available)
            listing.last_synced = timezone.now()
            listing.save(update_fields=['last_synced'])
            stats['success'] += 1
            logger.info(
                'Amazon stock OK: erp=%s seller_sku=%s qty=%d',
                listing.product.sku, listing.external_sku, available,
            )
        except AmazonError as exc:
            errmsg = f'HTTP {exc.status_code}: {exc}' if exc.status_code else str(exc)
            logger.error(
                'Amazon stock push FAILED: erp=%s seller_sku=%s — %s',
                listing.product.sku, listing.external_sku, errmsg,
            )
            stats['failed'] += 1
            stats['errors'].append({
                'erp_sku': listing.product.sku,
                'amazon_sku': listing.external_sku,
                'error': errmsg,
            })

    return stats


def push_tracking_to_amazon(
    channel,
    sales_order,
    tracking_number: str = None,
    courier_override: str = None,
) -> dict:
    """
    Confirm shipment on Amazon via the Orders API (confirm_shipment).
    Reads tracking from the most recent Shipment if not overridden.
    Returns: {success: bool, tracking: str, order_id: str, error: str}
    """
    from .models import MarketplaceOrder
    from shipping.models import Shipment
    from .integrations.amazon import AmazonError, normalise_carrier

    mp_order = MarketplaceOrder.objects.filter(
        channel=channel, sales_order=sales_order
    ).first()
    if not mp_order:
        return {'success': False, 'error': 'This order was not imported from this Amazon channel.'}

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

    if not resolved_tracking:
        return {
            'success': False,
            'error': (
                'No tracking number available. Dispatch the order with a tracking number first, '
                'or enter one in the override field.'
            ),
        }

    carrier_code = normalise_carrier(resolved_courier)
    amazon_order_id = mp_order.external_order_id

    # Build order items list from raw stored data
    raw = mp_order.raw_data or {}
    stored_items = raw.get('_items') or []
    order_items = [
        {
            'order_item_id': item['OrderItemId'],
            'quantity': int(item.get('QuantityOrdered') or 1),
        }
        for item in stored_items
        if item.get('OrderItemId')
    ]

    if not order_items:
        return {
            'success': False,
            'error': 'No order items found in stored Amazon order data. Cannot confirm shipment.',
        }

    try:
        client = _get_amazon_client(channel)
        client.confirm_shipment(
            amazon_order_id=amazon_order_id,
            tracking_number=resolved_tracking,
            carrier_code=carrier_code,
            order_items=order_items,
        )
        return {
            'success': True,
            'tracking': resolved_tracking,
            'carrier': carrier_code,
            'order_id': amazon_order_id,
        }
    except (AmazonError, ValueError) as exc:
        logger.error('Amazon tracking push FAILED for %s: %s', amazon_order_id, exc)
        return {'success': False, 'error': str(exc)}


def push_tracking_to_ebay(
    channel,
    sales_order,
    tracking_number: str = None,
    courier_override: str = None,
) -> dict:
    """
    Mark an eBay order as shipped by creating a shipping fulfillment record.

    If tracking_number / courier_override are not supplied, reads from the most
    recent Shipment attached to the SalesOrder.

    Returns: {success: bool, tracking: str, order_id: str, error: str}
    """
    from .models import MarketplaceOrder
    from shipping.models import Shipment
    from .integrations.ebay import EbayError, normalise_carrier

    mp_order = MarketplaceOrder.objects.filter(
        channel=channel, sales_order=sales_order
    ).first()
    if not mp_order:
        return {
            'success': False,
            'error': 'This order was not imported from this eBay channel.',
        }

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

    if not resolved_tracking:
        return {
            'success': False,
            'error': (
                'No tracking number available. Dispatch the order with a tracking number first, '
                'or enter one in the override field.'
            ),
        }

    carrier_code = normalise_carrier(resolved_courier)
    ebay_order_id = mp_order.external_order_id

    # Build line-item list from the raw eBay order stored in MarketplaceOrder.raw_data
    raw = mp_order.raw_data or {}
    line_items = [
        {'lineItemId': str(li['lineItemId']), 'quantity': int(li.get('quantity', 1))}
        for li in raw.get('lineItems', [])
        if li.get('lineItemId')
    ]
    if not line_items:
        return {
            'success': False,
            'error': 'No line items found in stored eBay order data. Cannot create shipping fulfillment.',
        }

    try:
        client = _get_ebay_client(channel)
        client.ship_order(
            order_id=ebay_order_id,
            tracking_number=resolved_tracking,
            carrier_code=carrier_code,
            line_items=line_items,
        )
        logger.info(
            'eBay tracking pushed: order=%s tracking=%s carrier=%s',
            ebay_order_id, resolved_tracking, carrier_code,
        )
        return {
            'success': True,
            'tracking': resolved_tracking,
            'carrier': carrier_code,
            'order_id': ebay_order_id,
        }
    except (EbayError, ValueError) as exc:
        logger.error('eBay tracking push FAILED for %s: %s', ebay_order_id, exc)
        return {'success': False, 'error': str(exc)}
