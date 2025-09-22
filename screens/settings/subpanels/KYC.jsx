import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, Platform, Modal, Pressable, ScrollView, FlatList } from 'react-native'

// Theme
import { useTheme } from '../../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../../theme/themeUtils'

// UI
import QPButton from '../../../ui/particles/QPButton'
import QPLoader from '../../../ui/particles/QPLoader'
import QPInput from '../../../ui/particles/QPInput'

// API
import { userApi } from '../../../api/userApi'

// Lottie
import LottieView from 'lottie-react-native'

// Camera
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera'

// Auth
import { useAuth } from '../../../auth/AuthContext'

// Notifications
import Toast from 'react-native-toast-message'

// Countries
import { countries } from '../../../labels/countries'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

const KYC = () => {

	// Theme
	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)

	// Auth
	const { user } = useAuth()

	// Data states
	const [loading, setLoading] = useState(true)
	const [uploading, setUploading] = useState(false)
	const [kycData, setKycData] = useState(null)

	// KYC Info (controlled by parent to submit together)
	const [formCountry, setFormCountry] = useState('')
	const [formCountryName, setFormCountryName] = useState('')
	const [formDay, setFormDay] = useState('')
	const [formMonth, setFormMonth] = useState('')
	const [formYear, setFormYear] = useState('')
	const [formConfirmed, setFormConfirmed] = useState(false)
	const [submittingInfo, setSubmittingInfo] = useState(false)
	const [prefilledFromKYC, setPrefilledFromKYC] = useState(false)

	// Capture modal
	const [captureType, setCaptureType] = useState(null) // 'document' | 'selfie' | 'check'
	const [isCaptureOpen, setIsCaptureOpen] = useState(false)

	console.log(kycData)

	// Load profile and KYC status
	useEffect(() => {
		const load = async () => {
			try {
				setLoading(true)
				const [profileResp, kycResp] = await Promise.all([
					userApi.getUserProfile(),
					userApi.getKYCStatus(),
				])
				if (kycResp?.success) { setKycData(kycResp.data) }
				else if (kycResp?.status === 404) { setKycData(null) } // Ignore when KYC record does not exist yet
				else { Toast.show({ type: 'error', text1: 'Error', text2: kycResp?.error || 'No se pudo obtener el estado KYC' }) }
			} catch (e) {
				Toast.show({ type: 'error', text1: 'Error', text2: e.message || 'Ha ocurrido un error' })
			} finally { setLoading(false) }
		}
		load()
	}, [])

	// Prefill form from KYC data when available
	useEffect(() => {
		if (!prefilledFromKYC && kycData?.KYC) {
			const k = kycData.KYC || {}
			// Country code and name
			if (k.country) {
				try {
					const code = String(k.country).toUpperCase().trim()
					const found = countries.find(c => c.code.toUpperCase() === code)
					setFormCountry(code)
					setFormCountryName(found?.name || '')
				} catch (_) { /* ignore */ }
			}
			// Birthday YYYY-MM-DD
			if (k.birthday && typeof k.birthday === 'string') {
				const parts = k.birthday.split('-')
				if (parts.length === 3) {
					const [yyyy, mm, dd] = parts
					setFormYear(yyyy || '')
					setFormMonth((mm || '').slice(0, 2))
					setFormDay((dd || '').slice(0, 2))
				}
			}
			// Confirmation flag if backend provides it
			if (typeof k.confirmed === 'boolean') { setFormConfirmed(k.confirmed) }

			setPrefilledFromKYC(true)
		}
	}, [kycData, prefilledFromKYC])

	// Derived flags
	const isVerified = useMemo(() => {
		if (!kycData) return false
		const result = kycData?.KYC?.result || kycData?.result
		return result === 'verified' || result === 'approved' || result === 'completed' || user?.kyc === true
	}, [kycData, user])

	const isProcessing = useMemo(() => {
		if (!kycData) return false
		const result = kycData?.KYC?.result || kycData?.result
		return result === 'processing'
	}, [kycData])

	const documentUploaded = !!kycData?.KYC?.document_url
	const selfieUploaded = !!kycData?.KYC?.selfie_url
	const checkUploaded = !!kycData?.KYC?.check_url

	// Open capture modal
	const openCapture = (type) => {
		setCaptureType(type)
		setIsCaptureOpen(true)
	}

	// After successful upload, refresh status
	const refreshKYC = async () => {
		try {
			const resp = await userApi.getKYCStatus()
			if (resp.success) { setKycData(resp.data) }
			else if (resp.status === 404) { setKycData(null) } // No toast on missing KYC
		} catch { /* ignore */ }
	}

	// Submit verification info (country, birthday, confirmation)
	const submitVerification = async () => {

		if (!documentUploaded || !selfieUploaded) {
			Toast.show({ type: 'error', text1: 'Faltan fotos', text2: 'Sube tu documento y tu selfie antes de enviar.' })
			return
		}

		const yyyy = formYear.trim()
		const mm = formMonth.trim().padStart(2, '0')
		const dd = formDay.trim().padStart(2, '0')
		const birthday = yyyy && mm && dd ? `${yyyy}-${mm}-${dd}` : ''

		if (!formCountry || !birthday) {
			Toast.show({ type: 'error', text1: 'Faltan datos', text2: 'Completa país, fecha de nacimiento.' })
			return
		}

		try {
			setSubmittingInfo(true)
			const resp = await userApi.submitKYCInfo({ country: formCountry.trim().toUpperCase(), birthday })
			if (resp.success) {
				Toast.show({ type: 'success', text1: 'Verificación enviada', text2: 'Tu información fue enviada correctamente' })
				await refreshKYC()
			} else { Toast.show({ type: 'error', text1: 'Error', text2: resp.error || 'No se pudo enviar la verificación' }) }
		} catch (e) { Toast.show({ type: 'error', text1: 'Error', text2: e.message }) }
		finally { setSubmittingInfo(false) }
	}

	// Upload handler called by modal
	const handleUpload = async (fileUri, type) => {
		try {
			setUploading(true)
			const resp = await userApi.uploadKYCPicture({
				pictureType: type,
				file: { uri: fileUri, type: 'image/jpeg', name: `kyc-${type}.jpg` }
			})
			if (resp.success) {
				Toast.show({ type: 'success', text1: 'Imagen subida', text2: 'Se ha enviado correctamente' })
				await refreshKYC()
			} else { Toast.show({ type: 'error', text1: 'Error al subir', text2: resp.error || 'No se pudo subir la imagen' }) }
		} catch (e) { Toast.show({ type: 'error', text1: 'Error al subir', text2: e.message }) }
		finally { setUploading(false) }
	}

	if (loading) { return (<QPLoader />) }

	if (isVerified) {
		return (
			<View style={[containerStyles.subContainer, styles.center]}>
				<LottieView source={require('../../../assets/lotties/verified.json')} autoPlay loop={false} style={{ width: 200, height: 200 }} />
				<Text style={[textStyles.h2, { color: theme.colors.primaryText, marginTop: 10 }]}>¡Identidad verificada!</Text>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6 }]}>Gracias por completar la verificación. Ya puedes disfrutar de todos los beneficios.</Text>
			</View>
		)
	}

	if (isProcessing) {
		return (
			<View style={[containerStyles.subContainer, styles.center]}>
				<LottieView source={require('../../../assets/lotties/searching.json')} autoPlay loop style={{ width: 200, height: 200 }} />
				<Text style={[textStyles.h2, { color: theme.colors.primaryText, marginTop: 10 }]}>Estamos revisando tu verificación</Text>
				<Text style={[textStyles.h5, { color: theme.colors.secondaryText, textAlign: 'center', marginTop: 6 }]}>Esto puede tardar unos minutos. Te avisaremos cuando esté lista.</Text>
			</View>
		)
	}

	return (
		<ScrollView style={containerStyles.subContainer} contentContainerStyle={containerStyles.scrollContainer} showsVerticalScrollIndicator={false}>

			<Text style={[textStyles.h1, { color: theme.colors.primaryText }]}>Verificación de identidad</Text>
			<Text style={[textStyles.h4, { color: theme.colors.secondaryText }]}>Sigue los pasos para verificar tu cuenta</Text>

			<View style={[containerStyles.card, { marginTop: 16 }]}>
				<Text style={[textStyles.h4, { color: theme.colors.primaryText, marginBottom: 8 }]}>Recomendaciones</Text>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText }]}>- Asegúrate de buena iluminación</Text>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText }]}>- No uses gafas oscuras ni gorras para la selfie.</Text>
				<Text style={[textStyles.body, { color: theme.colors.secondaryText }]}>- Ten tu documento a mano.</Text>
			</View>

			{/* KYC Info form */}
			<View style={[containerStyles.card, { marginTop: 16 }]}>
				<KYCInfoForm
					theme={theme}
					textStyles={textStyles}
					country={formCountry}
					countryName={formCountryName}
					setCountry={setFormCountry}
					setCountryName={setFormCountryName}
					day={formDay}
					setDay={setFormDay}
					month={formMonth}
					setMonth={setFormMonth}
					year={formYear}
					setYear={setFormYear}
					confirmed={formConfirmed}
					setConfirmed={setFormConfirmed}
				/>
			</View>

			<View style={{ marginTop: 8 }}>

				<KYCStep
					title="Documento de identidad"
					description="Toma una foto clara del documento (anverso)"
					done={documentUploaded}
					onPress={() => openCapture('document')}
					theme={theme}
					textStyles={textStyles}
				/>

				<KYCStep
					title="Selfie"
					description="Toma una selfie mirando a la cámara"
					done={selfieUploaded}
					onPress={() => openCapture('selfie')}
					theme={theme}
					textStyles={textStyles}
				/>

			</View>

			<View style={[containerStyles.bottomButtonContainer, { marginTop: 16, gap: 8 }]}>
				<QPButton
					title="Enviar verificación"
					onPress={submitVerification}
					loading={submittingInfo}
					textStyle={{ color: theme.colors.almostWhite }}
				/>
			</View>

			<CaptureModal
				visible={isCaptureOpen}
				type={captureType}
				onClose={() => setIsCaptureOpen(false)}
				onCaptured={async (uri) => {
					setIsCaptureOpen(false)
					await handleUpload(uri, captureType)
				}}
				theme={theme}
			/>

		</ScrollView>
	)
}

// KYC step
const KYCStep = ({ title, description, done, onPress, theme, textStyles }) => {
	const containerStyles = createContainerStyles(theme)
	return (
		<Pressable onPress={onPress}>
			<View style={[containerStyles.card, { borderColor: done ? theme.colors.success : theme.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
				<View style={{ flex: 1 }}>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText }]}>{title}</Text>
					<Text style={[textStyles.caption, { color: theme.colors.secondaryText, marginTop: 4 }]}>{description}</Text>
				</View>
				<FontAwesome6 name="camera" size={20} color={done ? theme.colors.success : theme.colors.primaryText} iconStyle="solid" />
			</View>
		</Pressable>
	)
}

// Capture modal
const CaptureModal = ({ visible, onClose, onCaptured, type, theme }) => {

	const cameraRef = useRef(null)
	const device = useCameraDevice(type === 'document' ? 'back' : 'front')
	const { hasPermission, requestPermission } = useCameraPermission()

	useEffect(() => { if (visible) { requestPermission() } }, [visible])

	const takePhoto = async () => {
		if (!cameraRef.current) return
		try {
			const photo = await cameraRef.current.takePhoto({ flash: 'off' })
			const path = photo?.path || ''
			const uri = path.startsWith('file://') ? path : `file://${path}`
			onCaptured(uri)
		} catch (e) { Toast.show({ type: 'error', text1: 'No se pudo tomar la foto', text2: e.message }) }
	}

	return (
		<Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
			<View style={[styles.modalContainer, { backgroundColor: 'black' }]}>

				{hasPermission ? (
					device ? (
						<Camera
							ref={cameraRef}
							style={StyleSheet.absoluteFill}
							device={device}
							isActive={visible}
							photo
						/>
					) : (
						<View style={[styles.center, { flex: 1 }]}>
							<Text style={{ color: 'white' }}>No se encontró la cámara</Text>
						</View>
					)
				) : (
					<View style={[styles.center, { flex: 1 }]}>
						<Text style={{ color: 'white' }}>Se requiere permiso de cámara para tomar fotos</Text>
						<QPButton title="Otorgar permiso" onPress={requestPermission} style={{ marginTop: 12, backgroundColor: theme.colors.primary }} textStyle={{ color: 'white' }} />
					</View>
				)}

				{/* Guide overlay */}
				<View style={styles.guideWrapper} pointerEvents="none">
					{type === 'selfie' ? (<View style={styles.guideCircle}></View>) : (<View style={styles.guideRect} />)}
				</View>

				{/* Instruction text */}
				<View style={styles.instructionWrapper}>
					<Text style={{ color: 'white', textAlign: 'center' }}>
						{type === 'selfie' ? 'Centra tu rostro dentro del círculo.' : 'Coloca tu documento dentro del rectángulo y mantén el dispositivo quieto.'}
					</Text>
				</View>

				{/* Capture button */}
				<Pressable onPress={takePhoto} style={styles.captureButton} hitSlop={10}>
					<View style={styles.captureInner} />
					<FontAwesome6 name="camera" size={20} color={'#000'} iconStyle="solid" style={styles.captureIcon} />
				</Pressable>

				{/* Close button */}
				<View style={styles.modalTopBar}>
					<Pressable onPress={onClose} style={styles.topButton} hitSlop={10}><Text style={{ color: 'white', fontSize: 16 }}>Cerrar</Text></Pressable>
					<View style={styles.topButton} />
				</View>

			</View>
		</Modal>
	)
}

// KYC info form
const KYCInfoForm = ({ theme, textStyles, country, countryName, setCountry, setCountryName, day, setDay, month, setMonth, year, setYear, confirmed, setConfirmed }) => {

	const [selectedCountryName, setSelectedCountryName] = useState(countryName || '')
	const [isCountryOpen, setIsCountryOpen] = useState(false)

	return (
		<View style={{ gap: 12 }}>
			<Text style={{ color: theme.colors.secondaryText }}>País de residencia</Text>
			<Pressable onPress={() => setIsCountryOpen(true)}>
				<View style={[styles.listLikeInput, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
					<Text style={{ color: country ? theme.colors.primaryText : theme.colors.tertiaryText }}>
						{country ? `${selectedCountryName || countryName} (${country})` : 'Selecciona un país'}
					</Text>
				</View>
			</Pressable>

			<Text style={{ color: theme.colors.secondaryText }}>Fecha de nacimiento</Text>
			<View style={{ flexDirection: 'row', gap: 8 }}>
				<View style={{ flex: 1 }}>
					<QPInput
						placeholder="Día"
						value={day}
						onChangeText={(t) => setDay(t.replace(/[^0-9]/g, '').slice(0, 2))}
						keyboardType="number-pad"
					/>
				</View>
				<View style={{ flex: 1 }}>
					<QPInput
						placeholder="Mes"
						value={month}
						onChangeText={(t) => setMonth(t.replace(/[^0-9]/g, '').slice(0, 2))}
						keyboardType="number-pad"
					/>
				</View>
				<View style={{ flex: 2 }}>
					<QPInput
						placeholder="Año"
						value={year}
						onChangeText={(t) => setYear(t.replace(/[^0-9]/g, '').slice(0, 4))}
						keyboardType="number-pad"
					/>
				</View>
			</View>

			<CountryPickerModal
				visible={isCountryOpen}
				onClose={() => setIsCountryOpen(false)}
				onSelect={(c) => { setCountry(c.code); setSelectedCountryName(c.name); setCountryName && setCountryName(c.name); setIsCountryOpen(false) }}
				theme={theme}
				textStyles={textStyles}
			/>
		</View>
	)
}

// Country picker modal
const CountryPickerModal = ({ visible, onClose, onSelect, theme, textStyles }) => {

	const [query, setQuery] = useState('')
	const filtered = countries.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.code.toLowerCase().includes(query.toLowerCase()))

	const renderItem = ({ item }) => (
		<Pressable onPress={() => onSelect(item)} style={[styles.countryItem, { borderColor: theme.colors.border }]}>
			<Text style={[textStyles.body, { color: theme.colors.primaryText }]}>{item.name}</Text>
			<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{item.code}</Text>
		</Pressable>
	)

	return (
		<Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
			<View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
				<View style={{ paddingHorizontal: 10, paddingVertical: 5 }}>
					<QPInput
						style={{ width: '100%' }}
						value={query}
						onChangeText={setQuery}
						placeholder="Buscar país o código"
						prefixIconName="magnifying-glass"
					/>
				</View>
				<FlatList
					data={filtered}
					renderItem={renderItem}
					style={{ flex: 1, width: '100%', paddingHorizontal: 10 }}
					keyExtractor={(item) => item.code}
					contentContainerStyle={{ padding: 10, paddingBottom: 40 }}
				/>
			</View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	center: {
		justifyContent: 'center',
		alignItems: 'center',
	},
	stepContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 16,
		borderRadius: 16,
		borderWidth: 1,
		gap: 12
	},
	modalContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center'
	},
	modalTopBar: {
		position: 'absolute',
		top: Platform.OS === 'ios' ? 60 : 20,
		left: 16,
		right: 16,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center'
	},
	modalBottomBar: {
		position: 'absolute',
		left: 16,
		right: 16,
		bottom: 40
	},
	topButton: {
		paddingHorizontal: 8,
		paddingVertical: 6,
		backgroundColor: 'rgba(0,0,0,0.4)',
		borderRadius: 8
	},
	guideWrapper: {
		position: 'absolute',
		top: 120,
		left: 0,
		right: 0,
		alignItems: 'center'
	},
	guideCircle: {
		width: 260,
		height: 260,
		borderRadius: 130,
		borderWidth: 3,
		borderStyle: 'dashed',
		borderColor: 'rgba(255,255,255,0.8)',
		alignItems: 'center',
		justifyContent: 'center'
	},
	foreheadBar: {
		position: 'absolute',
		top: 40,
		width: 180,
		height: 8,
		borderRadius: 4,
		backgroundColor: 'rgba(255,255,255,0.85)'
	},
	guideRect: {
		width: 280,
		height: 180,
		borderRadius: 16,
		borderWidth: 3,
		borderStyle: 'dashed',
		borderColor: 'rgba(255,255,255,0.8)'
	},
	instructionWrapper: {
		position: 'absolute',
		bottom: 140,
		left: 20,
		right: 20
	},
	holdStillPill: {
		position: 'absolute',
		top: 80,
		alignSelf: 'center',
		backgroundColor: 'rgba(0,0,0,0.4)',
		borderRadius: 16,
		paddingHorizontal: 12,
		paddingVertical: 6
	},
	captureButton: {
		position: 'absolute',
		bottom: 50,
		alignSelf: 'center',
		width: 70,
		height: 70,
		borderRadius: 35,
		backgroundColor: 'white',
		alignItems: 'center',
		justifyContent: 'center'
	},
	captureInner: {
		position: 'absolute',
		width: 62,
		height: 62,
		borderRadius: 31,
		borderWidth: 2,
		borderColor: '#000',
		opacity: 0.2
	},
	captureIcon: {
		position: 'absolute'
	},
	listLikeInput: {
		borderRadius: 10,
		borderWidth: 1,
		paddingHorizontal: 15,
		height: 50,
		justifyContent: 'center',
		marginVertical: 5
	},
	countryItem: {
		borderWidth: 1,
		borderRadius: 10,
		padding: 12,
		marginBottom: 8,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center'
	}
})

export default KYC