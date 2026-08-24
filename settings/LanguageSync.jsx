import { useEffect } from 'react'
import { useSettings } from './SettingsContext'
import i18n, { resolveLanguage } from '../i18n'

/**
 * Puente Settings → i18next (render null; primer hijo de SettingsProvider en
 * App.tsx). Aplica la preferencia persistida (`language.currentLanguage`:
 * 'auto'|'es'|'en'|'pt') al singleton cuando los settings terminan de hidratar.
 * La reactividad no depende de su posición en el árbol: `changeLanguage`
 * emite `languageChanged` y cada `useTranslation()` suscrito se re-renderiza.
 */
const LanguageSync = () => {

	const { language, isLoading } = useSettings()
	const pref = language?.currentLanguage || 'auto'

	useEffect(() => {
		// No aplicar nada a mitad de hidratación (evitaría un es→en→es en frío)
		if (isLoading) { return }
		const resolved = resolveLanguage(pref)
		// changeLanguage al MISMO idioma también emite languageChanged; el guard
		// evita un re-render global inútil en cada arranque
		if (i18n.language !== resolved) { i18n.changeLanguage(resolved) }
	}, [pref, isLoading])

	return null
}

export default LanguageSync
