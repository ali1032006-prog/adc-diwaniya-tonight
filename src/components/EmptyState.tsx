import type { ReactNode } from 'react';

interface Action {
  label: string;
  href: string;
  primary?: boolean;
}

/** Empty states teach the screen and offer the next action, never just "nothing here". */
export function EmptyState({ art, title, body, actions }: { art: ReactNode; title: string; body: string; actions: Action[] }) {
  return (
    <section className="empty">
      <div className="empty__art">{art}</div>
      <h2 className="empty__title">{title}</h2>
      <p className="empty__body">{body}</p>
      <div className="empty__actions">
        {actions.map((a) => (
          <a key={a.label} href={a.href} className={a.primary ? 'btn btn--primary' : 'btn btn--quiet'}>
            {a.label}
          </a>
        ))}
      </div>
    </section>
  );
}
