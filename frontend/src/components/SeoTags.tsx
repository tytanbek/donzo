/**
 * SEO va ulashish (Open Graph / Twitter) meta-teglari.
 * Root layout client komponent bo'lgani uchun `metadata` export ishlamaydi —
 * teglar har uchala <head> ichida shu komponent orqali beriladi.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://donzo-eight.vercel.app').replace(/\/$/, '');

const TITLE = "DONZO — PUBG UC, Free Fire, Mobile Legends donat | Tez va xavfsiz top-up";
const DESCRIPTION =
  "PUBG UC, Free Fire va Mobile Legends diamond, Telegram Premium — rasmiy paketlar, aniq narx va tez yetkazish. " +
  "Telegram bot orqali bir daqiqada buyurtma bering.";
const OG_IMAGE = `${SITE_URL}/ads/og.jpg`;

export default function SeoTags() {
  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <meta name="keywords" content="PUBG UC, Free Fire diamond, Mobile Legends diamond, Telegram Premium, donat, top-up, DONZO" />
      <link rel="canonical" href={SITE_URL} />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="DONZO" />
      <meta property="og:locale" content="uz_UZ" />
      <meta property="og:url" content={SITE_URL} />
      <meta property="og:title" content={TITLE} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:image" content={OG_IMAGE} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="DONZO — o'yinlar uchun premium top-up" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={TITLE} />
      <meta name="twitter:description" content={DESCRIPTION} />
      <meta name="twitter:image" content={OG_IMAGE} />
    </>
  );
}
