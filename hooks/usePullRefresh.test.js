/**
 * Tirar para refrescar: el control invisible de la casa, un tirón a la vez y el
 * `refresh` más reciente.
 * @jest-environment node
 */
jest.mock('../ui/QPRefreshIndicator', () => ({ createHiddenRefreshControl: (refreshing, onRefresh) => ({ refreshing, onRefresh }) }))

import React from 'react'
import { act, create } from 'react-test-renderer'
import usePullRefresh from './usePullRefresh'

let control
const Probe = ({ refresh }) => { control = usePullRefresh(refresh); return null }
let tree
const mount = async (refresh) => { await act(async () => { tree = create(<Probe refresh={refresh} />) }) }
afterEach(async () => { await act(async () => { tree.unmount() }) })

test('nunca pide el spinner nativo, que dejaría un hueco arriba', async () => {
	await mount(jest.fn())
	expect(control.refreshing).toBe(false)
})

test('un tirón con otro en vuelo no lanza un segundo', async () => {
	let finish
	const refresh = jest.fn(() => new Promise(resolve => { finish = resolve }))
	await mount(refresh)
	const first = control.onRefresh()
	control.onRefresh()
	expect(refresh).toHaveBeenCalledTimes(1)
	finish()
	await first
	const second = control.onRefresh()
	expect(refresh).toHaveBeenCalledTimes(2)
	finish()
	await second
})

test('usa el refresh del último render y traga sus errores', async () => {
	const old = jest.fn()
	await mount(old)
	const latest = jest.fn(async () => { throw new Error('boom') })
	await act(async () => { tree.update(<Probe refresh={latest} />) })
	await expect(control.onRefresh()).resolves.toBeUndefined()
	expect(latest).toHaveBeenCalledTimes(1)
	expect(old).not.toHaveBeenCalled()
})
