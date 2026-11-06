import { useLayoutEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
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
import QPKeyboardAvoidingView from '../../../../ui/QPKeyboardAvoidingView'
import OptionPickerModal from '../../../../ui/OptionPickerModal'
import { SurfaceHost } from '../../../../ui/SurfaceContext'

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
	INTL_OWNER_MIN_PCT,
	MAX_COMPANY_OWNERS,
	validateCompanyStep,
	validateFiscalStep,
	validateContactStep,
	buildRegisterFields,
	withOrgKind,
	withOwnerAdded,
	withOwnerField,
	withOwnerRemoved,
} from './enterpriseForm'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Toast
import { toast } from 'sonner-native'

// Tipos
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { DocumentPickerResponse } from '@react-native-documents/picker'
import type { Theme } from '../../../../theme/ThemeContext'
import type { ContainerStyles, TextStyles } from '../../../../theme/themeUtils'
import type { SettingsStackParamList } from '../../../../types/navigation'
import type { EnterpriseForm, OrgKind, OwnerField, OwnerRow } from './enterpriseForm'

/** Picker modal abierto (ninguno = null). */
type OpenPicker = null | 'country' | 'incState' | 'addrState'

const STEPS = 3

/**
 * Registro de empresa in-app (`POST /user/company`) — wizard de 3 pasos con el
 * kit de la casa (useStepTransitions + QPStepDots + QPSplitButton persistente):
 *
 * 1. Empresa — qué se registra (empresa o cuenta propia), nombre, actividad y
 *    rango de empleados (chips).
 * 2. Fiscal — país de constitución (picker buscable, sin jurisdicciones
 *    sancionadas) + campos por país: US → EIN/entidad/estado/dirección,
 *    CU → NIT, resto → tax id genérico. Debajo, los socios, cuya regla depende
 *    del país (Cuba: todos los de la escritura; resto: solo 25 % o más).
 * 3. Contacto — director, email corporativo y PDF de estatutos
 *    (@react-native-documents/picker, máx 10MB).
 *
 * Cuenta propia (TCP) es la misma pantalla con otros textos: Cuba fija, solo
 * el NIT, y el titular con un documento opcional que se puede quitar. Cambiar
 * de rama vacía los datos fiscales, los socios y el PDF (cada rama pide los suyos).
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

	const isTcp = form.orgKind === 'tcp'

	const setField = (key: Exclude<keyof EnterpriseForm, 'owners'>) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }))

	const selectOrgKind = (orgKind: OrgKind) => {
		if (orgKind === form.orgKind) { return }
		setForm((prev) => withOrgKind(prev, orgKind))
		setFile(null)
	}

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
		const result = await userApi.registerCompany({ fields: buildRegisterFields(form), file })
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
		<QPKeyboardAvoidingView style={[containerStyles.subContainer, { paddingHorizontal: 20 }]}>

			{/* Sin keyboardDismissMode: para llegar a un socio de abajo hay que hacer scroll con el teclado abierto */}
			<ScrollView style={styles.fill} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

				{step === 0 && (
					<Animated.View key="company" entering={makeStepEnter(0)} exiting={stepExit}>
						<StepHeader
							title={isTcp ? t('settings.enterprise.register.tcp.step1Title') : t('settings.enterprise.register.step1.title')}
							subtitle={isTcp ? t('settings.enterprise.register.tcp.step1Subtitle') : t('settings.enterprise.register.step1.subtitle')}
							theme={theme}
							textStyles={textStyles}
						/>

						<OrgKindField isTcp={isTcp} onSelect={selectOrgKind} theme={theme} textStyles={textStyles} />

						<FieldLabel text={isTcp ? t('settings.enterprise.register.tcp.nameLabel') : t('settings.enterprise.register.step1.nameLabel')} theme={theme} textStyles={textStyles} />
						<QPInput value={form.companyName} onChangeText={setField('companyName')} placeholder={isTcp ? t('settings.enterprise.register.tcp.namePlaceholder') : t('settings.enterprise.register.step1.namePlaceholder')} autoCapitalize="words" />

						<FieldLabel text={isTcp ? t('settings.enterprise.register.tcp.activityLabel') : t('settings.enterprise.register.step1.activityLabel')} theme={theme} textStyles={textStyles} />
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
							{isTcp ? t('settings.enterprise.register.tcp.employeesHint') : t('settings.enterprise.register.step1.employeesHint')}
						</Text>
					</Animated.View>
				)}

				{step === 1 && (
					<Animated.View key="fiscal" entering={makeStepEnter(0)} exiting={stepExit}>
						<StepHeader
							title={isTcp ? t('settings.enterprise.register.tcp.step2Title') : t('settings.enterprise.register.step2.title')}
							subtitle={isTcp ? t('settings.enterprise.register.tcp.step2Subtitle') : t('settings.enterprise.register.step2.subtitle')}
							theme={theme}
							textStyles={textStyles}
						/>

						<CountryField isTcp={isTcp} countryName={countryName} onOpen={() => setPickerOpen('country')} theme={theme} textStyles={textStyles} />

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
									<Text style={[textStyles.text, { color: form.incState ? theme.colors.primaryText : theme.colors.secondaryText }]}>
										{US_STATES.find((s) => s.code === form.incState)?.name || t('settings.enterprise.register.step2.statePlaceholder')}
									</Text>
									<FontAwesome6 name="angle-down" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
								</QPPressable>

								<FieldLabel text={t('settings.enterprise.register.step2.usAddressLabel')} theme={theme} textStyles={textStyles} />
								<QPInput value={form.addrLine1} onChangeText={setField('addrLine1')} placeholder={t('settings.enterprise.register.step2.addrLine1Placeholder')} autoCapitalize="words" />
								<QPInput value={form.addrCity} onChangeText={setField('addrCity')} placeholder={t('settings.enterprise.register.step2.addrCityPlaceholder')} autoCapitalize="words" />
								<View style={styles.addrRow}>
									<QPPressable style={[styles.pickerRow, styles.addrState, { backgroundColor: theme.colors.elevation }]} onPress={() => setPickerOpen('addrState')}>
										<Text style={[textStyles.text, { color: form.addrState ? theme.colors.primaryText : theme.colors.secondaryText }]}>
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

								{isTcp && (
									<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 2 }]}>
										{t('settings.enterprise.register.tcp.nitHint')}
									</Text>
								)}
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

						{!isTcp && form.country !== '' && (
							<OwnersField
								owners={form.owners}
								isCuba={form.country === 'CU'}
								onChange={(id, field, value) => setForm((prev) => withOwnerField(prev, id, field, value))}
								onAdd={() => setForm(withOwnerAdded)}
								onRemove={(id) => setForm((prev) => withOwnerRemoved(prev, id))}
								theme={theme}
								textStyles={textStyles}
								containerStyles={containerStyles}
							/>
						)}
					</Animated.View>
				)}

				{step === 2 && (
					<Animated.View key="contact" entering={makeStepEnter(0)} exiting={stepExit}>
						<StepHeader
							title={isTcp ? t('settings.enterprise.register.tcp.step3Title') : t('settings.enterprise.register.step3.title')}
							subtitle={isTcp ? t('settings.enterprise.register.tcp.step3Subtitle') : t('settings.enterprise.register.step3.subtitle')}
							theme={theme}
							textStyles={textStyles}
						/>

						<FieldLabel text={isTcp ? t('settings.enterprise.register.tcp.holderLabel') : t('settings.enterprise.register.step3.directorLabel')} theme={theme} textStyles={textStyles} />
						<QPInput value={form.directorName} onChangeText={setField('directorName')} placeholder={t('settings.enterprise.register.step3.directorPlaceholder')} autoCapitalize="words" />

						<FieldLabel text={isTcp ? t('settings.enterprise.register.tcp.emailLabel') : t('settings.enterprise.register.step3.emailLabel')} theme={theme} textStyles={textStyles} />
						<QPInput value={form.email} onChangeText={setField('email')} placeholder={isTcp ? t('settings.enterprise.register.tcp.emailPlaceholder') : t('settings.enterprise.register.step3.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 2, marginBottom: 8 }]}>
							{t('settings.enterprise.register.step3.emailHint')}
						</Text>

						<DocumentField isTcp={isTcp} file={file} onPick={pickStatutes} onRemove={() => setFile(null)} theme={theme} textStyles={textStyles} />
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
			/>
			<OptionPickerModal
				visible={pickerOpen === 'addrState'}
				title={t('settings.enterprise.register.step2.addrStateTitle')}
				options={US_STATES.map((s) => ({ value: s.code, label: s.name }))}
				selected={form.addrState}
				onSelect={(code: string) => { setField('addrState')(code); setPickerOpen(null) }}
				onClose={() => setPickerOpen(null)}
				searchable
			/>

		</QPKeyboardAvoidingView>
	)
}

// Título y subtítulo de cada paso
type StepHeaderProps = { title: string, subtitle: string, theme: Theme, textStyles: TextStyles }

const StepHeader = ({ title, subtitle, theme, textStyles }: StepHeaderProps) => (
	<>
		<Text style={textStyles.h1}>{title}</Text>
		<Text style={[textStyles.h3, { color: theme.colors.secondaryText, marginBottom: 18 }]}>{subtitle}</Text>
	</>
)

// Qué se registra: empresa o cuenta propia, con la nota de esta última
type OrgKindFieldProps = { isTcp: boolean, onSelect: (orgKind: OrgKind) => void, theme: Theme, textStyles: TextStyles }

const OrgKindField = ({ isTcp, onSelect, theme, textStyles }: OrgKindFieldProps) => {
	const { t } = useTranslation()
	return (
		<>
			<FieldLabel text={t('settings.enterprise.register.orgKind.label')} theme={theme} textStyles={textStyles} />
			<View style={styles.chipRow}>
				<Chip label={t('settings.enterprise.register.orgKind.business')} selected={!isTcp} onPress={() => onSelect('business')} theme={theme} />
				<Chip label={t('settings.enterprise.register.orgKind.tcp')} selected={isTcp} onPress={() => onSelect('tcp')} theme={theme} />
			</View>
			{isTcp && (
				<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 8 }]}>
					{t('settings.enterprise.register.orgKind.tcpNote')}
				</Text>
			)}
		</>
	)
}

// País: selector en una empresa, Cuba fija en un TCP
type CountryFieldProps = { isTcp: boolean, countryName?: string, onOpen: () => void, theme: Theme, textStyles: TextStyles }

const CountryField = ({ isTcp, countryName, onOpen, theme, textStyles }: CountryFieldProps) => {
	const { t } = useTranslation()
	return (
		<>
			<FieldLabel text={isTcp ? t('settings.enterprise.register.tcp.countryLabel') : t('settings.enterprise.register.step2.countryLabel')} theme={theme} textStyles={textStyles} />
			{isTcp ? (
				<View style={[styles.pickerRow, { backgroundColor: theme.colors.elevation }]}>
					<Text style={[textStyles.text, { color: theme.colors.secondaryText }]}>{countryName}</Text>
				</View>
			) : (
				<QPPressable style={[styles.pickerRow, { backgroundColor: theme.colors.elevation }]} onPress={onOpen}>
					<Text style={[textStyles.text, { color: countryName ? theme.colors.primaryText : theme.colors.secondaryText }]}>
						{countryName || t('settings.enterprise.register.step2.countryPlaceholder')}
					</Text>
					<FontAwesome6 name="angle-down" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
				</QPPressable>
			)}
		</>
	)
}

// Socios de la empresa: una tarjeta por socio. El porcentaje admite decimales, y el email y el
// usuario son opcionales. La única fila no se quita: vaciarla basta (una fila vacía no viaja)
type OwnersFieldProps = {
	owners: OwnerRow[]
	isCuba: boolean
	onChange: (id: number, field: OwnerField, value: string) => void
	onAdd: () => void
	onRemove: (id: number) => void
	theme: Theme
	textStyles: TextStyles
	containerStyles: ContainerStyles
}

const OwnersField = ({ owners, isCuba, onChange, onAdd, onRemove, theme, textStyles, containerStyles }: OwnersFieldProps) => {
	const { t } = useTranslation()
	return (
		<>
			<FieldLabel text={t('settings.enterprise.register.owners.label')} theme={theme} textStyles={textStyles} />
			<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginBottom: 4 }]}>
				{isCuba ? t('settings.enterprise.register.owners.hintCuba') : t('settings.enterprise.register.owners.hintIntl', { min: INTL_OWNER_MIN_PCT })}
			</Text>
			{owners.map((owner, index) => (
				<View key={owner.id} style={containerStyles.card}>
					<SurfaceHost tone="surface">
						<View style={styles.ownerHeader}>
							<Text style={[textStyles.h6, { color: theme.colors.secondaryText }]}>
								{t('settings.enterprise.register.owners.rowTitle', { number: index + 1 })}
							</Text>
							{owners.length > 1 && (
								<QPPressable
									style={styles.ownerRemove}
									onPress={() => onRemove(owner.id)}
									accessible
									accessibilityRole="button"
									accessibilityLabel={t('settings.enterprise.register.owners.remove', { number: index + 1 })}
								>
									<FontAwesome6 name="xmark" size={14} color={theme.colors.secondaryText} iconStyle="solid" />
								</QPPressable>
							)}
						</View>
						<View style={styles.ownerRow}>
							<View style={styles.fill}>
								<QPInput value={owner.name} onChangeText={(value) => onChange(owner.id, 'name', value)} placeholder={t('settings.enterprise.register.owners.namePlaceholder')} autoCapitalize="words" maxLength={255} />
							</View>
							<View style={styles.ownerPct}>
								<QPInput value={owner.pct} onChangeText={(value) => onChange(owner.id, 'pct', value)} placeholder="%" keyboardType="decimal-pad" maxLength={6} />
							</View>
						</View>
						<QPInput value={owner.email} onChangeText={(value) => onChange(owner.id, 'email', value)} placeholder={t('settings.enterprise.register.owners.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={255} />
						<QPInput value={owner.username} onChangeText={(value) => onChange(owner.id, 'username', value)} placeholder={t('settings.enterprise.register.owners.usernamePlaceholder')} autoCapitalize="none" autoCorrect={false} maxLength={255} />
					</SurfaceHost>
				</View>
			))}
			{owners.length < MAX_COMPANY_OWNERS && (
				<QPPressable style={styles.ownerAdd} onPress={onAdd} accessible accessibilityRole="button">
					<FontAwesome6 name="plus" size={12} color={theme.colors.primary} iconStyle="solid" />
					<Text style={[textStyles.h6, { color: theme.colors.primary }]}>{t('settings.enterprise.register.owners.add')}</Text>
				</QPPressable>
			)}
		</>
	)
}

// Tarjeta del documento. En un TCP es opcional, así que un archivo elegido se puede quitar:
// sin ese botón, un PDF de más de 10MB dejaría la solicitud sin salida
type DocumentFieldProps = { isTcp: boolean, file: DocumentPickerResponse | null, onPick: () => void, onRemove: () => void, theme: Theme, textStyles: TextStyles }

const DocumentField = ({ isTcp, file, onPick, onRemove, theme, textStyles }: DocumentFieldProps) => {
	const { t } = useTranslation()
	const emptyHint = isTcp ? t('settings.enterprise.register.tcp.fileHint') : t('settings.enterprise.register.step3.fileHint')
	const chosenHint = file?.size ? t('settings.enterprise.register.step3.fileSizeTap', { size: (file.size / 1024 / 1024).toFixed(2) }) : t('settings.enterprise.register.step3.tapToChange')
	return (
		<>
			<FieldLabel text={isTcp ? t('settings.enterprise.register.tcp.documentLabel') : t('settings.enterprise.register.step3.statutesLabel')} theme={theme} textStyles={textStyles} />
			{isTcp && (
				<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginBottom: 8 }]}>
					{t('settings.enterprise.register.tcp.documentHint')}
				</Text>
			)}
			<View style={styles.fileRow}>
				<QPPressable style={[styles.fileCard, styles.fill, { backgroundColor: theme.colors.elevation }]} onPress={onPick}>
					<View style={[styles.fileIcon, { backgroundColor: (file ? theme.colors.successText : theme.colors.primary) + '1F' }]}>
						<FontAwesome6 name={file ? 'file-circle-check' : 'file-arrow-up'} size={18} color={file ? theme.colors.successText : theme.colors.primary} iconStyle="solid" />
					</View>
					<View style={styles.fill}>
						<Text numberOfLines={1} style={textStyles.text}>
							{file ? (file.name || t('settings.enterprise.register.step3.statutesFileName')) : t('settings.enterprise.register.step3.chooseFile')}
						</Text>
						<Text style={[textStyles.h7, { color: theme.colors.secondaryText, marginTop: 2 }]}>
							{file ? chosenHint : emptyHint}
						</Text>
					</View>
				</QPPressable>
				{isTcp && file && (
					<QPPressable
						style={[styles.fileRemove, { backgroundColor: theme.colors.elevation }]}
						onPress={onRemove}
						accessible
						accessibilityRole="button"
						accessibilityLabel={t('settings.enterprise.register.tcp.removeFile')}
					>
						<FontAwesome6 name="xmark" size={16} color={theme.colors.secondaryText} iconStyle="solid" />
					</QPPressable>
				)}
			</View>
		</>
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
	ownerHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		minHeight: 32,
	},
	ownerRemove: {
		width: 32,
		height: 32,
		alignItems: 'center',
		justifyContent: 'center',
	},
	ownerRow: {
		flexDirection: 'row',
		gap: 8,
	},
	ownerPct: {
		width: 84,
	},
	ownerAdd: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		alignSelf: 'flex-start',
		paddingVertical: 10,
	},
	fileRow: {
		flexDirection: 'row',
		alignItems: 'stretch',
		gap: 8,
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
	fileRemove: {
		width: 48,
		borderRadius: 12,
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
})

export default EnterpriseRegister
