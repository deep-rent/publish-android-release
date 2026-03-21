import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as path from 'path'
import { google } from 'googleapis'

export async function run(): Promise<void> {
  let keystorePath: string = ''

  try {
    // 1. Gather Inputs with explicit string types
    const androidDirectory: string = core.getInput('androidDirectory', {
      required: true,
    })
    const keystoreBase64: string = core.getInput('keystoreBase64', {
      required: true,
    })
    const keystorePassword: string = core.getInput('keystorePassword', {
      required: true,
    })
    const keyAlias: string = core.getInput('keyAlias', { required: true })
    const keyPassword: string = core.getInput('keyPassword', { required: true })

    const serviceAccountJson: string = core.getInput(
      'serviceAccountJsonPlainText',
      { required: true },
    )
    const packageName: string = core.getInput('packageName', { required: true })
    const track: string = core.getInput('track', { required: true })
    const status: string = core.getInput('status', { required: true })

    // 2. Decode and save the Keystore securely
    core.info('Decoding keystore...')
    keystorePath = path.join(androidDirectory, 'temp_release.keystore')
    const keystoreBuffer: Buffer = Buffer.from(keystoreBase64, 'base64')
    fs.writeFileSync(keystorePath, keystoreBuffer)

    // 3. Make gradlew executable and run the build
    core.info('Building and signing the AAB...')
    const gradlewPath: string = path.join(androidDirectory, 'gradlew')
    fs.chmodSync(gradlewPath, '755')

    await exec.exec(
      './gradlew',
      [
        'bundleRelease',
        `-Pandroid.injected.signing.store.file=${keystorePath}`,
        `-Pandroid.injected.signing.store.password=${keystorePassword}`,
        `-Pandroid.injected.signing.key.alias=${keyAlias}`,
        `-Pandroid.injected.signing.key.password=${keyPassword}`,
      ],
      { cwd: androidDirectory },
    )

    // 4. Locate the built AAB
    const aabPath: string = path.join(
      androidDirectory,
      'app/build/outputs/bundle/release/app-release.aab',
    )
    if (!fs.existsSync(aabPath)) {
      throw new Error(`AAB file not found at expected path: ${aabPath}`)
    }

    // 5. Authenticate with Google Play
    core.info('Authenticating with Google Play...')
    const credentials: Record<string, string> = JSON.parse(serviceAccountJson)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    })
    const androidPublisher = google.androidpublisher({ version: 'v3', auth })

    // 6. Create Edit, Upload, and Commit
    core.info(`Starting upload for ${packageName}...`)
    const edit = await androidPublisher.edits.insert({ packageName })

    // API response types can occasionally be null/undefined
    const editId: string | null | undefined = edit.data.id

    if (!editId) {
      throw new Error(
        'Failed to create an edit transaction. The Google Play API returned a null ID.',
      )
    }

    const uploadResult = await androidPublisher.edits.bundles.upload({
      packageName,
      editId,
      media: {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(aabPath),
      },
    })

    const versionCode: number | null | undefined = uploadResult.data.versionCode
    core.info(`Uploaded bundle with version code: ${versionCode}`)

    await androidPublisher.edits.tracks.update({
      packageName,
      editId,
      track,
      requestBody: {
        releases: [
          {
            versionCodes: [versionCode?.toString() || ''],
            status: status,
          },
        ],
      },
    })

    core.info('Committing changes to Google Play...')
    await androidPublisher.edits.commit({ packageName, editId })
    core.info('Upload complete!')
  } catch (error: unknown) {
    // Type narrowing for strictly typed error handling
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}`)
    } else {
      core.setFailed(`Action failed with an unknown error: ${String(error)}`)
    }
  } finally {
    // 7. Cleanup the keystore file (runs even if the workflow fails)
    if (keystorePath && fs.existsSync(keystorePath)) {
      core.info('Cleaning up keystore file...')
      fs.unlinkSync(keystorePath)
    }
  }
}
