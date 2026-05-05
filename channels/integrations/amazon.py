"""
Amazon SP-API client using python-amazon-sp-api.

Credentials stored in channel.api_credentials:
{
    "lwa_client_id": "amzn1.application-oa2-client.xxx",
    "lwa_client_secret": "xxx",
    "refresh_token": "Atzr|...",
    "seller_id": "XXXXX",
    "marketplace_id": "A1F83G8C2ARO7P"   # UK default
}

No OAuth redirect flow — seller generates the refresh token once via
Amazon Seller Central > Apps & Services > Develop Apps and pastes it in.
"""
import logging
from datetime import datetime, timezone as _tz

logger = logging.getLogger(__name__)

# Map human-readable courier names to Amazon carrier codes
CARRIER_MAP: dict[str, str] = {
    'royal mail': 'Royal Mail',
    'royalmail': 'Royal Mail',
    'rm': 'Royal Mail',
    'dhl': 'DHL',
    'fedex': 'FedEx',
    'ups': 'UPS',
    'usps': 'USPS',
    'dpd': 'DPD',
    'hermes': 'Hermes',
    'evri': 'Hermes',
    'parcelforce': 'Parcelforce',
    'yodel': 'Yodel',
    'amazon logistics': 'Amazon Logistics UK',
}

UK_MARKETPLACE_ID = 'A1F83G8C2ARO7P'


def normalise_carrier(courier: str) -> str:
    if not courier:
        return 'Other'
    return CARRIER_MAP.get(courier.strip().lower(), courier.strip())


class AmazonError(Exception):
    def __init__(self, message: str, status_code: int = None):
        super().__init__(message)
        self.status_code = status_code


class AmazonClient:
    def __init__(
        self,
        lwa_client_id: str,
        lwa_client_secret: str,
        refresh_token: str,
        seller_id: str,
        marketplace_id: str = UK_MARKETPLACE_ID,
    ):
        self.lwa_client_id = lwa_client_id
        self.lwa_client_secret = lwa_client_secret
        self.refresh_token = refresh_token
        self.seller_id = seller_id
        self.marketplace_id = marketplace_id

        self._credentials = {
            'lwa_app_id': lwa_client_id,
            'lwa_client_secret': lwa_client_secret,
            'refresh_token': refresh_token,
        }

    @classmethod
    def from_channel(cls, channel) -> 'AmazonClient':
        creds = channel.api_credentials or {}
        required = ['lwa_client_id', 'lwa_client_secret', 'refresh_token', 'seller_id']
        missing = [k for k in required if not creds.get(k)]
        if missing:
            raise AmazonError(
                f"Channel '{channel.name}' is missing Amazon credentials: {', '.join(missing)}. "
                "Configure them on the Credentials tab."
            )
        return cls(
            lwa_client_id=creds['lwa_client_id'],
            lwa_client_secret=creds['lwa_client_secret'],
            refresh_token=creds['refresh_token'],
            seller_id=creds['seller_id'],
            marketplace_id=creds.get('marketplace_id') or UK_MARKETPLACE_ID,
        )

    def _marketplace_obj(self):
        """Return the sp_api Marketplaces enum member for our marketplace_id."""
        from sp_api.base import Marketplaces
        for m in Marketplaces:
            if m.marketplace_id == self.marketplace_id:
                return m
        # Fallback — use GB; SP-API will still work, we pass MarketplaceIds explicitly
        return Marketplaces.GB

    def _wrap(self, exc):
        """Convert SellingApiException → AmazonError with a readable message."""
        from sp_api.base import SellingApiException
        if isinstance(exc, SellingApiException):
            # SellingApiException stores the useful info in .message/.amzn_code,
            # not via super().__init__(), so str(exc) is empty.
            code = getattr(exc, 'amzn_code', None)
            msg = getattr(exc, 'message', None) or repr(getattr(exc, 'error', exc)) or 'SP-API error'
            return AmazonError(msg, status_code=code)
        return AmazonError(str(exc))

    # ── Test connection ───────────────────────────────────────────────────────

    def test_connection(self) -> dict:
        """
        Call the Sellers API to verify credentials.
        Returns {'ok': True, 'message': '...'} or raises AmazonError.
        """
        from sp_api.api import Sellers
        from sp_api.base import SellingApiException
        try:
            client = Sellers(credentials=self._credentials, marketplace=self._marketplace_obj())
            resp = client.get_marketplace_participations()
            participations = getattr(resp, 'payload', []) or []
            mp_names = []
            for p in participations:
                mp = p.get('marketplace', {})
                name = mp.get('name') or mp.get('id') or ''
                if name:
                    mp_names.append(name)
            mp_str = ', '.join(mp_names[:5]) if mp_names else 'unknown marketplace'
            return {
                'ok': True,
                'message': (
                    f"Connected. Seller ID: {self.seller_id}. "
                    f"Participating in: {mp_str}."
                ),
            }
        except SellingApiException as exc:
            raise self._wrap(exc) from exc
        except Exception as exc:
            raise AmazonError(f"Connection test failed: {exc}") from exc

    # ── Orders ────────────────────────────────────────────────────────────────

    def get_orders(self, created_after: str = None) -> list[dict]:
        """
        Fetch FBM (Merchant Fulfilled) orders with status Unshipped or PartiallyShipped.
        Paginates automatically.
        created_after: ISO-8601 datetime string e.g. '2026-01-01T00:00:00Z'
        Returns list of order dicts from the SP-API payload.
        """
        from sp_api.api import OrdersV0
        from sp_api.base import SellingApiException

        client = OrdersV0(credentials=self._credentials, marketplace=self._marketplace_obj())
        params = {
            'MarketplaceIds': [self.marketplace_id],
            'OrderStatuses': ['Unshipped', 'PartiallyShipped'],
            'FulfillmentChannels': ['MFN'],
        }
        if created_after:
            params['CreatedAfter'] = created_after

        all_orders = []
        next_token = None

        while True:
            try:
                if next_token:
                    resp = client.get_orders(NextToken=next_token, **{
                        k: v for k, v in params.items()
                        if k in ('MarketplaceIds',)
                    })
                else:
                    resp = client.get_orders(**params)
            except SellingApiException as exc:
                raise self._wrap(exc) from exc
            except Exception as exc:
                raise AmazonError(f"get_orders failed: {exc}") from exc

            payload = getattr(resp, 'payload', {}) or {}
            orders = payload.get('Orders') or []
            all_orders.extend(orders)

            next_token = payload.get('NextToken')
            if not next_token:
                break

        return all_orders

    def get_order_items(self, amazon_order_id: str) -> list[dict]:
        """
        Fetch line items for a single order.
        Returns list of OrderItem dicts.
        """
        from sp_api.api import OrdersV0
        from sp_api.base import SellingApiException

        client = OrdersV0(credentials=self._credentials, marketplace=self._marketplace_obj())
        all_items = []
        next_token = None

        while True:
            try:
                if next_token:
                    resp = client.get_order_items(amazon_order_id, NextToken=next_token)
                else:
                    resp = client.get_order_items(amazon_order_id)
            except SellingApiException as exc:
                raise self._wrap(exc) from exc
            except Exception as exc:
                raise AmazonError(f"get_order_items failed for {amazon_order_id}: {exc}") from exc

            payload = getattr(resp, 'payload', {}) or {}
            items = payload.get('OrderItems') or []
            all_items.extend(items)

            next_token = payload.get('NextToken')
            if not next_token:
                break

        return all_items

    # ── Stock push ────────────────────────────────────────────────────────────

    def update_listing_quantity(self, seller_sku: str, quantity: int):
        """
        Update the FBA/FBM available quantity for a listing via the Listings Items API.
        Uses a JSON Patch on fulfillment_availability.

        Raises AmazonError on failure.
        """
        from sp_api.api import ListingsItems
        from sp_api.base import SellingApiException

        client = ListingsItems(credentials=self._credentials, marketplace=self._marketplace_obj())

        body = {
            'productType': 'PRODUCT',
            'patches': [
                {
                    'op': 'replace',
                    'path': '/attributes/fulfillment_availability',
                    'value': [
                        {
                            'fulfillment_channel_code': 'DEFAULT',
                            'quantity': quantity,
                        }
                    ],
                }
            ],
        }

        try:
            resp = client.patch_listings_item(
                sellerId=self.seller_id,
                sku=seller_sku,
                marketplaceIds=[self.marketplace_id],
                body=body,
            )
            # SP-API returns HTTP 200 with status 'ACCEPTED' or 'INVALID'
            payload = getattr(resp, 'payload', {}) or {}
            result_status = payload.get('status', '')
            if result_status == 'INVALID':
                issues = payload.get('issues', [])
                msgs = '; '.join(i.get('message', str(i)) for i in issues[:3])
                raise AmazonError(f"Listing update INVALID for SKU {seller_sku}: {msgs}")
            logger.debug(
                'Amazon stock OK: seller_sku=%s qty=%d status=%s',
                seller_sku, quantity, result_status,
            )
        except SellingApiException as exc:
            raise self._wrap(exc) from exc
        except AmazonError:
            raise
        except Exception as exc:
            raise AmazonError(f"update_listing_quantity failed: {exc}") from exc

    # ── Tracking push ─────────────────────────────────────────────────────────

    def confirm_shipment(
        self,
        amazon_order_id: str,
        tracking_number: str,
        carrier_code: str,
        order_items: list[dict],
    ):
        """
        Confirm shipment for an Amazon order via the Orders API.

        order_items: list of {'order_item_id': str, 'quantity': int}
        Raises AmazonError on failure.
        """
        from sp_api.api import OrdersV0
        from sp_api.base import SellingApiException

        client = OrdersV0(credentials=self._credentials, marketplace=self._marketplace_obj())

        package_detail = {
            'packageReferenceId': amazon_order_id,
            'carrierCode': carrier_code,
            'trackingNumber': tracking_number,
            'shipDate': datetime.now(_tz.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'orderItems': [
                {
                    'orderItemId': item['order_item_id'],
                    'quantity': item['quantity'],
                }
                for item in order_items
            ],
        }

        body = {
            'packageDetail': package_detail,
            'marketplaceId': self.marketplace_id,
        }

        try:
            client.confirm_shipment(amazon_order_id, body=body)
            logger.info(
                'Amazon tracking pushed: order=%s tracking=%s carrier=%s',
                amazon_order_id, tracking_number, carrier_code,
            )
        except SellingApiException as exc:
            raise self._wrap(exc) from exc
        except Exception as exc:
            raise AmazonError(f"confirm_shipment failed for {amazon_order_id}: {exc}") from exc
