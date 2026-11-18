/**
 * A row of jump buttons to the sections of a long page (S9, Me). Buttons, not #anchors: the app
 * routes on the hash, so an anchor link would leave the page. Scrolls smoothly unless the reader
 * asked for reduced motion, then moves focus to the section heading for keyboard and screen readers.
 */
export function SectionIndex({ label, items }: { label: string; items: { id: string; label: string }[] }) {
  return (
    <nav className="section-index" aria-label={label}>
      <ul className="section-index__list">
        {items.map((it) => (
          <li key={it.id}>
            <button type="button" className="section-index__btn" onClick={() => jumpTo(it.id)}>
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const heading = el.querySelector<HTMLElement>('h2, legend');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}
