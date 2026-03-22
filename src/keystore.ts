import * as core from '@actions/core'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

/**
 * Decodes the Base64-encoded keystore and writes it to disk.
 * Returns the absolute path to the decoded file.
 *
 * @param base64Data - The base64 string representing the keystore file.
 * @returns A promise resolving to the absolute file path of the saved keystore.
 * @throws {Error} If writing the file to disk fails or decoding fails.
 */
export async function createKeystore(base64Data: string): Promise<string> {
  core.info('Decoding and saving keystore securely...')
  const keystorePath = path.join(os.tmpdir(), `release_${Date.now()}.keystore`)

  // Remove any whitespace or newlines that might have been accidentally
  // included.
  const sanitized = base64Data.replace(/[\s\r\n]+/g, '')

  // if (
  //   !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
  //     sanitized,
  //   )
  // ) {
  //   throw new Error(
  //     'The provided keystore is not a valid Base64 string. Please verify ' +
  //       'the corresponding GitHub Action secret.',
  //   )
  // }

  try {
    const keystoreBuffer = Buffer.from(sanitized, 'base64')
    await fs.writeFile(keystorePath, keystoreBuffer)
    return keystorePath
  } catch (error: unknown) {
    throw new Error('Failed to decode and save keystore', { cause: error })
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
