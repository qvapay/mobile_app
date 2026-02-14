import { useState, useEffect, useRef } from 'react'
import EventSource from 'react-native-sse'
import AsyncStorage from '@react-native-async-storage/async-storage'
import config from '../config'

const TERMINAL_STATUSES = ['paid', 'expired', 'failed']
const RETRY_LIMIT = 10

/**
 * Hook to connect to the backend SSE endpoint for real-time transaction status updates.
 * Based on the web useSSE pattern from ~/webs/qpweb/app/pay/wizard.js
 *
 * @param {string|null} transactionUuid - Transaction UUID to monitor. Pass null to disable.
 * @param {function} onStatusChange - Callback invoked with the new status string.
 * @returns {{ status: string, error: string|null, isConnected: boolean }}
 */
const useTransactionSSE = (transactionUuid, onStatusChange) => {

	const [status, setStatus] = useState('pending')
	const [error, setError] = useState(null)
	const [isConnected, setIsConnected] = useState(false)
	const eventSourceRef = useRef(null)
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
				const token = await AsyncStorage.getItem('token')
				const url = `${config.API_BASE_URL}/callback/transaction?uuid=${transactionUuid}`

				es = new EventSource(url, {
					headers: {
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
				})
				eventSourceRef.current = es

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
							eventSourceRef.current = null
							setIsConnected(false)
						}
					} catch (err) {
						setError('Error al procesar actualización de pago')
					}
				})

				es.addEventListener('error', () => {
					retriesRef.current += 1
					setIsConnected(false)

					if (retriesRef.current >= RETRY_LIMIT) {
						setError('Se perdió la conexión con el servidor')
						es.close()
						eventSourceRef.current = null
					}
				})

			} catch (err) {
				setError('No se pudo establecer conexión de monitoreo')
				setIsConnected(false)
			}
		}

		connect()

		return () => {
			if (eventSourceRef.current) {
				eventSourceRef.current.close()
				eventSourceRef.current = null
			}
			setIsConnected(false)
		}
	}, [transactionUuid])

	return { status, error, isConnected }
}

export default useTransactionSSE
