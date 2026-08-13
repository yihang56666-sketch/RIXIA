import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const workspaceRoot = process.cwd()
const androidRoot = path.join(workspaceRoot, 'android')
const localToolchainRoot = path.join(workspaceRoot, '.mobile-toolchain')
const localJdkRoot = path.join(localToolchainRoot, 'jdk')
const localSdkRoot = path.join(localToolchainRoot, 'android-sdk')
const isWindows = process.platform === 'win32'
const doctorOnly = process.argv.includes('--doctor')

function powerShellQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function firstDirectory(parent) {
  if (!existsSync(parent)) return null
  return (
    readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name))[0] ?? null
  )
}

function findJdk() {
  const fromJavaHome = process.env.JAVA_HOME
  if (fromJavaHome && existsSync(path.join(fromJavaHome, 'bin', isWindows ? 'java.exe' : 'java'))) return fromJavaHome

  const localJdk = firstDirectory(localJdkRoot)
  if (localJdk && existsSync(path.join(localJdk, 'bin', isWindows ? 'java.exe' : 'java'))) return localJdk

  return null
}

function findAndroidSdk() {
  const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, localSdkRoot].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function getSdkStatus(sdkRoot) {
  const compileSdk = path.join(sdkRoot, 'platforms', 'android-36')
  const platformTools = path.join(sdkRoot, 'platform-tools')
  const buildToolsRoot = path.join(sdkRoot, 'build-tools')
  const buildTools =
    existsSync(buildToolsRoot) &&
    readdirSync(buildToolsRoot, { withFileTypes: true }).some((entry) => entry.isDirectory() && entry.name.startsWith('36.'))

  return {
    compileSdk36: existsSync(compileSdk),
    platformTools: existsSync(platformTools),
    buildTools36: Boolean(buildTools),
  }
}

function printDiagnosis(diagnosis) {
  console.log(JSON.stringify(diagnosis, null, 2))
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const needsPowerShellShell = isWindows && /\.(bat|cmd)$/i.test(command)
    const executable = needsPowerShellShell ? 'powershell.exe' : command
    const executableArgs = needsPowerShellShell
      ? [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `& ${powerShellQuote(command)} ${args.map(powerShellQuote).join(' ')}`,
        ]
      : args

    const child = spawn(executable, executableArgs, {
      cwd: options.cwd ?? workspaceRoot,
      env: options.env ?? process.env,
      shell: false,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

const jdkPath = findJdk()
const sdkPath = findAndroidSdk()
const sdkStatus = sdkPath ? getSdkStatus(sdkPath) : null
const missing = []

if (!existsSync(androidRoot)) missing.push('android project: run npm run mobile:sync first')
if (!jdkPath) missing.push('JDK 17+ or 21')
if (!sdkPath) missing.push('Android SDK')
if (sdkStatus && !sdkStatus.compileSdk36) missing.push('Android SDK platform android-36')
if (sdkStatus && !sdkStatus.buildTools36) missing.push('Android build-tools 36.x')
if (sdkStatus && !sdkStatus.platformTools) missing.push('Android platform-tools')

const diagnosis = {
  ok: missing.length === 0,
  mode: doctorOnly ? 'doctor' : 'build',
  jdkPath,
  sdkPath,
  sdkStatus,
  expectedApk: path.join(androidRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
  missing,
  nextStep:
    missing.length === 0
      ? 'Run npm run mobile:apk to build the debug APK.'
      : 'Install Android Studio with the Android SDK, or run npm run mobile:sdk:install after approving the SDK download and license, then rerun npm run mobile:apk.',
}

if (doctorOnly || missing.length > 0) {
  printDiagnosis(diagnosis)
  process.exit(doctorOnly ? 0 : 1)
}

const env = {
  ...process.env,
  JAVA_HOME: jdkPath,
  ANDROID_HOME: sdkPath,
  ANDROID_SDK_ROOT: sdkPath,
  PATH: `${path.join(jdkPath, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
}

await run(isWindows ? 'npm.cmd' : 'npm', ['run', 'mobile:sync'], { env })
await run(path.join(androidRoot, isWindows ? 'gradlew.bat' : 'gradlew'), ['assembleDebug'], { cwd: androidRoot, env })

if (!existsSync(diagnosis.expectedApk)) {
  throw new Error(`Gradle finished but APK was not found at ${diagnosis.expectedApk}`)
}

console.log(JSON.stringify({ ...diagnosis, builtApk: diagnosis.expectedApk }, null, 2))
