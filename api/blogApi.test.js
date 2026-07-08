/**
 * Unit tests for blogApi — node environment with global.fetch mocked
 * (see keypadAmount.test.js for why node env). blogApi is the only API
 * module that uses native fetch instead of the shared axios client.
 * @jest-environment node
 */
import { blogApi } from './blogApi'

const BLOG_BASE_URL = 'https://qvapay.blog/wp-json/wp/v2'
const FALLBACK_IMAGE = 'https://www.qvapay.com/assets/qvapay-logo-white.png'

const wpPost = (overrides = {}) => ({
	id: 1,
	title: { rendered: 'Título del post' },
	excerpt: { rendered: '<p>Resumen</p>' },
	content: { rendered: '<p>Contenido</p>' },
	link: 'https://qvapay.blog/post-1',
	date: '2026-07-01T12:00:00',
	_embedded: {
		'wp:featuredmedia': [{ source_url: 'https://qvapay.blog/img.jpg' }],
		author: [{ name: 'Erich' }],
		'wp:term': [[{ id: 3, name: 'Noticias' }]],
	},
	...overrides,
})

const fetchOk = (payload) => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })
const fetchFail = (status) => Promise.resolve({ ok: false, status })

const originalFetch = global.fetch

beforeEach(() => {
	global.fetch = jest.fn()
})

afterAll(() => {
	global.fetch = originalFetch
})

describe('getLatestPosts', () => {

	test('fetches 6 posts by default with the expected headers', async () => {
		global.fetch.mockReturnValueOnce(fetchOk([]))
		await blogApi.getLatestPosts()
		expect(global.fetch).toHaveBeenCalledWith(
			`${BLOG_BASE_URL}/posts?per_page=6&_embed`,
			{
				method: 'GET',
				headers: {
					'Accept': 'application/json',
					'User-Agent': 'QvaPay-Mobile',
					'Content-Type': 'application/json',
				},
			},
		)
	})

	test('fetches a custom amount of posts', async () => {
		global.fetch.mockReturnValueOnce(fetchOk([]))
		await blogApi.getLatestPosts(3)
		expect(global.fetch).toHaveBeenCalledWith(
			`${BLOG_BASE_URL}/posts?per_page=3&_embed`,
			expect.any(Object),
		)
	})

	test('flattens WordPress posts to the UI shape', async () => {
		global.fetch.mockReturnValueOnce(fetchOk([wpPost()]))
		const result = await blogApi.getLatestPosts()
		expect(result).toEqual({
			success: true,
			data: [{
				id: 1,
				title: 'Título del post',
				excerpt: '<p>Resumen</p>',
				content: '<p>Contenido</p>',
				link: 'https://qvapay.blog/post-1',
				date: '2026-07-01T12:00:00',
				featuredImage: 'https://qvapay.blog/img.jpg',
				author: 'Erich',
				categories: [{ id: 3, name: 'Noticias' }],
			}],
		})
	})

	test('falls back to the QvaPay logo, "QvaPay" author and empty categories', async () => {
		global.fetch.mockReturnValueOnce(fetchOk([wpPost({ _embedded: undefined })]))
		const result = await blogApi.getLatestPosts()
		expect(result.data[0].featuredImage).toBe(FALLBACK_IMAGE)
		expect(result.data[0].author).toBe('QvaPay')
		expect(result.data[0].categories).toEqual([])
	})

	test('returns an empty array with the HTTP error on a non-ok response', async () => {
		global.fetch.mockReturnValueOnce(fetchFail(500))
		const result = await blogApi.getLatestPosts()
		expect(result).toEqual({ success: false, error: 'HTTP error! status: 500', data: [] })
	})

	test('returns an empty array on a network failure', async () => {
		global.fetch.mockRejectedValueOnce(new Error('Network request failed'))
		const result = await blogApi.getLatestPosts()
		expect(result).toEqual({ success: false, error: 'Network request failed', data: [] })
	})
})

describe('getPostById', () => {

	test('fetches one post by id with the expected headers', async () => {
		global.fetch.mockReturnValueOnce(fetchOk(wpPost({ id: 42 })))
		await blogApi.getPostById(42)
		expect(global.fetch).toHaveBeenCalledWith(
			`${BLOG_BASE_URL}/posts/42?_embed`,
			{ method: 'GET', headers: { 'Content-Type': 'application/json' } },
		)
	})

	test('flattens the WordPress post to the UI shape', async () => {
		global.fetch.mockReturnValueOnce(fetchOk(wpPost({ id: 42 })))
		const result = await blogApi.getPostById(42)
		expect(result.success).toBe(true)
		expect(result.data).toEqual({
			id: 42,
			title: 'Título del post',
			excerpt: '<p>Resumen</p>',
			content: '<p>Contenido</p>',
			link: 'https://qvapay.blog/post-1',
			date: '2026-07-01T12:00:00',
			featuredImage: 'https://qvapay.blog/img.jpg',
			author: 'Erich',
			categories: [{ id: 3, name: 'Noticias' }],
		})
	})

	test('falls back to the QvaPay logo and author when embeds are missing', async () => {
		global.fetch.mockReturnValueOnce(fetchOk(wpPost({ id: 7, _embedded: {} })))
		const result = await blogApi.getPostById(7)
		expect(result.data.featuredImage).toBe(FALLBACK_IMAGE)
		expect(result.data.author).toBe('QvaPay')
		expect(result.data.categories).toEqual([])
	})

	test('returns null data with the HTTP error on a non-ok response', async () => {
		global.fetch.mockReturnValueOnce(fetchFail(404))
		const result = await blogApi.getPostById(999)
		expect(result).toEqual({ success: false, error: 'HTTP error! status: 404', data: null })
	})

	test('returns null data on a network failure', async () => {
		global.fetch.mockRejectedValueOnce(new Error('Network request failed'))
		const result = await blogApi.getPostById(1)
		expect(result).toEqual({ success: false, error: 'Network request failed', data: null })
	})
})
