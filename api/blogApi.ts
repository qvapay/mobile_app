import type { ApiFailure, ApiSuccess } from '../types/api'

// Blog API functions.
// The only API module that does NOT use the shared axios client: it talks to
// the WordPress REST API at qvapay.blog with native `fetch`, so requests are
// unauthenticated and never touch the bearer token, interceptors or the
// global loading bar.
const BLOG_BASE_URL = 'https://qvapay.blog/wp-json/wp/v2'

/** Payload crudo de WordPress: solo los campos que la transformación lee. */
type WpRawPost = {
	id: number
	title: { rendered: string }
	excerpt: { rendered: string }
	content: { rendered: string }
	link: string
	date: string
	_embedded?: {
		'wp:featuredmedia'?: { source_url?: string }[]
		author?: { name?: string }[]
		'wp:term'?: unknown[][]
	}
}

/** Post de WordPress aplanado a los campos que consume la UI. */
export type BlogPost = {
	id: number
	title: string
	excerpt: string
	content: string
	link: string
	date: string
	featuredImage: string
	author: string
	categories: unknown[]
}

/**
 * Resultado de `getLatestPosts`: fuera del contrato estándar, el fallo también
 * trae `data` (lista vacía) para que la UI pinte sin ramas extra.
 */
export type BlogPostsResult =
	| (ApiSuccess<BlogPost[]> & { data: BlogPost[] })
	| (ApiFailure & { data: BlogPost[] })

/** Resultado de `getPostById`: el fallo trae `data: null`. */
export type BlogPostResult =
	| (ApiSuccess<BlogPost> & { data: BlogPost })
	| (ApiFailure & { data: null })

/**
 * Fetches the latest blog posts (`GET {BLOG_BASE_URL}/posts?per_page=N&_embed`).
 * WordPress payloads are flattened to the fields the UI needs; posts without
 * a featured image fall back to the QvaPay logo, and missing authors to "QvaPay".
 *
 * @param amount - Number of posts to fetch.
 * @returns `{ success, data, error? }` — `data` is an array of `{ id, title, excerpt, content, link, date, featuredImage, author, categories }` (empty on failure)
 */
const getLatestPosts = async (amount: number = 6): Promise<BlogPostsResult> => {

	const url = `${BLOG_BASE_URL}/posts?per_page=${amount}&_embed`

	try {

		const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'QvaPay-Mobile', 'Content-Type': 'application/json' } })
		if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`) }
		const data: WpRawPost[] = await response.json()

		// Transform the data to match our needs
		const transformedPosts: BlogPost[] = data.map(post => ({
			id: post.id,
			title: post.title.rendered,
			excerpt: post.excerpt.rendered,
			content: post.content.rendered,
			link: post.link,
			date: post.date,
			featuredImage: post._embedded?.['wp:featuredmedia']?.[0]?.source_url || 'https://www.qvapay.com/assets/qvapay-logo-white.png',
			author: post._embedded?.author?.[0]?.name || 'QvaPay',
			categories: post._embedded?.['wp:term']?.[0] || []
		}))

		return { success: true, data: transformedPosts }

	} catch (err) {
		// Native fetch: only `new Error` throws land here (the HTTP-status throw
		// above or fetch's own network TypeError) — no axios interceptor shapes.
		const error = err as Error
		return { success: false, error: error.message, data: [] }
	}
}

/**
 * Fetches a single blog post by ID (`GET {BLOG_BASE_URL}/posts/{id}?_embed`),
 * transformed to the same flattened shape as `getLatestPosts`.
 *
 * @param postId - WordPress post ID.
 * @returns `{ success, data, error? }` — `data` is the transformed post, or null on failure
 */
const getPostById = async (postId: number | string): Promise<BlogPostResult> => {

	try {

		const response = await fetch(`${BLOG_BASE_URL}/posts/${postId}?_embed`, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
		if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`) }

		const post: WpRawPost = await response.json()

		// Transform the data
		const transformedPost: BlogPost = {
			id: post.id,
			title: post.title.rendered,
			excerpt: post.excerpt.rendered,
			content: post.content.rendered,
			link: post.link,
			date: post.date,
			featuredImage: post._embedded?.['wp:featuredmedia']?.[0]?.source_url || 'https://www.qvapay.com/assets/qvapay-logo-white.png',
			author: post._embedded?.author?.[0]?.name || 'QvaPay',
			categories: post._embedded?.['wp:term']?.[0] || []
		}

		return { success: true, data: transformedPost }

	} catch (err) {
		// Same as above: real errors here are plain `Error`s from fetch/the throw.
		const error = err as Error
		return { success: false, error: error.message, data: null }
	}
}

export const blogApi = {
	getLatestPosts,
	getPostById
}
