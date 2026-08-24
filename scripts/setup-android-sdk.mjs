import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import { spawn } from 'node:child_process'

const workspaceRoot = process.cwd()
const toolchainRoot = path.join(workspaceRoot, '.mobile-toolchain')
const localJdkRoot = path.join(toolchainRoot, 'jdk')
const sdkRoot = path.join(toolchainRoot, 'android-sdk')
const cmdlineRoot = path.join(sdkRoot, 'cmdline-tools', 'latest')
const repoXmlUrl = 'https://dl.google.com/android/repository/repository2-1.xml'
const requiredPackages = ['platform-tools', 'platforms;android-36', 'build-tools;36.0.0']
const isWindows = process.platform === 'win32'
const mode = process.argv.includes('--install') ? 'install' : 'doctor'

async function firstDirectoryAsync(parent) {
  if (!existsSync(parent)) return null
  const entries = await readdir(parent, { withFileTypes: true })
  const first = entries.find((entry) => entry.isDirectory())
  return first ? path.join(parent, first.name) : null
}

async function findJdk() {
  const javaBinary = isWindows ? 'java.exe' : 'java'
  const fromEnv = process.env.JAVA_HOME
  if (fromEnv && existsSync(path.join(fromEnv, 'bin', javaBinary))) return fromEnv

  const localJdk = await firstDirectoryAsync(localJdkRoot)
  if (localJdk && existsSync(path.join(localJdk, 'bin', javaBinary))) return localJdk

  return null
}

function sdkmanagerPath() {
  const executable = isWindows ? 'sdkmanager.bat' : 'sdkmanager'
  return path.join(cmdlineRoot, 'bin', executable)
}

function getSdkStatus(jdkPath) {
  const compileSdk = path.join(sdkRoot, 'platforms', 'android-36')
  const platformTools = path.join(sdkRoot, 'platform-tools')
  const buildToolsRoot = path.join(sdkRoot, 'build-tools')
  const buildTools36 =
    existsSync(buildToolsRoot) &&
    readdirSyncSafe(buildToolsRoot).some((entry) => entry.isDirectory() && entry.name.startsWith('36.'))

  return {
    jdk: Boolean(jdkPath),
    sdkRoot: existsSync(sdkRoot),
    cmdlineTools: existsSync(sdkmanagerPath()),
    compileSdk36: existsSync(compileSdk),
    buildTools36: Boolean(buildTools36),
    platformTools: existsSync(platformTools),
  }
}

function readdirSyncSafe(directory) {
  try {
    return statSync(directory).isDirectory() ? readdirSync(directory, { withFileTypes: true }) : []
  } catch {
    return []
  }
}

function statusToMissing(status) {
  const missing = []
  if (!status.jdk) missing.push('JDK 17+ or 21')
  if (!status.sdkRoot) missing.push('local Android SDK root')
  if (!status.cmdlineTools) missing.push('Android command-line tools')
  if (!status.compileSdk36) missing.push('Android SDK platform android-36')
  if (!status.buildTools36) missing.push('Android build-tools 36.x')
  if (!status.platformTools) missing.push('Android platform-tools')
  return missing
}

function printDiagnosis({ jdkPath, status, archive } = {}) {
  const missing = statusToMissing(status)
  console.log(
    JSON.stringify(
      {
        ok: missing.length === 0,
        mode,
        jdkPath: jdkPath ?? null,
        sdkPath: sdkRoot,
        sdkmanager: sdkmanagerPath(),
        status,
        requiredPackages,
        commandLineToolsArchive: archive ?? null,
        missing,
        nextStep:
          missing.length === 0
            ? 'Run npm run mobile:apk to build android/app/build/outputs/apk/debug/app-debug.apk.'
            : 'Run npm run mobile:sdk:install after you approve the Android SDK download and license, then rerun npm run mobile:apk.',
      },
      null,
      2,
    ),
  )
}

function safeInsideToolchain(targetPath) {
  const root = path.resolve(toolchainRoot)
  const target = path.resolve(targetPath)
  return target === root || target.startsWith(`${root}${path.sep}`)
}

function safeRemove(targetPath) {
  if (!safeInsideToolchain(targetPath)) throw new Error(`Refusing to remove outside .mobile-toolchain: ${targetPath}`)
  if (existsSync(targetPath)) rmSync(targetPath, { recursive: true, force: true })
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          fetchText(new URL(response.headers.location, url).toString()).then(resolve, reject)
          return
        }
        if (response.statusCode !== 200) {
          reject(new Error(`GET ${url} returned ${response.statusCode}`))
          response.resume()
          return
        }

        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body += chunk
        })
        response.on('end', () => resolve(body))
      })
      .on('error', reject)
  })
}

function hostOs() {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'macosx'
  return 'linux'
}

function powerShellQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

async function resolveCommandLineToolsArchive() {
  const xml = await fetchText(repoXmlUrl)
  const packageMatch = xml.match(/<remotePackage\s+path="cmdline-tools;latest">([\s\S]*?)<\/remotePackage>/)
  if (!packageMatch) throw new Error('Could not find cmdline-tools;latest in Android repository metadata.')

  const archives = [...packageMatch[1].matchAll(/<archive>([\s\S]*?)<\/archive>/g)].map((match) => match[1])
  const archive = archives.find((item) => item.includes(`<host-os>${hostOs()}</host-os>`))
  if (!archive) throw new Error(`Could not find command-line tools archive for ${hostOs()}.`)

  const url = archive.match(/<url>([^<]+)<\/url>/)?.[1]
  const size = Number(archive.match(/<complete>\s*<size>(\d+)<\/size>/)?.[1] ?? 0)
  if (!url) throw new Error('Command-line tools archive is missing its download URL.')

  return {
    url: new URL(url, 'https://dl.google.com/android/repository/').toString(),
    fileName: path.basename(url),
    expectedBytes: Number.isFinite(size) && size > 0 ? size : null,
  }
}

function downloadFile(url, destination, expectedBytes) {
  const tempDestination = `${destination}.download`
  safeRemove(tempDestination)
  mkdirSync(path.dirname(destination), { recursive: true })

  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          downloadFile(new URL(response.headers.location, url).toString(), destination, expectedBytes).then(resolve, reject)
          return
        }
        if (response.statusCode !== 200) {
          reject(new Error(`GET ${url} returned ${response.statusCode}`))
          response.resume()
          return
        }

        const total = Number(response.headers['content-length'] ?? expectedBytes ?? 0)
        let downloaded = 0
        let lastReported = 0
        const stream = createWriteStream(tempDestination)

        response.on('data', (chunk) => {
          downloaded += chunk.length
          const nextReport = Math.floor(downloaded / (10 * 1024 * 1024))
          if (nextReport > lastReported) {
            lastReported = nextReport
            const totalText = total ? ` / ${(total / 1024 / 1024).toFixed(1)} MB` : ''
            console.log(`Downloaded ${(downloaded / 1024 / 1024).toFixed(1)} MB${totalText}`)
          }
        })

        response.pipe(stream)
        stream.on('finish', () => {
          stream.close(() => {
            if (expectedBytes && statSync(tempDestination).size !== expectedBytes) {
              reject(new Error(`Downloaded file size mismatch for ${path.basename(destination)}.`))
              return
            }
            safeRemove(destination)
            renameSync(tempDestination, destination)
            resolve()
          })
        })
        stream.on('error', reject)
      })
      .on('error', reject)
  })
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
      stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    })
    if (options.input) {
      child.stdin.write(options.input)
      child.stdin.end()
    }
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

async function ensureCommandLineTools(archive) {
  if (existsSync(sdkmanagerPath())) return

  const zipPath = path.join(toolchainRoot, archive.fileName)
  const hasCompleteZip = existsSync(zipPath) && (!archive.expectedBytes || statSync(zipPath).size === archive.expectedBytes)
  if (!hasCompleteZip) {
    console.log(`Downloading Android command-line tools from ${archive.url}`)
    await downloadFile(archive.url, zipPath, archive.expectedBytes)
  }

  const extractRoot = path.join(toolchainRoot, 'cmdline-tools-extract')
  safeRemove(extractRoot)
  mkdirSync(extractRoot, { recursive: true })

  if (isWindows) {
    await run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath ${powerShellQuote(zipPath)} -DestinationPath ${powerShellQuote(extractRoot)} -Force`,
    ])
  } else {
    await run('unzip', ['-q', zipPath, '-d', extractRoot])
  }

  const extractedTools = path.join(extractRoot, 'cmdline-tools')
  if (!existsSync(extractedTools)) throw new Error('Command-line tools archive did not contain cmdline-tools/.')

  safeRemove(cmdlineRoot)
  mkdirSync(path.dirname(cmdlineRoot), { recursive: true })
  if (isWindows) {
    await run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Move-Item -LiteralPath ${powerShellQuote(extractedTools)} -Destination ${powerShellQuote(cmdlineRoot)}`,
    ])
  } else {
    renameSync(extractedTools, cmdlineRoot)
  }
  safeRemove(extractRoot)
}

async function installSdkPackages(jdkPath) {
  const env = {
    ...process.env,
    JAVA_HOME: jdkPath,
    ANDROID_HOME: sdkRoot,
    ANDROID_SDK_ROOT: sdkRoot,
    PATH: `${path.join(jdkPath, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
  }
  const sdkmanager = sdkmanagerPath()
  const sdkRootArg = `--sdk_root=${sdkRoot}`
  const yes = 'y\n'.repeat(80)

  await run(sdkmanager, [sdkRootArg, ...requiredPackages], { env, input: yes })
  await run(sdkmanager, [sdkRootArg, '--licenses'], { env, input: yes })
}

async function main() {
  mkdirSync(toolchainRoot, { recursive: true })

  const jdkPath = await findJdk()
  const beforeStatus = getSdkStatus(jdkPath)

  if (mode !== 'install') {
    printDiagnosis({ jdkPath, status: beforeStatus })
    return
  }

  if (!jdkPath) {
    printDiagnosis({ jdkPath, status: beforeStatus })
    process.exitCode = 1
    return
  }

  const archive = await resolveCommandLineToolsArchive()
  console.log('This will download Android command-line tools and install the SDK packages required by this project.')
  console.log('By continuing with this command, you are responsible for accepting the Android SDK license terms.')

  await ensureCommandLineTools(archive)
  await installSdkPackages(jdkPath)

  const afterStatus = getSdkStatus(jdkPath)
  printDiagnosis({ jdkPath, status: afterStatus, archive })
  if (statusToMissing(afterStatus).length > 0) process.exitCode = 1
}

await main()
