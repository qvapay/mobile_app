/**
 * Unit tests for the referral invite link builders — node environment, pure
 * string logic. The round-trip test proves the Play link's referrer decodes
 * into exactly what installReferrer.js expects on the invitee's first launch.
 * @jest-environment node
 */
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }))
jest.mock('react-native-device-info', () => ({ getInstallReferrer: jest.fn() }))
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }))

import { buildPlayReferralLink, buildWebReferralLink, buildReferralMessage } from './referralLinks'
import { parseInstallReferrer, mapSourceToEnum } from './installReferrer'

describe('buildPlayReferralLink', () => {
	test('embeds the referral in a single URL-encoded referrer param', () => {
		expect(buildPlayReferralLink('erich', 'telegram')).toBe(
			'https://play.google.com/store/apps/details?id=com.qvapay&referrer=' +
			encodeURIComponent('invite=erich&utm_source=telegram&utm_medium=referral&utm_campaign=referidos'),
		)
	})

	test('round-trips through the install referrer parser with the register enum intact', () => {
		const url = buildPlayReferralLink('erich', 'telegram')
		// Play hands the app the decoded referrer param value
		const rawReferrer = decodeURIComponent(url.split('&referrer=')[1])
		const attribution = parseInstallReferrer(rawReferrer)
		expect(attribution).toMatchObject({ invite: 'erich', utmSource: 'telegram', utmCampaign: 'referidos' })
		expect(mapSourceToEnum(attribution.utmSource)).toBe('telegram')
	})

	test('defaults the source to link (valid register enum)', () => {
		const rawReferrer = decodeURIComponent(buildPlayReferralLink('erich').split('&referrer=')[1])
		expect(mapSourceToEnum(parseInstallReferrer(rawReferrer).utmSource)).toBe('link')
	})
})

describe('buildWebReferralLink', () => {
	test('keeps the username in the path with the channel tag', () => {
		expect(buildWebReferralLink('erich', 'x')).toBe('https://www.qvapay.com/register/erich?source=x')
		expect(buildWebReferralLink('erich')).toBe('https://www.qvapay.com/register/erich')
	})
})

describe('buildReferralMessage', () => {
	test('carries the code and both platform links', () => {
		const msg = buildReferralMessage('erich', 'sms')
		expect(msg).toContain('código de invitación: erich')
		expect(msg).toContain(buildPlayReferralLink('erich', 'sms'))
		expect(msg).toContain(buildWebReferralLink('erich', 'sms'))
	})
})
