import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'

// i18n
import { getDateLocale } from '../../../../i18n'

// Auth
import { useAuth } from '../../../../auth/AuthContext'

// Estado
import { EMAIL_CHANGE_KEY } from '../../../../hooks/useEmailChangeQuery'

// Reglas
import { classifyEmailChangeFailure, formatEmailChangeDate } from './emailChangeRules'
import type { EmailChangeFailure } from './emailChangeRules'

// Tipos
import type { ApiFailure } from '../../../../types/api'

/**
 * Lo común ante un fallo: enseñar el mensaje y hacer lo que no depende del paso (recargar
 * el estado, ocultar el flujo, pedir login). Devuelve la clasificación para que cada paso
 * resuelva lo suyo, que es marcar un campo o volver al principio.
 *
 * @returns Función que recibe el fallo de la API.
 */
export default function useEmailChangeFailure() {

	const { t } = useTranslation()
	const { logout } = useAuth()
	const queryClient = useQueryClient()

	return (result: ApiFailure): EmailChangeFailure => {

		const failure = classifyEmailChangeFailure(result)
		const message = failure.messageKey
			? t(`settings.emailChange.errors.${failure.messageKey}`)
			: failure.serverMessage || t('settings.emailChange.errors.generic')
		const date = formatEmailChangeDate(failure.until, getDateLocale())
		toast.error(message, date ? { description: t('settings.emailChange.until', { date }) } : undefined)

		if (failure.integrationCode) { console.warn('[email-change] integration failure:', failure.integrationCode) }
		if (failure.action === 'reload') { queryClient.invalidateQueries({ queryKey: EMAIL_CHANGE_KEY }) }
		if (failure.action === 'hide') { queryClient.setQueryData(EMAIL_CHANGE_KEY, { enabled: false }) }
		if (failure.action === 'login') { logout() }

		return failure
	}
}
