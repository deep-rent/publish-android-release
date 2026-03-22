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

const mockedFs = jest.mocked(fs)

describe('keystore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createKeystore', () => {
    it('decodes base64 data and writes it to a temporary file', async () => {
      // "test" in base64 is "dGVzdA=="
      const result = await createKeystore('dGVzdA==')
      expect(mockedFs.writeFile).toHaveBeenCalled()
      expect(result).toMatch(/\.keystore$/)
    })
  })

  describe('cleanup', () => {
    it('removes the specified file forcefully', async () => {
      await cleanup('/tmp/file.keystore')
      expect(mockedFs.rm).toHaveBeenCalledWith('/tmp/file.keystore', {
        force: true,
      })
    })

    it('logs an error message if the file removal fails', async () => {
      mockedFs.rm.mockRejectedValue(new Error('rm failed'))
      await cleanup('/tmp/file.keystore')
      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining('rm failed'),
      )
      expect(core.info).toHaveBeenCalled() // verifies we tried cleaning up
    })
  })
})
