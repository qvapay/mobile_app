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
 *
 * LEER ANTES DE TOCAR — por qué este lector es estricto. Un verificador solo vale si lee
 * el mensaje IGUAL que quien lo va a ejecutar, y protobuf admite cosas que dos lectores
 * resuelven distinto:
 * - Un campo singular puede venir REPETIDO, y el estándar (protobuf-java, el de java-tron)
 *   se queda con el ÚLTIMO. Leer el primero dejaba que un nodo mandara
 *   `{destino: Bob, …, destino: atacante}`: la app verificaba «a Bob» y la red pagaba al
 *   atacante. Por eso `varintOf`/`bytesOf` LANZAN ante un campo repetido, y `decodeExact`
 *   exige además que no haya campos de más ni con otro wire type.
 * - Un varint puede traer bits por encima de 64, que java descarta en silencio: aquí
 *   se rechazan, para no leer un número distinto del que leerá el nodo.
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
			// El décimo byte solo aporta el bit 63: cualquier otra cosa no cabe en 64 bits
			if (shift === 63n && byte > 1) throw new Error('protobuf: varint fuera de 64 bits')
			result |= BigInt(byte & 0x7f) << shift
			if ((byte & 0x80) === 0) return result
			shift += 7n
			if (shift > 63n) throw new Error('protobuf: varint demasiado largo')
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

/**
 * El único valor de un campo SINGULAR. Si aparece más de una vez no hay respuesta buena:
 * devolver el primero es leer otra cosa que el nodo (que ejecuta el último), así que lanza.
 */
const one = (fields: ProtoField[], field: number, wireType: number): ProtoField | undefined => {
	const matches = fields.filter(f => f.field === field)
	if (matches.length > 1) throw new Error(`protobuf: campo ${field} repetido`)
	if (matches.length === 1 && matches[0].wireType !== wireType) throw new Error(`protobuf: campo ${field} con wire type ${matches[0].wireType}, se esperaba ${wireType}`)
	return matches[0]
}

/** Varint de un campo singular (0 si no viene: el valor por defecto de proto3). Lanza si se repite. */
export const varintOf = (fields: ProtoField[], field: number): bigint => one(fields, field, 0)?.varint ?? 0n
/** Bytes de un campo singular (vacío si no viene). Lanza si se repite. */
export const bytesOf = (fields: ProtoField[], field: number): Uint8Array => one(fields, field, 2)?.bytes ?? new Uint8Array(0)
/** Todas las apariciones de un campo REPETIDO, en orden. */
export const allBytesOf = (fields: ProtoField[], field: number): Uint8Array[] => fields.filter(f => f.field === field && f.wireType === 2).map(f => f.bytes!)

/** Forma EXACTA de un mensaje: número de campo → wire type (0 varint, 2 bytes) y si puede repetirse. */
export type ProtoShape = Record<number, { wire: 0 | 2, repeated?: boolean }>

/**
 * Decodifica exigiendo que el mensaje tenga EXACTAMENTE esa forma: ni un campo que no esté
 * en `shape` (un nodo no puede colar un `Permission_id`, un memo o un `token_id` que aquí
 * nadie mira y la red sí ejecuta), ni con otro wire type, ni un singular repetido.
 *
 * @param message - Nombre del mensaje, para que el error diga dónde está el problema.
 */
export const decodeExact = (bytes: Uint8Array, shape: ProtoShape, message: string): ProtoField[] => {
	const fields = decodeFields(bytes)
	const seen = new Set<number>()
	for (const { field, wireType } of fields) {
		const spec = shape[field]
		if (!spec) throw new Error(`protobuf: ${message} trae el campo ${field}, que no se admite`)
		if (wireType !== spec.wire) throw new Error(`protobuf: ${message} trae el campo ${field} con wire type ${wireType}`)
		if (!spec.repeated && seen.has(field)) throw new Error(`protobuf: ${message} trae el campo ${field} repetido`)
		seen.add(field)
	}
	return fields
}

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

export const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, i) => byte === b[i])
