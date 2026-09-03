import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k) => k }),
}));

import AdminModal from '../AdminModal';

describe('AdminModal', () => {
  it('renders a dialog with a viewport-fitting panel (max-h + scrollable)', () => {
    render(
      <AdminModal title="Edit" onClose={vi.fn()}>
        <p>body</p>
      </AdminModal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Edit');
    expect(dialog.className).toContain('max-h-[90vh]');
    expect(dialog.className).toContain('overflow-y-auto');
    expect(dialog.className).toContain('w-full');
  });

  it('never exceeds the viewport width (max-w on sm and up, full width on mobile)', () => {
    render(<AdminModal title="T" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('sm:max-w-md');
  });

  it('calls onClose via the close button and does not close on panel click', () => {
    const onClose = vi.fn();
    render(
      <AdminModal title="T" onClose={onClose}>
        <p data-testid="panel-body">body</p>
      </AdminModal>,
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
