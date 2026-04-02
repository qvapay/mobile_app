// Centralized app configuration
// __DEV__ is a React Native global: true in debug, false in release/store builds

// Fallback API if primary is unreachable
const config = {
	API_BASE_URL: __DEV__ ? 'http://192.168.0.10:3000/api' : 'https://api.qvapay.com',
	API_FALLBACK_URL: 'https://api.qvpay.me',
	API_TIMEOUT: 20000,
}

export default config
