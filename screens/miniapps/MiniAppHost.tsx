import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable, Modal, BackHandler, Linking, ActivityIndicator, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import WebView from 'react-native-webview'
import type { WebViewNavigation, ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import QPButton from '../../ui/particles/QPButton'
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles, useContainerStyles } from '../../theme/themeUtils'
import i18n from '../../i18n'

import { miniappsApi } from '../../api/miniappsApi'
import { headerBadgeText, isAllowedOrigin, isBenignInternalUrl } from '../../miniapps/protocol'
import { buildSdkScript } from '../../miniapps/sdkScript'
import { useMiniAppDetail, forgetGrant } from './miniappsQueries'
import { useMiniAppBridge, type MiniAppThemePayload } from './useMiniAppBridge'
import { shareMiniApp } from './shareMiniApp'
import { useCanPinShortcut, addToHomeScreen } from './homeScreenShortcut'
import useMiniAppFavorites from './useMiniAppFavorites'
import MiniAppIcon from './MiniAppIcon'
import { HEADER_ICON_GLYPHS } from './headerIcons'
import MiniAppMenuRow from './MiniAppMenuRow'
import MiniAppConsentSheet from './MiniAppConsentSheet'
import MiniAppPaySheet from './MiniAppPaySheet'
import KycGateModal from '../../ui/KycGateModal'
import useKycGate from '../../hooks/useKycGate'
import type { RootStackParamList } from '../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'MiniAppHost'>

/**
 * Contenedor de una mini-app: WebView aislado + SDK `window.QvaPay` + hojas
 * nativas de identidad y pago.
 *
 * Aislamiento:
 * - Navegación encerrada en `allowed_origins` (https): cualquier otro destino
 *   se abre FUERA, en el navegador del sistema.
 * - Sin cookies compartidas con la app, sin acceso a ficheros, sin ventanas
 *   nuevas; el token de sesión de QvaPay nunca entra al WebView.
 * - La ficha se relee fresca al abrir (orígenes y estado vigentes): una
 *   mini-app suspendida deja de abrir en el acto.
 */
const MiniAppHost = ({ route, navigation }: Props) => {

	const { slug, name: previewName, icon: previewIcon } = route.params
	const { t } = useTranslation()
	const { theme, isDark } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const insets = useSafeAreaInsets()
	const queryClient = useQueryClient()

	const { data: app, isError, refetch, isFetching } = useMiniAppDetail(slug)
	// Espejo para callbacks estables (el share del SDK no debe re-crear el bridge por cada refetch)
	const appRef = useRef(app)
	useEffect(() => { appRef.current = app }, [app])

	// `WebView<object>`: con el genérico por defecto (`undefined`) los tipos del paquete
	// intersecan las props con `undefined` y el `ref` deja de tipar
	const webViewRef = useRef<WebView<object>>(null)
	// Historial del WebView (también el de una SPA: pushState/popstate): decide si el
	// botón izquierdo cierra o retrocede
	const [canGoBack, setCanGoBack] = useState(false)
	const [ready, setReady] = useState(false)
	const [loadError, setLoadError] = useState(false)
	const [progress, setProgress] = useState(0)
	const [menuOpen, setMenuOpen] = useState(false)
	const { isFavorite, toggle: toggleFavorite } = useMiniAppFavorites()
	const canPin = useCanPinShortcut()
	// Recargar = remontar el WebView (la URL de arranque, no la actual)
	const [webViewKey, setWebViewKey] = useState(0)

	const themePayload: MiniAppThemePayload = useMemo(() => ({
		mode: isDark ? 'dark' : 'light',
		colors: { bg: theme.colors.background, surface: theme.colors.surface, text: theme.colors.primaryText, primary: theme.colors.primary },
	}), [isDark, theme])

	const close = useCallback(() => navigation.goBack(), [navigation])
	const onReady = useCallback(() => setReady(true), [])

	// Iniciar sesión y pagar exigen KYC: mismo gate y modal que Enviar/Ahorros
	const { requireKyc, gateVisible, gateMessage, closeGate } = useKycGate()
	const requireMiniAppKyc = useCallback(() => requireKyc({ message: t('miniapps.kycGate.message') }), [requireKyc, t])

	// `QvaPay.share()` del SDK: la hoja con el enlace de ESTA mini-app (la app pone la URL)
	const shareFromSdk = useCallback(async (text?: string) => {
		const current = appRef.current
		if (!current) throw new Error('Mini-app not loaded')
		return shareMiniApp(current, t, text)
	}, [t])

	const { onMessage, emit, modal, resolveModal, rejectModal, mainButton, backButtonVisible, header, resetUi } = useMiniAppBridge({
		app, webViewRef, theme: themePayload, onReady, onClose: close, requireKyc: requireMiniAppKyc, share: shareFromSdk,
	})

	// El SDK se construye UNA vez por carga: cambiar el script en caliente no
	// re-inyecta nada y solo provocaría re-renders del WebView
	const sdkScript = useMemo(
		() => buildSdkScript(themePayload, { slug, language: i18n.language }),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[slug, webViewKey],
	)

	/**
	 * Botón izquierdo de la barra (y atrás de Android), por prioridad: la mini-app
	 * si lo pidió (`backButton`), luego el historial del WebView (flecha automática:
	 * la mini-app no tiene que hacer nada), y si no queda nada atrás, cerrar.
	 */
	const backMode: 'app' | 'history' | 'close' = backButtonVisible ? 'app' : canGoBack ? 'history' : 'close'
	const handleBack = useCallback(() => {
		if (modal) return true
		if (backMode === 'app') emit('backButton')
		else if (backMode === 'history') webViewRef.current?.goBack()
		else close()
		return true
	}, [modal, backMode, emit, close])

	useEffect(() => {
		const sub = BackHandler.addEventListener('hardwareBackPress', handleBack)
		return () => sub.remove()
	}, [handleBack])

	const onShouldStartLoadWithRequest = useCallback((request: ShouldStartLoadRequest) => {
		if (!app) return false
		if (isBenignInternalUrl(request.url)) return true
		if (isAllowedOrigin(request.url, app.allowed_origins)) return true
		// Fuera del perímetro: solo enlaces web, al navegador del sistema y solo si
		// los pidió el usuario (o un marco principal); el resto se descarta en silencio
		if (request.isTopFrame !== false && /^https?:\/\//i.test(request.url)) {
			Linking.openURL(request.url).catch(() => {})
		}
		return false
	}, [app])

	const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
		setCanGoBack(nav.canGoBack)
	}, [])

	const reload = () => {
		setMenuOpen(false)
		setReady(false)
		setLoadError(false)
		setCanGoBack(false)
		resetUi()
		setWebViewKey(k => k + 1)
	}

	const openInBrowser = () => {
		setMenuOpen(false)
		if (app) Linking.openURL(app.entry_url).catch(() => {})
	}

	const favoriteFromMenu = () => {
		setMenuOpen(false)
		if (app) toggleFavorite(app)
	}

	const pinFromMenu = () => {
		setMenuOpen(false)
		if (app) addToHomeScreen(app, t)
	}

	// Compartir desde el menú: en iOS la hoja de compartir no puede presentarse
	// mientras el <Modal> del menú aún se desmonta ("already presenting" y no
	// sale nada), así que se difiere a su onDismiss; Android no lo necesita
	const afterMenuRef = useRef<(() => void) | null>(null)
	const shareFromMenu = () => {
		setMenuOpen(false)
		const run = () => { if (app) shareMiniApp(app, t).catch(() => { /* cancelado o sin hoja */ }) }
		if (Platform.OS === 'ios') afterMenuRef.current = run
		else run()
	}
	// «Cerrar mini-app» del menú: la salida directa cuando la flecha retrocede.
	// Mismo diferido que compartir: en iOS no se cierra la pantalla con el menú presentándose
	const closeFromMenu = () => {
		setMenuOpen(false)
		if (Platform.OS === 'ios') afterMenuRef.current = close
		else close()
	}
	const onMenuDismiss = () => {
		const pending = afterMenuRef.current
		afterMenuRef.current = null
		pending?.()
	}

	const revoke = async () => {
		setMenuOpen(false)
		if (!app) return
		const result = await miniappsApi.revokeGrant(app.slug)
		if (result.success) {
			forgetGrant(queryClient, app.slug)
			toast.success(t('miniapps.host.revoked', { name: app.name }))
		} else {
			toast.error(t('transactions.common.errorTitle'), { description: result.error })
		}
	}

	const title = app?.name ?? previewName ?? ''

	return (
		<View style={[styles.flex, { backgroundColor: theme.colors.background }]}>

			{/* Barra superior propia: QvaPay manda aquí, la mini-app no puede taparla. La
			    mini-app solo aporta subtítulo y acciones; nombre y logo son los registrados */}
			<View style={[styles.topBar, { paddingTop: insets.top + 6, borderBottomColor: theme.colors.border }]}>
				{/* Lados asimétricos a propósito: con acciones, el nombre usa el espacio que queda
				    en vez de reservar a la izquierda un hueco igual al de la derecha */}
				<View style={styles.side}>
					<Pressable
						onPress={handleBack}
						onLongPress={backMode === 'close' ? undefined : close}
						hitSlop={10}
						style={styles.topButton}
						accessibilityRole="button"
						accessibilityLabel={backMode === 'close' ? t('common.actions.close') : t('common.actions.back')}
						accessibilityHint={backMode === 'close' ? undefined : t('miniapps.host.backHint')}
					>
						<FontAwesome6 name={backMode === 'close' ? 'xmark' : 'chevron-left'} size={18} color={theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
				</View>
				<View style={styles.titleWrap}>
					<MiniAppIcon app={{ name: title, icon: app?.icon ?? previewIcon ?? null }} size={22} />
					<View style={styles.titleText}>
						<View style={styles.titleRow}>
							<Text style={[textStyles.h5, { color: theme.colors.primaryText, flexShrink: 1 }]} numberOfLines={1}>{title}</Text>
							<FontAwesome6 name="circle-check" size={12} color={theme.colors.primary} iconStyle="solid" style={styles.verified} />
						</View>
						{ready && header.subtitle ? (
							<Text style={[textStyles.h7, { color: theme.colors.secondaryText }]} numberOfLines={1}>{header.subtitle}</Text>
						) : null}
					</View>
				</View>
				<View style={[styles.side, styles.sideRight]}>
					{ready ? header.actions.map(action => {
						const badge = headerBadgeText(action.badge)
						return (
							<Pressable key={action.id} onPress={() => emit('headerAction', { id: action.id })} hitSlop={6} style={styles.topButton} accessibilityRole="button" accessibilityLabel={badge ? `${action.label} (${badge})` : action.label}>
								<FontAwesome6 name={HEADER_ICON_GLYPHS[action.icon]} size={18} color={theme.colors.primaryText} iconStyle="solid" />
								{badge ? (
									<View style={[styles.badge, { backgroundColor: theme.colors.primary, borderColor: theme.colors.background }]}>
										<Text style={styles.badgeText}>{badge}</Text>
									</View>
								) : null}
							</Pressable>
						)
					}) : null}
					<Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.topButton} disabled={!app} accessibilityRole="button" accessibilityLabel={t('miniapps.host.menu')}>
						<FontAwesome6 name="ellipsis" size={18} color={theme.colors.primaryText} iconStyle="solid" />
					</Pressable>
				</View>
			</View>
			{!ready && !loadError && progress > 0 && progress < 1 ? (
				<View style={[styles.progress, { width: `${Math.round(progress * 100)}%`, backgroundColor: theme.colors.primary }]} />
			) : null}

			<View style={styles.flex}>
				{app && !loadError ? (
					<WebView
						key={webViewKey}
						ref={webViewRef}
						source={{ uri: app.entry_url }}
						style={[styles.flex, { backgroundColor: theme.colors.background }]}
						injectedJavaScriptBeforeContentLoaded={sdkScript}
						injectedJavaScriptBeforeContentLoadedForMainFrameOnly
						onMessage={onMessage}
						onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
						onNavigationStateChange={onNavigationStateChange}
						onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
						onLoadEnd={() => setReady(true)}
						onError={() => setLoadError(true)}
						onHttpError={({ nativeEvent }) => { if (nativeEvent.statusCode >= 500) setLoadError(true) }}
						originWhitelist={['https://*']}
						// Aislamiento respecto a la app y al resto de la web
						sharedCookiesEnabled={false}
						thirdPartyCookiesEnabled={false}
						allowFileAccess={false}
						allowFileAccessFromFileURLs={false}
						allowUniversalAccessFromFileURLs={false}
						mixedContentMode="never"
						setSupportMultipleWindows={false}
						javaScriptCanOpenWindowsAutomatically={false}
						allowsLinkPreview={false}
						webviewDebuggingEnabled={__DEV__}
						// Vídeo/audio en línea para mini-apps de contenido; sin autoplay con sonido
						allowsInlineMediaPlayback
						mediaPlaybackRequiresUserAction
						pullToRefreshEnabled={false}
						bounces={false}
					/>
				) : null}

				{(!app && !isError) || (app && !ready && !loadError) ? (
					<View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.colors.background }]} pointerEvents="none">
						<MiniAppIcon app={{ name: title, icon: app?.icon ?? previewIcon ?? null }} size={72} />
						<ActivityIndicator color={theme.colors.primary} style={{ marginTop: 20 }} />
					</View>
				) : null}

				{isError || loadError ? (
					<View style={[StyleSheet.absoluteFill, styles.center, styles.padded, { backgroundColor: theme.colors.background }]}>
						<FontAwesome6 name="plug-circle-exclamation" size={36} color={theme.colors.secondaryText} iconStyle="solid" />
						<Text style={[textStyles.h4, styles.textCenter, { marginTop: 14 }]}>{isError ? t('miniapps.host.unavailableTitle') : t('miniapps.host.loadErrorTitle')}</Text>
						<Text style={[textStyles.h6, styles.textCenter, { color: theme.colors.secondaryText, marginTop: 6 }]}>{isError ? t('miniapps.host.unavailableBody') : t('miniapps.host.loadErrorBody')}</Text>
						<QPButton title={t('miniapps.host.retry')} loading={isFetching} onPress={() => { if (isError) refetch(); else reload() }} style={{ marginTop: 20, alignSelf: 'stretch' }} textStyle={{ color: theme.colors.buttonText }} />
					</View>
				) : null}
			</View>

			{/* Botón principal nativo: lo controla la mini-app, lo pinta QvaPay */}
			{mainButton.visible && ready && !loadError ? (
				<View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: theme.colors.border }]}>
					<QPButton
						title={mainButton.text}
						onPress={() => emit('mainButton')}
						loading={mainButton.loading}
						disabled={!mainButton.enabled || mainButton.loading}
						textStyle={{ color: theme.colors.buttonText }}
					/>
				</View>
			) : null}

			{app && modal?.kind === 'consent' ? (
				<MiniAppConsentSheet app={app} scopes={modal.scopes} onAllow={resolveModal} onDeny={rejectModal} />
			) : null}
			{app && modal?.kind === 'pay' ? (
				<MiniAppPaySheet key={modal.id} app={app} invoiceUuid={modal.invoiceUuid} onPaid={resolveModal} onCancel={rejectModal} />
			) : null}

			{/* useKycGate expone `string | null` y el modal declara `string | undefined` (mismo cast que SendConfirm) */}
			<KycGateModal visible={gateVisible} message={gateMessage as string | undefined} onClose={closeGate} />

			<Modal visible={menuOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuOpen(false)} onDismiss={onMenuDismiss}>
				<Pressable style={containerStyles.modalOverlay} onPress={() => setMenuOpen(false)}>
					<View style={[containerStyles.modalCard, { paddingVertical: 8 }]} onStartShouldSetResponder={() => true}>
						{app && isFavorite(app.slug)
							? <MiniAppMenuRow icon="star" iconColor={theme.colors.warning} label={t('miniapps.actions.unfavorite')} onPress={favoriteFromMenu} />
							: <MiniAppMenuRow icon="star-outline" label={t('miniapps.actions.favorite')} onPress={favoriteFromMenu} />}
						{canPin ? <MiniAppMenuRow icon="mobile-screen-button" label={t('miniapps.actions.addToHomeScreen')} onPress={pinFromMenu} /> : null}
						<MiniAppMenuRow icon="share-nodes" label={t('common.actions.share')} onPress={shareFromMenu} />
						<MiniAppMenuRow icon="rotate-right" label={t('miniapps.host.reload')} onPress={reload} />
						<MiniAppMenuRow icon="arrow-up-right-from-square" label={t('miniapps.host.openInBrowser')} onPress={openInBrowser} />
						<MiniAppMenuRow icon="xmark" label={t('miniapps.host.closeApp')} onPress={closeFromMenu} />
						{app?.granted ? <MiniAppMenuRow icon="user-slash" label={t('miniapps.host.revoke')} onPress={revoke} danger /> : null}
					</View>
				</Pressable>
			</Modal>
		</View>
	)
}

/** Lado de cada botón de la barra (cerrar/atrás, acciones de la mini-app, menú). */
const TOP_BUTTON = 36

const styles = StyleSheet.create({
	flex: { flex: 1 },
	center: { alignItems: 'center', justifyContent: 'center' },
	padded: { paddingHorizontal: 32 },
	textCenter: { textAlign: 'center' },
	topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
	topButton: { width: TOP_BUTTON, height: TOP_BUTTON, alignItems: 'center', justifyContent: 'center' },
	side: { flexDirection: 'row', alignItems: 'center' },
	sideRight: { justifyContent: 'flex-end' },
	// A la izquierda, pegado al botón de cerrar/atrás (como una cabecera de chat), no centrado
	titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 4, paddingRight: 8 },
	titleText: { flexShrink: 1, marginLeft: 8 },
	titleRow: { flexDirection: 'row', alignItems: 'center' },
	verified: { marginLeft: 6 },
	// Badge de contador sobre un icono, como el del carrito (CartHeaderButton): tamaño fijo a
	// propósito (excepción de la escala de fuente)
	badge: { position: 'absolute', top: 2, right: 0, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
	badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
	progress: { height: 2 },
	footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
})

export default MiniAppHost
