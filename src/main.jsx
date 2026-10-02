import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import JobSheetKiosk from './JobSheetKiosk.jsx'

// ?view=jobsheet — standalone workshop Job Sheet kiosk (Wylee 2026-10-02),
// rendered BEFORE App's own Supabase-Auth login gate since floor workers
// have no office account. See JobSheetKiosk.jsx header for the full why.
const isJobSheetKiosk = new URLSearchParams(window.location.search).get('view') === 'jobsheet';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isJobSheetKiosk ? <JobSheetKiosk /> : <App />}
  </React.StrictMode>
)
