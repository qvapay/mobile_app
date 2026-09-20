/**
 * Lector/escritor protobuf MÍNIMO para las transacciones de TRON. PURO.
 *
 * Sin protobufjs ni .proto vendorizado: la wallet solo necesita leer
 * `Transaction.raw` (lo que se firma) para verificar que el nodo construyó
 * EXACTAMENTE lo que el usuario pidió (regla dura 6 del plan), y escribir la
 * envoltura `Transaction { raw_data, signature }` para difundir por
 * `/wallet/broadcasthex` sin depender de que el nodo re-serialice un JSON.
 *
 * Wire types usados por TRON: varint (0) y length-delimited (2). Cualquier
 * otro se salta correctamente pero no se interpreta.
 */

export type ProtoField = { field: number, wireType: number, varint?: bigint, bytes?: Uint8Array }

/** Decodifica un mensaje en su lista plana de campos (repetidos incluidos, en orden). */
export const decodeFields = (bytes: Uint8Array): ProtoField[] => {
	const fields: ProtoField[] = []
	let offset = 0
	const readVarint = (): bigint => {
		let result = 0n
		let shift = 0n
		for (;;) {
			if (offset >= bytes.length) throw new Error('protobuf: varint truncado')
			const byte = bytes[offset++]
			result |= BigInt(byte & 0x7f) << shift
			if ((byte & 0x80) === 0) return result
			shift += 7n
			if (shift > 70n) throw new Error('protobuf: varint demasiado largo')
		}
	}
	while (offset < bytes.length) {
		const key = readVarint()
		const field = Number(key >> 3n)
		const wireType = Number(key & 7n)
		if (field === 0) throw new Error('protobuf: campo 0 inválido')
		switch (wireType) {
			case 0:
				fields.push({ field, wireType, varint: readVarint() })
				break
			case 2: {
				const length = Number(readVarint())
				if (offset + length > bytes.length) throw new Error('protobuf: length-delimited truncado')
				fields.push({ field, wireType, bytes: bytes.slice(offset, offset + length) })
				offset += length
				break
			}
			case 1:
				if (offset + 8 > bytes.length) throw new Error('protobuf: fixed64 truncado')
				fields.push({ field, wireType, bytes: bytes.slice(offset, offset + 8) })
				offset += 8
				break
			case 5:
				if (offset + 4 > bytes.length) throw new Error('protobuf: fixed32 truncado')
				fields.push({ field, wireType, bytes: bytes.slice(offset, offset + 4) })
				offset += 4
				break
			default:
				throw new Error(`protobuf: wire type ${wireType} no soportado`)
		}
	}
	return fields
}

const one = (fields: ProtoField[], field: number): ProtoField | undefined => fields.find(f => f.field === field)
export const varintOf = (fields: ProtoField[], field: number): bigint => one(fields, field)?.varint ?? 0n
export const bytesOf = (fields: ProtoField[], field: number): Uint8Array => one(fields, field)?.bytes ?? new Uint8Array(0)
export const allBytesOf = (fields: ProtoField[], field: number): Uint8Array[] => fields.filter(f => f.field === field && f.bytes).map(f => f.bytes!)

/** Codifica un varint (solo no negativos: TRON no usa negativos en estos mensajes). */
export const encodeVarint = (value: bigint | number): Uint8Array => {
	let v = BigInt(value)
	if (v < 0n) throw new Error('protobuf: varint negativo')
	const out: number[] = []
	do {
		let byte = Number(v & 0x7fn)
		v >>= 7n
		if (v > 0n) byte |= 0x80
		out.push(byte)
	} while (v > 0n)
	return Uint8Array.from(out)
}

export const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
	let offset = 0
	for (const part of parts) { out.set(part, offset); offset += part.length }
	return out
}

/** Campo length-delimited (wire type 2): key + longitud + bytes. */
export const encodeBytesField = (field: number, bytes: Uint8Array): Uint8Array =>
	concatBytes(encodeVarint((field << 3) | 2), encodeVarint(bytes.length), bytes)

/** Campo varint (wire type 0): key + valor. */
export const encodeVarintField = (field: number, value: bigint | number): Uint8Array =>
	concatBytes(encodeVarint(field << 3), encodeVarint(value))

export const hexToBytes = (hex: string): Uint8Array => {
	const clean = hex.replace(/^0x/, '')
	if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) throw new Error('hex inválido')
	const out = new Uint8Array(clean.length / 2)
	for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
	return out
}

export const bytesToHex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
