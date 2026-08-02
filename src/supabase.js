import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, key);

// CRM project (separate Supabase instance — used by PurchasingTab)
const crmUrl = import.meta.env.VITE_CRM_SUPABASE_URL;
const crmKey = import.meta.env.VITE_CRM_SUPABASE_ANON_KEY;

// Fail-soft. App.jsx imports this module, so it runs for every user on every
// page load, before login. createClient() throws on an undefined URL, which
// would white-screen the whole app — not just one tab — if the CRM env vars
// were ever missing from the deploy. When they are absent we hand back a stub
// whose queries resolve to { data: null, error }, which PurchasingTab already
// handles as "no data", so the blast radius stays inside the Cadangan PO tab.
function crmUnavailableClient() {
  const result = {
    data: null,
    error: new Error('CRM Supabase not configured — set VITE_CRM_SUPABASE_URL and VITE_CRM_SUPABASE_ANON_KEY'),
  };
  // Any query-builder method returns the chain; awaiting the chain yields `result`.
  const chain = new Proxy({ then: (resolve) => resolve(result) }, {
    get: (target, prop) => (prop in target ? target[prop] : () => chain),
  });
  return { from: () => chain };
}

export const supabaseCrm = (crmUrl && crmKey)
  ? createClient(crmUrl, crmKey)
  : crmUnavailableClient();
