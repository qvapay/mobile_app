#!/usr/bin/env node

/**
 * Regenerates ui/havanaGeo.js — the real-Havana vector geography behind the
 * USD CASH card (HavanaMapArt + courier routes).
 *
 * Pipeline: fetches from the Overpass API (OpenStreetMap, ODbL) the
 * coastline, the Almendares river and the arterial street network; projects
 * everything into the card's 360x200 viewBox (equirectangular with aspect
 * correction for 23°N); simplifies with Douglas-Peucker; and computes each
 * courier route with Dijkstra over the real street graph so deliveries
 * follow actual streets (never water).
 *
 * Tuning knobs: PROJECTION (framing), TRIPS (courier origin/destination in
 * lon/lat), road classes and DP tolerances below.
 *
 * Usage: node scripts/build-havana-geo.js
 */

const fs = require('fs')
const path = require('path')

const OUT_FILE = path.join(__dirname, '..', 'ui', 'havanaGeo.js')
const OVERPASS = 'https://overpass-api.de/api/interpreter'

// ——— Projection (framing) ———
const LON_W = -82.455, LON_E = -82.245
const MAP_W = 360, MAP_H = 200
const SX = MAP_W / (LON_E - LON_W)
const SY = SX * 1.084 // aspect correction at 23°N
const LAT_TOP = 23.180
const px = ([lon, lat]) => [(lon - LON_W) * SX, (LAT_TOP - lat) * SY]
const ri = n => Math.round(n)
const r1 = n => Math.round(n * 10) / 10

// Wide bboxes so the coastline enters/exits outside the canvas
const COAST_BBOX = '23.03,-82.52,23.21,-82.19'
const ROADS_BBOX = '23.06,-82.46,23.24,-82.24'

// Courier trips: origin/destination in lon/lat, routed over real streets
const TRIPS = {
	vedadoHV: [[-82.3990, 23.1400], [-82.3496, 23.1355]],       // Vedado → Plaza Vieja
	miramarVedado: [[-82.4300, 23.1210], [-82.3985, 23.1375]],  // Miramar 5ta → Vedado 23
	centroCerro: [[-82.3700, 23.1370], [-82.3900, 23.1130]],    // Centro → Cerro
	hvRegla: [[-82.3560, 23.1330], [-82.3345, 23.1200]],        // Habana Vieja → Regla (around the bay)
	este: [[-82.3430, 23.1490], [-82.3110, 23.1550]],           // Casablanca → Habana del Este
	vedadoInterior: [[-82.4050, 23.1270], [-82.3830, 23.1410]], // Vedado interior → Malecón
}

// Sequential + retry: Overpass throttles parallel requests from one IP
const overpass = async (query, attempt = 1) => {
	const res = await fetch(OVERPASS, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'QvaPay-mapgen/1.0' },
		body: 'data=' + encodeURIComponent(`[out:json][timeout:30];${query};out geom;`),
	})
	if (!res.ok) {
		if (attempt < 3) {
			console.log(`  Overpass ${res.status}, retrying in 5s…`)
			await new Promise(resolve => setTimeout(resolve, 5000))
			return overpass(query, attempt + 1)
		}
		throw new Error(`Overpass ${res.status}`)
	}
	const json = await res.json()
	return json.elements.filter(e => e.type === 'way' && e.geometry)
}

// ——— Geometry helpers ———
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

const key6 = p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
const stitch = (ways) => {
	let chains = ways.map(c => [...c])
	let merged = true
	while (merged) {
		merged = false
		outer: for (let i = 0; i < chains.length; i++) {
			for (let j = 0; j < chains.length; j++) {
				if (i === j) continue
				const a = chains[i], b = chains[j]
				if (key6(a[a.length - 1]) === key6(b[0])) { chains[i] = a.concat(b.slice(1)); chains.splice(j, 1); merged = true; break outer }
				if (key6(b[b.length - 1]) === key6(a[0])) { chains[j] = b.concat(a.slice(1)); chains.splice(i, 1); merged = true; break outer }
			}
		}
	}
	return chains.sort((a, b) => b.length - a.length)
}

const inCanvas = pts => pts.some(([x, y]) => x > -20 && x < 380 && y > -20 && y < 220)
const toPathAbs = (pts, round) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)},${round(y)}`).join(' ')

const main = async () => {
	console.log('Fetching OSM data…')
	const coastWays = await overpass(`way["natural"="coastline"](${COAST_BBOX})`)
	const riverWays = await overpass(`way["waterway"~"river"]["name"~"Almendares"](${COAST_BBOX})`)
	const roads = await overpass(`way["highway"~"^(trunk|primary|secondary|tertiary|trunk_link|primary_link|secondary_link)$"](${ROADS_BBOX})`)
	console.log(`coast ways: ${coastWays.length} | river ways: ${riverWays.length} | road ways: ${roads.length}`)

	// Coastline → land silhouette
	const coastChains = stitch(coastWays.map(e => e.geometry.map(g => [g.lon, g.lat])))
	const coastPts = dp(coastChains[0].map(px), 1.0)
	const first = coastPts[0], last = coastPts[coastPts.length - 1]
	const COAST = toPathAbs(coastPts, r1)
	const LAND = `${COAST} L${r1(last[0])},230 L${r1(first[0])},230 Z`
	console.log(`coast: ${coastChains[0].length} pts → ${coastPts.length} | ends ${first.map(ri)} / ${last.map(ri)} (must be outside 0..${MAP_W})`)

	// Almendares
	const RIVER = toPathAbs(
		dp(stitch(riverWays.map(e => e.geometry.map(g => [g.lon, g.lat])))[0].map(px), 1.2)
			.filter(([x, y]) => x > -15 && x < 375 && y > -15 && y < 215),
		r1,
	)

	// Road draw paths per class
	const buildClass = (classes, tol) => {
		const parts = []
		for (const w of roads) {
			if (!classes.includes(w.tags.highway)) continue
			const p = dp(w.geometry.map(g => px([g.lon, g.lat])), tol)
			if (!inCanvas(p)) continue
			const length = p.reduce((a, q, i) => i ? a + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0)
			if (length < 3) continue
			parts.push(toPathAbs(p, ri))
		}
		return parts.join(' ')
	}
	const majorD = buildClass(['trunk', 'primary', 'trunk_link', 'primary_link'], 1.2)
	const minorD = buildClass(['secondary', 'secondary_link', 'tertiary'], 1.5)

	// Street graph for routing (all fetched classes)
	const nodeId = new Map()
	const coords = []
	const adj = []
	const getNode = (p) => {
		const k = `${p[0].toFixed(5)},${p[1].toFixed(5)}`
		let id = nodeId.get(k)
		if (id === undefined) { id = coords.length; nodeId.set(k, id); coords.push(p); adj.push([]) }
		return id
	}
	for (const w of roads) {
		const pts = w.geometry.map(g => px([g.lon, g.lat]))
		for (let i = 1; i < pts.length; i++) {
			const a = getNode(pts[i - 1]), b = getNode(pts[i])
			const d = Math.hypot(coords[a][0] - coords[b][0], coords[a][1] - coords[b][1])
			adj[a].push([b, d]); adj[b].push([a, d])
		}
	}
	console.log(`graph nodes: ${coords.length}`)

	const nearest = (lonLat) => {
		const p = px(lonLat)
		let best = -1, bestD = Infinity
		for (let i = 0; i < coords.length; i++) {
			const d = Math.hypot(coords[i][0] - p[0], coords[i][1] - p[1])
			if (d < bestD) { bestD = d; best = i }
		}
		return { id: best, dist: bestD }
	}

	const dijkstra = (src, dst) => {
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

	const ROUTES = {}
	for (const [name, [o, d]] of Object.entries(TRIPS)) {
		const src = nearest(o), dst = nearest(d)
		const routePath = dijkstra(src.id, dst.id)
		if (!routePath) { console.error(`${name}: NO ROUTE — adjust TRIPS endpoints`); process.exitCode = 1; continue }
		ROUTES[name] = dp(routePath, 0.6).map(p => [r1(p[0]), r1(p[1])])
		console.log(`${name}: snap ${r1(src.dist)}/${r1(dst.dist)}px | ${routePath.length} pts → ${ROUTES[name].length}`)
	}

	const MORRO = px([-82.3562, 23.1502]).map(r1)
	const CAPITOLIO = px([-82.3594, 23.1358]).map(r1)

	const mod = `// GENERATED by scripts/build-havana-geo.js — do not hand-edit paths.
// Real Havana geography from OpenStreetMap (ODbL), projected into the
// 360x200 card viewBox (lon ${LON_W}..${LON_E}, lat top ${LAT_TOP}, aspect-corrected).
// Courier routes are Dijkstra shortest paths over the real OSM street graph.
// Regenerate with: node scripts/build-havana-geo.js

export const MAP_W = ${MAP_W}
export const MAP_H = ${MAP_H}

// Coastline stroke (open path along the shore, bay and harbor included)
export const COAST_PATH = '${COAST}'

// Land silhouette (coastline closed through the south edge)
export const LAND_PATH = '${LAND}'

// Río Almendares centerline
export const RIVER_PATH = '${RIVER}'

// Real arterial network: trunk+primary (major) and secondary+tertiary (minor)
export const ROADS_MAJOR_PATH = '${majorD}'
export const ROADS_MINOR_PATH = '${minorD}'

// Landmarks (viewBox coords)
export const MORRO = [${MORRO}]
export const CAPITOLIO = [${CAPITOLIO}]

// Courier route polylines (viewBox coords, following real streets)
export const COURIER_ROUTES = ${JSON.stringify(ROUTES, null, '\t').replace(/"/g, '')}
`
	fs.writeFileSync(OUT_FILE, mod)
	console.log(`\nWrote ${OUT_FILE} (${mod.length} chars)`)
}

main().catch(err => { console.error(err); process.exit(1) })
