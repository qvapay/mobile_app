import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

// Bloqueo: el MISMO PIN que Ajustes → Bloqueo (Keychain com.qvapay.applock)
import { useAppLock } from '../../../../lock/AppLockContext'

// UI
import QPCodeInput from '../../../../ui/particles/QPCodeInput'
import type { QPCodeInputHandle } from '../../../../ui/particles/QPCodeInput'

type Props = {
	/** PIN guardado: el caller sigue su flujo (crear/importar, o firmar). */
	onDone: () => void
	/** Fondo de las cajas: `background` dentro de una card `surface` (ver QPCodeInput). */
	boxColor?: string
}

/**
 * Alta del PIN de bloqueo sin pasar por Ajustes, que cuelga del usuario de la
 * cuenta: la usa el alta de wallet sin cuenta (WalletOnboarding) y el gate de
 * firma cuando no hay PIN (WalletAuthModal). Dos filas — PIN y confirmación —
 * y `enableAppLock`, igual que el subpanel AppLock, así que el PIN protege a
 * la vez la app y la seed.
 */
const WalletPinSetup = ({ onDone, boxColor }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const { enableAppLock } = useAppLock()

	const [step, setStep] = useState<'pin' | 'confirm'>('pin')
	const [pin, setPin] = useState('')
	const [confirmPin, setConfirmPin] = useState('')
	const [error, setError] = useState('')
	const [saving, setSaving] = useState(false)
	const confirmRef = useRef<QPCodeInputHandle | null>(null)
	const pinRef = useRef<QPCodeInputHandle | null>(null)

	const onPinFilled = () => {
		setStep('confirm')
		setTimeout(() => confirmRef.current?.focus(0), 100)
	}

	const onConfirmFilled = async (code: string) => {
		if (saving) return
		if (code !== pin) {
			setError(t('crypto.wallet.guest.pin.mismatch'))
			setPin(''); setConfirmPin(''); setStep('pin')
			setTimeout(() => pinRef.current?.focus(0), 100)
			return
		}
		setSaving(true)
		try {
			const result = await enableAppLock(code)
			if (result.success) { onDone(); return }
			setError(result.error || t('misc.lock.errors.savePin'))
		} catch {
			setError(t('misc.lock.errors.savePin'))
		} finally {
			setSaving(false)
		}
		setConfirmPin('')
	}

	return (
		<View style={styles.container} testID={`wallet-pin-setup-${step}`}>
			<Text style={[textStyles.h3, styles.centered, { color: theme.colors.primaryText }]}>
				{t(step === 'pin' ? 'crypto.wallet.guest.pin.title' : 'crypto.wallet.guest.pin.confirmTitle')}
			</Text>
			<Text style={[textStyles.h5, styles.centered, { color: theme.colors.secondaryText }]}>
				{t('crypto.wallet.guest.pin.subtitle')}
			</Text>

			<View style={styles.input}>
				{step === 'pin' ? (
					<QPCodeInput key="pin" ref={pinRef} length={4} code={pin} onChangeCode={code => { setPin(code); setError('') }} onFilled={onPinFilled} secure autoFocus boxColor={boxColor} />
				) : (
					<QPCodeInput key="confirm" ref={confirmRef} length={4} code={confirmPin} onChangeCode={code => { setConfirmPin(code); setError('') }} onFilled={onConfirmFilled} secure autoFocus disabled={saving} boxColor={boxColor} />
				)}
			</View>

			<Text testID="wallet-pin-error" style={[textStyles.h6, styles.centered, styles.error, { color: theme.colors.danger }]}>{error || ' '}</Text>
		</View>
	)
}

const styles = StyleSheet.create({
	container: { alignSelf: 'stretch', gap: 8 },
	centered: { textAlign: 'center' },
	input: { marginTop: 12 },
	error: { minHeight: 16 },
})

export default WalletPinSetup
