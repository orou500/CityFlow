import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import PwaInstallDialog from '../PwaInstallDialog';
import { PWA_STATUS } from '../../utils/pwa';

const languageState = vi.hoisted(() => ({ language: 'en' }));

const TRANSLATIONS = vi.hoisted(() => ({
  en: {
    'pwa.title': 'Install CityFlow',
    'pwa.description': 'Get a faster CityFlow in its own window.',
    'pwa.installButton': 'Install',
    'pwa.cancelButton': 'Not Now',
    'pwa.iosTitle': 'Add CityFlow to Your Home Screen',
    'pwa.iosIntro': 'You can install CityFlow on your iPhone from Safari:',
    'pwa.iosStep1': 'Tap the Share button in the Safari toolbar.',
    'pwa.iosStep2': 'Choose “Add to Home Screen”.',
    'pwa.iosStep3': 'Tap “Add” (top-right) to confirm.',
    'pwa.gotItButton': 'Got It',
  },
  he: {
    'pwa.title': 'התקנת CityFlow',
    'pwa.description': 'קבלו את CityFlow במהירות רבה יותר ובחלון ייעודי.',
    'pwa.installButton': 'התקנה',
    'pwa.cancelButton': 'לא עכשיו',
    'pwa.iosTitle': 'הוספת CityFlow למסך הבית',
    'pwa.iosIntro': 'אפשר להתקין את CityFlow באייפון דרך Safari:',
    'pwa.iosStep1': 'הקישו על כפתור השיתוף בסרגל הכלים של Safari.',
    'pwa.iosStep2': 'בחרו "הוספה למסך הבית".',
    'pwa.iosStep3': 'הקישו על "הוספה" (בפינה הימנית העליונה) לאישור.',
    'pwa.gotItButton': 'הבנתי',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const lang = languageState.language;
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    const t = (key) => dict[key] ?? key;
    return { t, i18n: languageState };
  },
}));

describe('PwaInstallDialog', () => {
  const onClose = vi.fn();
  const onInstall = vi.fn();

  beforeEach(() => {
    languageState.language = 'en';
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <PwaInstallDialog open={false} status={PWA_STATUS.INSTALLABLE} onClose={onClose} onInstall={onInstall} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for INSTALLED/UNSUPPORTED states even when open', () => {
    const { container, rerender } = render(
      <PwaInstallDialog open status={PWA_STATUS.INSTALLED} onClose={onClose} onInstall={onInstall} />,
    );
    expect(container.firstChild).toBeNull();

    rerender(<PwaInstallDialog open status={PWA_STATUS.UNSUPPORTED} onClose={onClose} onInstall={onInstall} />);
    expect(container.firstChild).toBeNull();
  });

  it('INSTALLABLE offers Install and Not Now; Install invokes onInstall + onClose', () => {
    render(<PwaInstallDialog open status={PWA_STATUS.INSTALLABLE} onClose={onClose} onInstall={onInstall} />);

    expect(screen.getByRole('heading', { name: 'Install CityFlow' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('INSTALLABLE "Not Now" only closes', () => {
    render(<PwaInstallDialog open status={PWA_STATUS.INSTALLABLE} onClose={onClose} onInstall={onInstall} />);

    fireEvent.click(screen.getByRole('button', { name: 'Not Now' }));
    expect(onInstall).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('IOS shows honest Share -> Add to Home Screen -> Add instructions and NO install button', () => {
    render(<PwaInstallDialog open status={PWA_STATUS.IOS} onClose={onClose} onInstall={onInstall} />);

    expect(screen.getByRole('heading', { name: 'Add CityFlow to Your Home Screen' })).toBeInTheDocument();
    expect(screen.getByText('Tap the Share button in the Safari toolbar.')).toBeInTheDocument();
    expect(screen.getByText('Choose “Add to Home Screen”.')).toBeInTheDocument();
    expect(screen.getByText('Tap “Add” (top-right) to confirm.')).toBeInTheDocument();
    // iOS must never offer a fake "Install" prompt
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Got It' })).toBeInTheDocument();
  });

  it('IOS in Hebrew renders RTL with translated steps', () => {
    languageState.language = 'he';
    const { container } = render(
      <PwaInstallDialog open status={PWA_STATUS.IOS} onClose={onClose} onInstall={onInstall} />,
    );
    expect(screen.getByRole('heading', { name: 'הוספת CityFlow למסך הבית' })).toBeInTheDocument();
    expect(screen.getByText('הקישו על כפתור השיתוף בסרגל הכלים של Safari.')).toBeInTheDocument();
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toHaveAttribute('dir', 'rtl');
  });

  it('uses the existing modal dialog accessibility contract', () => {
    const { container } = render(
      <PwaInstallDialog open status={PWA_STATUS.INSTALLABLE} onClose={onClose} onInstall={onInstall} />,
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Install CityFlow');
    expect(container.firstChild).toHaveClass('fixed', 'inset-0', 'z-50');
  });

  it('closes on Escape', () => {
    render(<PwaInstallDialog open status={PWA_STATUS.INSTALLABLE} onClose={onClose} onInstall={onInstall} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the dark backdrop is clicked', () => {
    const { container } = render(
      <PwaInstallDialog open status={PWA_STATUS.INSTALLABLE} onClose={onClose} onInstall={onInstall} />,
    );
    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closing no longer reacts to Escape after unmount', () => {
    const { unmount } = render(
      <PwaInstallDialog open status={PWA_STATUS.INSTALLABLE} onClose={onClose} onInstall={onInstall} />,
    );
    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
