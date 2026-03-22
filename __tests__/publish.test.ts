/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import { jest } from '@jest/globals'
import * as core from '@actions/core'
import * as fs from 'node:fs'
import { google } from 'googleapis'
import { publish } from '../src/publish.js'
import { ActionConfig, OUTPUTS } from '../src/config.js'

jest.mock('@actions/core')
jest.mock('node:fs')
jest.mock('googleapis')

describe('publish', () => {
  const mockConfig = {
    projectDirectory: './android',
    packageName: 'com.example.app',
    track: 'production',
    status: 'completed',
    serviceAccount: '{"client_email": "test@test.com"}',
  } as ActionConfig

  const mockInsert = jest.fn()
  const mockUploadBundle = jest.fn()
  const mockUploadMapping = jest.fn()
  const mockUpdateTrack = jest.fn()
  const mockCommit = jest.fn()
  const mockDelete = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(fs.existsSync as jest.Mock).mockReturnValue(false) // Mapping file not found by default
    ;(fs.createReadStream as jest.Mock).mockReturnValue('mock-stream')

    mockInsert.mockResolvedValue({ data: { id: 'test-edit-id' } } as never)
    mockUploadBundle.mockResolvedValue({ data: { versionCode: 123 } } as never)
    mockUploadMapping.mockResolvedValue({} as never)
    mockUpdateTrack.mockResolvedValue({} as never)
    mockCommit.mockResolvedValue({} as never)
    mockDelete.mockResolvedValue({} as never)
    ;(google.androidpublisher as jest.Mock).mockReturnValue({
      edits: {
        insert: mockInsert,
        bundles: { upload: mockUploadBundle },
        deobfuscationfiles: { upload: mockUploadMapping },
        tracks: { update: mockUpdateTrack },
        commit: mockCommit,
        delete: mockDelete,
      },
    })
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
    ;(fs.existsSync as jest.Mock).mockReturnValue(true) // Simulate mapping.txt exists

    await publish(mockConfig, '/tmp/app.aab')

    expect(mockUploadMapping).toHaveBeenCalledWith(
      expect.objectContaining({ apkVersionCode: 123 }),
    )
    expect(mockCommit).toHaveBeenCalled()
  })

  it('throws an error if the API returns no editId', async () => {
    mockInsert.mockResolvedValue({ data: {} } as never) // No ID returned

    await expect(publish(mockConfig, '/tmp/app.aab')).rejects.toThrow(
      /Failed to create an edit transaction/,
    )
  })

  it('throws an error if the API returns no versionCode', async () => {
    mockUploadBundle.mockResolvedValue({ data: {} } as never) // No versionCode returned

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

    mockUploadBundle.mockRejectedValue(conflictError as never)

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
    mockUpdateTrack.mockRejectedValue(genericError as never)

    await expect(publish(mockConfig, '/tmp/app.aab')).rejects.toThrow(
      /Failed during the upload/,
    )

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('clean up the orphaned edit transaction'),
    )
    expect(mockDelete).toHaveBeenCalled()
  })

  it('logs an error if cleaning up the orphaned transaction also fails', async () => {
    mockUploadBundle.mockRejectedValue(new Error('Initial failure') as never)
    mockDelete.mockRejectedValue(new Error('Cleanup failure') as never)

    await expect(publish(mockConfig, '/tmp/app.aab')).rejects.toThrow()
    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to clean up orphaned edit transaction: Error: Cleanup failure',
      ),
    )
  })
})
