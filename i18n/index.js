/**
 * Singleton de i18next de toda la app (es/en). Se inicializa de forma SÍNCRONA
 * como side-effect de importar este módulo (`initImmediate: false` + recursos
 * empaquetados), así que `i18n.t()` es usable desde la primera línea que lo
 * importe — incluidos el ErrorBoundary (clase en el tope del árbol) y los
 * setupFiles de jest.
 *
 * El idioma inicial es SIEMPRE 'es' (determinista: los tests de node quedan en
 * español); la preferencia del usuario ('auto'|'es'|'en', persistida por
 * SettingsContext en `language.currentLanguage`) la aplica `LanguageSync` en
 * runtime vía `resolveLanguage()`.
 *
 * REGLA DURA: este módulo no puede importar react-native, AsyncStorage ni
 * ningún módulo nativo — corre dentro de cada test de jest en entorno node.
 */
import 'intl-pluralrules' // Hermes no trae Intl.PluralRules; el entry es no-op donde ya existe
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import resources from './resources'

export const SUPPORTED_LANGUAGES = ['es', 'en']
export const DEFAULT_LANGUAGE = 'es'

/**
 * Idioma del dispositivo reducido a los soportados, vía Intl (respaldado por
 * el locale del sistema en Hermes iOS/Android — sin dependencia nativa).
 * @returns {'es'|'en'} 'es' cuando el idioma del sistema no está soportado.
 */
export const getDeviceLanguage = () => {
	try {
		const locale = Intl.DateTimeFormat().resolvedOptions().locale || ''
		const code = locale.toLowerCase().split(/[-_]/)[0]
		return SUPPORTED_LANGUAGES.includes(code) ? code : DEFAULT_LANGUAGE
	} catch (error) {
		return DEFAULT_LANGUAGE
	}
}

/**
 * Resuelve la preferencia persistida al idioma efectivo.
 * @param {'auto'|'es'|'en'|null|undefined} pref - `language.currentLanguage` de Settings.
 * @returns {'es'|'en'}
 */
export const resolveLanguage = (pref) => {
	if (!pref || pref === 'auto') { return getDeviceLanguage() }
	return SUPPORTED_LANGUAGES.includes(pref) ? pref : DEFAULT_LANGUAGE
}

/**
 * Tag de locale para fechas (`toLocaleDateString`/`toLocaleString`) acorde al
 * idioma ACTIVO de i18next. Sustituye a los 'es-ES' hardcodeados.
 * @returns {'es-ES'|'en-US'}
 */
export const getDateLocale = () => (i18n.language === 'en' ? 'en-US' : 'es-ES')

i18n
	.use(initReactI18next)
	.init({
		resources,
		lng: DEFAULT_LANGUAGE,
		fallbackLng: DEFAULT_LANGUAGE,
		// Init síncrono: t() disponible en la línea siguiente, sin promesas ni timers
		initImmediate: false,
		// RN renderiza Text, no HTML — sin superficie XSS que escapar
		interpolation: { escapeValue: false },
		// Namespace único ('translation'); los ':' nunca separan namespaces en las claves
		nsSeparator: false,
		react: { useSuspense: false },
	})

export default i18n
