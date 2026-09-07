import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const initdataLoginMock = vi.fn();
vi.mock('@/lib/api', () => ({
  authAPI: {
    initdataLogin: (...args: any[]) => initdataLoginMock(...args),
    deviceInfo: () => Promise.resolve({ data: {} }),
  },
}));

const setUserMock = vi.fn();
const setAuthCheckedMock = vi.fn();
const pushMock = vi.fn();
vi.mock('@/lib/store', () => ({
  useStore: () => ({
    setUser: setUserMock,
    setAuthChecked: setAuthCheckedMock,
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import FragmentLogin from './FragmentLogin';

describe('FragmentLogin (AVTO-KIRISH — username YO\'Q)', () => {
  beforeEach(() => {
    initdataLoginMock.mockReset();
    setUserMock.mockReset();
    setAuthCheckedMock.mockReset();
    pushMock.mockReset();
    localStorage.clear();
    delete (window as any).Telegram;
  });

  it('hech qachon username input ko\'rsatmaydi', async () => {
    render(<FragmentLogin />);
    // ~3s kutish — SDK yuklanmagan → "Telegram orqali" ekrani chiqadi
    await waitFor(() => {
      expect(screen.getByText(/Kirish faqat Telegram orqali/i)).toBeTruthy();
    }, { timeout: 8000 });
    expect(screen.queryByPlaceholderText('username')).toBeNull();
    expect(screen.queryByRole('button', { name: /Davom etish/i })).toBeNull();
  });

  it('Telegramdan tashqarida — botni ochish tugmasi ko\'rinadi', async () => {
    render(<FragmentLogin />);
    await waitFor(() => {
      expect(screen.getByText(/Kirish faqat Telegram orqali/i)).toBeTruthy();
    }, { timeout: 8000 });
    const btn = screen.getByRole('link', { name: /Bot'ni ochish/i });
    expect(btn.getAttribute('href')).toBe('https://t.me/DONZOROBOT');
  });

  it('Telegram ichida initData bor — avtomatik kiradi, username so\'ralmaydi', async () => {
    (window as any).Telegram = { WebApp: { initData: 'query_id=abc&user=%7B%22id%22%3A42%7D&hash=xyz' } };
    initdataLoginMock.mockResolvedValue({
      data: {
        access: 'tok', refresh: 'rf',
        user: { id: 42, role: 'customer', username: 'auto_user' },
      },
    });
    render(<FragmentLogin />);

    await waitFor(() => {
      expect(initdataLoginMock).toHaveBeenCalledWith('query_id=abc&user=%7B%22id%22%3A42%7D&hash=xyz');
    });
    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBe('tok');
    });
    expect(setUserMock).toHaveBeenCalledWith({ id: 42, role: 'customer', username: 'auto_user' });
    expect(setAuthCheckedMock).toHaveBeenCalledWith(true);
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });

  it('admin rol bilan kirsa — admin panelga yo\'naltiradi', async () => {
    (window as any).Telegram = { WebApp: { initData: 'hash=x' } };
    initdataLoginMock.mockResolvedValue({
      data: {
        access: 'tok', refresh: 'rf',
        user: { id: 1, role: 'super_admin', username: 'admin' },
      },
    });
    render(<FragmentLogin />);
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/admin');
    });
  });

  it('xato bo\'lsa — Qayta urinish tugmasi chiqadi va qayta urinadi', async () => {
    (window as any).Telegram = { WebApp: { initData: 'hash=x' } };
    initdataLoginMock
      .mockRejectedValueOnce({ response: { data: { detail: 'Kirish tasdiqlanmadi' } } })
      .mockResolvedValueOnce({
        data: {
          access: 'tok2', refresh: 'rf2',
          user: { id: 2, role: 'customer', username: 'u' },
        },
      });
    render(<FragmentLogin />);

    await waitFor(() => {
      expect(screen.getByText(/Kirish amalga oshmadi/i)).toBeTruthy();
    });
    expect(screen.getByText(/Kirish tasdiqlanmadi/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Qayta urinish/i }));
    await waitFor(() => {
      expect(initdataLoginMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBe('tok2');
    });
  });
});