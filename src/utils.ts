/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

/**
 * Sanitizes and decodes a Base64 string. Sanitization implies the removal of
 * any whitespace and newline characters before decoding.
 *
 * @param base64String - The Base64 string to decode.
 * @returns A Buffer containing the decoded data.
 */
export function decodeBase64(base64String: string): Buffer {
  const sanitized = base64String.replace(/[\s\r\n]+/g, '')
  return Buffer.from(sanitized, 'base64')
}

/**
 * Sanitizes, decodes, and parses a Base64-encoded JSON string into an object.
 *
 * @param base64String - The Base64 string containing the encoded JSON.
 * @returns The parsed JSON object.
 */
export function decodeBase64JSON(base64String: string): object {
  return JSON.parse(decodeBase64(base64String).toString('utf8'))
}
