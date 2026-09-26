import { useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../theme/ThemeContext'
import { useTextStyles } from '../theme/themeUtils'

// UI
import QPAssetIcon from './particles/QPAssetIcon'
import QPInput from './particles/QPInput'
import QPPressable from './particles/QPPressable'

/**
 * Una opción del selector. Es deliberadamente PLANA y sin dominio: lo mismo describe una
 * moneda del catálogo de QvaPay que un activo de la wallet que el propio saldo custodial.
 * Quien la construye es el adaptador de cada pantalla, que es quien sabe qué significan.
 */
export type QPAssetOption = {
	/** Identidad estable de la opción (tick, assetId, 'balance'…). */
	id: string
	/** Lo que la identifica de un vistazo: el símbolo o el nombre corto. */
	title: string
	/** Red, nombre largo o condiciones ("Comisión 1% · Mín 2"). */
	subtitle?: string
	/** Logo; `null` pinta el isotipo del saldo QvaPay en vez de una moneda. */
	logoTick: string | null
	/** Badge de red sobre el logo: lo que evita mandar USDT a la cadena equivocada. */
	networkTick?: string | null
	/** Cifra de la derecha: saldo, o lo que se recibiría. */
	value?: string
	/** Debajo de la cifra: precio unitario, equivalente en USD… */
	valueCaption?: string
	/** Presente = la fila se pinta apagada y dice POR QUÉ. */
	disabledReason?: string | null
	/** Texto extra que la búsqueda también mira (nombre largo, red, alias). */
	keywords?: string
}

type Props = {
	visible: boolean
	title?: string
	options: QPAssetOption[]
	selectedId?: string | null
	onSelect: (id: string) => void
	onClose: () => void
	/** Fila superior de accesos rápidos (recientes/destacadas). */
	quick?: QPAssetOption[]
	/** Oculta el buscador cuando la lista es corta de verdad. */
	searchable?: boolean
	loading?: boolean
	/** Nota al pie ("más monedas pronto"). */
	footnote?: string | null
}

/**
 * EL selector de activos de la app. Una sola pieza para el swap, el depósito, el retiro, el
 * P2P y los métodos de pago — antes eran tres implementaciones con tres estéticas.
 *
 * Decisiones que vienen de haberlas visto convivir:
 *
 * - **El buscador está SIEMPRE a la vista**, no detrás de una lupa. Con catálogos de decenas
 *   de monedas, esconder el buscador obliga a descubrirlo; y cuando la lista es corta,
 *   estorba tan poco que no compensa el interruptor.
 * - **El badge de red va SOBRE el logo**, no como etiqueta de texto al lado. USDT en TRON y
 *   USDT en BNB Chain comparten logo, y esa distinción es la que evita perder fondos.
 * - **Lo que no se puede elegir se pinta apagado con su motivo**, en vez de desaparecer: un
 *   activo que falta sin explicación se lee como un fallo de la app.
 * - **Hoja inferior, no pantalla completa**: elegir una moneda no merece tapar el contexto
 *   desde el que se abrió (el formulario, los filtros).
 */
/** Alto de una fila: 12+38+12 de la fila más sus 8 de separación. */
const ROW_HEIGHT = 70
const LIST_PADDING = 12
const EMPTY_HEIGHT = 140
/** Cuánto de la pantalla puede ocupar la hoja entera. */
const MAX_SHEET_RATIO = 0.92
/**
 * Lo que la hoja gasta por encima de la lista: grabber, cabecera, buscador y la fila de
 * accesos rápidos. Se descuenta para que la lista llegue hasta donde de verdad cabe, en vez
 * de toparla por una fracción suelta que puede pelearse con el alto de la hoja.
 */
const CHROME_HEIGHT = 186

const QPAssetSheet = ({ visible, title, options, selectedId = null, onSelect, onClose, quick, searchable = true, loading = false, footnote }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const insets = useSafeAreaInsets()
	const { height: windowHeight } = useWindowDimensions()
	const [search, setSearch] = useState('')

	// Cada apertura empieza limpia: heredar la búsqueda anterior enseña una lista filtrada
	// que el usuario no pidió y parece un catálogo incompleto
	useEffect(() => { if (!visible) { setSearch('') } }, [visible])

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase()
		if (!q) { return options }
		return options.filter(o =>
			o.title.toLowerCase().includes(q)
			|| o.id.toLowerCase().includes(q)
			|| (o.subtitle ?? '').toLowerCase().includes(q)
			|| (o.keywords ?? '').toLowerCase().includes(q))
	}, [options, search])

	/**
	 * Alto EXPLÍCITO de la lista. No es un detalle de estilo: FlashList está virtualizada y no
	 * sabe medirse por su contenido, así que dentro de una hoja de alto automático (`maxHeight`
	 * sin `height`) recibe cero y no pinta NI UNA fila — se ven el buscador y los accesos
	 * rápidos, que sí tienen alto propio, y la lista sale vacía.
	 *
	 * Se calcula a partir de cuántas filas hay, con tope para que la hoja no coma la pantalla:
	 * una lista corta no deja un hueco enorme y una larga se desplaza.
	 */
	const available = windowHeight * MAX_SHEET_RATIO - CHROME_HEIGHT - (insets.bottom || 12)
	const listHeight = filtered.length === 0
		? EMPTY_HEIGHT
		: Math.min(filtered.length * ROW_HEIGHT + LIST_PADDING, Math.max(available, EMPTY_HEIGHT))

	return (
		<Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
			<Pressable style={styles.overlay} onPress={onClose}>
				{/* El onPress vacío absorbe los toques: sin él, tocar el grabber o cualquier
				    hueco de la hoja caía al overlay y la cerraba */}
				<Pressable style={[styles.sheet, { backgroundColor: theme.colors.background, paddingBottom: insets.bottom || 12 }]} onPress={() => { }}>

					<View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />

					<View style={styles.header}>
						<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{title ?? t('ui.coinPicker.title')}</Text>
						<Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.actions.close')}>
							<FontAwesome6 name="xmark" size={20} color={theme.colors.primaryText} iconStyle="solid" />
						</Pressable>
					</View>

					{searchable && (
						<View style={styles.search}>
							<QPInput
								value={search}
								onChangeText={setSearch}
								placeholder={t('ui.coinPicker.searchPlaceholder')}
								prefixIconName="magnifying-glass"
								autoCorrect={false}
								autoCapitalize="none"
							/>
						</View>
					)}

					{!!quick?.length && !search && (
						<View style={styles.quick}>
							{quick.map(option => (
								<QPPressable
									key={option.id}
									onPress={() => { onSelect(option.id); onClose() }}
									style={[styles.pill, {
										backgroundColor: option.id === selectedId ? theme.colors.primary : theme.colors.surface,
										borderColor: option.id === selectedId ? theme.colors.primary : theme.colors.border,
									}]}
									accessibilityRole="button"
								>
									<QPAssetIcon logoTick={option.logoTick ?? ''} networkTick={option.networkTick} size={18} ringColor={option.id === selectedId ? theme.colors.primary : theme.colors.surface} />
									<Text style={{ color: option.id === selectedId ? theme.colors.almostWhite : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }}>
										{option.title}
									</Text>
								</QPPressable>
							))}
						</View>
					)}

					<View style={{ height: listHeight }}>
						<FlashList
							data={filtered}
							keyExtractor={option => option.id}
							renderItem={({ item }) => (
								<Row option={item} selected={item.id === selectedId} onPress={() => { onSelect(item.id); onClose() }} />
							)}
							contentContainerStyle={styles.list}
							keyboardShouldPersistTaps="handled"
							ListEmptyComponent={(
								<Text style={[textStyles.subtitle, styles.empty, { color: theme.colors.secondaryText }]}>
									{loading ? t('ui.coinPicker.loading') : t('ui.coinPicker.empty')}
								</Text>
							)}
							ListFooterComponent={footnote && !search ? (
								<Text style={[textStyles.h6, styles.footnote, { color: theme.colors.tertiaryText }]}>{footnote}</Text>
							) : null}
						/>
					</View>

				</Pressable>
			</Pressable>
		</Modal>
	)
}

const Row = ({ option, selected, onPress }: { option: QPAssetOption, selected: boolean, onPress: () => void }) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const disabled = !!option.disabledReason

	return (
		<QPPressable
			onPress={() => { if (!disabled) { onPress() } }}
			disabled={disabled}
			style={[styles.row, disabled && styles.disabled, { backgroundColor: selected ? theme.colors.primary + '14' : theme.colors.surface }]}
			accessibilityRole="button"
			accessibilityState={{ selected, disabled }}
			accessibilityLabel={option.title}
		>
			{option.logoTick === null
				? <BalanceIcon theme={theme} />
				: <QPAssetIcon logoTick={option.logoTick} networkTick={option.networkTick} size={38} ringColor={selected ? undefined : theme.colors.surface} />}

			<View style={styles.texts}>
				<Text style={[textStyles.h4, { color: theme.colors.primaryText }]} numberOfLines={1}>{option.title}</Text>
				{!!(option.disabledReason || option.subtitle) && (
					<Text style={[textStyles.h6, { color: disabled ? theme.colors.warning : theme.colors.secondaryText }]} numberOfLines={2}>
						{option.disabledReason || option.subtitle}
					</Text>
				)}
			</View>

			{!disabled && !!(option.value || option.valueCaption) && (
				<View style={styles.trailing}>
					{!!option.value && <Text style={[textStyles.h5, styles.right, { color: theme.colors.primaryText }]} numberOfLines={1}>{option.value}</Text>}
					{!!option.valueCaption && <Text style={[textStyles.h6, styles.right, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{option.valueCaption}</Text>}
				</View>
			)}

			{selected && <FontAwesome6 name="check" size={14} color={theme.colors.primary} iconStyle="solid" />}
		</QPPressable>
	)
}

/** El saldo QvaPay no es una moneda on-chain: lleva isotipo, sin logo ni badge de red. */
const BalanceIcon = ({ theme }: { theme: ReturnType<typeof useTheme>['theme'] }) => (
	<View style={[styles.balanceIcon, { backgroundColor: theme.colors.primary + '1F' }]}>
		<FontAwesome6 name="wallet" size={16} color={theme.colors.primary} iconStyle="solid" />
	</View>
)

const styles = StyleSheet.create({
	overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
	sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderCurve: 'continuous', maxHeight: '92%', overflow: 'hidden' },
	grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 4 },
	header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
	search: { paddingHorizontal: 20, paddingBottom: 8 },
	quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
	pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 5, paddingRight: 11, paddingVertical: 5, borderRadius: 16, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth },
	list: { paddingHorizontal: 16, paddingBottom: 12 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderCurve: 'continuous', marginBottom: 8 },
	disabled: { opacity: 0.45 },
	texts: { flex: 1, gap: 2 },
	trailing: { alignItems: 'flex-end', gap: 2, maxWidth: '40%' },
	right: { textAlign: 'right' },
	empty: { textAlign: 'center', paddingVertical: 40 },
	footnote: { textAlign: 'center', marginTop: 8 },
	balanceIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
})

export default QPAssetSheet
