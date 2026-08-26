declare module '*.svg' {
	import React from 'react'
	import { SvgProps } from 'react-native-svg'
	const content: React.FC<SvgProps>
	export default content
}

// react-native-version-check no publica typings — superficie mínima usada por
// helpers/versionCheck.ts (declarada aquí, no en types/, porque es ambient).
declare module 'react-native-version-check' {
	type VersionCheckStoreOptions = {
		provider?: string
		packageName?: string
		bundleId?: string
		appID?: string
		appName?: string
		country?: string
		ignoreErrors?: boolean
	}
	type VersionCheckNeedUpdateResult = {
		isNeeded: boolean
		currentVersion?: string
		latestVersion?: string
		storeUrl?: string
	}
	const VersionCheck: {
		getCurrentVersion(): string
		getCurrentBuildNumber(): string | number
		getLatestVersion(options?: VersionCheckStoreOptions): Promise<string>
		getStoreUrl(options?: VersionCheckStoreOptions): Promise<string>
		needUpdate(options?: VersionCheckStoreOptions & { currentVersion?: string, latestVersion?: string, depth?: number }): Promise<VersionCheckNeedUpdateResult>
	}
	export default VersionCheck
}
