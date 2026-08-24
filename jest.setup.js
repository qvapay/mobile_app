/**
 * Inicializa el singleton REAL de i18next con el bundle en español antes de
 * cada suite (via setupFiles). Estrategia de tests del i18n: la extracción a
 * `i18n/locales/es/*.json` es verbatim, así que `t()` devuelve exactamente los
 * literales españoles que las aserciones existentes ya esperan — y
 * `useTranslation()` funciona sin provider (initReactI18next registra la
 * instancia global), dejando intactos los harnesses `create(<Componente/>)`.
 */
require('./i18n')
