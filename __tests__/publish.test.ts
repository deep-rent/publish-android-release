/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import { jest } from '@jest/globals'
import type { ActionConfig } from '../src/config.js'

jest.unstable_mockModule('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  setOutput: jest.fn(),
}))
jest.unstable_mockModule('node:fs', () => ({
  existsSync: jest.fn(),
  createReadStream: jest.fn(),
}))
jest.unstable_mockModule('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn(),
    },
    androidpublisher: jest.fn(),
  },
}))

const core = await import('@actions/core')
const { existsSync, createReadStream } = await import('node:fs')
const { google } = await import('googleapis')
const { publish } = await import('../src/publish.js')
const { OUTPUTS } = await import('../src/config.js')

describe('publish', () => {
  const mockConfig = {
    projectDirectory: './android',
    keystore: Buffer.from('mock-keystore'),
    keystorePassword: 'mock-keystore-password',
    keyAlias: 'mock-key-alias',
    keyPassword: 'mock-key-password',
    serviceAccount: { client_email: 'test@test.com' },
    packageName: 'com.example.app',
    releaseFile: 'app/build/outputs/bundle/release/app-release.aab',
    mappingFile: 'app/build/outputs/mapping/release/mapping.txt',
    track: 'production',
    status: 'completed',
  } as ActionConfig
  const mockedExistsSync = jest.mocked(existsSync)
  const mockedCreateReadStream = jest.mocked(createReadStream)
  const mockedGoogle = jest.mocked(google)

  const mockInsert = jest.fn<(...args: unknown[]) => Promise<unknown>>()
  const mockUploadBundle = jest.fn<(...args: unknown[]) => Promise<unknown>>()
  const mockUploadMapping = jest.fn<(...args: unknown[]) => Promise<unknown>>()
  const mockUpdateTrack = jest.fn<(...args: unknown[]) => Promise<unknown>>()
  const mockCommit = jest.fn<(...args: unknown[]) => Promise<unknown>>()
  const mockDelete = jest.fn<(...args: unknown[]) => Promise<unknown>>()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedExistsSync.mockReturnValue(false) // Mapping file not found by default
    mockedCreateReadStream.mockReturnValue('mock-stream' as never)

    mockInsert.mockResolvedValue({ data: { id: 'test-edit-id' } })
    mockUploadBundle.mockResolvedValue({ data: { versionCode: 123 } })
    mockUploadMapping.mockResolvedValue({})
    mockUpdateTrack.mockResolvedValue({})
    mockCommit.mockResolvedValue({})
    mockDelete.mockResolvedValue({})
    mockedGoogle.androidpublisher.mockReturnValue({
      edits: {
        insert: mockInsert,
        bundles: { upload: mockUploadBundle },
        deobfuscationfiles: { upload: mockUploadMapping },
        tracks: { update: mockUpdateTrack },
        commit: mockCommit,
        delete: mockDelete,
      },
    } as never)
  })

  it('successfully publishes an AAB without a mapping file', async () => {
    await publish(mockConfig, '/tmp/app.aab')

    expect(mockInsert).toHaveBeenCalledWith({ packageName: 'com.example.app' })
    expect(mockUploadBundle).toHaveBeenCalled()
    expect(mockUpdateTrack).toHaveBeenCalledWith(
      expect.objectContaining({ track: 'production' }),
    )
    expect(mockCommit).toHaveBeenCalledWith({
      packageName: 'com.example.app',
      editId: 'test-edit-id',
    })
    expect(core.setOutput).toHaveBeenCalledWith(OUTPUTS.VERSION_CODE, '123')
    expect(mockUploadMapping).not.toHaveBeenCalled()
  })

  it('successfully publishes an AAB with a mapping file when present', async () => {
    mockedExistsSync.mockReturnValue(true) // Simulate mapping.txt exists

    await publish(mockConfig, '/tmp/app.aab')

    expect(mockUploadMapping).toHaveBeenCalledWith(
      expect.objectContaining({ apkVersionCode: 123 }),
    )
    expect(mockCommit).toHaveBeenCalled()
  })

  it('throws an error if the API returns no editId', async () => {
    mockInsert.mockResolvedValue({ data: {} }) // No ID returned

    await expect(publish(mockConfig, '/tmp/app.aab')).rejects.toThrow(
      /Failed to create an edit transaction/,
    )
  })

  it('throws an error if the API returns no versionCode', async () => {
    mockUploadBundle.mockResolvedValue({ data: {} }) // No versionCode returned

    await expect(publish(mockConfig, '/tmp/app.aab')).rejects.toThrow(
      /Failed during the upload/,
    )
    // Orphaned transaction should be cleaned up
    expect(mockDelete).toHaveBeenCalledWith({
      packageName: 'com.example.app',
      editId: 'test-edit-id',
    })
  })

  it('detects a version code conflict, logs appropriately, and cleans up the transaction', async () => {
    const conflictError = new Error(
      'APK specifies a version code that has already been used.',
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(conflictError as any).response = { status: 403 }

    mockUploadBundle.mockRejectedValue(conflictError)

    await expect(publish(mockConfig, '/tmp/app.aab')).rejects.toThrow()

    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('VERSION CODE CONFLICT'),
    )
    expect(mockDelete).toHaveBeenCalledWith({
      packageName: 'com.example.app',
      editId: 'test-edit-id',
    })
  })

  it('cleans up transactions on generic errors', async () => {
    const genericError = new Error('Network timeout')
    mockUpdateTrack.mockRejectedValue(genericError)

    await expect(publish(mockConfig, '/tmp/app.aab')).rejects.toThrow(
      /Failed during the upload/,
    )

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('clean up the orphaned edit transaction'),
    )
    expect(mockDelete).toHaveBeenCalled()
  })

  it('logs an error if cleaning up the orphaned transaction also fails', async () => {
    mockUploadBundle.mockRejectedValue(new Error('Initial failure'))
    mockDelete.mockRejectedValue(new Error('Cleanup failure'))

    await expect(publish(mockConfig, '/tmp/app.aab')).rejects.toThrow()
    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to clean up orphaned edit transaction: Error: Cleanup failure',
      ),
    )
  })
})
