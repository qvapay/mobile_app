import React, { useState, useRef, useEffect } from 'react'
import { Camera, useCameraDevice, useCodeScanner, useCameraPermission } from 'react-native-vision-camera'
import { View, Text, StyleSheet, Dimensions, Animated, Alert, Linking, Pressable } from 'react-native'

// Theme Context
import { useTheme } from '../../theme/ThemeContext'
import { useContainerStyles, useTextStyles } from '../../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Routes
import { ROUTES } from '../../routes'

// UI Components
import QPButton from '../../ui/particles/QPButton'

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')
const SCAN_AREA_SIZE = Math.min(screenWidth * 0.8, 300)

// Scan Screen
const Scan = ({ navigation }) => {

	// Context
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const containerStyles = useContainerStyles(theme)

	// Camera
	const device = useCameraDevice('back')
	console.log('device', device)
	const { hasPermission, requestPermission } = useCameraPermission()
	console.log('hasPermission', hasPermission)

	// State
	const [isScanning, setIsScanning] = useState(true)
	const [scannedData, setScannedData] = useState(null)
	const [isTorchEnabled, setIsTorchEnabled] = useState(false)

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

	// Check if has permission
	if (!hasPermission) {
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

	if (!device) {
		return (
			<View style={[containerStyles.container, containerStyles.center]}>
				<Text style={textStyles.h4}>Cámara no disponible</Text>
				<FontAwesome6 name="heart-crack" size={64} color={theme.colors.tertiaryText} iconStyle="solid" />
			</View>
		)
	}

	return (
		<View style={[containerStyles.container]}>

			{/* Camera View */}
			<Camera
				style={StyleSheet.absoluteFillObject}
				device={device}
				isActive={isScanning}
				codeScanner={codeScanner}
				torch={isTorchEnabled ? 'on' : 'off'}
			/>

			{/* Custom Overlay */}
			<View style={styles.overlay}>

				{/* Top overlay */}
				<View style={[styles.overlaySection, { height: (screenHeight - SCAN_AREA_SIZE) / 2 }]} />

				{/* Middle section with scan area */}
				<View style={styles.middleSection}>

					{/* Left overlay */}
					<View style={[styles.overlaySection, { width: (screenWidth - SCAN_AREA_SIZE) / 2 }]} />

					{/* Scan area */}
					<View style={styles.scanArea}>

						{/* Corner indicators */}
						<View style={[styles.corner, styles.topLeft]} />
						<View style={[styles.corner, styles.topRight]} />
						<View style={[styles.corner, styles.bottomLeft]} />
						<View style={[styles.corner, styles.bottomRight]} />

						{/* Scanning line */}
						{isScanning && (<Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, SCAN_AREA_SIZE - 2], }) }] }]} />)}
					</View>

					{/* Right overlay */}
					<View style={[styles.overlaySection, { width: (screenWidth - SCAN_AREA_SIZE) / 2 }]} />

				</View>

				{/* Bottom overlay */}
				<View style={[styles.overlaySection, { height: (screenHeight - SCAN_AREA_SIZE) / 2 }]} />

			</View>

			{/* Top Controls */}
			<View style={styles.topControls}>
				<Pressable onPress={() => navigation.goBack()} style={styles.topButton} hitSlop={10}>
					<FontAwesome6 name="arrow-left" size={20} color={'white'} iconStyle="solid" />
				</Pressable>
				<Pressable onPress={() => setIsTorchEnabled((prev) => !prev)} style={styles.topButton} hitSlop={10}>
					<FontAwesome6 name="lightbulb" size={20} color={'white'} iconStyle="solid" />
				</Pressable>
			</View>

			{/* Instructions */}
			<View style={styles.instructionsContainer}>
				<Text style={[textStyles.h5, { color: 'white', textAlign: 'center' }]}>
					Coloca el QR code dentro del marco
				</Text>
				<Text style={[textStyles.caption, { color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 5 }]}>
					El QR code será escaneado automáticamente
				</Text>
			</View>
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
	overlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	overlaySection: {
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
})

export default Scan
