import { useLayoutEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Modal } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'

// React Query
import { useQueryClient } from '@tanstack/react-query'

// Theme
import { useTheme } from '../../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../../theme/themeUtils'

// UI
import QPInput from '../../../../ui/particles/QPInput'
import QPPressable from '../../../../ui/particles/QPPressable'
import QPStepDots from '../../../../ui/particles/QPStepDots'
import QPSplitButton from '../../../../ui/particles/QPSplitButton'

// Wizard transitions (mismo kit que Register/Onboard)
import useStepTransitions from '../../../../hooks/useStepTransitions'

// Document picker (PDF de estatutos)
import { pick, types, errorCodes, isErrorWithCode } from '@react-native-documents/picker'

// API
import { userApi } from '../../../../api/userApi'

// Form logic (pure module)
import {
	COMPANY_COUNTRIES,
	EMPLOYEE_RANGES,
	US_ENTITY_TYPES,
	US_STATES,
	EMPTY_FORM,
	EMPTY_FISCAL,
	validateCompanyStep,
	validateFiscalStep,
	validateContactStep,
	buildRegisterFields,
} from './enterpriseForm'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Tipos
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { DocumentPickerResponse } from '@react-native-documents/picker'
import type { Theme } from '../../../../theme/ThemeContext'
import type { TextStyles, ContainerStyles } from '../../../../theme/themeUtils'
import type { SettingsStackParamList } from '../../../../types/navigation'
import type { EnterpriseForm } from './enterpriseForm'

/** Picker modal abierto (ninguno = null). */
type OpenPicker = null | 'country' | 'incState' | 'addrState'

/** Opción de un OptionPickerModal (código que viaja + etiqueta visible). */
type PickerOption = { value: string, label: string }

const STEPS = 3

/**
 * Registro de empresa in-app (`POST /user/company`) — wizard de 3 pasos con el
 * kit de la casa (useStepTransitions + QPStepDots + QPSplitButton persistente):
 *
 * 1. Empresa — nombre, actividad, rango de empleados (chips).
 * 2. Fiscal — país de constitución (picker buscable, sin jurisdicciones
 *    sancionadas) + campos por país: US → EIN/entidad/estado/dirección,
 *    CU → NIT+REEUP, resto → tax id genérico.
 * 3. Contacto — director, email corporativo y PDF de estatutos
 *    (@react-native-documents/picker, máx 10MB).
 *
 * La validación de cada paso es espejo del wizard web (enterpriseForm.js);
 * el server re-valida todo (mismo núcleo registerCompanyLead). Tras el 200 se
 * invalida `['user','company']` y se vuelve al panel Empresa, que ya pinta la
 * solicitud en pending. 409 = ya hay una solicitud activa o empresa aprobada.
 */
const EnterpriseRegister = ({ navigation }: NativeStackScreenProps<SettingsStackParamList, 'EnterpriseRegister'>) => {

	// Idioma activo
	const { t } = useTranslation()

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// React Query
	const queryClient = useQueryClient()

	// Wizard state
	const [step, setStep] = useState(0)
	const { direction, makeStepEnter, stepExit } = useStepTransitions()

	// Dots del wizard en el header nativo (mismo patrón que Register/Onboard).
	// native-stack INVOCA headerTitle-como-función en vez de montarla como
	// componente, así que el elemento QPStepDots conserva identidad entre
	// setOptions y la píldora anima de paso a paso sin remontarse
	useLayoutEffect(() => {
		navigation.setOptions({
			headerTitle: () => <QPStepDots count={STEPS} activeIndex={step} />,
			headerTitleAlign: 'center',
		})
	}, [navigation, step])

	// Form state
	const [form, setForm] = useState(EMPTY_FORM)
	const [file, setFile] = useState<DocumentPickerResponse | null>(null)
	const [loading, setLoading] = useState(false)

	// Pickers modales: null | 'country' | 'incState' | 'addrState'
	const [pickerOpen, setPickerOpen] = useState<OpenPicker>(null)

	const setField = (key: keyof EnterpriseForm) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }))

	// Cambiar el país resetea los identificadores fiscales del país anterior
	const selectCountry = (code: string) => {
		setForm((prev) => ({ ...prev, country: code, ...EMPTY_FISCAL }))
		setPickerOpen(null)
	}

	const pickStatutes = async () => {
		try {
			const [doc] = await pick({ type: [types.pdf] })
			if (!doc) { return }
			if (doc.type !== 'application/pdf' && !(doc.name || '').toLowerCase().endsWith('.pdf')) {
				toast.error(t('settings.enterprise.register.toasts.mustBePdf'))
				return
			}
			setFile(doc)
		} catch (e) {
			if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) { return }
			toast.error(t('settings.enterprise.register.toasts.pickerErrorTitle'), { description: t('settings.enterprise.register.toasts.pickerErrorBody') })
		}
	}

	const goNext = () => {
		const error = step === 0 ? validateCompanyStep(form) : validateFiscalStep(form)
		if (error) { toast.info(error); return }
		direction.value = 1
		setStep((s) => s + 1)
	}

	const goBack = () => {
		direction.value = -1
		setStep((s) => s - 1)
	}

	const handleSubmit = async () => {
		const error = validateContactStep(form, file)
		if (error) { toast.info(error); return }

		setLoading(true)
		// validateContactStep ya garantizó que `file` no es null en esta rama.
		const result = await userApi.registerCompany({ fields: buildRegisterFields(form), file: file as { uri: string, name?: string } })
		setLoading(false)

		if (result.success) {
			toast.success(t('settings.enterprise.register.toasts.submitted'), { description: t('settings.enterprise.register.toasts.submittedDescription') })
			queryClient.invalidateQueries({ queryKey: ['user', 'company'] })
			navigation.goBack()
		} else {
			toast.error(t('settings.enterprise.register.toasts.submitFailed'), { description: result.error })
		}
	}

	// Nombre del país seleccionado para el row del picker
	const countryName = COMPANY_COUNTRIES.find((c) => c.code === form.country)?.name

	return (
		<View style={[containerStyles.subContainer, { paddingHorizontal: 20 }]}>

			<ScrollView style={styles.fill} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>

				{step === 0 && (
					<Animated.View key="company" entering={makeStepEnter(0)} exiting={stepExit}>
						<Text style={textStyles.h1}>{t('settings.enterprise.register.step1.title')}</Text>
						<Text style={[textStyles.h3, { color: theme.colors.secondaryText, marginBottom: 18 }]}>
							{t('settings.enterprise.register.step1.subtitle')}
						</Text>

						<FieldLabel text={t('settings.enterprise.register.step1.nameLabel')} theme={theme} textStyles={textStyles} />
						<QPInput value={form.companyName} onChangeText={setField('companyName')} placeholder={t('settings.enterprise.register.step1.namePlaceholder')} autoCapitalize="words" />

						<FieldLabel text={t('settings.enterprise.register.step1.activityLabel')} theme={theme} textStyles={textStyles} />
						<QPInput value={form.activity} onChangeText={setField('activity')} placeholder={t('settings.enterprise.register.step1.activityPlaceholder')} autoCapitalize="sentences" />

						<FieldLabel text={t('settings.enterprise.register.step1.employeesLabel')} theme={theme} textStyles={textStyles} />
						<View style={styles.chipRow}>
							{EMPLOYEE_RANGES.map((range) => (
								<Chip
									key={range.value}
									label={range.label}
									selected={form.employeeCount === range.value}
									onPress={() => setField('employeeCount')(range.value)}
									theme={theme}
								/>
							))}
						</View>
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 8 }]}>
							{t('settings.enterprise.register.step1.employeesHint')}
						</Text>
					</Animated.View>
				)}

				{step === 1 && (
					<Animated.View key="fiscal" entering={makeStepEnter(0)} exiting={stepExit}>
						<Text style={textStyles.h1}>{t('settings.enterprise.register.step2.title')}</Text>
						<Text style={[textStyles.h3, { color: theme.colors.secondaryText, marginBottom: 18 }]}>
							{t('settings.enterprise.register.step2.subtitle')}
						</Text>

						<FieldLabel text={t('settings.enterprise.register.step2.countryLabel')} theme={theme} textStyles={textStyles} />
						<QPPressable style={[styles.pickerRow, { backgroundColor: theme.colors.elevation }]} onPress={() => setPickerOpen('country')}>
							<Text style={[textStyles.h4, { color: form.country ? theme.colors.primaryText : theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular }]}>
								{countryName || t('settings.enterprise.register.step2.countryPlaceholder')}
							</Text>
							<FontAwesome6 name="angle-down" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
						</QPPressable>

						{form.country === 'US' && (
							<>
								<FieldLabel text={t('settings.enterprise.register.step2.einLabel')} theme={theme} textStyles={textStyles} />
								<QPInput value={form.taxId} onChangeText={setField('taxId')} placeholder="12-3456789" keyboardType="numbers-and-punctuation" maxLength={10} autoCapitalize="none" />

								<FieldLabel text={t('settings.enterprise.register.step2.entityLabel')} theme={theme} textStyles={textStyles} />
								<View style={styles.chipRow}>
									{US_ENTITY_TYPES.map((entity) => (
										<Chip key={entity} label={entity} selected={form.entityType === entity} onPress={() => setField('entityType')(entity)} theme={theme} />
									))}
								</View>

								<FieldLabel text={t('settings.enterprise.register.step2.incStateLabel')} theme={theme} textStyles={textStyles} />
								<QPPressable style={[styles.pickerRow, { backgroundColor: theme.colors.elevation }]} onPress={() => setPickerOpen('incState')}>
									<Text style={[textStyles.h4, { color: form.incState ? theme.colors.primaryText : theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular }]}>
										{US_STATES.find((s) => s.code === form.incState)?.name || t('settings.enterprise.register.step2.statePlaceholder')}
									</Text>
									<FontAwesome6 name="angle-down" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
								</QPPressable>

								<FieldLabel text={t('settings.enterprise.register.step2.usAddressLabel')} theme={theme} textStyles={textStyles} />
								<QPInput value={form.addrLine1} onChangeText={setField('addrLine1')} placeholder={t('settings.enterprise.register.step2.addrLine1Placeholder')} autoCapitalize="words" />
								<QPInput value={form.addrCity} onChangeText={setField('addrCity')} placeholder={t('settings.enterprise.register.step2.addrCityPlaceholder')} autoCapitalize="words" />
								<View style={styles.addrRow}>
									<QPPressable style={[styles.pickerRow, styles.addrState, { backgroundColor: theme.colors.elevation }]} onPress={() => setPickerOpen('addrState')}>
										<Text style={[textStyles.h4, { color: form.addrState ? theme.colors.primaryText : theme.colors.secondaryText, fontFamily: theme.typography.fontFamily.regular }]}>
											{form.addrState || t('settings.enterprise.register.step2.addrStatePlaceholder')}
										</Text>
										<FontAwesome6 name="angle-down" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
									</QPPressable>
									<View style={styles.addrZip}>
										<QPInput value={form.addrZip} onChangeText={setField('addrZip')} placeholder="ZIP" keyboardType="number-pad" maxLength={10} style={{ marginVertical: 0 }} />
									</View>
								</View>
							</>
						)}

						{form.country === 'CU' && (
							<>
								<FieldLabel text={t('settings.enterprise.register.step2.nitLabel')} theme={theme} textStyles={textStyles} />
								<QPInput value={form.taxId} onChangeText={setField('taxId')} placeholder={t('settings.enterprise.register.step2.nitPlaceholder')} keyboardType="number-pad" maxLength={11} />

								<FieldLabel text={t('settings.enterprise.register.step2.reeupLabel')} theme={theme} textStyles={textStyles} />
								<QPInput value={form.reeup} onChangeText={setField('reeup')} placeholder="123.4.56789" autoCapitalize="none" maxLength={20} />
								<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 2 }]}>
									{t('settings.enterprise.register.step2.reeupHint')}
								</Text>
							</>
						)}

						{form.country !== '' && form.country !== 'US' && form.country !== 'CU' && (
							<>
								<FieldLabel text={t('settings.enterprise.register.step2.taxIdLabel')} theme={theme} textStyles={textStyles} />
								<QPInput value={form.taxId} onChangeText={setField('taxId')} placeholder={t('settings.enterprise.register.step2.taxIdPlaceholder')} autoCapitalize="characters" maxLength={50} />
								<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 2 }]}>
									{t('settings.enterprise.register.step2.taxIdHint')}
								</Text>
							</>
						)}
					</Animated.View>
				)}

				{step === 2 && (
					<Animated.View key="contact" entering={makeStepEnter(0)} exiting={stepExit}>
						<Text style={textStyles.h1}>{t('settings.enterprise.register.step3.title')}</Text>
						<Text style={[textStyles.h3, { color: theme.colors.secondaryText, marginBottom: 18 }]}>
							{t('settings.enterprise.register.step3.subtitle')}
						</Text>

						<FieldLabel text={t('settings.enterprise.register.step3.directorLabel')} theme={theme} textStyles={textStyles} />
						<QPInput value={form.directorName} onChangeText={setField('directorName')} placeholder={t('settings.enterprise.register.step3.directorPlaceholder')} autoCapitalize="words" />

						<FieldLabel text={t('settings.enterprise.register.step3.emailLabel')} theme={theme} textStyles={textStyles} />
						<QPInput value={form.email} onChangeText={setField('email')} placeholder={t('settings.enterprise.register.step3.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 2, marginBottom: 8 }]}>
							{t('settings.enterprise.register.step3.emailHint')}
						</Text>

						<FieldLabel text={t('settings.enterprise.register.step3.statutesLabel')} theme={theme} textStyles={textStyles} />
						<QPPressable style={[styles.fileCard, { backgroundColor: theme.colors.elevation }]} onPress={pickStatutes}>
							<View style={[styles.fileIcon, { backgroundColor: (file ? theme.colors.successText : theme.colors.primary) + '1F' }]}>
								<FontAwesome6 name={file ? 'file-circle-check' : 'file-arrow-up'} size={18} color={file ? theme.colors.successText : theme.colors.primary} iconStyle="solid" />
							</View>
							<View style={styles.fill}>
								<Text numberOfLines={1} style={[textStyles.h4, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular }]}>
									{file ? (file.name || t('settings.enterprise.register.step3.statutesFileName')) : t('settings.enterprise.register.step3.chooseFile')}
								</Text>
								<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 2 }]}>
									{file
										? (file.size ? t('settings.enterprise.register.step3.fileSizeTap', { size: (file.size / 1024 / 1024).toFixed(2) }) : t('settings.enterprise.register.step3.tapToChange'))
										: t('settings.enterprise.register.step3.fileHint')}
								</Text>
							</View>
						</QPPressable>
					</Animated.View>
				)}

				<View style={styles.scrollFooterSpace} />
			</ScrollView>

			{/* Botonera persistente entre pasos (nunca dentro del switch) */}
			<View style={containerStyles.bottomButtonContainer}>
				<QPSplitButton
					title={step < STEPS - 1 ? t('common.actions.continue') : t('settings.enterprise.register.submitButton')}
					onPress={step < STEPS - 1 ? goNext : handleSubmit}
					showBack={step > 0}
					onBack={goBack}
					check={step === STEPS - 1}
					loading={loading}
				/>
			</View>

			{/* Picker de país (buscable, sin jurisdicciones sancionadas) */}
			<OptionPickerModal
				visible={pickerOpen === 'country'}
				title={t('settings.enterprise.register.step2.countryLabel')}
				options={COMPANY_COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
				selected={form.country}
				onSelect={selectCountry}
				onClose={() => setPickerOpen(null)}
				searchable
				theme={theme}
				textStyles={textStyles}
				containerStyles={containerStyles}
			/>

			{/* Pickers de estado US (constitución y dirección) */}
			<OptionPickerModal
				visible={pickerOpen === 'incState'}
				title={t('settings.enterprise.register.step2.incStateLabel')}
				options={US_STATES.map((s) => ({ value: s.code, label: s.name }))}
				selected={form.incState}
				onSelect={(code: string) => { setField('incState')(code); setPickerOpen(null) }}
				onClose={() => setPickerOpen(null)}
				searchable
				theme={theme}
				textStyles={textStyles}
				containerStyles={containerStyles}
			/>
			<OptionPickerModal
				visible={pickerOpen === 'addrState'}
				title={t('settings.enterprise.register.step2.addrStateTitle')}
				options={US_STATES.map((s) => ({ value: s.code, label: s.name }))}
				selected={form.addrState}
				onSelect={(code: string) => { setField('addrState')(code); setPickerOpen(null) }}
				onClose={() => setPickerOpen(null)}
				searchable
				theme={theme}
				textStyles={textStyles}
				containerStyles={containerStyles}
			/>

		</View>
	)
}

// Etiqueta de campo del formulario
type FieldLabelProps = { text: string, theme: Theme, textStyles: TextStyles }

const FieldLabel = ({ text, theme, textStyles }: FieldLabelProps) => (
	<Text style={[textStyles.h6, { color: theme.colors.secondaryText, marginTop: 14, marginBottom: 6 }]}>{text}</Text>
)

// Chip de selección: sin seleccionar = borde + fondo transparente, seleccionado = primary
type ChipProps = { label: string, selected: boolean, onPress: () => void, theme: Theme }

const Chip = ({ label, selected, onPress, theme }: ChipProps) => (
	<QPPressable
		onPress={onPress}
		style={[
			styles.chip,
			selected
				? { backgroundColor: theme.colors.primary }
				: { borderWidth: 1, borderColor: theme.colors.border },
		]}
	>
		<Text style={{ color: selected ? theme.colors.almostWhite : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.sm }}>
			{label}
		</Text>
	</QPPressable>
)

/**
 * Modal centrado de opciones (patrón de la casa: overlay + card, fade,
 * statusBarTranslucent, dismiss al tocar fuera) con búsqueda opcional —
 * lo usan el país de constitución y los estados de EE. UU.
 */
type OptionPickerModalProps = {
	visible: boolean
	title: string
	options: PickerOption[]
	selected?: string
	onSelect: (value: string) => void
	onClose: () => void
	searchable?: boolean
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

const OptionPickerModal = ({ visible, title, options, selected, onSelect, onClose, searchable = false, theme, textStyles, containerStyles }: OptionPickerModalProps) => {

	const { t } = useTranslation()
	const [search, setSearch] = useState('')
	const query = search.trim().toLowerCase()
	const filtered = query ? options.filter((o: PickerOption) => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query)) : options

	const close = () => { setSearch(''); onClose() }

	return (
		<Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
			<QPPressable style={containerStyles.modalOverlay} onPress={close}>
				<QPPressable style={[containerStyles.modalCard, styles.pickerCard]} onPress={() => {}}>
					<Text style={[textStyles.h3, { color: theme.colors.primaryText, marginBottom: 10 }]}>{title}</Text>
					{searchable && (
						<QPInput value={search} onChangeText={setSearch} placeholder={t('settings.enterprise.register.searchPlaceholder')} prefixIconName="magnifying-glass" style={{ marginVertical: 0, marginBottom: 8 }} />
					)}
					<ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
						{filtered.map((option: PickerOption) => (
							<QPPressable
								key={option.value}
								style={[styles.pickerOption, option.value === selected && { backgroundColor: theme.colors.primary + '1F' }]}
								onPress={() => { setSearch(''); onSelect(option.value) }}
							>
								<Text style={[textStyles.h4, { color: option.value === selected ? theme.colors.primary : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular }]}>
									{option.label}
								</Text>
								{option.value === selected && <FontAwesome6 name="check" size={14} color={theme.colors.primary} iconStyle="solid" />}
							</QPPressable>
						))}
					</ScrollView>
				</QPPressable>
			</QPPressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	fill: {
		flex: 1,
	},
	chipRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	chip: {
		borderRadius: 999,
		paddingHorizontal: 14,
		paddingVertical: 8,
	},
	pickerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		borderRadius: 12,
		borderCurve: 'continuous',
		paddingHorizontal: 14,
		height: 48,
	},
	addrRow: {
		flexDirection: 'row',
		gap: 10,
		alignItems: 'center',
	},
	addrState: {
		flex: 1,
	},
	addrZip: {
		flex: 1,
	},
	fileCard: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		borderRadius: 12,
		borderCurve: 'continuous',
		padding: 14,
	},
	fileIcon: {
		width: 38,
		height: 38,
		borderRadius: 11,
		borderCurve: 'continuous',
		alignItems: 'center',
		justifyContent: 'center',
	},
	scrollContent: {
		paddingTop: 10,
	},
	scrollFooterSpace: {
		height: 24,
	},
	pickerCard: {
		width: '100%',
	},
	pickerList: {
		maxHeight: 380,
	},
	pickerOption: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 12,
		paddingVertical: 12,
		borderRadius: 10,
	},
})

export default EnterpriseRegister
