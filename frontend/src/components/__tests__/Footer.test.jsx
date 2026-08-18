import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import Footer from '../Footer';

const languageState = vi.hoisted(() => ({ language: 'en' }));

const TRANSLATIONS = vi.hoisted(() => ({
  en: {
    'legal.termsTitle': 'Terms of Service',
    'legal.privacyTitle': 'Privacy Policy',
    'legal.cookiesTitle': 'Cookie Policy',
    'contributors.title': 'Contributors',
    supporters: 'Supporters',
    'landing.branding.sizOps': 'CityFlow is a game by <brand>SizOps</brand>',
  },
  he: {
    'legal.termsTitle': 'תנאי שימוש',
    'legal.privacyTitle': 'מדיניות פרטיות',
    'legal.cookiesTitle': 'מדיניות עוגיות',
    'contributors.title': 'תורמים',
    supporters: 'תומכים',
    'landing.branding.sizOps': 'CityFlow הוא משחק של <brand>SizOps</brand>',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const lang = languageState.language;
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    const t = (key, options = {}) => {
      const template = dict[key];
      if (template === undefined) return options.defaultValue ?? key;
      return template;
    };
    return { t, i18n: languageState };
  },
  Trans: ({ i18nKey, components }) => {
    const lang = languageState.language;
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    const template = dict[i18nKey] || i18nKey;
    const before = template.split('<brand>')[0] || '';
    const after = template.split('</brand>')[1] || '';
    const brand = components?.brand ?? 'SizOps';
    return (
      <span>
        {before}
        {brand}
        {after}
      </span>
    );
  },
}));

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  languageState.language = 'en';
});

describe('Footer — SizOps branding', () => {
  it('renders the SizOps branding sentence with a link to sizops.co.il (EN)', () => {
    renderFooter();

    expect(screen.getByText('CityFlow is a game by')).toBeInTheDocument();
    const sizopsLink = screen.getByRole('link', { name: 'SizOps' });
    expect(sizopsLink).toHaveAttribute('href', 'https://sizops.co.il');
    expect(sizopsLink).toHaveAttribute('target', '_blank');
    expect(sizopsLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders the SizOps branding in Hebrew (RTL)', () => {
    languageState.language = 'he';
    renderFooter();

    expect(screen.getByText('CityFlow הוא משחק של')).toBeInTheDocument();
    const sizopsLink = screen.getByRole('link', { name: 'SizOps' });
    expect(sizopsLink).toHaveAttribute('href', 'https://sizops.co.il');
  });

  it('includes the Contributors and Supporters links', () => {
    renderFooter();

    const contributors = screen.getByRole('link', { name: 'Contributors' });
    expect(contributors).toHaveAttribute('href', '/contributors');
    const supporters = screen.getByRole('link', { name: 'Supporters' });
    expect(supporters).toHaveAttribute('href', '/supporters');
  });
});
