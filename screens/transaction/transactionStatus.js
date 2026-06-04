// Status colors helper — shared by the transaction detail screen + its related cards
export const getStatusColor = (status, theme) => {
	switch (status) {
		case 'paid': case 'completed': case 'received': return theme.colors.success
		case 'pending': case 'open': case 'processing': case 'unpaid': return theme.colors.warning
		case 'cancelled': case 'failed': return theme.colors.danger
		case 'revision': return theme.colors.primary
		default: return theme.colors.secondaryText
	}
}