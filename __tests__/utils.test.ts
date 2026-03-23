/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import { decodeBase64, decodeBase64JSON } from '../src/utils.js'

describe('utils', () => {
  describe('decodeBase64', () => {
    it('decodes a standard Base64 string', () => {
      const input = Buffer.from('hello world').toString('base64')
      const result = decodeBase64(input)
      expect(result.toString('utf8')).toBe('hello world')
    })

    it('sanitizes whitespace and newlines before decoding', () => {
      // "hello world" encoded in Base64 with junk spaces and newlines
      const input = '  aGVsbG8g \n d29ybGQ= \r\n  '
      const result = decodeBase64(input)
      expect(result.toString('utf8')).toBe('hello world')
    })
  })

  describe('decodeBase64JSON', () => {
    it('decodes and parses a valid Base64-encoded JSON string', () => {
      const obj = { key: 'value', num: 42 }
      const input = Buffer.from(JSON.stringify(obj)).toString('base64')
      const result = decodeBase64JSON(input)
      expect(result).toEqual(obj)
    })

    it('throws a SyntaxError when decoding invalid JSON', () => {
      const input = Buffer.from('not-json').toString('base64')
      expect(() => decodeBase64JSON(input)).toThrow(SyntaxError)
    })
  })
})
