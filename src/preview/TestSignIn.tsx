import { useId, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { supabase } from '../lib/supabase';
import { safeReturn } from '../lib/auth';

// PREVIEW BUILDS ONLY (Ali's ruling on Agent Issue 52, ADC-LOG-775): a password sign-in for the
// four dev test accounts (Jayce and Vi, user + admin each). This module is loaded only when the
// build sets PREVIEW_SIGNIN=1 (`npm run build:preview`); `npm run build` compiles the import away,
// and scripts/check_prod_bundle.sh fails the production build if any of it is left.
// Its words live here, not in copy.ts, so none of them reach the production bundle.
// There is no sign-up here: the accounts are made with the Supabase admin API on the dev project.

export const PREVIEW_SIGNIN_MARKER = 'dt-preview-test-signin';

const WORDS = {
  en: {
    title: 'Test accounts (preview builds only)',
    body: 'For the review team. This form is not in the live app.',
    email: 'Test email',
    password: 'Password',
    submit: 'Sign in with test account',
    busy: 'Signing in…',
    failed: "That didn't work. Check the email and password.",
  },
  ar: {
    title: 'حسابات الاختبار (نسخ المعاينة فقط)',
    body: 'لفريق المراجعة. هذا النموذج غير موجود في التطبيق المنشور.',
    email: 'بريد الاختبار',
    password: 'كلمة المرور',
    submit: 'الدخول بحساب الاختبار',
    busy: 'جارٍ الدخول…',
    failed: 'لم ينجح الدخول. تحقّق من البريد وكلمة المرور.',
  },
} as const;

export default function TestSignIn({ from }: { from?: string }) {
  const { prefs } = usePrefs();
  const w = WORDS[prefs.lang === 'ar' ? 'ar' : 'en'];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const titleId = useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase();
    if (!client || busy) return;
    setBusy(true);
    setFailed(false);
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    setPassword('');
    setBusy(false);
    if (error) {
      // One message for every refusal: the form never says which half was wrong.
      setFailed(true);
      return;
    }
    window.location.hash = safeReturn(from ? `#/${from}` : '#/tonight');
  };

  return (
    <section className="panel signin__panel preview-signin" data-marker={PREVIEW_SIGNIN_MARKER} aria-labelledby={titleId}>
      <h2 id={titleId} className="signin__lead">
        {w.title}
      </h2>
      <p className="muted">{w.body}</p>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span className="field__label">{w.email}</span>
          <input
            className="input"
            type="email"
            required
            maxLength={120}
            autoComplete="username"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">{w.password}</span>
          <input
            className="input"
            type="password"
            required
            maxLength={200}
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {failed && (
          <p className="field__hint field__hint--error" role="alert">
            {w.failed}
          </p>
        )}
        <button type="submit" className="btn btn--quiet" disabled={busy} aria-busy={busy || undefined}>
          {busy ? w.busy : w.submit}
        </button>
      </form>
    </section>
  );
}
