# DONZO (TOPUP HUB) — Top-up platformasi

O'yinlar va raqamli xizmatlar uchun top-up platformasi. Operatorlar
buyurtmalarni bajaradi, admin panel barcha jarayonni boshqaradi.

> ## FRAGMENT LOGIN
> Telegram initData/kod login tizimi olib tashlangan. Kirish **Fragment API**
> orqali: web app ochilganda foydalanuvchi Telegram username'ini kiritadi →
> backend `POST /getInfo` (fragment-api.uz) orqali jonli ma'lumotni (ism,
> rasm, premium) oladi → User yozuviga (user id) biriktiradi va JWT
> qaytaradi. Keyin foydalanuvchi user id orqali aniqlanadi.
>
> - Endpoint: `POST /api/v1/auth/fragment-login/ {username}`
> - Admin: `fragment_admin_usernames` Setting'idagi usernames (vergul bilan)
>   avtomatik super_admin bo'ladi.
> - Dev uchun eski `POST /api/v1/auth/demo-login/ {role}` ham saqlangan.

## Tuzilma

```
backend/   Django 5.2 + DRF + Channels (auth, katalog, buyurtmalar, to'lovlar,
           cardpay, security, settings_app, ws)
frontend/  Next.js 14 App Router + TypeScript + Tailwind (mini-app + admin)
```

## Ishga tushirish

### Backend (Windows, loyiha ildizidan)

```bash
cd backend
py -m venv venv
venv/Scripts/python.exe -m pip install -r requirements.txt
venv/Scripts/python.exe manage.py migrate
venv/Scripts/python.exe seed_data.py        # katalog (11 xizmat, 49 paket)
venv/Scripts/python.exe manage.py runserver # http://localhost:8000
```

Yangi terminalda:

```bash
cd backend
venv/Scripts/python.exe bot_supervisor.py   # Telegram bot (24/7)
```

Tunnel (telegram Web App uchun HTTPS):

```bash
cloudflared tunnel --url http://localhost:8000
```

So'ng admin panelda `web_app_url` kalitini yangi tunnel URL'ga o'rnating va
`frontend/.env.local` dagi `NEXT_PUBLIC_API_URL` ni yangilang.

### Frontend

Node bu mashinada `%LOCALAPPDATA%\Programs\nodejs\node-v24.19.0-win-x64` da
(portable, PATH'da yo'q). Har bir buyruqda PATH'ga qo'shing yoki bir marta:

```bash
export PATH="$LOCALAPPDATA/Programs/nodejs/node-v24.19.0-win-x64:$PATH"
cd frontend
npm install
npm run build      # ✓ 31/31 sahifa, typecheck toza
npm run dev        # http://localhost:3002
```

`.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

## Kalitlar (Setting DB)

Asosiy kalitlar admin panel → Sozlamalar bo'limida (yoki
`apps/settings_app/services.py`):

- `telegram_bot_token` / `telegram_bot_token_alt` — bot tokenlari
  (shifrlangan). Alt token eski bot (@TopTupUzbot) uchun — hash_mismatch
  muammosini hal qiladi.
- `web_app_url` — Web App URL (bot tugmasi + login)
- `super_admin_telegram_id` — egasi (default 2007554600, avtomatik
  SUPER_ADMIN bo'ladi)
- `staff_telegram_ids` — xodimlar (vergul bilan, bot xabarlari uchun)
- `payment_card_number` / `payment_card_holder` — to'lov kartasi
- `gemini_api_key` — AI tahlil (shifrlangan)

## Testlar

```bash
cd backend
venv/Scripts/python.exe manage.py test   # 103 ta test, hammasi yashil
```

`apps/users/tests_api_integration.py` — frontend chaqiradigan barcha
endpoint'lar mavjudligini va javob shakllarini mahkamlaydi (48 URL).

## Yordamchi scriptlar

```bash
venv/Scripts/python.exe seed_data.py           # katalog (11 xizmat, 49 paket)
venv/Scripts/python.exe seed_settings.py       # 45 ta default kalit (hujjat 9-bo'lim)
venv/Scripts/python.exe seed_demo_orders.py    # demo buyurtmalar (analitika)
venv/Scripts/python.exe bind_owner.py [tg_id]  # egani SUPER_ADMIN qilish
venv/Scripts/python.exe daily_audit_report.py --dry-run  # kunlik audit hisoboti
venv/Scripts/python.exe bot_supervisor.py      # Telegram bot (24/7)
```

`daily_audit_report.py --install` — Windows Task Scheduler'ga kuniga 09:00
vazifasini o'rnatadi (`DONZO_DailyAuditReport`).

## Muhim arxitektura qarorlari

1. **Login** — faqat Telegram orqali. `initData` HMAC-SHA256 bilan
   tekshiriladi; `signature` (ECDSA) check-string'dan chiqariladi
   (real qurilmalarda hash_mismatch beradigan ildiz sabab).
2. **Cardpay** — karta xabarlari `unique_amount` bo'yicha moslashtiriladi;
   risk engine qaror qiladi (APPROVE/HOLD/BLOCK); HOLD incident yaratadi.
3. **Xavfsizlik** — qoidalar (velocity, yangi akkaunt, blacklist) + Gemini
   AI (shadow/enforce rejim); AI ishlamasa ham qoidalar qarorni beradi.
4. **WS** — 'admin_all' guruhi; sessiyalar va buyurtmalar jonli push.
5. **Settings** — maxfiy kalitlar Fernet bilan shifrlangan, kalit DB'da emas.
