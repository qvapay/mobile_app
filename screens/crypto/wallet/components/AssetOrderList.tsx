import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import type { SharedValue } from 'react-native-reanimated'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import ReactNativeHapticFeedback from 'react-native-haptic-feedback'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import type { Theme } from '../../../../theme/ThemeContext'

// Wallet
import { moveItem } from '../../../../wallet/assets'
import type { AssetView } from '../../../../wallet/assets'

// UI
import QPAssetIcon from '../../../../ui/particles/QPAssetIcon'

/** Alto FIJO de fila: las posiciones se calculan por índice, sin medir. */
export const ASSET_ORDER_ROW_HEIGHT = 58

const SPRING = { damping: 22, stiffness: 260, mass: 0.6 }
const HAPTIC_OPTIONS = { enableVibrateFallback: false, ignoreAndroidSystemSettings: false }

/** Índice de cada id en la lista mostrada; vive en el hilo de UI mientras se arrastra. */
type Positions = Record<string, number>

const toPositions = (ids: string[]): Positions => Object.fromEntries(ids.map((id, index) => [id, index]))

/** Mezcla OPACA de dos colores #rrggbb (la fila levantada no debe transparentar las de debajo). */
const mixHex = (base: string, tint: string, amount: number): string => {
	const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
	const mixed = [0, 1, 2].map(i => Math.round(channel(base, i) * (1 - amount) + channel(tint, i) * amount))
	return `#${mixed.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

const clamp = (value: number, min: number, max: number): number => {
	'worklet'
	return Math.min(Math.max(value, min), max)
}

/** Intercambia la posición del id arrastrado con la del que ocupa `to` (copia: los shared values no se mutan). */
const moveTo = (positions: Positions, id: string, to: number): Positions => {
	'worklet'
	const from = positions[id]
	const next: Positions = {}
	for (const key in positions) {
		const index = positions[key]
		if (key === id) next[key] = to
		else if (from < to && index > from && index <= to) next[key] = index - 1
		else if (from > to && index < from && index >= to) next[key] = index + 1
		else next[key] = index
	}
	return next
}

type Props = {
	/** Activos a ordenar, ya en el orden vigente. */
	assets: AssetView[]
	/** Orden nuevo (ids) al soltar o con las acciones de accesibilidad. */
	onReorder: (ids: string[]) => void
	/** Arrastrando: la pantalla bloquea su scroll para que no compita con el gesto. */
	onDraggingChange: (dragging: boolean) => void
}

/**
 * Lista reordenable de "Gestionar activos" (patrón Trust/SafePal): se arrastra
 * desde el asa ≡ de cada fila, con háptica al levantar y en cada hueco que se
 * cruza. Sin librería: filas de alto fijo posicionadas por índice en un shared
 * value, y un pan de Gesture Handler 3 por asa. El orden solo se guarda al
 * soltar; con lector de pantalla, cada fila ofrece "Subir" / "Bajar".
 */
const AssetOrderList = ({ assets, onReorder, onDraggingChange }: Props) => {

	const ids = useMemo(() => assets.map(asset => asset.id), [assets])
	const positions = useSharedValue<Positions>(toPositions(ids))
	const activeId = useSharedValue<string | null>(null)

	// Un orden nuevo desde fuera (guardado, restaurar, activo que aparece): se recoloca
	const idsKey = ids.join('|')
	useEffect(() => { positions.value = toPositions(ids) }, [idsKey]) // eslint-disable-line react-hooks/exhaustive-deps

	const commit = (next: Positions) => {
		const ordered = Object.keys(next).sort((a, b) => next[a] - next[b])
		if (ordered.join('|') !== idsKey) onReorder(ordered)
	}

	const moveByOne = (index: number, delta: number) => {
		const to = index + delta
		if (to < 0 || to >= ids.length) return
		onReorder(moveItem(ids, index, to))
	}

	return (
		<View style={{ height: ids.length * ASSET_ORDER_ROW_HEIGHT }}>
			{assets.map((asset, index) => (
				<OrderRow
					key={asset.id}
					asset={asset}
					index={index}
					count={ids.length}
					positions={positions}
					activeId={activeId}
					onCommit={commit}
					onDraggingChange={onDraggingChange}
					onMove={moveByOne}
				/>
			))}
		</View>
	)
}

type RowProps = {
	asset: AssetView
	index: number
	count: number
	positions: SharedValue<Positions>
	activeId: SharedValue<string | null>
	onCommit: (positions: Positions) => void
	onDraggingChange: (dragging: boolean) => void
	onMove: (index: number, delta: number) => void
}

const OrderRow = ({ asset, index, count, positions, activeId, onCommit, onDraggingChange, onMove }: RowProps) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const id = asset.id

	// Y de la fila arrastrada (sigue al dedo); el resto anima hacia su hueco
	const dragY = useSharedValue(index * ASSET_ORDER_ROW_HEIGHT)
	const startY = useSharedValue(0)

	const haptic = (type: 'impactMedium' | 'selection') => ReactNativeHapticFeedback.trigger(type, HAPTIC_OPTIONS)

	const pan = usePanGesture({
		minDistance: 0,
		onBegin: () => {
			'worklet'
			activeId.value = id
			startY.value = positions.value[id] * ASSET_ORDER_ROW_HEIGHT
			dragY.value = startY.value
			scheduleOnRN(onDraggingChange, true)
			scheduleOnRN(haptic, 'impactMedium')
		},
		onUpdate: event => {
			'worklet'
			const maxY = (count - 1) * ASSET_ORDER_ROW_HEIGHT
			dragY.value = clamp(startY.value + event.translationY, 0, maxY)
			const target = clamp(Math.round(dragY.value / ASSET_ORDER_ROW_HEIGHT), 0, count - 1)
			if (target !== positions.value[id]) {
				positions.value = moveTo(positions.value, id, target)
				scheduleOnRN(haptic, 'selection')
			}
		},
		onFinalize: () => {
			'worklet'
			if (activeId.value !== id) return
			dragY.value = withSpring(positions.value[id] * ASSET_ORDER_ROW_HEIGHT, SPRING)
			activeId.value = null
			scheduleOnRN(onDraggingChange, false)
			scheduleOnRN(onCommit, positions.value)
		},
	})

	// La fila levantada se distingue por escala y fondo elevado (igual en iOS y
	// Android; las sombras legacy solo se veían en una plataforma)
	const surface = theme.colors.surface
	const lifted = mixHex(theme.colors.surface, theme.colors.primary, 0.12)
	const animatedStyle = useAnimatedStyle(() => {
		const active = activeId.value === id
		const top = active ? dragY.value : withSpring(positions.value[id] * ASSET_ORDER_ROW_HEIGHT, SPRING)
		return {
			top,
			zIndex: active ? 10 : 0,
			backgroundColor: active ? lifted : surface,
			transform: [{ scale: withTiming(active ? 1.03 : 1, { duration: 120 }) }],
		}
	})

	return (
		<Animated.View
			style={[styles.row, animatedStyle]}
			accessible
			accessibilityLabel={`${asset.symbol} · ${asset.chainName}`}
			accessibilityActions={[{ name: 'moveUp', label: t('crypto.wallet.manage.moveUp') }, { name: 'moveDown', label: t('crypto.wallet.manage.moveDown') }]}
			onAccessibilityAction={event => onMove(index, event.nativeEvent.actionName === 'moveUp' ? -1 : 1)}
		>
			<QPAssetIcon logoTick={asset.logoTick} networkTick={asset.networkTick} size={34} />
			<RowText asset={asset} theme={theme} />
			<GestureDetector gesture={pan}>
				<View style={styles.handle} hitSlop={8} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
					<FontAwesome6 name="grip-lines" size={16} color={theme.colors.tertiaryText} iconStyle="solid" />
				</View>
			</GestureDetector>
		</Animated.View>
	)
}

const RowText = ({ asset, theme }: { asset: AssetView, theme: Theme }) => (
	<View style={styles.info}>
		<Text style={{ color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.md }}>{asset.symbol}</Text>
		<Text style={{ color: theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.xs }} numberOfLines={1}>{asset.chainName}</Text>
	</View>
)

const styles = StyleSheet.create({
	row: {
		position: 'absolute',
		left: 0,
		right: 0,
		height: ASSET_ORDER_ROW_HEIGHT,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingHorizontal: 12,
		borderRadius: 12,
		borderCurve: 'continuous',
	},
	info: { flex: 1, minWidth: 0 },
	handle: { width: 40, height: ASSET_ORDER_ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
})

export default AssetOrderList
