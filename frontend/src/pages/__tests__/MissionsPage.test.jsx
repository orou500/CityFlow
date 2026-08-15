import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const missionState = vi.hoisted(() => ({
  activeMissions: [],
  completedMissions: [],
  claimedMissions: [],
  loading: false,
  stats: null,
  fetchDashboard: vi.fn().mockResolvedValue(),
  fetchStats: vi.fn().mockResolvedValue(),
  claimReward: vi.fn().mockResolvedValue(),
  updateMissionProgressLocal: vi.fn(),
}));

vi.mock('../../store/useMissionStore', () => ({
  useMissionStore: () => missionState,
}));

vi.mock('../../hooks/useSocket', () => ({
  useSocket: () => null,
}));

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams('tab=completed')],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

import MissionsPage from '../MissionsPage';

function makeMission(overrides = {}) {
  return {
    missionId: 'm1',
    status: 'active',
    progress: 0,
    target: 1,
    definition: {
      id: 'm1',
      name: 'Test Mission',
      description: 'Do the thing',
      icon: '🎯',
      category: 'beginner',
      difficulty: 'easy',
      type: 'permanent',
      rewards: {},
    },
    ...overrides,
  };
}

beforeEach(() => {
  missionState.activeMissions = [];
  missionState.completedMissions = [];
  missionState.claimedMissions = [];
  missionState.loading = false;
  missionState.stats = null;
  missionState.claimReward.mockClear();
});

describe('MissionsPage', () => {
  it('renders the title-reward chip with a real emoji, never the raw escape text', () => {
    missionState.completedMissions = [
      makeMission({ status: 'completed', progress: 1, definition: { ...makeMission().definition, rewards: { title: 'Tycoon' } } }),
    ];

    render(<MissionsPage />);

    // The raw escape written as JSX text (the old bug) must not leak through.
    expect(screen.queryByText(/\\uD83D\\uDCDD/)).not.toBeInTheDocument();
    // The decoded memo emoji accompanies the title reward.
    expect(screen.getByText(/📝/)).toBeInTheDocument();
    expect(screen.getByText(/Tycoon/)).toBeInTheDocument();
  });

  it('shows the claim button on completed missions and the claimed state on claimed ones', async () => {
    missionState.completedMissions = [
      makeMission({ status: 'completed', progress: 1, missionId: 'c1' }),
    ];
    missionState.claimedMissions = [
      makeMission({ status: 'claimed', progress: 1, missionId: 'cl1' }),
    ];

    render(<MissionsPage />);

    expect(screen.getByText('missions.collect')).toBeInTheDocument();

    // Switch to the Claimed tab to see the claimed state.
    fireEvent.click(screen.getByText('missions.tabs.claimed'));
    await waitFor(() => {
      expect(screen.getByText('missions.claimed')).toBeInTheDocument();
    });
  });

  it('claims the mission when the claim button is pressed', () => {
    missionState.completedMissions = [
      makeMission({ status: 'completed', progress: 1, missionId: 'claim-me' }),
    ];

    render(<MissionsPage />);

    screen.getByText('missions.collect').click();
    expect(missionState.claimReward).toHaveBeenCalledWith('claim-me');
  });

  it('shows the loading state while fetching', () => {
    missionState.loading = true;
    render(<MissionsPage />);
    expect(screen.getByText('missions.loading')).toBeInTheDocument();
  });
});
