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
}

/**
 * Reads, parses, and validates all inputs from the GitHub Actions environment.
 *
 * @returns The validated configuration object.
 * @throws {Error} If the project directory is missing, inputs are invalid, or
 * the service account JSON is malformed.
 */
export function getConfig(): ActionConfig {
  function requiredInput(name: string): string {
    return core.getInput(name, { required: true })
  }
  function optionalInput(name: string): string {
    return core.getInput(name, { required: false })
  }

  const projectDirectory = requiredInput(INPUTS.PROJECT_DIRECTORY)
  const rawKeystore = requiredInput(INPUTS.KEYSTORE)
  const keystorePassword = requiredInput(INPUTS.KEYSTORE_PASSWORD)
  const keyAlias = requiredInput(INPUTS.KEY_ALIAS)
  const keyPassword = optionalInput(INPUTS.KEY_PASSWORD) || keystorePassword
  const rawServiceAccount = requiredInput(INPUTS.SERVICE_ACCOUNT)
  const packageName = requiredInput(INPUTS.PACKAGE_NAME)
  const releaseFile = requiredInput(INPUTS.RELEASE_FILE)
  const mappingFile = requiredInput(INPUTS.MAPPING_FILE)
  const track = requiredInput(INPUTS.TRACK)
  const status = requiredInput(INPUTS.STATUS)

  if (!existsSync(projectDirectory)) {
    throw new Error(
      `Invalid ${INPUTS.PROJECT_DIRECTORY} input: path does not exist`,
    )
  }

  let keystore: Buffer
  try {
    keystore = decodeBase64(rawKeystore)
  } catch (error: unknown) {
    throw new Error(
      `Invalid ${INPUTS.KEYSTORE} input: expected a Base64 string.`,
      { cause: error },
    )
  }

  let serviceAccount: object
  try {
    serviceAccount = decodeBase64JSON(rawServiceAccount)
  } catch (error: unknown) {
    throw new Error(
      `Invalid ${INPUTS.SERVICE_ACCOUNT} input: expected a Base64 JSON string.`,
      { cause: error },
    )
  }

  if (!VALID_TRACKS.includes(track)) {
    const valid = VALID_TRACKS.join(', ')
    throw new Error(
      `Invalid ${INPUTS.TRACK} input: '${track}'. Must be one of: ${valid}`,
    )
  }

  if (!VALID_STATUSES.includes(status)) {
    const valid = VALID_STATUSES.join(', ')
    throw new Error(
      `Invalid ${INPUTS.STATUS} input: '${status}'. Must be one of: ${valid}`,
    )
  }

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
  }
}
