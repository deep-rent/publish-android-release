/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import { jest } from '@jest/globals'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { build } from '../src/build.js'
import { ActionConfig } from '../src/config.js'

jest.mock('@actions/core')
jest.mock('@actions/exec')
jest.mock('node:fs/promises')
jest.mock('node:fs')
jest.mock('node:os')

describe('build', () => {
  const mockConfig = {
    projectDirectory: './android',
    keystorePassword: 'keystore-pass',
    keyAlias: 'my-alias',
    keyPassword: 'key-pass',
  } as ActionConfig

  beforeEach(() => {
    jest.clearAllMocks()
    ;(os.platform as jest.Mock).mockReturnValue('linux')
    ;(fs.existsSync as jest.Mock).mockReturnValue(true)
    ;(exec.exec as jest.Mock).mockResolvedValue(0 as never)
  })

  it('executes gradle, builds the aab, and returns the path', async () => {
    const result = await build(mockConfig, '/tmp/keystore.jks')

    expect(exec.exec).toHaveBeenCalledWith(
      expect.stringContaining('gradlew'),
      expect.arrayContaining([
        'bundleRelease',
        '-Pandroid.injected.signing.store.file=/tmp/keystore.jks',
      ]),
      { cwd: './android' },
    )
    expect(core.setOutput).toHaveBeenCalled()
    expect(result).toMatch(/app-release\.aab$/)
  })

  it('throws an error if gradlew wrapper is not found', async () => {
    ;(fs.existsSync as jest.Mock).mockImplementation((path: unknown) => {
      return !String(path).includes('gradlew')
    })

    await expect(build(mockConfig, '/tmp/keystore.jks')).rejects.toThrow(
      /Gradle wrapper not found/,
    )
  })

  it('throws an error if gradle execution fails', async () => {
    ;(exec.exec as jest.Mock).mockResolvedValue(1 as never) // Non-zero exit code

    await expect(build(mockConfig, '/tmp/keystore.jks')).rejects.toThrow(
      /Gradle build failed/,
    )
  })
})
