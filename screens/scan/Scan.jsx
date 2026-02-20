import React, { useState, useRef, useEffect } from 'react'
import { View, Text, StyleSheet, Dimensions, Animated, Alert, Linking, Pressable } from 'react-native'
import Svg, { Path } from 'react-native-svg'

// QR Code
import QRCodeStyled from 'react-native-qrcode-styled'

// camera
import { Camera, useCameraDevice, useCodeScanner, useCameraPermission } from 'react-native-vision-camera'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// UI Components
import QPButton from '../../ui/particles/QPButton'
import QPSwitch from '../../ui/particles/QPSwitch'
import ProfileContainer from '../../ui/ProfileContainer'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// Helpers
import { parseQRData } from '../../helpers'

// Routes
import { ROUTES } from '../../routes'

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')
const SCAN_AREA_SIZE = Math.min(screenWidth * 0.8, 300)
const CUTOUT_R = 22
const CUTOUT_X = (screenWidth - SCAN_AREA_SIZE) / 2
const CUTOUT_Y = (screenHeight - SCAN_AREA_SIZE) / 2

// SVG path: full-screen rect with a rounded-rect hole (evenodd)
const OVERLAY_PATH = [
	// Outer rect (clockwise)
	`M0,0 H${screenWidth} V${screenHeight} H0 Z`,
	// Inner rounded rect (counter-clockwise for evenodd cutout)
	`M${CUTOUT_X + CUTOUT_R},${CUTOUT_Y}`,
	`H${CUTOUT_X + SCAN_AREA_SIZE - CUTOUT_R}`,
	`Q${CUTOUT_X + SCAN_AREA_SIZE},${CUTOUT_Y} ${CUTOUT_X + SCAN_AREA_SIZE},${CUTOUT_Y + CUTOUT_R}`,
	`V${CUTOUT_Y + SCAN_AREA_SIZE - CUTOUT_R}`,
	`Q${CUTOUT_X + SCAN_AREA_SIZE},${CUTOUT_Y + SCAN_AREA_SIZE} ${CUTOUT_X + SCAN_AREA_SIZE - CUTOUT_R},${CUTOUT_Y + SCAN_AREA_SIZE}`,
	`H${CUTOUT_X + CUTOUT_R}`,
	`Q${CUTOUT_X},${CUTOUT_Y + SCAN_AREA_SIZE} ${CUTOUT_X},${CUTOUT_Y + SCAN_AREA_SIZE - CUTOUT_R}`,
	`V${CUTOUT_Y + CUTOUT_R}`,
	`Q${CUTOUT_X},${CUTOUT_Y} ${CUTOUT_X + CUTOUT_R},${CUTOUT_Y}`,
	'Z',
].join(' ')

// Scan Screen
const Scan = ({ navigation, route }) => {

	// User
	const { user } = useAuth()

	// Context
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	// Camera
	const device = useCameraDevice('back')
	const { hasPermission, requestPermission } = useCameraPermission()

	// State
	const [isScanning, setIsScanning] = useState(true)
	const [scannedData, setScannedData] = useState(null)
	const [isTorchEnabled, setIsTorchEnabled] = useState(false)
	const [viewMode, setViewMode] = useState(route.params?.view || 'scan') // 'scan' | 'show'

	// Ref to avoid stale closure in onCodeScanned callback
	const isScanningRef = useRef(true)

	// Animation
	const scanLineAnimation = useRef(new Animated.Value(0)).current

	// Request permission
	useEffect(() => {
		requestPermission()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Start scanning animation
	useEffect(() => {
		if (isScanning) { startScanAnimation() }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isScanning])

	// Toggle camera based on mode
	useEffect(() => {
		const scanning = viewMode === 'scan'
		isScanningRef.current = scanning
		setIsScanning(scanning)
		if (viewMode !== 'scan') { setIsTorchEnabled(false) }
	}, [viewMode])

	// Start scanning animation
	const startScanAnimation = () => {
		Animated.loop(
			Animated.sequence([
				Animated.timing(scanLineAnimation, { toValue: 1, duration: 2000, useNativeDriver: true }),
				Animated.timing(scanLineAnimation, { toValue: 0, duration: 2000, useNativeDriver: true })
			])
		).start()
	}

	// Handle barcode scanned
	const handleBarcodeScanned = (data) => {

		if (!data || !isScanningRef.current) return

		// Lock immediately via ref (sync) to prevent rapid-fire duplicates
		isScanningRef.current = false
		setIsScanning(false)
		setScannedData(data)

		const parsedData = parseQRData(data)

		if (parsedData?.type === 'payme') {
			if (parsedData?.username && !parsedData?.amount) {
				navigation.navigate(ROUTES.SEND, { user_uuid: parsedData.username })
			} else if (parsedData?.uuid && !parsedData?.amount) {
				navigation.navigate(ROUTES.SEND, { user_uuid: parsedData.uuid })
			} else if (parsedData?.username && parsedData?.amount) {
				navigation.navigate(ROUTES.SEND_CONFIRM, { user_uuid: parsedData.username, send_amount: parsedData.amount })
			} else if (parsedData?.uuid && parsedData?.amount) {
				navigation.navigate(ROUTES.SEND_CONFIRM, { user_uuid: parsedData.uuid, send_amount: parsedData.amount })
			}
		}

		// Re-enable scanning after a short delay (allows navigation to complete)
		setTimeout(() => {
			isScanningRef.current = true
			setIsScanning(true)
			setScannedData(null)
		}, 2000)
	}

	// Code scanner — uses ref to avoid stale closure issues
	const codeScanner = useCodeScanner({
		codeTypes: ['qr', 'ean-13'],
		onCodeScanned: (codes) => {
			if (codes.length > 0 && isScanningRef.current) {
				handleBarcodeScanned(codes[0].value)
			}
		},
	})

	// Check if has permission (only when scanning)
	if (viewMode === 'scan' && !hasPermission) {
		return (
			<View style={[containerStyles.container, containerStyles.center]}>
				<Text style={textStyles.h4}>Permiso de cámara requerido</Text>
				<Text style={[textStyles.caption, { textAlign: 'center', marginTop: 10 }]}>Por favor permite el acceso a la cámara para escanear QR</Text>
				<QPButton
					title="Ajustes"
					onPress={() => Linking.openSettings()}
					style={{ marginTop: 20, backgroundColor: 'transparent' }}
					textStyle={{ color: theme.colors.almostWhite }}
					icon="gear"
					iconStyle="solid"
					iconColor="white"
				/>
			</View>
		)
	}

	return (
		<View style={[containerStyles.container]}>

			{/* Camera View (Scan mode) */}
			{viewMode === 'scan' && device && (
				<Camera
					style={StyleSheet.absoluteFillObject}
					device={device}
					isActive={isScanning}
					codeScanner={codeScanner}
					torch={isTorchEnabled ? 'on' : 'off'}
				/>
			)}

			{viewMode === 'scan' && (
				<>
					{/* Dark overlay with rounded cutout */}
					<Svg width={screenWidth} height={screenHeight} style={StyleSheet.absoluteFillObject}>
						<Path d={OVERLAY_PATH} fill="rgba(0,0,0,0.8)" fillRule="evenodd" />
					</Svg>

					{/* Corner brackets + scan line */}
					<View style={styles.scanFrame}>
						<View style={[styles.corner, styles.topLeft]} />
						<View style={[styles.corner, styles.topRight]} />
						<View style={[styles.corner, styles.bottomLeft]} />
						<View style={[styles.corner, styles.bottomRight]} />
						{isScanning && (<Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineAnimation.interpolate({ inputRange: [0, 1], outputRange: [16, SCAN_AREA_SIZE - 16], }) }] }]} />)}
					</View>
				</>
			)}

			{/* Top Controls */}
			<View style={styles.topControls}>
				<Pressable onPress={() => navigation.goBack()} style={styles.topButton} hitSlop={10}>
					<FontAwesome6 name="arrow-left" size={20} color={'white'} iconStyle="solid" />
				</Pressable>
				<View style={styles.topSwitchWrapper}>
					<QPSwitch
						value={viewMode === 'scan' ? 'left' : 'right'}
						onChange={(side) => setViewMode(side === 'left' ? 'scan' : 'show')}
						leftText="Scan QR"
						rightText="Mi QR"
						leftColor={theme.colors.primary}
						rightColor={theme.colors.primary}
					/>
				</View>
				<Pressable onPress={() => setIsTorchEnabled((prev) => !prev)} style={[styles.topButton, viewMode !== 'scan' && { opacity: 0.5 }]} hitSlop={10} disabled={viewMode !== 'scan'}>
					<FontAwesome6 name="lightbulb" size={20} color={'white'} iconStyle="solid" />
				</Pressable>
			</View>

			{/* Instructions or My QR */}
			{viewMode === 'scan' ? (
				<View style={styles.instructionsContainer}>
					<Text style={[textStyles.h5, { color: 'white', textAlign: 'center' }]}>Coloca el QR code dentro del marco</Text>
					<Text style={[textStyles.caption, { color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 5 }]}>El QR code será escaneado automáticamente</Text>
				</View>
			) : (
				<View style={styles.showQRContainer}>
					<View style={styles.profileWrapper}>
						<ProfileContainer user={user || {}} />
					</View>
					<View style={styles.qrWrapper}>
						<QRCodeStyled
							data={user?.username ? `https://www.qvapay.com/payme/${user.username}` : (`https://www.qvapay.com/payme/${user?.uuid}` || '')}
							style={[styles.svg, { backgroundColor: '#FFFFFF' }]}
							size={350}
							padding={8}
							pieceSize={8}
							isPiecesGlued
							pieceBorderRadius={2}
							pieceCornerType={'cut'}
							errorCorrectionLevel={'H'}
							preserveAspectRatio="none"
							backgroundColor={'#FFFFFF'}
							color={'#000000'}
							outerEyesOptions={{
								borderRadius: 2,
								color: theme.colors.primary,
							}}
						/>
						<Text style={[textStyles.caption, { color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 10 }]}>
							{user?.username ? `www.qvapay.com/payme/${user.username}` : `www.qvapay.com/payme/${user?.uuid}`}
						</Text>
					</View>
				</View>
			)}

		</View>
	)
}

const styles = StyleSheet.create({
	topControls: {
		position: 'absolute',
		top: 60,
		left: 16,
		right: 16,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	topButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: 'rgba(0,0,0,0.4)',
		justifyContent: 'center',
		alignItems: 'center',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.2)',
	},
	topSwitchWrapper: {
		flex: 1,
		marginHorizontal: 12,
	},
	modeSwitchContainer: {
		position: 'absolute',
		bottom: 30,
		left: 20,
		right: 20,
	},
	scanFrame: {
		position: 'absolute',
		top: CUTOUT_Y,
		left: CUTOUT_X,
		width: SCAN_AREA_SIZE,
		height: SCAN_AREA_SIZE,
	},
	corner: {
		position: 'absolute',
		width: 56,
		height: 56,
		borderColor: '#6759EF',
		borderWidth: 4,
	},
	topLeft: {
		top: -2,
		left: -2,
		borderRightWidth: 0,
		borderBottomWidth: 0,
		borderTopLeftRadius: 22,
	},
	topRight: {
		top: -2,
		right: -2,
		borderLeftWidth: 0,
		borderBottomWidth: 0,
		borderTopRightRadius: 22,
	},
	bottomLeft: {
		bottom: -2,
		left: -2,
		borderRightWidth: 0,
		borderTopWidth: 0,
		borderBottomLeftRadius: 22,
	},
	bottomRight: {
		bottom: -2,
		right: -2,
		borderLeftWidth: 0,
		borderTopWidth: 0,
		borderBottomRightRadius: 22,
	},
	scanLine: {
		position: 'absolute',
		left: 10,
		right: 10,
		height: 2,
		backgroundColor: '#6759EF',
		opacity: 0.6,
	},
	instructionsContainer: {
		position: 'absolute',
		bottom: 100,
		left: 20,
		right: 20,
	},
	showQRContainer: {
		position: 'absolute',
		top: 150,
		left: 20,
		right: 20,
		alignItems: 'center',
	},
	profileWrapper: {
		marginBottom: 10,
	},
	qrWrapper: {
		alignItems: 'center',
		justifyContent: 'center',
	},
	svg: {
		borderRadius: 16,
		overflow: 'hidden',
	},
})

export default Scan
