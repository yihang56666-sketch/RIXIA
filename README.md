# RIXIA

RIXIA is a local-first personal rhythm and productivity app for Android. It includes daily planning, inbox capture, tasks, habits, notes, countdowns, and a focus timer.

## Android APK

Download the debug APK from [release/RIXIA-0.1.0-debug.apk](release/RIXIA-0.1.0-debug.apk). On Android, allow installation from the browser or file manager when prompted.

## Features

- Local-only data storage
- Custom full-screen background image stored on-device
- Daily overview, tasks, habits, notes, countdowns, and focus timer
- Android adaptive launcher icon

## Development

```bash
npm install
npm run build
npm test
```

To build Android locally, install JDK 21 and Android SDK Platform 36 / Build Tools 36.0.0, then run:

```bash
npm run mobile:sync
cd android
./gradlew assembleDebug
```

The generated APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.
