// Centralized app configuration, consumed by api/client.js (axios) and the
// SSE hooks. __DEV__ is a React Native global: true in debug, false in
// release/store builds — so debug builds hit the LAN backend (adjust the IP
// for your machine) and store builds hit production.
const config = {
	API_BASE_URL: __DEV__ ? 'http://192.168.0.10:3000/api' : 'https://api.qvapay.com',
	// Spare host for when the primary API is unreachable — declared but not yet
	// wired into any retry logic
	API_FALLBACK_URL: 'https://www.qvapay.com/api',
	// Axios request timeout (ms)
	API_TIMEOUT: 20000,
}

export default config
