import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { launchImageLibrary } from 'react-native-image-picker'
import { errorCodes, isErrorWithCode, pick, types } from '@react-native-documents/picker'
import { toast } from 'sonner-native'
import { useTranslation } from 'react-i18next'

import { getApiBaseUrl } from '../../api/apiHost'
import { p2pApi } from '../../api/p2pApi'
import { unwrap } from '../../api/unwrap'
import { openAuthedFile, sweepCachedFiles } from '../../helpers/openAuthedFile'
import {
	ATTACHMENT_DEFAULT_MAX_BYTES,
	ATTACHMENT_FILE_PREFIX,
	attachmentErrorKey,
	attachmentFileIssue,
	attachmentFileName,
} from './p2pAttachments'
import type { P2PAttachment } from '../../types/domain'

type UseP2PAttachmentsOptions = {
	p2p_uuid: string
	/** Orden de una oferta por rango. */
	order: string | null
	enabled: boolean
	/** Mensajes del chat: subir uno deja un aviso, así que si crece se relee la lista. */
	messageCount: number
}

export const p2pAttachmentsKey = (uuid: string, order: string | null) => ['p2p', 'attachments', uuid, order] as const

/**
 * Comprobantes del trato: lista, subida y apertura.
 *
 * La lista es una query sin persistir: son documentos privados y no deben quedar en disco. Por
 * eso tampoco viajan en el detalle de la oferta, que se guarda en AsyncStorage. Sin Modal: los
 * selectores se lanzan desde la pantalla, nunca encima de otro `<Modal>` (modal zombi en iOS).
 */
export default function useP2PAttachments({ p2p_uuid, order, enabled, messageCount }: UseP2PAttachmentsOptions) {

	const { t } = useTranslation()
	const [uploading, setUploading] = useState(false)
	const [openingUuid, setOpeningUuid] = useState<string | null>(null)
	const busyRef = useRef(false)

	const query = useQuery({
		queryKey: p2pAttachmentsKey(p2p_uuid, order),
		queryFn: async () => unwrap(await p2pApi.listAttachments(p2p_uuid, order)),
		enabled,
		staleTime: 10 * 1000,
		meta: { noPersist: true },
	})
	const { refetch } = query

	const lastCountRef = useRef(messageCount)
	useEffect(() => {
		if (!enabled || messageCount === lastCountRef.current) return
		lastCountRef.current = messageCount
		refetch()
	}, [enabled, messageCount, refetch])

	// Fuera de la pantalla no queda ningún recibo en la caché
	useEffect(() => () => { sweepCachedFiles(ATTACHMENT_FILE_PREFIX) }, [])

	const maxBytes = query.data?.limits.max_bytes ?? ATTACHMENT_DEFAULT_MAX_BYTES

	const upload = useCallback(async (file: { uri: string, name: string, type: string, size?: number | null }) => {
		if (busyRef.current) return
		const issue = attachmentFileIssue(file, maxBytes)
		if (issue) { toast.error(t(`p2p.attachments.toasts.${issue}`)); return }

		busyRef.current = true
		setUploading(true)
		try {
			const res = await p2pApi.uploadAttachment(p2p_uuid, { uri: file.uri, name: file.name, type: file.type }, order)
			if (res.success) {
				toast.success(t('p2p.attachments.toasts.uploaded'))
				await refetch()
			} else {
				const code = (res.details as { code?: string } | undefined)?.code
				toast.error(t(`p2p.attachments.toasts.${attachmentErrorKey(code)}`))
			}
		} finally {
			busyRef.current = false
			setUploading(false)
		}
	}, [p2p_uuid, order, maxBytes, refetch, t])

	// Explorador de archivos del sistema, para el PDF y, si la galería no abre, para la imagen
	const pickFile = useCallback(async (type: string[], fallbackName: string, fallbackType: string) => {
		try {
			const [doc] = await pick({ type })
			if (!doc) return
			await upload({ uri: doc.uri, name: doc.name || fallbackName, type: doc.type || fallbackType, size: doc.size })
		} catch (e) {
			if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return
			toast.error(t('p2p.attachments.toasts.uploadFailed'))
		}
	}, [upload, t])

	const pickImage = useCallback(() => {
		// Con maxWidth el selector recodifica a JPEG, también las fotos HEIC del iPhone
		launchImageLibrary({ mediaType: 'photo', maxWidth: 2000, maxHeight: 2000, quality: 0.9 }, (response) => {
			if (response.didCancel) return
			if (response.errorCode) {
				// En Android la galería es el selector de fotos del sistema, que en teléfonos antiguos
				// llega por los servicios de Google Play: si no abre, se ofrece el explorador de archivos
				if (Platform.OS === 'android') pickFile([types.images], 'comprobante.jpg', 'image/jpeg')
				return
			}
			const asset = response.assets?.[0]
			if (!asset?.uri) return
			upload({ uri: asset.uri, name: asset.fileName || 'comprobante.jpg', type: asset.type || 'image/jpeg', size: asset.fileSize })
		})
	}, [upload, pickFile])

	const pickPdf = useCallback(() => pickFile([types.pdf], 'comprobante.pdf', 'application/pdf'), [pickFile])

	const open = useCallback(async (attachment: P2PAttachment) => {
		if (openingUuid) return
		setOpeningUuid(attachment.uuid)
		try {
			await sweepCachedFiles(ATTACHMENT_FILE_PREFIX)
			const result = await openAuthedFile({
				url: `${getApiBaseUrl()}/p2p/${p2p_uuid}/attachments/${attachment.uuid}`,
				fileName: attachmentFileName(attachment.uuid, attachment.mime),
				mime: attachment.mime,
				onNoViewer: () => toast.error(t('p2p.attachments.toasts.noViewer')),
			})
			if (result !== 'opened') toast.error(t('p2p.attachments.toasts.openFailed'))
		} catch { toast.error(t('p2p.attachments.toasts.openFailed')) }
		finally { setOpeningUuid(null) }
	}, [p2p_uuid, openingUuid, t])

	const attachments = query.data?.attachments ?? []

	return {
		/** `false` con un backend sin la ruta: la pantalla no pinta la sección. */
		available: !!query.data,
		attachments,
		ownCount: attachments.filter(attachment => attachment.mine).length,
		canUpload: !!query.data?.limits.can_upload,
		proofReplaces: !!query.data?.limits.proof_replaces_tx_id,
		uploading,
		openingUuid,
		pickImage,
		pickPdf,
		open,
	}
}
