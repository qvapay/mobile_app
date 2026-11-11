#!/usr/bin/env node
/**
 * Regenera `ui/store/cubaGeo.ts` (provincias y municipios de Cuba de las direcciones de
 * envío) desde qpweb, que es la fuente de verdad: el servidor valida el municipio contra su
 * lista cerrada (`isMunicipalityOf`) y la entrega a domicilio solo entiende esos nombres.
 *
 *   npm run geo:cuba                 # qpweb en ~/webs/qpweb
 *   npm run geo:cuba -- <ruta-qpweb>
 *
 * Lee `scripts/geo/cuba-municipalities.js` (puro, sin imports: se importa tal cual) y el
 * bloque `CU` de `scripts/geo/provinces.js` (ese importa libphonenumber-js, así que se lee
 * como texto). Solo copia nombres: los ids externos de qpweb no viajan a la app.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')

const OUT = path.join(__dirname, '..', 'ui', 'store', 'cubaGeo.ts')

const fail = (msg) => { console.error(`geo:cuba — ${msg}`); process.exit(1) }

/** `PROVINCES.CU` de provinces.js en su orden (oeste → este), sin evaluar el módulo. */
const readProvinces = (file) => {
	const text = fs.readFileSync(file, 'utf8')
	const block = text.match(/\bCU:\s*\{([^}]*)\}/)
	if (!block) fail(`no encuentro PROVINCES.CU en ${file}`)
	const out = []
	for (const m of block[1].matchAll(/([A-Z]{3})\s*:\s*'([^']+)'/g)) out.push({ code: m[1], name: m[2] })
	if (!out.length) fail(`PROVINCES.CU vacío en ${file}`)
	return out
}

const quote = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

const main = async () => {
	const root = path.resolve(process.argv[2] || path.join(os.homedir(), 'webs', 'qpweb'))
	const municipalitiesFile = path.join(root, 'scripts', 'geo', 'cuba-municipalities.js')
	const provincesFile = path.join(root, 'scripts', 'geo', 'provinces.js')
	for (const f of [municipalitiesFile, provincesFile]) if (!fs.existsSync(f)) fail(`no existe ${f}`)

	const provinces = readProvinces(provincesFile)
	const { CUBA_MUNICIPALITIES } = await import(pathToFileURL(municipalitiesFile).href)
	if (!CUBA_MUNICIPALITIES) fail(`${municipalitiesFile} no exporta CUBA_MUNICIPALITIES`)

	const codes = provinces.map((p) => p.code)
	const extra = Object.keys(CUBA_MUNICIPALITIES).filter((c) => !codes.includes(c))
	const missing = codes.filter((c) => !CUBA_MUNICIPALITIES[c]?.municipalities?.length)
	if (extra.length || missing.length) fail(`provincias y municipios no casan (sobran: ${extra.join(', ') || '—'} · faltan: ${missing.join(', ') || '—'})`)

	let total = 0
	const blocks = provinces.map(({ code }) => {
		const names = CUBA_MUNICIPALITIES[code].municipalities.map((m) => m.name)
		total += names.length
		return `\t${code}: [\n${names.map((n) => `\t\t${quote(n)},`).join('\n')}\n\t],`
	})

	const source = `/**
 * GENERADO por \`scripts/sync-cuba-geo.js\` (npm run geo:cuba) — NO editar a mano.
 *
 * Provincias y municipios de Cuba de las direcciones de envío, copiados de qpweb
 * (\`scripts/geo/provinces.js\` → \`PROVINCES.CU\` y \`scripts/geo/cuba-municipalities.js\`).
 * El servidor solo acepta en \`city\` el nombre CANÓNICO de un municipio de la provincia
 * (\`state\`): si qpweb cambia la lista, se regenera este archivo.
 *
 * ${provinces.length} provincias · ${total} municipios
 */

/** Provincias de Cuba: código (\`state\` de la dirección y de \`ship_to.CU\`) y nombre, de oeste a este. */
export const CU_PROVINCES: readonly { code: string, name: string }[] = [
${provinces.map((p) => `\t{ code: ${quote(p.code)}, name: ${quote(p.name)} },`).join('\n')}
]

/** Municipios por código de provincia, con su nombre canónico. */
export const CUBA_MUNICIPALITIES: Readonly<Record<string, readonly string[]>> = {
${blocks.join('\n')}
}
`
	fs.writeFileSync(OUT, source)
	console.log(`geo:cuba — ${path.relative(process.cwd(), OUT)}: ${provinces.length} provincias · ${total} municipios`)
}

main().catch((e) => fail(e?.message || String(e)))
