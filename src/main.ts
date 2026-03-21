import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'node:fs/promises'
import { existsSync, createReadStream } from 'node:fs'
import * as path from 'node:path'
import { google } from 'googleapis'

const INPUTS = {
  PROJECT_DIR: 'projectDir',
  KEYSTORE_BASE64: 'keystoreBase64',
  KEYSTORE_PASSWORD: 'keystorePassword',
  KEY_ALIAS: 'keyAlias',
  KEY_PASSWORD: 'keyPassword',
  SERVICE_ACCOUNT_JSON: 'serviceAccountJson',
  PACKAGE_NAME: 'packageName',
  TRACK: 'track',
  STATUS: 'status',
} as const

const OUTPUTS = {
  VERSION_CODE: 'versionCode',
  ARTIFACT: 'artifact',
} as const

const VALID_TRACKS = ['internal', 'alpha', 'beta', 'production']
const VALID_STATUSES = ['completed', 'draft', 'halted', 'inProgress']

interface ActionConfig {
  projectDir: string
  keystoreBase64: string
  keystorePassword: string
  keyAlias: string
  keyPassword: string
  serviceAccountJson: string
  packageName: string
  track: string
  status: string
}

/**
 * Reads, parses, and validates all inputs from the GitHub Actions environment.
 */
function getConfig(): ActionConfig {
  const config: ActionConfig = {
    projectDir: core.getInput(INPUTS.PROJECT_DIR, { required: true }),
    keystoreBase64: core.getInput(INPUTS.KEYSTORE_BASE64, { required: true }),
    keystorePassword: core.getInput(INPUTS.KEYSTORE_PASSWORD, {
      required: true,
    }),
    keyAlias: core.getInput(INPUTS.KEY_ALIAS, { required: true }),
    keyPassword: core.getInput(INPUTS.KEY_PASSWORD, { required: true }),
    serviceAccountJson: core.getInput(INPUTS.SERVICE_ACCOUNT_JSON, {
      required: true,
    }),
    packageName: core.getInput(INPUTS.PACKAGE_NAME, { required: true }),
    track: core.getInput(INPUTS.TRACK, { required: true }),
    status: core.getInput(INPUTS.STATUS, { required: true }),
  }

  if (!existsSync(config.projectDir)) {
    throw new Error(`Project directory not found: ${config.projectDir}`)
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
  } catch (error) {
    throw new Error(`${INPUTS.SERVICE_ACCOUNT_JSON} is not valid JSON.`, {
      cause: error,
    })
  }

  return config
}

/**
 * Decodes the Base64-encoded keystore and writes it to disk.
 * Returns the absolute path to the decoded file.
 */
async function createKeystore(
  projectDir: string,
  base64Data: string,
): Promise<string> {
  core.info('Decoding and saving keystore securely...')
  const keystorePath = path.join(projectDir, 'temp_release.keystore')

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
  const gradlewPath = path.join(config.projectDir, 'gradlew')

  if (!existsSync(gradlewPath)) {
    throw new Error(`gradlew executable not found at ${gradlewPath}`)
  }

  try {
    await fs.chmod(gradlewPath, '755')
  } catch (error) {
    throw new Error(`Failed to make gradlew executable`, { cause: error })
  }

  const gradleArgs = [
    'bundleRelease',
    `-Pandroid.injected.signing.store.file=${keystorePath}`,
    `-Pandroid.injected.signing.store.password=${config.keystorePassword}`,
    `-Pandroid.injected.signing.key.alias=${config.keyAlias}`,
    `-Pandroid.injected.signing.key.password=${config.keyPassword}`,
  ]

  try {
    const exitCode = await exec.exec('./gradlew', gradleArgs, {
      cwd: config.projectDir,
    })

    if (exitCode !== 0) {
      throw new Error(`Gradle build failed with exit code ${exitCode}`)
    }
  } catch (error) {
    throw new Error(`Failed to execute Gradle build`, { cause: error })
  }

  const artifact = path.join(
    config.projectDir,
    'app/build/outputs/bundle/release/app-release.aab',
  )

  if (!existsSync(artifact)) {
    throw new Error(
      `Build succeeded, but AAB file not found at expected path: ${artifact}`,
    )
  }

  core.setOutput(OUTPUTS.ARTIFACT, artifact)

  return artifact
}

/**
 * Handles the Google Play Developer API transaction for publishing the artifact and mapping file.
 */
async function publish(config: ActionConfig, artifact: string): Promise<void> {
  core.info('Authenticating with Google Play...')
  const credentials = JSON.parse(config.serviceAccountJson)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  })

  const publisher = google.androidpublisher({ version: 'v3', auth })

  core.info(`Starting upload transaction for ${config.packageName}...`)
  let editId: string | null | undefined

  try {
    const edit = await publisher.edits.insert({
      packageName: config.packageName,
    })
    editId = edit.data.id

    if (!editId) {
      throw new Error('The API returned a null edit ID.')
    }
  } catch (error) {
    throw new Error(
      `Failed to create an edit transaction for ${config.packageName}`,
      { cause: error },
    )
  }

  try {
    core.info('Uploading App Bundle...')
    const uploadResult = await publisher.edits.bundles.upload({
      packageName: config.packageName,
      editId,
      media: {
        mimeType: 'application/octet-stream',
        body: createReadStream(artifact),
      },
    })

    const versionCode = uploadResult.data.versionCode
    if (!versionCode) {
      throw new Error('Upload succeeded, but API returned a null version code.')
    }

    core.info(`Uploaded bundle successfully. Version code: ${versionCode}`)
    core.setOutput(OUTPUTS.VERSION_CODE, versionCode.toString())

    const mappingPath = path.join(
      config.projectDir,
      'app/build/outputs/mapping/release/mapping.txt',
    )

    if (existsSync(mappingPath)) {
      core.info('Found mapping.txt! Uploading for crash deobfuscation...')
      await publisher.edits.deobfuscationfiles.upload({
        packageName: config.packageName,
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
      core.info('No mapping.txt found. Skipping deobfuscation file upload.')
    }

    core.info(
      `Assigning release to ${config.track} track with status '${config.status}'...`,
    )
    await publisher.edits.tracks.update({
      packageName: config.packageName,
      editId,
      track: config.track,
      requestBody: {
        releases: [
          {
            versionCodes: [versionCode.toString()],
            status: config.status,
          },
        ],
      },
    })

    core.info('Committing changes to Google Play...')
    await publisher.edits.commit({
      packageName: config.packageName,
      editId,
    })
    core.info('Upload transaction complete!')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    // Check if the error is a Google API version code conflict.
    if (
      error.response &&
      error.response.status === 403 &&
      error.message.includes('already been used')
    ) {
      core.error(
        '\n❌ VERSION CODE CONFLICT: The version code of this build already exists on Google Play. Please increment your version code and try again.\n',
      )
    } else {
      core.warning(
        'An error occurred during the upload process. Attempting to clean up the orphaned edit transaction...',
      )
    }

    if (editId) {
      try {
        await publisher.edits.delete({
          packageName: config.packageName,
          editId,
        })
        core.info('Cleaned up orphaned edit transaction.')
      } catch (cleanupError) {
        core.error(
          `Failed to clean up orphaned edit transaction. ${String(cleanupError)}`,
        )
      }
    }

    throw new Error('Failed during the upload or commit process', {
      cause: error,
    })
  }
}

/**
 * Securely deletes sensitive files.
 */
async function cleanup(file: string): Promise<void> {
  if (file && existsSync(file)) {
    core.info(`Cleaning up temporary file: ${file}`)
    try {
      await fs.unlink(file)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      core.error(`Failed to delete temporary file ${file}: ${msg}`)
    }
  }
}

export async function run(): Promise<void> {
  let keystorePath = ''

  try {
    const config = getConfig()
    keystorePath = await createKeystore(
      config.projectDir,
      config.keystoreBase64,
    )
    const artifact = await build(config, keystorePath)
    await publish(config, artifact)
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.setFailed(
        `Action failed: ${error.message}\nCause: ${error.cause ? String(error.cause) : 'N/A'}`,
      )
    } else {
      core.setFailed(`Action failed with an unknown error: ${String(error)}`)
    }
  } finally {
    await cleanup(keystorePath)
  }
}
