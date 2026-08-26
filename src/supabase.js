import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, key);

// NOTE: the CRM anon-key client (supabaseCrm) has been removed. All CRM reads
// now go through the reconcile-proxy edge function (login + role required),
// so no CRM key ships in the browser bundle at all.

// reconcile-proxy calls intermittently 401'd in production (2026-08-26) even
// right after a successful call seconds earlier — the access token racing a
// background refresh (supabase-js auto-refreshes ~a minute before expiry;
// a request built just as that swap happens can carry a token that's
// already stale by the time it reaches the edge function). A JWT going bad
// mid-life should be rare, but when it happens the old behaviour was to
// show the user a raw "Edge Function returned a non-2xx status code" error
// with no recovery. This wrapper is a drop-in replacement for
// `supabase.functions.invoke('reconcile-proxy', { body })` — same
// { data, error } return shape — that forces a session refresh and retries
// exactly once on a 401 before giving up, so a transient race resolves
// itself invisibly instead of surfacing as "not working."
export async function invokeReconcile(body, opts = {}) {
  const { retried = false } = opts;
  const result = await supabase.functions.invoke('reconcile-proxy', { body });
  const status = result?.error?.context?.status;
  if (status === 401 && !retried) {
    try { await supabase.auth.refreshSession(); } catch {}
    return invokeReconcile(body, { retried: true });
  }
  return result;
}

// supabase-js hides the real reason behind a generic "Edge Function returned
// a non-2xx status code" message. This digs the actual server-sent error
// (or a plain, actionable message for a 401 that survived invokeReconcile's
// retry — i.e. a genuinely expired session, not a transient race) out of
// error.context, the raw Response object, so error banners are debuggable
// without needing to go pull edge function logs by hand.
export async function describeFnError(error) {
  if (!error) return '';
  if (error.context?.status === 401) {
    return 'Sesi log masuk tamat tempoh — sila log keluar dan log masuk semula.';
  }
  if (error.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch { /* fall through to generic message below */ }
  }
  return error.message || String(error);
}
