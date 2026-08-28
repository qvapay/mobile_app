#!/usr/bin/env node

/**
 * Syncs version and versionCode from app.json (single source of truth)
 * to iOS project.pbxproj and package.json.
 *
 * Android reads app.json directly via Gradle, so no sync needed.
 *
 * Usage: node scripts/sync-version.js
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))

const versionName = appJson.version
const versionCode = appJson.versionCode

if (!versionName || !versionCode) {
	console.error('Missing version or versionCode in app.json')
	process.exit(1)
}

// Sync package.json version.
// Reemplazo TEXTUAL del primer `"version"` (el de nivel superior), como ya se
// hace con el pbxproj: un round-trip por JSON.parse + JSON.stringify reescribe
// el fichero ENTERO con la indentación de stringify (2 espacios) en vez de los
// tabs del repo, y convierte un bump de una línea en un diff de 250.
const packageJsonPath = path.join(root, 'package.json')
const packageJsonRaw = fs.readFileSync(packageJsonPath, 'utf8')
if (JSON.parse(packageJsonRaw).version !== versionName) {
	const patched = packageJsonRaw.replace(/"version":\s*"[^"]*"/, `"version": "${versionName}"`)
	// Red de seguridad: si el reemplazo textual fallara, no dejar el manifiesto
	// roto ni a medias — se sale con error en vez de escribir algo inválido
	let patchedVersion
	try { patchedVersion = JSON.parse(patched).version } catch { patchedVersion = null }
	if (patchedVersion !== versionName) {
		console.error('No se pudo actualizar "version" en package.json — revísalo a mano')
		process.exit(1)
	}
	fs.writeFileSync(packageJsonPath, patched, 'utf8')
	console.log(`Synced version: ${versionName} → package.json`)
}

// Sync iOS project.pbxproj
const pbxprojPath = path.join(root, 'ios', 'QvaPay.xcodeproj', 'project.pbxproj')
let pbxproj = fs.readFileSync(pbxprojPath, 'utf8')

pbxproj = pbxproj.replace(/MARKETING_VERSION = [\d.]+;/g, `MARKETING_VERSION = ${versionName};`)
pbxproj = pbxproj.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`)

fs.writeFileSync(pbxprojPath, pbxproj, 'utf8')

console.log(`Synced version: ${versionName} (${versionCode}) → iOS`)
