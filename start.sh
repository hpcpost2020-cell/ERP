#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "================================================"
echo "  ERP / OMS System - Startup"
echo "================================================"

echo ""
echo "[1/5] Building frontend..."
if [ ! -f "frontend/dist/index.html" ]; then
    echo "  Installing npm dependencies..."
    npm install --prefix frontend --silent
    echo "  Building React app..."
    npm run build --prefix frontend
    echo "  Frontend build complete."
else
    echo "  Frontend already built. Skipping."
fi

echo ""
echo "[2/5] Running database migrations..."
python3 manage.py migrate --run-syncdb 2>&1

echo ""
echo "[3/5] Checking demo data..."
PROD_COUNT=$(python3 manage.py shell -c "from products.models import Product; print(Product.objects.count())" 2>/dev/null)
if [ "$PROD_COUNT" = "0" ] || [ -z "$PROD_COUNT" ]; then
    echo "  Seeding demo data..."
    python3 manage.py seed_demo
else
    echo "  Data already seeded ($PROD_COUNT products found). Skipping."
fi

echo ""
echo "[4/5] Collecting static files..."
python3 manage.py collectstatic --noinput 2>&1 | tail -2

echo ""
echo "[5/5] Starting server..."
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
