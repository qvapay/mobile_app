import { useCallback, useEffect } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useFocusEffect, useNavigation } from '@react-navigation/native'

// i18n
import { getDateLocale } from '../../../i18n'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../../theme/themeUtils'

// UI
import QPKeyboardView from '../../../ui/QPKeyboardView'
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Estado
import useEmailChangeQuery from '../../../hooks/useEmailChangeQuery'
import usePullRefresh from '../../../hooks/usePullRefresh'

// Vistas + reglas
import EmailChangePending from './emailchange/EmailChangePending'
import EmailChangeRequest from './emailchange/EmailChangeRequest'
import { emailChangeView, formatEmailChangeDate, problemMessageKey } from './emailchange/emailChangeRules'

// Tipos
import type { EmailChangeProblem } from '../../../types/domain'
import type { ReactElement } from 'react'
import type { RefreshControlProps } from 'react-native'

/** No se puede pedir el cambio ahora: por qué y desde cuándo se podrá. */
const EmailChangeBlocked = ({ problem, refreshControl }: { problem: EmailChangeProblem | null, refreshControl: ReactElement<RefreshControlProps> }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	const key = problem ? problemMessageKey(problem.code) : null
	const message = key ? t(`settings.emailChange.errors.${key}`) : problem?.message || t('settings.emailChange.errors.generic')
	const date = formatEmailChangeDate(problem?.until, getDateLocale())

	return (
		<QPKeyboardView scrollViewProps={{ refreshControl }}>
			<Text style={textStyles.h1}>{t('settings.emailChange.title')}</Text>
			<View style={[containerStyles.card, { flexDirection: 'row', alignItems: 'flex-start', marginTop: 20 }]}>
				<FontAwesome6 name="circle-info" size={16} color={theme.colors.warning} iconStyle="solid" />
				<View style={{ flex: 1, marginLeft: 12 }}>
					<Text style={[textStyles.body, { color: theme.colors.primaryText }]}>{message}</Text>
					{!!date && <Text style={[textStyles.body, { color: theme.colors.secondaryText, marginTop: 6 }]}>{t('settings.emailChange.until', { date })}</Text>}
				</View>
			</View>
		</QPKeyboardView>
	)
}

/**
 * Cambiar el correo de la cuenta (contrato en qpweb `content/docs/user/email-change.mdx`).
 * El servidor decide qué se ve: esta pantalla solo elige la vista según su estado y lo
 * relee al enfocarse, porque el cambio se puede pedir o cancelar desde la web.
 */
const EmailChange = () => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const navigation = useNavigation()

	const { data, isPending, isError, refetch } = useEmailChangeQuery()
	const view = emailChangeView(data)
	const hidden = !isPending && !isError && view === 'hidden'

	// Sin cancelar la petición que ya lance el montaje: serían dos
	useFocusEffect(useCallback(() => { refetch({ cancelRefetch: false }) }, [refetch]))
	const refreshControl = usePullRefresh(refetch)

	// El flujo se cerró para esta cuenta: aquí ya no queda nada que hacer
	useEffect(() => { if (hidden && navigation.canGoBack()) { navigation.goBack() } }, [hidden, navigation])

	if (data && view === 'pending' && data.enabled && data.pending) { return <EmailChangePending pending={data.pending} refreshControl={refreshControl} /> }
	if (data && view === 'request' && data.enabled) { return <EmailChangeRequest state={data} refreshControl={refreshControl} /> }
	if (data && view === 'problem' && data.enabled) { return <EmailChangeBlocked problem={data.problem} refreshControl={refreshControl} /> }

	if (isError) {
		return (
			<QPKeyboardView
				scrollViewProps={{ refreshControl }}
				actions={
					<QPButton title={t('common.actions.retry')} onPress={() => refetch()} textStyle={{ color: theme.colors.almostWhite }} />
				}
			>
				<Text style={textStyles.h1}>{t('settings.emailChange.title')}</Text>
				<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>{t('settings.emailChange.loadFailed')}</Text>
			</QPKeyboardView>
		)
	}

	return <QPLoader />
}

export default EmailChange
