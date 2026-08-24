#!/usr/bin/env node
/**
 * Guardarraíl de paridad i18n (npm run i18n:check): compara es/ contra en/
 * por archivo de dominio y falla (exit 1) ante claves faltantes o sobrantes,
 * sets de {{placeholders}} distintos para la misma clave, y pares de plural
 * (_one/_other) incompletos en cualquiera de los dos idiomas.
 */
const fs = require('fs')
const path = require('path')

const LOCALES_DIR = path.join(__dirname, '..', 'i18n', 'locales')
const BASE = 'es'
const OTHERS = ['en']

const flatten = (obj, prefix = '', out = {}) => {
	for (const [key, value] of Object.entries(obj)) {
		const full = prefix ? `${prefix}.${key}` : key
		if (value && typeof value === 'object') { flatten(value, full, out) } else { out[full] = String(value) }
	}
	return out
}

const placeholders = (str) => {
	const found = new Set()
	for (const match of str.matchAll(/\{\{(\w+)\}\}/g)) { found.add(match[1]) }
	return found
}

let failures = 0
const fail = (domain, msg) => {
	failures += 1
	console.error(`  ✗ [${domain}] ${msg}`)
}

let totalKeys = 0
for (const lang of OTHERS) {
	const baseFiles = fs.readdirSync(path.join(LOCALES_DIR, BASE)).filter((f) => f.endsWith('.json'))
	const otherFiles = fs.readdirSync(path.join(LOCALES_DIR, lang)).filter((f) => f.endsWith('.json'))

	for (const domain of new Set([...baseFiles, ...otherFiles])) {
		const basePath = path.join(LOCALES_DIR, BASE, domain)
		const otherPath = path.join(LOCALES_DIR, lang, domain)
		if (!fs.existsSync(basePath)) { fail(domain, `${BASE}/${domain} no existe`); continue }
		if (!fs.existsSync(otherPath)) { fail(domain, `${lang}/${domain} no existe`); continue }

		let baseFlat, otherFlat
		try { baseFlat = flatten(JSON.parse(fs.readFileSync(basePath, 'utf8'))) } catch (e) { fail(domain, `${BASE}/${domain} JSON inválido: ${e.message}`); continue }
		try { otherFlat = flatten(JSON.parse(fs.readFileSync(otherPath, 'utf8'))) } catch (e) { fail(domain, `${lang}/${domain} JSON inválido: ${e.message}`); continue }
		totalKeys += Object.keys(baseFlat).length

		for (const key of Object.keys(baseFlat)) {
			if (!(key in otherFlat)) { fail(domain, `falta en ${lang}: ${key}`); continue }
			const a = placeholders(baseFlat[key])
			const b = placeholders(otherFlat[key])
			if (a.size !== b.size || [...a].some((p) => !b.has(p))) {
				fail(domain, `placeholders distintos en ${key}: ${BASE}={${[...a].join(',')}} ${lang}={${[...b].join(',')}}`)
			}
		}
		for (const key of Object.keys(otherFlat)) {
			if (!(key in baseFlat)) { fail(domain, `sobra en ${lang}: ${key}`) }
		}
		for (const [name, flat] of [[BASE, baseFlat], [lang, otherFlat]]) {
			for (const key of Object.keys(flat)) {
				if (key.endsWith('_one') && !(`${key.slice(0, -4)}_other` in flat)) { fail(domain, `${name}: ${key} sin _other`) }
				if (key.endsWith('_other') && !(`${key.slice(0, -6)}_one` in flat)) { fail(domain, `${name}: ${key} sin _one`) }
			}
		}
	}
}

if (failures > 0) {
	console.error(`\ni18n:check FALLÓ con ${failures} problema(s).`)
	process.exit(1)
}
console.log(`i18n:check OK — paridad es/en completa (${totalKeys} claves).`)
