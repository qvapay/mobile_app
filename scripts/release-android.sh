#!/bin/bash
set -e

DO_REGION="nyc3"
DO_ENDPOINT="https://${DO_REGION}.digitaloceanspaces.com"
DO_BUCKET="qvapaystatic"

VERSION=$(node -p "require('./app.json').version")
VERSION_CODE=$(node -p "require('./app.json').versionCode")
AAB_NAME="QvaPay${VERSION_CODE}.aab"
AAB_SOURCE="android/app/build/outputs/bundle/release/app-release.aab"
# Los deja scripts/build-android-apks.sh: arm64-v8a, armeabi-v7a y el universal,
# que conserva el nombre de siempre (QvaPay<versionCode>.apk)
APK_DIR="android/app/build/outputs/apk/dist"
APK_FILES="QvaPay${VERSION_CODE}.apk QvaPay${VERSION_CODE}-arm64-v8a.apk QvaPay${VERSION_CODE}-armeabi-v7a.apk"
TAG="v${VERSION}"

# Generate changelog since last tag (or last version bump commit as fallback)
PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || true)
if [ -n "${PREV_TAG}" ]; then
  CHANGELOG=$(git log "${PREV_TAG}..HEAD" --oneline --no-decorate 2>/dev/null)
else
  PREV_VERSION_COMMIT=$(git log --oneline --grep="Update app version" -1 --format="%H")
  if [ -n "${PREV_VERSION_COMMIT}" ]; then
    CHANGELOG=$(git log "${PREV_VERSION_COMMIT}..HEAD" --oneline --no-decorate 2>/dev/null)
  fi
fi

echo ""
echo "================================="
echo "  QvaPay v${VERSION} (${VERSION_CODE})"
echo "================================="
echo ""

if [ -n "${CHANGELOG}" ]; then
  echo "Changelog:"
  echo "${CHANGELOG}" | while read -r line; do echo "  - ${line}"; done
  echo ""
else
  echo "Changelog: No new commits since last version bump."
  echo ""
fi

# El AAB va en su propia invocación: -PdistApk (.so comprimidas, solo es/en/pt) y
# el filtro de arquitecturas de los APK no deben llegar a Play.
echo "Building AAB..."
(cd android && ./gradlew bundleRelease)
echo "Building APKs (uno por arquitectura + universal)..."
bash scripts/build-android-apks.sh

for f in ${APK_FILES}; do
  cp "${APK_DIR}/${f}" "${f}"
done
echo "Renaming AAB → ${AAB_NAME}"
cp "${AAB_SOURCE}" "${AAB_NAME}"

echo "Uploading APKs to DigitalOcean Spaces..."
for f in ${APK_FILES}; do
  aws s3 cp "${f}" "s3://${DO_BUCKET}/app/${f}" --endpoint-url "${DO_ENDPOINT}" --acl public-read
done

echo "Tagging release ${TAG}..."
git tag "${TAG}"
git push origin "${TAG}"

echo "Creating GitHub Release..."
RELEASE_NOTES="QvaPay v${VERSION} (${VERSION_CODE})"
if [ -n "${CHANGELOG}" ]; then
  RELEASE_NOTES="${RELEASE_NOTES}

${CHANGELOG}"
fi
# shellcheck disable=SC2086 # APK_FILES es una lista de nombres sin espacios
gh release create "${TAG}" ${APK_FILES} "${AAB_NAME}" --title "QvaPay v${VERSION}" --notes "${RELEASE_NOTES}"

echo "Cleaning up..."
# shellcheck disable=SC2086
rm ${APK_FILES} "${AAB_NAME}"

echo ""
echo "Done!"
for f in ${APK_FILES}; do
  echo "APK: https://${DO_BUCKET}.${DO_REGION}.digitaloceanspaces.com/app/${f}"
done
echo "GitHub Release: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/${TAG}"
echo "Git tag: ${TAG}"
