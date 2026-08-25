// Bridge to the custom `AppIconChanger` native module (GOLD "Ícono de la app").
// iOS switches between the alternate appiconsets compiled from the asset
// catalog (setAlternateIconName, with its unavoidable system alert); Android
// toggles the launcher activity-aliases declared in the manifest. Unlike
// widgetBridge, `changeAppIcon` RETHROWS on failure: the caller must not
// persist a selection the OS rejected.
import { NativeModules, Platform } from 'react-native'

const { AppIconChanger } = NativeModules

/**
 * Catalog of selectable app icons. `id` is the persisted settings value and the
 * Android alias key; `iosName` is the alternate appiconset name compiled into
 * the app bundle; `preview` feeds the picker tiles in Settings → Theme.
 * Names live in i18n under `settings.themePanel.icons.<id>`.
 */
export const APP_ICONS = [
	{ id: 'default', iosName: 'default', preview: require('../assets/images/icons/icon-preview-default.png') },
	{ id: 'midnight', iosName: 'AppIconMidnight', preview: require('../assets/images/icons/icon-preview-midnight.png') },
	{ id: 'gold', iosName: 'AppIconGold', preview: require('../assets/images/icons/icon-preview-gold.png') },
	{ id: 'ocean', iosName: 'AppIconOcean', preview: require('../assets/images/icons/icon-preview-ocean.png') },
	{ id: 'pink', iosName: 'AppIconPink', preview: require('../assets/images/icons/icon-preview-pink.png') },
	{ id: 'navidad', iosName: 'AppIconNavidad', preview: require('../assets/images/icons/icon-preview-navidad.png') },
	{ id: 'halloween', iosName: 'AppIconHalloween', preview: require('../assets/images/icons/icon-preview-halloween.png') },
	{ id: 'blackfriday', iosName: 'AppIconBlackFriday', preview: require('../assets/images/icons/icon-preview-blackfriday.png') },
]

/**
 * Applies an app icon on the device.
 * Rethrows on failure so the caller can skip persisting and toast the error.
 * @param {string} id - Icon id from `APP_ICONS`.
 */
export const changeAppIcon = async (id) => {
	const icon = APP_ICONS.find(i => i.id === id)
	if (!icon) throw new Error(`Unknown app icon: ${id}`)
	if (!AppIconChanger?.changeIcon) throw new Error('AppIconChanger module unavailable')
	await AppIconChanger.changeIcon(Platform.OS === 'ios' ? icon.iosName : icon.id)
}

/**
 * Resolves the icon currently active on the device to its catalog id.
 * @returns {Promise<string>} Icon id; 'default' when the module is missing or errors.
 */
export const getAppIcon = async () => {
	try {
		if (!AppIconChanger?.getIcon) return 'default'
		const current = await AppIconChanger.getIcon()
		const icon = APP_ICONS.find(i => (Platform.OS === 'ios' ? i.iosName : i.id) === current)
		return icon?.id || 'default'
	} catch (error) {
		return 'default'
	}
}
