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
  const serviceAccountFixture = Buffer.from(
    fsActual.readFileSync(
      path.resolve(import.meta.dirname, '../__fixtures__/service-account.json'),
      'utf8',
    ),
  ).toString('base64')

  const mockedExistsSync = jest.mocked(existsSync)
  beforeEach(() => {
    jest.clearAllMocks()
    mockedExistsSync.mockReturnValue(true)
    ;(core.getInput as jest.Mock).mockImplementation((name: unknown) => {
      switch (name) {
        case INPUTS.PROJECT_DIRECTORY:
          return './android'
        case INPUTS.RELEASE_FILE:
          return 'app/build/outputs/bundle/release/app-release.aab'
        case INPUTS.MAPPING_FILE:
          return 'app/build/outputs/mapping/release/mapping.txt'
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
    expect(config.releaseFile).toBe(
      'app/build/outputs/bundle/release/app-release.aab',
    )
    expect(config.mappingFile).toBe(
      'app/build/outputs/mapping/release/mapping.txt',
    )
    expect(config.track).toBe('production')
    expect(config.status).toBe('completed')
    expect(config.serviceAccount).toBeInstanceOf(Object)
    expect(
      (config.serviceAccount as { client_email: string }).client_email,
    ).toBe('github-actions@deep-rent.iam.gserviceaccount.com')
  })

  it('throws an error if the project directory does not exist', () => {
    mockedExistsSync.mockReturnValue(false)
    expect(() => getConfig()).toThrow(/Project directory not found/)
  })

  it('throws an error if an invalid track is provided', () => {
    ;(core.getInput as jest.Mock).mockImplementation((name: unknown) => {
      if (name === INPUTS.TRACK) return 'invalid-track'
      if (name === INPUTS.PROJECT_DIRECTORY) return './android'
      if (name === INPUTS.STATUS) return 'completed'
      if (name === INPUTS.SERVICE_ACCOUNT) return serviceAccountFixture
      return 'val'
    })
    expect(() => getConfig()).toThrow(/Invalid track input: 'invalid-track'/)
  })

  it('throws an error if an invalid status is provided', () => {
    ;(core.getInput as jest.Mock).mockImplementation((name: unknown) => {
      if (name === INPUTS.TRACK) return 'production'
      if (name === INPUTS.STATUS) return 'invalid-status'
      if (name === INPUTS.SERVICE_ACCOUNT) return serviceAccountFixture
      return 'val'
    })
    expect(() => getConfig()).toThrow(/Invalid status input: 'invalid-status'/)
  })

  it('throws an error if the service account is not a valid Base64-encoded JSON string', () => {
    ;(core.getInput as jest.Mock).mockImplementation((name: unknown) => {
      if (name === INPUTS.SERVICE_ACCOUNT)
        return Buffer.from('not-json').toString('base64')
      if (name === INPUTS.TRACK) return 'production'
      if (name === INPUTS.STATUS) return 'completed'
      return 'val'
    })
    expect(() => getConfig()).toThrow(/expected a Base64 JSON string/)
  })

  it('defaults key password to keystore password if not provided', () => {
    ;(core.getInput as jest.Mock).mockImplementation((name: unknown) => {
      if (name === INPUTS.KEY_PASSWORD) return ''
      if (name === INPUTS.KEYSTORE_PASSWORD) return 'secret-keystore-pass'
      if (name === INPUTS.PROJECT_DIRECTORY) return './android'
      if (name === INPUTS.TRACK) return 'production'
      if (name === INPUTS.STATUS) return 'completed'
      if (name === INPUTS.SERVICE_ACCOUNT) return serviceAccountFixture
      return 'val'
    })
    expect(getConfig().keyPassword).toBe('secret-keystore-pass')
  })
})
