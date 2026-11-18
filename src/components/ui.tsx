import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Warning, X, CheckCircle } from '@phosphor-icons/react';
import { WovenBand } from './WovenBand';
import { usePrefs } from '../lib/prefs';
import { back } from '../lib/router';
import { SeatRing } from './SeatRing';
import { TopMenu } from './TopMenu';

/** App bar for a pushed screen: back arrow (mirrored in RTL), title, optional trailing action. */
export function PushBar({ title, parent, action }: { title: string; parent: string; action?: ReactNode }) {
  const { c, prefs } = usePrefs();
  const Arrow = prefs.lang === 'ar' ? ArrowRight : ArrowLeft;
  return (
    <>
      <header className="appbar appbar--push">
        <button type="button" className="icon-btn" aria-label={c.common.back} onClick={() => back(parent)}>
          <Arrow size={24} aria-hidden="true" />
        </button>
        <h1 className="appbar__title appbar__title--push">
          <bdi>{title}</bdi>
        </h1>
        {action}
        <TopMenu />
      </header>
      <WovenBand className="appbar__band" />
    </>
  );
}

/** Errors are never colour alone: icon, words and an outline, plus the way out. */
export function ErrorNote({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const { c } = usePrefs();
  return (
    <div className="note note--error" role="alert">
      <Warning size={20} weight="fill" aria-hidden="true" />
      <p>{text}</p>
      {onRetry && (
        <button type="button" className="btn btn--quiet btn--small" onClick={onRetry}>
          {c.common.retry}
        </button>
      )}
    </div>
  );
}

export function OkNote({ text }: { text: string }) {
  return (
    <div className="note note--ok" role="status">
      <CheckCircle size={20} weight="fill" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

/** Loading = skeleton seat rings, never a centred spinner. */
export function Skeleton({ rows = 2 }: { rows?: number }) {
  const { c } = usePrefs();
  return (
    <div className="skeleton" aria-busy="true" aria-label={c.common.loading}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton__card">
          <SeatRing game="baloot" seats={[null, null, null, null]} size={72} decorative />
          <div className="skeleton__lines">
            <span />
            <span />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Bottom sheet on phones, centred dialog on wide or short screens (CSS decides). Closes with X,
 * Esc or the back gesture and hands focus back to the control that opened it.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { c } = usePrefs();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Mount count: React's StrictMode mounts, unmounts and mounts again in development; the history
  // entry must survive that (it popped itself and closed the sheet at once).
  const alive = useRef(0);
  useEffect(() => {
    alive.current += 1;
    const opener = document.activeElement as HTMLElement | null;
    const d = ref.current;
    if (d && typeof d.showModal === 'function' && !d.open) d.showModal();
    const onPop = () => close.current();
    if (window.history.state?.sheet !== id) window.history.pushState({ sheet: id }, '');
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      alive.current -= 1;
      setTimeout(() => {
        if (alive.current === 0 && window.history.state?.sheet === id) window.history.back();
      }, 0);
      if (alive.current === 0) opener?.focus?.();
    };
  }, [id]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={`${id}-t`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="sheet__inner">
        <WovenBand className="sheet__grabber" />
        <div className="sheet__head">
          <h2 id={`${id}-t`} className="sheet__title">
            {title}
          </h2>
          <button type="button" className="icon-btn" aria-label={c.common.close} onClick={onClose}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </dialog>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function Chips<T extends string>({
  legend,
  value,
  options,
  onChange,
  multi,
}: {
  legend: string;
  value: T[];
  options: { value: T; label: string }[];
  onChange: (v: T[]) => void;
  multi?: boolean;
}) {
  return (
    <fieldset className="chips">
      <legend className="visually-hidden">{legend}</legend>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <label key={o.value} className="chip">
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={legend}
              checked={on}
              onChange={() => onChange(multi ? (on ? value.filter((v) => v !== o.value) : [...value, o.value]) : [o.value])}
            />
            <span>{o.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** Initials for a seat disc: first letter of the first two words. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '؟';
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join('');
}
