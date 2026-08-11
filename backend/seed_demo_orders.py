"""
Demo Order Seeder for TOPUP HUB.

Creates realistic test orders to populate the admin dashboard with analytics data.
Run: python seed_demo_orders.py

This script is safe to run multiple times - it skips if demo orders already exist.
"""
import os
import sys
import random
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.utils import timezone
from apps.users.models import User, Role
from apps.services.models import Service, Package
from apps.orders.models import Order


def seed_demo_orders():
    print("[DEMO] Seeding demo orders...")

    # Check if demo orders already exist
    if Order.objects.filter(customer_name__startswith='[Demo]').count() >= 10:
        print("[DEMO] Demo orders already exist, skipping.")
        return

    # Get services with their packages
    services = Service.objects.filter(is_active=True)
    if not services.exists():
        print("[DEMO] No services found. Run seed_data.py first.")
        return

    # Demo customers
    customers = [
        ("Azizbek Karimov", "@azizkarimov"),
        ("Madina Rahimova", "@madinabonu"),
        ("Jahongir Aliyev", "@jahon_ali"),
        ("Dilnoza Xasanova", "@dilnoxa"),
        ("Sherzod Umarov", "@sherzod_uz"),
        ("Gulnora Abdullayeva", "@gulnora_a"),
    ]

    # Get operators
    operators = User.objects.filter(
        role__in=[Role.OPERATOR, Role.SENIOR_OPERATOR, Role.ADMIN, Role.SUPER_ADMIN]
    )[:3]

    # Order statuses with weights for realistic distribution
    statuses = ['completed'] * 6 + ['pending'] * 2 + ['processing'] * 2 + ['cancelled'] * 1

    now = timezone.now()
    orders_created = 0

    for day_offset in range(7):  # Last 7 days
        day_date = now - timedelta(days=day_offset)
        orders_per_day = random.randint(2, 5)

        for _ in range(orders_per_day):
            service = random.choice(services)
            packages = list(service.packages.all())
            if not packages:
                continue
            package = random.choice(packages)
            customer_name, customer_tg = random.choice(customers)
            status = random.choice(statuses)
            operator = random.choice(operators) if operators and status in ['completed', 'processing'] else None

            # Random time within the day
            hour = random.randint(8, 23)
            minute = random.randint(0, 59)
            created_at = day_date.replace(hour=hour, minute=minute, second=random.randint(0, 59))

            # Field values based on service
            field_values = {}
            for field in service.fields.all():
                if field.field_name == 'game_id':
                    field_values[field.field_name] = str(random.randint(1000000, 99999999))
                elif field.field_name == 'server_id':
                    field_values[field.field_name] = str(random.randint(1000, 9999))
                elif field.field_name == 'nickname':
                    field_values[field.field_name] = f"Player{random.randint(100, 999)}"
                elif field.field_name == 'username' or field.field_name == 'player_tag':
                    field_values[field.field_name] = f"@user{random.randint(1000, 9999)}"
                elif field.field_name == 'steam_id':
                    field_values[field.field_name] = f"STEAM_0:{random.randint(0,1)}:{random.randint(100000, 999999)}"
                elif field.field_name == 'riot_id':
                    field_values[field.field_name] = f"Player{random.randint(100, 999)}"
                elif field.field_name == 'tagline':
                    field_values[field.field_name] = f"#{random.choice(['EUW', 'NA1', 'KR', 'RU'])}"
                elif field.field_name == 'duration':
                    field_values[field.field_name] = random.choice(['1 month', '3 months', '6 months'])
                elif field.field_name == 'player_tag':
                    field_values[field.field_name] = f"#{random.choice(['2Y8', '9QC', '3PL', '8RJ'])}{random.randint(1000, 9999)}"
                else:
                    field_values[field.field_name] = f"value_{random.randint(100, 999)}"

            payment_status = random.choice(['paid', 'paid', 'paid', 'unpaid']) if status == 'completed' else 'unpaid'

            order = Order.objects.create(
                customer_name=customer_name,
                customer_telegram=customer_tg,
                service=service,
                package=package,
                field_values=field_values,
                total_price=package.price,
                status=status,
                payment_status=payment_status,
                payment_method=random.choice(['click', 'payme', 'uzum', '', '']) if payment_status == 'paid' else '',
                assigned_operator=operator if status in ['processing', 'completed'] else None,
            )

            # Override created_at by manipulating the field directly
            Order.objects.filter(id=order.id).update(created_at=created_at)
            orders_created += 1

    print(f"[DEMO] Created {orders_created} demo orders across 7 days.")
    print(f"[DEMO] Total orders now: {Order.objects.count()}")


if __name__ == '__main__':
    seed_demo_orders()
