// Centralized app configuration, consumed by api/client.ts (axios), the SSE
// hooks and the PDF download. __DEV__ is a React Native global: true in
// debug, false in release/store builds.
//
// Debug builds hit the LAN backend (adjust the IP for your machine). If that
// host does not answer within API_DEV_PROBE_TIMEOUT, `api/apiHost.ts` switches
// the whole client to production for the rest of the session — so a debug
// build still works away from the dev machine. Store builds go straight to
// production and never probe.
const API_PROD_URL = 'https://api.qvapay.com'

const config = {
	API_BASE_URL: __DEV__ ? 'http://10.0.0.239:3000/api' : API_PROD_URL,
	API_PROD_URL,
	// Dev only: how long to wait for the LAN backend before falling back (ms)
	API_DEV_PROBE_TIMEOUT: 15000,
	// Axios request timeout (ms)
	API_TIMEOUT: 20000,
}

export default config
