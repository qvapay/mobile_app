import { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles } from '../../../theme/themeUtils'

// UI
import QPInput from '../../../ui/particles/QPInput'

// API
import { shopApi } from '../../../api/shopApi'

const DEBOUNCE_MS = 300
const MIN_CHARS = 3

// Per-typing-session token: Google bills autocomplete + details grouped under
// the same token as one Places session, so reuse it until a place is chosen.
const newToken = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

/**
 * US address search with autocomplete for the shipping-address form. Proxies
 * Google Places through the backend (the key never ships in the app) with a
 * 300ms debounce and stale-response guard. Selecting a suggestion resolves
 * the structured fields and calls `onSelect({ line1, city, state,
 * postal_code, country })`; the user can still adjust the fields manually.
 * If the backend reports the service unavailable (503 — no key configured),
 * the search disables itself silently and the manual form remains.
 */
const AddressAutocomplete = ({ onSelect }) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)

	const [query, setQuery] = useState('')
	const [results, setResults] = useState([])
	const [unavailable, setUnavailable] = useState(false)

	const reqId = useRef(0)
	const skipNext = useRef(false)
	const sessionRef = useRef(null)

	const ensureSession = () => {
		if (!sessionRef.current) sessionRef.current = newToken()
		return sessionRef.current
	}

	useEffect(() => {
		if (unavailable) return
		// Don't re-search the formatted address we just selected.
		if (skipNext.current) { skipNext.current = false; return }
		const q = query.trim()
		const id = ++reqId.current

		const timer = setTimeout(async () => {
			if (q.length < MIN_CHARS) { setResults([]); return }
			const res = await shopApi.autocompleteAddress({ q, session: ensureSession() })
			if (id !== reqId.current) return // stale response
			if (res.success) {
				setResults(res.data?.suggestions || [])
			} else {
				setResults([])
				if (res.status === 503) setUnavailable(true)
			}
		}, DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [query, unavailable])

	const choose = async (suggestion) => {
		skipNext.current = true
		setQuery(suggestion.text)
		setResults([])
		const res = await shopApi.getPlaceDetails({ place_id: suggestion.place_id, session: ensureSession() })
		sessionRef.current = null // the details call closes the billing session
		if (res.success && res.data?.address) {
			onSelect?.(res.data.address)
			if (res.data.formatted) {
				skipNext.current = true
				setQuery(res.data.formatted)
			}
		}
		// On failure the user just fills the form manually — no toast needed.
	}

	if (unavailable) return null

	return (
		<View>
			<QPInput
				prelabel="Buscar dirección"
				prefixIconName="magnifying-glass"
				placeholder="Empieza a escribir tu dirección…"
				value={query}
				onChangeText={setQuery}
				autoCapitalize="words"
				autoCorrect={false}
			/>
			{results.length > 0 && (
				<View style={[styles.resultsCard, { backgroundColor: theme.colors.surface }, theme.mode === 'light' && { borderWidth: 1, borderColor: theme.colors.elevationLight }]}>
					{results.map((suggestion, index) => (
						<Pressable
							key={suggestion.place_id}
							style={[styles.resultRow, index > 0 && { borderTopWidth: 1, borderTopColor: `${theme.colors.secondaryText}22` }]}
							onPress={() => choose(suggestion)}
						>
							<FontAwesome6 name="location-dot" size={13} color={theme.colors.secondaryText} iconStyle="solid" />
							<Text style={[textStyles.caption, { color: theme.colors.primaryText, flex: 1 }]} numberOfLines={2}>
								{suggestion.text}
							</Text>
						</Pressable>
					))}
				</View>
			)}
			<Text style={[styles.hint, { color: theme.colors.tertiaryText }]}>
				Busca y autocompleta; luego puedes ajustar los campos.
			</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	resultsCard: {
		borderRadius: 12,
		marginTop: 6,
		overflow: 'hidden',
	},
	resultRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingHorizontal: 12,
		paddingVertical: 11,
	},
	hint: {
		fontSize: 11,
		marginTop: 6,
	},
})

export default AddressAutocomplete
