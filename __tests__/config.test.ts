/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import { jest } from '@jest/globals'
import * as path from 'node:path'

const fsActual = await import('node:fs')

jest.unstable_mockModule('@actions/core', () => ({
  getInput: jest.fn(),
}))
jest.unstable_mockModule('node:fs', () => ({
  ...fsActual,
  existsSync: jest.fn(),
}))

const core = await import('@actions/core')
const { existsSync } = await import('node:fs')
const { getConfig, INPUTS } = await import('../src/config.js')

describe('config', () => {
  const serviceAccountFixture = fsActual.readFileSync(
    path.resolve(import.meta.dirname, '../__fixtures__/service-account.json'),
    'utf8',
  )

  const mockedExistsSync = jest.mocked(existsSync)
  beforeEach(() => {
    jest.clearAllMocks()
    mockedExistsSync.mockReturnValue(true)
    ;(core.getInput as jest.Mock).mockImplementation((name: unknown) => {
      switch (name) {
        case INPUTS.PROJECT_DIRECTORY:
          return './android'
        case INPUTS.TRACK:
          return 'production'
        case INPUTS.STATUS:
          return 'completed'
        case INPUTS.SERVICE_ACCOUNT:
          return serviceAccountFixture
        default:
          return 'some-value'
      }
    })
  })

  it('returns a valid configuration object', () => {
    const config = getConfig()
    expect(config.projectDirectory).toBe('./android')
    expect(config.track).toBe('production')
    expect(config.status).toBe('completed')
  })

  it('throws an error if the project directory does not exist', () => {
    mockedExistsSync.mockReturnValue(false)
    expect(() => getConfig()).toThrow(/Android directory not found/)
  })

  it('throws an error if an invalid track is provided', () => {
    ;(core.getInput as jest.Mock).mockImplementation((name: unknown) => {
      if (name === INPUTS.TRACK) return 'invalid-track'
      if (name === INPUTS.PROJECT_DIRECTORY) return './android'
      if (name === INPUTS.STATUS) return 'completed'
      if (name === INPUTS.SERVICE_ACCOUNT) return serviceAccountFixture
      return 'val'
    })
    expect(() => getConfig()).toThrow(/Invalid track: 'invalid-track'/)
  })

  it('throws an error if an invalid status is provided', () => {
    ;(core.getInput as jest.Mock).mockImplementation((name: unknown) => {
      if (name === INPUTS.TRACK) return 'production'
      if (name === INPUTS.STATUS) return 'invalid-status'
      if (name === INPUTS.SERVICE_ACCOUNT) return serviceAccountFixture
      return 'val'
    })
    expect(() => getConfig()).toThrow(/Invalid status: 'invalid-status'/)
  })

  it('throws an error if the service account is not valid JSON', () => {
    ;(core.getInput as jest.Mock).mockImplementation((name: unknown) => {
      if (name === INPUTS.SERVICE_ACCOUNT) return 'not-json'
      if (name === INPUTS.TRACK) return 'production'
      if (name === INPUTS.STATUS) return 'completed'
      return 'val'
    })
    expect(() => getConfig()).toThrow(/is not valid JSON/)
  })
})
