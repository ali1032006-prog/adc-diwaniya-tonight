import { useState } from 'react';
import { SeatRing } from '../components/SeatRing';
import { WovenBand } from '../components/WovenBand';
import { DallahArt, ScoreSheetArt } from '../components/Art';
import { usePrefs } from '../lib/prefs';
import { LangSwitch } from '../components/LangSwitch';

/** S1 Welcome: three short panels and a language switch, shown once right after the first sign-in (ADC-LOG-764 item 5). */
export function Welcome({ onDone }: { onDone: () => void }) {
  const { t } = usePrefs();
  const [i, setI] = useState(0);
  const panels = t.welcome.panels;
  const art = [
    <SeatRing key="r" game="kout" seats={[{ initials: 'ب' }, { initials: 'ف' }, null, { initials: 'س' }, { initials: 'ح' }, { initials: 'ج' }]} size={168} />,
    <DallahArt key="d" />,
    <ScoreSheetArt key="s" />,
  ];
  const last = i === panels.length - 1;
  return (
    <main className="welcome">
      <WovenBand className="welcome__band" />
      <LangSwitch className="welcome__lang" />
      <h1 className="welcome__brand">{t.appName}</h1>
      <div className="welcome__panel" key={i}>
        <div className="welcome__art">{art[i]}</div>
        <h2 className="welcome__title">{panels[i].title}</h2>
        <p className="welcome__body">{panels[i].body}</p>
      </div>
      <div className="welcome__dots" role="tablist" aria-label={t.welcome.next}>
        {panels.map((p, n) => (
          <button
            key={p.title}
            type="button"
            role="tab"
            aria-selected={n === i}
            aria-label={p.title}
            className="welcome__dot"
            onClick={() => setI(n)}
          />
        ))}
      </div>
      <div className="welcome__actions">
        {last ? (
          <button type="button" className="btn btn--primary" onClick={onDone}>
            {t.welcome.start}
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => setI(i + 1)}>
            {t.welcome.next}
          </button>
        )}
      </div>
    </main>
  );
}
