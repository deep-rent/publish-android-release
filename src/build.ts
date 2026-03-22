/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { ActionConfig, OUTPUTS } from './config.js'

/**
 * Executes the Gradle build process to build and sign the AAB.
 * Returns the path to the generated AAB file.
 *
 * @param config - The validated action configuration.
 * @param keystorePath - The absolute path to the decoded keystore file.
 * @returns A promise resolving to the absolute file path of the generated AAB.
 * @throws {Error} If the gradle wrapper is not found, build fails, or the AAB
 * is missing.
 */
export async function build(
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

  const aabPath = path.join(config.projectDirectory, config.releaseFile)

  if (!existsSync(aabPath)) {
    throw new Error(
      `Build succeeded, but AAB file not found at expected path: ${aabPath}`,
    )
  }

  core.setOutput(OUTPUTS.AAB_PATH, aabPath)

  return aabPath
}
