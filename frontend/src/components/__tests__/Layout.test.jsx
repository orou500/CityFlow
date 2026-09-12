import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Layout from '../Layout';

const INDEX_CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../index.css'), 'utf8');

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

  it('app-shell consumes the top safe-area with an additive padding (env, no hardcoded px)', () => {
    const rule = INDEX_CSS.match(/\.app-shell\s*\{([^}]+)\}/)?.[1];
    expect(rule).toBeTruthy();
    expect(rule).toContain('padding-top: env(safe-area-inset-top, 0px)');
    // The inset is ALSO folded into min-height so short pages still pin the
    // footer to the screen bottom instead of floating it up by the inset.
    expect(rule).toContain('min-height: calc(100vh + env(safe-area-inset-top, 0px))');
    expect(INDEX_CSS).toContain('min-height: calc(100dvh + env(safe-area-inset-top, 0px))');
    // One intentional top-safe-area strategy — never a fixed pixel margin.
    expect(rule).not.toMatch(/padding-top:\s*[0-9]+px/);
  });
});
