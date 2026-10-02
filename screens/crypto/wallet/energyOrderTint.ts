import type { Theme } from '../../../theme/ThemeContext'
import type { EnergyOrderStatus } from '../../../types/domain'

/** Color del estado: entregada en verde, reembolsada en rojo, el resto atenuado. */
export const statusTint = (status: EnergyOrderStatus, theme: Theme): string =>
	status === 'completed' ? theme.colors.successText
		: status === 'refunded' ? theme.colors.danger
			: status === 'needs_review' ? theme.colors.warning
				: theme.colors.secondaryText
