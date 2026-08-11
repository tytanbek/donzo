import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const fragmentLoginMock = vi.fn();
const requestLoginCodeMock = vi.fn();
const verifyLoginCodeMock = vi.fn();
const deviceInfoMock = vi.fn();
vi.mock('@/lib/api', () => ({
  authAPI: {
    fragmentLogin: (...args: any[]) => fragmentLoginMock(...args),
    requestLoginCode: (...args: any[]) => requestLoginCodeMock(...args),
    verifyLoginCode: (...args: any[]) => verifyLoginCodeMock(...args),
    deviceInfo: (...args: any[]) => deviceInfoMock(...args),
  },
}));

vi.mock('@/lib/store', () => ({
  useStore: () => ({
    setUser: vi.fn(),
    setAuthChecked: vi.fn(),
  }),
}));

import FragmentLogin from './FragmentLogin';

describe('FragmentLogin (FRAGMENT LOGIN)', () => {
  beforeEach(() => {
    fragmentLoginMock.mockReset();
    requestLoginCodeMock.mockReset();
    verifyLoginCodeMock.mockReset();
    deviceInfoMock.mockReset();
    deviceInfoMock.mockResolvedValue({ data: {} });
    localStorage.clear();
    delete (window as any).Telegram;
    // Geolokatsiya mavjud emas — GPS rad etilgan holatni simulyatsiya qiladi
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (_ok: any, err: any) => err && err() },
      configurable: true,
    });
  });

  it('renders username input and continue button', () => {
    render(<FragmentLogin />);
    expect(screen.getByPlaceholderText('username')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Davom etish/i })).toBeTruthy();
  });

  it('requests a bot confirmation code after entering the username', async () => {
    requestLoginCodeMock.mockResolvedValue({ data: { status: 'sent' } });
    render(<FragmentLogin />);
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: '@Test_User' } });
    fireEvent.click(screen.getByRole('button', { name: /Davom etish/i }));

    await waitFor(() => {
      expect(requestLoginCodeMock).toHaveBeenCalledWith('Test_User', undefined);
    });
    // Kod bosqichi ochiladi
    await waitFor(() => {
      expect(screen.getByText(/Tasdiqlash kodi yuborildi/i)).toBeTruthy();
    });
  });

  it('shows the bot-not-started message when code cannot be sent', async () => {
    requestLoginCodeMock.mockRejectedValue({
      response: { data: { detail: "Tasdiqlash kodi yuborilmadi. @DONZOROBOT'ni ochib Start tugmasini bosing." } },
    });
    render(<FragmentLogin />);
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'uz_ultra' } });
    fireEvent.click(screen.getByRole('button', { name: /Davom etish/i }));

    await waitFor(() => {
      expect(screen.getByText(/Start tugmasini bosing/i)).toBeTruthy();
    });
  });

  it('verifies the code, then asks for exact device location before navigating', async () => {
    // Username bosqichi
    requestLoginCodeMock.mockResolvedValue({ data: { status: 'dev', code: '123456' } });
    verifyLoginCodeMock.mockResolvedValue({
      data: {
        access: 'tok', refresh: 'rf',
        user: { id: 1, role: 'customer', username: 'test_user' },
      },
    });
    render(<FragmentLogin />);
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'test_user' } });
    fireEvent.click(screen.getByRole('button', { name: /Davom etish/i }));

    // Kod bosqichi — dev kodi avtomatik to'ldirildi, tasdiqlaymiz
    await waitFor(() => {
      expect(screen.getByText(/Tasdiqlash kodi yuborildi/i)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tasdiqlash/i }));

    await waitFor(() => {
      expect(verifyLoginCodeMock).toHaveBeenCalledWith('test_user', '123456');
    });
    // ── Aniq joylashuv bosqichi: login o'tdi, GPS so'raladi ──
    // Token hali saqlanmagan (lokatsiya tugagach saqlanadi — layout login
    // ekranini olib tashlamasligi uchun)
    await waitFor(() => {
      expect(screen.getByText(/Aniq joylashuvni aniqlash/i)).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /Ruxsat berish/i })).toBeTruthy();
    expect(localStorage.getItem('access_token')).toBeNull();

    // "Keyinroq" — IP fallback yuboriladi, token saqlanadi va panelga o'tiladi
    fireEvent.click(screen.getByRole('button', { name: /Keyinroq/i }));
    await waitFor(() => {
      expect(deviceInfoMock).toHaveBeenCalledWith(expect.any(Object));
    });
    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBe('tok');
    });
  });

  it('shows a 5-minute countdown on the resend button', async () => {
    requestLoginCodeMock.mockResolvedValue({ data: { status: 'dev', code: '123456' } });
    render(<FragmentLogin />);
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'test_user' } });
    fireEvent.click(screen.getByRole('button', { name: /Davom etish/i }));

    // Kod bosqichi: tugmada qolgan vaqt ko'rinadi (5:00 dan boshlab)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Kodni qayta yuborish \(\d:\d\d\)/ })).toBeTruthy();
    });
    // Eskiradigan vaqt ham ko'rsatiladi
    await waitFor(() => {
      expect(screen.getByText(/da eskiradi/)).toBeTruthy();
    });
  });

  it('shows an error when the code is wrong', async () => {
    requestLoginCodeMock.mockResolvedValue({ data: { status: 'dev', code: '123456' } });
    verifyLoginCodeMock.mockRejectedValue({
      response: { data: { detail: "Kod noto'g'ri yoki muddati o'tgan." } },
    });
    render(<FragmentLogin />);
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'test_user' } });
    fireEvent.click(screen.getByRole('button', { name: /Davom etish/i }));
    await waitFor(() => {
      expect(screen.getByText(/Tasdiqlash kodi yuborildi/i)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tasdiqlash/i }));

    await waitFor(() => {
      expect(screen.getByText(/muddati o'tgan/i)).toBeTruthy();
    });
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('auto-submits the remembered username without manual typing', async () => {
    localStorage.setItem('last_username', 'remembered_user');
    fragmentLoginMock.mockResolvedValue({
      data: {
        access: 'tok2', refresh: 'rf2',
        user: { id: 2, role: 'customer', username: 'remembered_user' },
      },
    });
    render(<FragmentLogin />);

    await waitFor(() => {
      expect(fragmentLoginMock).toHaveBeenCalledWith('remembered_user', '');
    });
    // Lokatsiya bosqichi ko'rinadi, token hali yo'q
    await waitFor(() => {
      expect(screen.getByText(/Aniq joylashuvni aniqlash/i)).toBeTruthy();
    });
    expect(localStorage.getItem('access_token')).toBeNull();
    // GPS rad etilgan simulyatsiyada "Ruxsat berish" → IP fallback + device-info
    fireEvent.click(screen.getByRole('button', { name: /Ruxsat berish/i }));
    await waitFor(() => {
      expect(deviceInfoMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBe('tok2');
    });
  });

  it('rejects a username that does not match the Telegram account', async () => {
    // Telegram ichida: JORIY akkaunt username = real_user
    (window as any).Telegram = { WebApp: { initDataUnsafe: { user: { id: 42, username: 'real_user' } } } };
    // Avtomatik kirish real_user bilan uriniladi va muvaffaqiyatsiz bo'ladi
    // (Fragment API xatosi) → forma ochiladi.
    fragmentLoginMock.mockRejectedValue({ response: { data: { detail: 'xatolik' } } });
    render(<FragmentLogin />);
    await waitFor(() => {
      expect(fragmentLoginMock).toHaveBeenCalledWith('real_user', 'real_user');
    });
    fragmentLoginMock.mockClear();
    requestLoginCodeMock.mockClear();

    // Boshqa birovning username'ini yozadi → rad etilishi kerak
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'other_user' } });
    fireEvent.click(screen.getByRole('button', { name: /Davom etish/i }));

    await waitFor(() => {
      expect(screen.getByText(/mos emas/)).toBeTruthy();
    });
    expect(fragmentLoginMock).not.toHaveBeenCalled();
    expect(requestLoginCodeMock).not.toHaveBeenCalled();
  });

  it('sends the code request with the Telegram account id when matching', async () => {
    (window as any).Telegram = { WebApp: { initDataUnsafe: { user: { id: 42, username: 'real_user' } } } };
    fragmentLoginMock.mockRejectedValue({ response: { data: { detail: 'xatolik' } } });
    requestLoginCodeMock.mockResolvedValue({ data: { status: 'sent' } });
    render(<FragmentLogin />);
    await waitFor(() => {
      expect(fragmentLoginMock).toHaveBeenCalledWith('real_user', 'real_user');
    });

    // O'Z username'ini kiritadi (harf katta-kichik farqi bilan) → kod so'raladi
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'Real_User' } });
    fireEvent.click(screen.getByRole('button', { name: /Davom etish/i }));

    await waitFor(() => {
      expect(requestLoginCodeMock).toHaveBeenCalledWith('Real_User', '42');
    });
  });

  it('falls back to the manual form when auto-login fails', async () => {
    localStorage.setItem('last_username', 'bad_user');
    fragmentLoginMock.mockRejectedValue({
      response: { data: { detail: 'Fragment orqali tasdiqlanmadi (FRAGMENT_ERROR).' } },
    });
    render(<FragmentLogin />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Davom etish/i })).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/Fragment orqali tasdiqlanmadi/)).toBeTruthy();
    });
    // Input avtomatik to'ldirilgan — foydalanuvchi shunchaki davom etadi
    expect((screen.getByPlaceholderText('username') as HTMLInputElement).value).toBe('bad_user');
  });
});
