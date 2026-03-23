# publish-android-release

[![Build](https://github.com/deep-rent/publish-android-release/actions/workflows/build.yml/badge.svg)](https://github.com/deep-rent/publish-android-release/actions/workflows/build.yml)
![Coverage](.github/assets/coverage.svg)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/license/mit)

A GitHub Action that automatically builds, signs, and uploads an **Android App Bundle** (AAB) to the **Google Play Console**. Originally created for Capacitor apps, this action streamlines your CI/CD pipeline by handling the entire Android release process for any Android project.

## Features

Explore the core capabilities that make this action a powerful tool for your deployment workflow:

- Builds your Android project using Gradle.
- Securely signs the generated AAB using a Java keystore.
- Uploads the signed AAB to the Google Play Console via the Google Play Developer API (v3).
- Automatically includes ProGuard/R8 mapping files for crash deobfuscation if found.
- Supports specifying the deployment track and status.

## Usage

Follow this example to integrate the action into your GitHub Actions workflow file:

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
          check-latest: true

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
          track: production
          status: completed
```

## Inputs

Configure these parameters to customize how the action builds and signs your application:

| Name | Required | Description |
|------|:--------:|-------------|
| `project-directory` | No | Path to the root Android project directory containing the `gradlew` executable.<br><br>**Default:** `.` |
| `keystore` | Yes | Base64-encoded string representation of your Android release keystore (`.jks` or `.keystore`) file. |
| `keystore-password` | Yes | The password required to unlock the Android keystore. |
| `key-alias` | Yes | The alias of the signing key stored within the keystore. |
| `key-password` | No | The password for the specific signing key alias.<br><br>**Default:** If omitted, the `keystore-password` value is used |
| `service-account` | Yes | The plain text JSON contents of the Google Cloud Service Account used to authenticate with the Google Play Developer API. |
| `package-name` | Yes | The application ID (package name) of the Android app (e.g., `com.example.app`). |
| `release-file` | No | The relative path to the generated Android App Bundle (AAB) file.<br><br>**Default:** `app/build/outputs/bundle/release/app-release.aab` |
| `mapping-file` | No | The relative path to the generated ProGuard/R8 `mapping.txt` file.<br><br>**Default:** `app/build/outputs/mapping/release/mapping.txt` |
| `track` | No | The Google Play track to publish the release to. Valid options: `internal`, `alpha`, `beta`, `production`.<br><br>**Default:** `internal` |
| `status` | No | The status of the release. Valid options: `completed`, `draft`, `halted`, `inProgress`.<br><br>**Default:** `completed` |

## Outputs

Access these values in subsequent steps of your workflow to track build artifacts:

| Name | Description |
|------|-------------|
| `version-code` | The assigned version code of the successfully uploaded Android App Bundle (AAB). |
| `aab-path` | The absolute local path to the generated and signed Android App Bundle (AAB) file. |

## Prerequisites

Before running the action, ensure you have these external assets and permissions ready.

### 1. Google Play Service Account

You must create a Service Account in the Google Cloud Console, grant it the necessary permissions in the Google Play Console, and generate a JSON key. Store the raw JSON content as a GitHub Secret.

### 2. Release Keystore

Encode your release `.jks` or `.keystore` file to Base64 and save it as a GitHub Secret.

```bash
# macOS
base64 -i release.jks | pbcopy

# Linux
base64 -w 0 release.jks > encoded.txt

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.jks")) | Set-Clipboard
```

## License

This project is open-source and available under the **MIT License**.

Feel free to use, modify, and distribute the code however you like! If you're curious about the specifics, you can find all the legal bits in the `LICENSE` file.

---

<p align="center">
  <a href="https://deep.rent">
  <img src=".github/assets/logo.svg" width=64 height=64 alt="deep.rent Logo">
  </a>
  </br>
  <strong>deep.rent</strong>
</p>
