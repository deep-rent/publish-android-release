import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'node:fs/promises'
import { existsSync, createReadStream } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { google } from 'googleapis'

const INPUTS = {
  PROJECT_DIRECTORY: 'project-directory',
  KEYSTORE: 'keystore',
  KEYSTORE_PASSWORD: 'keystore-password',
  KEY_ALIAS: 'key-alias',
  KEY_PASSWORD: 'key-password',
  SERVICE_ACCOUNT: 'service-account',
  PACKAGE_NAME: 'package-name',
  TRACK: 'track',
  STATUS: 'status',
} as const

const OUTPUTS = {
  VERSION_CODE: 'version-code',
  AAB_PATH: 'aab-path',
} as const

const VALID_TRACKS = ['internal', 'alpha', 'beta', 'production']
const VALID_STATUSES = ['completed', 'draft', 'halted', 'inProgress']

interface ActionConfig {
  projectDirectory: string
  keystore: string
  keystorePassword: string
  keyAlias: string
  keyPassword: string
  serviceAccount: string
  packageName: string
  track: string
  status: string
}

/**
 * Reads, parses, and validates all inputs from the GitHub Actions environment.
 */
function getConfig(): ActionConfig {
  const config: ActionConfig = {
    projectDirectory: core.getInput(INPUTS.PROJECT_DIRECTORY, {
      required: true,
    }),
    keystore: core.getInput(INPUTS.KEYSTORE, {
      required: true,
    }),
    keystorePassword: core.getInput(INPUTS.KEYSTORE_PASSWORD, {
      required: true,
    }),
    keyAlias: core.getInput(INPUTS.KEY_ALIAS, {
      required: true,
    }),
    keyPassword: core.getInput(INPUTS.KEY_PASSWORD, {
      required: true,
    }),
    serviceAccount: core.getInput(INPUTS.SERVICE_ACCOUNT, {
      required: true,
    }),
    packageName: core.getInput(INPUTS.PACKAGE_NAME, {
      required: true,
    }),
    track: core.getInput(INPUTS.TRACK, {
      required: true,
    }),
    status: core.getInput(INPUTS.STATUS, {
      required: true,
    }),
  }

  if (!existsSync(config.projectDirectory)) {
    throw new Error(`Android directory not found: ${config.projectDirectory}`)
  }

  if (!VALID_TRACKS.includes(config.track)) {
    const valid = VALID_TRACKS.join(', ')
    throw new Error(
      `Invalid track: '${config.track}'. Must be one of: ${valid}`,
    )
  }

  if (!VALID_STATUSES.includes(config.status)) {
    const valid = VALID_STATUSES.join(', ')
    throw new Error(
      `Invalid status: '${config.status}'. Must be one of: ${valid}`,
    )
  }

  try {
    JSON.parse(config.serviceAccount)
  } catch (error: unknown) {
    throw new Error(`${INPUTS.SERVICE_ACCOUNT} is not valid JSON.`, {
      cause: error,
    })
  }

  return config
}

/**
 * Decodes the Base64-encoded keystore and writes it to disk.
 * Returns the absolute path to the decoded file.
 */
async function createKeystore(base64Data: string): Promise<string> {
  core.info('Decoding and saving keystore securely...')
  const keystorePath = path.join(os.tmpdir(), `release_${Date.now()}.keystore`)

  try {
    const keystoreBuffer = Buffer.from(base64Data, 'base64')
    await fs.writeFile(keystorePath, keystoreBuffer)
    return keystorePath
  } catch (error: unknown) {
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
  const isWindows = os.platform() === 'win32'

  const gradlewPath = path.resolve(
    config.projectDirectory,
    isWindows ? 'gradlew.bat' : 'gradlew',
  )

  if (!existsSync(gradlewPath)) {
    throw new Error(`Gradle wrapper not found at ${gradlewPath}`)
  }

  if (!isWindows) {
    try {
      await fs.chmod(gradlewPath, 0o755)
    } catch (error: unknown) {
      throw new Error(`Failed to make gradlew executable`, { cause: error })
    }
  }

  const gradleArgs = [
    'bundleRelease',
    `-Pandroid.injected.signing.store.file=${keystorePath}`,
    `-Pandroid.injected.signing.store.password=${config.keystorePassword}`,
    `-Pandroid.injected.signing.key.alias=${config.keyAlias}`,
    `-Pandroid.injected.signing.key.password=${config.keyPassword}`,
  ]

  try {
    const exitCode: number = await exec.exec(gradlewPath, gradleArgs, {
      cwd: config.projectDirectory,
    })

    if (exitCode !== 0) {
      throw new Error(`Gradle build failed with exit code ${exitCode}`)
    }
  } catch (error: unknown) {
    throw new Error(`Failed to execute Gradle build`, { cause: error })
  }

  const aabPath = path.join(
    config.projectDirectory,
    'app/build/outputs/bundle/release/app-release.aab',
  )

  if (!existsSync(aabPath)) {
    throw new Error(
      `Build succeeded, but AAB file not found at expected path: ${aabPath}`,
    )
  }

  core.setOutput(OUTPUTS.AAB_PATH, aabPath)

  return aabPath
}

/**
 * Handles the Google Play Developer API transaction for publishing the artifact
 * and mapping file.
 */
async function publish(config: ActionConfig, aabPath: string): Promise<void> {
  core.info('Authenticating with Google Play...')
  const credentials = JSON.parse(config.serviceAccount)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  })

  const publisher = google.androidpublisher({ version: 'v3', auth })
  const { packageName, track, status } = config

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

    const mappingPath = path.join(
      config.projectDirectory,
      'app/build/outputs/mapping/release/mapping.txt',
    )

    if (existsSync(mappingPath)) {
      core.info('Found a mapping file! Uploading for crash deobfuscation...')
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

    core.info(`Assigning release to ${track} track with status '${status}'...`)
    await publisher.edits.tracks.update({
      packageName,
      editId,
      track: track,
      requestBody: {
        releases: [
          {
            versionCodes: [versionCode.toString()],
            status,
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
        '\n❌ VERSION CODE CONFLICT: The version code of this build already ' +
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
          packageName: config.packageName,
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

/**
 * Securely deletes sensitive files.
 */
async function cleanup(file: string): Promise<void> {
  if (file) {
    core.info(`Cleaning up temporary file: ${file}`)
    try {
      await fs.rm(file, { force: true })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      core.error(`Failed to delete temporary file ${file}: ${message}`)
    }
  }
}

export async function run(): Promise<void> {
  let keystorePath: string = ''

  try {
    const config: ActionConfig = getConfig()
    keystorePath = await createKeystore(config.keystore)
    const aabPath: string = await build(config, keystorePath)
    await publish(config, aabPath)
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.setFailed(error)
    } else {
      core.setFailed(`Action failed with an unknown error: ${String(error)}`)
    }
  } finally {
    await cleanup(keystorePath)
  }
}
