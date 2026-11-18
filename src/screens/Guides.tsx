import { useState } from 'react';
import { PushBar } from '../components/ui';
import { usePrefs } from '../lib/prefs';
import { GUIDES, GUIDE_GAMES, type GuidePart } from '../lib/guides';
import { href, hrefFor } from '../lib/router';
import type { Game } from '../lib/api';

type View = 'score' | 'rules';

/**
 * Game guides (Ali, ADC-LOG-764 item 4): for Kout, Baloot, Tarneeb and Trix, 'How to score' and
 * 'Rules', in Arabic and English, written by us. Reached from League and from the score sheet.
 */
export function Guides({ game: first, view: firstView }: { game: Game; view: View }) {
  const { c, t, prefs } = usePrefs();
  const [game, setGame] = useState<Game>(first);
  const [view, setView] = useState<View>(firstView);
  const pick = (g: Game, v: View) => {
    setGame(g);
    setView(v);
    // Keep the link shareable without stacking history entries for every tap.
    window.history.replaceState(null, '', href.guides(g, v));
  };
  const guide = GUIDES[prefs.lang][game];
  const parts: GuidePart[] = guide[view];
  const rtl = prefs.lang === 'ar';
  const arrows = (list: readonly string[], cur: string, e: React.KeyboardEvent): string | null => {
    const i = list.indexOf(cur);
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const bwd = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd) return list[(i + 1) % list.length];
    if (e.key === bwd) return list[(i - 1 + list.length) % list.length];
    if (e.key === 'Home') return list[0];
    if (e.key === 'End') return list[list.length - 1];
    return null;
  };
  return (
    <>
      <PushBar title={c.guides.title} parent={hrefFor('league')} />
      <div className="screen__body guides">
        <div
          className="seg-tabs seg-tabs--4"
          role="tablist"
          aria-label={c.guides.games}
          onKeyDown={(e) => {
            const next = arrows(GUIDE_GAMES, game, e) as Game | null;
            if (!next) return;
            e.preventDefault();
            pick(next, view);
            document.getElementById(`g-${next}`)?.focus();
          }}
        >
          {GUIDE_GAMES.map((g) => (
            <button
              key={g}
              id={`g-${g}`}
              type="button"
              role="tab"
              aria-selected={game === g}
              aria-controls="guide-panel"
              tabIndex={game === g ? 0 : -1}
              className="seg-tabs__tab"
              onClick={() => pick(g, view)}
            >
              {t.games[g]}
            </button>
          ))}
          <span className="seg-tabs__pill" aria-hidden="true" style={{ ['--i' as string]: GUIDE_GAMES.indexOf(game) }} />
        </div>
        <div className="guide-views" role="group" aria-label={c.guides.views}>
          {(['score', 'rules'] as const).map((v) => (
            <button key={v} type="button" className="chip-btn" aria-pressed={view === v} onClick={() => pick(game, v)}>
              {v === 'score' ? c.guides.score : c.guides.rules}
            </button>
          ))}
        </div>
        <article id="guide-panel" role="tabpanel" aria-labelledby={`g-${game}`} className="guide" key={`${game}-${view}`}>
          <h2 className="guide__title">
            {t.games[game]} · {view === 'score' ? c.guides.score : c.guides.rules}
          </h2>
          {parts.map((part) => (
            <section key={part.h} className="guide__part">
              <h3 className="guide__h">{part.h}</h3>
              {part.p && <p className="prose">{part.p}</p>}
              {part.list && (
                <ul className="guide__list">
                  {part.list.map((li) => (
                    <li key={li}>{li}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          <p className="note note--quiet small">{c.guides.note}</p>
        </article>
      </div>
    </>
  );
}
