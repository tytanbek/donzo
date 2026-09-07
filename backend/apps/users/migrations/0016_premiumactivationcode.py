"""
Migration for PremiumActivationCode model.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0015_user_geo_source'),
    ]

    operations = [
        migrations.CreateModel(
            name='PremiumActivationCode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(db_index=True, max_length=20, unique=True)),
                ('milestone', models.PositiveIntegerField(help_text='Referal milestone (30, 60, 90...)')),
                ('status', models.CharField(choices=[('active', 'Faol'), ('used', 'Ishlatilgan'), ('expired', "Muddati o'tgan")], default='active', max_length=20)),
                ('activated_at', models.DateTimeField(blank=True, null=True)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('activated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='activated_premium_codes', to='users.user')),
                ('referrer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='premium_codes', to='users.user')),
            ],
            options={
                'db_table': 'premium_activation_codes',
                'ordering': ['-created_at'],
            },
        ),
    ]
