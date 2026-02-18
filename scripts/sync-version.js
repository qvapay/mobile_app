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

// Sync package.json version
const packageJsonPath = path.join(root, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
if (packageJson.version !== versionName) {
	packageJson.version = versionName
	fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8')
	console.log(`Synced version: ${versionName} → package.json`)
}

// Sync iOS project.pbxproj
const pbxprojPath = path.join(root, 'ios', 'QvaPay.xcodeproj', 'project.pbxproj')
let pbxproj = fs.readFileSync(pbxprojPath, 'utf8')

pbxproj = pbxproj.replace(/MARKETING_VERSION = [\d.]+;/g, `MARKETING_VERSION = ${versionName};`)
pbxproj = pbxproj.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`)

fs.writeFileSync(pbxprojPath, pbxproj, 'utf8')

console.log(`Synced version: ${versionName} (${versionCode}) → iOS`)
