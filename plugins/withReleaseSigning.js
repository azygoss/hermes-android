// Signs release builds with the keystore named by env vars, falling back to the debug key
// when they are absent (so `expo run:android --variant release` still works locally).
//   HERMES_KEYSTORE=/abs/path/release.keystore HERMES_KEYSTORE_PASSWORD=... HERMES_KEY_ALIAS=hermes-android
const { withAppBuildGradle } = require('expo/config-plugins')

const SIGNING = `
        release {
            if (System.getenv('HERMES_KEYSTORE')) {
                storeFile file(System.getenv('HERMES_KEYSTORE'))
                storePassword System.getenv('HERMES_KEYSTORE_PASSWORD')
                keyAlias System.getenv('HERMES_KEY_ALIAS') ?: 'hermes-android'
                keyPassword System.getenv('HERMES_KEY_PASSWORD') ?: System.getenv('HERMES_KEYSTORE_PASSWORD')
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }`

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents
    if (!gradle.includes("System.getenv('HERMES_KEYSTORE')")) {
      gradle = gradle.replace(/signingConfigs \{\n/, (m) => `${m}${SIGNING}\n`)
      gradle = gradle.replace(
        /(release \{\n\s*\/\/ Caution![^\n]*\n[^\n]*\n\s*)signingConfig signingConfigs\.debug/,
        '$1signingConfig signingConfigs.release',
      )
    }
    cfg.modResults.contents = gradle
    return cfg
  })
}
