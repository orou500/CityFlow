import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

import PersonalAssistantCard from '../PersonalAssistantCard';

function makeAssistant(overrides = {}) {
  return {
    status: 'none',
    salary: 2000,
    canHire: true,
    canFire: false,
    hiredMonth: null,
    firedMonth: null,
    rentalIncomeUnlocked: false,
    ...overrides,
  };
}

describe('PersonalAssistantCard', () => {
  it('renders the available state with a hire button when never hired', () => {
    render(<PersonalAssistantCard assistant={makeAssistant()} onHire={vi.fn()} onFire={vi.fn()} />);
    expect(screen.getByText('assistant.title')).toBeInTheDocument();
    expect(screen.getByText('assistant.available')).toBeInTheDocument();
    expect(screen.getByText('assistant.hireButton')).toBeInTheDocument();
    expect(screen.getByText('\u2717 assistant.rentalIncomeTracking')).toBeInTheDocument();
  });

  it('renders the active state with salary, responsibilities and fire button', () => {
    render(
      <PersonalAssistantCard
        assistant={makeAssistant({ status: 'active', canFire: true, canHire: false, rentalIncomeUnlocked: true })}
        onHire={vi.fn()}
        onFire={vi.fn()}
      />,
    );
    expect(screen.getAllByText('assistant.employed').length).toBeGreaterThan(0);
    expect(screen.getByText('\u2713 assistant.rentalIncomeTracking')).toBeInTheDocument();
    expect(screen.getByText('assistant.fireButton')).toBeInTheDocument();
    expect(screen.queryByText('assistant.hireButton')).not.toBeInTheDocument();
  });

  it('opens the fire confirmation dialog and fires only after confirmation', () => {
    const onFire = vi.fn();
    render(
      <PersonalAssistantCard
        assistant={makeAssistant({ status: 'active', canFire: true, canHire: false })}
        onHire={vi.fn()}
        onFire={onFire}
      />,
    );

    fireEvent.click(screen.getByText('assistant.fireButton'));
    expect(screen.getByText('assistant.fireConfirmTitle')).toBeInTheDocument();
    expect(onFire).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('assistant.fireConfirmAction'));
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('cancel closes the confirmation dialog without firing', () => {
    const onFire = vi.fn();
    render(
      <PersonalAssistantCard
        assistant={makeAssistant({ status: 'active', canFire: true, canHire: false })}
        onHire={vi.fn()}
        onFire={onFire}
      />,
    );

    fireEvent.click(screen.getByText('assistant.fireButton'));
    fireEvent.click(screen.getByText('common.cancel'));
    expect(screen.queryByText('assistant.fireConfirmTitle')).not.toBeInTheDocument();
    expect(onFire).not.toHaveBeenCalled();
  });

  it('renders the fired-this-month state with the next-month message and no hire button', () => {
    render(
      <PersonalAssistantCard
        assistant={makeAssistant({ status: 'fired', canHire: false, canFire: false, firedMonth: 100 })}
        onHire={vi.fn()}
        onFire={vi.fn()}
      />,
    );
    expect(screen.getByText('assistant.firedThisMonth')).toBeInTheDocument();
    expect(screen.getByText('assistant.nextMonthMessage')).toBeInTheDocument();
    expect(screen.queryByText('assistant.hireButton')).not.toBeInTheDocument();
    expect(screen.queryByText('assistant.fireButton')).not.toBeInTheDocument();
  });

  it('renders the available state again when the fired month has passed', () => {
    render(
      <PersonalAssistantCard
        assistant={makeAssistant({ status: 'fired', canHire: true, canFire: false, firedMonth: 99 })}
        onHire={vi.fn()}
        onFire={vi.fn()}
      />,
    );
    expect(screen.getByText('assistant.available')).toBeInTheDocument();
    expect(screen.getByText('assistant.hireButton')).toBeInTheDocument();
    expect(screen.queryByText('assistant.nextMonthMessage')).not.toBeInTheDocument();
  });

  it('calls onHire when the hire button is clicked', () => {
    const onHire = vi.fn();
    render(<PersonalAssistantCard assistant={makeAssistant()} onHire={onHire} onFire={vi.fn()} />);
    fireEvent.click(screen.getByText('assistant.hireButton'));
    expect(onHire).toHaveBeenCalledTimes(1);
  });

  it('shows the hiring loading label when hiring', () => {
    render(<PersonalAssistantCard assistant={makeAssistant()} onHire={vi.fn()} onFire={vi.fn()} hiring />);
    expect(screen.getByText('assistant.hiring')).toBeInTheDocument();
  });

  it('renders nothing when there is no assistant state yet', () => {
    const { container } = render(<PersonalAssistantCard assistant={null} onHire={vi.fn()} onFire={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
