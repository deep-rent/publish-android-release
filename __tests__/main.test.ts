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

describe('main', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(configModule.getConfig as jest.Mock).mockReturnValue({
      keystore: 'base64',
    })
    ;(keystoreModule.createKeystore as jest.Mock).mockResolvedValue(
      '/tmp/keystore.jks',
    )
    ;(buildModule.build as jest.Mock).mockResolvedValue('/tmp/app-release.aab')
    ;(publishModule.publish as jest.Mock).mockResolvedValue(undefined)
  })

  it('orchestrates the successful run of all modules', async () => {
    await run()

    expect(configModule.getConfig).toHaveBeenCalled()
    expect(keystoreModule.createKeystore).toHaveBeenCalledWith('base64')
    expect(buildModule.build).toHaveBeenCalledWith(
      expect.any(Object),
      '/tmp/keystore.jks',
    )
    expect(publishModule.publish).toHaveBeenCalledWith(
      expect.any(Object),
      '/tmp/app-release.aab',
    )
    expect(keystoreModule.cleanup).toHaveBeenCalledWith('/tmp/keystore.jks')
  })

  it('sets the action to failed if any step throws a standard Error', async () => {
    const error = new Error('Build failed critically')
    ;(buildModule.build as jest.Mock).mockRejectedValue(error)

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(error)
    expect(keystoreModule.cleanup).toHaveBeenCalledWith('/tmp/keystore.jks')
  })

  it('sets the action to failed if any step throws an unknown non-Error object', async () => {
    const unknownError = 'Some bizarre string exception'
    ;(buildModule.build as jest.Mock).mockRejectedValue(unknownError)

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Some bizarre string exception'),
    )
    expect(keystoreModule.cleanup).toHaveBeenCalledWith('/tmp/keystore.jks')
  })
})
