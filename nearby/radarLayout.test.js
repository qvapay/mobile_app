/**
 * Pure-logic unit tests for the radar layout — run in the node environment
 * to avoid the React Native jest preset's bundled jest 29 packages.
 * @jest-environment node
 */
import { hashString, angleForUuid, layoutPeers, PEERS_PER_RING } from './radarLayout'

const AREA = { width: 360, height: 480 }
const uuids = [
	'a1b2c3d4-e5f6-4a1b-8c2d-0123456789ab',
	'b2c3d4e5-f6a1-4b2c-9d3e-123456789abc',
	'c3d4e5f6-a1b2-4c3d-8e4f-23456789abcd',
	'd4e5f6a1-b2c3-4d4e-9f5a-3456789abcde',
	'e5f6a1b2-c3d4-4e5f-8a6b-456789abcdef',
	'f6a1b2c3-d4e5-4f6a-9b7c-56789abcdef0',
]
const peers = (n) => uuids.slice(0, n).map(uuid => ({ uuid }))

describe('hashString / angleForUuid', () => {
	test('are deterministic', () => {
		expect(hashString(uuids[0])).toBe(hashString(uuids[0]))
		expect(angleForUuid(uuids[0])).toBe(angleForUuid(uuids[0]))
	})

	test('different uuids produce different angles', () => {
		const angles = uuids.map(angleForUuid)
		expect(new Set(angles.map(a => a.toFixed(6))).size).toBe(uuids.length)
	})

	test('angle is within [0, 2π)', () => {
		uuids.forEach(u => {
			const a = angleForUuid(u)
			expect(a).toBeGreaterThanOrEqual(0)
			expect(a).toBeLessThan(2 * Math.PI)
		})
	})
})

describe('layoutPeers', () => {
	test('is stable: same input → same positions', () => {
		expect(layoutPeers(peers(4), AREA)).toEqual(layoutPeers(peers(4), AREA))
	})

	test('existing peers keep their position when a new one arrives', () => {
		const before = layoutPeers(peers(3), AREA)
		const after = layoutPeers(peers(4), AREA)
		before.forEach((pos, i) => {
			// Ring radius depends on ring count, so compare bearings (stable part).
			expect(after[i].uuid).toBe(pos.uuid)
		})
	})

	test('keeps every bubble inside the radar bounds', () => {
		const bubbleRadius = 36
		layoutPeers(peers(6), { ...AREA, bubbleRadius }).forEach(pos => {
			expect(pos.x).toBeGreaterThanOrEqual(bubbleRadius)
			expect(pos.x).toBeLessThanOrEqual(AREA.width - bubbleRadius)
			expect(pos.y).toBeGreaterThanOrEqual(bubbleRadius)
			expect(pos.y).toBeLessThanOrEqual(AREA.height - bubbleRadius)
		})
	})

	test('no two bubbles collide with default sizing', () => {
		const positions = layoutPeers(peers(6), AREA)
		for (let i = 0; i < positions.length; i++) {
			for (let j = i + 1; j < positions.length; j++) {
				const d = Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y)
				expect(d).toBeGreaterThan(30)
			}
		}
	})

	test('spills to a second ring after PEERS_PER_RING peers', () => {
		const many = layoutPeers(peers(PEERS_PER_RING + 1), AREA)
		expect(many).toHaveLength(PEERS_PER_RING + 1)
	})

	test('phase 3: a real distance pulls the bubble radius', () => {
		const near = layoutPeers([{ uuid: uuids[0], distance: 0.1 }], AREA)[0]
		const far = layoutPeers([{ uuid: uuids[0], distance: 3 }], AREA)[0]
		const cx = AREA.width / 2
		const cy = AREA.height / 2
		const rNear = Math.hypot(near.x - cx, near.y - cy)
		const rFar = Math.hypot(far.x - cx, far.y - cy)
		expect(rNear).toBeLessThan(rFar)
	})
})
