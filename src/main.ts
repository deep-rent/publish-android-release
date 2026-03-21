import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import { existsSync, createReadStream } from 'fs'
import * as path from 'path'
import { google } from 'googleapis'

// --- Type Definitions ---

interface ActionConfig {
  androidDirectory: string
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

// --- Helper Functions ---

/**
 * Reads, parses, and validates all inputs from the GitHub Actions environment.
 */
function getConfig(): ActionConfig {
  const config: ActionConfig = {
    androidDirectory: core.getInput('androidDirectory', { required: true }),
    keystoreBase64: core.getInput('keystoreBase64', { required: true }),
    keystorePassword: core.getInput('keystorePassword', { required: true }),
    keyAlias: core.getInput('keyAlias', { required: true }),
    keyPassword: core.getInput('keyPassword', { required: true }),
    serviceAccountJson: core.getInput('serviceAccountJsonPlainText', {
      required: true,
    }),
    packageName: core.getInput('packageName', { required: true }),
    track: core.getInput('track', { required: true }),
    status: core.getInput('status', { required: true }),
  }

  // 1. Validate Directory Existence
  if (!existsSync(config.androidDirectory)) {
    throw new Error(`Android directory not found: ${config.androidDirectory}`)
  }

  // 2. Validate Enums
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

  // 3. Validate JSON format early
  try {
    JSON.parse(config.serviceAccountJson)
  } catch {
    throw new Error('serviceAccountJsonPlainText is not valid JSON.')
  }

  return config
}

/**
 * Decodes the base64 keystore and writes it to disk.
 * Returns the absolute path to the decoded file.
 */
async function setupKeystore(
  androidDir: string,
  base64Data: string,
): Promise<string> {
  core.info('Decoding and saving keystore securely...')
  const keystorePath = path.join(androidDir, 'temp_release.keystore')

  try {
    const keystoreBuffer = Buffer.from(base64Data, 'base64')
    // Use async writeFile for better Node.js event loop performance
    await fs.writeFile(keystorePath, keystoreBuffer)
    return keystorePath
  } catch (error) {
    throw new Error('Failed to decode and save keystore', { cause: error })
  }
}

/**
 * Executes the Gradle build process to generate the signed AAB.
 * Returns the path to the generated AAB file.
 */
async function buildAndSignAab(
  config: ActionConfig,
  keystorePath: string,
): Promise<string> {
  core.info('Building and signing the AAB...')
  const gradlewPath = path.join(config.androidDirectory, 'gradlew')

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
    cwd: config.androidDirectory,
  })

  if (exitCode !== 0) {
    throw new Error(`Gradle build failed with exit code ${exitCode}`)
  }

  const aabPath = path.join(
    config.androidDirectory,
    'app/build/outputs/bundle/release/app-release.aab',
  )
  if (!existsSync(aabPath)) {
    throw new Error(
      `Build succeeded, but AAB file not found at expected path: ${aabPath}`,
    )
  }

  return aabPath
}

/**
 * Handles the Google Play Developer API transaction.
 */
async function publishToGooglePlay(
  config: ActionConfig,
  aabPath: string,
): Promise<void> {
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
        body: createReadStream(aabPath),
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
    // Attempt to delete the edit so it doesn't get stuck in the Google Play Console
    try {
      await androidPublisher.edits.delete({
        packageName: config.packageName,
        editId,
      })
      core.info('Cleaned up orphaned edit transaction.')
    } catch {
      core.error('Failed to clean up orphaned edit transaction.')
    }
    throw error // Re-throw the original error to fail the action
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

// --- Main Execution ---

async function run(): Promise<void> {
  let keystorePath = ''

  try {
    // 1. Validate
    const config = getConfig()

    // 2. Prepare
    keystorePath = await setupKeystore(
      config.androidDirectory,
      config.keystoreBase64,
    )

    // 3. Execute Build
    const aabPath = await buildAndSignAab(config, keystorePath)

    // 4. Publish
    await publishToGooglePlay(config, aabPath)
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
