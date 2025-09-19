import React, { useState, useRef, useEffect } from 'react'
import { Camera, useCameraDevice, useCodeScanner, useCameraPermission } from 'react-native-vision-camera'
import { View, Text, StyleSheet, Dimensions, Animated, Alert, Linking, Pressable } from 'react-native'
import QRCodeStyled from 'react-native-qrcode-styled'

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

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')
const SCAN_AREA_SIZE = Math.min(screenWidth * 0.8, 300)

// Scan Screen
const Scan = ({ navigation }) => {

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
	const [viewMode, setViewMode] = useState('scan') // 'scan' | 'show'

	// Animation
	const scanLineAnimation = useRef(new Animated.Value(0)).current

	// Request permission
	useEffect(() => {
		requestPermission()
	}, [])

	// Start scanning animation
	useEffect(() => {
		if (isScanning) { startScanAnimation() }
	}, [isScanning])

	// Toggle camera based on mode
	useEffect(() => {
		setIsScanning(viewMode === 'scan')
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

		if (data && isScanning) {

			setIsScanning(false)
			setScannedData(data)
			console.log('QR Code scanned:', data)

			// Navigate to appropriate screen based on QR code content
			// For now, just show an alert
			Alert.alert(
				'QR Code Scanned',
				`Data: ${data}`,
				[
					{
						text: 'Scan Again',
						onPress: () => {
							setIsScanning(true)
							setScannedData(null)
						}
					},
					{
						text: 'Continue',
						onPress: () => {
							// Handle the scanned data - could navigate to payment screen
							navigation.goBack()
						}
					}
				]
			)
		}
	}

	// Code scanner
	const codeScanner = useCodeScanner({
		codeTypes: ['qr', 'ean-13'],
		onCodeScanned: (codes) => {
			if (codes.length > 0 && isScanning) {
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

	if (viewMode === 'scan' && !device) {
		return (
			<View style={[containerStyles.container, containerStyles.center]}>
				<Text style={textStyles.h4}>Cámara no disponible</Text>
				<FontAwesome6 name="heart-crack" size={64} color={theme.colors.tertiaryText} iconStyle="solid" />
			</View>
		)
	}

	return (
		<View style={[containerStyles.container]}>

			{/* Camera View (Scan mode) */}
			{viewMode === 'scan' && (
				<Camera
					style={StyleSheet.absoluteFillObject}
					device={device}
					isActive={isScanning}
					codeScanner={codeScanner}
					torch={isTorchEnabled ? 'on' : 'off'}
				/>
			)}

			{viewMode === 'scan' && (
				<View style={styles.overlay}>
					<View style={[styles.overlaySection, { height: (screenHeight - SCAN_AREA_SIZE) / 2 }]} />
					<View style={styles.middleSection}>
						<View style={[styles.overlaySection, { width: (screenWidth - SCAN_AREA_SIZE) / 2 }]} />
						<View style={styles.scanArea}>
							<View style={[styles.corner, styles.topLeft]} />
							<View style={[styles.corner, styles.topRight]} />
							<View style={[styles.corner, styles.bottomLeft]} />
							<View style={[styles.corner, styles.bottomRight]} />
							{isScanning && (<Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, SCAN_AREA_SIZE - 2], }) }] }]} />)}
						</View>
						<View style={[styles.overlaySection, { width: (screenWidth - SCAN_AREA_SIZE) / 2 }]} />
					</View>
					<View style={[styles.overlaySection, { height: (screenHeight - SCAN_AREA_SIZE) / 2 }]} />
				</View>
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
							data={user?.username ? `https://qvapay.com/@${user.username}` : (user?.uuid || 'qvapay:user')}
							size={350}
							pieceScale={0.7}
							style={{ backgroundColor: theme.colors.background, borderRadius: 10 }}
							padding={10}
							pieceSize={8}
							backgroundColor={'transparent'}
							color={theme.colors.primaryText}
						/>
						{user?.username && (<Text style={[textStyles.h6, { color: theme.colors.primaryText, textAlign: 'center', marginTop: 10 }]}>@{user.username}</Text>)}
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
	overlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	overlaySection: {
		backgroundColor: 'rgba(0, 0, 0, 0.8)',
	},
	middleSection: {
		flexDirection: 'row',
		height: SCAN_AREA_SIZE,
	},
	scanArea: {
		width: SCAN_AREA_SIZE,
		height: SCAN_AREA_SIZE,
		position: 'relative',
	},
	corner: {
		position: 'absolute',
		width: 20,
		height: 20,
		borderColor: '#6759EF',
		borderWidth: 3,
	},
	topLeft: {
		top: 0,
		left: 0,
		borderRightWidth: 0,
		borderBottomWidth: 0,
		borderTopLeftRadius: 8,
	},
	topRight: {
		top: 0,
		right: 0,
		borderLeftWidth: 0,
		borderBottomWidth: 0,
		borderTopRightRadius: 8,
	},
	bottomLeft: {
		bottom: 0,
		left: 0,
		borderRightWidth: 0,
		borderTopWidth: 0,
		borderBottomLeftRadius: 8,
	},
	bottomRight: {
		bottom: 0,
		right: 0,
		borderLeftWidth: 0,
		borderTopWidth: 0,
		borderBottomRightRadius: 8,
	},
	scanLine: {
		position: 'absolute',
		left: 0,
		right: 0,
		height: 2,
		backgroundColor: '#6759EF',
		opacity: 0.8,
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
})

export default Scan
