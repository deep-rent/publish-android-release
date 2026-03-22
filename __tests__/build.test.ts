/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import { jest } from '@jest/globals'
import type { ActionConfig } from '../src/config.js'

jest.unstable_mockModule('@actions/core', () => ({
  info: jest.fn(),
  error: jest.fn(),
  setOutput: jest.fn(),
}))
jest.unstable_mockModule('@actions/exec', () => ({
  exec: jest.fn(),
}))
jest.unstable_mockModule('node:fs', () => ({
  existsSync: jest.fn(),
}))
jest.unstable_mockModule('node:fs/promises', () => ({
  chmod: jest.fn(),
}))
jest.unstable_mockModule('node:os', () => ({
  platform: jest.fn(),
}))

const core = await import('@actions/core')
const exec = await import('@actions/exec')
const { existsSync } = await import('node:fs')
const os = await import('node:os')
const { build } = await import('../src/build.js')

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
      /Failed to execute Gradle build/,
    )
  })
})
