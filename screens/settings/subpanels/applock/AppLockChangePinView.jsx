import { View, Text, ScrollView } from 'react-native'

import QPButton from '../../../../ui/particles/QPButton'

// Change-PIN screen. The PIN rows are pre-rendered by the parent (which owns refs/focus).
const AppLockChangePinView = ({ oldPinRow, newPinRow, confirmRow, onSubmit, onCancel, isLoading, disabled, theme, textStyles, containerStyles }) => (
	<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>
		<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

			<Text style={textStyles.h1}>Cambiar PIN</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
				Ingresa tu PIN actual y el nuevo
			</Text>

			{oldPinRow}
			{newPinRow}
			{confirmRow}

		</ScrollView>

		<View style={containerStyles.bottomButtonContainer}>
			<QPButton title="Actualizar PIN" onPress={onSubmit} loading={isLoading} disabled={disabled} />
			<QPButton title="Cancelar" onPress={onCancel} style={{ marginTop: 12 }} danger outlined />
		</View>
	</View>
)

export default AppLockChangePinView
