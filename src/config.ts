/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import * as core from '@actions/core'
import { existsSync } from 'node:fs'
import { decodeBase64, decodeBase64JSON } from './utils.js'

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
  USER_FRACTION: 'user-fraction',
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
  /** The decoded binary buffer of the signing keystore. */
  keystore: Buffer
  /** The password for the signing keystore. */
  keystorePassword: string
  /** The alias of the signing key. */
  keyAlias: string
  /** The password for the signing key. */
  keyPassword: string
  /** The decoded and parsed Google Cloud service account credentials object. */
  serviceAccount: object
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
  /** The fraction of users who will receive the release (between 0 and 1). */
  userFraction?: number
}

/**
 * Reads, parses, and validates all inputs from the GitHub Actions environment.
 *
 * @returns The validated configuration object.
 * @throws {Error} If the project directory is missing, inputs are invalid, or
 * the service account JSON is malformed.
 */
export function getConfig(): ActionConfig {
  // Helper functions to retrieve inputs from the GitHub Actions runner.
  function requiredInput(name: string): string {
    return core.getInput(name, { required: true })
  }
  function optionalInput(name: string): string {
    return core.getInput(name, { required: false })
  }

  // Retrieve and assign all raw inputs from the workflow environment.
  const projectDirectory = requiredInput(INPUTS.PROJECT_DIRECTORY)
  const rawKeystore = requiredInput(INPUTS.KEYSTORE)
  const keystorePassword = requiredInput(INPUTS.KEYSTORE_PASSWORD)
  const keyAlias = requiredInput(INPUTS.KEY_ALIAS)
  const rawKeyPassword = optionalInput(INPUTS.KEY_PASSWORD)
  const rawServiceAccount = requiredInput(INPUTS.SERVICE_ACCOUNT)
  const packageName = requiredInput(INPUTS.PACKAGE_NAME)
  const releaseFile = requiredInput(INPUTS.RELEASE_FILE)
  const mappingFile = requiredInput(INPUTS.MAPPING_FILE)
  const track = requiredInput(INPUTS.TRACK)
  const status = requiredInput(INPUTS.STATUS)
  const rawUserFraction = optionalInput(INPUTS.USER_FRACTION)

  // Ensure the specified project directory exists on the file system.
  if (!existsSync(projectDirectory)) {
    throw new Error(
      `Invalid ${INPUTS.PROJECT_DIRECTORY} input: path does not exist.`,
    )
  }

  // Decode the Base64-encoded keystore string back into a binary buffer.
  let keystore: Buffer
  try {
    keystore = decodeBase64(rawKeystore)
  } catch (error: unknown) {
    throw new Error(
      `Invalid ${INPUTS.KEYSTORE} input: expected a Base64 string.`,
      { cause: error },
    )
  }

  // Decode and parse the Base64-encoded service account into a JSON object.
  let serviceAccount: object
  try {
    serviceAccount = decodeBase64JSON(rawServiceAccount)
  } catch (error: unknown) {
    throw new Error(
      `Invalid ${INPUTS.SERVICE_ACCOUNT} input: expected a Base64 JSON string.`,
      { cause: error },
    )
  }

  // Validate that the provided track is one of the supported values.
  if (!VALID_TRACKS.includes(track)) {
    const valid = VALID_TRACKS.join(', ')
    throw new Error(
      `Invalid ${INPUTS.TRACK} input: '${track}'. Must be one of: ${valid}.`,
    )
  }

  // Validate that the provided release status is allowed.
  if (!VALID_STATUSES.includes(status)) {
    const valid = VALID_STATUSES.join(', ')
    throw new Error(
      `Invalid ${INPUTS.STATUS} input: '${status}'. Must be one of: ${valid}.`,
    )
  }

  // Validate and parse the optional user fraction property.
  let userFraction: number | undefined
  if (rawUserFraction) {
    userFraction = parseFloat(rawUserFraction)
    if (isNaN(userFraction) || userFraction <= 0 || userFraction >= 1) {
      throw new Error(
        `Invalid ${INPUTS.USER_FRACTION} input: '${rawUserFraction}'. ` +
          'Must be a number between 0 and 1 (exclusive).',
      )
    }
    if (status !== 'inProgress' && status !== 'halted') {
      throw new Error(
        `Invalid ${INPUTS.USER_FRACTION} input: user fraction can only be ` +
          `specified if status is 'inProgress' or 'halted'. ` +
          `Current status is '${status}'.`,
      )
    }
  }

  // Emit a log message if the keystore password is used as the key password.
  let keyPassword = rawKeyPassword
  if (keyPassword == null || keyPassword.length === 0) {
    core.info(
      `No ${INPUTS.KEY_PASSWORD} input provided. ` +
        `Falling back to ${INPUTS.KEYSTORE_PASSWORD}.`,
    )
    keyPassword = keystorePassword
  }

  // Return the fully validated and strongly-typed configuration object.
  return {
    projectDirectory,
    keystore,
    keystorePassword,
    keyAlias,
    keyPassword,
    serviceAccount,
    packageName,
    releaseFile,
    mappingFile,
    track,
    status,
    userFraction,
  }
}
