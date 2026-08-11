// ── DONZO brand config (single source of truth) ──
// Audit finding #8: the site was branded "DONZO" while support links pointed
// to t.me/topuphub and the bot fallback was "TopTupUzbot" — inconsistent
// names make phishing/trust attacks easier. Everything public-facing flows
// from this one module; change a handle here and every header/footer/support
// link follows.

// Site display name
export const BRAND_NAME = 'DONZO';

// Telegram bot @username (without the '@'). Overridable via env so each
// environment (dev/staging/prod) can point at its own bot.
export const BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'TopTupUzbot';

export const BOT_URL = `https://t.me/${BOT_USERNAME}`;

// Support / social handles (without '@')
export const SUPPORT_TELEGRAM = 'topuphub';
export const SUPPORT_TELEGRAM_URL = `https://t.me/${SUPPORT_TELEGRAM}`;
export const INSTAGRAM_USERNAME = 'topuphub';
export const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_USERNAME}`;
