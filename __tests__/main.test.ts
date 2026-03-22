/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import { jest } from '@jest/globals'
import * as core from '@actions/core'
import { run } from '../src/main.js'
import * as configModule from '../src/config.js'
import * as keystoreModule from '../src/keystore.js'
import * as buildModule from '../src/build.js'
import * as publishModule from '../src/publish.js'

jest.mock('@actions/core')
jest.mock('../src/config.js')
jest.mock('../src/keystore.js')
jest.mock('../src/build.js')
jest.mock('../src/publish.js')

const mockedGetConfig = jest.mocked(configModule.getConfig)
const mockedCreateKeystore = jest.mocked(keystoreModule.createKeystore)
const mockedCleanup = jest.mocked(keystoreModule.cleanup)
const mockedBuild = jest.mocked(buildModule.build)
const mockedPublish = jest.mocked(publishModule.publish)

describe('main', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedGetConfig.mockReturnValue({
      keystore: 'base64',
    } as configModule.ActionConfig)
    mockedCreateKeystore.mockResolvedValue('/tmp/keystore.jks')
    mockedBuild.mockResolvedValue('/tmp/app-release.aab')
    mockedPublish.mockResolvedValue(undefined)
  })

  it('orchestrates the successful run of all modules', async () => {
    await run()

    expect(mockedGetConfig).toHaveBeenCalled()
    expect(mockedCreateKeystore).toHaveBeenCalledWith('base64')
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
