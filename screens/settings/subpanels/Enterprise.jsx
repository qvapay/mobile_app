import { useCallback, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, Linking, AppState } from 'react-native'
import { useTranslation } from 'react-i18next'

// React Query
import { useQuery } from '@tanstack/react-query'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'

// API
import { userApi } from '../../../api/userApi'
import { unwrap } from '../../../api/unwrap'

// Helpers
import { getShortDateTime } from '../../../helpers'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../../routes'

// El registro es NATIVO (wizard EnterpriseRegister → POST /user/company); la
// gestión de tiendas del vendedor sigue siendo web-only y abre el navegador
const SELLER_URL = 'https://www.qvapay.com/seller'

// Mismos textos de estado que /settings/company de la web — claves de i18n
// resueltas en render (constante de módulo)
const STATUS_LABEL = {
	pending: 'settings.enterprise.status.pending',
	reviewing: 'settings.enterprise.status.reviewing',
	contacted: 'settings.enterprise.status.contacted',
	approved: 'settings.enterprise.status.approved',
	rejected: 'settings.enterprise.status.rejected',
}

const STATUS_EXPLAINER = {
	pending: 'settings.enterprise.statusExplainer.pending',
	reviewing: 'settings.enterprise.statusExplainer.reviewing',
	contacted: 'settings.enterprise.statusExplainer.contacted',
	approved: 'settings.enterprise.statusExplainer.approved',
	rejected: 'settings.enterprise.statusExplainer.rejected',
}

/**
 * Empresa — estado del registro empresarial de la cuenta (espejo móvil de
 * Ajustes → Empresa de la web). Lee `GET /user/company` vía React Query
 * (`['user','company']`) y muestra:
 *
 * - Sin empresas: beneficios + CTA al wizard nativo (EnterpriseRegister).
 * - Con empresas: tarjeta por solicitud con badge de estado (pending/reviewing/
 *   contacted/approved/rejected), datos enviados y fecha; las rechazadas
 *   ofrecen re-aplicar (mismo wizard) y las aprobadas enlazan a la gestión de
 *   tiendas del vendedor (web).
 *
 * El wizard invalida `['user','company']` al enviar; el re-check por AppState
 * cubre además cambios hechos en la web del vendedor u otro dispositivo.
 */
const Enterprise = ({ navigation }) => {

	// Idioma activo
	const { t } = useTranslation()

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Colores de badge por estado (espejo de los de /settings/company; el azul de
	// "contactado" no existe como token del theme, se fija igual que en la web)
	const STATUS_COLOR = {
		pending: theme.colors.warning,
		reviewing: theme.colors.primary,
		contacted: '#3B82F6',
		approved: theme.colors.successText,
		rejected: theme.colors.danger,
	}

	// Empresas del usuario
	const { data, isPending, isError, refetch } = useQuery({
		queryKey: ['user', 'company'],
		queryFn: async () => unwrap(await userApi.getCompanies()),
		placeholderData: previous => previous,
	})
	const companies = data?.companies ?? []
	const hasApproved = companies.some((company) => company.status === 'approved')

	// Re-check al volver del navegador (registro o re-aplicación en la web)
	const browserOpenedRef = useRef(false)
	useEffect(() => {
		const sub = AppState.addEventListener('change', (state) => {
			if (state === 'active' && browserOpenedRef.current) {
				browserOpenedRef.current = false
				refetch()
			}
		})
		return () => sub.remove()
	}, [refetch])

	const openInBrowser = useCallback((url) => {
		browserOpenedRef.current = true
		Linking.openURL(url)
	}, [])

	if (isPending && !data) return <QPLoader />

	// Error sin caché — con datos previos se pinta la lista y el refetch corre por detrás
	if (isError && !data) {
		return (
			<View style={containerStyles.subContainer}>
				<View style={styles.center}>
					<View style={[styles.heroIcon, { backgroundColor: theme.colors.danger + '18' }]}>
						<FontAwesome6 name="building-circle-exclamation" size={36} color={theme.colors.danger} iconStyle="solid" />
					</View>
					<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 18, textAlign: 'center' }]}>{t('settings.enterprise.errorTitle')}</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6 }]}>
						{t('settings.enterprise.errorBody')}
					</Text>
					<QPButton title={t('common.actions.retry')} onPress={() => refetch()} style={{ marginTop: 24, alignSelf: 'stretch' }} textStyle={{ color: theme.colors.almostWhite }} />
				</View>
			</View>
		)
	}

	// Sin empresa registrada: beneficios + CTA al wizard web
	if (companies.length === 0) {
		return (
			<View style={[containerStyles.subContainer, { justifyContent: 'space-between', paddingHorizontal: 20 }]}>

				<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
					<View style={[styles.heroIcon, { backgroundColor: theme.colors.primary + '18' }]}>
						<FontAwesome6 name="building" size={40} color={theme.colors.primary} iconStyle="solid" />
					</View>

					<Text style={[textStyles.h1, { color: theme.colors.primaryText, marginTop: 18 }]}>{t('settings.enterprise.emptyTitle')}</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6, marginBottom: 24 }]}>
						{t('settings.enterprise.emptyBody')}
					</Text>

					<View style={[containerStyles.card, { width: '100%' }]}>
						<BenefitItem icon="crown" text={t('settings.enterprise.benefits.vipBadge')} theme={theme} textStyles={textStyles} />
						<BenefitItem icon="store" text={t('settings.enterprise.benefits.marketplaceStore')} theme={theme} textStyles={textStyles} />
						<BenefitItem icon="credit-card" text={t('settings.enterprise.benefits.morePaymentMethods')} theme={theme} textStyles={textStyles} />
						<BenefitItem icon="bullhorn" text={t('settings.enterprise.benefits.promotion')} theme={theme} textStyles={textStyles} />
					</View>
				</View>

				<View style={containerStyles.bottomButtonContainer}>
					<QPButton
						title={t('settings.enterprise.registerButton')}
						onPress={() => navigation.navigate(ROUTES.ENTERPRISE_REGISTER)}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
				</View>

			</View>
		)
	}

	// Con solicitudes: tarjeta por empresa + gestión de tiendas si hay aprobada
	return (
		<ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 20, gap: 14 }}>

			<Text style={textStyles.h1}>{t('settings.enterprise.title')}</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
				{t('settings.enterprise.subtitle')}
			</Text>

			{companies.map((company) => {
				const color = STATUS_COLOR[company.status] || theme.colors.secondaryText
				return (
					<View key={company.uuid} style={[containerStyles.card, { flexDirection: 'column', alignItems: 'stretch' }]}>

						<View style={styles.cardHeader}>
							<View style={[styles.companyIcon, { backgroundColor: theme.colors.primary + '18' }]}>
								<FontAwesome6 name="building" size={20} color={theme.colors.primary} iconStyle="solid" />
							</View>
							<View style={{ flex: 1 }}>
								<Text style={[textStyles.h2, { color: theme.colors.primaryText }]} numberOfLines={1}>{company.company_name}</Text>
								<View style={[styles.statusPill, { backgroundColor: color + '18' }]}>
									<Text style={[textStyles.h7, { color }]}>{STATUS_LABEL[company.status] ? t(STATUS_LABEL[company.status]) : company.status}</Text>
								</View>
							</View>
						</View>

						<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginTop: 10 }]}>
							{STATUS_EXPLAINER[company.status] ? t(STATUS_EXPLAINER[company.status]) : ''}
						</Text>

						<View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

						<DetailRow label={t('settings.enterprise.details.director')} value={company.director_name} theme={theme} textStyles={textStyles} />
						<DetailRow label={t('settings.enterprise.details.email')} value={company.email} theme={theme} textStyles={textStyles} />
						<DetailRow label={t('settings.enterprise.details.activity')} value={company.activity} theme={theme} textStyles={textStyles} />
						<DetailRow label={t('settings.enterprise.details.employees')} value={company.employee_count} theme={theme} textStyles={textStyles} />
						<DetailRow label={t('settings.enterprise.details.statutes')} value={company.statutes_sent ? t('settings.enterprise.details.statutesSent') : t('settings.enterprise.details.statutesNotSent')} theme={theme} textStyles={textStyles} />
						<DetailRow label={t('settings.enterprise.details.submittedAt')} value={company.created_at ? getShortDateTime(company.created_at) : 'N/A'} theme={theme} textStyles={textStyles} />

						{company.status === 'rejected' && (
							<QPButton
								title={t('settings.enterprise.reapplyButton')}
								onPress={() => navigation.navigate(ROUTES.ENTERPRISE_REGISTER)}
								style={{ marginTop: 14 }}
								textStyle={{ color: theme.colors.almostWhite }}
							/>
						)}
					</View>
				)
			})}

			{hasApproved && (
				<View style={[containerStyles.card, { flexDirection: 'column', alignItems: 'stretch' }]}>
					<View style={styles.cardHeader}>
						<View style={[styles.companyIcon, { backgroundColor: theme.colors.successText + '18' }]}>
							<FontAwesome6 name="store" size={20} color={theme.colors.successText} iconStyle="solid" />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[textStyles.h2, { color: theme.colors.primaryText }]}>{t('settings.enterprise.stores.title')}</Text>
							<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginTop: 2 }]}>
								{t('settings.enterprise.stores.body')}
							</Text>
						</View>
					</View>
					<QPButton
						title={t('settings.enterprise.stores.manageButton')}
						onPress={() => openInBrowser(SELLER_URL)}
						style={{ marginTop: 14 }}
						textStyle={{ color: theme.colors.almostWhite }}
					/>
				</View>
			)}

		</ScrollView>
	)
}

const BenefitItem = ({ icon, text, theme, textStyles }) => (
	<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
		<FontAwesome6 name={icon} size={16} color={theme.colors.successText} iconStyle="solid" />
		<Text style={[textStyles.body, { color: theme.colors.secondaryText }]}>{text}</Text>
	</View>
)

const DetailRow = ({ label, value, theme, textStyles }) => (
	<View style={styles.detailRow}>
		<Text style={[textStyles.h5, { color: theme.colors.secondaryText }]}>{label}</Text>
		<Text style={[textStyles.h5, { color: theme.colors.primaryText, flexShrink: 1, textAlign: 'right' }]} numberOfLines={2}>{value}</Text>
	</View>
)

const styles = StyleSheet.create({
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingBottom: 80,
		paddingHorizontal: 20,
	},
	heroIcon: {
		width: 96,
		height: 96,
		borderRadius: 24,
		borderCurve: 'continuous',
		alignItems: 'center',
		justifyContent: 'center',
	},
	cardHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 12,
	},
	companyIcon: {
		width: 44,
		height: 44,
		borderRadius: 12,
		borderCurve: 'continuous',
		alignItems: 'center',
		justifyContent: 'center',
	},
	statusPill: {
		alignSelf: 'flex-start',
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 3,
		marginTop: 4,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		marginVertical: 12,
	},
	detailRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		gap: 16,
		paddingVertical: 5,
	},
})

export default Enterprise
