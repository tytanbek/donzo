"""
Migration for LoginIPMap — IP ↔ akkaunt xaritasi (multi-account anti-fraud).

Har bir muvaffaqiyatli kirishda (ip_address, user) juftligi yoziladi.
Bir IP'dan bir nechta akkaunt kirgani aniqlansa admin Telegram orqali
ogohlantiriladi (apps/users/ip_tracking.py).
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0018_user_birthday_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='LoginIPMap',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ip_address', models.CharField(db_index=True, max_length=45)),
                ('first_seen_at', models.DateTimeField(auto_now_add=True)),
                ('last_seen_at', models.DateTimeField(auto_now=True)),
                ('login_count', models.PositiveIntegerField(default=1)),
                ('device', models.CharField(blank=True, default='', max_length=500)),
                ('platform', models.CharField(blank=True, default='', max_length=100)),
                ('location', models.CharField(blank=True, default='', max_length=200)),
                ('alerted_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ip_logins', to='users.user')),
            ],
            options={
                'verbose_name': 'Login IP map',
                'verbose_name_plural': 'Login IP map',
                'db_table': 'login_ip_map',
                'ordering': ['-last_seen_at'],
                'unique_together': {('ip_address', 'user')},
            },
        ),
    ]
