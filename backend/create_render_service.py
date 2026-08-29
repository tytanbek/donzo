#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render API orqali donzo-backend xizmatini yaratadi (public repo'dan)."""
import base64
import json
import os
import sys
import urllib.request

KEY = os.getenv('RENDER_KEY', '')
ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render-env-to-paste.txt')
SESSION_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sessions', 'donzo_user.session')


def parse_env(path):
    envs = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                k, v = line.split('=', 1)
                envs.append({'key': k.strip(), 'value': v.strip()})
    return envs


def main():
    env_vars = parse_env(ENV_FILE)

    # Telethon sessiyasi (user_client karta monitori uchun) — base64 env'da.
    if os.path.exists(SESSION_FILE):
        with open(SESSION_FILE, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('ascii')
        env_vars.append({'key': 'SESSION_B64', 'value': b64})
        print(f"SESSION_B64: {len(b64)} belgi (sessiya env'ga joylandi)")
    else:
        print("DIQQAT: sessiya fayli topilmadi — user_client ishlamaydi!")

    print(f"Env kalitlari: {len(env_vars)}")

    body = {
        'type': 'web_service',
        'name': 'donzo-backend',
        'ownerId': 'tea-d9th86qjobas73d04v80',
        'repo': 'https://github.com/Mirjahon0242/donzo-deploy',
        'branch': 'main',
        'autoDeploy': 'yes',
        'envVars': env_vars,
        'serviceDetails': {
            'runtime': 'docker',
            'plan': 'free',
            'region': 'frankfurt',
            'dockerfilePath': 'Dockerfile',
            'healthCheckPath': '/health/',
            'numInstances': 1,
        },
    }

    req = urllib.request.Request(
        'https://api.render.com/v1/services',
        data=json.dumps(body).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {KEY}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read().decode('utf-8'))
            svc = resp.get('service', {})
            print('\n✅ XIZMAT YARATILDI:')
            print('  id:', svc.get('id'))
            print('  name:', svc.get('name'))
            print('  dashboard:', svc.get('dashboardUrl'))
            print('  deployId:', resp.get('deployId'))
            with open(os.path.join(os.path.dirname(ENV_FILE), 'render-service-id.txt'), 'w') as f:
                f.write(svc.get('id', ''))
    except urllib.error.HTTPError as e:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        print(f'\nERROR HTTP {e.code}:')
        print(e.read().decode('utf-8', errors='replace')[:2000])
        sys.exit(1)


if __name__ == '__main__':
    main()
