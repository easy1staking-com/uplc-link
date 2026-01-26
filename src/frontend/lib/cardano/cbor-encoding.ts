/**
 * CBOR encoding utilities for Plutus script parameters
 */

/**
 * Encode an integer to CBOR hex format
 * CBOR spec: https://www.rfc-editor.org/rfc/rfc8949.html
 *
 * Major type 0: unsigned integer (0x00-0x1b prefix)
 * Major type 1: negative integer (0x20-0x3b prefix)
 */
export function cborEncodeInteger(value: number): string {
  const num = parseInt(value.toString());

  if (isNaN(num)) {
    throw new Error('Invalid integer value');
  }

  // Handle negative integers
  if (num < 0) {
    const absValue = Math.abs(num) - 1;

    if (absValue <= 23) {
      // Major type 1, value 0-23: 0x20-0x37
      return (0x20 + absValue).toString(16).padStart(2, '0');
    } else if (absValue <= 0xff) {
      // Major type 1, 1-byte uint: 0x38 + value
      return '38' + absValue.toString(16).padStart(2, '0');
    } else if (absValue <= 0xffff) {
      // Major type 1, 2-byte uint: 0x39 + value (big-endian)
      return '39' + absValue.toString(16).padStart(4, '0');
    } else if (absValue <= 0xffffffff) {
      // Major type 1, 4-byte uint: 0x3a + value (big-endian)
      return '3a' + absValue.toString(16).padStart(8, '0');
    } else {
      // Major type 1, 8-byte uint: 0x3b + value (big-endian)
      return '3b' + absValue.toString(16).padStart(16, '0');
    }
  }

  // Handle positive integers
  if (num <= 23) {
    // Major type 0, value 0-23: 0x00-0x17
    return num.toString(16).padStart(2, '0');
  } else if (num <= 0xff) {
    // Major type 0, 1-byte uint: 0x18 + value
    return '18' + num.toString(16).padStart(2, '0');
  } else if (num <= 0xffff) {
    // Major type 0, 2-byte uint: 0x19 + value (big-endian)
    return '19' + num.toString(16).padStart(4, '0');
  } else if (num <= 0xffffffff) {
    // Major type 0, 4-byte uint: 0x1a + value (big-endian)
    return '1a' + num.toString(16).padStart(8, '0');
  } else {
    // Major type 0, 8-byte uint: 0x1b + value (big-endian)
    return '1b' + num.toString(16).padStart(16, '0');
  }
}

/**
 * Encode a hex string (without 0x prefix) to CBOR bytestring format
 * Major type 2: byte string (0x40-0x5b prefix)
 *
 * @param hexString - Hex string without 0x prefix
 * @returns CBOR-encoded bytestring
 */
export function cborEncodeByteString(hexString: string): string {
  // Remove any spaces or 0x prefix
  const cleanHex = hexString.replace(/^0x/, '').replace(/\s/g, '');

  // Validate hex
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error('Invalid hex string');
  }

  const byteLength = cleanHex.length / 2;

  let prefix: string;
  if (byteLength <= 23) {
    // Major type 2, length 0-23: 0x40-0x57
    prefix = (0x40 + byteLength).toString(16);
  } else if (byteLength <= 0xff) {
    // Major type 2, 1-byte length: 0x58 + length
    prefix = '58' + byteLength.toString(16).padStart(2, '0');
  } else if (byteLength <= 0xffff) {
    // Major type 2, 2-byte length: 0x59 + length (big-endian)
    prefix = '59' + byteLength.toString(16).padStart(4, '0');
  } else if (byteLength <= 0xffffffff) {
    // Major type 2, 4-byte length: 0x5a + length (big-endian)
    prefix = '5a' + byteLength.toString(16).padStart(8, '0');
  } else {
    // Major type 2, 8-byte length: 0x5b + length (big-endian)
    prefix = '5b' + byteLength.toString(16).padStart(16, '0');
  }

  return prefix + cleanHex;
}

/**
 * Check if a string looks like valid CBOR hex
 * Basic heuristic - checks if it starts with valid CBOR major type prefix
 */
export function looksLikeCBOR(hex: string): boolean {
  const cleanHex = hex.replace(/^0x/, '').replace(/\s/g, '');
  if (!/^[0-9a-fA-F]+$/.test(cleanHex)) return false;
  if (cleanHex.length < 2) return false;

  // Check first byte - should be valid CBOR major type
  const firstByte = parseInt(cleanHex.substring(0, 2), 16);

  // Major types 0-7 are valid
  // We're mainly interested in:
  // 0x00-0x1b: unsigned int
  // 0x20-0x3b: negative int
  // 0x40-0x5b: byte string
  // 0x80-0x9b: array
  // 0xa0-0xbb: map
  // 0xc0-0xdb: tag
  // 0xf4-0xf7: simple values

  return firstByte < 0xe0; // Rough check
}

/**
 * Validate and auto-encode a parameter value based on its type
 *
 * @param value - User input value
 * @param schemaType - Parameter type from schema
 * @param rawCborMode - If true, pass through as-is
 * @returns CBOR-encoded parameter value
 */
export function encodeParameterValue(
  value: string,
  schemaType: string,
  rawCborMode: boolean
): string {
  if (!value) {
    throw new Error('Parameter value is required');
  }

  // Raw CBOR mode - pass through as-is
  if (rawCborMode) {
    const cleanHex = value.replace(/^0x/, '').replace(/\s/g, '');
    if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
      throw new Error('Raw CBOR mode requires valid hex string');
    }
    return cleanHex;
  }

  // Smart encoding based on schema type
  const typeNormalized = schemaType.toLowerCase();

  // Integer types
  if (typeNormalized.includes('int') || typeNormalized === 'integer') {
    try {
      return cborEncodeInteger(parseFloat(value));
    } catch (e) {
      throw new Error(`Invalid integer value: ${value}`);
    }
  }

  // ByteArray types (most common for hashes, policy IDs, etc.)
  if (
    typeNormalized.includes('byte') ||
    typeNormalized.includes('hash') ||
    typeNormalized.includes('policy') ||
    typeNormalized.includes('address') ||
    typeNormalized === 'data'
  ) {
    try {
      return cborEncodeByteString(value);
    } catch (e) {
      throw new Error(`Invalid hex string: ${value}`);
    }
  }

  // Complex types (constructor, map, list, etc.) - expect raw CBOR
  // Validate it looks like CBOR
  const cleanHex = value.replace(/^0x/, '').replace(/\s/g, '');
  if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
    throw new Error('Complex types require CBOR hex. Enable "Raw CBOR mode" and provide valid CBOR hex.');
  }

  if (!looksLikeCBOR(cleanHex)) {
    throw new Error('Value does not appear to be valid CBOR. Enable "Raw CBOR mode" if this is intentional.');
  }

  return cleanHex;
}
