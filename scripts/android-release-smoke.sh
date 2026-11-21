#!/bin/bash
set -euo pipefail
adb shell pm disable-user --user 0 com.google.android.apps.nexuslauncher
adb install -r release/kromka-release.apk
adb shell am start -W -n ru.tokenapp.kromka/.MainActivity
ready=false
for attempt in {1..15}; do
  adb shell uiautomator dump /sdcard/kromka-release-window.xml > /dev/null
  adb pull /sdcard/kromka-release-window.xml release/window.xml > /dev/null
  if python3 - <<'PY'
import xml.etree.ElementTree as ET
root=ET.parse('release/window.xml').getroot()
labels=' '.join(n.attrib.get('text','')+' '+n.attrib.get('content-desc','') for n in root.iter())
raise SystemExit(0 if 'КРОМКА' in labels and 'Сегодня' in labels else 1)
PY
  then ready=true; break; fi
  sleep 1
done
test "$ready" = true
adb shell pidof ru.tokenapp.kromka
adb shell screencap -p /sdcard/kromka-release.png
adb pull /sdcard/kromka-release.png release/launch.png > /dev/null
adb shell dumpsys activity activities > release/activity.txt
# Record the actual installed app icon and label for store metadata review.
adb shell am start -W -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:ru.tokenapp.kromka
adb shell uiautomator dump /sdcard/kromka-app-info.xml > /dev/null
adb pull /sdcard/kromka-app-info.xml release/app-info.xml > /dev/null
adb shell screencap -p /sdcard/kromka-app-info.png
adb pull /sdcard/kromka-app-info.png release/app-info.png > /dev/null
