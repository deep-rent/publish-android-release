/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import { jest } from '@jest/globals'
import * as core from '@actions/core'
import * as fs from 'node:fs/promises'
import { createKeystore, cleanup } from '../src/keystore.js'

jest.mock('@actions/core')
jest.mock('node:fs/promises')

describe('keystore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createKeystore', () => {
    it('decodes base64 data and writes it to a temporary file', async () => {
      // "test" in base64 is "dGVzdA=="
      const result = await createKeystore('dGVzdA==')
      expect(fs.writeFile).toHaveBeenCalled()
      expect(result).toMatch(/\.keystore$/)
    })
  })

  describe('cleanup', () => {
    it('removes the specified file forcefully', async () => {
      await cleanup('/tmp/file.keystore')
      expect(fs.rm).toHaveBeenCalledWith('/tmp/file.keystore', { force: true })
    })

    it('logs an error message if the file removal fails', async () => {
      ;(fs.rm as jest.Mock).mockRejectedValue(new Error('rm failed') as never)
      await cleanup('/tmp/file.keystore')
      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining('rm failed'),
      )
      expect(core.info).toHaveBeenCalled() // verifies we tried cleaning up
    })
  })
})
