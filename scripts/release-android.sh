#!/bin/bash
set -e

DO_REGION="nyc3"
DO_ENDPOINT="https://${DO_REGION}.digitaloceanspaces.com"
DO_BUCKET="qvapaystatic"

VERSION=$(node -p "require('./app.json').version")
VERSION_CODE=$(node -p "require('./app.json').versionCode")
APK_NAME="QvaPay${VERSION_CODE}.apk"
AAB_NAME="QvaPay${VERSION_CODE}.aab"
APK_SOURCE="android/app/build/outputs/apk/release/app-release.apk"
AAB_SOURCE="android/app/build/outputs/bundle/release/app-release.aab"
S3_APK="s3://${DO_BUCKET}/app/${APK_NAME}"
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

echo "Building APK + AAB..."
cd android && ./gradlew assembleRelease bundleRelease && cd ..

echo "Renaming APK → ${APK_NAME}"
cp "${APK_SOURCE}" "${APK_NAME}"
echo "Renaming AAB → ${AAB_NAME}"
cp "${AAB_SOURCE}" "${AAB_NAME}"

echo "Uploading APK to DigitalOcean Spaces..."
aws s3 cp "${APK_NAME}" "${S3_APK}" --endpoint-url "${DO_ENDPOINT}" --acl public-read

echo "Tagging release ${TAG}..."
git tag "${TAG}"
git push origin "${TAG}"

echo "Creating GitHub Release..."
RELEASE_NOTES="QvaPay v${VERSION} (${VERSION_CODE})"
if [ -n "${CHANGELOG}" ]; then
  RELEASE_NOTES="${RELEASE_NOTES}

${CHANGELOG}"
fi
gh release create "${TAG}" "${APK_NAME}" "${AAB_NAME}" --title "QvaPay v${VERSION}" --notes "${RELEASE_NOTES}"

echo "Cleaning up..."
rm "${APK_NAME}" "${AAB_NAME}"

echo ""
echo "Done!"
echo "APK: https://${DO_BUCKET}.${DO_REGION}.digitaloceanspaces.com/app/${APK_NAME}"
echo "GitHub Release: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/${TAG}"
echo "Git tag: ${TAG}"
