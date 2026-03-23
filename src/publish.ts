/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import * as core from '@actions/core'
import { createReadStream, existsSync } from 'node:fs'
import * as path from 'node:path'
import { google } from 'googleapis'
import { ActionConfig, OUTPUTS } from './config.js'

/**
 * Handles the Google Play Developer API transaction for publishing the artifact
 * and optional mapping file.
 *
 * @param config - The validated action configuration.
 * @param aabPath - The absolute path to the generated AAB file to upload.
 * @throws {Error} If authentication, bundle upload, mapping upload, or commit
 * fails for some reason.
 */
export async function publish(
  config: ActionConfig,
  aabPath: string,
): Promise<void> {
  const {
    projectDirectory,
    serviceAccount,
    mappingFile,
    packageName,
    track,
    status,
    userFraction,
  } = config

  core.info('Authenticating with Google Play...')
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  })

  const publisher = google.androidpublisher({ version: 'v3', auth })

  core.info(`Starting upload transaction for ${packageName}...`)
  let editId: string | null | undefined
  try {
    const edit = await publisher.edits.insert({ packageName })
    editId = edit.data.id

    if (!editId) {
      throw new Error(
        'The Google Developer API did not return a valid edit ID.',
      )
    }
  } catch (error: unknown) {
    throw new Error(`Failed to create an edit transaction for ${packageName}`, {
      cause: error,
    })
  }

  try {
    core.info('Uploading application bundle...')
    const uploadResult = await publisher.edits.bundles.upload({
      packageName,
      editId,
      media: {
        mimeType: 'application/octet-stream',
        body: createReadStream(aabPath),
      },
    })

    const versionCode: number | null | undefined = uploadResult.data.versionCode
    if (versionCode == null) {
      throw new Error('Upload succeeded, but API returned a null version code.')
    }

    core.info(`Uploaded bundle successfully. Version code: ${versionCode}`)
    core.setOutput(OUTPUTS.VERSION_CODE, versionCode.toString())

    const mappingPath = path.join(projectDirectory, mappingFile)

    if (existsSync(mappingPath)) {
      core.info('Found a mapping file! Uploading for crash deobfuscation...')
      await publisher.edits.deobfuscationfiles.upload({
        packageName,
        editId,
        apkVersionCode: versionCode,
        deobfuscationFileType: 'proguard',
        media: {
          mimeType: 'application/octet-stream',
          body: createReadStream(mappingPath),
        },
      })
      core.info('Mapping file uploaded successfully.')
    } else {
      core.info(
        `No mapping file found at ${mappingFile}.` +
          'Skipping deobfuscation file upload.',
      )
    }

    core.info(`Assigning release to ${track} track with status '${status}'...`)
    if (userFraction !== undefined) {
      core.info(`Fraction of eligible users: ${userFraction}`)
    }
    await publisher.edits.tracks.update({
      packageName,
      editId,
      track,
      requestBody: {
        releases: [
          {
            versionCodes: [versionCode.toString()],
            status,
            userFraction,
          },
        ],
      },
    })

    core.info('Committing changes to Google Play...')
    await publisher.edits.commit({
      packageName,
      editId,
    })
    core.info('Upload transaction complete!')
  } catch (error: unknown) {
    const apiError = error as {
      response?: { status?: number }
      message?: string
    }

    if (
      apiError.response?.status === 403 &&
      apiError.message?.includes('already been used')
    ) {
      core.error(
        '\n❌ VERSION CODE CONFLICT - The version code of this build already ' +
          'exists on Google Play. Please increment your version code and try ' +
          'again.\n',
      )
    } else {
      core.warning(
        'An error occurred during the upload process. Attempting to ' +
          'clean up the orphaned edit transaction...',
      )
    }

    if (editId) {
      try {
        await publisher.edits.delete({
          packageName,
          editId,
        })
        core.info('Cleaned up orphaned edit transaction.')
      } catch (cleanError: unknown) {
        core.error(
          `Failed to clean up orphaned edit transaction: ${String(cleanError)}`,
        )
      }
    }

    throw new Error('Failed during the upload or commit process', {
      cause: error,
    })
  }
}
