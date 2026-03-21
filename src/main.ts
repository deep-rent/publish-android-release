import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'node:fs/promises'
import { existsSync, createReadStream } from 'node:fs'
import * as path from 'node:path'
import { google } from 'googleapis'

interface ActionConfig {
  androidDir: string
  keystoreBase64: string
  keystorePassword: string
  keyAlias: string
  keyPassword: string
  serviceAccountJson: string
  packageName: string
  track: string
  status: string
}

const VALID_TRACKS = ['internal', 'alpha', 'beta', 'production']
const VALID_STATUSES = ['completed', 'draft', 'halted', 'inProgress']

/**
 * Reads, parses, and validates all inputs from the GitHub Actions environment.
 */
function getConfig(): ActionConfig {
  const config: ActionConfig = {
    androidDir: core.getInput('androidDir', { required: true }),
    keystoreBase64: core.getInput('keystoreBase64', { required: true }),
    keystorePassword: core.getInput('keystorePassword', { required: true }),
    keyAlias: core.getInput('keyAlias', { required: true }),
    keyPassword: core.getInput('keyPassword', { required: true }),
    serviceAccountJson: core.getInput('serviceAccountJson', {
      required: true,
    }),
    packageName: core.getInput('packageName', { required: true }),
    track: core.getInput('track', { required: true }),
    status: core.getInput('status', { required: true }),
  }

  if (!existsSync(config.androidDir)) {
    throw new Error(`Android directory not found: ${config.androidDir}`)
  }

  if (!VALID_TRACKS.includes(config.track)) {
    throw new Error(
      `Invalid track: '${config.track}'. Must be one of: ${VALID_TRACKS.join(', ')}`,
    )
  }
  if (!VALID_STATUSES.includes(config.status)) {
    throw new Error(
      `Invalid status: '${config.status}'. Must be one of: ${VALID_STATUSES.join(', ')}`,
    )
  }

  try {
    JSON.parse(config.serviceAccountJson)
  } catch {
    throw new Error('serviceAccountJson is not valid JSON.')
  }

  return config
}

/**
 * Decodes the Base64-encoded keystore and writes it to disk.
 * Returns the absolute path to the decoded file.
 */
async function createKeystore(
  androidDir: string,
  base64Data: string,
): Promise<string> {
  core.info('Decoding and saving keystore securely...')
  const keystorePath = path.join(androidDir, 'temp_release.keystore')

  try {
    const keystoreBuffer = Buffer.from(base64Data, 'base64')
    await fs.writeFile(keystorePath, keystoreBuffer)
    return keystorePath
  } catch (error) {
    throw new Error('Failed to decode and save keystore', { cause: error })
  }
}

/**
 * Executes the Gradle build process to build and sign the AAB.
 * Returns the path to the generated AAB file.
 */
async function build(
  config: ActionConfig,
  keystorePath: string,
): Promise<string> {
  core.info('Building and signing the AAB...')
  const gradlewPath = path.join(config.androidDir, 'gradlew')

  if (!existsSync(gradlewPath)) {
    throw new Error(`gradlew executable not found at ${gradlewPath}`)
  }

  await fs.chmod(gradlewPath, '755')

  const gradleArgs = [
    'bundleRelease',
    `-Pandroid.injected.signing.store.file=${keystorePath}`,
    `-Pandroid.injected.signing.store.password=${config.keystorePassword}`,
    `-Pandroid.injected.signing.key.alias=${config.keyAlias}`,
    `-Pandroid.injected.signing.key.password=${config.keyPassword}`,
  ]

  const exitCode = await exec.exec('./gradlew', gradleArgs, {
    cwd: config.androidDir,
  })

  if (exitCode !== 0) {
    throw new Error(`Gradle build failed with exit code ${exitCode}`)
  }

  const artifact = path.join(
    config.androidDir,
    'app/build/outputs/bundle/release/app-release.aab',
  )
  if (!existsSync(artifact)) {
    throw new Error(
      `Build succeeded, but AAB file not found at expected path: ${artifact}`,
    )
  }

  return artifact
}

/**
 * Handles the Google Play Developer API transaction for publishing the artifact
 * to the Play Store.
 */
async function publish(config: ActionConfig, artifact: string): Promise<void> {
  core.info('Authenticating with Google Play...')
  const credentials = JSON.parse(config.serviceAccountJson)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  })

  const androidPublisher = google.androidpublisher({ version: 'v3', auth })

  core.info(`Starting upload transaction for ${config.packageName}...`)
  const edit = await androidPublisher.edits.insert({
    packageName: config.packageName,
  })
  const editId = edit.data.id

  if (!editId) {
    throw new Error(
      'Failed to create an edit transaction. The API returned a null ID.',
    )
  }

  try {
    core.info('Uploading App Bundle...')
    const uploadResult = await androidPublisher.edits.bundles.upload({
      packageName: config.packageName,
      editId,
      media: {
        mimeType: 'application/octet-stream',
        // createReadStream is performant for large files as it streams chunks
        body: createReadStream(artifact),
      },
    })

    const versionCode = uploadResult.data.versionCode
    core.info(`Uploaded bundle successfully. Version code: ${versionCode}`)

    core.info(
      `Assigning release to ${config.track} track with status '${config.status}'...`,
    )
    await androidPublisher.edits.tracks.update({
      packageName: config.packageName,
      editId,
      track: config.track,
      requestBody: {
        releases: [
          {
            versionCodes: [versionCode?.toString() || ''],
            status: config.status,
          },
        ],
      },
    })

    core.info('Committing changes to Google Play...')
    await androidPublisher.edits.commit({
      packageName: config.packageName,
      editId,
    })
    core.info('Upload transaction complete!')
  } catch (error) {
    core.warning(
      'An error occurred during the upload process. Attempting to clean up the orphaned edit transaction...',
    )
    // Attempt to delete the edit so it doesn't get stuck.
    try {
      await androidPublisher.edits.delete({
        packageName: config.packageName,
        editId,
      })
      core.info('Cleaned up orphaned edit transaction.')
    } catch {
      core.error('Failed to clean up orphaned edit transaction.')
    }
    throw error // Re-throw the original error to fail the action.
  }
}

/**
 * Securely deletes sensitive files.
 */
async function cleanupSecret(filePath: string): Promise<void> {
  if (filePath && existsSync(filePath)) {
    core.info(`Cleaning up temporary file: ${filePath}`)
    await fs.unlink(filePath)
  }
}

async function run(): Promise<void> {
  let keystorePath = ''

  try {
    const config = getConfig()
    keystorePath = await createKeystore(
      config.androidDir,
      config.keystoreBase64,
    )
    const artifact = await build(config, keystorePath)
    await publish(config, artifact)
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}`)
    } else {
      core.setFailed(`Action failed with an unknown error: ${String(error)}`)
    }
  } finally {
    // 5. Cleanup (Always executes)
    await cleanupSecret(keystorePath)
  }
}

run()
