/**
 * Unit tests for helpers/ofacCompliance — node environment
 * (see keypadAmount.test.js for why node env).
 * @jest-environment node
 */
import {
	isOfacCubaTick,
	withdrawAttestationScope,
	fundingAttestationRequired,
	defaultPurposeFor,
	initialComplianceValue,
	isComplianceComplete,
	buildCompliancePayload,
	purposesForScope,
	isAttestationRequiredError,
	isValidRecipientName,
	normalizeRecipientName,
} from './ofacCompliance'

const allChecked = (value) => ({
	...value,
	attestations: { notProhibitedOfficial: true, notProhibitedPartyMember: true, notRestrictedList: true, lawfulPurpose: true },
})

describe('isOfacCubaTick', () => {

	test('real and legacy spellings, case-insensitive', () => {
		for (const tick of ['USDCASH', 'USD_CASH', 'CUPCASH', 'CUP_CASH', 'CLASICA', 'BANDECPREPAGO', 'BANK_CUP', 'BANK_MLC', 'BOLSATM', 'BOLSA_TM', 'ETECSA', 'bank_cup']) {
			expect(isOfacCubaTick(tick)).toBe(true)
		}
	})

	test('non-Cuban rails', () => {
		for (const tick of ['USDT', 'BTC', 'ZELLE', 'TROPIPAY', 'BANK', '', null, undefined]) {
			expect(isOfacCubaTick(tick)).toBe(false)
		}
	})
})

describe('withdrawAttestationScope', () => {

	test('Cuba tick wins → cuba_value', () => {
		expect(withdrawAttestationScope({ tick: 'BANK_CUP' })).toBe('cuba_value')
		expect(withdrawAttestationScope({ tick: 'USDCASH' })).toBe('cuba_value')
	})

	test('crypto (category 1 or network) → crypto_out', () => {
		expect(withdrawAttestationScope({ tick: 'USDT', coins_categories_id: 1 })).toBe('crypto_out')
		expect(withdrawAttestationScope({ tick: 'USDTBSC', network: 'BSC' })).toBe('crypto_out')
	})

	test('other rails and no coin → null', () => {
		expect(withdrawAttestationScope({ tick: 'ZELLE', coins_categories_id: 2 })).toBeNull()
		expect(withdrawAttestationScope(null)).toBeNull()
	})
})

describe('fundingAttestationRequired', () => {

	test('US person attests every deposit', () => {
		expect(fundingAttestationRequired({ usPerson: true, tick: 'USDT' })).toBe(true)
		expect(fundingAttestationRequired({ usPerson: true, tick: 'CARD' })).toBe(true)
	})

	test('BANK always attests; others do not for non-US', () => {
		expect(fundingAttestationRequired({ usPerson: false, tick: 'bank' })).toBe(true)
		expect(fundingAttestationRequired({ usPerson: false, tick: 'USDT' })).toBe(false)
		expect(fundingAttestationRequired({ usPerson: false, tick: 'CARD' })).toBe(false)
	})
})

describe('purposes', () => {

	test('default purpose per tick/scope', () => {
		expect(defaultPurposeFor('ETECSA', 'cuba_value')).toBe('P-4')
		expect(defaultPurposeFor('BOLSATM', 'cuba_value')).toBe('P-4')
		expect(defaultPurposeFor('BANK_CUP', 'cuba_value')).toBe('P-1')
		expect(defaultPurposeFor('USDT', 'funding')).toBe('P-1')
		expect(defaultPurposeFor('USDT', 'crypto_out')).toBe('W-1')
	})

	test('purposes offered per scope', () => {
		expect(purposesForScope('cuba_value')).toEqual(['P-1', 'P-2', 'P-3', 'P-4'])
		expect(purposesForScope('funding')).toEqual(['P-1', 'P-2', 'P-3', 'P-4'])
		expect(purposesForScope('crypto_out')).toEqual(['W-1'])
	})
})

describe('completeness + payload', () => {

	test('starts with every box unchecked', () => {
		const value = initialComplianceValue('BANK_CUP', 'cuba_value')
		expect(Object.values(value.attestations).every(v => v === false)).toBe(true)
		expect(isComplianceComplete(value, 'cuba_value')).toBe(false)
	})

	test('three of four boxes is not enough', () => {
		const value = allChecked(initialComplianceValue('BANK_CUP', 'cuba_value'))
		value.attestations.lawfulPurpose = false
		expect(isComplianceComplete(value, 'cuba_value')).toBe(false)
		expect(buildCompliancePayload(value, 'cuba_value', 'es')).toBeNull()
	})

	test('purpose must belong to the scope', () => {
		const value = allChecked(initialComplianceValue('USDT', 'crypto_out'))
		expect(isComplianceComplete(value, 'crypto_out')).toBe(true)
		expect(isComplianceComplete(value, 'cuba_value')).toBe(false)
	})

	test('builds the backend payload (note trimmed, capped, omitted when empty)', () => {
		const value = { ...allChecked(initialComplianceValue('ETECSA', 'cuba_value')), purposeNote: `  ${'x'.repeat(250)}  ` }
		const payload = buildCompliancePayload(value, 'cuba_value', 'en')
		expect(payload).toEqual({
			purposeCode: 'P-4',
			attestations: { notProhibitedOfficial: true, notProhibitedPartyMember: true, notRestrictedList: true, lawfulPurpose: true },
			purposeNote: 'x'.repeat(200),
			language: 'en',
		})
		const noNote = buildCompliancePayload(allChecked(initialComplianceValue('USDT', 'funding')), 'funding', 'es')
		expect(noNote).not.toHaveProperty('purposeNote')
	})

	test('attestation-required error codes', () => {
		expect(isAttestationRequiredError('CACR_ATTESTATION_REQUIRED')).toBe(true)
		expect(isAttestationRequiredError('W1_ATTESTATION_REQUIRED')).toBe(true)
		expect(isAttestationRequiredError('DUPLICATE_REQUEST')).toBe(false)
		expect(isAttestationRequiredError(undefined)).toBe(false)
	})
})

describe('recipient name (Cuba top-ups)', () => {

	test('valid names', () => {
		for (const name of ['Ana Li', 'José García-Pérez', "María O'Farrill", 'Ma. Elena Ruiz', '  Juan   Pérez  ']) {
			expect(isValidRecipientName(name)).toBe(true)
		}
	})

	test('invalid names', () => {
		for (const name of ['Ana', 'A B', 'Juan 2', 'Juan @Pérez', '', null, undefined]) {
			expect(isValidRecipientName(name)).toBe(false)
		}
	})

	test('normalizes whitespace and caps length', () => {
		expect(normalizeRecipientName('  Ana   Li ')).toBe('Ana Li')
		expect(normalizeRecipientName('a'.repeat(200))).toHaveLength(120)
	})
})
