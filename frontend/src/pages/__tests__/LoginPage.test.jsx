import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }),
}));

vi.mock('../store/useAuthStore', () => ({
  useAuthStore: () => ({ login: vi.fn(), register: vi.fn(), error: null, loading: false }),
}));

vi.mock('../i18n/errors', () => ({
  translateError: (e) => e,
}));

vi.mock('../utils/capacitor', () => ({
  getApiBaseUrl: () => '/api',
  isNativePlatform: () => false,
}));

import LoginPage from '../LoginPage';

describe('LoginPage SizOps sign-in button', () => {
  it('links to /api/auth/sizops and renders the vendored icon, not the remote origin', () => {
    render(<LoginPage />);
    const link = screen.getByText('auth.signInWithSizOps').closest('a');
    expect(link).toHaveAttribute('href', '/api/auth/sizops');

    const img = link.querySelector('img');
    expect(img.getAttribute('src')).toBe('/images/sizops-icon.png');
    expect(img).toHaveAttribute('alt', '');
    // The old implementation hot-linked sizops.co.il/icon.png — a network
    // round-trip per login render that breaks offline and dark-mode visibility.
    expect(img.getAttribute('src')).not.toMatch(/^https?:\/\//);
  });

  it('presents the dark mark on a white chip so it is visible on the dark button', () => {
    render(<LoginPage />);
    const link = screen.getByText('auth.signInWithSizOps').closest('a');
    const chip = link.querySelector('span');
    expect(chip.className).toMatch(/bg-white/);
    expect(chip).toContainElement(link.querySelector('img'));
  });
});
