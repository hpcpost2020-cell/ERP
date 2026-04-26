"""
eBay REST API client.

Authentication: OAuth 2.0 user tokens (Fulfillment + Inventory scopes).
Token refresh is handled automatically in EbayClient.from_channel(); the new
access token is written back to channel.api_credentials immediately.

Marketplace default: EBAY_GB.  Override via credentials['marketplace_id'].

eBay REST API docs:
  Orders:    https://developer.ebay.com/api-docs/sell/fulfillment/resources/order
  Inventory: https://developer.ebay.com/api-docs/sell/inventory/resources/inventory_item
"""
import base64
import logging
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode, quote

import requests

logger = logging.getLogger(__name__)

# Scopes required for this integration
OAUTH_SCOPES = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.account',
]

# Map common human-readable courier names to eBay carrier codes
CARRIER_MAP: dict[str, str] = {
    'royal mail': 'ROYALMAIL',
    'royalmail': 'ROYALMAIL',
    'royal_mail': 'ROYALMAIL',
    'rm': 'ROYALMAIL',
    'dhl': 'DHL',
    'fedex': 'FEDEX',
    'fed ex': 'FEDEX',
    'ups': 'UPS',
    'usps': 'USPS',
    'dpd': 'DPD',
    'hermes': 'HERMES_UK',
    'evri': 'HERMES_UK',
    'parcelforce': 'PARCELFORCE',
    'yodel': 'YODEL',
    'amazon logistics': 'AMAZON',
    'tnt': 'TNT',
    'gls': 'GLS',
    'dhl express': 'DHL',
}


def normalise_carrier(courier: str) -> str:
    """Map a human courier name to an eBay carrier code string."""
    if not courier:
        return 'OTHER'
    key = courier.strip().lower()
    return CARRIER_MAP.get(key, 'OTHER')


class EbayError(Exception):
    def __init__(self, message: str, status_code: int = None):
        super().__init__(message)
        self.status_code = status_code


class EbayClient:
    PROD_AUTH_URL = 'https://auth.ebay.com/oauth2/authorize'
    SANDBOX_AUTH_URL = 'https://auth.sandbox.ebay.com/oauth2/authorize'
    PROD_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
    SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
    PROD_API_BASE = 'https://api.ebay.com'
    SANDBOX_API_BASE = 'https://api.sandbox.ebay.com'

    def __init__(
        self,
        app_id: str,
        cert_id: str,
        access_token: str,
        sandbox: bool = False,
        marketplace_id: str = 'EBAY_GB',
        timeout: int = 30,
    ):
        self.app_id = app_id
        self.cert_id = cert_id
        self.access_token = access_token
        self.sandbox = sandbox
        self.api_base = self.SANDBOX_API_BASE if sandbox else self.PROD_API_BASE
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': marketplace_id,
        })

    # ── OAuth helpers ─────────────────────────────────────────────────────────

    @classmethod
    def build_auth_url(cls, app_id: str, ru_name: str, sandbox: bool = False) -> str:
        """
        Generate the eBay user-consent URL.
        The user visits this URL, grants access, and eBay redirects to ru_name
        with ?code=... appended.  They copy that code and paste it into the ERP.
        """
        base = cls.SANDBOX_AUTH_URL if sandbox else cls.PROD_AUTH_URL
        params = {
            'client_id': app_id,
            'redirect_uri': ru_name,
            'response_type': 'code',
            'scope': ' '.join(OAUTH_SCOPES),
        }
        return f'{base}?{urlencode(params)}'

    @classmethod
    def exchange_code(
        cls,
        app_id: str,
        cert_id: str,
        ru_name: str,
        code: str,
        sandbox: bool = False,
    ) -> dict:
        """
        Exchange an OAuth authorization code for access + refresh tokens.
        Returns a dict to merge into channel.api_credentials.
        """
        token_url = cls.SANDBOX_TOKEN_URL if sandbox else cls.PROD_TOKEN_URL
        credentials = base64.b64encode(f'{app_id}:{cert_id}'.encode()).decode()
        resp = requests.post(
            token_url,
            headers={
                'Authorization': f'Basic {credentials}',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': ru_name,
            },
            timeout=30,
        )
        if not resp.ok:
            raise EbayError(
                f'eBay token exchange failed ({resp.status_code}): {resp.text}',
                status_code=resp.status_code,
            )
        data = resp.json()
        now = datetime.now(timezone.utc)
        return {
            'access_token': data['access_token'],
            'refresh_token': data.get('refresh_token', ''),
            'token_expires_at': (
                now + timedelta(seconds=int(data.get('expires_in', 7200)))
            ).isoformat(),
            'refresh_token_expires_at': (
                now + timedelta(seconds=int(data.get('refresh_token_expires_in', 47304000)))
            ).isoformat(),
        }

    @classmethod
    def _do_refresh(
        cls,
        app_id: str,
        cert_id: str,
        refresh_token: str,
        sandbox: bool = False,
    ) -> dict:
        """Use the refresh token to get a new access token."""
        token_url = cls.SANDBOX_TOKEN_URL if sandbox else cls.PROD_TOKEN_URL
        credentials = base64.b64encode(f'{app_id}:{cert_id}'.encode()).decode()
        resp = requests.post(
            token_url,
            headers={
                'Authorization': f'Basic {credentials}',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data={
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
                'scope': ' '.join(OAUTH_SCOPES),
            },
            timeout=30,
        )
        if not resp.ok:
            raise EbayError(
                f'eBay token refresh failed ({resp.status_code}): {resp.text}',
                status_code=resp.status_code,
            )
        data = resp.json()
        now = datetime.now(timezone.utc)
        return {
            'access_token': data['access_token'],
            'token_expires_at': (
                now + timedelta(seconds=int(data.get('expires_in', 7200)))
            ).isoformat(),
        }

    @classmethod
    def from_channel(cls, channel) -> 'EbayClient':
        """
        Build a client from a Channel instance, auto-refreshing the access token
        if it expires within the next 5 minutes. Saves the refreshed token back
        to channel.api_credentials.
        Raises EbayError if credentials are incomplete or refresh fails.
        """
        creds = channel.api_credentials or {}
        app_id = (creds.get('app_id') or '').strip()
        cert_id = (creds.get('cert_id') or '').strip()
        access_token = (creds.get('access_token') or '').strip()
        refresh_token = (creds.get('refresh_token') or '').strip()
        sandbox = bool(creds.get('sandbox', False))
        marketplace_id = (creds.get('marketplace_id') or 'EBAY_GB').strip()

        if not app_id or not cert_id:
            raise EbayError('eBay App ID and Cert ID are required. Configure them on the Credentials tab.')

        if not access_token:
            raise EbayError(
                'No eBay access token. Complete OAuth setup: save App ID + Cert ID + RuName, '
                'generate the auth URL, visit it, and paste the code back.'
            )

        # Auto-refresh if expiring within 5 minutes
        expires_str = creds.get('token_expires_at', '')
        if expires_str:
            try:
                expires_at = datetime.fromisoformat(expires_str)
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) >= expires_at - timedelta(minutes=5):
                    if not refresh_token:
                        raise EbayError(
                            'eBay access token has expired and no refresh token is stored. '
                            'Re-authenticate via the Credentials tab.'
                        )
                    logger.info('Refreshing eBay access token for channel %s', channel.name)
                    token_data = cls._do_refresh(app_id, cert_id, refresh_token, sandbox)
                    access_token = token_data['access_token']
                    creds['access_token'] = access_token
                    creds['token_expires_at'] = token_data['token_expires_at']
                    channel.api_credentials = creds
                    channel.save(update_fields=['api_credentials'])
            except ValueError:
                pass  # Unparseable expiry — use the stored token as-is

        return cls(
            app_id=app_id,
            cert_id=cert_id,
            access_token=access_token,
            sandbox=sandbox,
            marketplace_id=marketplace_id,
        )

    # ── Internal HTTP helpers ─────────────────────────────────────────────────

    def _get(self, path: str, params: dict = None) -> dict:
        url = f'{self.api_base}{path}'
        resp = self._session.get(url, params=params, timeout=self.timeout)
        if not resp.ok:
            raise EbayError(
                f'eBay GET {path} → {resp.status_code}: {resp.text[:500]}',
                status_code=resp.status_code,
            )
        return resp.json()

    def _post(self, path: str, data: dict = None) -> dict:
        url = f'{self.api_base}{path}'
        resp = self._session.post(url, json=data or {}, timeout=self.timeout)
        if not resp.ok:
            raise EbayError(
                f'eBay POST {path} → {resp.status_code}: {resp.text[:500]}',
                status_code=resp.status_code,
            )
        return resp.json() if resp.content else {}

    def _put(self, path: str, data: dict) -> dict:
        url = f'{self.api_base}{path}'
        resp = self._session.put(url, json=data, timeout=self.timeout)
        if not resp.ok:
            raise EbayError(
                f'eBay PUT {path} → {resp.status_code}: {resp.text[:500]}',
                status_code=resp.status_code,
            )
        return resp.json() if resp.content else {}

    # ── Connection test ───────────────────────────────────────────────────────

    def test_connection(self) -> dict:
        """
        Call /sell/account/v1/privilege to verify the token and return seller info.
        Returns: {ok: bool, message: str}
        """
        data = self._get('/sell/account/v1/privilege')
        selling_limit = (
            data.get('sellingLimit', {})
            .get('amount', {})
            .get('value', 'unknown')
        )
        return {
            'ok': True,
            'message': f'Connected to eBay. Selling limit: {selling_limit}.',
        }

    # ── Fulfillment API — Orders ──────────────────────────────────────────────

    def get_orders(self, after: str = None, limit: int = 50, offset: int = 0) -> dict:
        """
        GET /sell/fulfillment/v1/order

        Fetches orders that are NOT_STARTED or IN_PROGRESS (i.e. awaiting fulfilment).
        Returns the raw API response dict with keys: orders, total, limit, offset, next.

        after: ISO 8601 datetime string, e.g. '2024-01-01T00:00:00Z'
        """
        filter_parts = ['orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}']
        if after:
            filter_parts.append(f'creationdate:[{after}..]')
        params = {
            'filter': ','.join(filter_parts),
            'limit': min(limit, 200),
            'offset': offset,
        }
        return self._get('/sell/fulfillment/v1/order', params=params)

    def get_order(self, order_id: str) -> dict:
        """GET /sell/fulfillment/v1/order/{orderId}"""
        return self._get(f'/sell/fulfillment/v1/order/{quote(order_id, safe="")}')

    def ship_order(
        self,
        order_id: str,
        tracking_number: str,
        carrier_code: str,
        line_items: list,
        shipped_date: str = None,
    ) -> dict:
        """
        POST /sell/fulfillment/v1/order/{orderId}/shipping_fulfillment
        Marks the order as shipped with the given tracking number.

        line_items: [{"lineItemId": "1", "quantity": 1}, ...]
        carrier_code: eBay carrier code, e.g. 'ROYALMAIL', 'DHL'
        """
        if not shipped_date:
            shipped_date = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
        payload = {
            'lineItems': line_items,
            'shippedDate': shipped_date,
            'shippingCarrierCode': carrier_code,
            'trackingNumber': tracking_number,
        }
        return self._post(
            f'/sell/fulfillment/v1/order/{quote(order_id, safe="")}/shipping_fulfillment',
            payload,
        )

    # ── Inventory API — Stock ─────────────────────────────────────────────────

    def get_inventory_item(self, sku: str) -> dict | None:
        """
        GET /sell/inventory/v1/inventory_item/{sku}
        Returns None if the item does not exist in the Inventory API (404).
        """
        try:
            return self._get(f'/sell/inventory/v1/inventory_item/{quote(sku, safe="")}')
        except EbayError as exc:
            if exc.status_code == 404:
                return None
            raise

    def update_inventory_quantity(self, sku: str, quantity: int) -> dict:
        """
        PUT /sell/inventory/v1/inventory_item/{sku}

        Fetches the existing inventory item, patches the shipToLocationAvailability
        quantity, then PUTs it back.  If no item exists in the Inventory API
        (listing was created via the old Sell Your Item flow), creates a minimal
        inventory item record.

        Note: eBay ignores PUT for fixed-price listings that were not created
        through the Inventory API — the call succeeds but stock won't change on
        the listing.  In that case you'll see status 200 but the old qty remains.
        """
        existing = self.get_inventory_item(sku)
        if existing:
            payload = dict(existing)
        else:
            payload = {'condition': 'NEW'}

        payload.setdefault('availability', {})
        payload['availability']['shipToLocationAvailability'] = {
            'quantity': max(0, int(quantity))
        }
        return self._put(f'/sell/inventory/v1/inventory_item/{quote(sku, safe="")}', payload)
