#!/bin/bash
set -uo pipefail
status=0
./android/gradlew -p android :app:connectedDebugAndroidTest --no-daemon || status=$?
mkdir -p android/app/build/reports/smoke-screenshots
adb pull /sdcard/Android/data/ru.tokenapp.kromka/files/ android/app/build/reports/smoke-screenshots/ || true
exit "$status"
