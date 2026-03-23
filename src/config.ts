/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import * as core from '@actions/core'
import { existsSync } from 'node:fs'

/**
 * Expected input keys from the GitHub Actions workflow environment.
 */
export const INPUTS = {
  PROJECT_DIRECTORY: 'project-directory',
  KEYSTORE: 'keystore',
  KEYSTORE_PASSWORD: 'keystore-password',
  KEY_ALIAS: 'key-alias',
  KEY_PASSWORD: 'key-password',
  SERVICE_ACCOUNT: 'service-account',
  PACKAGE_NAME: 'package-name',
  RELEASE_FILE: 'release-file',
  MAPPING_FILE: 'mapping-file',
  TRACK: 'track',
  STATUS: 'status',
} as const

/**
 * Expected output keys from the GitHub Actions workflow environment.
 */
export const OUTPUTS = {
  VERSION_CODE: 'version-code',
  AAB_PATH: 'aab-path',
} as const

/** Allowed deployment tracks for the Google Play Console. */
const VALID_TRACKS = ['internal', 'alpha', 'beta', 'production']

/** Allowed release statuses for the Google Play Console. */
const VALID_STATUSES = ['completed', 'draft', 'halted', 'inProgress']

/**
 * Strongly typed configuration object containing all validated Action inputs.
 */
export interface ActionConfig {
  /** The path to the root of the Android project directory. */
  projectDirectory: string
  /** The Base64-encoded contents of the signing keystore. */
  keystore: string
  /** The password for the signing keystore. */
  keystorePassword: string
  /** The alias of the signing key. */
  keyAlias: string
  /** The password for the signing key. */
  keyPassword: string
  /** The JSON string of the Google Cloud service account credentials. */
  serviceAccount: string
  /** The application ID (package name) of the Android app. */
  packageName: string
  /** The relative path to the generated AAB file to upload. */
  releaseFile: string
  /** The relative path to the generated ProGuard/R8 mapping file. */
  mappingFile: string
  /** The Play Console track to deploy to (e.g., 'production', 'internal'). */
  track: string
  /** The status of the release (e.g., 'completed', 'draft'). */
  status: string
}

/**
 * Reads, parses, and validates all inputs from the GitHub Actions environment.
 *
 * @returns The validated configuration object.
 * @throws {Error} If the project directory is missing, inputs are invalid, or
 * the service account JSON is malformed.
 */
export function getConfig(): ActionConfig {
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
      required: false,
    }),
    serviceAccount: core.getInput(INPUTS.SERVICE_ACCOUNT, {
      required: true,
    }),
    packageName: core.getInput(INPUTS.PACKAGE_NAME, {
      required: true,
    }),
    releaseFile: core.getInput(INPUTS.RELEASE_FILE, {
      required: true,
    }),
    mappingFile: core.getInput(INPUTS.MAPPING_FILE, {
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

  // Often, the key and keystore password coincide.
  if (!config.keyPassword) config.keyPassword = config.keystorePassword

  try {
    JSON.parse(config.serviceAccount)
  } catch (error: unknown) {
    throw new Error(`${INPUTS.SERVICE_ACCOUNT} is not valid JSON.`, {
      cause: error,
    })
  }

  return config
}
