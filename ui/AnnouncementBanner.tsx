import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated'

// Theme Context
import { useTheme } from '../theme/ThemeContext'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../routes'

// Descarte persistido
import useAnnouncementDismiss from '../hooks/useAnnouncementDismiss'

// Resolución del enlace del botón
import { resolveAnnouncementTarget } from '../helpers/announcementLink'

// Tipos
import type { NavigationProp } from '@react-navigation/native'
import type { Announcement } from '../types/domain'
import type { RootStackParamList } from '../types/navigation'
import type { Theme } from '../theme/ThemeContext'

type AnnouncementBannerProps = {
	announcement?: Announcement | null
	navigation: NavigationProp<RootStackParamList>
}

/**
 * Aviso global del Home: la contraparte móvil de la barra de avisos del
 * dashboard web, alimentada por la MISMA tabla (`announcements`, gestionada en
 * el panel admin de qpweb).
 *
 * Deliberadamente distinto de `PromoBanner`, que es otra cosa: la promo es una
 * oferta comercial (tarjeta con logo, sin descarte); esto es comunicación
 * operativa — título, mensaje, botón opcional y una X que lo descarta durante
 * `dismiss_days` días (0 = para siempre). Los dos pueden convivir; el aviso va
 * arriba.
 *
 * El texto lo escribe una persona desde el admin y llega ya redactado: es
 * passthrough del backend y no pasa por i18n (solo el `accessibilityLabel` de
 * la X, que es cuerda de la app).
 *
 * @param props
 * @param [props.announcement] - Aviso vigente, o null para no pintar nada.
 * @param props.navigation - Navegación del stack raíz (para los CTA internos).
 */
const AnnouncementBanner = ({ announcement, navigation }: AnnouncementBannerProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const { visible, dismiss } = useAnnouncementDismiss(announcement?.id, announcement?.dismiss_days ?? 0)

	const opacity = useSharedValue(0)

	const shown = Boolean(announcement?.title) && visible

	useEffect(() => {
		opacity.value = withTiming(shown ? 1 : 0, { duration: 250, easing: Easing.out(Easing.ease) })
	}, [shown, opacity])

	const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

	const target = resolveAnnouncementTarget(announcement?.cta_url)
	const ctaLabel = announcement?.cta_label?.trim()
	const hasCta = Boolean(ctaLabel && target)

	const handleCta = useCallback(() => {
		if (!target) return
		if (target.kind === 'external') { Linking.openURL(target.url).catch(() => { /* no handler */ }); return }
		// El tipado de `navigate` exige literales del ParamList y aquí la ruta se
		// resuelve en runtime desde el enlace del admin: la tabla de
		// `helpers/announcementLink` solo produce rutas que SÍ existen en él
		const navigate = navigation.navigate as (route: string, params?: object) => void
		if (target.kind === 'tab') { navigate(ROUTES.MAIN_STACK, { screen: target.screen }); return }
		navigate(target.route, target.params)
	}, [target, navigation])

	if (!shown) return null

	return (
		<Animated.View
			style={[
				styles.container,
				animatedStyle,
				{ backgroundColor: theme.colors.surface },
				(theme as Theme & { mode?: string }).mode === 'light' && { borderWidth: 1, borderColor: theme.colors.border },
			]}
		>
			<View style={[styles.icon, { backgroundColor: theme.colors.primary + '20' }]}>
				<FontAwesome6 name="bullhorn" size={14} color={theme.colors.primary} iconStyle="solid" />
			</View>

			<View style={styles.body}>
				<Text style={[styles.title, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]} numberOfLines={2}>
					{announcement!.title}
				</Text>
				{announcement!.message ? (
					<Text style={[styles.message, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]} numberOfLines={3}>
						{announcement!.message}
					</Text>
				) : null}
				{hasCta ? (
					<Pressable onPress={handleCta} style={({ pressed }) => [styles.cta, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 }]}>
						<Text style={[styles.ctaText, { color: theme.colors.almostWhite, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }]}>{ctaLabel}</Text>
						<FontAwesome6 name="arrow-right" size={10} color={theme.colors.almostWhite} iconStyle="solid" />
					</Pressable>
				) : null}
			</View>

			<Pressable onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('home.banners.announcement.dismiss')}>
				<FontAwesome6 name="xmark" size={14} color={theme.colors.tertiaryText} iconStyle="solid" />
			</Pressable>
		</Animated.View>
	)
}

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 12,
		borderRadius: 16,
		borderCurve: 'continuous',
		padding: 12,
		marginBottom: 6,
	},
	icon: {
		width: 28,
		height: 28,
		borderRadius: 14,
		justifyContent: 'center',
		alignItems: 'center',
	},
	body: {
		flex: 1,
		gap: 2,
	},
	title: {},
	message: {},
	cta: {
		flexDirection: 'row',
		alignItems: 'center',
		alignSelf: 'flex-start',
		gap: 6,
		marginTop: 8,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 12,
		borderCurve: 'continuous',
	},
	ctaText: {},
})

export default AnnouncementBanner
