#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render xizmatining env-vars larini to'liq tiklaydi (avvalgi PUT ularni o'chirgandi)."""
import json
import os
import sys
import urllib.request

KEY = os.getenv('RENDER_KEY', '')
SERVICE = 'srv-d9tikq6gekts738njb70'
ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render-env-to-paste.txt')


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
    # Sessiya Neon DB'da saqlanadi — env bo'sh qoldiriladi (launcher DB'dan o'qiydi)
    envs.append({'key': 'SESSION_B64', 'value': ''})
    return envs


def main():
    env_vars = parse_env(ENV_FILE)
    print(f'{len(env_vars)} ta env kaliti yuboriladi')

    req = urllib.request.Request(
        f'https://api.render.com/v1/services/{SERVICE}/env-vars',
        data=json.dumps(env_vars).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {KEY}',
            'Content-Type': 'application/json',
        },
        method='PUT',
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print('✅ HTTP', r.status, '- env vars tiklandi')
    except urllib.error.HTTPError as e:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        print(f'ERROR HTTP {e.code}:')
        print(e.read().decode('utf-8', errors='replace')[:2000])
        sys.exit(1)


if __name__ == '__main__':
    main()
