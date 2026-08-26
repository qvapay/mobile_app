/**
 * Module augmentation for the project's axios usage: `config.silent = true`
 * suppresses the global loading bar (read by the request/response
 * interceptors in api/client.js via LoadingBridge).
 */
import 'axios'

declare module 'axios' {
	export interface AxiosRequestConfig {
		/** Skip the GlobalLoadingBar for this request. */
		silent?: boolean
	}
}
