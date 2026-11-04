import { Fragment, useCallback, useMemo, useRef } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { NavigationProp } from '@react-navigation/native'

import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'
import { useAuth } from '../../auth/AuthContext'
import { ROUTES } from '../../routes'
import P2POfferItem, { P2POfferItemSkeleton } from '../../ui/P2POfferItem'
import QPPressable from '../../ui/particles/QPPressable'
import { useP2pMarketAveragesQuery } from '../p2p/p2pQueries'
import { usePeerProfile } from '../p2p/usePeerProfile'
import { missingP2PRequirements, requirementFromApiError } from '../p2p/p2pRequirements'
import { activeRequirements } from '../p2p/p2pOfferCard'
import { useViaP2PShowcaseQuery, viaP2PShowcaseKey } from './addQueries'
import { applicantStatsFrom, evaluateRequirements, howToPayKey, marketParams, showcaseRequirements } from './depositViaP2P'

import type { ApiError } from '../../api/unwrap'
import type { Theme } from '../../theme/ThemeContext'
import type { Coin, P2PRequirements } from '../../types/domain'
import type { RootStackParamList } from '../../types/navigation'
import type { RequirementMiss } from './depositViaP2P'

type Props = {
	coin: Coin
	navigation: NavigationProp<RootStackParamList>
}

/** Etiqueta de un requisito («10+ operaciones completadas»), la misma de la card del mercado. */
const requirementLabel = (t: (key: string, opts?: Record<string, unknown>) => string, key: string, value: number) =>
	t(`ui.offerItem.requirement.${key}`, { value: key === 'min_rating' ? value.toFixed(1) : value })

type ChipsProps = {
	requirements: P2PRequirements
	missing: RequirementMiss[] | null
	theme: Theme
}

/** Chips de requisitos: neutros hasta saber si se cumplen, luego ✓ / ✗. */
const RequirementChips = ({ requirements, missing, theme }: ChipsProps) => {
	const { t } = useTranslation()
	const textStyles = useTextStyles(theme)
	const active = activeRequirements(requirements) ?? []
	return (
		<View style={styles.chips}>
			{active.map(([key, value]) => {
				const state = missing === null ? 'unknown' : missing.some(m => m.key === key) ? 'missing' : 'met'
				const palette = state === 'met'
					? { bg: theme.colors.successFill + '1F', ink: theme.colors.successText, icon: 'check' as const }
					: state === 'missing'
						? { bg: theme.colors.danger + '20', ink: theme.colors.dangerText, icon: 'xmark' as const }
						: { bg: 'transparent', ink: theme.colors.secondaryText, icon: null }
				return (
					<View
						key={key}
						style={[styles.chip, { backgroundColor: palette.bg }, state === 'unknown' && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}
						accessibilityLabel={`${requirementLabel(t, key, value)}${state === 'met' ? ` (${t('add.viaP2P.met')})` : state === 'missing' ? ` (${t('add.viaP2P.notMetShort')})` : ''}`}
						testID={`via-p2p-requirement-${key}-${state}`}
					>
						{palette.icon && <FontAwesome6 name={palette.icon} size={10} color={palette.ink} iconStyle="solid" />}
						<Text style={[textStyles.caption, { color: palette.ink }]}>{requirementLabel(t, key, value)}</Text>
					</View>
				)
			})}
		</View>
	)
}

/**
 * Bloque «Vía P2P» del depósito: el saldo en esta moneda no se deposita, se VENDE
 * tomando una oferta abierta. Enseña hasta cinco (las de la tesorería `@skymind`
 * si tiene; si no, la promocionada y las mejores del mercado), los requisitos
 * para tomarlas con ✓/✗ según el propio perfil, y el enlace al mercado filtrado.
 *
 * Sin acceso al P2P (KYC, teléfono, Telegram, cuenta habilitada) no se pide nada:
 * se dice qué falta y el tab P2P lo guía. Al volver del detalle de una oferta se
 * revalida, porque puede haberse tomado.
 */
const DepositViaP2PBlock = ({ coin, navigation }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const { user } = useAuth()
	const queryClient = useQueryClient()

	const gateMissing = useMemo(() => missingP2PRequirements(user), [user])
	const vip = !!user?.vip
	const showcase = useViaP2PShowcaseQuery(coin.tick, { enabled: gateMissing.length === 0, vip })
	const { data: averages } = useP2pMarketAveragesQuery()

	// Un 400 del servidor con razón de acceso = el perfil local está desfasado: mismo estado
	const serverGate = showcase.error ? requirementFromApiError(showcase.error.message, (showcase.error as ApiError).status) : null
	const gated = gateMissing.length > 0 || !!serverGate

	const source = showcase.data?.source ?? 'market'
	const offers = useMemo(() => showcase.data?.offers ?? [], [showcase.data?.offers])
	const requirements = useMemo(() => (source === 'treasury' ? showcaseRequirements(offers) : null), [source, offers])

	// El propio perfil público trae las MISMAS operaciones y rating que compara el backend;
	// solo se pide cuando hay requisitos que contrastar
	const profile = usePeerProfile(requirements && user?.uuid ? user.uuid : '')
	const check = useMemo(() => {
		if (!requirements || !profile.data) return null
		return evaluateRequirements(requirements, applicantStatsFrom(profile.data, user))
	}, [requirements, profile.data, user])

	// Al volver del detalle (o del mercado) la oferta puede haberse tomado: revalidar.
	// El primer foco es el montaje y la query ya está pidiendo
	const focusedOnce = useRef(false)
	useFocusEffect(useCallback(() => {
		if (!focusedOnce.current) { focusedOnce.current = true; return }
		queryClient.invalidateQueries({ queryKey: viaP2PShowcaseKey(coin.tick) })
	}, [coin.tick, queryClient]))

	const openMarket = () => navigation.navigate(ROUTES.MAIN_STACK, { screen: ROUTES.P2P_SCREEN, params: { ...marketParams(coin.tick, coin.name, source), key: Date.now() } })

	const name = coin.name || coin.tick
	const howToPay = t(howToPayKey(coin.tick))
	const loading = !gated && showcase.isPending

	return (
		<View style={[styles.block, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]} testID="deposit-via-p2p">
			<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{t('add.viaP2P.title', { name })}</Text>
			<Text style={[textStyles.caption, styles.body, { color: theme.colors.secondaryText }]}>
				{gated || loading || source === 'treasury'
					? t('add.viaP2P.bodyTreasury', { name, howToPay })
					: t('add.viaP2P.bodyMarket', { name, howToPay })}
			</Text>

			{gated ? (
				<Text style={[textStyles.caption, styles.body, { color: theme.colors.warning }]} testID="via-p2p-gate">{t('add.viaP2P.needsP2P')}</Text>
			) : loading ? (
				<View style={[styles.list, { borderColor: theme.colors.border }]}>
					<P2POfferItemSkeleton style={styles.item} />
					<P2POfferItemSkeleton style={styles.item} />
				</View>
			) : (
				<>
					{requirements && (
						<View style={styles.requirements}>
							<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{t('add.viaP2P.requirementsTitle')}</Text>
							<RequirementChips requirements={requirements} missing={check ? check.missing : null} theme={theme} />
							{check && !check.ok && (
								<Text style={[textStyles.caption, { color: theme.colors.dangerText }]} testID="via-p2p-not-met">
									{t('add.viaP2P.notMet', { list: check.missing.map(m => requirementLabel(t, m.key, m.required)).join(', ') })}
								</Text>
							)}
						</View>
					)}

					{offers.length ? (
						<View style={[styles.list, { borderColor: theme.colors.border }]}>
							{offers.map((offer, index) => (
								<Fragment key={offer.uuid}>
									{index > 0 && <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />}
									<P2POfferItem offer={offer} navigation={navigation} marketAverage={averages?.[offer.coin]} style={styles.item} promoted={offer.uuid === showcase.data?.promotedUuid} />
								</Fragment>
							))}
						</View>
					) : (
						<Text style={[textStyles.caption, styles.body, { color: theme.colors.secondaryText }]} testID="via-p2p-empty">{t('add.viaP2P.empty', { name })}</Text>
					)}
				</>
			)}

			<QPPressable onPress={openMarket} variant="opacity" hitSlop={8} style={styles.linkRow} testID="via-p2p-see-all">
				<Text style={[textStyles.caption, styles.link, { color: theme.colors.primary }]}>{gated ? t('add.viaP2P.needsP2PLink') : t('add.viaP2P.seeAll')}</Text>
				<FontAwesome6 name="arrow-right" size={11} color={theme.colors.primary} iconStyle="solid" />
			</QPPressable>
		</View>
	)
}

const styles = StyleSheet.create({
	block: { borderRadius: 16, borderCurve: 'continuous', padding: 16, marginBottom: 16, gap: 10 },
	body: { lineHeight: 18 },
	requirements: { gap: 8 },
	chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
	chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
	list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
	item: { borderRadius: 0, marginBottom: 0 },
	divider: { height: StyleSheet.hairlineWidth },
	linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 2 },
	link: { textDecorationLine: 'underline' },
})

export default DepositViaP2PBlock
