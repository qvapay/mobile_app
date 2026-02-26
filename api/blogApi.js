// Blog API functions
const BLOG_BASE_URL = 'https://qvapay.blog/wp-json/wp/v2'

// Get latest blog posts
export const getLatestPosts = async (amount = 6) => {

    try {

        const response = await fetch(`${BLOG_BASE_URL}/posts?per_page=${amount}&_embed`, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
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

// Get single blog post by ID
export const getPostById = async (postId) => {

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
