import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { Announcement } from '../types/domain'

/** Respuesta cruda de `/announcement`: el aviso vigente, o null si no hay ninguno. */
type AnnouncementEnvelope = { data: Announcement | null }

// Announcements API
export const announcementApi = {
	/**
	 * Fetches the active global announcement (`GET /announcement`) — the same
	 * admin-managed notice (`/admin/announcements`) that the web dashboard shows
	 * in its top bar. Only one is active at a time and the backend already
	 * filters by the scheduled `starts_at`/`ends_at` window, so an empty window
	 * simply resolves to `null` and the app renders nothing.
	 *
	 * Sent with `silent: true`: it is background furniture and must never light
	 * up the global loading bar.
	 *
	 * @returns `{ success, data?, error?, details?, status? }` — `data` is the announcement or null
	 */
	getAnnouncement: async (): Promise<ApiResult<Announcement | null>> => {

		try {

			const response = await apiClient.get<AnnouncementEnvelope>('/announcement', { silent: true })

			// El endpoint responde `{ data: banner | null }`; se acepta también el
			// objeto pelado por si alguna vez se sirve sin envoltorio
			const payload = response.data
			const announcement = payload && 'data' in payload ? payload.data : (payload as Announcement | null)

			return { success: true, data: announcement || null, status: response.status }

		} catch (err) {

			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.announcement.loadFailed'), details: errorData, status: error.response.status }
			}

			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},
}
