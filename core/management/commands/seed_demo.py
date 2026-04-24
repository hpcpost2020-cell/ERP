import random
from datetime import date, timedelta
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = 'Seed database with realistic demo data'

    def handle(self, *args, **options):
        self.stdout.write('Seeding demo data...')
        self._create_users()
        self._create_categories()
        self._create_locations()
        self._create_suppliers()
        self._create_products()
        self._create_customers()
        self._create_channels()
        self._create_purchase_orders()
        self._create_sales_orders()
        self._create_invoices()
        self.stdout.write(self.style.SUCCESS('Demo data seeded successfully!'))

    def _create_users(self):
        from users.models import User
        users_data = [
            {'username': 'admin', 'email': 'admin@erp.local', 'first_name': 'Admin', 'last_name': 'User', 'role': 'admin', 'is_staff': True, 'is_superuser': True},
            {'username': 'sarah.jones', 'email': 'sarah@erp.local', 'first_name': 'Sarah', 'last_name': 'Jones', 'role': 'management'},
            {'username': 'mike.warehouse', 'email': 'mike@erp.local', 'first_name': 'Mike', 'last_name': 'Thompson', 'role': 'warehouse'},
            {'username': 'emma.cs', 'email': 'emma@erp.local', 'first_name': 'Emma', 'last_name': 'Wilson', 'role': 'customer_service'},
            {'username': 'james.accounts', 'email': 'james@erp.local', 'first_name': 'James', 'last_name': 'Roberts', 'role': 'accounts'},
        ]
        for ud in users_data:
            if not User.objects.filter(username=ud['username']).exists():
                u = User(**{k: v for k, v in ud.items() if k != 'password'})
                u.set_password('Admin1234!')
                u.save()
                self.stdout.write(f'  Created user: {ud["username"]}')

    def _create_categories(self):
        from products.models import Category
        cats = ['Office Supplies', 'Paper & Stationery', 'Filing & Storage', 'Desk Accessories',
                'Printer Consumables', 'Cleaning & Facilities', 'Packaging & Despatch',
                'Technology & Accessories', 'Furniture']
        for name in cats:
            Category.objects.get_or_create(name=name)

    def _create_locations(self):
        from products.models import StockLocation
        locs = [
            ('MAIN-WH', 'Main Warehouse'),
            ('AISLE-A', 'Aisle A - Shelving'),
            ('AISLE-B', 'Aisle B - Shelving'),
            ('BULK-1', 'Bulk Storage Area 1'),
            ('DISPATCH', 'Dispatch Bay'),
            ('QUARANTINE', 'Quarantine / Damaged'),
        ]
        for code, name in locs:
            StockLocation.objects.get_or_create(code=code, defaults={'name': name})

    def _create_suppliers(self):
        from suppliers.models import Supplier
        suppliers_data = [
            {'name': 'Premier Office Supplies Ltd', 'code': 'POS', 'contact_name': 'Dave Clark', 'email': 'orders@premieroffice.com', 'phone': '0800 100 200', 'payment_terms': 'net30', 'lead_time_days': 2, 'city': 'Birmingham', 'postcode': 'B1 1AB'},
            {'name': 'EuroStationery Wholesale', 'code': 'ESW', 'contact_name': 'Klaus Müller', 'email': 'sales@eurostationery.eu', 'phone': '+49 30 12345', 'payment_terms': 'net60', 'lead_time_days': 7, 'city': 'Hamburg', 'country': 'Germany'},
            {'name': 'FastPack Packaging Ltd', 'code': 'FPP', 'contact_name': 'Lisa Chen', 'email': 'lisa@fastpack.co.uk', 'phone': '0121 555 1234', 'payment_terms': 'net14', 'lead_time_days': 3, 'city': 'Coventry', 'postcode': 'CV1 2AB'},
            {'name': 'CleanBrite Facilities', 'code': 'CBF', 'contact_name': 'Tom Walsh', 'email': 'orders@cleanbrite.com', 'phone': '0333 123 4567', 'payment_terms': 'net30', 'lead_time_days': 4, 'city': 'Manchester', 'postcode': 'M1 1AA'},
            {'name': 'TechPrint Consumables', 'code': 'TPC', 'contact_name': 'Priya Patel', 'email': 'priya@techprint.co.uk', 'phone': '020 7654 3210', 'payment_terms': 'net30', 'lead_time_days': 2, 'city': 'London', 'postcode': 'EC1A 1BB'},
        ]
        for sd in suppliers_data:
            Supplier.objects.get_or_create(code=sd['code'], defaults=sd)

    def _create_products(self):
        from products.models import Product, Category, StockLocation, StockLevel
        from users.models import User
        admin = User.objects.filter(username='admin').first()
        cats = {c.name: c for c in Category.objects.all()}
        main_loc = StockLocation.objects.filter(code='MAIN-WH').first()
        dispatch_loc = StockLocation.objects.filter(code='DISPATCH').first()

        products_data = [
            {'sku': 'A4-WH-80G-500', 'title': 'A4 White 80gsm Copy Paper - 500 Sheets', 'category': 'Paper & Stationery', 'buy_price': '2.30', 'sell_price': '4.99', 'barcode': '5060001001', 'brand': 'Xerox', 'weight_kg': '2.4'},
            {'sku': 'A4-WH-80G-2500', 'title': 'A4 White 80gsm Copy Paper - 2500 Sheets (5 Ream Box)', 'category': 'Paper & Stationery', 'buy_price': '9.50', 'sell_price': '18.99', 'barcode': '5060001002', 'brand': 'Xerox', 'weight_kg': '12.0'},
            {'sku': 'BIRO-BK-12', 'title': 'Black Ballpoint Pens - Box of 12', 'category': 'Office Supplies', 'buy_price': '1.20', 'sell_price': '2.49', 'barcode': '5060001010', 'brand': 'Bic', 'weight_kg': '0.1'},
            {'sku': 'BIRO-BK-50', 'title': 'Black Ballpoint Pens - Box of 50', 'category': 'Office Supplies', 'buy_price': '4.50', 'sell_price': '8.99', 'barcode': '5060001011', 'brand': 'Bic', 'weight_kg': '0.4'},
            {'sku': 'HIGHLIGHTER-5PK', 'title': 'Highlighter Pens - Assorted 5 Pack', 'category': 'Office Supplies', 'buy_price': '1.80', 'sell_price': '3.99', 'barcode': '5060001020', 'brand': 'Stabilo', 'weight_kg': '0.08'},
            {'sku': 'LEVER-ARCH-A4', 'title': 'A4 Lever Arch File - Black', 'category': 'Filing & Storage', 'buy_price': '2.10', 'sell_price': '4.49', 'barcode': '5060001030', 'brand': 'Elba', 'weight_kg': '0.6'},
            {'sku': 'LEVER-ARCH-A4-5', 'title': 'A4 Lever Arch Files - Pack of 5', 'category': 'Filing & Storage', 'buy_price': '8.00', 'sell_price': '16.99', 'barcode': '5060001031', 'brand': 'Elba', 'weight_kg': '3.0'},
            {'sku': 'STAPLER-HD', 'title': 'Heavy Duty Stapler - 25 Sheet Capacity', 'category': 'Desk Accessories', 'buy_price': '5.50', 'sell_price': '11.99', 'barcode': '5060001040', 'brand': 'Rapid', 'weight_kg': '0.3'},
            {'sku': 'STAPLES-26-6-5K', 'title': 'Staples 26/6 - 5000 Pack', 'category': 'Desk Accessories', 'buy_price': '1.50', 'sell_price': '3.49', 'barcode': '5060001041', 'brand': 'Rapid', 'weight_kg': '0.2'},
            {'sku': 'INK-HP304-BK', 'title': 'HP 304 Black Ink Cartridge', 'category': 'Printer Consumables', 'buy_price': '6.50', 'sell_price': '14.99', 'barcode': '5060001050', 'brand': 'HP', 'weight_kg': '0.08'},
            {'sku': 'INK-HP304-COL', 'title': 'HP 304 Tri-Colour Ink Cartridge', 'category': 'Printer Consumables', 'buy_price': '7.50', 'sell_price': '16.99', 'barcode': '5060001051', 'brand': 'HP', 'weight_kg': '0.09'},
            {'sku': 'TONER-BRO-TN2420', 'title': 'Brother TN-2420 Black Toner Cartridge', 'category': 'Printer Consumables', 'buy_price': '14.00', 'sell_price': '29.99', 'barcode': '5060001052', 'brand': 'Brother', 'weight_kg': '0.35'},
            {'sku': 'STICKY-NOTE-100', 'title': 'Sticky Notes 76x76mm Yellow - 100 Sheets', 'category': 'Office Supplies', 'buy_price': '0.60', 'sell_price': '1.49', 'barcode': '5060001060', 'brand': 'Post-it', 'weight_kg': '0.05'},
            {'sku': 'STICKY-NOTE-12PK', 'title': 'Sticky Notes 76x76mm Mixed Colours - 12 Pack', 'category': 'Office Supplies', 'buy_price': '5.20', 'sell_price': '10.99', 'barcode': '5060001061', 'brand': 'Post-it', 'weight_kg': '0.55'},
            {'sku': 'DESK-TIDY-BLACK', 'title': 'Mesh Desk Tidy Organiser - Black', 'category': 'Desk Accessories', 'buy_price': '4.00', 'sell_price': '9.99', 'barcode': '5060001070', 'brand': 'Durable', 'weight_kg': '0.35'},
            {'sku': 'BUBBLE-WRAP-50M', 'title': 'Bubble Wrap Roll 500mm x 50m', 'category': 'Packaging & Despatch', 'buy_price': '7.50', 'sell_price': '14.99', 'barcode': '5060001080', 'brand': 'Own Brand', 'weight_kg': '1.1'},
            {'sku': 'TAPE-CLEAR-48X66', 'title': 'Clear Packing Tape 48mm x 66m - 6 Pack', 'category': 'Packaging & Despatch', 'buy_price': '5.00', 'sell_price': '9.99', 'barcode': '5060001081', 'brand': 'Own Brand', 'weight_kg': '0.8'},
            {'sku': 'HAND-SANITISER-1L', 'title': 'Hand Sanitiser Gel 1 Litre', 'category': 'Cleaning & Facilities', 'buy_price': '3.50', 'sell_price': '7.99', 'barcode': '5060001090', 'brand': 'Dettol', 'weight_kg': '1.1'},
            {'sku': 'MOUSE-WIRELESS-BK', 'title': 'Wireless Optical Mouse - Black', 'category': 'Technology & Accessories', 'buy_price': '8.00', 'sell_price': '19.99', 'barcode': '5060001100', 'brand': 'Logitech', 'weight_kg': '0.09'},
            {'sku': 'USB-HUB-4PORT', 'title': 'USB 3.0 Hub 4-Port', 'category': 'Technology & Accessories', 'buy_price': '7.00', 'sell_price': '16.99', 'barcode': '5060001101', 'brand': 'Anker', 'weight_kg': '0.12'},
        ]

        for pd in products_data:
            cat = cats.get(pd.pop('category'))
            stock_qty = random.randint(10, 200)
            p, created = Product.objects.get_or_create(
                sku=pd['sku'],
                defaults={**pd, 'category': cat, 'low_stock_threshold': 5,
                          'reorder_quantity': 20, 'created_by': admin,
                          'buy_price': Decimal(pd.get('buy_price', '5.00')),
                          'sell_price': Decimal(pd.get('sell_price', '9.99'))}
            )
            if created and main_loc:
                StockLevel.objects.get_or_create(
                    product=p, location=main_loc,
                    defaults={'qty_on_hand': stock_qty, 'qty_reserved': 0}
                )

    def _create_customers(self):
        from customers.models import Customer, CustomerAddress
        customers_data = [
            {'company_name': 'Acme Office Solutions Ltd', 'email': 'orders@acme-office.co.uk', 'phone': '0121 234 5678', 'customer_type': 'wholesale', 'payment_terms': 'net30'},
            {'company_name': 'Brightside Accountants', 'email': 'accounts@brightside.co.uk', 'phone': '020 3456 7890', 'customer_type': 'wholesale', 'payment_terms': 'net14'},
            {'company_name': 'TechStart Ltd', 'email': 'admin@techstart.co.uk', 'phone': '0161 987 6543', 'customer_type': 'wholesale', 'payment_terms': 'prepay'},
            {'first_name': 'John', 'last_name': 'Smith', 'email': 'john.smith@gmail.com', 'phone': '07700 100001', 'customer_type': 'retail', 'payment_terms': 'prepay'},
            {'first_name': 'Sarah', 'last_name': 'Brown', 'email': 'sarah.brown@outlook.com', 'phone': '07700 100002', 'customer_type': 'retail', 'payment_terms': 'prepay'},
            {'first_name': 'Mark', 'last_name': 'Davies', 'email': 'markdavies@hotmail.com', 'phone': '07700 100003', 'customer_type': 'retail', 'payment_terms': 'prepay'},
            {'company_name': 'Pinnacle Property Group', 'email': 'facilities@pinnacleproperty.com', 'phone': '01234 567890', 'customer_type': 'wholesale', 'payment_terms': 'net60'},
            {'first_name': 'Lucy', 'last_name': 'Turner', 'email': 'lucy.turner@gmail.com', 'phone': '07700 100004', 'customer_type': 'retail', 'payment_terms': 'prepay'},
            {'company_name': 'MedCore Clinics', 'email': 'purchasing@medcore.nhs.uk', 'phone': '01908 123456', 'customer_type': 'wholesale', 'payment_terms': 'net30'},
            {'first_name': 'Paul', 'last_name': 'Wright', 'email': 'paul.wright@yahoo.co.uk', 'phone': '07700 100005', 'customer_type': 'retail', 'payment_terms': 'prepay'},
        ]
        from users.models import User
        admin = User.objects.filter(username='admin').first()
        import datetime
        for i, cd in enumerate(customers_data):
            prefix = f"CUST{datetime.date.today().year}"
            cn = f"{prefix}{(i+1):04d}"
            c, created = Customer.objects.get_or_create(
                email=cd['email'],
                defaults={**cd, 'customer_number': cn, 'status': 'active', 'created_by': admin}
            )
            if created:
                CustomerAddress.objects.create(
                    customer=c, address_type='both', is_default=True,
                    address_line1=f"{random.randint(1, 200)} {random.choice(['High Street', 'Business Park', 'Commerce Way', 'Main Road'])}",
                    city=random.choice(['London', 'Birmingham', 'Manchester', 'Leeds', 'Bristol', 'Sheffield']),
                    postcode=f"{random.choice(['SW1A', 'B1', 'M1', 'LS1', 'BS1'])} {random.randint(1,9)}{random.choice(['AA', 'BB', 'CC'])}",
                    country='United Kingdom',
                )

    def _create_channels(self):
        from channels.models import Channel
        channels_data = [
            {'name': 'eBay Store', 'channel_type': 'ebay', 'status': 'active', 'auto_import_orders': True},
            {'name': 'Amazon UK', 'channel_type': 'amazon', 'status': 'active', 'auto_import_orders': True},
            {'name': 'Own Website (WooCommerce)', 'channel_type': 'woocommerce', 'status': 'active', 'auto_import_orders': True},
            {'name': 'Direct / Phone Orders', 'channel_type': 'direct', 'status': 'active', 'auto_import_orders': False},
            {'name': 'Wholesale Accounts', 'channel_type': 'wholesale', 'status': 'active', 'auto_import_orders': False},
        ]
        from users.models import User
        admin = User.objects.filter(username='admin').first()
        for cd in channels_data:
            Channel.objects.get_or_create(name=cd['name'], defaults={**cd, 'created_by': admin})

    def _create_purchase_orders(self):
        from purchasing.models import PurchaseOrder, PurchaseOrderItem
        from suppliers.models import Supplier
        from products.models import Product
        from users.models import User
        admin = User.objects.filter(username='admin').first()
        suppliers = list(Supplier.objects.all())
        products = list(Product.objects.all())
        today = date.today()
        statuses = ['sent', 'sent', 'part_received', 'received', 'received', 'closed', 'draft', 'acknowledged']
        for i in range(12):
            supplier = random.choice(suppliers)
            expected = today - timedelta(days=random.randint(-7, 30))
            st = random.choice(statuses)
            po = PurchaseOrder.objects.create(
                supplier=supplier,
                status=st,
                expected_delivery_date=expected,
                payment_terms=supplier.payment_terms,
                created_by=admin,
            )
            for _ in range(random.randint(2, 6)):
                prod = random.choice(products)
                PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    product=prod,
                    qty_ordered=random.randint(10, 100),
                    qty_received=random.randint(0, 50) if st in ['part_received', 'received', 'closed'] else 0,
                    unit_cost=prod.buy_price,
                )

    def _create_sales_orders(self):
        from sales.models import SalesOrder, SalesOrderItem
        from customers.models import Customer
        from products.models import Product
        from shipping.models import Shipment
        from users.models import User
        admin = User.objects.filter(username='admin').first()
        customers = list(Customer.objects.all())
        products = list(Product.objects.all())
        channels = ['ebay', 'amazon', 'woocommerce', 'direct', 'wholesale']
        statuses = ['pending', 'confirmed', 'processing', 'awaiting_dispatch', 'dispatched',
                    'delivered', 'completed', 'completed', 'completed']
        pay_statuses = ['paid', 'paid', 'paid', 'unpaid', 'partial']
        couriers = ['evri', 'royal_mail', 'dpd']
        today = date.today()

        for i in range(60):
            customer = random.choice(customers)
            channel = random.choice(channels)
            order_status = random.choice(statuses)
            pay_status = 'paid' if order_status in ['completed', 'delivered', 'dispatched'] else random.choice(pay_statuses)
            days_ago = random.randint(0, 90)
            created = timezone.now() - timedelta(days=days_ago)
            order = SalesOrder(
                customer=customer,
                channel=channel,
                status=order_status,
                payment_status=pay_status,
                ship_to_name=customer.display_name,
                ship_to_email=customer.email,
                ship_to_phone=customer.phone,
                created_by=admin,
            )
            addr = customer.addresses.filter(is_default=True).first()
            if addr:
                order.ship_to_address1 = addr.address_line1
                order.ship_to_city = addr.city
                order.ship_to_postcode = addr.postcode
                order.ship_to_country = addr.country
            order.save()
            order.created_at = created
            order.save(update_fields=['created_at'])

            for _ in range(random.randint(1, 5)):
                prod = random.choice(products)
                qty = random.randint(1, 10)
                SalesOrderItem.objects.create(
                    order=order, product=prod, sku=prod.sku, title=prod.title,
                    quantity=qty, unit_price=prod.sell_price,
                    buy_price_at_time=prod.buy_price,
                    vat_rate=Decimal('20.00'),
                )
            order.recalculate_totals()

            if order_status in ['dispatched', 'delivered', 'completed']:
                courier = random.choice(couriers)
                tracking = f"{''.join([str(random.randint(0,9)) for _ in range(14)])}"
                Shipment.objects.create(
                    sales_order=order,
                    courier=courier,
                    tracking_number=tracking,
                    status='delivered' if order_status in ['delivered', 'completed'] else 'dispatched',
                    cost=Decimal(str(round(random.uniform(2.5, 7.5), 2))),
                    dispatched_at=created + timedelta(days=1),
                    created_by=admin,
                )
                order.dispatched_date = (created + timedelta(days=1)).date()
                order.save(update_fields=['dispatched_date'])

    def _create_invoices(self):
        from invoicing.models import Invoice, InvoiceItem
        from sales.models import SalesOrder
        from users.models import User
        import datetime
        admin = User.objects.filter(username='admin').first()
        orders = SalesOrder.objects.filter(status__in=['completed', 'delivered']).select_related('customer')[:20]
        for order in orders:
            if order.invoices.exists():
                continue
            inv = Invoice.objects.create(
                sales_order=order,
                customer=order.customer,
                status=Invoice.STATUS_PAID if order.payment_status == 'paid' else Invoice.STATUS_ISSUED,
                issue_date=order.created_at.date(),
                due_date=order.created_at.date() + timedelta(days=30),
                subtotal=order.subtotal,
                vat_amount=order.vat_amount,
                discount_amount=order.discount_amount,
                total_amount=order.total_value,
                amount_paid=order.total_value if order.payment_status == 'paid' else Decimal('0'),
                bill_to_name=order.ship_to_name,
                bill_to_company=order.ship_to_company,
                bill_to_address=f"{order.ship_to_address1}\n{order.ship_to_city} {order.ship_to_postcode}",
                created_by=admin,
            )
            for item in order.items.all():
                InvoiceItem.objects.create(
                    invoice=inv, description=item.title, sku=item.sku,
                    quantity=item.quantity, unit_price=item.unit_price,
                    discount_pct=item.discount_pct, vat_rate=item.vat_rate,
                )
