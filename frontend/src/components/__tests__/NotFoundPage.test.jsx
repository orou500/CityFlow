import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFoundPage from '../../pages/NotFoundPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>
  );
}

describe('NotFoundPage', () => {
  it('renders 404 heading', () => {
    renderPage();
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders page not found title', () => {
    renderPage();
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('renders a link to the map', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /World Map/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders login link when no user', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Login/i })).toBeInTheDocument();
  });
});
