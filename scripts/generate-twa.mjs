// Generates the OSLIFE TWA (Trusted Web Activity) Android project directly via
// @bubblewrap/core's library API — bypassing the interactive `bubblewrap init`
// CLI entirely, since that command has no non-interactive/scriptable mode
// (verified by hand: piping newline-separated answers into its stdin doesn't
// work reliably, because inquirer.js renders it as a raw redrawing terminal
// UI rather than reading one line per prompt). Run once, from
// .github/workflows/twa-init.yml, to produce /twa; ordinary rebuilds after
// that just run Gradle against the already-generated project (twa-build.yml).
//
// Usage: node scripts/generate-twa.mjs
// Required env: TWA_BASE_URL, TWA_HOST, TWA_TARGET_DIR, TWA_JDK_PATH,
//               TWA_KEYSTORE_PASSWORD, TWA_KEY_PASSWORD

import path from 'node:path'
import { TwaManifest, TwaGenerator, KeyTool, JdkHelper, Config, ConsoleLog } from '@bubblewrap/core'

const required = ['TWA_BASE_URL', 'TWA_HOST', 'TWA_TARGET_DIR', 'TWA_JDK_PATH', 'TWA_KEYSTORE_PASSWORD', 'TWA_KEY_PASSWORD']
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`)
    process.exit(1)
  }
}

const base = process.env.TWA_BASE_URL // e.g. https://oslife-iota.vercel.app
const host = process.env.TWA_HOST // e.g. oslife-iota.vercel.app
const targetDir = process.env.TWA_TARGET_DIR
const keystoreAbsolutePath = path.join(targetDir, 'android.keystore')

const twaManifest = new TwaManifest({
  packageId: 'nl.oslife.app',
  host,
  name: 'OSLIFE',
  launcherName: 'OSLIFE',
  display: 'standalone',
  themeColor: '#0a0a0a',
  navigationColor: '#0a0a0a',
  backgroundColor: '#0a0a0a',
  enableNotifications: false,
  startUrl: '/',
  iconUrl: `${base}/icons/icon-512.png`,
  maskableIconUrl: `${base}/icons/icon-maskable-512.png`,
  splashScreenFadeOutDuration: 300,
  // Relative to the generated project's own root, so `./gradlew` resolves it
  // correctly regardless of the caller's cwd.
  signingKey: { path: './android.keystore', alias: 'android' },
  appVersionCode: 1,
  appVersion: '1',
  generatorApp: 'oslife-script',
  webManifestUrl: `${base}/manifest.webmanifest`,
  fallbackType: 'customtabs',
  orientation: 'default',
  minSdkVersion: 21,
})

const log = new ConsoleLog('oslife-twa')
const config = new Config(process.env.TWA_JDK_PATH, process.env.TWA_ANDROID_SDK_PATH ?? '')
const jdkHelper = new JdkHelper(process, config)
const keytool = new KeyTool(jdkHelper)

console.log('Creating signing key...')
await keytool.createSigningKey({
  fullName: 'Rick',
  organizationalUnit: 'OSLIFE',
  organization: 'OSLIFE',
  country: 'NL',
  password: process.env.TWA_KEYSTORE_PASSWORD,
  keypassword: process.env.TWA_KEY_PASSWORD,
  alias: 'android',
  path: keystoreAbsolutePath,
})
console.log('Signing key created at', keystoreAbsolutePath)

console.log('Generating TWA project...')
const generator = new TwaGenerator()
await generator.createTwaProject(targetDir, twaManifest, log)
console.log('TWA project generated at', targetDir)

await twaManifest.saveToFile(path.join(targetDir, 'twa-manifest.json'))
console.log('Saved twa-manifest.json')
