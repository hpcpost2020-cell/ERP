#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "================================================"
echo "  ERP / OMS System - Startup"
echo "================================================"

echo ""
echo "[1/4] Running database migrations..."
python3 manage.py migrate --run-syncdb 2>&1

echo ""
echo "[2/4] Checking demo data..."
PROD_COUNT=$(python3 manage.py shell -c "from products.models import Product; print(Product.objects.count())" 2>/dev/null)
if [ "$PROD_COUNT" = "0" ] || [ -z "$PROD_COUNT" ]; then
    echo "  Seeding demo data..."
    python3 manage.py seed_demo
else
    echo "  Data already seeded ($PROD_COUNT products found). Skipping."
fi

echo ""
echo "[3/4] Collecting static files..."
python3 manage.py collectstatic --noinput 2>&1 | tail -2

echo ""
echo "[4/4] Starting server..."
echo ""
echo "================================================"
echo "  ERP System is ready!"
echo ""
echo "  URL:      http://localhost:8000"
echo ""
echo "  Login:    admin / Admin1234!"
echo ""
echo "  Users:"
echo "    admin          (full access)"
echo "    sarah.jones    (management)"
echo "    mike.warehouse (warehouse)"
echo "    emma.cs        (customer service)"
echo "    james.accounts (accounts)"
echo ""
echo "  All passwords: Admin1234!"
echo "================================================"
echo ""

python3 manage.py runserver 0.0.0.0:8000
