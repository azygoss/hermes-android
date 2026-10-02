#!/usr/bin/env bash
# Build a signed release APK into dist/.
#   HERMES_KEYSTORE=~/.hermes-android/release.keystore HERMES_KEYSTORE_PASSWORD=... scripts/build-apk.sh
# Without HERMES_KEYSTORE the APK is signed with the debug key.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME=${ANDROID_HOME:-/opt/android-sdk}
ABIS=${ABIS:-arm64-v8a,armeabi-v7a}
VERSION=$(node -p "require('./app.json').expo.version")

if [[ ${SKIP_PREBUILD:-0} != 1 ]]; then
  CI=1 npx expo prebuild --platform android --clean
fi

(
  cd android
  ./gradlew assembleRelease \
    -PreactNativeArchitectures="$ABIS" \
    -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=1g" \
    --no-daemon
)

mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk "dist/hermes-android-v${VERSION}.apk"
echo "built dist/hermes-android-v${VERSION}.apk"
