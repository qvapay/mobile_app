import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { pickQuizPositions } from '../../../wallet/seed'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPPressable from '../../../ui/particles/QPPressable'
import QPLoader from '../../../ui/particles/QPLoader'

// Navigation
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'WalletBackup'>

const QUIZ_COUNT = 3
const QUIZ_OPTIONS = 3

type QuizQuestion = { position: number, options: string[] }

/** Baraja UI (no criptográfica: solo desordena opciones visibles). */
const shuffle = <T,>(items: T[]): T[] => {
	const result = items.slice()
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[result[i], result[j]] = [result[j], result[i]]
	}
	return result
}

const buildQuiz = (words: string[]): QuizQuestion[] =>
	pickQuizPositions(words.length, QUIZ_COUNT).map(position => {
		const decoys = shuffle(words.filter((_, index) => index !== position)).slice(0, QUIZ_OPTIONS - 1)
		return { position, options: shuffle([words[position], ...decoys]) }
	})

/**
 * Crea la wallet (o retoma un backup pendiente) y verifica el respaldo con
 * un quiz de 3 palabras ANTES de desbloquear el resto de la wallet. El
 * mnemonic vive solo en el estado local de esta pantalla: no viaja por
 * params de navegación ni queda en ningún contexto.
 */
const WalletBackup = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	const { hasWallet, isBackedUp, createWallet, revealMnemonic, markBackedUp } = useWallet()

	const [mnemonic, setMnemonic] = useState<string | null>(null)
	const [revealed, setRevealed] = useState(false)
	const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null)
	const [quizIndex, setQuizIndex] = useState(0)

	// Obtiene el mnemonic: crea la wallet si no existe, o lo relee si quedó
	// un backup a medias. Si ya está respaldada, aquí no se pinta nada.
	useEffect(() => {
		let cancelled = false
		const load = async () => {
			const value = hasWallet ? await revealMnemonic() : await createWallet()
			if (cancelled) return
			if (!value) {
				toast.error(t('crypto.wallet.backup.createFailed'))
				navigation.goBack()
				return
			}
			setMnemonic(value)
		}
		if (!isBackedUp) load()
		return () => { cancelled = true }
		// Solo al montar: hasWallet cambia en cuanto createWallet persiste y
		// re-disparar recrearía el flujo con la wallet ya existente.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const words = useMemo(() => mnemonic?.split(' ') ?? [], [mnemonic])

	const startQuiz = useCallback(() => {
		setQuiz(buildQuiz(words))
		setQuizIndex(0)
	}, [words])

	const answer = useCallback(async (word: string) => {
		if (!quiz) return
		const question = quiz[quizIndex]
		if (word !== words[question.position]) {
			toast.error(t('crypto.wallet.backup.quizError'))
			setQuiz(null)
			setQuizIndex(0)
			return
		}
		if (quizIndex + 1 < quiz.length) {
			setQuizIndex(quizIndex + 1)
			return
		}
		await markBackedUp()
		toast.success(t('crypto.wallet.backup.done'))
		navigation.popToTop()
	}, [quiz, quizIndex, words, markBackedUp, navigation, t])

	if (!mnemonic) {
		return <View style={[containerStyles.subContainer, styles.loading]}><QPLoader /></View>
	}

	const question = quiz?.[quizIndex]

	return (
		<ScrollView style={containerStyles.subContainer} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

			{!question ? (
				<>
					<Text style={textStyles.h1}>{t('crypto.wallet.backup.title')}</Text>
					<View style={[styles.warning, { backgroundColor: theme.colors.danger + '12' }]}>
						<FontAwesome6 name="triangle-exclamation" size={16} color={theme.colors.danger} iconStyle="solid" />
						<Text style={[textStyles.h5, styles.warningText, { color: theme.colors.primaryText }]}>{t('crypto.wallet.backup.warning')}</Text>
					</View>

					<View style={styles.grid}>
						{words.map((word, index) => (
							<View key={index} style={[styles.wordChip, { backgroundColor: theme.colors.surface }, wordBorder(theme)]}>
								<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>{index + 1}</Text>
								<Text style={[textStyles.h5, { color: theme.colors.primaryText }]}>{revealed ? word : '••••••'}</Text>
							</View>
						))}
					</View>

					{!revealed
						? <QPButton title={t('crypto.wallet.backup.reveal')} icon="eye" onPress={() => setRevealed(true)} />
						: <QPButton title={t('crypto.wallet.backup.continue')} onPress={startQuiz} />}
				</>
			) : (
				<>
					<Text style={textStyles.h1}>{t('crypto.wallet.backup.quizTitle')}</Text>
					<Text style={[textStyles.h3, { color: theme.colors.secondaryText }]}>
						{t('crypto.wallet.backup.quizSubtitle', { position: question.position + 1 })}
					</Text>
					<View style={styles.options}>
						{question.options.map(option => (
							<QPPressable key={option} onPress={() => answer(option)} style={[styles.option, { backgroundColor: theme.colors.surface }, wordBorder(theme)]}>
								<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{option}</Text>
							</QPPressable>
						))}
					</View>
					<Text style={[textStyles.h6, styles.progress, { color: theme.colors.secondaryText }]}>{quizIndex + 1}/{QUIZ_COUNT}</Text>
				</>
			)}
		</ScrollView>
	)
}

const wordBorder = (theme: ReturnType<typeof useTheme>['theme']) =>
	!theme.isDark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border } : null

const styles = StyleSheet.create({
	loading: { alignItems: 'center', justifyContent: 'center' },
	content: { gap: 14, paddingBottom: 40 },
	warning: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
	warningText: { flex: 1, lineHeight: 19 },
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	wordChip: { flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, flexBasis: '31%', flexGrow: 1 },
	options: { gap: 10, marginTop: 10 },
	option: { borderRadius: 12, padding: 16, alignItems: 'center' },
	progress: { textAlign: 'center', marginTop: 6 },
})

export default WalletBackup
