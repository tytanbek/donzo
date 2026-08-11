import { create } from 'zustand';

interface User {
  id: number;
  username: string;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  telegram_id: string;
  telegram_username: string;
  language_code: string;
  avatar_url: string;
  is_telegram_premium: boolean;
  fragment_synced_at: string | null;
  role: string;
  is_active: boolean;
  balance: number;
  cashback_balance: number;
  referral_code: string;
  referred_by: string | null;
}

interface Order {
  id: number;
  order_number: string;
  service_name: string;
  package_name: string;
  status: string;
  total_price: number;
  created_at: string;
  field_values: Record<string, string>;
}

interface Service {
  id: number;
  name: string;
  slug: string;
  category: number;
  category_name: string;
  image_url: string;
  description: string;
  instruction_text: string;
  is_active: boolean;
  packages: Package[];
  fields: ServiceField[];
}

interface Package {
  id: number;
  service: number;
  name: string;
  amount_label: string;
  price: number;
  currency: string;
  is_active: boolean;
}

interface ServiceField {
  id: number;
  service: number;
  field_name: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  validation_regex: string;
}

interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
  // DEMO MODE: login tizimi yo'q. AuthChecked har doim tezda true bo'ladi —
  // frontend demo-login bilan avtomatik kiradi.
  authChecked: boolean;
  setAuthChecked: (checked: boolean) => void;

  // Services
  services: Service[];
  categories: any[];
  setServices: (services: Service[]) => void;
  setCategories: (categories: any[]) => void;

  // Orders
  orders: Order[];
  setOrders: (orders: Order[]) => void;

  // UI
  isSearchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;

  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

// Role → Panel URL mapping
export function getPanelByRole(role: string): string {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return '/admin';
    case 'senior_operator':
    case 'operator':
      return '/operator';
    case 'support':
      return '/support';
    case 'customer':
      return '/dashboard';
    default:
      return '/';
  }
}

export const useStore = create<AppState>((set) => ({
  // Auth
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  authChecked: false,
  setAuthChecked: (checked) => set({ authChecked: checked }),

  logout: () => {
    // SECURITY (audit finding #1 hardening): best-effort server-side JWT
    // blacklist so the refresh token cannot be replayed after logout.
    // Fire-and-forget — the UI must never block on this.
    try {
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        import('./api').then(({ authAPI }) => authAPI.logout(refresh)).catch(() => {});
      }
    } catch { /* ignore */ }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({ user: null, isAuthenticated: false });
  },

  // Services
  services: [],
  categories: [],
  setServices: (services) => set({ services }),
  setCategories: (categories) => set({ categories }),

  // Orders
  orders: [],
  setOrders: (orders) => set({ orders }),

  // UI
  isSearchOpen: false,
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),

  // Theme
  theme: 'dark',
  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
}));
