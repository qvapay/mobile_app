import { View, Text, ScrollView } from 'react-native'
import LottieView from 'lottie-react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import QPButton from '../../../../ui/particles/QPButton'

// Disabled-info / setup / confirm flow. PIN rows are pre-rendered by the parent.
const AppLockSetupView = ({ mode, security, setupRow, confirmRow, onActivate, onSubmit, onCancel, isLoading, pinComplete, confirmComplete, theme, textStyles, containerStyles }) => (
	<View style={[containerStyles.subContainer, { justifyContent: 'space-between' }]}>
		<ScrollView contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

			{mode === 'info' && (
				<>
					<Text style={textStyles.h1}>Bloqueo de app</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
						Protege tu app con PIN y biometría
					</Text>

					{/* Status icon */}
					<View style={{ alignItems: 'center', paddingVertical: 30 }}>
						<LottieView
							style={{ width: 120, height: 120 }}
							source={require('../../../../assets/lotties/security.json')}
							autoPlay
							loop={false}
						/>
					</View>

					{/* Info card */}
					<View style={[containerStyles.card, { marginBottom: 24 }]}>
						<View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
							<FontAwesome6 name="shield-halved" size={16} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
								Bloquea la app automáticamente después de {security.autoLockTimeout || 5} minutos en segundo plano
							</Text>
						</View>
						<View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
							<FontAwesome6 name="fingerprint" size={16} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
								Desbloquea con Face ID, Touch ID o Huella Digital o tu PIN de 4 dígitos
							</Text>
						</View>
						<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
							<FontAwesome6 name="lock" size={16} color={theme.colors.primary} iconStyle="solid" />
							<Text style={[textStyles.body, { color: theme.colors.secondaryText, marginLeft: 12, flex: 1 }]}>
								Toda la verificación es local, no se envían datos al servidor
							</Text>
						</View>
					</View>
				</>
			)}

			{mode === 'setup' && (
				<>
					<Text style={textStyles.h1}>Crear PIN</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
						Elige un PIN de 4 dígitos para bloquear tu app
					</Text>

					{setupRow}
				</>
			)}

			{mode === 'confirm' && (
				<>
					<Text style={textStyles.h1}>Confirmar PIN</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
						Ingresa el PIN nuevamente para confirmar
					</Text>

					{confirmRow}
				</>
			)}

		</ScrollView>

		<View style={containerStyles.bottomButtonContainer}>
			{mode === 'info' && (
				<QPButton title="Activar bloqueo" onPress={onActivate} />
			)}

			{mode === 'setup' && (
				<>
					<QPButton title="Continuar" onPress={onSubmit} disabled={!pinComplete} />
					<QPButton title="Cancelar" onPress={onCancel} style={{ marginTop: 12 }} danger outlined />
				</>
			)}

			{mode === 'confirm' && (
				<>
					<QPButton
						title="Activar bloqueo"
						textStyle={{ color: theme.colors.buttonText }}
						onPress={onSubmit}
						loading={isLoading}
						disabled={!confirmComplete}
					/>
					<QPButton title="Cancelar" onPress={onCancel} style={{ marginTop: 12 }} danger outlined />
				</>
			)}
		</View>
	</View>
)

export default AppLockSetupView
