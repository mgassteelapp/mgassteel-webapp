// TelegramLinkPanel.jsx — self-serve Telegram notification linking
// Wylee 2026-09-01: "what about notifications outside the app" — the
// backend already has a live self-serve link flow (telegram-bot edge
// function handles /start + a shared registration code, matches the
// replied name against profiles.name, upserts telegram_links), but it was
// never surfaced anywhere in the app — only Wylee himself had ever linked
// his Telegram, because nobody else knew the bot existed or had the code.
//
// This is a small bell button in the sidebar footer (every logged-in user,
// any role) that shows link status and, if not yet linked, walks through
// the existing flow. No new backend linking mechanism was built — this
// only exposes what already exists via two new read-only SECURITY DEFINER
// RPCs (telegram_link_code / telegram_link_status) that were missing
// because reconcile_config and telegram_links both have RLS enabled with
// zero policies (correctly — that's where the bot token lives).

import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { C } from './theme';

const BOT_USERNAME = 'mgascwl_alert_bot'; // looked up live via Telegram getMe, 2026-09-01 — never changes without a deliberate bot recreation
const BOT_LINK = `https://t.me/${BOT_USERNAME}`;

export default function TelegramLinkPanel({ session }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null); // { linked, tgUsername, linkedAt } | { linked:false }
  const [code, setCode] = useState('');
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [{ data: codeData, error: codeErr }, { data: statusData, error: statusErr }] = await Promise.all([
        supabase.rpc('telegram_link_code'),
        supabase.rpc('telegram_link_status'),
      ]);
      if (codeErr) throw codeErr;
      if (statusErr) throw statusErr;
      setCode(codeData || '');
      const row = Array.isArray(statusData) ? statusData[0] : statusData;
      setStatus(row ? { linked: true, tgUsername: row.tg_username, linkedAt: row.linked_at } : { linked: false });
    } catch (e) {
      setLoadError('Gagal semak status Telegram. (' + (e?.message || e) + ')');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const linked = status?.linked === true;
  const dotColor = loading ? C.muted : linked ? C.green : '#d97706';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={linked ? 'Telegram disambung' : 'Sambung Telegram untuk notifikasi'}
        style={{ position:'relative', background:'none', border:'none', color:C.muted, cursor:'pointer',
          fontSize:15, padding:4, borderRadius:6, lineHeight:1 }}
        onMouseEnter={e => e.currentTarget.style.background = C.gray}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        🔔
        <span style={{ position:'absolute', top:2, right:2, width:7, height:7, borderRadius:'50%',
          background:dotColor, border:`1.5px solid ${C.white}` }} />
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position:'fixed', inset:0, background:'rgba(26,22,24,0.42)', zIndex:60,
          display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:C.white, borderRadius:14, padding:22, maxWidth:420, width:'100%',
            boxShadow:'0 12px 32px rgba(26,22,24,0.25)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div style={{ fontSize:15, fontWeight:700, color:C.navy }}>🔔 Notifikasi Telegram</div>
              <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', fontSize:16, color:C.muted, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize:11.5, color:C.muted, marginBottom:16 }}>
              Terima notifikasi (stok rendah, pertanyaan harga, dll.) terus ke Telegram — tak perlu buka app.
            </div>

            {loading ? (
              <div style={{ fontSize:12.5, color:C.muted, padding:'10px 0' }}>Menyemak status…</div>
            ) : loadError ? (
              <div style={{ fontSize:12.5, color:C.red, padding:'10px 0' }}>{loadError}</div>
            ) : linked ? (
              <div style={{ background:C.greenLight, border:'1px solid #86efac', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.green, marginBottom:4 }}>✅ Telegram anda sudah disambung</div>
                {status.tgUsername && <div style={{ fontSize:11.5, color:C.text }}>Akaun: @{status.tgUsername}</div>}
                {status.linkedAt && (
                  <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                    Disambung sejak {new Date(status.linkedAt).toLocaleDateString('en-MY', { day:'2-digit', month:'short', year:'numeric' })}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <ol style={{ margin:'0 0 14px', paddingLeft:18, fontSize:12.5, lineHeight:1.9, color:C.text }}>
                  <li>Buka Telegram, cari bot <b>@{BOT_USERNAME}</b> (atau klik butang di bawah)</li>
                  <li>Hantar mesej <b>/start</b> kepada bot</li>
                  <li>Bot akan minta kod pendaftaran — balas dengan:
                    <div style={{ marginTop:6, background:C.gray, border:`1px solid ${C.border}`, borderRadius:8,
                      padding:'8px 11px', fontFamily:'monospace', fontSize:13, fontWeight:700, color:C.navy }}>
                      {code || '…'} {session?.name || ''}
                    </div>
                    <div style={{ fontSize:10.5, color:C.muted, marginTop:3 }}>Guna nama penuh sama macam log masuk app.</div>
                  </li>
                </ol>
                <a href={BOT_LINK} target="_blank" rel="noopener noreferrer" style={{
                  display:'block', textAlign:'center', background:'#229ED9', color:C.white, borderRadius:8,
                  padding:'10px', fontWeight:700, fontSize:13, textDecoration:'none', marginBottom:8 }}>
                  Buka @{BOT_USERNAME} di Telegram
                </a>
              </div>
            )}

            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={refresh} disabled={loading} style={{
                flex:1, background:C.white, border:`1px solid ${C.border}`, color:C.navy, borderRadius:8,
                padding:'8px', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                🔄 Semak Status
              </button>
              <button onClick={() => setOpen(false)} style={{
                flex:1, background:C.navy, border:'none', color:C.white, borderRadius:8,
                padding:'8px', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
