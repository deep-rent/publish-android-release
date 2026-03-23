/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import * as core from '@actions/core'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

/**
 * Writes the decoded keystore buffer to disk.
 * Returns the absolute path to the decoded file.
 *
 * @param keystoreBuffer - The buffer representing the keystore file.
 * @returns A promise resolving to the absolute file path of the saved keystore.
 * @throws {Error} If writing the file to disk fails.
 */
export async function createKeystore(keystoreBuffer: Buffer): Promise<string> {
  core.info('Saving keystore securely...')
  const keystorePath = path.join(os.tmpdir(), `release_${Date.now()}.keystore`)

  try {
    await fs.writeFile(keystorePath, keystoreBuffer)
    return keystorePath
  } catch (error: unknown) {
    throw new Error('Failed to save keystore', { cause: error })
  }
}

/**
 * Securely deletes sensitive files.
 *
 * @param file - The path of the file to delete.
 */
export async function cleanup(file: string): Promise<void> {
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
