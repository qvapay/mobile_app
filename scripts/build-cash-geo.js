#!/usr/bin/env node

/**
 * Regenera ui/cashGeo/<ciudad>.ts — la geografía vectorial REAL de las cabeceras de
 * provincia con entrega de USD CASH, para la tarjeta del Home (CashDeliveryCard pinta una
 * al azar). La Habana sigue en ui/havanaGeo.ts (scripts/build-havana-geo.js, rutas
 * afinadas a mano).
 *
 * Por ciudad, desde la Overpass API (OpenStreetMap, ODbL): calles (trunk → residential) y la
 * costa si la hay. Todo se proyecta al viewBox 360x200 de la tarjeta (equirectangular con
 * corrección de aspecto a su latitud) y se simplifica con Douglas-Peucker. La tierra se arma
 * desde la costa con la convención de OSM (tierra a la IZQUIERDA del sentido de la línea):
 * se recorta a un marco algo mayor que el lienzo y se cierra caminando ese borde. Las seis
 * rutas de mensajero son caminos mínimos (Dijkstra) sobre el grafo real de calles entre
 * puntos que elige un RNG con semilla: regenerar con los mismos datos da lo mismo.
 *
 * Reencuadrar una ciudad: `center` (lon, lat) y `span` (ancho en grados de longitud).
 *
 * Uso: node scripts/build-cash-geo.js [clave…] [--preview <dir>]
 *   sin claves: todas · --preview escribe además un .svg por ciudad para revisarlo a ojo
 */

const fs = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, '..', 'ui', 'cashGeo')
const OVERPASS = 'https://overpass-api.de/api/interpreter'

const MAP_W = 360, MAP_H = 200
/** Altura del centro de la ciudad en el lienzo: la mitad baja queda bajo el título de la tarjeta. */
const CENTER_Y = 78
/** Zona donde nacen y acaban las entregas (fuera del título y lejos de los bordes). */
const TRIP_BOX = { x0: 35, x1: 325, y0: 26, y1: 114 }
const ROUTE_COUNT = 6
/** Presupuesto de caracteres de las calles menores por ciudad (tamaño del bundle). */
const MINOR_BUDGET = 16000

// Cabeceras de provincia con zona de entrega (Cienfuegos no tiene: fuera del tarifario)
const CITIES = [
	{ key: 'pinarDelRio', name: 'Pinar del Río', province: 'PRI', center: [-83.6950, 22.4190], span: 0.07 },
	{ key: 'artemisa', name: 'Artemisa', province: 'ART', center: [-82.7620, 22.8150], span: 0.045 },
	{ key: 'sanJoseDeLasLajas', name: 'San José de las Lajas', province: 'MAY', center: [-82.1530, 22.9620], span: 0.045 },
	{ key: 'matanzas', name: 'Matanzas', province: 'MTZ', center: [-81.5800, 23.0440], span: 0.07 },
	{ key: 'santaClara', name: 'Santa Clara', province: 'VCL', center: [-79.9650, 22.4070], span: 0.075 },
	{ key: 'sanctiSpiritus', name: 'Sancti Spíritus', province: 'SSP', center: [-79.4420, 21.9300], span: 0.06 },
	{ key: 'ciegoDeAvila', name: 'Ciego de Ávila', province: 'CAV', center: [-78.7640, 21.8420], span: 0.06 },
	{ key: 'camaguey', name: 'Camagüey', province: 'CMG', center: [-77.9170, 21.3800], span: 0.09 },
	{ key: 'lasTunas', name: 'Las Tunas', province: 'LTU', center: [-76.9520, 20.9600], span: 0.06 },
	{ key: 'holguin', name: 'Holguín', province: 'HOL', center: [-76.2600, 20.8870], span: 0.09 },
	{ key: 'bayamo', name: 'Bayamo', province: 'GRA', center: [-76.6440, 20.3800], span: 0.06 },
	{ key: 'santiagoDeCuba', name: 'Santiago de Cuba', province: 'SCU', center: [-75.8200, 20.0280], span: 0.1 },
	{ key: 'guantanamo', name: 'Guantánamo', province: 'GTM', center: [-75.2090, 20.1440], span: 0.06 },
	{ key: 'nuevaGerona', name: 'Nueva Gerona', province: 'IJV', center: [-82.8020, 21.8840], span: 0.045 },
]

const MAJOR = ['trunk', 'primary', 'secondary', 'trunk_link', 'primary_link', 'secondary_link']
const MINOR = ['tertiary', 'tertiary_link', 'unclassified', 'residential']

const ri = n => Math.round(n)
const r1 = n => Math.round(n * 10) / 10
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ——— Overpass: secuencial + reintentos (limita las peticiones en paralelo por IP) ———
const overpass = async (query, attempt = 1) => {
	const res = await fetch(OVERPASS, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'QvaPay-mapgen/1.0' },
		body: 'data=' + encodeURIComponent(`[out:json][timeout:60];${query};out geom;`),
	})
	if (!res.ok) {
		if (attempt < 4) {
			console.log(`  Overpass ${res.status}, reintento en ${5 * attempt}s…`)
			await sleep(5000 * attempt)
			return overpass(query, attempt + 1)
		}
		throw new Error(`Overpass ${res.status}`)
	}
	const json = await res.json()
	return json.elements.filter(e => e.type === 'way' && e.geometry)
}

// ——— Proyección de una ciudad al lienzo ———
const projectionFor = ({ center: [lon0, lat0], span }) => {
	const lonW = lon0 - span / 2
	const sx = MAP_W / span
	const sy = sx / Math.cos(lat0 * Math.PI / 180)
	const latTop = lat0 + CENTER_Y / sy
	const px = ([lon, lat]) => [(lon - lonW) * sx, (latTop - lat) * sy]
	// bbox de Overpass (s,w,n,e) del lienzo agrandado `pad` veces su tamaño por cada lado
	const bbox = (pad) => {
		const w = lonW - span * pad, e = lonW + span * (1 + pad)
		const hDeg = MAP_H / sy
		const n = latTop + hDeg * pad, s = latTop - hDeg * (1 + pad)
		return `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`
	}
	return { px, bbox }
}

// ——— Geometría ———
const dp = (pts, tol) => {
	if (pts.length < 3) return pts
	const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1]
	let maxD = 0, idx = 0
	const dx = x2 - x1, dy = y2 - y1
	const len = Math.hypot(dx, dy) || 1e-9
	for (let i = 1; i < pts.length - 1; i++) {
		const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len
		if (d > maxD) { maxD = d; idx = i }
	}
	if (maxD <= tol) return [pts[0], pts[pts.length - 1]]
	return dp(pts.slice(0, idx + 1), tol).slice(0, -1).concat(dp(pts.slice(idx), tol))
}

const polylineLength = pts => pts.reduce((sum, q, i) => (i ? sum + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0)

const key6 = p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
const stitch = (ways) => {
	const chains = ways.map(c => [...c])
	let merged = true
	while (merged) {
		merged = false
		outer: for (let i = 0; i < chains.length; i++) {
			for (let j = 0; j < chains.length; j++) {
				if (i === j) continue
				const a = chains[i], b = chains[j]
				if (key6(a[a.length - 1]) === key6(b[0])) { chains[i] = a.concat(b.slice(1)); chains.splice(j, 1); merged = true; break outer }
			}
		}
	}
	return chains
}

const toPath = (pts, round, close = false) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)},${round(y)}`).join(' ') + (close ? ' Z' : '')

// Marco de recorte de la costa (en píxeles), algo mayor que el lienzo
const CLIP = { x0: -30, y0: -30, x1: MAP_W + 30, y1: MAP_H + 30 }
const inside = ([x, y]) => x >= CLIP.x0 && x <= CLIP.x1 && y >= CLIP.y0 && y <= CLIP.y1

// Liang–Barsky: el tramo a→b recortado al marco, o null
const clipSegment = (a, b) => {
	const dx = b[0] - a[0], dy = b[1] - a[1]
	let t0 = 0, t1 = 1
	const edges = [[-dx, a[0] - CLIP.x0], [dx, CLIP.x1 - a[0]], [-dy, a[1] - CLIP.y0], [dy, CLIP.y1 - a[1]]]
	for (const [p, q] of edges) {
		if (p === 0) { if (q < 0) return null; continue }
		const t = q / p
		if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t } else { if (t < t0) return null; if (t < t1) t1 = t }
	}
	return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]]
}

// Una línea → tramos dentro del marco (cada tramo abierto empieza y acaba en el borde)
const clipPolyline = (pts) => {
	const runs = []
	let cur = null
	for (let i = 1; i < pts.length; i++) {
		const seg = clipSegment(pts[i - 1], pts[i])
		if (!seg) { if (cur) { runs.push(cur); cur = null } continue }
		if (!cur) cur = [seg[0]]
		cur.push(seg[1])
		if (!inside(pts[i])) { runs.push(cur); cur = null }
	}
	if (cur) runs.push(cur)
	return runs.filter(run => run.length > 1)
}

// Posición sobre el borde del marco recorrida en el sentido de las agujas del reloj EN PANTALLA.
// La proyección no espeja el dibujo (norte arriba), así que la tierra de OSM sigue a la
// IZQUIERDA de la línea: `buildLand` invierte las cadenas para tenerla a la derecha y cerrar
// cada polígono caminando el borde en este sentido.
const CW = CLIP.x1 - CLIP.x0, CH = CLIP.y1 - CLIP.y0
const PERIMETER = 2 * (CW + CH)
const CORNERS = [[CLIP.x0, CLIP.y0, 0], [CLIP.x1, CLIP.y0, CW], [CLIP.x1, CLIP.y1, CW + CH], [CLIP.x0, CLIP.y1, 2 * CW + CH]]
const borderT = ([x, y]) => {
	const e = 0.01
	if (Math.abs(y - CLIP.y0) < e) return x - CLIP.x0
	if (Math.abs(x - CLIP.x1) < e) return CW + (y - CLIP.y0)
	if (Math.abs(y - CLIP.y1) < e) return CW + CH + (CLIP.x1 - x)
	return 2 * CW + CH + (CLIP.y1 - y)
}
const cornersBetween = (tFrom, tTo) => {
	const span = (tTo - tFrom + PERIMETER) % PERIMETER
	return CORNERS
		.map(([x, y, t]) => ({ p: [x, y], d: (t - tFrom + PERIMETER) % PERIMETER }))
		.filter(c => c.d > 0 && c.d < span)
		.sort((a, b) => a.d - b.d)
		.map(c => c.p)
}

// Costa (ya proyectada) → polígonos de tierra + tramos visibles para el trazo
const buildLand = (chains) => {
	const runs = []
	const rings = []
	for (const original of chains) {
		// Tierra a la derecha (ver arriba)
		const chain = [...original].reverse()
		const closed = key6(chain[0]) === key6(chain[chain.length - 1])
		if (closed && chain.every(inside)) { rings.push(chain); continue }
		runs.push(...clipPolyline(chain))
	}
	const open = runs.filter(run => key6(run[0]) !== key6(run[run.length - 1]))
	const polygons = []
	const used = new Set()
	for (let i = 0; i < open.length; i++) {
		if (used.has(i)) continue
		const poly = []
		let current = i
		for (let guard = 0; guard < open.length + 1; guard++) {
			used.add(current)
			poly.push(...open[current])
			const tEnd = borderT(open[current][open[current].length - 1])
			// El siguiente tramo es el primer comienzo que se encuentra caminando el borde
			let next = -1, best = Infinity
			open.forEach((run, j) => {
				const d = (borderT(run[0]) - tEnd + PERIMETER) % PERIMETER
				if (d < best && (j === i || !used.has(j))) { best = d; next = j }
			})
			poly.push(...cornersBetween(tEnd, borderT(open[next][0])))
			if (next === i || next === -1) break
			current = next
		}
		polygons.push(poly)
	}
	return { polygons: [...polygons, ...rings], strokes: [...runs, ...rings] }
}

// ——— Grafo de calles y Dijkstra ———
const buildGraph = (roads, px) => {
	const nodeId = new Map()
	const coords = []
	const adj = []
	const getNode = (p) => {
		const k = `${p[0].toFixed(2)},${p[1].toFixed(2)}`
		let id = nodeId.get(k)
		if (id === undefined) { id = coords.length; nodeId.set(k, id); coords.push(p); adj.push([]) }
		return id
	}
	for (const w of roads) {
		const pts = w.geometry.map(g => px([g.lon, g.lat]))
		for (let i = 1; i < pts.length; i++) {
			const a = getNode(pts[i - 1]), b = getNode(pts[i])
			if (a === b) continue
			const d = Math.hypot(coords[a][0] - coords[b][0], coords[a][1] - coords[b][1])
			adj[a].push([b, d]); adj[b].push([a, d])
		}
	}
	return { coords, adj }
}

const dijkstra = ({ coords, adj }, src, dst) => {
	const dist = new Float64Array(coords.length).fill(Infinity)
	const prev = new Int32Array(coords.length).fill(-1)
	dist[src] = 0
	const heap = [[0, src]]
	const push = (item) => {
		heap.push(item)
		let i = heap.length - 1
		while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p }
	}
	const pop = () => {
		const top = heap[0], end = heap.pop()
		if (heap.length) {
			heap[0] = end
			let i = 0
			for (;;) {
				const l = 2 * i + 1, r = l + 1
				let s = i
				if (l < heap.length && heap[l][0] < heap[s][0]) s = l
				if (r < heap.length && heap[r][0] < heap[s][0]) s = r
				if (s === i) break
				;[heap[s], heap[i]] = [heap[i], heap[s]]
				i = s
			}
		}
		return top
	}
	while (heap.length) {
		const [d, u] = pop()
		if (u === dst) break
		if (d > dist[u]) continue
		for (const [v, w] of adj[u]) {
			const nd = d + w
			if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push([nd, v]) }
		}
	}
	if (dist[dst] === Infinity) return null
	const p = []
	for (let u = dst; u !== -1; u = prev[u]) p.push(coords[u])
	return p.reverse()
}

// RNG con semilla (mulberry32) para que regenerar dé las mismas rutas
const seeded = (text) => {
	let a = [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 0x9e3779b9)
	return () => {
		a = (a + 0x6D2B79F5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const inBox = ([x, y], box) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1
const onCanvas = ([x, y]) => x >= 8 && x <= MAP_W - 8 && y >= 8 && y <= MAP_H - 8

const pickRoutes = (graph, key) => {
	const random = seeded(key)
	const candidates = graph.coords.map((p, id) => (inBox(p, TRIP_BOX) && graph.adj[id].length ? id : -1)).filter(id => id >= 0)
	const routes = []
	const destinations = []
	for (let attempt = 0; attempt < 3000 && routes.length < ROUTE_COUNT; attempt++) {
		const src = candidates[Math.floor(random() * candidates.length)]
		const dst = candidates[Math.floor(random() * candidates.length)]
		const a = graph.coords[src], b = graph.coords[dst]
		const straight = Math.hypot(a[0] - b[0], a[1] - b[1])
		if (straight < 40 || straight > 95) continue
		// Destinos repartidos por la ciudad: cada entrega en un sitio distinto
		if (destinations.some(d => Math.hypot(d[0] - b[0], d[1] - b[1]) < 42)) continue
		const route = dijkstra(graph, src, dst)
		if (!route || !route.every(onCanvas)) continue
		const length = polylineLength(route)
		if (length < 50 || length > 120 || length / straight > 1.7) continue
		routes.push(dp(route, 0.6).map(p => [r1(p[0]), r1(p[1])]))
		destinations.push(b)
	}
	return routes
}

// Calles de unas clases → un path, simplificado y sin trozos diminutos
const roadsPath = (roads, classes, px, tol, minLength) => roads
	.filter(w => classes.includes(w.tags.highway))
	.map(w => dp(w.geometry.map(g => px([g.lon, g.lat])), tol))
	.filter(p => p.some(onCanvas) && polylineLength(p) >= minLength)
	.map(p => toPath(p, ri))
	.join(' ')

// ——— Una ciudad ———
const buildCity = async (city) => {
	console.log(`\n${city.name}`)
	const { px, bbox } = projectionFor(city)
	const roads = await overpass(`way["highway"~"^(${[...MAJOR, ...MINOR].join('|')})$"](${bbox(0.12)})`)
	await sleep(1500)
	const coastWays = await overpass(`way["natural"="coastline"](${bbox(0.6)})`)
	await sleep(1500)
	console.log(`  calles: ${roads.length} · costa: ${coastWays.length}`)

	const roadsMajor = roadsPath(roads, MAJOR, px, 1.0, 3)
	// Las menores se simplifican más hasta caber en el presupuesto
	let roadsMinor = ''
	for (const [tol, minLength] of [[1.2, 4], [1.6, 6], [2.0, 8], [2.6, 10], [3.2, 14]]) {
		roadsMinor = roadsPath(roads, MINOR, px, tol, minLength)
		if (roadsMinor.length <= MINOR_BUDGET) break
	}

	let land = null, coast = null
	if (coastWays.length) {
		const chains = stitch(coastWays.map(w => w.geometry.map(g => px([g.lon, g.lat]))))
		const { polygons, strokes } = buildLand(chains)
		const visible = strokes.filter(s => s.some(onCanvas))
		if (polygons.length && visible.length) {
			land = polygons.map(p => toPath(dp(p, 0.8), r1, true)).join(' ')
			coast = visible.map(s => toPath(dp(s, 0.8), r1)).join(' ')
		}
	}

	const routes = pickRoutes(buildGraph(roads, px), city.key)
	if (routes.length < ROUTE_COUNT) throw new Error(`${city.name}: solo ${routes.length} rutas — reencuadra (center/span)`)
	const center = px(city.center).map(r1)
	console.log(`  mayores ${roadsMajor.length} · menores ${roadsMinor.length} · tierra ${land ? land.length : 'interior'} · rutas ${routes.map(r => Math.round(polylineLength(r))).join('/')}`)
	return { ...city, land, coast, roadsMajor, roadsMinor, center, routes }
}

const moduleFor = (geo) => `// GENERATED by scripts/build-cash-geo.js — do not hand-edit.
// ${geo.name} (${geo.province}): geografía real de OpenStreetMap (ODbL) proyectada al viewBox
// ${MAP_W}x${MAP_H} de la tarjeta USD CASH; rutas = Dijkstra sobre el grafo real de calles.
// Regenerar: node scripts/build-cash-geo.js ${geo.key}
import type { CashCityGeo } from './types'

const geo: CashCityGeo = {
	key: '${geo.key}',
	name: '${geo.name}',
	province: '${geo.province}',
	land: ${geo.land ? `'${geo.land}'` : 'null'},
	coast: ${geo.coast ? `'${geo.coast}'` : 'null'},
	river: null,
	roadsMajor: '${geo.roadsMajor}',
	roadsMinor: '${geo.roadsMinor}',
	landmarks: [{ point: [${geo.center}], primary: true }],
	routes: ${JSON.stringify(geo.routes)},
}

export default geo
`

// Vista previa (modo oscuro de la tarjeta) para revisar el encuadre a ojo
const previewFor = (geo) => `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W * 2}" height="${MAP_H * 2}" viewBox="0 0 ${MAP_W} ${MAP_H}">
<rect width="${MAP_W}" height="${MAP_H}" fill="${geo.land ? '#17233F' : '#1E2039'}"/>
${geo.land ? `<path d="${geo.land}" fill="#1E2039"/>` : ''}
<path d="${geo.roadsMinor}" stroke="#3a3c55" stroke-width="1.2" fill="none"/>
<path d="${geo.roadsMajor}" stroke="#55576e" stroke-width="2.2" fill="none"/>
${geo.coast ? `<path d="${geo.coast}" stroke="#4a4c66" stroke-width="1.2" fill="none"/>` : ''}
${geo.routes.map(r => `<path d="${toPath(r, n => n)}" stroke="#6759EF" stroke-width="2" fill="none"/><circle cx="${r[r.length - 1][0]}" cy="${r[r.length - 1][1]}" r="3" fill="#6759EF"/>`).join('\n')}
<circle cx="${geo.center[0]}" cy="${geo.center[1]}" r="2.5" fill="#7BFFB1"/>
<rect x="0" y="130" width="${MAP_W}" height="70" fill="#000" fill-opacity="0.25"/>
<text x="16" y="160" fill="#fff" font-size="16" font-family="Helvetica">USD CASH · ${geo.name}</text>
</svg>`

const main = async () => {
	const args = process.argv.slice(2)
	const previewAt = args.indexOf('--preview')
	const previewDir = previewAt !== -1 ? args[previewAt + 1] : null
	const keys = args.filter((a, i) => !a.startsWith('--') && i !== previewAt + 1)
	const cities = keys.length ? CITIES.filter(c => keys.includes(c.key)) : CITIES
	if (!cities.length) throw new Error(`claves desconocidas: ${keys.join(', ')}`)

	fs.mkdirSync(OUT_DIR, { recursive: true })
	if (previewDir) fs.mkdirSync(previewDir, { recursive: true })
	for (const city of cities) {
		const geo = await buildCity(city)
		const mod = moduleFor(geo)
		fs.writeFileSync(path.join(OUT_DIR, `${city.key}.ts`), mod)
		console.log(`  → ui/cashGeo/${city.key}.ts (${mod.length} caracteres)`)
		if (previewDir) fs.writeFileSync(path.join(previewDir, `${city.key}.svg`), previewFor(geo))
	}
}

main().catch(err => { console.error(err); process.exit(1) })
