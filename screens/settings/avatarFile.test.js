/**
 * @jest-environment node
 */
import { AVATAR_FILE_MAX_BYTES, avatarFileIssue, normalizeAvatarType } from './avatarFile'

describe('avatarFile', () => {
	test('JPG, PNG y GIF valen, también con mayúsculas o como image/jpg', () => {
		expect(avatarFileIssue({ type: 'image/jpeg', size: 1000 })).toBeNull()
		expect(avatarFileIssue({ type: 'image/png', size: 1000 })).toBeNull()
		expect(avatarFileIssue({ type: 'image/gif', size: 1000 })).toBeNull()
		expect(avatarFileIssue({ type: 'IMAGE/JPG', size: 1000 })).toBeNull()
		expect(normalizeAvatarType('image/jpg')).toBe('image/jpeg')
	})

	test('otro tipo, o ninguno, no vale', () => {
		expect(avatarFileIssue({ type: 'image/webp', size: 1000 })).toBe('type')
		expect(avatarFileIssue({ type: 'image/heic', size: 1000 })).toBe('type')
		expect(avatarFileIssue({ type: 'application/pdf', size: 1000 })).toBe('type')
		expect(avatarFileIssue({ type: null, size: 1000 })).toBe('type')
		expect(avatarFileIssue({ size: 1000 })).toBe('type')
	})

	test('5 MB justos valen y un byte más no', () => {
		expect(avatarFileIssue({ type: 'image/png', size: AVATAR_FILE_MAX_BYTES })).toBeNull()
		expect(avatarFileIssue({ type: 'image/png', size: AVATAR_FILE_MAX_BYTES + 1 })).toBe('size')
	})

	test('sin tamaño conocido lo decide el servidor', () => {
		expect(avatarFileIssue({ type: 'image/png', size: null })).toBeNull()
		expect(avatarFileIssue({ type: 'image/png' })).toBeNull()
	})
})
