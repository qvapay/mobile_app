/**
 * Tests for the invisible pull-to-refresh factory — node environment, no
 * mocks needed since it only builds a RefreshControl element
 * (see keypadAmount.test.js for the environment rationale).
 * @jest-environment node
 */
import { Platform, RefreshControl } from 'react-native'
import { createHiddenRefreshControl } from './QPRefreshIndicator'

afterEach(() => { jest.restoreAllMocks() })

test('builds a RefreshControl wired to the callback, never showing as refreshing', () => {
	const onRefresh = jest.fn()
	const element = createHiddenRefreshControl(true, onRefresh)
	expect(element.type).toBe(RefreshControl)
	// refreshing is hardcoded to false even when the caller passes true: an
	// actively-refreshing RefreshControl reserves inset space on iOS, and
	// progress is communicated by GlobalLoadingBar instead
	expect(element.props.refreshing).toBe(false)
	expect(element.props.onRefresh).toBe(onRefresh)
})

test('hides every native spinner surface with transparent colors', () => {
	const { props } = createHiddenRefreshControl(false, jest.fn())
	expect(props.tintColor).toBe('transparent')
	expect(props.titleColor).toBe('transparent')
	expect(props.colors).toEqual(['transparent'])
	expect(props.progressBackgroundColor).toBe('transparent')
	expect(props.title).toBe('')
})

test('on iOS the progress view stays in place; Android pushes it off-screen', () => {
	expect(createHiddenRefreshControl(false, jest.fn()).props.progressViewOffset).toBeUndefined()
	jest.replaceProperty(Platform, 'OS', 'android')
	expect(createHiddenRefreshControl(false, jest.fn()).props.progressViewOffset).toBe(-10000)
})
