#!/bin/bash
set -uo pipefail
# Pixel Launcher's background startup can show an unrelated ANR over the app
# on a small CI runner. This disposable emulator only needs our test activity.
adb shell pm disable-user --user 0 com.google.android.apps.nexuslauncher || exit $?
status=0
./android/gradlew -p android :app:connectedDebugAndroidTest --no-daemon || status=$?
# AGP collects additionalTestOutputDir before uninstalling the test app.
exit "$status"
