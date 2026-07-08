// Blog API functions.
// The only API module that does NOT use the shared axios client: it talks to
// the WordPress REST API at qvapay.blog with native `fetch`, so requests are
// unauthenticated and never touch the bearer token, interceptors or the
// global loading bar.
const BLOG_BASE_URL = 'https://qvapay.blog/wp-json/wp/v2'

/**
 * Fetches the latest blog posts (`GET {BLOG_BASE_URL}/posts?per_page=N&_embed`).
 * WordPress payloads are flattened to the fields the UI needs; posts without
 * a featured image fall back to the QvaPay logo, and missing authors to "QvaPay".
 *
 * @param {number} [amount=6] - Number of posts to fetch.
 * @returns {Promise<Object>} `{ success, data, error? }` — `data` is an array of `{ id, title, excerpt, content, link, date, featuredImage, author, categories }` (empty on failure)
 */
const getLatestPosts = async (amount = 6) => {

	const url = `${BLOG_BASE_URL}/posts?per_page=${amount}&_embed`

	try {

		const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'QvaPay-Mobile', 'Content-Type': 'application/json' } })
		if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`) }
		const data = await response.json()

		// Transform the data to match our needs
		const transformedPosts = data.map(post => ({
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

	} catch (error) { return { success: false, error: error.message, data: [] } }
}

/**
 * Fetches a single blog post by ID (`GET {BLOG_BASE_URL}/posts/{id}?_embed`),
 * transformed to the same flattened shape as `getLatestPosts`.
 *
 * @param {number|string} postId - WordPress post ID.
 * @returns {Promise<Object>} `{ success, data, error? }` — `data` is the transformed post, or null on failure
 */
const getPostById = async (postId) => {

	try {

		const response = await fetch(`${BLOG_BASE_URL}/posts/${postId}?_embed`, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
		if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`) }

		const post = await response.json()

		// Transform the data
		const transformedPost = {
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

	} catch (error) { return { success: false, error: error.message, data: null } }
}

export const blogApi = {
	getLatestPosts,
	getPostById
}
