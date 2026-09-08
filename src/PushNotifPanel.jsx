// PushNotifPanel.jsx — self-serve live pop-up notification opt-in for
// owner/manager (Wylee 2026-09-08 follow-up to Minta Stok: "possible to
// hav elive pop up to mira and admin" — a live in-app toast already fires
// via Supabase Realtime (see StockRequestToast in App.jsx), this is the
// second half: an actual OS-level notification that lands even when the
// tab isn't focused or the app isn't open, via the Web Push API.
//
// Same self-serve, bell-button-in-the-sidebar-footer pattern as
// TelegramLinkPanel — deliberately parallel, since this solves the same
// underlying problem (staff didn't know a notification channel existed)
// for a different channel. No new backend "linking" concept: a subscribed
// browser is a row in push_subscriptions (endpoint + keys), sent by
// telegram-bot's stockRequestCreated/stockRequestDecided actions alongside
// the Telegram ping.
//
import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { C } from './theme';

// VAPID_PUBLIC_KEY is deliberately hardcoded — it's the PUBLIC half of the
// key pair and is meant to travel with every subscribing browser (it's
// embedded in the subscription request itself). It must match
// reconcile_config.vapid_public_key on the pricecheck project; if that key
// is ever rotated, this constant has to be updated in the same change.
const VAPID_PUBLIC_KEY = 'BOiODazlfPwacwUSS01iK9nJQz_M4ZkfAsK8WCqj68hsJvAlpFA0mmyE9b9Z4lLYq8rnp-iabCmlXA95iOA1uK0';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

const SUPPORTED = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export default function PushNotifPanel({ session }) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!SUPPORTED) { setChecking(false); return; }
    setChecking(true);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch {
      // registration can fail on http:// (non-secure) or unsupported browsers — treat as not subscribed, not an error
      setSubscribed(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const subscribe = async () => {
    setBusy(true); setError('');
    try {
      if (Notification.permission === 'denied') {
        throw new Error('Kebenaran notifikasi disekat pada peranti ini. Sila benarkan notifikasi untuk laman ini dalam tetapan pelayar.');
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Kebenaran notifikasi tidak diberikan.');

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const json = sub.toJSON();
      const { error: dbErr } = await supabase.from('push_subscriptions').upsert({
        profile_name: session.name,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (dbErr) throw dbErr;
      setSubscribed(true);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true); setError('');
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // Owner/manager only — same recipients as the live toast and the
  // stock-request Telegram ping.
  if (session.role !== 'owner' && session.role !== 'manager') return null;

  const dotColor = checking ? C.muted : subscribed ? C.green : '#d97706';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={subscribed ? 'Notifikasi pop-up aktif' : 'Aktifkan notifikasi pop-up'}
        style={{ position: 'relative', background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
          fontSize: 15, padding: 4, borderRadius: 6, lineHeight: 1 }}
        onMouseEnter={e => e.currentTarget.style.background = C.gray}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        📱
        <span style={{ position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: '50%',
          background: dotColor, border: `1.5px solid ${C.white}` }} />
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(26,22,24,0.42)', zIndex: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: 14, padding: 22, maxWidth: 420, width: '100%',
            boxShadow: '0 12px 32px rgba(26,22,24,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>📱 Notifikasi Pop-up</div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 16, color: C.muted, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 16 }}>
              Terima notifikasi terus ke peranti ini (telefon/komputer) untuk permintaan Minta Stok baharu — walaupun app tidak dibuka.
            </div>

            {!SUPPORTED ? (
              <div style={{ background: '#f1f5f9', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: C.text }}>
                Pelayar/peranti ini tidak menyokong notifikasi pop-up. (Di iPhone: tambah app ini ke Skrin Utama dahulu — "Tambah ke Skrin Utama" dari Safari — barulah pilihan ini akan berfungsi.)
              </div>
            ) : checking ? (
              <div style={{ fontSize: 12.5, color: C.muted, padding: '10px 0' }}>Menyemak status…</div>
            ) : subscribed ? (
              <div style={{ background: C.greenLight, border: '1px solid #86efac', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 8 }}>✅ Notifikasi pop-up aktif pada peranti ini</div>
                <button onClick={unsubscribe} disabled={busy} style={{
                  background: C.white, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8,
                  padding: '7px 12px', fontWeight: 700, fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer' }}>
                  {busy ? 'Memproses…' : 'Nyahaktifkan'}
                </button>
              </div>
            ) : (
              <button onClick={subscribe} disabled={busy} style={{
                width: '100%', background: busy ? '#94a3b8' : C.navy, border: 'none', color: C.white, borderRadius: 8,
                padding: '11px', fontWeight: 700, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? 'Memproses…' : '🔔 Aktifkan Notifikasi Pop-up'}
              </button>
            )}
            {error && <div style={{ fontSize: 12, color: C.red, marginTop: 10 }}>{error}</div>}

            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 14 }}>
              Ini berasingan daripada Telegram — anda boleh aktifkan kedua-dua, salah satu, atau tiada.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
