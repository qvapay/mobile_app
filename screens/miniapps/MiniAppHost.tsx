import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable, Modal, BackHandler, Linking, ActivityIndicator } from 'react-native'
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
import { isAllowedOrigin, isBenignInternalUrl } from '../../miniapps/protocol'
import { buildSdkScript } from '../../miniapps/sdkScript'
import { useMiniAppDetail, MINIAPPS_ROOT } from './miniappsQueries'
import { useMiniAppBridge, type MiniAppThemePayload } from './useMiniAppBridge'
import MiniAppIcon from './MiniAppIcon'
import MiniAppConsentSheet from './MiniAppConsentSheet'
import MiniAppPaySheet from './MiniAppPaySheet'
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

	// `WebView<object>`: con el genérico por defecto (`undefined`) los tipos del paquete
	// intersecan las props con `undefined` y el `ref` deja de tipar
	const webViewRef = useRef<WebView<object>>(null)
	const canGoBackRef = useRef(false)
	const [ready, setReady] = useState(false)
	const [loadError, setLoadError] = useState(false)
	const [progress, setProgress] = useState(0)
	const [menuOpen, setMenuOpen] = useState(false)
	// Recargar = remontar el WebView (la URL de arranque, no la actual)
	const [webViewKey, setWebViewKey] = useState(0)

	const themePayload: MiniAppThemePayload = useMemo(() => ({
		mode: isDark ? 'dark' : 'light',
		colors: { bg: theme.colors.background, surface: theme.colors.surface, text: theme.colors.primaryText, primary: theme.colors.primary },
	}), [isDark, theme])

	const close = useCallback(() => navigation.goBack(), [navigation])
	const onReady = useCallback(() => setReady(true), [])

	const { onMessage, emit, modal, resolveModal, rejectModal, mainButton, backButtonVisible, resetUi } = useMiniAppBridge({
		app, webViewRef, theme: themePayload, onReady, onClose: close,
	})

	// El SDK se construye UNA vez por carga: cambiar el script en caliente no
	// re-inyecta nada y solo provocaría re-renders del WebView
	const sdkScript = useMemo(
		() => buildSdkScript(themePayload, { slug, language: i18n.language }),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[slug, webViewKey],
	)

	/** Atrás: primero la mini-app (si lo pidió), luego su historial, y por último cerrar. */
	const handleBack = useCallback(() => {
		if (modal) return true
		if (backButtonVisible) { emit('backButton'); return true }
		if (canGoBackRef.current) { webViewRef.current?.goBack(); return true }
		close()
		return true
	}, [modal, backButtonVisible, emit, close])

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
		canGoBackRef.current = nav.canGoBack
	}, [])

	const reload = () => {
		setMenuOpen(false)
		setReady(false)
		setLoadError(false)
		resetUi()
		setWebViewKey(k => k + 1)
	}

	const openInBrowser = () => {
		setMenuOpen(false)
		if (app) Linking.openURL(app.entry_url).catch(() => {})
	}

	const revoke = async () => {
		setMenuOpen(false)
		if (!app) return
		const result = await miniappsApi.revokeGrant(app.slug)
		if (result.success) {
			queryClient.invalidateQueries({ queryKey: MINIAPPS_ROOT })
			toast.success(t('miniapps.host.revoked', { name: app.name }))
		} else {
			toast.error(t('transactions.common.errorTitle'), { description: result.error })
		}
	}

	const title = app?.name ?? previewName ?? ''
	const showBackChevron = backButtonVisible

	return (
		<View style={[styles.flex, { backgroundColor: theme.colors.background }]}>

			{/* Barra superior propia: QvaPay manda aquí, la mini-app no puede taparla */}
			<View style={[styles.topBar, { paddingTop: insets.top + 6, borderBottomColor: theme.colors.border }]}>
				<Pressable onPress={showBackChevron ? handleBack : close} hitSlop={10} style={styles.topButton} accessibilityRole="button" accessibilityLabel={showBackChevron ? t('common.actions.back') : t('common.actions.close')}>
					<FontAwesome6 name={showBackChevron ? 'chevron-left' : 'xmark'} size={18} color={theme.colors.primaryText} iconStyle="solid" />
				</Pressable>
				<View style={styles.titleWrap}>
					<MiniAppIcon app={{ name: title, icon: app?.icon ?? previewIcon ?? null }} size={22} />
					<Text style={[textStyles.h5, { color: theme.colors.primaryText, marginLeft: 8, flexShrink: 1 }]} numberOfLines={1}>{title}</Text>
					<FontAwesome6 name="circle-check" size={12} color={theme.colors.primary} iconStyle="solid" style={{ marginLeft: 6 }} />
				</View>
				<Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.topButton} disabled={!app} accessibilityRole="button" accessibilityLabel={t('miniapps.host.menu')}>
					<FontAwesome6 name="ellipsis" size={18} color={theme.colors.primaryText} iconStyle="solid" />
				</Pressable>
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
						decelerationRate="normal"
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

			<Modal visible={menuOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuOpen(false)}>
				<Pressable style={containerStyles.modalOverlay} onPress={() => setMenuOpen(false)}>
					<View style={[containerStyles.modalCard, { paddingVertical: 8 }]} onStartShouldSetResponder={() => true}>
						<MenuRow icon="rotate-right" label={t('miniapps.host.reload')} onPress={reload} />
						<MenuRow icon="arrow-up-right-from-square" label={t('miniapps.host.openInBrowser')} onPress={openInBrowser} />
						{app?.granted ? <MenuRow icon="user-slash" label={t('miniapps.host.revoke')} onPress={revoke} danger /> : null}
					</View>
				</Pressable>
			</Modal>
		</View>
	)
}

const MenuRow = ({ icon, label, onPress, danger = false }: { icon: 'rotate-right' | 'arrow-up-right-from-square' | 'user-slash', label: string, onPress: () => void, danger?: boolean }) => {
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const color = danger ? theme.colors.danger : theme.colors.primaryText
	return (
		<Pressable onPress={onPress} style={styles.menuRow} accessibilityRole="button">
			<FontAwesome6 name={icon} size={16} color={color} iconStyle="solid" style={{ width: 28 }} />
			<Text style={[textStyles.h5, { color }]}>{label}</Text>
		</Pressable>
	)
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	center: { alignItems: 'center', justifyContent: 'center' },
	padded: { paddingHorizontal: 32 },
	textCenter: { textAlign: 'center' },
	topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
	topButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
	titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
	progress: { height: 2 },
	footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
	menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
})

export default MiniAppHost
