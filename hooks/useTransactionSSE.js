import { useState, useEffect, useRef } from 'react'
import EventSource from 'react-native-sse'
import config from '../config'
import { getAuthToken } from '../api/client'

// Once one of these arrives the transaction can't change anymore — close the stream for good
const TERMINAL_STATUSES = ['paid', 'expired', 'failed']
// Consecutive stream errors tolerated before giving up (reconnects are the library's)
const RETRY_LIMIT = 10

/**
 * Streams real-time transaction status updates over SSE
 * (`GET /callback/transaction?uuid={uuid}`, Bearer-authenticated).
 * Based on the web useSSE pattern from ~/webs/qpweb/app/pay/wizard.js.
 *
 * The backend pushes the current status on connect via a named `init` event,
 * then each change as a plain `message` whose data is the raw status string.
 * Terminal statuses (paid/expired/failed) close the stream. Reconnection is
 * left to react-native-sse's built-in retry; after RETRY_LIMIT consecutive
 * errors the stream is closed and `error` is set (Spanish, user-facing).
 *
 * @param {string|null} transactionUuid - Transaction UUID to monitor. Pass null to disable.
 * @param {function} [onStatusChange] - Callback invoked with each new status string.
 * @returns {{ status: string, error: string|null, isConnected: boolean }} `status` starts as 'pending'.
 */
const useTransactionSSE = (transactionUuid, onStatusChange) => {

	const [status, setStatus] = useState('pending')
	const [error, setError] = useState(null)
	const [isConnected, setIsConnected] = useState(false)
	const retriesRef = useRef(0)
	const onStatusChangeRef = useRef(onStatusChange)

	// Keep callback ref updated without triggering reconnect
	useEffect(() => {
		onStatusChangeRef.current = onStatusChange
	}, [onStatusChange])

	useEffect(() => {
		if (!transactionUuid) {
			setStatus('pending')
			setError(null)
			setIsConnected(false)
			return
		}

		let es = null
		retriesRef.current = 0

		const connect = async () => {

			try {

				const token = await getAuthToken()
				const url = `${config.API_BASE_URL}/callback/transaction?uuid=${transactionUuid}`

				es = new EventSource(url, {
					headers: {
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
				})

				es.addEventListener('open', () => {
					setError(null)
					setIsConnected(true)
					retriesRef.current = 0
				})

				// Handle named 'init' event from backend
				es.addEventListener('init', (event) => {
					if (event.data) {
						const newStatus = event.data
						setStatus(newStatus)
						onStatusChangeRef.current?.(newStatus)
					}
				})

				// Handle unnamed messages (data: {status})
				es.addEventListener('message', (event) => {
					try {
						const newStatus = event.data
						if (!newStatus) return
						setStatus(newStatus)
						onStatusChangeRef.current?.(newStatus)
						if (TERMINAL_STATUSES.includes(newStatus)) {
							es.close()
							setIsConnected(false)
						}
					} catch (err) { setError('Error al procesar actualización de pago') }
				})

				es.addEventListener('error', () => {
					retriesRef.current += 1
					setIsConnected(false)
					if (retriesRef.current >= RETRY_LIMIT) {
						setError('Se perdió la conexión con el servidor')
						es.close()
					}
				})

			} catch (err) {
				setError('No se pudo establecer conexión de monitoreo')
				setIsConnected(false)
			}
		}

		connect()

		// Close the connection THIS effect opened (captured in `es`).
		return () => {
			es?.close()
			setIsConnected(false)
		}

	}, [transactionUuid])

	return { status, error, isConnected }
}

export default useTransactionSSE
