import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const i18nState = vi.hoisted(() => ({ language: 'en' }));

const translations = {
  en: {
    'redevelopment.title': 'Demolition & Redevelopment',
    'redevelopment.buildingValue': 'Building value',
    'redevelopment.demolitionCost': 'Demolition cost',
    'redevelopment.salvage': 'Salvage refund',
    'redevelopment.netProceeds': 'Net proceeds',
    'redevelopment.demolishNote': 'Demolition clears the building.',
    'redevelopment.demolish': 'Demolish building',
    'redevelopment.ineligible': 'This building is not currently eligible for demolition.',
    'redevelopment.demolished': 'Building demolished. The plot is now cleared land.',
    'redevelopment.demolishConfirmTitle': 'Are you sure you want to demolish this building?',
    'redevelopment.demolishConfirmMessage': 'The building will be permanently destroyed. This cannot be undone.',
    'redevelopment.demolishConfirmAction': 'Confirm Demolition',
    'redevelopment.landRemaining': 'Land remaining after demolition',
    'redevelopment.availableArea': 'Available area',
    'redevelopment.landUnknown': 'Unknown',
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
  },
  he: {
    'redevelopment.title': 'הריסה ובנייה מחדש',
    'redevelopment.buildingValue': 'שווי המבנה',
    'redevelopment.demolitionCost': 'עלות ההריסה',
    'redevelopment.salvage': 'החזר חומרים',
    'redevelopment.netProceeds': 'סכום נטו',
    'redevelopment.demolishNote': 'הריסה מפנה את המבנה.',
    'redevelopment.demolish': 'הרוס מבנה',
    'redevelopment.ineligible': 'המבנה אינו זכאי להריסה כעת.',
    'redevelopment.demolished': 'המבנה נהרס. המגרש הוא כעת קרקע פנויה.',
    'redevelopment.demolishConfirmTitle': 'האם אתה בטוח שברצונך להרוס את המבנה הזה?',
    'redevelopment.demolishConfirmMessage': 'המבנה ייהרס לצמיתות. אין דרך לבטל פעולה זו.',
    'redevelopment.demolishConfirmAction': 'אשר הריסה',
    'redevelopment.landRemaining': 'הקרקע שתישאר לאחר ההריסה',
    'redevelopment.availableArea': 'שטח פנוי',
    'redevelopment.landUnknown': 'לא ידוע',
    'redevelopment.landValue': 'שווי הקרקע הפנויה',
    'redevelopment.landSize': 'גודל המגרש',
    'redevelopment.clearedAt': 'נהרס בסיבוב',
    'redevelopment.chooseProject': 'בחר מבנה חדש לבנייה',
    'redevelopment.rebuild': 'בנה מחדש',
    'redevelopment.tooSmall': 'המגרש קטן מדי',
    'redevelopment.redevelopNote': 'הבנייה מתוזמנת.',
    'redevelopment.started': 'הבנייה החלה.',
    'redevelopment.rebuildConfirmTitle': 'להתחיל בבנייה מחדש?',
    'redevelopment.rebuildConfirmMessage': 'לבנות את {{name}} בעלות {{cost}}? {{periods}} סיבובים.',
    'redevelopment.startRedevelop': 'התחל בנייה מחדש',
    'redevelopment.constructionCost': 'עלות הבנייה',
    'redevelopment.periods': 'סיבובים',
    'redevelopment.remainingTicks': 'סיבובים שנותרו',
    'redevelopment.completesAt': 'מסתיים בסיבוב',
    'redevelopment.progressNote': 'מסתיים אוטומטית.',
    'development.sqft': 'מ"ר',
    'companyDevelopment.units': 'יחידות',
    'propertyManagement.tick': 'חודש #{{number}}',
    'common.loading': 'טוען...',
    'common.cancel': 'ביטול',
  },
};

vi.mock('react-i18next', () => {
  const translate = (key, opts = {}) => {
    const dict = translations[i18nState.language] || translations.en;
    const val = dict[key];
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
      <div role="dialog" dir={i18nState.language === 'he' ? 'rtl' : 'ltr'}>
        <h3>{props.title}</h3>
        {props.message && <p>{props.message}</p>}
        {props.children}
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

function makeFetch(mockStatus, overrides = {}) {
  const calls = [];
  const fn = vi.fn((url, options = {}) => {
    calls.push({ url: String(url), options });
    const u = String(url);
    if (u.includes('/redevelopment/status')) return jsonResponse(mockStatus.current);
    if (u.endsWith('/demolish')) {
      if (overrides.demolishFail) {
        return Promise.reject(new Error('Insufficient balance'));
      }
      return jsonResponse({ status: 'land', landValue: 100000, landSize: 6000, options: [] });
    }
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

const QUOTE = {
  status: 'none',
  eligibleForDemolition: true,
  demolitionCost: 1500000,
  demolitionSalvage: 20000000,
  netProceeds: 18500000,
  buildingValue: 50000000,
  landSize: 6000,
};

describe('RedevelopmentPanel', () => {
  beforeEach(() => {
    i18nState.language = 'en';
    vi.unstubAllGlobals();
  });

  it('renders a "none" state with a demolition quote', async () => {
    const status = { current: QUOTE };
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
      current: { ...QUOTE, eligibleForDemolition: false, demolitionSalvage: 2000000, netProceeds: 500000 },
    };
    const fetchMock = makeFetch(status);
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock);

    await screen.findByText('Demolition & Redevelopment');
    expect(screen.getByText('This building is not currently eligible for demolition.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Demolish building' })).not.toBeInTheDocument();
  });

  it('opens the confirmation dialog on click without calling the demolish API', async () => {
    const status = { current: QUOTE };
    const fetchMock = makeFetch(status);
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock);

    await screen.findByRole('button', { name: 'Demolish building' });
    fireEvent.click(screen.getByRole('button', { name: 'Demolish building' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to demolish this building?')).toBeInTheDocument();
    expect(fetchMock.callsOf.filter((c) => c.url.endsWith('/demolish'))).toHaveLength(0);
  });

  it('shows the building name, remaining land area and demolition consequences in the dialog', async () => {
    const status = { current: QUOTE };
    const fetchMock = makeFetch(status);
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock, { property: { _id: PROPERTY_ID, name: 'Cityflow Tower' } });

    await screen.findByRole('button', { name: 'Demolish building' });
    fireEvent.click(screen.getByRole('button', { name: 'Demolish building' }));
    const dialog = await screen.findByRole('dialog');

    expect(screen.getByText('Cityflow Tower')).toBeInTheDocument();
    expect(screen.getByText('Land remaining after demolition')).toBeInTheDocument();
    expect(screen.getByText(/Available area: 6K sq ft/)).toBeInTheDocument();
    expect(within(dialog).getByText('$1.5M')).toBeInTheDocument();
    expect(within(dialog).getByText('$20M')).toBeInTheDocument();
    expect(within(dialog).getByText('+$18.5M')).toBeInTheDocument();
  });

  it('does not fabricate an area when the plot size is unknown', async () => {
    const status = { current: { ...QUOTE, landSize: null } };
    const fetchMock = makeFetch(status);
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock);

    await screen.findByRole('button', { name: 'Demolish building' });
    fireEvent.click(screen.getByRole('button', { name: 'Demolish building' }));
    await screen.findByRole('dialog');

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.queryByText(/Available area:/)).not.toBeInTheDocument();
  });

  it('cancels the dialog without demolishing', async () => {
    const status = { current: QUOTE };
    const fetchMock = makeFetch(status);
    const onMutated = vi.fn().mockResolvedValue();
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock, { onMutated });

    await screen.findByRole('button', { name: 'Demolish building' });
    fireEvent.click(screen.getByRole('button', { name: 'Demolish building' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock.callsOf.filter((c) => c.url.endsWith('/demolish'))).toHaveLength(0);
    expect(onMutated).not.toHaveBeenCalled();
  });

  it('calls the demolish endpoint exactly once and refreshes on confirm', async () => {
    const status = { current: QUOTE };
    const fetchMock = makeFetch(status);
    const onMutated = vi.fn().mockResolvedValue();
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock, { onMutated });

    await screen.findByRole('button', { name: 'Demolish building' });
    fireEvent.click(screen.getByRole('button', { name: 'Demolish building' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }));

    await waitFor(() => {
      const demolishCalls = fetchMock.callsOf.filter((c) => c.url.endsWith('/demolish'));
      expect(demolishCalls).toHaveLength(1);
      expect(demolishCalls[0].options.method).toBe('POST');
    });
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Building demolished. The plot is now cleared land.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an error and keeps the dialog open when the demolition request fails', async () => {
    const status = { current: QUOTE };
    const fetchMock = makeFetch(status, { demolishFail: true });
    const onMutated = vi.fn().mockResolvedValue();
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock, { onMutated });

    await screen.findByRole('button', { name: 'Demolish building' });
    fireEvent.click(screen.getByRole('button', { name: 'Demolish building' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }));

    expect(await screen.findByText(/Insufficient balance/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(fetchMock.callsOf.filter((c) => c.url.endsWith('/demolish'))).toHaveLength(1);
    expect(onMutated).not.toHaveBeenCalled();
  });

  it('renders the dialog in Hebrew with RTL alignment', async () => {
    i18nState.language = 'he';
    const status = { current: QUOTE };
    const fetchMock = makeFetch(status);
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(fetchMock);

    expect(await screen.findByText('הריסה ובנייה מחדש')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'הרוס מבנה' }));
    const dialog = await screen.findByRole('dialog');

    expect(dialog).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText('האם אתה בטוח שברצונך להרוס את המבנה הזה?')).toBeInTheDocument();
    expect(screen.getByText('הקרקע שתישאר לאחר ההריסה')).toBeInTheDocument();
    expect(screen.getByText(/שטח פנוי: 6K מ"ר/)).toBeInTheDocument();
  });

  it('renders a "land" state with rebuild options and posts projectType', async () => {
    const status = {
      current: {
        status: 'land',
        landValue: 200000,
        landSize: 6000,
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
