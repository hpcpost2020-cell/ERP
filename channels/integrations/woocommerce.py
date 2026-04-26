"""
WooCommerce REST API v3 client.

Authentication: HTTP Basic Auth (consumer_key : consumer_secret).
Requires HTTPS on the WooCommerce store — WC rejects Basic Auth over plain HTTP.

Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/
"""
import logging
from urllib.parse import urljoin

import requests
from requests.auth import HTTPBasicAuth

logger = logging.getLogger(__name__)


class WooCommerceError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


class WooCommerceClient:
    def __init__(
        self,
        store_url: str,
        consumer_key: str,
        consumer_secret: str,
        timeout: int = 30,
    ):
        # Normalise base URL — always ends with /wp-json/wc/v3/
        base = store_url.rstrip('/')
        if not base.endswith('/wp-json/wc/v3'):
            base = base + '/wp-json/wc/v3'
        self.base_url = base + '/'
        self.timeout = timeout
        self._session = requests.Session()
        self._session.auth = HTTPBasicAuth(consumer_key, consumer_secret)
        self._session.headers.update({'Content-Type': 'application/json'})

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _url(self, path: str) -> str:
        return urljoin(self.base_url, path.lstrip('/'))

    def _request(self, method: str, path: str, **kwargs):
        url = self._url(path)
        try:
            resp = self._session.request(method, url, timeout=self.timeout, **kwargs)
        except requests.exceptions.SSLError as exc:
            raise WooCommerceError(
                f"SSL error connecting to {url}. Ensure HTTPS is enabled on your store: {exc}"
            )
        except requests.exceptions.ConnectionError as exc:
            raise WooCommerceError(f"Cannot connect to {url}: {exc}")
        except requests.exceptions.Timeout:
            raise WooCommerceError(f"Request to {url} timed out after {self.timeout}s")

        if not resp.ok:
            try:
                body = resp.json()
                msg = body.get('message') or body.get('error') or resp.text[:300]
            except Exception:
                msg = resp.text[:300]
            raise WooCommerceError(
                f"WooCommerce {resp.status_code}: {msg}",
                status_code=resp.status_code,
            )
        return resp.json()

    def _get(self, path: str, params: dict = None):
        return self._request('GET', path, params=params or {})

    def _post(self, path: str, data: dict):
        return self._request('POST', path, json=data)

    def _put(self, path: str, data: dict):
        return self._request('PUT', path, json=data)

    # ── Connection test ───────────────────────────────────────────────────────

    def test_connection(self) -> dict:
        """GET /system_status — verifies credentials and returns store info."""
        return self._get('system_status')

    # ── Orders ───────────────────────────────────────────────────────────────

    def get_orders(
        self,
        statuses: list = None,
        page: int = 1,
        per_page: int = 100,
        after: str = None,
    ) -> list:
        """
        Fetch orders. `after` is an ISO 8601 datetime string.
        `statuses` is a list like ['processing', 'on-hold'].
        """
        params = {
            'page': page,
            'per_page': min(per_page, 100),
            'orderby': 'date',
            'order': 'asc',
        }
        if statuses:
            params['status'] = ','.join(statuses)
        if after:
            params['after'] = after
        return self._get('orders', params)

    def get_order(self, wc_order_id: int) -> dict:
        return self._get(f'orders/{wc_order_id}')

    def update_order(self, wc_order_id: int, data: dict) -> dict:
        return self._put(f'orders/{wc_order_id}', data)

    def add_order_note(
        self, wc_order_id: int, note: str, customer_note: bool = False
    ) -> dict:
        return self._post(f'orders/{wc_order_id}/notes', {
            'note': note,
            'customer_note': customer_note,
        })

    # ── Products / Stock ─────────────────────────────────────────────────────

    def get_product_by_sku(self, sku: str) -> dict | None:
        """Returns first WooCommerce product matching the SKU, or None."""
        results = self._get('products', {'sku': sku, 'per_page': 1})
        if isinstance(results, list) and results:
            return results[0]
        return None

    def get_products(self, page: int = 1, per_page: int = 100) -> list:
        return self._get('products', {'page': page, 'per_page': min(per_page, 100)})

    def update_product_stock(self, wc_product_id: int, qty: int) -> dict:
        """Set stock_quantity on a simple product."""
        return self._put(f'products/{wc_product_id}', {
            'stock_quantity': max(0, int(qty)),
            'manage_stock': True,
        })

    def update_variation_stock(
        self, wc_product_id: int, variation_id: int, qty: int
    ) -> dict:
        """Set stock_quantity on a product variation."""
        return self._put(
            f'products/{wc_product_id}/variations/{variation_id}',
            {'stock_quantity': max(0, int(qty)), 'manage_stock': True},
        )
