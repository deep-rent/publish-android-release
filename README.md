# publish-android-release

![Coverage](.github/assets/coverage.svg)

A GitHub Action that automatically builds, signs, and uploads an Android App Bundle (AAB) to the Google Play Console. This action streamlines your CI/CD pipeline by handling the entire Android release process, including optional ProGuard/R8 mapping file uploads for crash deobfuscation.

## Features
- Builds your Android project using Gradle.
- Securely signs the generated AAB using a Base64-encoded keystore.
- Uploads the signed AAB to the Google Play Console via the Google Play Developer API.
- Automatically uploads ProGuard/R8 mapping files if found.
- Supports specifying the deployment track (`internal`, `alpha`, `beta`, `production`) and status.

## Usage

```yaml
name: Deploy Android Release
on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v6

      - name: Set up JDK
        uses: actions/setup-java@v5
        with:
          distribution: 'zulu'
          java-version: '21'

      - name: Publish to Google Play
        uses: deep-rent/publish-android-release@v1
        with:
          project-directory: './apps/example-app'
          package-name: 'com.example.app'
          keystore: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          keystore-password: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          key-alias: ${{ secrets.ANDROID_KEY_ALIAS }}
          key-password: ${{ secrets.ANDROID_KEY_PASSWORD }}
          service-account: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON }}
          track: internal
          status: completed
```

## Inputs

| Name | Required | Default | Description |
|------|:--------:|---------|-------------|
| `project-directory` | No | `.` | Path to the root Android project directory containing the `gradlew` executable. |
| `keystore` | **Yes** | | Base64-encoded string representation of your Android release keystore (`.jks` or `.keystore`) file. |
| `keystore-password` | **Yes** | | The password required to unlock the Android keystore. |
| `key-alias` | **Yes** | | The alias of the signing key stored within the keystore. |
| `key-password` | **Yes** | | The password for the specific signing key alias. |
| `service-account` | **Yes** | | The plain text JSON contents of the Google Cloud Service Account used to authenticate with the Google Play Developer API. |
| `package-name` | **Yes** | | The application ID (package name) of the Android app (e.g., `com.example.app`). |
| `release-file` | No | `* ` (see below) | The relative path to the generated Android App Bundle (AAB) file. |
| `mapping-file` | No | `**` (see below) | The relative path to the generated ProGuard/R8 `mapping.txt` file. |
| `track` | No | `internal` | The Google Play track to publish the release to. Valid options: `internal`, `alpha`, `beta`, `production`. |
| `status` | No | `completed` | The status of the release. Valid options: `completed`, `draft`, `halted`, `inProgress`. |

```
*    app/build/outputs/bundle/release/app-release.aab
**   app/build/outputs/mapping/release/mapping.txt
```

## Outputs

| Name | Description |
|------|-------------|
| `version-code` | The assigned version code of the successfully uploaded Android App Bundle (AAB). |
| `aab-path` | The absolute local path to the generated and signed Android App Bundle (AAB) file. |

## Prerequisites

1. **Google Play Service Account**: You must create a Service Account in Google Cloud Console, grant it permissions in the Google Play Console, and generate a JSON key. Store the raw JSON content as a GitHub Secret.
2. **Base64 Keystore**: Encode your release `.jks` or `.keystore` file to Base64 and store it as a GitHub Secret.
   ```bash
   # macOS
   base64 -i my-release-key.jks | pbcopy

   # Linux
   base64 -w 0 my-release-key.jks > encoded.txt
   ```

## License

MIT License - Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
