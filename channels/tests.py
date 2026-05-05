"""
Amazon SP-API integration tests.
All external SP-API calls are mocked — no live credentials needed.
"""
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase

User = get_user_model()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_amazon_client():
    from channels.integrations.amazon import AmazonClient
    return AmazonClient(
        lwa_client_id='amzn1.application-oa2-client.TEST',
        lwa_client_secret='secret',
        refresh_token='Atzr|token',
        seller_id='SELLER123',
    )


def _make_channel(name='Amazon UK'):
    from channels.models import Channel
    return Channel.objects.create(
        name=name,
        channel_type='amazon',
        api_credentials={
            'lwa_client_id': 'amzn1.application-oa2-client.TEST',
            'lwa_client_secret': 'secret',
            'refresh_token': 'Atzr|token',
            'seller_id': 'SELLER123',
        },
    )


def _make_stock_location(code='MAIN'):
    from products.models import StockLocation
    loc, _ = StockLocation.objects.get_or_create(code=code, defaults={'name': 'Main Warehouse'})
    return loc


def _make_product_with_stock(sku='PROD-001', on_hand=50, reserved=10):
    from products.models import Product, StockLevel
    product, _ = Product.objects.get_or_create(
        sku=sku,
        defaults={'title': f'Product {sku}', 'buy_price': Decimal('5.00')},
    )
    loc = _make_stock_location()
    StockLevel.objects.get_or_create(
        product=product,
        location=loc,
        defaults={'qty_on_hand': on_hand, 'qty_reserved': reserved},
    )
    return product


def _sample_amazon_order(order_id='111-0000000-0000001'):
    return {
        'AmazonOrderId': order_id,
        'OrderStatus': 'Unshipped',
        'PaymentStatus': 'PaymentComplete',
        'OrderTotal': {'Amount': '29.99', 'CurrencyCode': 'GBP'},
        'ShippingAddress': {
            'Name': 'John Smith',
            'AddressLine1': '123 Test Street',
            'City': 'London',
            'PostalCode': 'SW1A 1AA',
            'CountryCode': 'GB',
            'Phone': '07700000000',
        },
        'BuyerInfo': {
            'BuyerEmail': 'buyer@example.com',
            'BuyerName': 'John Smith',
        },
    }


def _sample_amazon_item(sku='TEST-SKU-001', order_item_id='item-001', qty=2):
    return {
        'OrderItemId': order_item_id,
        'ASIN': 'B000000001',
        'SellerSKU': sku,
        'Title': 'Test Product',
        'QuantityOrdered': qty,
        'ItemPrice': {'Amount': '19.98', 'CurrencyCode': 'GBP'},
        'ShippingPrice': {'Amount': '3.99', 'CurrencyCode': 'GBP'},
    }


# ══════════════════════════════════════════════════════════════════════════════
# normalise_carrier
# ══════════════════════════════════════════════════════════════════════════════

class NormaliseCarrierTest(TestCase):

    def test_known_lowercase(self):
        from channels.integrations.amazon import normalise_carrier
        self.assertEqual(normalise_carrier('royal mail'), 'Royal Mail')
        self.assertEqual(normalise_carrier('dhl'), 'DHL')
        self.assertEqual(normalise_carrier('evri'), 'Hermes')
        self.assertEqual(normalise_carrier('ups'), 'UPS')

    def test_case_insensitive(self):
        from channels.integrations.amazon import normalise_carrier
        self.assertEqual(normalise_carrier('DHL'), 'DHL')
        self.assertEqual(normalise_carrier('Royal Mail'), 'Royal Mail')
        self.assertEqual(normalise_carrier('  Evri  '), 'Hermes')

    def test_unknown_courier_returned_as_is(self):
        from channels.integrations.amazon import normalise_carrier
        self.assertEqual(normalise_carrier('Speedy Couriers'), 'Speedy Couriers')
        self.assertEqual(normalise_carrier('Interlink'), 'Interlink')

    def test_empty_string_returns_other(self):
        from channels.integrations.amazon import normalise_carrier
        self.assertEqual(normalise_carrier(''), 'Other')

    def test_none_returns_other(self):
        from channels.integrations.amazon import normalise_carrier
        self.assertEqual(normalise_carrier(None), 'Other')


# ══════════════════════════════════════════════════════════════════════════════
# AmazonClient.from_channel
# ══════════════════════════════════════════════════════════════════════════════

class AmazonClientFromChannelTest(TestCase):

    def _mock_channel(self, creds):
        ch = MagicMock()
        ch.name = 'Test Amazon'
        ch.api_credentials = creds
        return ch

    def test_missing_all_credentials_raises(self):
        from channels.integrations.amazon import AmazonClient, AmazonError
        with self.assertRaises(AmazonError) as ctx:
            AmazonClient.from_channel(self._mock_channel({}))
        self.assertIn('missing Amazon credentials', str(ctx.exception))

    def test_partial_credentials_lists_missing_fields(self):
        from channels.integrations.amazon import AmazonClient, AmazonError
        creds = {'lwa_client_id': 'id', 'seller_id': 'seller'}
        with self.assertRaises(AmazonError) as ctx:
            AmazonClient.from_channel(self._mock_channel(creds))
        err = str(ctx.exception)
        self.assertIn('lwa_client_secret', err)
        self.assertIn('refresh_token', err)

    def test_full_credentials_succeeds(self):
        from channels.integrations.amazon import AmazonClient, UK_MARKETPLACE_ID
        creds = {
            'lwa_client_id': 'client-id',
            'lwa_client_secret': 'secret',
            'refresh_token': 'Atzr|token',
            'seller_id': 'SELLER123',
        }
        client = AmazonClient.from_channel(self._mock_channel(creds))
        self.assertEqual(client.seller_id, 'SELLER123')
        self.assertEqual(client.marketplace_id, UK_MARKETPLACE_ID)

    def test_custom_marketplace_id_honoured(self):
        from channels.integrations.amazon import AmazonClient
        creds = {
            'lwa_client_id': 'id',
            'lwa_client_secret': 'secret',
            'refresh_token': 'Atzr|token',
            'seller_id': 'SELLER',
            'marketplace_id': 'A2EUQ1WTGCTBG2',  # Canada
        }
        client = AmazonClient.from_channel(self._mock_channel(creds))
        self.assertEqual(client.marketplace_id, 'A2EUQ1WTGCTBG2')

    def test_none_credentials_raises(self):
        from channels.integrations.amazon import AmazonClient, AmazonError
        with self.assertRaises(AmazonError):
            AmazonClient.from_channel(self._mock_channel(None))


# ══════════════════════════════════════════════════════════════════════════════
# AmazonClient._wrap  (SellingApiException bug-fix regression)
# ══════════════════════════════════════════════════════════════════════════════

class AmazonClientWrapTest(TestCase):
    """
    Regression suite for the _wrap() bug:
      str(SellingApiException) is always '' and exc.code is always 999.
      The fix uses exc.amzn_code and exc.message instead.
    """

    def test_selling_api_exception_str_is_empty(self):
        """Confirm library behaviour: str(SellingApiException) == ''."""
        from sp_api.base import SellingApiException
        exc = SellingApiException(
            error=[{'code': '401', 'message': 'Unauthorized'}],
            headers={},
        )
        self.assertEqual(str(exc), '')

    def test_wrap_extracts_amzn_code_not_class_default(self):
        """_wrap must use exc.amzn_code (e.g. '401'), not exc.code (always 999)."""
        from sp_api.base import SellingApiException
        exc = SellingApiException(
            error=[{'code': '401', 'message': 'Unauthorized'}],
            headers={},
        )
        client = _make_amazon_client()
        wrapped = client._wrap(exc)
        self.assertEqual(wrapped.status_code, '401')

    def test_wrap_extracts_message_not_empty_str(self):
        """_wrap must use exc.message, not str(exc) which is ''."""
        from sp_api.base import SellingApiException
        exc = SellingApiException(
            error=[{'code': '401', 'message': 'Unauthorized'}],
            headers={},
        )
        client = _make_amazon_client()
        wrapped = client._wrap(exc)
        self.assertEqual(str(wrapped), 'Unauthorized')
        self.assertNotEqual(str(wrapped), '')

    def test_wrap_500_internal_error(self):
        from sp_api.base import SellingApiException
        exc = SellingApiException(
            error=[{'code': '500', 'message': 'Internal Server Error'}],
            headers={},
        )
        wrapped = _make_amazon_client()._wrap(exc)
        self.assertEqual(wrapped.status_code, '500')
        self.assertEqual(str(wrapped), 'Internal Server Error')

    def test_wrap_non_selling_api_exception(self):
        """Plain exceptions are wrapped too, using str()."""
        from channels.integrations.amazon import AmazonError
        wrapped = _make_amazon_client()._wrap(RuntimeError('network timeout'))
        self.assertIsInstance(wrapped, AmazonError)
        self.assertIn('network timeout', str(wrapped))

    def test_wrap_returns_amazon_error_instance(self):
        from sp_api.base import SellingApiException
        from channels.integrations.amazon import AmazonError
        exc = SellingApiException(
            error=[{'code': '403', 'message': 'Forbidden'}],
            headers={},
        )
        wrapped = _make_amazon_client()._wrap(exc)
        self.assertIsInstance(wrapped, AmazonError)


# ══════════════════════════════════════════════════════════════════════════════
# AmazonClient.test_connection
# ══════════════════════════════════════════════════════════════════════════════

class AmazonClientTestConnectionTest(TestCase):

    @patch('sp_api.api.Sellers')
    def test_success_returns_ok_true_with_marketplace_name(self, MockSellers):
        mock_resp = MagicMock()
        mock_resp.payload = [{'marketplace': {'name': 'Amazon.co.uk'}}]
        MockSellers.return_value.get_marketplace_participations.return_value = mock_resp

        result = _make_amazon_client().test_connection()

        self.assertTrue(result['ok'])
        self.assertIn('SELLER123', result['message'])
        self.assertIn('Amazon.co.uk', result['message'])

    @patch('sp_api.api.Sellers')
    def test_empty_payload_still_ok(self, MockSellers):
        mock_resp = MagicMock()
        mock_resp.payload = []
        MockSellers.return_value.get_marketplace_participations.return_value = mock_resp

        result = _make_amazon_client().test_connection()
        self.assertTrue(result['ok'])

    @patch('sp_api.api.Sellers')
    def test_selling_api_exception_raises_amazon_error(self, MockSellers):
        from sp_api.base import SellingApiException
        from channels.integrations.amazon import AmazonError
        exc = SellingApiException(
            error=[{'code': '401', 'message': 'Unauthorized'}],
            headers={},
        )
        MockSellers.return_value.get_marketplace_participations.side_effect = exc

        with self.assertRaises(AmazonError) as ctx:
            _make_amazon_client().test_connection()
        self.assertEqual(str(ctx.exception), 'Unauthorized')

    @patch('sp_api.api.Sellers')
    def test_generic_exception_raises_amazon_error(self, MockSellers):
        from channels.integrations.amazon import AmazonError
        MockSellers.return_value.get_marketplace_participations.side_effect = ConnectionError('timeout')

        with self.assertRaises(AmazonError) as ctx:
            _make_amazon_client().test_connection()
        self.assertIn('Connection test failed', str(ctx.exception))


# ══════════════════════════════════════════════════════════════════════════════
# AmazonClient.get_orders
# ══════════════════════════════════════════════════════════════════════════════

class AmazonClientGetOrdersTest(TestCase):

    @patch('sp_api.api.OrdersV0')
    def test_returns_orders_list(self, MockOrders):
        page = MagicMock()
        page.payload = {
            'Orders': [{'AmazonOrderId': '111-0000000-0000001'}],
            'NextToken': None,
        }
        MockOrders.return_value.get_orders.return_value = page

        orders = _make_amazon_client().get_orders()
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]['AmazonOrderId'], '111-0000000-0000001')

    @patch('sp_api.api.OrdersV0')
    def test_pagination_collects_all_pages(self, MockOrders):
        page1 = MagicMock()
        page1.payload = {'Orders': [{'AmazonOrderId': 'order-1'}], 'NextToken': 'tok1'}
        page2 = MagicMock()
        page2.payload = {'Orders': [{'AmazonOrderId': 'order-2'}], 'NextToken': None}
        MockOrders.return_value.get_orders.side_effect = [page1, page2]

        orders = _make_amazon_client().get_orders()
        self.assertEqual(len(orders), 2)
        self.assertEqual(orders[0]['AmazonOrderId'], 'order-1')
        self.assertEqual(orders[1]['AmazonOrderId'], 'order-2')

    @patch('sp_api.api.OrdersV0')
    def test_empty_response_returns_empty_list(self, MockOrders):
        page = MagicMock()
        page.payload = {'Orders': [], 'NextToken': None}
        MockOrders.return_value.get_orders.return_value = page

        orders = _make_amazon_client().get_orders()
        self.assertEqual(orders, [])

    @patch('sp_api.api.OrdersV0')
    def test_selling_api_exception_raises_amazon_error(self, MockOrders):
        from sp_api.base import SellingApiException
        from channels.integrations.amazon import AmazonError
        exc = SellingApiException(
            error=[{'code': '403', 'message': 'Access denied'}],
            headers={},
        )
        MockOrders.return_value.get_orders.side_effect = exc

        with self.assertRaises(AmazonError):
            _make_amazon_client().get_orders()

    @patch('sp_api.api.OrdersV0')
    def test_created_after_passed_to_api(self, MockOrders):
        page = MagicMock()
        page.payload = {'Orders': [], 'NextToken': None}
        MockOrders.return_value.get_orders.return_value = page

        _make_amazon_client().get_orders(created_after='2026-01-01T00:00:00Z')

        call_kwargs = MockOrders.return_value.get_orders.call_args[1]
        self.assertEqual(call_kwargs['CreatedAfter'], '2026-01-01T00:00:00Z')


# ══════════════════════════════════════════════════════════════════════════════
# AmazonClient.get_order_items
# ══════════════════════════════════════════════════════════════════════════════

class AmazonClientGetOrderItemsTest(TestCase):

    @patch('sp_api.api.OrdersV0')
    def test_returns_items(self, MockOrders):
        page = MagicMock()
        page.payload = {
            'OrderItems': [{'OrderItemId': 'item-001', 'SellerSKU': 'SKU-1'}],
            'NextToken': None,
        }
        MockOrders.return_value.get_order_items.return_value = page

        items = _make_amazon_client().get_order_items('111-0000000-0000001')
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['SellerSKU'], 'SKU-1')

    @patch('sp_api.api.OrdersV0')
    def test_pagination(self, MockOrders):
        page1 = MagicMock()
        page1.payload = {
            'OrderItems': [{'OrderItemId': 'item-001'}],
            'NextToken': 'tok1',
        }
        page2 = MagicMock()
        page2.payload = {
            'OrderItems': [{'OrderItemId': 'item-002'}],
            'NextToken': None,
        }
        MockOrders.return_value.get_order_items.side_effect = [page1, page2]

        items = _make_amazon_client().get_order_items('111-0000000-0000001')
        self.assertEqual(len(items), 2)


# ══════════════════════════════════════════════════════════════════════════════
# AmazonClient.update_listing_quantity
# ══════════════════════════════════════════════════════════════════════════════

class AmazonClientUpdateListingTest(TestCase):

    @patch('sp_api.api.ListingsItems')
    def test_accepted_status_does_not_raise(self, MockListings):
        mock_resp = MagicMock()
        mock_resp.payload = {'status': 'ACCEPTED'}
        MockListings.return_value.patch_listings_item.return_value = mock_resp

        _make_amazon_client().update_listing_quantity('SKU-001', 10)  # no raise

    @patch('sp_api.api.ListingsItems')
    def test_invalid_status_raises_amazon_error(self, MockListings):
        from channels.integrations.amazon import AmazonError
        mock_resp = MagicMock()
        mock_resp.payload = {
            'status': 'INVALID',
            'issues': [{'message': 'Quantity must be non-negative'}],
        }
        MockListings.return_value.patch_listings_item.return_value = mock_resp

        with self.assertRaises(AmazonError) as ctx:
            _make_amazon_client().update_listing_quantity('SKU-001', -1)
        self.assertIn('INVALID', str(ctx.exception))
        self.assertIn('SKU-001', str(ctx.exception))

    @patch('sp_api.api.ListingsItems')
    def test_selling_api_exception_raises_amazon_error(self, MockListings):
        from sp_api.base import SellingApiException
        from channels.integrations.amazon import AmazonError
        exc = SellingApiException(
            error=[{'code': '404', 'message': 'SKU not found'}],
            headers={},
        )
        MockListings.return_value.patch_listings_item.side_effect = exc

        with self.assertRaises(AmazonError):
            _make_amazon_client().update_listing_quantity('MISSING-SKU', 5)

    @patch('sp_api.api.ListingsItems')
    def test_correct_sku_and_qty_sent(self, MockListings):
        mock_resp = MagicMock()
        mock_resp.payload = {'status': 'ACCEPTED'}
        MockListings.return_value.patch_listings_item.return_value = mock_resp

        _make_amazon_client().update_listing_quantity('MY-SKU', 42)

        call_kwargs = MockListings.return_value.patch_listings_item.call_args[1]
        self.assertEqual(call_kwargs['sku'], 'MY-SKU')
        body = call_kwargs['body']
        patch_val = body['patches'][0]['value'][0]
        self.assertEqual(patch_val['quantity'], 42)
        self.assertEqual(patch_val['fulfillment_channel_code'], 'DEFAULT')


# ══════════════════════════════════════════════════════════════════════════════
# AmazonClient.confirm_shipment
# ══════════════════════════════════════════════════════════════════════════════

class AmazonClientConfirmShipmentTest(TestCase):

    @patch('sp_api.api.OrdersV0')
    def test_success_does_not_raise(self, MockOrders):
        MockOrders.return_value.confirm_shipment.return_value = MagicMock()
        _make_amazon_client().confirm_shipment(
            amazon_order_id='111-0000000-0000001',
            tracking_number='JD000000000GB',
            carrier_code='Royal Mail',
            order_items=[{'order_item_id': 'item1', 'quantity': 2}],
        )

    @patch('sp_api.api.OrdersV0')
    def test_correct_payload_sent(self, MockOrders):
        MockOrders.return_value.confirm_shipment.return_value = MagicMock()
        _make_amazon_client().confirm_shipment(
            amazon_order_id='111-0000000-0000001',
            tracking_number='JD000000000GB',
            carrier_code='Royal Mail',
            order_items=[{'order_item_id': 'item1', 'quantity': 2}],
        )
        call_args = MockOrders.return_value.confirm_shipment.call_args
        order_id_arg = call_args[0][0]
        body = call_args[1]['body']
        self.assertEqual(order_id_arg, '111-0000000-0000001')
        self.assertEqual(body['packageDetail']['carrierCode'], 'Royal Mail')
        self.assertEqual(body['packageDetail']['trackingNumber'], 'JD000000000GB')
        items = body['packageDetail']['orderItems']
        self.assertEqual(items[0]['orderItemId'], 'item1')
        self.assertEqual(items[0]['quantity'], 2)

    @patch('sp_api.api.OrdersV0')
    def test_selling_api_exception_raises_amazon_error(self, MockOrders):
        from sp_api.base import SellingApiException
        from channels.integrations.amazon import AmazonError
        exc = SellingApiException(
            error=[{'code': '400', 'message': 'Already shipped'}],
            headers={},
        )
        MockOrders.return_value.confirm_shipment.side_effect = exc

        with self.assertRaises(AmazonError):
            _make_amazon_client().confirm_shipment(
                amazon_order_id='111-0000000-0000001',
                tracking_number='JD000000000GB',
                carrier_code='Royal Mail',
                order_items=[{'order_item_id': 'item1', 'quantity': 1}],
            )


# ══════════════════════════════════════════════════════════════════════════════
# import_amazon_orders (sync-level)
# ══════════════════════════════════════════════════════════════════════════════

class ImportAmazonOrdersTest(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='tester', password='pass')
        self.channel = _make_channel()

    @patch('channels.sync._get_amazon_client')
    def test_creates_sales_order_and_marketplace_record(self, mock_get):
        from channels.models import MarketplaceOrder
        from sales.models import SalesOrder

        mock_client = MagicMock()
        mock_client.get_orders.return_value = [_sample_amazon_order()]
        mock_client.get_order_items.return_value = [_sample_amazon_item()]
        mock_get.return_value = mock_client

        from channels.sync import import_amazon_orders
        stats = import_amazon_orders(self.channel, self.user)

        self.assertEqual(stats['created'], 1)
        self.assertEqual(stats['processed'], 1)
        self.assertEqual(stats['duplicate'], 0)
        self.assertEqual(stats['failed'], 0)

        so = SalesOrder.objects.filter(channel='amazon').first()
        self.assertIsNotNone(so)
        self.assertEqual(so.ship_to_name, 'John Smith')
        self.assertEqual(so.ship_to_postcode, 'SW1A 1AA')
        self.assertEqual(so.currency, 'GBP')

        mp = MarketplaceOrder.objects.filter(channel=self.channel).first()
        self.assertIsNotNone(mp)
        self.assertEqual(mp.external_order_id, '111-0000000-0000001')
        self.assertEqual(mp.status, MarketplaceOrder.STATUS_IMPORTED)

    @patch('channels.sync._get_amazon_client')
    def test_duplicate_not_reimported(self, mock_get):
        mock_client = MagicMock()
        mock_client.get_orders.return_value = [_sample_amazon_order()]
        mock_client.get_order_items.return_value = [_sample_amazon_item()]
        mock_get.return_value = mock_client

        from channels.sync import import_amazon_orders
        import_amazon_orders(self.channel, self.user)
        stats = import_amazon_orders(self.channel, self.user)

        self.assertEqual(stats['duplicate'], 1)
        self.assertEqual(stats['created'], 0)

    @patch('channels.sync._get_amazon_client')
    def test_matched_sku_links_product_to_line_item(self, mock_get):
        from products.models import Product
        from sales.models import SalesOrderItem

        product = _make_product_with_stock(sku='TEST-SKU-001')

        mock_client = MagicMock()
        mock_client.get_orders.return_value = [_sample_amazon_order()]
        mock_client.get_order_items.return_value = [_sample_amazon_item(sku='TEST-SKU-001')]
        mock_get.return_value = mock_client

        from channels.sync import import_amazon_orders
        import_amazon_orders(self.channel, self.user)

        item = SalesOrderItem.objects.filter(sku='TEST-SKU-001').first()
        self.assertIsNotNone(item)
        self.assertEqual(item.product, product)

    @patch('channels.sync._get_amazon_client')
    def test_unmatched_sku_imports_order_with_null_product(self, mock_get):
        from sales.models import SalesOrderItem

        mock_client = MagicMock()
        mock_client.get_orders.return_value = [_sample_amazon_order()]
        mock_client.get_order_items.return_value = [_sample_amazon_item(sku='UNKNOWN-SKU-999')]
        mock_get.return_value = mock_client

        from channels.sync import import_amazon_orders
        stats = import_amazon_orders(self.channel, self.user)

        self.assertEqual(stats['created'], 1)
        item = SalesOrderItem.objects.filter(sku='UNKNOWN-SKU-999').first()
        self.assertIsNotNone(item)
        self.assertIsNone(item.product)

    @patch('channels.sync._get_amazon_client')
    def test_matched_sku_auto_creates_inactive_channel_listing(self, mock_get):
        from products.models import ChannelListing

        _make_product_with_stock(sku='TEST-SKU-001')

        mock_client = MagicMock()
        mock_client.get_orders.return_value = [_sample_amazon_order()]
        mock_client.get_order_items.return_value = [_sample_amazon_item(sku='TEST-SKU-001')]
        mock_get.return_value = mock_client

        from channels.sync import import_amazon_orders
        import_amazon_orders(self.channel, self.user)

        listing = ChannelListing.objects.filter(
            channel='amazon', external_sku='TEST-SKU-001'
        ).first()
        self.assertIsNotNone(listing)
        self.assertFalse(listing.is_active, 'Auto-created listings must start inactive')

    @patch('channels.sync._get_amazon_client')
    def test_barcode_fallback_matches_product(self, mock_get):
        from products.models import Product
        from sales.models import SalesOrderItem

        product = Product.objects.create(
            sku='INTERNAL-001',
            title='Barcode Product',
            buy_price=Decimal('3.00'),
            barcode='5012345678901',
        )

        mock_client = MagicMock()
        mock_client.get_orders.return_value = [_sample_amazon_order()]
        mock_client.get_order_items.return_value = [_sample_amazon_item(sku='5012345678901')]
        mock_get.return_value = mock_client

        from channels.sync import import_amazon_orders
        import_amazon_orders(self.channel, self.user)

        item = SalesOrderItem.objects.filter(sku='5012345678901').first()
        self.assertIsNotNone(item)
        self.assertEqual(item.product, product)

    @patch('channels.sync._get_amazon_client')
    def test_api_error_raises_value_error(self, mock_get):
        from channels.integrations.amazon import AmazonError

        mock_client = MagicMock()
        mock_client.get_orders.side_effect = AmazonError('SP-API unavailable')
        mock_get.return_value = mock_client

        from channels.sync import import_amazon_orders
        with self.assertRaises(ValueError) as ctx:
            import_amazon_orders(self.channel, self.user)
        self.assertIn('Amazon order fetch failed', str(ctx.exception))

    @patch('channels.sync._get_amazon_client')
    def test_item_fetch_failure_records_failed_status(self, mock_get):
        from channels.models import MarketplaceOrder

        mock_client = MagicMock()
        mock_client.get_orders.return_value = [_sample_amazon_order()]
        mock_client.get_order_items.side_effect = Exception('SP-API timeout')
        mock_get.return_value = mock_client

        from channels.sync import import_amazon_orders
        stats = import_amazon_orders(self.channel, self.user)

        self.assertEqual(stats['failed'], 1)
        mp = MarketplaceOrder.objects.filter(
            channel=self.channel, external_order_id='111-0000000-0000001'
        ).first()
        self.assertIsNotNone(mp)
        self.assertEqual(mp.status, MarketplaceOrder.STATUS_FAILED)
        self.assertIn('SP-API timeout', mp.error_message)

    @patch('channels.sync._get_amazon_client')
    def test_multiple_orders_processed(self, mock_get):
        mock_client = MagicMock()
        mock_client.get_orders.return_value = [
            _sample_amazon_order('111-1111111-1111111'),
            _sample_amazon_order('111-2222222-2222222'),
        ]
        mock_client.get_order_items.return_value = [_sample_amazon_item()]
        mock_get.return_value = mock_client

        from channels.sync import import_amazon_orders
        stats = import_amazon_orders(self.channel, self.user)

        self.assertEqual(stats['created'], 2)
        self.assertEqual(stats['processed'], 2)

    @patch('channels.sync._get_amazon_client')
    def test_created_after_set_from_last_synced(self, mock_get):
        from django.utils import timezone
        from datetime import timedelta

        mock_client = MagicMock()
        mock_client.get_orders.return_value = []
        mock_get.return_value = mock_client

        self.channel.last_synced = timezone.now() - timedelta(days=1)
        self.channel.save()

        from channels.sync import import_amazon_orders
        import_amazon_orders(self.channel, self.user)

        call_kwargs = mock_client.get_orders.call_args[1]
        self.assertIn('created_after', call_kwargs)
        self.assertIsNotNone(call_kwargs['created_after'])


# ══════════════════════════════════════════════════════════════════════════════
# push_stock_to_amazon
# ══════════════════════════════════════════════════════════════════════════════

class PushStockToAmazonTest(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='stocktester', password='pass')
        self.channel = _make_channel('Amazon Stock Channel')
        self.product = _make_product_with_stock(sku='STOCK-PROD-001', on_hand=50, reserved=10)

        from products.models import ChannelListing
        self.listing = ChannelListing.objects.create(
            product=self.product,
            channel='amazon',
            external_id='B000000001',
            external_sku='SELLER-SKU-001',
            is_active=True,
        )

    def test_dry_run_returns_preview_without_api_calls(self):
        from channels.sync import push_stock_to_amazon

        with patch('channels.sync._get_amazon_client') as mock_get:
            stats = push_stock_to_amazon(self.channel, dry_run=True)
            mock_get.assert_not_called()

        self.assertTrue(stats['dry_run'])
        self.assertEqual(len(stats['preview']), 1)
        preview = stats['preview'][0]
        self.assertEqual(preview['amazon_sku'], 'SELLER-SKU-001')
        self.assertEqual(preview['erp_sku'], 'STOCK-PROD-001')
        self.assertEqual(preview['qty'], 40)  # 50 on_hand - 10 reserved

    def test_dry_run_success_count(self):
        from channels.sync import push_stock_to_amazon
        with patch('channels.sync._get_amazon_client'):
            stats = push_stock_to_amazon(self.channel, dry_run=True)
        self.assertEqual(stats['success'], 1)
        self.assertEqual(stats['failed'], 0)

    @patch('channels.sync._get_amazon_client')
    def test_inactive_listing_not_pushed(self, mock_get):
        from products.models import ChannelListing
        from channels.sync import push_stock_to_amazon

        ChannelListing.objects.filter(pk=self.listing.pk).update(is_active=False)
        mock_client = MagicMock()
        mock_get.return_value = mock_client

        stats = push_stock_to_amazon(self.channel, dry_run=False)

        mock_client.update_listing_quantity.assert_not_called()
        self.assertEqual(stats['success'], 0)
        self.assertEqual(stats['not_confirmed'], 1)

    @patch('channels.sync._get_amazon_client')
    def test_live_push_calls_api_with_correct_args(self, mock_get):
        mock_client = MagicMock()
        mock_get.return_value = mock_client

        from channels.sync import push_stock_to_amazon
        stats = push_stock_to_amazon(self.channel, dry_run=False)

        self.assertEqual(stats['success'], 1)
        self.assertEqual(stats['failed'], 0)
        mock_client.update_listing_quantity.assert_called_once_with('SELLER-SKU-001', 40)

    @patch('channels.sync._get_amazon_client')
    def test_live_push_failure_counted_in_errors(self, mock_get):
        from channels.integrations.amazon import AmazonError

        mock_client = MagicMock()
        mock_client.update_listing_quantity.side_effect = AmazonError(
            'Listing not found', status_code='404'
        )
        mock_get.return_value = mock_client

        from channels.sync import push_stock_to_amazon
        stats = push_stock_to_amazon(self.channel, dry_run=False)

        self.assertEqual(stats['failed'], 1)
        self.assertEqual(stats['success'], 0)
        self.assertEqual(len(stats['errors']), 1)
        self.assertEqual(stats['errors'][0]['erp_sku'], 'STOCK-PROD-001')
        self.assertEqual(stats['errors'][0]['amazon_sku'], 'SELLER-SKU-001')

    @patch('channels.sync._get_amazon_client')
    def test_listing_without_external_sku_skipped(self, mock_get):
        from products.models import ChannelListing
        from channels.sync import push_stock_to_amazon

        # Listing with empty external_sku should be counted in skipped
        ChannelListing.objects.filter(pk=self.listing.pk).update(external_sku='')
        mock_client = MagicMock()
        mock_get.return_value = mock_client

        stats = push_stock_to_amazon(self.channel, dry_run=False)

        mock_client.update_listing_quantity.assert_not_called()
        self.assertEqual(stats['skipped'], 1)

    @patch('channels.sync._get_amazon_client')
    def test_live_push_updates_last_synced(self, mock_get):
        from products.models import ChannelListing
        from channels.sync import push_stock_to_amazon

        mock_get.return_value = MagicMock()
        push_stock_to_amazon(self.channel, dry_run=False)

        listing = ChannelListing.objects.get(pk=self.listing.pk)
        self.assertIsNotNone(listing.last_synced)


# ══════════════════════════════════════════════════════════════════════════════
# push_tracking_to_amazon
# ══════════════════════════════════════════════════════════════════════════════

class PushTrackingToAmazonTest(TestCase):

    def setUp(self):
        from channels.models import Channel, MarketplaceOrder
        from sales.models import SalesOrder
        from customers.models import Customer

        self.user = User.objects.create_user(username='tracktester', password='pass')
        self.channel = _make_channel('Amazon Tracking Channel')
        self.customer = Customer.objects.create(
            customer_number='AMZ-TEST-001',
            first_name='Jane',
            last_name='Doe',
            email='jane@example.com',
            customer_type=Customer.TYPE_MARKETPLACE,
            source='amazon',
        )
        self.so = SalesOrder.objects.create(
            channel='amazon',
            external_order_id='111-0000000-0000001',
            marketplace_order_id='111-0000000-0000001',
            customer=self.customer,
            status=SalesOrder.STATUS_CONFIRMED,
            payment_status=SalesOrder.PAYMENT_STATUS_PAID,
            ship_to_name='Jane Doe',
            ship_to_address1='1 Test Lane',
            ship_to_city='Manchester',
            ship_to_postcode='M1 1AA',
            ship_to_country='GB',
            subtotal=Decimal('19.99'),
            total_value=Decimal('23.98'),
            currency='GBP',
            created_by=self.user,
        )
        self.mp_order = MarketplaceOrder.objects.create(
            channel=self.channel,
            external_order_id='111-0000000-0000001',
            external_order_number='111-0000000-0000001',
            status=MarketplaceOrder.STATUS_IMPORTED,
            sales_order=self.so,
            raw_data={
                'AmazonOrderId': '111-0000000-0000001',
                '_items': [
                    {'OrderItemId': 'item-001', 'QuantityOrdered': 2},
                    {'OrderItemId': 'item-002', 'QuantityOrdered': 1},
                ],
            },
        )

    @patch('channels.sync._get_amazon_client')
    def test_tracking_push_succeeds(self, mock_get):
        mock_client = MagicMock()
        mock_get.return_value = mock_client

        from channels.sync import push_tracking_to_amazon
        result = push_tracking_to_amazon(
            self.channel,
            self.so,
            tracking_number='JD000000000GB',
            courier_override='royal mail',
        )

        self.assertTrue(result['success'])
        self.assertEqual(result['tracking'], 'JD000000000GB')
        self.assertEqual(result['carrier'], 'Royal Mail')
        self.assertEqual(result['order_id'], '111-0000000-0000001')

    @patch('channels.sync._get_amazon_client')
    def test_correct_carrier_normalised(self, mock_get):
        mock_client = MagicMock()
        mock_get.return_value = mock_client

        from channels.sync import push_tracking_to_amazon
        push_tracking_to_amazon(
            self.channel,
            self.so,
            tracking_number='JD000000000GB',
            courier_override='evri',  # evri → Hermes
        )

        call_kwargs = mock_client.confirm_shipment.call_args[1]
        self.assertEqual(call_kwargs['carrier_code'], 'Hermes')

    @patch('channels.sync._get_amazon_client')
    def test_all_order_items_included(self, mock_get):
        mock_client = MagicMock()
        mock_get.return_value = mock_client

        from channels.sync import push_tracking_to_amazon
        push_tracking_to_amazon(
            self.channel,
            self.so,
            tracking_number='JD000000000GB',
            courier_override='dhl',
        )

        call_kwargs = mock_client.confirm_shipment.call_args[1]
        order_items = call_kwargs['order_items']
        self.assertEqual(len(order_items), 2)
        item_ids = {i['order_item_id'] for i in order_items}
        self.assertEqual(item_ids, {'item-001', 'item-002'})

    def test_no_tracking_number_returns_error(self):
        from channels.sync import push_tracking_to_amazon
        result = push_tracking_to_amazon(self.channel, self.so)
        self.assertFalse(result['success'])
        self.assertIn('No tracking number', result['error'])

    def test_wrong_channel_returns_error(self):
        from channels.models import Channel
        from channels.sync import push_tracking_to_amazon

        other = Channel.objects.create(
            name='Other Amazon',
            channel_type='amazon',
            api_credentials={
                'lwa_client_id': 'id2',
                'lwa_client_secret': 'sec2',
                'refresh_token': 'tok2',
                'seller_id': 'SELLER999',
            },
        )
        result = push_tracking_to_amazon(other, self.so, tracking_number='JD111111111GB')
        self.assertFalse(result['success'])
        self.assertIn('not imported from this Amazon channel', result['error'])

    @patch('channels.sync._get_amazon_client')
    def test_empty_items_in_raw_data_returns_error(self, mock_get):
        from channels.models import MarketplaceOrder

        self.mp_order.raw_data = {'AmazonOrderId': '111-0000000-0000001', '_items': []}
        self.mp_order.save()

        from channels.sync import push_tracking_to_amazon
        result = push_tracking_to_amazon(
            self.channel,
            self.so,
            tracking_number='JD000000000GB',
            courier_override='dhl',
        )

        self.assertFalse(result['success'])
        self.assertIn('No order items', result['error'])

    @patch('channels.sync._get_amazon_client')
    def test_api_error_returns_error_dict(self, mock_get):
        from channels.integrations.amazon import AmazonError

        mock_client = MagicMock()
        mock_client.confirm_shipment.side_effect = AmazonError('Order already shipped')
        mock_get.return_value = mock_client

        from channels.sync import push_tracking_to_amazon
        result = push_tracking_to_amazon(
            self.channel,
            self.so,
            tracking_number='JD000000000GB',
            courier_override='dhl',
        )

        self.assertFalse(result['success'])
        self.assertIn('Order already shipped', result['error'])


# ══════════════════════════════════════════════════════════════════════════════
# Security: api_credentials must not appear in serialiser output
# ══════════════════════════════════════════════════════════════════════════════

class AmazonCredentialSecurityTest(TestCase):

    def setUp(self):
        self.channel = _make_channel('Amazon Security Test')
        # api_credentials are set in _make_channel

    def test_api_credentials_absent_from_serialiser_output(self):
        from channels.serializers import ChannelSerializer
        data = ChannelSerializer(self.channel).data
        self.assertNotIn('api_credentials', data)

    def test_raw_secrets_absent_from_credentials_summary(self):
        from channels.serializers import ChannelSerializer
        data = ChannelSerializer(self.channel).data
        summary = data['credentials_summary']
        # None of the raw secret fields should appear
        for secret_field in ('lwa_client_id', 'lwa_client_secret', 'refresh_token'):
            self.assertNotIn(secret_field, summary)

    def test_credentials_summary_is_configured_true(self):
        from channels.serializers import ChannelSerializer
        data = ChannelSerializer(self.channel).data
        self.assertTrue(data['credentials_summary']['is_configured'])

    def test_seller_id_hint_truncated(self):
        from channels.serializers import ChannelSerializer
        data = ChannelSerializer(self.channel).data
        hint = data['credentials_summary']['seller_id_hint']
        self.assertIn('…', hint)
        self.assertNotEqual(hint, 'SELLER123')

    def test_lwa_client_id_hint_truncated(self):
        from channels.serializers import ChannelSerializer
        data = ChannelSerializer(self.channel).data
        hint = data['credentials_summary']['lwa_client_id_hint']
        self.assertIn('…', hint)

    def test_has_refresh_token_is_boolean(self):
        from channels.serializers import ChannelSerializer
        data = ChannelSerializer(self.channel).data
        self.assertTrue(data['credentials_summary']['has_refresh_token'])

    def test_unconfigured_channel_is_configured_false(self):
        from channels.models import Channel
        from channels.serializers import ChannelSerializer
        empty = Channel.objects.create(
            name='Empty Amazon',
            channel_type='amazon',
            api_credentials={},
        )
        data = ChannelSerializer(empty).data
        self.assertFalse(data['credentials_summary']['is_configured'])
