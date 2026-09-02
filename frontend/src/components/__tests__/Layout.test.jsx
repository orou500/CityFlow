import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Layout from '../Layout';

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: () => ({ user: { role: 'user' } }),
}));
vi.mock('../../store/useGameStore', () => ({
  useGameStore: () => ({ maintenance: { enabled: false, message: '' } }),
}));
vi.mock('../Sidebar', () => ({
  default: () => <aside data-testid="layout-sidebar">sidebar</aside>,
}));
vi.mock('../MaintenanceBanner', () => ({
  default: () => null,
}));
vi.mock('../Footer', () => ({
  default: () => <footer data-testid="layout-footer">footer</footer>,
}));

function renderLayout() {
  return render(
    <Layout>
      <div data-testid="layout-content">content</div>
    </Layout>,
  );
}

describe('Layout — document-flow app shell', () => {
  it('does not lock the app shell to the viewport (no overflow-hidden)', () => {
    renderLayout();
    const shell = screen.getByText('content').closest('.app-shell');
    expect(shell).toBeInTheDocument();
    expect(shell.className).not.toContain('overflow-hidden');
  });

  it('does not make <main> an inner scroll container', () => {
    renderLayout();
    const main = document.querySelector('.app-shell main');
    expect(main).toBeTruthy();
    expect(main.className).not.toContain('overflow-y-auto');
    expect(main.className).not.toContain('overflow-auto');
    expect(main.className).not.toContain('min-h-0');
  });

  it('renders the footer AFTER the page content (normal document flow)', () => {
    renderLayout();
    const content = screen.getByTestId('layout-content');
    const footer = screen.getByTestId('layout-footer');
    // a.compareDocumentPosition(b) describes where b sits relative to a:
    // bit DOCUMENT_POSITION_FOLLOWING (4) ⇒ the footer is located after the
    // content — it is placed after the page, not overlaid or positioned.
    expect(content.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
