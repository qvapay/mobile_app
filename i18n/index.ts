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
import type { InitOptions } from 'i18next'
import { initReactI18next } from 'react-i18next'
import resources from './resources'

export const SUPPORTED_LANGUAGES = ['es', 'en', 'pt'] as const

/** Código de idioma soportado por la app. */
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: SupportedLanguage = 'es'

/** Tag de locale de fechas por idioma soportado. */
export type DateLocale = 'es-ES' | 'en-US' | 'pt-BR'

// Tag de locale para fechas por idioma soportado
const DATE_LOCALES: Record<SupportedLanguage, DateLocale> = { es: 'es-ES', en: 'en-US', pt: 'pt-BR' }

/**
 * Idioma del dispositivo reducido a los soportados, vía Intl (respaldado por
 * el locale del sistema en Hermes iOS/Android — sin dependencia nativa).
 * En iOS el sistema negocia contra CFBundleLocalizations y en Android 13+
 * contra locales_config.xml (selectores por-app de Ajustes incluidos).
 *
 * @returns 'es' cuando el idioma del sistema no está soportado.
 */
export const getDeviceLanguage = (): SupportedLanguage => {
	try {
		const locale = Intl.DateTimeFormat().resolvedOptions().locale || ''
		const code = locale.toLowerCase().split(/[-_]/)[0]
		return (SUPPORTED_LANGUAGES as readonly string[]).includes(code) ? (code as SupportedLanguage) : DEFAULT_LANGUAGE
	} catch (error) {
		return DEFAULT_LANGUAGE
	}
}

/**
 * Resuelve la preferencia persistida al idioma efectivo.
 *
 * @param pref - `language.currentLanguage` de Settings ('auto'|'es'|'en'|'pt'|null|undefined).
 */
export const resolveLanguage = (pref: string | null | undefined): SupportedLanguage => {
	if (!pref || pref === 'auto') { return getDeviceLanguage() }
	return (SUPPORTED_LANGUAGES as readonly string[]).includes(pref) ? (pref as SupportedLanguage) : DEFAULT_LANGUAGE
}

/**
 * Tag de locale para fechas (`toLocaleDateString`/`toLocaleString`) acorde al
 * idioma ACTIVO de i18next. Sustituye a los 'es-ES' hardcodeados.
 */
export const getDateLocale = (): DateLocale => DATE_LOCALES[i18n.language as SupportedLanguage] || DATE_LOCALES[DEFAULT_LANGUAGE]

/** Tag de locale de la app; mismo juego de tags para fechas y para números. */
export type AppLocale = DateLocale

/**
 * Tag de locale para NÚMEROS (`Intl.NumberFormat`) acorde al idioma ACTIVO:
 * es lo que decide el separador de miles y el decimal — "1.234,56" en es/pt
 * frente a "1,234.56" en en. Comparte tabla con las fechas, pero se expone
 * aparte para que los consumidores digan qué formatean (y para poder
 * divergir sin tocar a los de fechas).
 *
 * NO es reactivo por sí solo: lee `i18n.language` en call time, así que el
 * componente que lo use debe suscribirse al cambio de idioma con
 * `useTranslation()` para repintarse.
 */
export const getNumberLocale = (): AppLocale => getDateLocale()

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
		// Cast local: i18next 26 tipa la opción como `initAsync` (v24 renombró
		// `initImmediate`), pero con recursos empaquetados el init es síncrono
		// igualmente — se mantiene la clave original sin cambio de runtime.
	} as InitOptions)

export default i18n
