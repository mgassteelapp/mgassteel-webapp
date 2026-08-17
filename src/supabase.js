import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, key);

// NOTE: the CRM anon-key client (supabaseCrm) has been removed. All CRM reads
// now go through the reconcile-proxy edge function (login + role required),
// so no CRM key ships in the browser bundle at all.
