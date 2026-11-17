# NEVA Android apps (APK)

Two installable apps from one source, both a Trusted Web Activity (TWA) around the PWA at
https://fathifarshad.github.io/Face-Aesthetics/ :

| Flavor | App name | Package | Opens |
|---|---|---|---|
| `doctor` | نوا | `com.nevaclinic.app` | `#/doctor` |
| `client` | نوا — مراجع | `com.nevaclinic.app.client` | `#/client` |

Why a TWA and not a WebView: the app shares files (`navigator.share`), downloads them, prints the report with
`window.print()` and uses the camera. A TWA runs the PWA inside Chrome, so all of this works exactly as in the
tested browser, and the offline cache (service worker) is the same. Photos stay on the phone as before.
Library: `com.google.androidbrowserhelper:androidbrowserhelper` 2.5.0 (Apache-2.0). Chrome must be installed.

## Build (Windows, no Android Studio needed)
The toolchain lives outside the repo in `..\..\android-tools` (JDK 17, Android SDK 35, Gradle 8.10.2):

```
npm run icons                        # launcher icons and splash from public/icon.svg
powershell -File scripts/build-apk.ps1
```

The script signs with the clinic key `..\..\android-signing\neva-release.p12` (password in `keystore-password.txt`
beside it). **Keep a backup of that folder**: every future update must be signed with the same key, and
`android/assetlinks.json` lists its SHA-256 fingerprint. The key never goes into the repo.

Output: `dist-apk/NEVA.apk` and `dist-apk/NEVA-Client.apk` (git-ignored). Raise `versionCode` in
`app/build.gradle` for every new release.

## Full screen (no address bar)
Chrome shows the app full screen only when the site proves it owns the app: the file `android/assetlinks.json` must
be served at `https://fathifarshad.github.io/.well-known/assetlinks.json` (the root of the GitHub user site, repo
`Fathifarshad/fathifarshad.github.io`, with an empty `.nojekyll` file so the dot folder is published). Until then
the app still works, with a thin address bar on top.
