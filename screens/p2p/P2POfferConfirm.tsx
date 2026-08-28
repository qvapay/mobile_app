import { useTranslation } from "react-i18next"

import P2PConfirmModal from "./P2PConfirmModal"
import type { P2PConfirmConfig } from "./P2PConfirmModal"

import type { P2POffer } from "../../types/domain"
import type { Theme } from "../../theme/ThemeContext"
import type { TextStyles, ContainerStyles } from "../../theme/themeUtils"

/** Acción de trade pendiente de confirmar. */
export type P2PConfirmAction = 'cancel' | 'markPaid' | 'received'

type P2POfferConfirmProps = {
	/** Acción abierta, o null cuando no hay confirmación en curso. */
	action: P2PConfirmAction | null
	onClose: () => void
	onConfirm: () => void
	p2p: P2POffer | null | undefined
	counterparty?: { username?: string | null } | null
	/** Banderas de envío por acción (las expone `useP2POfferDetail`). */
	loading: { cancel?: boolean, markPaid?: boolean, received?: boolean }
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

/**
 * Confirmación de las acciones de trade (cancelar / marcar pagado / liberar)
 * con resumen explícito y aviso de seguridad. Cada acción define su copy,
 * color e ícono aquí — antes era una IIFE dentro del JSX de `P2POffer`.
 */
const P2POfferConfirm = ({ action, onClose, onConfirm, p2p, counterparty, loading, theme, textStyles, containerStyles }: P2POfferConfirmProps) => {

	const { t } = useTranslation()

	if (!action) { return null }

	const counterpartyName = counterparty?.username ? `@${counterparty.username}` : t('p2p.offer.counterpartyFallback')
	const railAmount = `${p2p?.receive} ${p2p?.Coin?.name || ""}`.trim()
	const configs: Record<P2PConfirmAction, P2PConfirmConfig> = {
		cancel: {
			icon: "ban", iconColor: theme.colors.danger,
			title: t('p2p.offer.confirm.cancel.title'),
			body: t('p2p.offer.confirm.cancel.body'),
			confirmLabel: t('p2p.offer.confirm.cancel.confirmLabel'), confirmBg: theme.colors.danger, confirmTextColor: theme.colors.almostWhite,
			loading: loading.cancel,
		},
		markPaid: {
			icon: "money-bill-wave", iconColor: theme.colors.primary,
			title: t('p2p.offer.confirm.markPaid.title'),
			body: t('p2p.offer.confirm.markPaid.body', { amount: railAmount, counterparty: counterpartyName }),
			warning: t('p2p.offer.confirm.markPaid.warning'),
			confirmLabel: t('p2p.offer.confirm.markPaid.confirmLabel'), confirmBg: theme.colors.successFill, confirmTextColor: theme.colors.successFillText,
			loading: loading.markPaid,
		},
		received: {
			icon: "lock-open", iconColor: theme.colors.warning,
			title: t('p2p.offer.confirm.release.title'),
			body: t('p2p.offer.confirm.release.body', { amount: p2p?.amount, counterparty: counterpartyName }),
			warning: t('p2p.offer.confirm.release.warning', { amount: railAmount }),
			confirmLabel: t('p2p.offer.confirm.release.confirmLabel'), confirmBg: theme.colors.primary, confirmTextColor: theme.colors.almostWhite,
			loading: loading.received,
		},
	}

	return (
		<P2PConfirmModal
			visible
			onClose={onClose}
			onConfirm={onConfirm}
			{...configs[action]}
			theme={theme}
			textStyles={textStyles}
			containerStyles={containerStyles}
		/>
	)
}

export default P2POfferConfirm
