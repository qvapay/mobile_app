/**
 * Module augmentation for the project's axios usage: `config.silent = true`
 * suppresses the global loading bar (read by the request/response
 * interceptors in api/client.js via LoadingBridge), and `config.anonymous = true`
 * sends the request without the session token.
 */
import 'axios'

declare module 'axios' {
	export interface AxiosRequestConfig {
		/** Skip the GlobalLoadingBar for this request. */
		silent?: boolean
		/**
		 * Send WITHOUT the bearer token: routes that don't require an account (the
		 * non-custodial wallet), so nothing about the account reaches them. A 401 on
		 * such a request never clears the stored token.
		 */
		anonymous?: boolean
	}
}
