/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import { jest } from '@jest/globals'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { existsSync } from 'node:fs'
import * as os from 'node:os'
import { build } from '../src/build.js'
import { ActionConfig } from '../src/config.js'

jest.mock('@actions/core')
jest.mock('@actions/exec')
jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
}))
jest.mock('node:os')

describe('build', () => {
  const mockConfig = {
    projectDirectory: './android',
    keystorePassword: 'keystore-pass',
    keyAlias: 'my-alias',
    keyPassword: 'key-pass',
  } as ActionConfig

  const mockedExec = jest.mocked(exec)
  const mockedExistsSync = jest.mocked(existsSync)

  beforeEach(() => {
    jest.clearAllMocks()
    ;(os.platform as jest.Mock).mockReturnValue('linux')
    mockedExistsSync.mockReturnValue(true)
    mockedExec.exec.mockResolvedValue(0)
  })

  it('executes gradle, builds the aab, and returns the path', async () => {
    const result = await build(mockConfig, '/tmp/keystore.jks')

    expect(mockedExec.exec).toHaveBeenCalledWith(
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
    mockedExistsSync.mockImplementation(
      (path) => !String(path).includes('gradlew'),
    )

    await expect(build(mockConfig, '/tmp/keystore.jks')).rejects.toThrow(
      /Gradle wrapper not found/,
    )
  })

  it('throws an error if gradle execution fails', async () => {
    mockedExec.exec.mockResolvedValue(1) // Non-zero exit code

    await expect(build(mockConfig, '/tmp/keystore.jks')).rejects.toThrow(
      /Gradle build failed/,
    )
  })
})
