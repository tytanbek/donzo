/**
 * Card-number helpers for the admin card-payment pages.
 *
 * The card number shown to customers is a real-money destination, so the
 * admin UI must loudly warn when the stored value is still a test/placeholder
 * number, empty, or malformed — before customers start sending money to it.
 */

/** Known test/placeholder card numbers that must never reach customers. */
export const PLACEHOLDER_CARDS: string[] = [
  '112234455667788', // DONZO seed placeholder
  '8600000000000000', // generic test number
];

/** Digits only — strips spaces, dashes and other separators. */
export function cardDigits(value: string): string {
  return (value || '').replace(/[\s\-–—]/g, '');
}

export type CardCheck = {
  status: 'empty' | 'placeholder' | 'invalid' | 'valid';
  hint: string;
};

/**
 * Validate a card number the way the payment page needs it:
 * non-empty, not a known placeholder, 12–19 digits (UZCARD/HUMO are 16).
 */
export function validateCardNumber(value: string): CardCheck {
  const digits = cardDigits(value);
  if (!digits) {
    return { status: 'empty', hint: 'Karta raqami kiritilmagan — mijozlar to\'lov qila olmaydi.' };
  }
  if (PLACEHOLDER_CARDS.includes(digits)) {
    return {
      status: 'placeholder',
      hint: 'BU TEST RAQAM! Haqiqiy karta raqamini kiriting — aks holda mijozlar xato kartaga pul o\'tkazib yuboradi.',
    };
  }
  if (!/^\d{12,19}$/.test(digits)) {
    return {
      status: 'invalid',
      hint: 'Karta raqami noto\'g\'ri formatda — 12 dan 19 gacha raqam bo\'lishi kerak (masalan 8600 0000 0000 0000).',
    };
  }
  return { status: 'valid', hint: 'Karta raqami to\'g\'ri — mijozlar shu kartaga to\'lov qiladi.' };
}

/** True when the card is safe to show to customers. */
export function isCardReady(value: string): boolean {
  return validateCardNumber(value).status === 'valid';
}
