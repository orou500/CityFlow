import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const i18nState = vi.hoisted(() => ({ language: 'en' }));

const translations = {
  'redevelopment.title': 'Demolition & Redevelopment',
  'redevelopment.buildingValue': 'Building value',
  'redevelopment.demolitionCost': 'Demolition cost',
  'redevelopment.salvage': 'Salvage refund',
  'redevelopment.netProceeds': 'Net proceeds',
  'redevelopment.demolishNote': 'Demolition clears the building.',
  'redevelopment.demolish': 'Demolish building',
  'redevelopment.ineligible': 'This building is not currently eligible for demolition.',
  'redevelopment.demolished': 'Building demolished.',
  'redevelopment.demolishConfirmTitle': 'Demolish this building?',
  'redevelopment.demolishConfirmMessage': 'Cost {{cost}}. Salvage {{salvage}}.',
  'redevelopment.landValue': 'Cleared land value',
  'redevelopment.landSize': 'Plot size',
  'redevelopment.clearedAt': 'Cleared at tick',
  'redevelopment.chooseProject': 'Choose a new building to rebuild',
  'redevelopment.rebuild': 'Rebuild',
  'redevelopment.tooSmall': 'Plot too small',
  'redevelopment.redevelopNote': 'Construction is scheduled.',
  'redevelopment.started': 'Redevelopment started.',
  'redevelopment.rebuildConfirmTitle': 'Start redevelopment?',
  'redevelopment.rebuildConfirmMessage': 'Build {{name}} for {{cost}}? {{periods}} ticks.',
  'redevelopment.startRedevelop': 'Start redevelopment',
  'redevelopment.constructionCost': 'Construction cost',
  'redevelopment.periods': 'periods',
  'redevelopment.remainingTicks': 'Remaining ticks',
  'redevelopment.completesAt': 'Completes at tick',
  'redevelopment.progressNote': 'Completes automatically.',
  'development.sqft': 'sq ft',
  'companyDevelopment.units': 'Units',
  'propertyManagement.tick': 'Month #{{number}}',
  'common.loading': 'Loading...',
  'common.cancel': 'Cancel',
};

vi.mock('react-i18next', () => {
  const translate = (key, opts = {}) => {
    const val = translations[key];
    if (val == null) return key;
    return val.replace(/\{\{(cost|salvage|name|periods|number)\}\}/g, (m, inner) => String(opts[inner] ?? ''));
  };
  return {
    useTranslation: () => ({ t: translate, i18n: i18nState }),
  };
});

vi.mock('../../utils/capacitor', () => ({
  getApiBaseUrl: () => 'http://localhost:5000',
}));

vi.mock('../ConfirmDialog', () => ({
  default: (props) =>
    props.open ? (
      <div role="dialog">
        <h3>{props.title}</h3>
        {props.message && <p>{props.message}</p>}
        <button onClick={props.onCancel}>CANCEL</button>
        <button onClick={props.onConfirm}>CONFIRM</button>
      </div>
    ) : null,
}));

import RedevelopmentPanel from '../RedevelopmentPanel';

const PROPERTY_ID = 'p1';

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

function makeFetch(mockStatus) {
  const calls = [];
  const fn = vi.fn((url, options = {}) => {
    calls.push({ url: String(url), options });
    const u = String(url);
    if (u.includes('/redevelopment/status')) return jsonResponse(mockStatus.current);
    if (u.endsWith('/demolish'))
      return jsonResponse({ status: 'land', landValue: 100000, landSize: 1500, options: [] });
    if (u.endsWith('/redevelop'))
      return jsonResponse({
        status: 'redeveloping',
        projectName: 'Tower',
        constructionCost: 8000000,
        completionTick: 50,
        remainingTicks: 6,
      });
    return jsonResponse({});
  });
  fn.callsOf = calls;
  return fn;
}

function renderPanel(fetchMock, props = {}) {
  return render(
    <RedevelopmentPanel property={{ _id: PROPERTY_ID }} hasManageAccess={true} onMutated={vi.fn()} {...props} />,
  );
}

describe('RedevelopmentPanel', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a "none" state with a demolition quote', async () => {
    const status = {
      current: {
        status: 'none',
        eligibleForDemolition: true,
        demolitionCost: 1500000,
        demolitionSalvage: 20000000,
        netProceeds: 18500000,
        buildingValue: 50000000,
      },
    };
    const fetchMock = makeFetch(status);
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock);

    expect(await screen.findByText('Demolition & Redevelopment')).toBeInTheDocument();
    expect(screen.getByText('Demolition cost')).toBeInTheDocument();
    expect(screen.getByText('+$18.5M')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demolish building' })).toBeInTheDocument();
  });

  it('shows an ineligible notice and no demolish button when server says ineligible', async () => {
    const status = {
      current: {
        status: 'none',
        eligibleForDemolition: false,
        demolitionCost: 1500000,
        demolitionSalvage: 2000000,
        netProceeds: 500000,
        buildingValue: 1000000,
      },
    };
    const fetchMock = makeFetch(status);
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock);

    await screen.findByText('Demolition & Redevelopment');
    expect(screen.getByText('This building is not currently eligible for demolition.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Demolish building' })).not.toBeInTheDocument();
  });

  it('calls demolish endpoint and onMutated on confirm', async () => {
    const status = {
      current: {
        status: 'none',
        eligibleForDemolition: true,
        demolitionCost: 100,
        demolitionSalvage: 200,
        netProceeds: 100,
        buildingValue: 500,
      },
    };
    const fetchMock = makeFetch(status);
    const onMutated = vi.fn().mockResolvedValue();
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock, { onMutated });

    await screen.findByRole('button', { name: 'Demolish building' });
    fireEvent.click(screen.getByRole('button', { name: 'Demolish building' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }));

    await waitFor(() => {
      const demolishCall = fetchMock.callsOf.find((c) => c.url.endsWith('/demolish'));
      expect(demolishCall).toBeTruthy();
      expect(demolishCall.options.method).toBe('POST');
    });
    await waitFor(() => expect(onMutated).toHaveBeenCalled());
  });

  it('renders a "land" state with rebuild options and posts projectType', async () => {
    const status = {
      current: {
        status: 'land',
        landValue: 200000,
        landSize: 1500,
        clearedAtTick: 12,
        options: [
          {
            id: 'small_house',
            name: 'Small House',
            category: 'residential',
            unitsGenerated: 4,
            constructionPeriods: 2,
            estimatedCost: 8000000,
            eligible: true,
          },
          {
            id: 'big_tower',
            name: 'Big Tower',
            category: 'commercial',
            unitsGenerated: 40,
            constructionPeriods: 8,
            estimatedCost: 50000000,
            eligible: false,
          },
        ],
      },
    };
    const fetchMock = makeFetch(status);
    const onMutated = vi.fn().mockResolvedValue();
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock, { onMutated });

    expect(await screen.findByText('Choose a new building to rebuild')).toBeInTheDocument();
    expect(screen.getByText('Small House')).toBeInTheDocument();
    expect(screen.getByText('Plot too small')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rebuild' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }));

    await waitFor(() => {
      const redevelopCall = fetchMock.callsOf.find((c) => c.url.endsWith('/redevelop'));
      expect(redevelopCall).toBeTruthy();
      expect(redevelopCall.options.method).toBe('POST');
      expect(JSON.parse(redevelopCall.options.body).projectType).toBe('small_house');
    });
    await waitFor(() => expect(onMutated).toHaveBeenCalled());
  });

  it('renders a "redeveloping" state with completion info', async () => {
    const status = {
      current: {
        status: 'redeveloping',
        projectName: 'Small House',
        constructionCost: 8000000,
        completionTick: 50,
        remainingTicks: 6,
      },
    };
    const fetchMock = makeFetch(status);
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock);

    expect(await screen.findByText('Small House')).toBeInTheDocument();
    expect(screen.getByText('Remaining ticks')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Month #50')).toBeInTheDocument();
  });

  it('surfaces a status-fetch failure without crashing', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network down')));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderPanel(fetchMock);

    await waitFor(() => {
      expect(container.querySelector('.bg-white')).toBeNull();
    });
  });
});
