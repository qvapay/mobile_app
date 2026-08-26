import { Text, View, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

import QPInput from '../../../ui/particles/QPInput'
import QPButton from '../../../ui/particles/QPButton'
import QPKeyboardView from '../../../ui/QPKeyboardView'
import QRCodeStyled from 'react-native-qrcode-styled'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Tipos
import type { Theme } from '../../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../../theme/themeUtils'

type TwoFactorSetupViewProps = {
	/** URL otpauth:// que se pinta como QR. */
	otpauthUrl: string
	/** Secreto en texto para alta manual. */
	secret: string
	verificationCode: string
	onChangeCode: (text: string) => void
	onActivate: () => void
	onCancel: () => void
	onCopySecret: () => void
	isLoading?: boolean
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

// 2FA setup screen: QR code, manual secret, and the 6-digit verification input.
const TwoFactorSetupView = ({ otpauthUrl, secret, verificationCode, onChangeCode, onActivate, onCancel, onCopySecret, isLoading, theme, textStyles, containerStyles }: TwoFactorSetupViewProps) => {
	const { t } = useTranslation()
	return (
	<QPKeyboardView
		actions={
			<>
				<QPButton
					title={t('settings.twoFactor.setup.activateButton')}
					onPress={onActivate}
					loading={isLoading}
					disabled={isLoading || verificationCode.length !== 6}
					textStyle={{ color: theme.colors.almostWhite }}
				/>
				<QPButton
					title={t('common.actions.cancel')}
					onPress={onCancel}
					disabled={isLoading}
					style={{ backgroundColor: theme.colors.surface }}
					textStyle={{ color: theme.colors.primaryText }}
				/>
			</>
		}
		actionsContainerStyle={{ gap: 10 }}
	>

		<Text style={textStyles.h1}>{t('settings.twoFactor.setup.title')}</Text>
		<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
			{t('settings.twoFactor.setup.subtitle')}
		</Text>

		{/* QR Code */}
		<View style={[styles.qrContainer, { backgroundColor: '#FFFFFF' }]}>
			{/* OJO (pre-existente): SVGQRCodeStyledProps OMITE `pieceSize` (lo deriva de
			    size/padding) y no declara `backgroundColor` — ninguno de los dos tiene
			    efecto. Se mantienen tal cual por no tocar runtime. */}
			<QRCodeStyled
				data={otpauthUrl}
				style={{ backgroundColor: '#FFFFFF' }}
				{...({ pieceSize: 6 } as object)}
				padding={20}
				{...({ backgroundColor: '#FFFFFF' } as object)}
				color={'#000000'}
				outerEyesOptions={{
					color: theme.colors.primary,
				}}
			/>
		</View>

		{/* Manual secret */}
		<View style={[containerStyles.card, { marginTop: 20 }]}>
			<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 8 }]}>
				{t('settings.twoFactor.setup.manualEntry')}
			</Text>
			<Pressable onPress={onCopySecret} style={styles.secretContainer}>
				<Text style={[styles.secretText, { color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }]} selectable>
					{secret}
				</Text>
				<FontAwesome6 name="copy" size={16} color={theme.colors.primary} iconStyle="regular" />
			</Pressable>
		</View>

		{/* Verification code input */}
		<View style={{ marginTop: 20 }}>
			<Text style={[textStyles.h5, { color: theme.colors.secondaryText, marginBottom: 8 }]}>
				{t('settings.twoFactor.setup.enterCode')}
			</Text>
			<QPInput
				value={verificationCode}
				onChangeText={onChangeCode}
				placeholder="000000"
				keyboardType="number-pad"
				maxLength={6}
				prefixIconName="key"
				style={[styles.codeInput, { fontSize: theme.typography.fontSize.xxl }]}
			/>
		</View>

	</QPKeyboardView>
	)
}

const styles = StyleSheet.create({
	qrContainer: {
		alignItems: 'center',
		justifyContent: 'center',
		marginTop: 20,
		padding: 20,
		borderRadius: 16,
		alignSelf: 'center'
	},
	secretContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: 12,
		borderRadius: 8,
		backgroundColor: 'rgba(103, 89, 239, 0.1)'
	},
	secretText: {
		letterSpacing: 1,
		flex: 1,
		marginRight: 10
	},
	codeInput: {
		textAlign: 'center',
		letterSpacing: 8
	}
})

export default TwoFactorSetupView
