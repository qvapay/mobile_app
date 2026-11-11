/**
 * forgetGrant — quitar el acceso borra el «concedido» de la caché al momento:
 * qpweb trata cualquier `authorize` como consentimiento, así que una ficha con
 * `granted` viejo firmaría el siguiente login sin enseñar la hoja.
 * @jest-environment node
 */
jest.mock('../../api/miniappsApi', () => ({ miniappsApi: {} }))

import { QueryClient } from '@tanstack/react-query'
import { forgetGrant, forgetTesting, settleInvite, miniAppDetailKey, MINIAPPS_LIST_KEY, MINIAPPS_GRANTS_KEY, MINIAPPS_INVITES_KEY } from './miniappsQueries'

const app = (slug, extra = {}) => ({ slug, name: slug, granted: true, granted_scopes: ['profile'], ...extra })

describe('forgetGrant', () => {

	let queryClient
	beforeEach(() => { queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }) })
	afterEach(() => queryClient.clear())

	test('la ficha, el directorio y Ajustes dejan de verla concedida', async () => {
		queryClient.setQueryData(miniAppDetailKey('shop'), app('shop'))
		queryClient.setQueryData(MINIAPPS_LIST_KEY, [app('shop'), app('other')])
		queryClient.setQueryData(MINIAPPS_GRANTS_KEY, [{ slug: 'shop' }, { slug: 'other' }])

		await forgetGrant(queryClient, 'shop')

		expect(queryClient.getQueryData(miniAppDetailKey('shop'))).toMatchObject({ granted: false, granted_scopes: [] })
		expect(queryClient.getQueryData(MINIAPPS_LIST_KEY)).toEqual([app('shop', { granted: false, granted_scopes: [] }), app('other')])
		expect(queryClient.getQueryData(MINIAPPS_GRANTS_KEY)).toEqual([{ slug: 'other' }])
	})

	test('sin nada en caché no inventa datos', async () => {
		await forgetGrant(queryClient, 'shop')
		expect(queryClient.getQueryData(miniAppDetailKey('shop'))).toBeUndefined()
		expect(queryClient.getQueryData(MINIAPPS_LIST_KEY)).toBeUndefined()
		expect(queryClient.getQueryData(MINIAPPS_GRANTS_KEY)).toBeUndefined()
	})

	test('después lo revalida todo', async () => {
		queryClient.setQueryData(MINIAPPS_LIST_KEY, [app('shop')])
		await forgetGrant(queryClient, 'shop')
		expect(queryClient.getQueryState(MINIAPPS_LIST_KEY).isInvalidated).toBe(true)
	})
})

describe('testers: settleInvite y forgetTesting', () => {

	let queryClient
	beforeEach(() => { queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }) })
	afterEach(() => queryClient.clear())

	test('responder una invitación la quita al momento y revalida el directorio (aceptar la hace visible)', async () => {
		queryClient.setQueryData(MINIAPPS_INVITES_KEY, [{ slug: 'shop' }, { slug: 'other' }])
		queryClient.setQueryData(MINIAPPS_LIST_KEY, [app('a')])
		await settleInvite(queryClient, 'shop')
		expect(queryClient.getQueryData(MINIAPPS_INVITES_KEY)).toEqual([{ slug: 'other' }])
		expect(queryClient.getQueryState(MINIAPPS_LIST_KEY).isInvalidated).toBe(true)
	})

	test('dejar de probar la quita del directorio, pero no toca la ficha abierta', async () => {
		queryClient.setQueryData(MINIAPPS_LIST_KEY, [app('shop', { preview: true, preview_role: 'tester' }), app('other')])
		queryClient.setQueryData(miniAppDetailKey('shop'), app('shop', { preview: true, preview_role: 'tester' }))
		await forgetTesting(queryClient, 'shop')
		expect(queryClient.getQueryData(MINIAPPS_LIST_KEY)).toEqual([app('other')])
		expect(queryClient.getQueryState(MINIAPPS_LIST_KEY).isInvalidated).toBe(true)
		// Refrescarla con el host aún montado le pintaría «no disponible» al cerrarse
		expect(queryClient.getQueryState(miniAppDetailKey('shop')).isInvalidated).toBe(false)
	})
})
