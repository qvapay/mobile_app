import { Platform } from 'react-native'

/** Liquid glass (tabs y headers nativos translúcidos) requiere iOS 26+. Una sola definición para toda la app. */
export const supportsLiquidGlass = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26
