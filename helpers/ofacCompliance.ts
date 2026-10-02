/**
 * Atestaciones OFAC (CACR, 31 CFR Part 515): espejo PURO de qpweb
 * (`scripts/constants/ofac-cuba.js`, `scripts/compliance/attestation.js`,
 * `scripts/compliance/topup-recipient.js`). Cualquier cambio de ticks, códigos
 * de propósito o reglas tiene que tocar LOS DOS repos.
 *
 * Tres ámbitos:
 *   - cuba_value — retiro con destino Cuba / transferencia a un nacional cubano
 *   - funding    — depósito de un US person (o cualquier depósito por BANK)
 *   - crypto_out — retiro on-chain (W-1: billetera propia)
 *
 * El backend valida fail-closed (`buildAttestation`): las cuatro casillas a
 * `true` y un código válido para el ámbito, o no hay certificado. El copy vive
 * en i18n (`ui.ofac.*`); aquí solo claves y reglas. Sin react-native: se testea
 * con `@jest-environment node`.
 */
import type { Coin } from '../types/domain'
import { isCryptoCoin } from '../screens/withdraw/withdrawDestination'

export type OfacScope = 'cuba_value' | 'funding' | 'crypto_out'

/** Variante de copy del bloque (CONTEXT_COPY de la web). */
export type OfacContext = 'withdraw' | 'transfer' | 'topup' | 'deposit_bank' | 'crypto'

export type OfacPurposeCode = 'P-1' | 'P-2' | 'P-3' | 'P-4' | 'W-1'

export type OfacAttestationKey = 'notProhibitedOfficial' | 'notProhibitedPartyMember' | 'notRestrictedList' | 'lawfulPurpose'

/** Estado del formulario mientras el usuario lo rellena. */
export type OfacComplianceValue = {
	purposeCode: OfacPurposeCode
	attestations: Record<OfacAttestationKey, boolean>
	purposeNote: string
}

/** Lo que viaja como `compliance` en /withdraw, /transaction/transfer y /topup. */
export type OfacCompliancePayload = {
	purposeCode: OfacPurposeCode
	attestations: Record<OfacAttestationKey, true>
	purposeNote?: string
	language: string
}

// Grafías reales de `coins` (USDCASH, CUPCASH) y las viejas (USD_CASH, CUP_CASH):
// la web conserva ambas para sobrevivir a un renombrado.
export const OFAC_CUBA_TICKS: ReadonlySet<string> = new Set([
	'USD_CASH', 'USDCASH', 'CUP_CASH', 'CUPCASH', 'CLASICA', 'BANDECPREPAGO',
	'BANK_CUP', 'BANK_MLC', 'BOLSATM', 'BOLSA_TM', 'ETECSA',
])

/** Rails de telecomunicaciones: propósito por defecto P-4 (§ 515.542). */
const TELECOM_TICKS: ReadonlySet<string> = new Set(['ETECSA', 'BOLSATM', 'BOLSA_TM'])

/** Depósitos que atestan aunque el titular no sea US person (ACH/wire a la Company). */
export const FUNDING_ATTESTATION_TICKS: ReadonlySet<string> = new Set(['BANK'])

export const ATTESTATION_KEYS: readonly OfacAttestationKey[] = ['notProhibitedOfficial', 'notProhibitedPartyMember', 'notRestrictedList', 'lawfulPurpose']

export const PURPOSE_CODES: readonly { code: OfacPurposeCode, citation: string | null, scopes: readonly OfacScope[] }[] = [
	{ code: 'P-1', citation: '515.570', scopes: ['cuba_value', 'funding'] },
	{ code: 'P-2', citation: '515.570(g)', scopes: ['cuba_value', 'funding'] },
	{ code: 'P-3', citation: '515.570', scopes: ['cuba_value', 'funding'] },
	{ code: 'P-4', citation: '515.542', scopes: ['cuba_value', 'funding'] },
	{ code: 'W-1', citation: null, scopes: ['crypto_out'] },
]

export const PURPOSE_NOTE_MAX = 200

const normTick = (tick: string | null | undefined): string => String(tick || '').trim().toUpperCase()

export const isOfacCubaTick = (tick: string | null | undefined): boolean => OFAC_CUBA_TICKS.has(normTick(tick))

/** Códigos que el usuario puede elegir en un ámbito. */
export const purposesForScope = (scope: OfacScope): OfacPurposeCode[] =>
	PURPOSE_CODES.filter(p => p.scopes.includes(scope)).map(p => p.code)

export const citationFor = (code: OfacPurposeCode): string | null =>
	PURPOSE_CODES.find(p => p.code === code)?.citation ?? null

/** Propósito precargado: W-1 fijo en cripto, P-4 en telecom, P-1 en el resto. */
export const defaultPurposeFor = (tick: string | null | undefined, scope: OfacScope): OfacPurposeCode => {
	if (scope === 'crypto_out') return 'W-1'
	return TELECOM_TICKS.has(normTick(tick)) ? 'P-4' : 'P-1'
}

/** Estado inicial: TODAS las casillas sin marcar (nunca se asume la atestación). */
export const initialComplianceValue = (tick: string | null | undefined, scope: OfacScope): OfacComplianceValue => ({
	purposeCode: defaultPurposeFor(tick, scope),
	attestations: { notProhibitedOfficial: false, notProhibitedPartyMember: false, notRestrictedList: false, lawfulPurpose: false },
	purposeNote: '',
})

/**
 * Ámbito de un retiro: destino Cuba ⇒ cuba_value; salida on-chain ⇒ crypto_out
 * (W-1); el resto no atesta. Mismo orden que el wizard web (un tick cubano gana).
 */
export const withdrawAttestationScope = (coin: Coin | null | undefined): OfacScope | null => {
	if (!coin) return null
	if (isOfacCubaTick(coin.tick)) return 'cuba_value'
	return isCryptoCoin(coin) ? 'crypto_out' : null
}

/** Regla de fondeo del CCO: un US person atesta TODO depósito; BANK atesta siempre. */
export const fundingAttestationRequired = ({ usPerson = false, tick = '' }: { usPerson?: boolean, tick?: string | null }): boolean =>
	!!usPerson || FUNDING_ATTESTATION_TICKS.has(normTick(tick))

export const isComplianceComplete = (value: OfacComplianceValue | null | undefined, scope: OfacScope): boolean => {
	if (!value) return false
	if (!purposesForScope(scope).includes(value.purposeCode)) return false
	return ATTESTATION_KEYS.every(k => value.attestations?.[k] === true)
}

/** Payload para el backend, o null si el formulario no certifica nada válido (fail-closed). */
export const buildCompliancePayload = (value: OfacComplianceValue, scope: OfacScope, language: string): OfacCompliancePayload | null => {
	if (!isComplianceComplete(value, scope)) return null
	const note = String(value.purposeNote || '').trim().slice(0, PURPOSE_NOTE_MAX)
	return {
		purposeCode: value.purposeCode,
		attestations: { notProhibitedOfficial: true, notProhibitedPartyMember: true, notRestrictedList: true, lawfulPurpose: true },
		...(note && { purposeNote: note }),
		language: String(language || 'es').slice(0, 5),
	}
}

/** Códigos de error con los que el backend rechaza una operación sin atestación. */
export const ATTESTATION_ERROR_CODES: ReadonlySet<string> = new Set(['CACR_ATTESTATION_REQUIRED', 'W1_ATTESTATION_REQUIRED'])

export const isAttestationRequiredError = (code: unknown): boolean => typeof code === 'string' && ATTESTATION_ERROR_CODES.has(code)

// --- Destinatario de recargas a Cuba (US persons) ----------------------------

export const RECIPIENT_NAME_MAX = 120

export const normalizeRecipientName = (raw: unknown): string =>
	String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, RECIPIENT_NAME_MAX)

const NAME_TOKEN = /^[\p{L}\p{M}][\p{L}\p{M}'’.-]*$/u
const letterCount = (token: string): number => token.replace(/[^\p{L}\p{M}]/gu, '').length

/** Nombre y apellidos: al menos dos tokens de ≥2 letras, sin dígitos ni símbolos. */
export const isValidRecipientName = (raw: unknown): boolean => {
	const name = normalizeRecipientName(raw)
	if (!name) return false
	const tokens = name.split(' ')
	if (!tokens.every(t => NAME_TOKEN.test(t))) return false
	return tokens.filter(t => letterCount(t) >= 2).length >= 2
}
