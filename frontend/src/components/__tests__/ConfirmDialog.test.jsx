import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const i18nState = vi.hoisted(() => ({ language: 'en' }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: i18nState }),
}));

import ConfirmDialog from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    title: 'Leave Company',
    message: 'Are you sure?',
    confirmLabel: 'Yes, Go',
    cancelLabel: 'Cancel',
  };

  beforeEach(() => {
    i18nState.language = 'en';
  });

  it('renders nothing when closed', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders title, message and both action buttons when open', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Leave Company')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, Go' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Go' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when the cancel button is clicked and never onConfirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel when the backdrop is clicked (outside the panel)', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel when the Escape key is pressed', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not listen for Escape while closed', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} open={false} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('disables both buttons and shows loading text while a submission is in flight (double-submit protection)', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} loading />);
    const confirmBtn = screen.getByRole('button', { name: 'common.loading' });
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    expect(confirmBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
    fireEvent.click(confirmBtn);
    fireEvent.click(cancelBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders RTL (dir="rtl") when the language is Hebrew', () => {
    i18nState.language = 'he';
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('dir', 'rtl');
  });

  it('renders LTR (dir="ltr") for English', () => {
    i18nState.language = 'en';
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('dir', 'ltr');
  });

  it('stacks buttons vertically on mobile and side-by-side on larger screens', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const actions = screen.getByRole('button', { name: 'Cancel' }).parentElement;
    expect(actions.className).toContain('flex-col');
    expect(actions.className).toContain('sm:flex-row');
  });

  it('stays within a 320px viewport (w-full max-w-sm panel with p-4 overlay)', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const overlay = screen.getByRole('dialog');
    expect(overlay.className).toContain('p-4');
    const panel = overlay.querySelector('div');
    expect(panel.className).toContain('w-full');
    expect(panel.className).toContain('max-w-sm');
  });

  it('uses the neutral blue confirm style when destructive is false', () => {
    render(<ConfirmDialog {...defaultProps} destructive={false} />);
    expect(screen.getByRole('button', { name: 'Yes, Go' }).className).toContain('bg-blue-600');
  });

  it('uses the red destructive confirm style by default', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Yes, Go' }).className).toContain('bg-red-600');
  });
});
