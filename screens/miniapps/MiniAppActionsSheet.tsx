import { useRef, useState } from 'react'
import { View, Text, Pressable, Modal, Platform, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles, useContainerStyles } from '../../theme/themeUtils'
import MiniAppIcon from './MiniAppIcon'
import MiniAppMenuRow from './MiniAppMenuRow'
import useMiniAppFavorites from './useMiniAppFavorites'
import { useCanPinShortcut, addToHomeScreen } from './homeScreenShortcut'
import { shareMiniApp } from './shareMiniApp'
import type { MiniApp } from '../../types/domain'

type MiniAppActionsSheetProps = {
	/** Mini-app de la que se abre el menú; null = cerrado. */
	app: MiniApp | null
	onClose: () => void
}

/**
 * Menú de una mini-app al mantenerla pulsada (fila del Home y catálogo):
 * favorita sí/no, acceso directo en la pantalla de inicio (solo Android) y
 * compartir. Tarjeta centrada, como el menú ⋯ del host.
 */
const MiniAppActionsSheet = ({ app, onClose }: MiniAppActionsSheetProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)
	const { isFavorite, toggle } = useMiniAppFavorites()
	const canPin = useCanPinShortcut()

	// La última mini-app abierta sigue pintada mientras la tarjeta se desvanece
	const [shown, setShown] = useState(app)
	if (app && app !== shown) setShown(app)

	// En iOS la hoja de compartir no puede presentarse mientras el <Modal> aún se
	// desmonta ("already presenting" y no sale nada): se difiere a su onDismiss
	const afterCloseRef = useRef<(() => void) | null>(null)
	const runAfterClose = (action: () => void) => {
		onClose()
		if (Platform.OS === 'ios') afterCloseRef.current = action
		else action()
	}
	const onDismiss = () => {
		const pending = afterCloseRef.current
		afterCloseRef.current = null
		pending?.()
	}

	const favorite = shown ? isFavorite(shown.slug) : false

	return (
		<Modal visible={!!app} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose} onDismiss={onDismiss}>
			<Pressable style={containerStyles.modalOverlay} onPress={onClose}>
				<View style={[containerStyles.modalCard, styles.card]} onStartShouldSetResponder={() => true} testID="miniapp-actions-sheet">
					{shown ? (
						<>
							<View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
								<MiniAppIcon app={shown} size={40} />
								<Text style={[textStyles.h4, styles.title, { color: theme.colors.primaryText }]} numberOfLines={1}>{shown.name}</Text>
							</View>
							<MiniAppMenuRow
								icon={favorite ? 'star' : 'star-outline'}
								iconColor={favorite ? theme.colors.warning : undefined}
								label={favorite ? t('miniapps.actions.unfavorite') : t('miniapps.actions.favorite')}
								onPress={() => { toggle(shown); onClose() }}
								testID="miniapp-action-favorite"
							/>
							{canPin ? (
								<MiniAppMenuRow
									icon="mobile-screen-button"
									label={t('miniapps.actions.addToHomeScreen')}
									onPress={() => { onClose(); addToHomeScreen(shown, t) }}
									testID="miniapp-action-pin"
								/>
							) : null}
							<MiniAppMenuRow
								icon="share-nodes"
								label={t('common.actions.share')}
								onPress={() => runAfterClose(() => { shareMiniApp(shown, t).catch(() => { /* cancelado o sin hoja */ }) })}
								testID="miniapp-action-share"
							/>
						</>
					) : null}
				</View>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	card: { paddingVertical: 8 },
	header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
	title: { marginLeft: 12, flexShrink: 1 },
})

export default MiniAppActionsSheet
