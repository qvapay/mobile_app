/**
 * Texto LEGAL de las atestaciones OFAC — copia literal de qpweb
 * (`components/withdraw/OfacComplianceBlock.js`, `scripts/constants/ofac-cuba.js`,
 * `scripts/compliance/attestation.js`, `scripts/compliance/attestation-i18n.js`).
 *
 * Vive fuera de i18n A PROPÓSITO: no es copy de UI sino el texto que el usuario
 * certifica, aprobado por el CCO solo en español e inglés, y versionado en el
 * servidor (`text_version`). Traducirlo aquí (p. ej. al portugués) sería
 * certificar un texto que nadie aprobó. El usuario elige es/en en el propio
 * modal y el idioma viaja en `compliance.language`. Cualquier cambio: primero en
 * qpweb, luego aquí, palabra por palabra.
 */
import type { OfacAttestationKey, OfacContext, OfacPurposeCode } from './ofacCompliance'

export type OfacLanguage = 'es' | 'en'

export const OFAC_LANGUAGES: readonly OfacLanguage[] = ['es', 'en']

type ContextCopy = { intro?: string, lead?: string, body?: string, footer: string, title?: string, kicker?: string }

type OfacCopy = {
	title: string
	kicker: string
	lead: string
	bodyValueOut: string
	bodyFunding: string
	purposeLabel: string
	certify: string
	noteLabel: string
	notePlaceholder: string
	penalty: string
	purposes: Record<OfacPurposeCode, { label: string, summary: string }>
	attestations: Record<OfacAttestationKey, string>
	cryptoAttestations: Record<OfacAttestationKey, string>
	contexts: Record<OfacContext, ContextCopy>
}

const ES: OfacCopy = {
	title: 'Certificación OFAC',
	kicker: 'CACR — 31 CFR Part 515',
	lead: 'Las transferencias hacia Cuba están reguladas por la Oficina de Control de Activos Extranjeros (OFAC) del Tesoro de EE. UU. bajo la Cuban Assets Control Regulations (31 CFR Part 515).',
	bodyValueOut: 'Para continuar, debes certificar que la operación se ampara en una licencia general vigente y que el beneficiario no es una persona prohibida.',
	bodyFunding: 'Para continuar, debes declarar el uso previsto de estos fondos y certificar que el destinatario final no será una persona prohibida.',
	purposeLabel: 'Propósito de la operación',
	certify: 'Certifico que:',
	noteLabel: 'Propósito del pago (opcional)',
	notePlaceholder: 'Ej.: remesa familiar para mi madre, recarga Nauta, apoyo a emprendedor particular…',
	penalty: 'Proveer información falsa puede conllevar sanciones civiles y penales bajo 50 U.S.C. § 1705 y 18 U.S.C. § 1001.',
	purposes: {
		'P-1': { label: 'Remesa familiar', summary: 'Envío de dinero a un familiar en Cuba para su manutención. No es un pago comercial.' },
		'P-2': { label: 'Pago al sector privado', summary: 'Pago a un emprendedor, cuentapropista o negocio privado cubano por bienes o servicios.' },
		'P-3': { label: 'Donativo', summary: 'Donación a una persona u organización en Cuba, sin contraprestación.' },
		'P-4': { label: 'Recarga / telecomunicaciones', summary: 'Recarga de teléfono, Nauta o servicios de telecomunicaciones (ETECSA).' },
		'W-1': { label: 'Retiro a billetera propia', summary: 'La dirección de destino es una billetera de autocustodia bajo mi control. No es un tercero.' },
	},
	attestations: {
		notProhibitedOfficial: 'El beneficiario no es un "prohibited official of the Government of Cuba" (31 CFR § 515.337).',
		notProhibitedPartyMember: 'El beneficiario no es un "prohibited member of the Cuban Communist Party" (31 CFR § 515.338).',
		notRestrictedList: 'El beneficiario no figura en la lista SDN de OFAC ni en la Cuba Restricted List del Departamento de Estado.',
		lawfulPurpose: 'El propósito del pago es lícito y coincide con la licencia general citada; los fondos no financiarán actividad comercial prohibida.',
	},
	cryptoAttestations: {
		notProhibitedOfficial: 'La billetera de destino es mía: soy el titular y el único beneficiario de los fondos que retiro. No la controla ni la recibe un tercero.',
		notProhibitedPartyMember: 'No estoy retirando en nombre de otra persona ni transferiré estos fondos a un funcionario prohibido del Gobierno cubano ni a un miembro prohibido del Partido.',
		notRestrictedList: 'La dirección de destino no pertenece a una persona, entidad o jurisdicción sancionada por OFAC (lista SDN o listas equivalentes).',
		lawfulPurpose: 'El propósito de este retiro es lícito y la información que declaro es verdadera.',
	},
	contexts: {
		withdraw: { intro: 'Este retiro tiene como destino Cuba.', footer: 'QvaPay almacenará este consentimiento junto con los datos de la extracción.' },
		transfer: { intro: 'El destinatario de esta transferencia es un nacional cubano.', footer: 'QvaPay almacenará este consentimiento junto con los datos de la transferencia.' },
		topup: {
			intro: 'Eres una persona sujeta a la jurisdicción de EE. UU. (US person). QvaPay opera transferencias con destino Cuba, por lo que debes certificar el uso previsto de los fondos que depositas.',
			footer: 'QvaPay almacenará este consentimiento junto con los datos del depósito.',
		},
		deposit_bank: {
			intro: 'Este depósito entra por transferencia bancaria (ACH o wire) a la cuenta de QvaPay, Inc. en Estados Unidos, por lo que el fondeo ocurre dentro de la jurisdicción estadounidense. Debes certificar el uso previsto de los fondos antes de generar la orden de pago.',
			footer: 'QvaPay almacenará este consentimiento junto con los datos del depósito.',
		},
		crypto: {
			title: 'Atestación de billetera propia',
			kicker: 'W-1 · retiro a autocustodia',
			lead: 'QvaPay solo procesa retiros cripto a billeteras del propio titular. No se realizan retiros cripto a terceros.',
			body: 'Para continuar, debes certificar que la dirección de destino está bajo tu control y que no actúas por cuenta de un tercero.',
			footer: 'QvaPay almacenará esta atestación junto con los datos del retiro y la dirección de destino.',
		},
	},
}

const EN: OfacCopy = {
	title: 'OFAC certification',
	kicker: 'CACR — 31 CFR Part 515',
	lead: "Transfers to Cuba are regulated by the U.S. Treasury's Office of Foreign Assets Control (OFAC) under the Cuban Assets Control Regulations (31 CFR Part 515).",
	bodyValueOut: 'To continue, you must certify that the transaction is covered by a current general license and that the beneficiary is not a prohibited person.',
	bodyFunding: 'To continue, you must declare the intended use of these funds and certify that the final recipient will not be a prohibited person.',
	purposeLabel: 'Purpose of the transaction',
	certify: 'I certify that:',
	noteLabel: 'Purpose of the payment (optional)',
	notePlaceholder: 'E.g.: family remittance for my mother, Nauta top-up, support to a private entrepreneur…',
	penalty: 'Providing false information may carry civil and criminal penalties under 50 U.S.C. § 1705 and 18 U.S.C. § 1001.',
	purposes: {
		'P-1': { label: 'Family remittance', summary: 'Money sent to a relative in Cuba for their support. Not a commercial payment.' },
		'P-2': { label: 'Payment to the private sector', summary: 'Payment to a Cuban entrepreneur, self-employed worker or private business for goods or services.' },
		'P-3': { label: 'Donation', summary: 'Donation to a person or organization in Cuba, with nothing received in return.' },
		'P-4': { label: 'Top-up / telecommunications', summary: 'Phone, Nauta or telecommunications (ETECSA) top-up.' },
		'W-1': { label: 'Withdrawal to my own wallet', summary: 'The destination address is a self-custody wallet under my control. It is not a third party.' },
	},
	attestations: {
		notProhibitedOfficial: 'The beneficiary is not a "prohibited official of the Government of Cuba" (31 CFR § 515.337).',
		notProhibitedPartyMember: 'The beneficiary is not a "prohibited member of the Cuban Communist Party" (31 CFR § 515.338).',
		notRestrictedList: "The beneficiary is not on OFAC's SDN List or on the State Department's Cuba Restricted List.",
		lawfulPurpose: 'The purpose of the payment is lawful and matches the cited general license; the funds will not finance prohibited commercial activity.',
	},
	cryptoAttestations: {
		notProhibitedOfficial: 'The destination wallet is mine: I am the holder and the sole beneficiary of the funds I withdraw. No third party controls or receives it.',
		notProhibitedPartyMember: 'I am not withdrawing on behalf of another person and I will not transfer these funds to a prohibited official of the Cuban Government or a prohibited member of the Party.',
		notRestrictedList: 'The destination address does not belong to a person, entity or jurisdiction sanctioned by OFAC (SDN List or equivalent lists).',
		lawfulPurpose: 'The purpose of this withdrawal is lawful and the information I declare is true.',
	},
	contexts: {
		withdraw: { intro: 'This withdrawal is destined for Cuba.', footer: 'QvaPay will store this consent together with the withdrawal data.' },
		transfer: { intro: 'The recipient of this transfer is a Cuban national.', footer: 'QvaPay will store this consent together with the transfer data.' },
		topup: {
			intro: 'You are a person subject to U.S. jurisdiction (U.S. person). QvaPay operates transfers destined for Cuba, so you must certify the intended use of the funds you deposit.',
			footer: 'QvaPay will store this consent together with the deposit data.',
		},
		deposit_bank: {
			intro: "This deposit arrives by bank transfer (ACH or wire) to QvaPay, Inc.'s account in the United States, so the funding takes place within U.S. jurisdiction. You must certify the intended use of the funds before the payment order is generated.",
			footer: 'QvaPay will store this consent together with the deposit data.',
		},
		crypto: {
			title: 'Own-wallet attestation',
			kicker: 'W-1 · withdrawal to self-custody',
			lead: "QvaPay only processes crypto withdrawals to the account holder's own wallets. Crypto withdrawals to third parties are not made.",
			body: 'To continue, you must certify that the destination address is under your control and that you are not acting on behalf of a third party.',
			footer: 'QvaPay will store this attestation together with the withdrawal data and the destination address.',
		},
	},
}

const COPY: Record<OfacLanguage, OfacCopy> = { es: ES, en: EN }

/** Idioma inicial del modal: el de la app si es es/en; el resto (pt) arranca en inglés. */
export const defaultOfacLanguage = (appLanguage: string | null | undefined): OfacLanguage =>
	String(appLanguage || '').toLowerCase().startsWith('es') ? 'es' : 'en'

/** Copy resuelto de un bloque: cabecera, párrafo, casillas y pie, para un contexto e idioma. */
export const ofacCopyFor = (context: OfacContext, language: OfacLanguage) => {
	const base = COPY[language] || ES
	const ctx = base.contexts[context] || base.contexts.withdraw
	const isFunding = context === 'topup' || context === 'deposit_bank'
	const isCrypto = context === 'crypto'
	return {
		title: ctx.title || base.title,
		kicker: ctx.kicker || base.kicker,
		paragraph: [ctx.intro, ctx.lead || base.lead, ctx.body || (isFunding ? base.bodyFunding : base.bodyValueOut)].filter(Boolean).join(' '),
		purposeLabel: base.purposeLabel,
		certify: base.certify,
		noteLabel: base.noteLabel,
		notePlaceholder: base.notePlaceholder,
		footer: `${base.penalty} ${ctx.footer}`,
		purposes: base.purposes,
		attestations: isCrypto ? base.cryptoAttestations : base.attestations,
	}
}
