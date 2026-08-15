import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import CompactValue from '../CompactValue';

describe('CompactValue', () => {
  it('shows the compact value with an exact-value tooltip', () => {
    const { container } = render(<CompactValue value={2500000} />);
    expect(screen.getByText('$2.5M')).toBeInTheDocument();
    expect(screen.getByText('$2,500,000')).toBeInTheDocument();
  });

  it('hides the exact-value tooltip on mobile so it can never widen the page', () => {
    render(<CompactValue value={9999999999999999} />);
    const tip = screen.getByText('$10,000,000,000,000,000');
    expect(tip.className).toContain('hidden');
    expect(tip.className).toContain('sm:block');
    // The tooltip must stay out of layout on touch screens (no hover).
    expect(tip.className).toContain('absolute');
  });

  it('renders no tooltip when compact and exact are identical', () => {
    const { container } = render(<CompactValue value={500} />);
    expect(screen.getByText('$500')).toBeInTheDocument();
    expect(container.querySelector('span.absolute')).toBeNull();
  });
});
