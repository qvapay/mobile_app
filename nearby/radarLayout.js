/**
 * Deterministic radar layout for NearbyPay — pure module, no RN imports.
 *
 * Each peer gets a stable position derived from its uuid (golden-angle
 * dispersion) and its arrival order (ring index), so bubbles never jump
 * between renders and two peers rarely overlap. Phase 3 swaps the ring
 * radius for a function of the real UWB distance.
 */

/** Golden angle in degrees — maximally spreads consecutive indices. */
const GOLDEN_ANGLE_DEG = 137.50776405003785

/** How many peers fit per ring before spilling to the next one. */
export const PEERS_PER_RING = 4

/**
 * Cheap deterministic 32-bit hash (FNV-1a) of a string.
 * @param {string} str
 * @returns {number} Unsigned 32-bit integer.
 */
export const hashString = (str) => {
	let hash = 0x811c9dc5
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return hash >>> 0
}

/**
 * Angle (radians) for a peer: golden-angle steps seeded by the uuid hash so
 * the same user always appears on the same bearing across sessions.
 * @param {string} uuid
 * @returns {number} Radians in [0, 2π).
 */
export const angleForUuid = (uuid) => {
	const steps = hashString(uuid) % 360
	const deg = (steps * GOLDEN_ANGLE_DEG) % 360
	return (deg * Math.PI) / 180
}

/**
 * Lays out verified peers around the centered self-avatar.
 *
 * @param {Array<{ uuid: string, distance?: number|null }>} peers - In arrival order (stable).
 * @param {object} opts
 * @param {number} opts.width - Radar area width.
 * @param {number} opts.height - Radar area height.
 * @param {number} [opts.centerRadius=60] - Keep-out radius around the self avatar.
 * @param {number} [opts.bubbleRadius=36] - Peer bubble radius (kept inside bounds).
 * @param {number} [opts.maxDistanceMeters=3] - Phase 3: distance mapped to full radius.
 * @returns {Array<{ uuid: string, x: number, y: number }>} Bubble centers.
 */
export const layoutPeers = (peers, { width, height, centerRadius = 60, bubbleRadius = 36, maxDistanceMeters = 3 }) => {

	const cx = width / 2
	const cy = height / 2
	const maxR = Math.max(centerRadius + bubbleRadius, Math.min(width, height) / 2 - bubbleRadius)
	const ringCount = Math.max(1, Math.ceil(peers.length / PEERS_PER_RING))
	const ringGap = (maxR - centerRadius - bubbleRadius) / ringCount

	return peers.map((peer, index) => {
		
		const ring = Math.floor(index / PEERS_PER_RING)
		let radius = centerRadius + bubbleRadius + ringGap * (ring + 0.5)

		// Phase 3: real UWB distance overrides the ring radius.
		if (typeof peer.distance === 'number' && peer.distance >= 0) {
			const clamped = Math.min(peer.distance, maxDistanceMeters) / maxDistanceMeters
			radius = centerRadius + bubbleRadius + clamped * (maxR - centerRadius - bubbleRadius * 2)
		}

		// Offset within the ring keeps same-ring peers apart even when their
		// uuid hashes land close: spread by golden angle over the ring slot.
		const slotOffset = ((index % PEERS_PER_RING) * GOLDEN_ANGLE_DEG * Math.PI) / 180
		const angle = angleForUuid(peer.uuid) + slotOffset

		const x = cx + radius * Math.cos(angle)
		const y = cy + radius * Math.sin(angle)

		// Clamp inside the radar bounds.
		return {
			uuid: peer.uuid,
			x: Math.min(Math.max(x, bubbleRadius), width - bubbleRadius),
			y: Math.min(Math.max(y, bubbleRadius), height - bubbleRadius),
		}
	})
}
