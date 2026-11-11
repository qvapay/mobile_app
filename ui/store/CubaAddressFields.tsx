import { useMemo, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'
import { useFieldFill } from '../SurfaceContext'

import QPInput from '../particles/QPInput'
import QPPressable from '../particles/QPPressable'
import OptionPickerModal from '../OptionPickerModal'

import { CU_PROVINCES } from './cubaGeo'
import { CU_ID_LENGTH, canonicalMunicipality, identificationMessage, identificationProblem, isCubanProvince, municipalitiesOf, normPlace, normalizeIdentification, provinceName } from './cubaAddress'

import type { AddressForm } from './shippingAddress'

type SelectFieldProps = {
	label: string
	value: string
	placeholder: string
	disabled?: boolean
	onPress: () => void
	testID?: string
}

/** Campo de selección con el aspecto de QPInput (alto 50, borde de 1 pt, relleno del anfitrión). */
const SelectField = ({ label, value, placeholder, disabled, onPress, testID }: SelectFieldProps) => {
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const fill = useFieldFill()
	// Mismo borde en reposo que QPInput: transparente en dark, `border` en light
	const borderColor = theme.isDark ? 'transparent' : theme.colors.border
	return (
		<View>
			<Text style={[styles.label, { color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }]}>{label}</Text>
			<QPPressable
				variant="opacity"
				disabled={disabled}
				onPress={onPress}
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityState={{ disabled: !!disabled }}
				testID={testID}
				style={[styles.select, { backgroundColor: fill, borderColor }, disabled && styles.disabled]}
			>
				<Text style={[textStyles.h6, styles.flex, { color: value ? theme.colors.primaryText : theme.colors.tertiaryText }]} numberOfLines={1}>
					{value || placeholder}
				</Text>
				<FontAwesome6 name="chevron-down" size={12} color={theme.colors.secondaryText} iconStyle="solid" />
			</QPPressable>
		</View>
	)
}

type Props = {
	/** Current form values. */
	form: AddressForm
	/** `(updater) => void`, receives a `f => next` updater like setState. */
	onChange: (updater: (f: AddressForm) => AddressForm) => void
	/** Provincias que puede elegir (las que cubre todo el carrito); null = las 16. */
	provinces?: string[] | null
	/** Municipios que entrega el carrito por provincia; null = sin restricción. */
	municipalities?: Record<string, string[]> | null
}

/**
 * Campos de una dirección de envío en Cuba, con las reglas del servidor: provincia (código) y
 * municipio de su lista cerrada, ambos en modal con búsqueda; calle y referencia; teléfono del
 * destinatario y su carnet de identidad. Sin código postal ni autocompletado de EE. UU.
 *
 * El carnet guarda solo dígitos (un pegado como «CI: 870213 32646» queda en 11), con contador y
 * dos errores distintos: que falten dígitos (tras salir del campo) o que la fecha de los 6
 * primeros no sea válida (en cuanto hay 11).
 */
const CubaAddressFields = ({ form, onChange, provinces = null, municipalities = null }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const [picker, setPicker] = useState<'province' | 'municipality' | null>(null)
	const [idTouched, setIdTouched] = useState(false)

	const setField = (field: keyof AddressForm) => (value: string) => onChange(f => ({ ...f, [field]: value }))

	const provinceOptions = useMemo(() => CU_PROVINCES
		.filter(p => !provinces || provinces.includes(p.code))
		.map(p => ({ value: p.code, label: p.name })), [provinces])

	// Solo los municipios que entrega el carrito; sin mapa, todos los de la provincia
	const municipalityOptions = useMemo(() => {
		const all = municipalitiesOf(form.state)
		const covered = municipalities ? municipalities[form.state] : null
		const list = municipalities ? all.filter(m => (covered || []).some(c => normPlace(c) === normPlace(m))) : all
		return list.map(m => ({ value: m, label: m }))
	}, [form.state, municipalities])

	// Lo que no sea de la lista (un estado de EE. UU. si el formulario cambió de país) se pinta vacío
	const province = isCubanProvince(form.state) ? form.state : ''
	const municipality = province ? canonicalMunicipality(province, form.city) || '' : ''
	const provinceUncovered = !!province && municipalityOptions.length === 0

	const digits = form.identification.length
	const idProblem = identificationProblem(form.identification)
	// La fecha mala es definitiva en cuanto hay 11 dígitos; que falten, solo al salir del campo
	const idError = idProblem === 'date' || (idProblem === 'short' && idTouched && digits > 0) ? identificationMessage(form.identification) : null

	return (
		<View style={styles.fields}>
			<QPInput
				prelabel={t('ui.newAddressForm.recipientName')}
				placeholder={t('ui.newAddressForm.cuba.recipientPlaceholder')}
				value={form.recipient_name}
				onChangeText={setField('recipient_name')}
				autoCapitalize="words"
				textContentType="name"
				maxLength={160}
			/>
			<QPInput
				prelabel={t('ui.newAddressForm.cuba.phone')}
				placeholder={t('ui.newAddressForm.cuba.phonePlaceholder')}
				value={form.phone}
				onChangeText={setField('phone')}
				keyboardType="phone-pad"
				textContentType="telephoneNumber"
				maxLength={40}
			/>

			<SelectField
				label={t('ui.newAddressForm.cuba.province')}
				value={province ? provinceName(province) : ''}
				placeholder={t('ui.newAddressForm.statePlaceholder')}
				onPress={() => setPicker('province')}
				testID="cuba-address-province"
			/>
			<View>
				<SelectField
					label={t('ui.newAddressForm.cuba.municipality')}
					value={municipality}
					placeholder={province ? t('ui.newAddressForm.statePlaceholder') : t('ui.newAddressForm.cuba.provinceFirst')}
					disabled={!province || provinceUncovered}
					onPress={() => setPicker('municipality')}
					testID="cuba-address-municipality"
				/>
				{provinceUncovered && (
					<Text style={[textStyles.caption, styles.helper, { color: theme.colors.warning }]}>
						{t('ui.newAddressForm.cuba.provinceUncovered', { province: provinceName(province) })}
					</Text>
				)}
			</View>

			<QPInput
				prelabel={t('ui.newAddressForm.cuba.line1')}
				placeholder={t('ui.newAddressForm.cuba.line1Placeholder')}
				value={form.line1}
				onChangeText={setField('line1')}
				maxLength={255}
			/>
			<QPInput
				prelabel={t('ui.newAddressForm.cuba.line2')}
				placeholder={t('ui.newAddressForm.cuba.line2Placeholder')}
				value={form.line2}
				onChangeText={setField('line2')}
				maxLength={255}
			/>

			<View>
				<QPInput
					prelabel={t('ui.newAddressForm.cuba.identification')}
					placeholder={t('ui.newAddressForm.cuba.identificationPlaceholder')}
					value={form.identification}
					onChangeText={(text: string) => onChange(f => ({ ...f, identification: normalizeIdentification(text) }))}
					onBlur={() => setIdTouched(true)}
					keyboardType="number-pad"
					textContentType="none"
					autoCorrect={false}
					testID="cuba-address-identification"
				/>
				<View style={styles.idFooter}>
					<Text style={[textStyles.caption, styles.flex, { color: idError ? theme.colors.danger : theme.colors.secondaryText }]}>
						{idError || t('ui.newAddressForm.cuba.identificationHelp')}
					</Text>
					<Text style={[textStyles.caption, { color: idProblem ? theme.colors.secondaryText : theme.colors.successText }]}>
						{t('ui.newAddressForm.cuba.identificationCounter', { digits, total: CU_ID_LENGTH })}
					</Text>
				</View>
			</View>

			<OptionPickerModal
				visible={picker === 'province'}
				title={t('ui.newAddressForm.cuba.provincePickerTitle')}
				options={provinceOptions}
				selected={province}
				searchable
				// Otra provincia invalida el municipio (lista cerrada por provincia)
				onSelect={(code) => { setPicker(null); onChange(f => (f.state === code ? f : { ...f, state: code, city: '' })) }}
				onClose={() => setPicker(null)}
			/>
			<OptionPickerModal
				visible={picker === 'municipality'}
				title={t('ui.newAddressForm.cuba.municipalityPickerTitle')}
				options={municipalityOptions}
				selected={municipality}
				searchable
				onSelect={(name) => { setPicker(null); setField('city')(name) }}
				onClose={() => setPicker(null)}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	fields: { gap: 10 },
	flex: { flex: 1 },
	label: { marginBottom: 5 },
	select: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingHorizontal: 15,
		height: 50,
		borderRadius: 10,
		borderWidth: 1,
		marginVertical: 5,
	},
	disabled: { opacity: 0.5 },
	helper: { marginTop: 2 },
	idFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 2 },
})

export default CubaAddressFields
