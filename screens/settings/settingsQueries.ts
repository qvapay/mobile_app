import { useQuery } from '@tanstack/react-query'

import bundledJson from './contributors.bundled.json'
import { CONTRIBUTORS_URL, filterContributors } from './contributors'
import type { GithubContributor } from './contributors'

/**
 * Queries del dominio Ajustes. Hoy solo los contribuidores del easter egg del pie.
 *
 * GitHub se pide SIN token (60 req/h por IP), así que la query solo corre con la
 * hoja abierta y se da por fresca 24 h; se persiste como el registry de RPC
 * (no es secreto). Sin red y sin caché gana la foto empaquetada.
 */
export const CONTRIBUTORS_QUERY_KEY = ['about', 'contributors']

const FETCH_TIMEOUT_MS = 5_000

export const bundledContributors: GithubContributor[] = filterContributors(bundledJson)

export const fetchContributors = async (): Promise<GithubContributor[]> => {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
	try {
		const res = await fetch(CONTRIBUTORS_URL, { signal: controller.signal, headers: { Accept: 'application/vnd.github+json' } })
		if (!res.ok) throw new Error(`contributors: HTTP ${res.status}`)
		const list = filterContributors(await res.json())
		if (list.length === 0) throw new Error('contributors: payload vacío')
		return list
	} finally {
		clearTimeout(timer)
	}
}

export const useContributorsQuery = (enabled: boolean) => useQuery({
	queryKey: CONTRIBUTORS_QUERY_KEY,
	queryFn: fetchContributors,
	staleTime: 24 * 60 * 60 * 1000,
	retry: 1,
	enabled,
	placeholderData: bundledContributors,
})
