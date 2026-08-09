// Bubblewrap's generated app/build.gradle has no signingConfigs block at all
// (bubblewrap normally signs the APK itself, outside Gradle, via its own
// `bubblewrap build` command) — since twa-build.yml just runs plain Gradle
// instead, this wires up a release signingConfig referencing the committed
// android.keystore so `./gradlew assembleRelease` produces an already-signed
// APK, the same way android/app/build.gradle.kts does for the walk-tracker
// app's debug.keystore. Run once, right after generate-twa.mjs, from
// .github/workflows/twa-init.yml — safe to re-run (no-ops if already patched).
//
// Usage: node scripts/patch-twa-signing.mjs <targetDir> <keystorePassword>

import fs from 'node:fs'
import path from 'node:path'

const [, , targetDir, keystorePassword] = process.argv
if (!targetDir || !keystorePassword) {
  console.error('Usage: node scripts/patch-twa-signing.mjs <targetDir> <keystorePassword>')
  process.exit(1)
}

const gradleFile = path.join(targetDir, 'app', 'build.gradle')
let content = fs.readFileSync(gradleFile, 'utf8')

if (content.includes('signingConfigs {')) {
  console.log('build.gradle already patched, skipping.')
  process.exit(0)
}

const signingConfigsBlock = `android {
    signingConfigs {
        release {
            storeFile file('../android.keystore')
            storePassword '${keystorePassword}'
            keyAlias 'android'
            keyPassword '${keystorePassword}'
        }
    }
`
if (!content.includes('android {\n')) {
  console.error('Could not find "android {" block to patch — bubblewrap template may have changed.')
  process.exit(1)
}
content = content.replace('android {\n', signingConfigsBlock)

const oldReleaseBlock = `    buildTypes {
        release {
            minifyEnabled true
        }
    }`
const newReleaseBlock = `    buildTypes {
        release {
            minifyEnabled false
            signingConfig signingConfigs.release
        }
    }`
if (!content.includes(oldReleaseBlock)) {
  console.error('Could not find the expected release buildType block to patch — bubblewrap template may have changed.')
  process.exit(1)
}
content = content.replace(oldReleaseBlock, newReleaseBlock)

fs.writeFileSync(gradleFile, content)
console.log('Patched', gradleFile, 'with a release signingConfig.')
