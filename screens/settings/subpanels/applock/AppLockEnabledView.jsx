import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import QPButton from '../../../../ui/particles/QPButton'
import FaceIDIcon from '../../../../ui/particles/FaceIDIcon'

const TIMEOUT_OPTIONS = [
	{ label: '1 min', value: 1 },
	{ label: '2 min', value: 2 },
	{ label: '5 min', value: 5 },
	{ label: '10 min', value: 10 },
	{ label: '15 min', value: 15 },
	{ label: '30 min', value: 30 },
]

// App-lock enabled state: auto-lock timeout selector, biometric info, change/disable actions.
const AppLockEnabledView = ({ security, biometricsAvailable, biometryType, onTimeoutSelect, onChangePin, onDisable, theme, textStyles, containerStyles }) => (
	<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>
		<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

			<Text style={textStyles.h1}>Bloqueo de app</Text>
			<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
				Tu app está protegida
			</Text>

			{/* Status icon */}
			<View style={{ alignItems: 'center', paddingVertical: 30 }}>
				<View style={{ width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.success + '20' }}>
					<FontAwesome6 name="lock" size={40} color={theme.colors.success} iconStyle="solid" />
				</View>
				<Text style={[textStyles.h2, { color: theme.colors.success, marginTop: 20 }]}>Activo</Text>
			</View>

			{/* Auto-lock timeout */}
			<View style={[containerStyles.card, { marginBottom: 16 }]}>
				<Text style={[textStyles.h4, { marginBottom: 12 }]}>Tiempo de bloqueo</Text>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginBottom: 16 }]}>
					La app se bloqueará después de este tiempo en segundo plano
				</Text>
				<View style={styles.timeoutGrid}>
					{TIMEOUT_OPTIONS.map((option) => (
						<Pressable
							key={option.value}
							style={[styles.timeoutChip, {
								backgroundColor: security.autoLockTimeout === option.value
									? theme.colors.primary : theme.colors.surface,
								borderColor: security.autoLockTimeout === option.value
									? theme.colors.primary : theme.colors.border,
							}]}
							onPress={() => onTimeoutSelect(option.value)}
						>
							<Text style={[textStyles.h6, {
								color: security.autoLockTimeout === option.value
									? '#FFFFFF' : theme.colors.secondaryText,
							}]}>
								{option.label}
							</Text>
						</Pressable>
					))}
				</View>
			</View>

			{/* Biometric unlock info */}
			{biometricsAvailable && (
				<View style={[containerStyles.card, { marginBottom: 16 }]}>
					<View style={{ flexDirection: 'row', alignItems: 'center' }}>
						{biometryType === 'FaceID' ? (
							<View style={{ marginRight: 12 }}><FaceIDIcon size={20} color={theme.colors.primary} /></View>
						) : (
							<FontAwesome6 name="fingerprint" size={18} style={{ color: theme.colors.primary, marginRight: 12 }} iconStyle="solid" />
						)}
						<Text style={[textStyles.h4, { flex: 1, marginBottom: 0 }]}>
							{biometryType === 'FaceID' ? 'Face ID' : biometryType === 'TouchID' ? 'Touch ID' : 'Huella Digital'} activado
						</Text>
						<FontAwesome6 name="circle-check" size={20} color={theme.colors.success} iconStyle="solid" />
					</View>
					<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginTop: 8 }]}>
						Puedes desbloquear con biometría o PIN
					</Text>
				</View>
			)}

		</ScrollView>

		{/* Actions */}
		<View style={containerStyles.bottomButtonContainer}>
			<QPButton title="Cambiar PIN de bloqueo" onPress={onChangePin} />
			<QPButton title="Desactivar bloqueo" onPress={onDisable} style={{ marginTop: 12 }} danger />
		</View>
	</View>
)

const styles = StyleSheet.create({
	timeoutGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	timeoutChip: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
		borderWidth: 1,
	},
})

export default AppLockEnabledView
