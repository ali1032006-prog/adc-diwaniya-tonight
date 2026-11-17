import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach } from 'vitest';
import css from './styles.css?raw';
import { App } from './App';
import { SeatRing, seatPosition, SEATS_FOR } from './components/SeatRing';
import { NavBar } from './components/NavBar';
import { PrefsContext, DEFAULT_PREFS, loadPrefs, type Prefs } from './lib/prefs';
import { dirFor, formatNumber, localeFor, STRINGS } from './lib/i18n';
import { parseHash, TABS } from './lib/router';

function withPrefs(ui: React.ReactNode, prefs: Partial<Prefs> = {}) {
  return render(
    <PrefsContext.Provider value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}>{ui}</PrefsContext.Provider>,
  );
}

afterEach(cleanup);

describe('i18n', () => {
  it('Arabic reads right to left, English left to right', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
  });
  it('numerals follow the language unless overridden', () => {
    expect(formatNumber(6, 'en', 'auto')).toBe('6');
    expect(formatNumber(6, 'ar', 'latn')).toBe('6');
    expect(formatNumber(6, 'en', 'arab')).toBe('٦');
    expect(localeFor('ar', 'auto')).toBe('ar-KW');
  });
  it('Arabic uses the dual for two open seats', () => {
    const fmt = (n: number) => String(n);
    expect(STRINGS.ar.seatsOpen(1, fmt)).toBe('مقعد واحد شاغر');
    expect(STRINGS.ar.seatsOpen(2, fmt)).toBe('مقعدان شاغران');
    expect(STRINGS.en.seatsOpen(0, fmt)).toBe('Table full');
  });
  it('every tab has a label in both languages', () => {
    for (const tab of TABS) {
      expect(STRINGS.ar.tabs[tab]).toBeTruthy();
      expect(STRINGS.en.tabs[tab]).toBeTruthy();
    }
  });
});

describe('prefs', () => {
  it('falls back to Arabic, auto numerals and auto theme on bad storage', () => {
    expect(loadPrefs({ getItem: () => '{not json' })).toEqual(DEFAULT_PREFS);
    expect(loadPrefs({ getItem: () => JSON.stringify({ lang: 'fr', theme: 'neon' }) })).toEqual(DEFAULT_PREFS);
    expect(loadPrefs({ getItem: () => JSON.stringify({ lang: 'en', numerals: 'latn', theme: 'day' }) })).toEqual({
      lang: 'en',
      numerals: 'latn',
      theme: 'day',
    });
  });
});

describe('router', () => {
  it('parses tabs and sends unknown paths to Tonight', () => {
    expect(parseHash('#/league')).toEqual({ name: 'league' });
    expect(parseHash('#/welcome')).toEqual({ name: 'welcome' });
    expect(parseHash('#/nowhere')).toEqual({ name: 'tonight' });
    expect(parseHash('')).toEqual({ name: 'tonight' });
  });
});

describe('SeatRing', () => {
  it('Kout has 6 seats, the other games 4', () => {
    expect(SEATS_FOR).toEqual({ kout: 6, baloot: 4, tarneeb: 4, trix: 4 });
  });
  it('places the first seat at the top of the table', () => {
    expect(seatPosition(0, 6)).toEqual({ x: 50, y: 13 });
  });
  it('announces open seats as text, not colour alone', () => {
    withPrefs(<SeatRing game="kout" seats={[{ initials: 'A' }, null, { initials: 'B' }, { initials: 'C' }, { initials: 'D' }, { initials: 'E' }]} />, {
      lang: 'en',
    });
    expect(screen.getByRole('img', { name: 'Kout table: 5 of 6 seats taken, 1 seat open' })).toBeTruthy();
  });
  it('draws one dashed ring per open seat', () => {
    const { container } = withPrefs(<SeatRing game="baloot" seats={[null, { initials: 'ع' }, null, null]} />);
    expect(container.querySelectorAll('.seat--open')).toHaveLength(3);
    expect(container.querySelectorAll('.seat--taken')).toHaveLength(1);
  });
});

describe('NavBar', () => {
  it('has 5 labelled tabs and marks the active one', () => {
    withPrefs(<NavBar active="league" onReselect={() => {}} />, { lang: 'en' });
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Tonight', 'Diwaniya', 'League', 'Inbox', 'Me']);
    expect(screen.getByRole('link', { name: 'League' }).getAttribute('aria-current')).toBe('page');
  });
  it('moves the pill by tab index (one pill element, transform only)', () => {
    const { container, rerender } = withPrefs(<NavBar active="tonight" onReselect={() => {}} />);
    const track = container.querySelector('.nav__track') as HTMLElement;
    expect(track.style.getPropertyValue('--i')).toBe('0');
    rerender(
      <PrefsContext.Provider value={{ prefs: DEFAULT_PREFS, setPrefs: () => {} }}>
        <NavBar active="me" onReselect={() => {}} />
      </PrefsContext.Provider>,
    );
    expect(track.style.getPropertyValue('--i')).toBe('4');
    expect(container.querySelectorAll('.nav__pill')).toHaveLength(1);
  });
  it('calls onReselect when the active tab is tapped again', () => {
    let hits = 0;
    withPrefs(<NavBar active="inbox" onReselect={() => hits++} />, { lang: 'en' });
    fireEvent.click(screen.getByRole('link', { name: 'Inbox' }));
    fireEvent.click(screen.getByRole('link', { name: 'Me' }));
    expect(hits).toBe(1);
  });
});

describe('styles (motion and layout contract)', () => {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  it('never animates layout properties', () => {
    const transitions = noComments.match(/transition:[^;]+;/g) ?? [];
    for (const t of transitions) expect(t).not.toMatch(/\b(width|height|top|left|right|bottom|margin|padding|box-shadow)\b/);
    const keyframes = noComments.match(/@keyframes[\s\S]*?\n}\n/g) ?? [];
    for (const k of keyframes) expect(k).not.toMatch(/\b(width|height|top|left|box-shadow)\s*:/);
  });
  it('has a reduced-motion block and a rail breakpoint at 840px', () => {
    expect(noComments).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(noComments).toMatch(/@media \(min-width: 840px\), \(orientation: landscape\) and \(max-height: 499px\)/);
  });
  it('uses no physical left/right margins or paddings (RTL safety)', () => {
    expect(noComments).not.toMatch(/(margin|padding)-(left|right)\s*:/);
  });
});

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });
  it('sends a first visit to Welcome, then opens on Tonight', async () => {
    render(<App />);
    expect(window.location.hash).toBe('#/welcome');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });
  it('switches to English and LTR from the language button', async () => {
    localStorage.setItem('dt.welcomed.v1', '1');
    window.location.hash = '#/welcome';
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(document.documentElement.dir).toBe('ltr');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Diwaniya Tonight');
  });
});
