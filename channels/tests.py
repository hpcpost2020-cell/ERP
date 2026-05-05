"""
Amazon SP-API integration test suite.

All sp_api network calls are mocked — no real credentials needed.
Covers:
  - channels/integrations/amazon.py  (unit tests, no DB)
  - channels/sync.py Amazon functions (Django TestCase, DB required)
"""
import sys
import types
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, SimpleTestCase

# ── Stub sp_api before any import of the amazon module ───────────────────────

def _install_sp_api_stubs():
    """Inject minimal sp_api stubs so tests run without the package installed."""
    if 'sp_api' in sys.modules:
        return  # already installed (real or stub)

    sp_pkg = types.ModuleType('sp_api')

    # sp_api.base
    base = types.ModuleType('sp_api.base')

    class SellingApiException(Exception):
        def __init__(self, message='', amzn_code=None, status_code=None):
            super().__init__(message)
            self.amzn_code = amzn_code
            self.message = message
            self.status_code = status_code

    class _MarketplacesMeta(type):
        def __iter__(cls):
            yield cls.GB
            yield cls.US

    class Marketplaces(metaclass=_MarketplacesMeta):
        GB = MagicMock()
        GB.marketplace_id = 'A1F83G8C2ARO7P'
        US = MagicMock()
        US.marketplace_id = 'ATVPDKIKX0DER'

    base.SellingApiException = SellingApiException
    base.Marketplaces = Marketplaces

    # sp_api.api
    api = types.ModuleType('sp_api.api')
    api.Sellers = MagicMock()
    api.OrdersV0 = MagicMock()
    api.ListingsItems = MagicMock()

    sp_pkg.base = base
    sp_pkg.api = api

    sys.modules['sp_api'] = sp_pkg
    sys.modules['sp_api.base'] = base
    sys.modules['sp_api.api'] = api

    return base, api


_SP_BASE, _SP_APIS = _install_sp_api_stubs()

# Safe to import now
from channels.integrations.amazon import (  # noqa: E402
    AmazonClient,
    AmazonError,
    normalise_carrier,
    UK_MARKETPLACE_ID,
)
from channels.models import Channel, MarketplaceOrder  # noqa: E402

User = get_user_model()


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _client(**kwargs):
    defaults = dict(
        lwa_client_id='client-id',
        lwa_client_secret='client-secret',
        refresh_token='Atzr|refresh',
        seller_id='SELLER1',
        marketplace_id=UK_MARKETPLACE_ID,
    )
    defaults.update(kwargs)
    return AmazonClient(**defaults)


def _amazon_order(order_id='111-222-333', status='Unshipped'):
    return {
        'AmazonOrderId': order_id,
        'OrderStatus': status,
        'OrderTotal': {'Amount': '29.99', 'CurrencyCode': 'GBP'},
        'PaymentStatus': 'PaymentComplete',
        'BuyerInfo': {'BuyerEmail': 'buyer@example.com', 'BuyerName': 'John Smith'},
        'ShippingAddress': {
            'Name': 'John Smith',
            'AddressLine1': '10 Test Street',
            'City': 'London',
            'PostalCode': 'EC1A 1BB',
            'CountryCode': 'GB',
            'Phone': '07700900000',
        },
    }


def _amazon_item(item_id='ITEM1', sku='TEST-SKU', qty=2, price='14.99', asin='B001TEST'):
    return {
        'OrderItemId': item_id,
        'SellerSKU': sku,
        'ASIN': asin,
        'Title': 'Test Widget',
        'QuantityOrdered': qty,
        'ItemPrice': {'Amount': price, 'CurrencyCode': 'GBP'},
        'ShippingPrice': {'Amount': '2.50', 'CurrencyCode': 'GBP'},
    }


def _make_amazon_channel(name='Amazon UK'):
    return Channel.objects.create(
        name=name,
        channel_type=Channel.TYPE_AMAZON,
        api_credentials={
            'lwa_client_id': 'id',
            'lwa_client_secret': 'secret',
            'refresh_token': 'Atzr|token',
            'seller_id': 'SELL1',
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 1. normalise_carrier
# ═══════════════════════════════════════════════════════════════════════════════

class TestNormaliseCarrier(SimpleTestCase):

    def test_known_lowercase(self):
        self.assertEqual(normalise_carrier('royal mail'), 'Royal Mail')

    def test_known_alias_evri(self):
        self.assertEqual(normalise_carrier('evri'), 'Hermes')

    def test_known_alias_rm(self):
        self.assertEqual(normalise_carrier('rm'), 'Royal Mail')

    def test_case_insensitive_dhl(self):
        self.assertEqual(normalise_carrier('DHL'), 'DHL')

    def test_case_insensitive_ups(self):
        self.assertEqual(normalise_carrier('UPS'), 'UPS')

    def test_unknown_courier_returned_stripped(self):
        self.assertEqual(normalise_carrier('  Speedy  '), 'Speedy')

    def test_empty_string_returns_other(self):
        self.assertEqual(normalise_carrier(''), 'Other')

    def test_none_returns_other(self):
        self.assertEqual(normalise_carrier(None), 'Other')

    def test_amazon_logistics(self):
        self.assertEqual(normalise_carrier('amazon logistics'), 'Amazon Logistics UK')

    def test_parcelforce(self):
        self.assertEqual(normalise_carrier('parcelforce'), 'Parcelforce')


# ═══════════════════════════════════════════════════════════════════════════════
# 2. AmazonError
# ═══════════════════════════════════════════════════════════════════════════════

class TestAmazonError(SimpleTestCase):

    def test_message_stored(self):
        self.assertEqual(str(AmazonError('bad thing')), 'bad thing')

    def test_status_code_stored(self):
        self.assertEqual(AmazonError('rate limit', status_code=429).status_code, 429)

    def test_status_code_defaults_none(self):
        self.assertIsNone(AmazonError('oops').status_code)

    def test_is_exception(self):
        with self.assertRaises(AmazonError):
            raise AmazonError('test')


# ═══════════════════════════════════════════════════════════════════════════════
# 3. AmazonClient.from_channel
# ═══════════════════════════════════════════════════════════════════════════════

class TestAmazonClientFromChannel(SimpleTestCase):

    def _ch(self, creds):
        ch = MagicMock()
        ch.name = 'Test Amazon'
        ch.api_credentials = creds
        return ch

    def test_missing_all_creds_raises(self):
        with self.assertRaises(AmazonError) as ctx:
            AmazonClient.from_channel(self._ch({}))
        self.assertIn('missing Amazon credentials', str(ctx.exception))

    def test_missing_seller_id_raises(self):
        with self.assertRaises(AmazonError) as ctx:
            AmazonClient.from_channel(self._ch({
                'lwa_client_id': 'x', 'lwa_client_secret': 'x', 'refresh_token': 'x',
            }))
        self.assertIn('seller_id', str(ctx.exception))

    def test_valid_creds_returns_client(self):
        ch = self._ch({
            'lwa_client_id': 'id', 'lwa_client_secret': 'sec',
            'refresh_token': 'tok', 'seller_id': 'SELL1',
        })
        c = AmazonClient.from_channel(ch)
        self.assertIsInstance(c, AmazonClient)
        self.assertEqual(c.seller_id, 'SELL1')
        self.assertEqual(c.marketplace_id, UK_MARKETPLACE_ID)

    def test_custom_marketplace_id_used(self):
        ch = self._ch({
            'lwa_client_id': 'id', 'lwa_client_secret': 'sec',
            'refresh_token': 'tok', 'seller_id': 'SELL1',
            'marketplace_id': 'ATVPDKIKX0DER',
        })
        self.assertEqual(AmazonClient.from_channel(ch).marketplace_id, 'ATVPDKIKX0DER')

    def test_none_credentials_raises(self):
        ch = self._ch(None)
        with self.assertRaises(AmazonError):
            AmazonClient.from_channel(ch)


# ═══════════════════════════════════════════════════════════════════════════════
# 4. AmazonClient._wrap and _marketplace_obj
# ═══════════════════════════════════════════════════════════════════════════════

class TestAmazonClientInternals(SimpleTestCase):

    def setUp(self):
        self.c = _client()

    def test_wrap_selling_api_exception(self):
        exc = _SP_BASE.SellingApiException('Throttled')
        result = self.c._wrap(exc)
        self.assertIsInstance(result, AmazonError)

    def test_wrap_generic_exception(self):
        result = self.c._wrap(ValueError('boom'))
        self.assertIsInstance(result, AmazonError)
        self.assertIn('boom', str(result))

    def test_marketplace_obj_known_id(self):
        mp = self.c._marketplace_obj()
        self.assertEqual(mp.marketplace_id, UK_MARKETPLACE_ID)

    def test_marketplace_obj_unknown_falls_back_to_gb(self):
        c = _client(marketplace_id='UNKNOWN_MP')
        mp = c._marketplace_obj()
        self.assertEqual(mp.marketplace_id, UK_MARKETPLACE_ID)


# ═══════════════════════════════════════════════════════════════════════════════
# 5. AmazonClient.test_connection
# ═══════════════════════════════════════════════════════════════════════════════

class TestAmazonClientTestConnection(SimpleTestCase):

    def setUp(self):
        self.c = _client()

    def _mock_sellers(self, participations=None, side_effect=None):
        instance = MagicMock()
        if side_effect:
            instance.get_marketplace_participations.side_effect = side_effect
        else:
            resp = MagicMock()
            resp.payload = participations or []
            instance.get_marketplace_participations.return_value = resp
        _SP_APIS.Sellers.return_value = instance
        return instance

    def test_success_returns_ok_true(self):
        self._mock_sellers([{'marketplace': {'name': 'Amazon.co.uk'}}])
        result = self.c.test_connection()
        self.assertTrue(result['ok'])

    def test_success_message_contains_seller_id(self):
        self._mock_sellers([{'marketplace': {'name': 'Amazon.co.uk'}}])
        result = self.c.test_connection()
        self.assertIn('SELLER1', result['message'])

    def test_success_message_contains_marketplace_name(self):
        self._mock_sellers([{'marketplace': {'name': 'Amazon.co.uk'}}])
        result = self.c.test_connection()
        self.assertIn('Amazon.co.uk', result['message'])

    def test_empty_participations_shows_unknown(self):
        self._mock_sellers([])
        result = self.c.test_connection()
        self.assertTrue(result['ok'])
        self.assertIn('unknown marketplace', result['message'])

    def test_none_payload_handled(self):
        instance = MagicMock()
        resp = MagicMock()
        resp.payload = None
        instance.get_marketplace_participations.return_value = resp
        _SP_APIS.Sellers.return_value = instance
        result = self.c.test_connection()
        self.assertTrue(result['ok'])

    def test_selling_api_exception_raises_amazon_error(self):
        self._mock_sellers(side_effect=_SP_BASE.SellingApiException('Auth failure'))
        with self.assertRaises(AmazonError):
            self.c.test_connection()

    def test_generic_exception_raises_amazon_error(self):
        self._mock_sellers(side_effect=ConnectionError('timeout'))
        with self.assertRaises(AmazonError) as ctx:
            self.c.test_connection()
        self.assertIn('Connection test failed', str(ctx.exception))


# ═══════════════════════════════════════════════════════════════════════════════
# 6. AmazonClient.get_orders
# ═══════════════════════════════════════════════════════════════════════════════

class TestAmazonClientGetOrders(SimpleTestCase):

    def setUp(self):
        self.c = _client()

    def _resp(self, orders, next_token=None):
        r = MagicMock()
        r.payload = {'Orders': orders, 'NextToken': next_token}
        return r

    def _mock_orders_api(self, side_effects):
        instance = MagicMock()
        instance.get_orders.side_effect = side_effects
        _SP_APIS.OrdersV0.return_value = instance
        return instance

    def test_returns_single_page(self):
        order = {'AmazonOrderId': '111-222-333'}
        self._mock_orders_api([self._resp([order])])
        result = self.c.get_orders()
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['AmazonOrderId'], '111-222-333')

    def test_paginates_until_no_next_token(self):
        page1 = [{'AmazonOrderId': 'A'}, {'AmazonOrderId': 'B'}]
        page2 = [{'AmazonOrderId': 'C'}]
        self._mock_orders_api([self._resp(page1, 'tok123'), self._resp(page2)])
        result = self.c.get_orders()
        self.assertEqual([r['AmazonOrderId'] for r in result], ['A', 'B', 'C'])

    def test_created_after_forwarded_to_api(self):
        instance = self._mock_orders_api([self._resp([])])
        self.c.get_orders(created_after='2026-01-01T00:00:00Z')
        call_kwargs = instance.get_orders.call_args[1]
        self.assertEqual(call_kwargs.get('CreatedAfter'), '2026-01-01T00:00:00Z')

    def test_empty_payload_returns_empty_list(self):
        r = MagicMock()
        r.payload = {}
        instance = MagicMock()
        instance.get_orders.return_value = r
        _SP_APIS.OrdersV0.return_value = instance
        self.assertEqual(self.c.get_orders(), [])

    def test_selling_api_exception_raises(self):
        instance = MagicMock()
        instance.get_orders.side_effect = _SP_BASE.SellingApiException('Throttled')
        _SP_APIS.OrdersV0.return_value = instance
        with self.assertRaises(AmazonError):
            self.c.get_orders()

    def test_generic_exception_raises(self):
        instance = MagicMock()
        instance.get_orders.side_effect = RuntimeError('network error')
        _SP_APIS.OrdersV0.return_value = instance
        with self.assertRaises(AmazonError) as ctx:
            self.c.get_orders()
        self.assertIn('get_orders failed', str(ctx.exception))

    def test_only_marketplace_ids_sent_on_next_token_page(self):
        page1 = [{'AmazonOrderId': 'A'}]
        instance = MagicMock()
        r1 = MagicMock()
        r1.payload = {'Orders': page1, 'NextToken': 'tok'}
        r2 = MagicMock()
        r2.payload = {'Orders': [], 'NextToken': None}
        instance.get_orders.side_effect = [r1, r2]
        _SP_APIS.OrdersV0.return_value = instance
        self.c.get_orders()
        second_call_kwargs = instance.get_orders.call_args_list[1][1]
        self.assertIn('NextToken', second_call_kwargs)
        self.assertNotIn('OrderStatuses', second_call_kwargs)


# ═══════════════════════════════════════════════════════════════════════════════
# 7. AmazonClient.get_order_items
# ═══════════════════════════════════════════════════════════════════════════════

class TestAmazonClientGetOrderItems(SimpleTestCase):

    def setUp(self):
        self.c = _client()

    def _mock(self, side_effects):
        instance = MagicMock()
        instance.get_order_items.side_effect = side_effects
        _SP_APIS.OrdersV0.return_value = instance
        return instance

    def _resp(self, items, next_token=None):
        r = MagicMock()
        r.payload = {'OrderItems': items, 'NextToken': next_token}
        return r

    def test_returns_items(self):
        item = {'OrderItemId': 'ITEM1', 'SellerSKU': 'SKU-001', 'QuantityOrdered': 2}
        self._mock([self._resp([item])])
        result = self.c.get_order_items('111-222-333')
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['SellerSKU'], 'SKU-001')

    def test_paginates(self):
        self._mock([
            self._resp([{'OrderItemId': 'I1'}], 'tok'),
            self._resp([{'OrderItemId': 'I2'}]),
        ])
        result = self.c.get_order_items('111-222-333')
        self.assertEqual(len(result), 2)

    def test_selling_api_exception_raises(self):
        instance = MagicMock()
        instance.get_order_items.side_effect = _SP_BASE.SellingApiException('error')
        _SP_APIS.OrdersV0.return_value = instance
        with self.assertRaises(AmazonError):
            self.c.get_order_items('111-222-333')

    def test_generic_exception_raises_with_order_id(self):
        instance = MagicMock()
        instance.get_order_items.side_effect = RuntimeError('timeout')
        _SP_APIS.OrdersV0.return_value = instance
        with self.assertRaises(AmazonError) as ctx:
            self.c.get_order_items('111-222-333')
        self.assertIn('111-222-333', str(ctx.exception))

    def test_empty_order_items_returns_empty_list(self):
        self._mock([self._resp([])])
        self.assertEqual(self.c.get_order_items('X'), [])


# ═══════════════════════════════════════════════════════════════════════════════
# 8. AmazonClient.update_listing_quantity
# ═══════════════════════════════════════════════════════════════════════════════

class TestAmazonClientUpdateListingQuantity(SimpleTestCase):

    def setUp(self):
        self.c = _client()

    def _mock_listings(self, payload=None, side_effect=None):
        instance = MagicMock()
        if side_effect:
            instance.patch_listings_item.side_effect = side_effect
        else:
            r = MagicMock()
            r.payload = payload or {'status': 'ACCEPTED'}
            instance.patch_listings_item.return_value = r
        _SP_APIS.ListingsItems.return_value = instance
        return instance

    def test_accepted_status_succeeds(self):
        instance = self._mock_listings({'status': 'ACCEPTED'})
        self.c.update_listing_quantity('SKU-001', 10)
        instance.patch_listings_item.assert_called_once()

    def test_patch_body_contains_correct_quantity(self):
        instance = self._mock_listings()
        self.c.update_listing_quantity('MY-SKU', 42)
        body = instance.patch_listings_item.call_args[1]['body']
        qty = body['patches'][0]['value'][0]['quantity']
        self.assertEqual(qty, 42)

    def test_patch_sent_with_correct_sku_and_seller(self):
        instance = self._mock_listings()
        self.c.update_listing_quantity('MY-SKU', 5)
        kwargs = instance.patch_listings_item.call_args[1]
        self.assertEqual(kwargs['sku'], 'MY-SKU')
        self.assertEqual(kwargs['sellerId'], 'SELLER1')

    def test_invalid_status_raises_amazon_error(self):
        self._mock_listings({'status': 'INVALID', 'issues': [{'message': 'Bad type'}]})
        with self.assertRaises(AmazonError) as ctx:
            self.c.update_listing_quantity('BAD-SKU', 5)
        self.assertIn('INVALID', str(ctx.exception))
        self.assertIn('BAD-SKU', str(ctx.exception))

    def test_empty_status_does_not_raise(self):
        self._mock_listings({'status': ''})
        self.c.update_listing_quantity('SKU-001', 0)  # should not raise

    def test_selling_api_exception_raises(self):
        self._mock_listings(side_effect=_SP_BASE.SellingApiException('Forbidden'))
        with self.assertRaises(AmazonError):
            self.c.update_listing_quantity('SKU-X', 0)

    def test_generic_exception_raises(self):
        self._mock_listings(side_effect=RuntimeError('crash'))
        with self.assertRaises(AmazonError) as ctx:
            self.c.update_listing_quantity('SKU-Y', 1)
        self.assertIn('update_listing_quantity failed', str(ctx.exception))

    def test_zero_quantity_allowed(self):
        instance = self._mock_listings()
        self.c.update_listing_quantity('SKU-001', 0)
        body = instance.patch_listings_item.call_args[1]['body']
        qty = body['patches'][0]['value'][0]['quantity']
        self.assertEqual(qty, 0)


# ═══════════════════════════════════════════════════════════════════════════════
# 9. AmazonClient.confirm_shipment
# ═══════════════════════════════════════════════════════════════════════════════

class TestAmazonClientConfirmShipment(SimpleTestCase):

    def setUp(self):
        self.c = _client()
        self.items = [
            {'order_item_id': 'ITEM1', 'quantity': 2},
            {'order_item_id': 'ITEM2', 'quantity': 1},
        ]

    def _call(self, tracking='TRK123', carrier='Royal Mail', items=None):
        return self.c.confirm_shipment(
            amazon_order_id='111-222-333',
            tracking_number=tracking,
            carrier_code=carrier,
            order_items=items or self.items,
        )

    def _mock_orders(self, side_effect=None):
        instance = MagicMock()
        if side_effect:
            instance.confirm_shipment.side_effect = side_effect
        _SP_APIS.OrdersV0.return_value = instance
        return instance

    def test_success_no_raise(self):
        instance = self._mock_orders()
        self._call()
        instance.confirm_shipment.assert_called_once()

    def test_body_contains_tracking_number(self):
        instance = self._mock_orders()
        self._call(tracking='TRK999')
        body = instance.confirm_shipment.call_args[1]['body']
        self.assertEqual(body['packageDetail']['trackingNumber'], 'TRK999')

    def test_body_contains_carrier_code(self):
        instance = self._mock_orders()
        self._call(carrier='DHL')
        body = instance.confirm_shipment.call_args[1]['body']
        self.assertEqual(body['packageDetail']['carrierCode'], 'DHL')

    def test_body_contains_order_items(self):
        instance = self._mock_orders()
        self._call()
        pkg = instance.confirm_shipment.call_args[1]['body']['packageDetail']
        self.assertEqual(len(pkg['orderItems']), 2)
        ids = {i['orderItemId'] for i in pkg['orderItems']}
        self.assertEqual(ids, {'ITEM1', 'ITEM2'})

    def test_body_contains_marketplace_id(self):
        instance = self._mock_orders()
        self._call()
        body = instance.confirm_shipment.call_args[1]['body']
        self.assertEqual(body['marketplaceId'], UK_MARKETPLACE_ID)

    def test_selling_api_exception_raises_amazon_error(self):
        self._mock_orders(side_effect=_SP_BASE.SellingApiException('Bad request'))
        with self.assertRaises(AmazonError):
            self._call()

    def test_generic_exception_raises_amazon_error(self):
        self._mock_orders(side_effect=RuntimeError('timeout'))
        with self.assertRaises(AmazonError) as ctx:
            self._call()
        self.assertIn('confirm_shipment failed', str(ctx.exception))
        self.assertIn('111-222-333', str(ctx.exception))


# ═══════════════════════════════════════════════════════════════════════════════
# 10. sync._find_or_create_amazon_customer
# ═══════════════════════════════════════════════════════════════════════════════

class TestFindOrCreateAmazonCustomer(TestCase):

    def setUp(self):
        self.user = User.objects.create_user('u1', password='pass')

    def test_creates_new_customer(self):
        from channels.sync import _find_or_create_amazon_customer
        from customers.models import Customer
        c = _find_or_create_amazon_customer(_amazon_order(), self.user)
        self.assertEqual(c.email, 'buyer@example.com')
        self.assertEqual(c.first_name, 'John')
        self.assertEqual(c.last_name, 'Smith')
        self.assertEqual(c.source, 'amazon')
        self.assertEqual(c.customer_type, Customer.TYPE_MARKETPLACE)
        self.assertTrue(c.customer_number.startswith('AMZ'))

    def test_returns_existing_by_email(self):
        from channels.sync import _find_or_create_amazon_customer
        from customers.models import Customer
        existing = Customer.objects.create(
            customer_number='CUST001', first_name='Jane', last_name='Doe',
            email='buyer@example.com', customer_type=Customer.TYPE_MARKETPLACE,
        )
        c = _find_or_create_amazon_customer(_amazon_order(), self.user)
        self.assertEqual(c.pk, existing.pk)

    def test_no_email_generates_placeholder(self):
        from channels.sync import _find_or_create_amazon_customer
        order = _amazon_order()
        order['BuyerInfo'] = {'BuyerName': 'No Email'}
        c = _find_or_create_amazon_customer(order, self.user)
        self.assertIn('noemail', c.email)

    def test_name_split_single_word(self):
        from channels.sync import _find_or_create_amazon_customer
        order = _amazon_order()
        # sync uses ShippingAddress.Name first, so clear it to exercise BuyerName path
        order['ShippingAddress']['Name'] = 'Mononym'
        order['BuyerInfo'] = {'BuyerEmail': 'mono@test.com', 'BuyerName': 'Mononym'}
        c = _find_or_create_amazon_customer(order, self.user)
        self.assertEqual(c.first_name, 'Mononym')
        self.assertEqual(c.last_name, '')

    def test_address_name_used_when_no_buyer_name(self):
        from channels.sync import _find_or_create_amazon_customer
        order = _amazon_order()
        order['BuyerInfo'] = {'BuyerEmail': 'addr@test.com'}
        order['ShippingAddress']['Name'] = 'Address Person'
        c = _find_or_create_amazon_customer(order, self.user)
        self.assertEqual(c.first_name, 'Address')


# ═══════════════════════════════════════════════════════════════════════════════
# 11. sync._import_single_amazon_order
# ═══════════════════════════════════════════════════════════════════════════════

class TestImportSingleAmazonOrder(TestCase):

    def setUp(self):
        self.user = User.objects.create_user('u2', password='pass')
        self.channel = _make_amazon_channel()
        self.mock_client = MagicMock()
        self.mock_client.get_order_items.return_value = [_amazon_item()]

    def _import(self, order=None, client=None):
        from channels.sync import _import_single_amazon_order
        return _import_single_amazon_order(
            self.channel,
            order or _amazon_order(),
            client or self.mock_client,
            self.user,
        )

    def test_returns_created(self):
        self.assertEqual(self._import(), 'created')

    def test_creates_sales_order(self):
        from sales.models import SalesOrder
        self._import()
        so = SalesOrder.objects.get(external_order_id='111-222-333', channel='amazon')
        self.assertEqual(so.ship_to_address1, '10 Test Street')
        self.assertEqual(so.currency, 'GBP')
        self.assertEqual(so.status, 'confirmed')

    def test_payment_status_paid_for_unshipped(self):
        from sales.models import SalesOrder
        self._import()
        so = SalesOrder.objects.get(external_order_id='111-222-333')
        self.assertEqual(so.payment_status, 'paid')

    def test_payment_status_unpaid_for_pending(self):
        from sales.models import SalesOrder
        order = _amazon_order(order_id='PEND-001', status='Pending')
        order['PaymentStatus'] = 'NotYetShipped'
        order['OrderStatus'] = 'Pending'
        self._import(order=order)
        so = SalesOrder.objects.get(external_order_id='PEND-001')
        self.assertEqual(so.payment_status, 'unpaid')

    def test_creates_marketplace_record(self):
        self._import()
        mp = MarketplaceOrder.objects.get(channel=self.channel, external_order_id='111-222-333')
        self.assertEqual(mp.status, MarketplaceOrder.STATUS_IMPORTED)
        self.assertIsNotNone(mp.sales_order_id)

    def test_raw_data_stores_items(self):
        self._import()
        mp = MarketplaceOrder.objects.get(channel=self.channel, external_order_id='111-222-333')
        self.assertIn('_items', mp.raw_data)
        self.assertEqual(len(mp.raw_data['_items']), 1)

    def test_creates_line_items(self):
        from sales.models import SalesOrderItem
        self.mock_client.get_order_items.return_value = [
            _amazon_item('I1', 'SKU-A', 3, '9.99'),
            _amazon_item('I2', 'SKU-B', 1, '19.99'),
        ]
        self._import()
        count = SalesOrderItem.objects.filter(order__external_order_id='111-222-333').count()
        self.assertEqual(count, 2)

    def test_duplicate_returns_duplicate(self):
        from sales.models import SalesOrder
        self._import()
        result = self._import()
        self.assertEqual(result, 'duplicate')
        self.assertEqual(
            SalesOrder.objects.filter(external_order_id='111-222-333', channel='amazon').count(), 1
        )

    def test_matched_product_linked(self):
        from products.models import Product
        from sales.models import SalesOrderItem
        Product.objects.create(
            sku='TEST-SKU', title='Widget',
            buy_price=Decimal('5.00'), sell_price=Decimal('14.99'),
        )
        self._import(order=_amazon_order(order_id='MATCH-001'))
        item = SalesOrderItem.objects.get(order__external_order_id='MATCH-001', sku='TEST-SKU')
        self.assertIsNotNone(item.product_id)

    def test_unmatched_sku_item_has_no_product(self):
        from sales.models import SalesOrderItem
        self.mock_client.get_order_items.return_value = [
            _amazon_item(sku='UNKNOWN-XYZ-999'),
        ]
        self._import(order=_amazon_order(order_id='UNMATCH-001'))
        item = SalesOrderItem.objects.get(order__external_order_id='UNMATCH-001')
        self.assertIsNone(item.product)

    def test_channel_listing_created_for_matched_product(self):
        from products.models import Product, ChannelListing
        Product.objects.create(
            sku='TEST-SKU', title='Widget',
            buy_price=Decimal('5.00'), sell_price=Decimal('14.99'),
        )
        self._import(order=_amazon_order(order_id='LISTING-001'))
        self.assertTrue(
            ChannelListing.objects.filter(channel='amazon', external_sku='TEST-SKU').exists()
        )

    def test_fallback_sku_used_when_no_seller_sku(self):
        from sales.models import SalesOrderItem
        item = _amazon_item(sku='', asin='B00NOSKU1')
        item['SellerSKU'] = ''
        self.mock_client.get_order_items.return_value = [item]
        self._import(order=_amazon_order(order_id='NOSKU-001'))
        soi = SalesOrderItem.objects.get(order__external_order_id='NOSKU-001')
        self.assertIn('AMZN', soi.sku)


# ═══════════════════════════════════════════════════════════════════════════════
# 12. sync.import_amazon_orders
# ═══════════════════════════════════════════════════════════════════════════════

class TestImportAmazonOrders(TestCase):

    def setUp(self):
        self.user = User.objects.create_user('u3', password='pass')
        self.channel = _make_amazon_channel('Amazon UK 2')

    def _mock_client(self, orders, items=None):
        mc = MagicMock()
        mc.get_orders.return_value = orders
        mc.get_order_items.return_value = items or [_amazon_item()]
        return mc

    def test_imports_multiple_orders(self):
        from channels.sync import import_amazon_orders
        mc = self._mock_client([_amazon_order('A-001'), _amazon_order('A-002')])
        with patch('channels.sync._get_amazon_client', return_value=mc):
            stats = import_amazon_orders(self.channel, self.user)
        self.assertEqual(stats['created'], 2)
        self.assertEqual(stats['failed'], 0)
        self.assertEqual(stats['processed'], 2)

    def test_duplicate_counted(self):
        from channels.sync import import_amazon_orders
        mc = self._mock_client([_amazon_order('B-001')])
        with patch('channels.sync._get_amazon_client', return_value=mc):
            import_amazon_orders(self.channel, self.user)
            stats = import_amazon_orders(self.channel, self.user)
        self.assertEqual(stats['duplicate'], 1)
        self.assertEqual(stats['created'], 0)

    def test_failed_order_recorded(self):
        from channels.sync import import_amazon_orders
        mc = self._mock_client([_amazon_order('C-001')])
        mc.get_order_items.side_effect = RuntimeError('API crash')
        with patch('channels.sync._get_amazon_client', return_value=mc):
            stats = import_amazon_orders(self.channel, self.user)
        self.assertEqual(stats['failed'], 1)
        mp = MarketplaceOrder.objects.get(channel=self.channel, external_order_id='C-001')
        self.assertEqual(mp.status, MarketplaceOrder.STATUS_FAILED)
        self.assertIn('API crash', mp.error_message)

    def test_amazon_error_on_fetch_raises_value_error(self):
        from channels.sync import import_amazon_orders
        mc = MagicMock()
        mc.get_orders.side_effect = AmazonError('Rate limit')
        with patch('channels.sync._get_amazon_client', return_value=mc):
            with self.assertRaises(ValueError) as ctx:
                import_amazon_orders(self.channel, self.user)
        self.assertIn('Rate limit', str(ctx.exception))

    def test_empty_order_list_returns_zero_stats(self):
        from channels.sync import import_amazon_orders
        mc = self._mock_client([])
        with patch('channels.sync._get_amazon_client', return_value=mc):
            stats = import_amazon_orders(self.channel, self.user)
        self.assertEqual(stats['created'], 0)
        self.assertEqual(stats['processed'], 0)

    def test_created_after_set_when_channel_last_synced(self):
        from channels.sync import import_amazon_orders
        from django.utils import timezone
        self.channel.last_synced = timezone.now()
        self.channel.save()
        mc = self._mock_client([])
        with patch('channels.sync._get_amazon_client', return_value=mc):
            import_amazon_orders(self.channel, self.user)
        call_kwargs = mc.get_orders.call_args[1]
        self.assertIn('created_after', call_kwargs)
        self.assertIsNotNone(call_kwargs['created_after'])


# ═══════════════════════════════════════════════════════════════════════════════
# 13. sync.push_stock_to_amazon
# ═══════════════════════════════════════════════════════════════════════════════

class TestPushStockToAmazon(TestCase):

    def setUp(self):
        from products.models import Product, ChannelListing, StockLocation, StockLevel
        self.user = User.objects.create_user('u4', password='pass')
        self.channel = _make_amazon_channel('Amazon UK 3')
        self.location = StockLocation.objects.create(code='WH1', name='Warehouse 1')
        self.product = Product.objects.create(
            sku='AMZ-PROD-1', title='Amazon Widget',
            buy_price=Decimal('5.00'), sell_price=Decimal('15.00'),
        )
        StockLevel.objects.create(
            product=self.product, location=self.location,
            qty_on_hand=50, qty_reserved=10,
        )
        self.listing = ChannelListing.objects.create(
            product=self.product, channel='amazon',
            external_id='B001TEST', external_sku='AMZ-SELLER-SKU',
            is_active=True,
        )

    def test_dry_run_returns_preview(self):
        from channels.sync import push_stock_to_amazon
        mc = MagicMock()
        with patch('channels.sync._get_amazon_client', return_value=mc):
            stats = push_stock_to_amazon(self.channel, dry_run=True)
        self.assertTrue(stats['dry_run'])
        self.assertEqual(stats['success'], 1)
        self.assertEqual(len(stats['preview']), 1)
        self.assertEqual(stats['preview'][0]['amazon_sku'], 'AMZ-SELLER-SKU')
        self.assertEqual(stats['preview'][0]['qty'], 40)  # 50 on-hand − 10 reserved

    def test_dry_run_makes_no_api_call(self):
        from channels.sync import push_stock_to_amazon
        mc = MagicMock()
        with patch('channels.sync._get_amazon_client', return_value=mc):
            push_stock_to_amazon(self.channel, dry_run=True)
        mc.update_listing_quantity.assert_not_called()

    def test_live_push_calls_api_with_correct_qty(self):
        from channels.sync import push_stock_to_amazon
        mc = MagicMock()
        with patch('channels.sync._get_amazon_client', return_value=mc):
            stats = push_stock_to_amazon(self.channel)
        self.assertEqual(stats['success'], 1)
        self.assertEqual(stats['failed'], 0)
        mc.update_listing_quantity.assert_called_once_with('AMZ-SELLER-SKU', 40)

    def test_api_failure_counted(self):
        from channels.sync import push_stock_to_amazon
        mc = MagicMock()
        mc.update_listing_quantity.side_effect = AmazonError('ASIN not found', status_code=404)
        with patch('channels.sync._get_amazon_client', return_value=mc):
            stats = push_stock_to_amazon(self.channel)
        self.assertEqual(stats['failed'], 1)
        self.assertEqual(stats['success'], 0)
        self.assertEqual(len(stats['errors']), 1)
        self.assertIn('404', stats['errors'][0]['error'])

    def test_unconfirmed_listing_not_pushed(self):
        from products.models import Product, ChannelListing, StockLevel
        from channels.sync import push_stock_to_amazon
        prod2 = Product.objects.create(
            sku='AMZ-PROD-2', title='Unconfirmed',
            buy_price=Decimal('1.00'), sell_price=Decimal('5.00'),
        )
        StockLevel.objects.create(product=prod2, location=self.location, qty_on_hand=100)
        ChannelListing.objects.create(
            product=prod2, channel='amazon',
            external_id='B002TEST', external_sku='UNCONF-SKU', is_active=False,
        )
        mc = MagicMock()
        with patch('channels.sync._get_amazon_client', return_value=mc):
            stats = push_stock_to_amazon(self.channel)
        self.assertEqual(mc.update_listing_quantity.call_count, 1)
        self.assertGreaterEqual(stats['not_confirmed'], 1)

    def test_listing_without_external_sku_skipped(self):
        from products.models import Product, ChannelListing, StockLevel
        from channels.sync import push_stock_to_amazon
        prod3 = Product.objects.create(
            sku='AMZ-PROD-3', title='No SKU',
            buy_price=Decimal('1.00'), sell_price=Decimal('5.00'),
        )
        StockLevel.objects.create(product=prod3, location=self.location, qty_on_hand=10)
        ChannelListing.objects.create(
            product=prod3, channel='amazon',
            external_id='B003TEST', external_sku='', is_active=True,
        )
        mc = MagicMock()
        with patch('channels.sync._get_amazon_client', return_value=mc):
            stats = push_stock_to_amazon(self.channel)
        self.assertGreaterEqual(stats['skipped'], 1)

    def test_zero_qty_available_pushed_as_zero(self):
        from products.models import StockLevel
        from channels.sync import push_stock_to_amazon
        StockLevel.objects.filter(product=self.product).update(qty_on_hand=0, qty_reserved=0)
        mc = MagicMock()
        with patch('channels.sync._get_amazon_client', return_value=mc):
            push_stock_to_amazon(self.channel)
        mc.update_listing_quantity.assert_called_once_with('AMZ-SELLER-SKU', 0)

    def test_deactivated_listing_not_pushed(self):
        from channels.sync import push_stock_to_amazon
        self.listing.is_active = False
        self.listing.save()
        mc = MagicMock()
        with patch('channels.sync._get_amazon_client', return_value=mc):
            stats = push_stock_to_amazon(self.channel)
        self.assertEqual(stats['success'], 0)
        mc.update_listing_quantity.assert_not_called()


# ═══════════════════════════════════════════════════════════════════════════════
# 14. sync.push_tracking_to_amazon
# ═══════════════════════════════════════════════════════════════════════════════

class TestPushTrackingToAmazon(TestCase):

    def setUp(self):
        from sales.models import SalesOrder
        from customers.models import Customer
        self.user = User.objects.create_user('u5', password='pass')
        self.channel = _make_amazon_channel('Amazon UK 4')
        self.customer = Customer.objects.create(
            customer_number='AMZ001', first_name='John', last_name='Smith',
            email='john@example.com', customer_type=Customer.TYPE_MARKETPLACE,
        )
        self.so = SalesOrder.objects.create(
            customer=self.customer, channel='amazon',
            external_order_id='111-222-333', marketplace_order_id='111-222-333',
            status=SalesOrder.STATUS_CONFIRMED,
            payment_status=SalesOrder.PAYMENT_STATUS_PAID,
            ship_to_name='John Smith', ship_to_address1='10 Test St',
            ship_to_city='London', ship_to_postcode='EC1A 1BB',
            ship_to_country='GB', total_value=Decimal('29.99'),
            currency='GBP', created_by=self.user,
        )
        self._items = [
            {'OrderItemId': 'ITEM1', 'QuantityOrdered': 2},
            {'OrderItemId': 'ITEM2', 'QuantityOrdered': 1},
        ]
        self.mp = MarketplaceOrder.objects.create(
            channel=self.channel, external_order_id='111-222-333',
            external_order_number='111-222-333',
            status=MarketplaceOrder.STATUS_IMPORTED,
            sales_order=self.so,
            raw_data={'_items': self._items},
        )

    def _push(self, tracking=None, courier=None):
        from channels.sync import push_tracking_to_amazon
        return push_tracking_to_amazon(
            self.channel, self.so,
            tracking_number=tracking,
            courier_override=courier,
        )

    def test_no_marketplace_order_returns_error(self):
        from channels.sync import push_tracking_to_amazon
        from sales.models import SalesOrder
        from customers.models import Customer
        other_cust = Customer.objects.create(
            customer_number='CUST999', first_name='X', last_name='Y',
            email='x@y.com', customer_type=Customer.TYPE_MARKETPLACE,
        )
        other_so = SalesOrder.objects.create(
            customer=other_cust, channel='amazon',
            status=SalesOrder.STATUS_CONFIRMED,
            payment_status=SalesOrder.PAYMENT_STATUS_UNPAID,
            ship_to_name='X Y', ship_to_address1='1 St',
            ship_to_city='London', ship_to_postcode='E1 1AA',
            ship_to_country='GB', total_value=Decimal('10.00'),
            currency='GBP', created_by=self.user,
        )
        result = push_tracking_to_amazon(self.channel, other_so)
        self.assertFalse(result['success'])
        self.assertIn('not imported', result['error'])

    def test_no_tracking_returns_error(self):
        result = self._push()
        self.assertFalse(result['success'])
        self.assertIn('No tracking number', result['error'])

    def test_empty_items_in_raw_data_returns_error(self):
        self.mp.raw_data = {}
        self.mp.save()
        result = self._push(tracking='TRK123', courier='Royal Mail')
        self.assertFalse(result['success'])
        self.assertIn('No order items', result['error'])

    def test_success_returns_ok(self):
        mc = MagicMock()
        with patch('channels.sync._get_amazon_client', return_value=mc):
            result = self._push(tracking='TRK999', courier='dhl')
        self.assertTrue(result['success'])
        self.assertEqual(result['tracking'], 'TRK999')
        self.assertEqual(result['carrier'], 'DHL')
        self.assertEqual(result['order_id'], '111-222-333')

    def test_confirm_shipment_called_with_correct_items(self):
        mc = MagicMock()
        with patch('channels.sync._get_amazon_client', return_value=mc):
            self._push(tracking='TRK456', courier='Royal Mail')
        kwargs = mc.confirm_shipment.call_args[1]
        self.assertEqual(len(kwargs['order_items']), 2)
        ids = {i['order_item_id'] for i in kwargs['order_items']}
        self.assertEqual(ids, {'ITEM1', 'ITEM2'})

    def test_confirm_shipment_called_with_correct_tracking(self):
        mc = MagicMock()
        with patch('channels.sync._get_amazon_client', return_value=mc):
            self._push(tracking='MYTRACK', courier='ups')
        kwargs = mc.confirm_shipment.call_args[1]
        self.assertEqual(kwargs['tracking_number'], 'MYTRACK')
        self.assertEqual(kwargs['carrier_code'], 'UPS')

    def test_api_error_returns_failure(self):
        mc = MagicMock()
        mc.confirm_shipment.side_effect = AmazonError('Shipment rejected', status_code=400)
        with patch('channels.sync._get_amazon_client', return_value=mc):
            result = self._push(tracking='TRK999', courier='Royal Mail')
        self.assertFalse(result['success'])
        self.assertIn('Shipment rejected', result['error'])

    def test_carrier_normalised_via_override(self):
        mc = MagicMock()
        with patch('channels.sync._get_amazon_client', return_value=mc):
            result = self._push(tracking='TRK1', courier='evri')
        self.assertEqual(result['carrier'], 'Hermes')

    def test_unknown_courier_passed_as_is(self):
        mc = MagicMock()
        with patch('channels.sync._get_amazon_client', return_value=mc):
            result = self._push(tracking='TRK1', courier='MySpecialCourier')
        self.assertEqual(result['carrier'], 'MySpecialCourier')
