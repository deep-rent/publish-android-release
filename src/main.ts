/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import * as core from '@actions/core'
import { getConfig, ActionConfig } from './config.js'
import { createKeystore, cleanup } from './keystore.js'
import { build } from './build.js'
import { publish } from './publish.js'

/**
 * Main entry point for the GitHub Action.
 * This function orchestrates the keystore generation, Gradle build, Google Play
 * Store upload, and cleanup.
 */
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
