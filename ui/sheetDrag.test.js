/**
 * @jest-environment node
 */
import { SHEET_DISMISS_DISTANCE, shouldDismissSheet } from './sheetDrag'

test('soltarla casi sin bajarla la deja abierta', () => {
	expect(shouldDismissSheet(30, 0)).toBe(false)
})

test('soltarla pasada la distancia la cierra', () => {
	expect(shouldDismissSheet(SHEET_DISMISS_DISTANCE + 1, 0)).toBe(true)
	expect(shouldDismissSheet(SHEET_DISMISS_DISTANCE, 0)).toBe(false)
})

test('un latigazo hacia abajo la cierra aunque apenas se haya movido', () => {
	expect(shouldDismissSheet(20, 1200)).toBe(true)
})

test('un latigazo hacia arriba tras bajarla la deja abierta', () => {
	expect(shouldDismissSheet(SHEET_DISMISS_DISTANCE + 40, -1200)).toBe(false)
})
