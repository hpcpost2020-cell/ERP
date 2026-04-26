from django.db import migrations


def create_receiving_bay(apps, schema_editor):
    StockLocation = apps.get_model('products', 'StockLocation')
    # If no receiving bay already exists, create one
    if not StockLocation.objects.filter(is_receiving_bay=True).exists():
        loc, created = StockLocation.objects.get_or_create(
            code='RECV',
            defaults={
                'name': 'Receiving Bay',
                'description': 'Primary goods-in and QC inspection area',
                'is_active': True,
                'is_receiving_bay': True,
            }
        )
        if not created:
            # Location exists with code RECV but wasn't flagged yet
            loc.is_receiving_bay = True
            loc.save()


def reverse_receiving_bay(apps, schema_editor):
    StockLocation = apps.get_model('products', 'StockLocation')
    StockLocation.objects.filter(code='RECV').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0004_add_receiving_bay_to_location'),
    ]

    operations = [
        migrations.RunPython(create_receiving_bay, reverse_receiving_bay),
    ]
