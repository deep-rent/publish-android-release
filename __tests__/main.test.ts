/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import { jest } from '@jest/globals'
import type { ActionConfig } from '../src/config.js'

jest.unstable_mockModule('@actions/core', () => ({
  setFailed: jest.fn(),
}))
jest.unstable_mockModule('../src/config.js', () => ({
  getConfig: jest.fn(),
}))
jest.unstable_mockModule('../src/keystore.js', () => ({
  createKeystore: jest.fn(),
  cleanup: jest.fn(),
}))
jest.unstable_mockModule('../src/build.js', () => ({
  build: jest.fn(),
}))
jest.unstable_mockModule('../src/publish.js', () => ({
  publish: jest.fn(),
}))

const core = await import('@actions/core')
const configModule = await import('../src/config.js')
const keystoreModule = await import('../src/keystore.js')
const buildModule = await import('../src/build.js')
const publishModule = await import('../src/publish.js')
const { run } = await import('../src/main.js')

const mockedGetConfig = jest.mocked(configModule.getConfig)
const mockedCreateKeystore = jest.mocked(keystoreModule.createKeystore)
const mockedCleanup = jest.mocked(keystoreModule.cleanup)
const mockedBuild = jest.mocked(buildModule.build)
const mockedPublish = jest.mocked(publishModule.publish)

describe('main', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedGetConfig.mockReturnValue({
      keystore: Buffer.from('base64'),
    } as ActionConfig)
    mockedCreateKeystore.mockResolvedValue('/tmp/keystore.jks')
    mockedBuild.mockResolvedValue('/tmp/app-release.aab')
    mockedPublish.mockResolvedValue(undefined)
  })

  it('orchestrates the successful run of all modules', async () => {
    await run()

    expect(mockedGetConfig).toHaveBeenCalled()
    expect(mockedCreateKeystore).toHaveBeenCalledWith(expect.any(Buffer))
    expect(mockedBuild).toHaveBeenCalledWith(
      expect.any(Object),
      '/tmp/keystore.jks',
    )
    expect(mockedPublish).toHaveBeenCalledWith(
      expect.any(Object),
      '/tmp/app-release.aab',
    )
    expect(mockedCleanup).toHaveBeenCalledWith('/tmp/keystore.jks')
  })

  it('sets the action to failed if any step throws a standard Error', async () => {
    const error = new Error('Build failed critically')
    mockedBuild.mockRejectedValue(error)

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(error)
    expect(keystoreModule.cleanup).toHaveBeenCalledWith('/tmp/keystore.jks')
  })

  it('sets the action to failed if any step throws an unknown non-Error object', async () => {
    const unknownError = 'Some bizarre string exception'
    mockedBuild.mockRejectedValue(unknownError)

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Some bizarre string exception'),
    )
    expect(mockedCleanup).toHaveBeenCalledWith('/tmp/keystore.jks')
  })
})
