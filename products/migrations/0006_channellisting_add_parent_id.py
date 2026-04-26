from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0005_seed_receiving_bay_location'),
    ]

    operations = [
        migrations.AddField(
            model_name='channellisting',
            name='parent_id',
            field=models.CharField(
                max_length=255,
                blank=True,
                default='',
                help_text='WooCommerce parent product ID for variations; empty for simple products',
            ),
            preserve_default=False,
        ),
    ]
