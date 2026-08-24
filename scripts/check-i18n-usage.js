#!/usr/bin/env node
/**
 * Verificador de USO vs CATÁLOGO (npm run i18n:usage): escanea el código
 * buscando claves LITERALES pasadas a t()/i18n.t() y falla (exit 1) si alguna
 * no existe en el bundle español (una clave sin registrar se renderizaría
 * cruda en la UI). Complementa a check-i18n.js (que solo compara es↔en).
 *
 * Las claves dinámicas (template literals con ${}) no se pueden verificar
 * estáticamente: se cuentan y listan aparte a título informativo.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const LOCALES_ES = path.join(ROOT, 'i18n', 'locales', 'es')
const SCAN_DIRS = ['screens', 'ui', 'auth', 'api', 'hooks', 'helpers', 'settings', 'lock', 'theme', 'loading', 'nearby']
const SCAN_FILES = ['App.tsx', 'helpers.js', 'routes.js', 'linking.js']
const DOMAINS = fs.readdirSync(LOCALES_ES).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))

const flatten = (obj, prefix = '', out = {}) => {
	for (const [key, value] of Object.entries(obj)) {
		const full = prefix ? `${prefix}.${key}` : key
		if (value && typeof value === 'object') { flatten(value, full, out) } else { out[full] = true }
	}
	return out
}

// Catálogo es aplanado con el dominio como prefijo (igual que resources.js)
const catalog = {}
for (const domain of DOMAINS) {
	const flat = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES_ES, `${domain}.json`), 'utf8')))
	for (const key of Object.keys(flat)) { catalog[`${domain}.${key}`] = true }
}

const keyExists = (key) => catalog[key] || catalog[`${key}_one`] || catalog[`${key}_other`]

const DOMAIN_PREFIX = new Set(DOMAINS)
// t('dominio.a.b'), i18n.t("dominio.a.b"), tr(`dominio.a.b`) — solo claves estáticas
const LITERAL_RE = /\b(?:i18n\.)?tr?\(\s*(['"`])([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)+)\1/g
// t(`dominio.${...}`) — dinámicas, solo informativas
const DYNAMIC_RE = /\b(?:i18n\.)?tr?\(\s*`([a-z][a-zA-Z0-9]*\.[^`]*\$\{[^`]*)`/g

const listFiles = (dir) => {
	const out = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name.startsWith('.')) { continue }
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) { out.push(...listFiles(full)) }
		else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) { out.push(full) }
	}
	return out
}

const files = SCAN_FILES.map((f) => path.join(ROOT, f)).filter(fs.existsSync)
for (const dir of SCAN_DIRS) {
	const full = path.join(ROOT, dir)
	if (fs.existsSync(full)) { files.push(...listFiles(full)) }
}

let missing = 0
let checked = 0
const dynamic = []
for (const file of files) {
	const source = fs.readFileSync(file, 'utf8')
	const lines = source.split('\n')
	for (let i = 0; i < lines.length; i++) {
		LITERAL_RE.lastIndex = 0
		let match
		while ((match = LITERAL_RE.exec(lines[i])) !== null) {
			const key = match[2]
			// Solo claves cuyo primer segmento es un dominio del catálogo
			if (!DOMAIN_PREFIX.has(key.split('.')[0])) { continue }
			checked += 1
			if (!keyExists(key)) {
				missing += 1
				console.error(`  ✗ clave sin registrar: ${key}  (${path.relative(ROOT, file)}:${i + 1})`)
			}
		}
		DYNAMIC_RE.lastIndex = 0
		if (DYNAMIC_RE.test(lines[i])) { dynamic.push(`${path.relative(ROOT, file)}:${i + 1}`) }
	}
}

if (dynamic.length > 0) {
	console.log(`ℹ ${dynamic.length} claves dinámicas (no verificables estáticamente):`)
	for (const site of dynamic) { console.log(`    ${site}`) }
}

if (missing > 0) {
	console.error(`\ni18n:usage FALLÓ — ${missing} clave(s) usadas sin registrar (de ${checked} verificadas).`)
	process.exit(1)
}
console.log(`i18n:usage OK — ${checked} claves literales verificadas contra el catálogo es.`)
