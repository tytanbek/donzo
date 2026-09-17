# Generated migration — birthday fields for User model.
# These were originally in birthday/0001_initial.py but that caused a
# cross-app KeyError because AddField must reference the same app.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0017_merge_20260910_1950'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='birthday_date',
            field=models.DateField(blank=True, help_text='Tugilgan kun (DD-MM format)', null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='birthday_year_hidden',
            field=models.BooleanField(default=False, help_text='Tugilgan yilni yashirish'),
        ),
        migrations.AddField(
            model_name='user',
            name='birthday_timezone',
            field=models.CharField(blank=True, default='Asia/Tashkent', max_length=60),
        ),
    ]
