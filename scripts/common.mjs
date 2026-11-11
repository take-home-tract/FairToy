// Shared by the scripts that run FairToy locally. No dependencies: only Node itself.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const BACKEND = path.join(ROOT, 'backend')
export const FRONTEND = path.join(ROOT, 'frontend')
export const DATA_DIR = path.join(BACKEND, 'data')

const isWindows = process.platform === 'win32'
// On Windows, npm and uv may be .cmd shims, which only a shell can start.
const viaShell = isWindows

const color = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text)
export const bold = paint('1')
export const dim = paint('2')
export const red = paint('31')
export const green = paint('32')
export const cyan = paint('36')
export const magenta = paint('35')

export function step(message) {
  console.log(`\n${cyan('▸')} ${message}`)
}

export function fail(message) {
  console.error(`\n${red('✗')} ${message}\n`)
  process.exit(1)
}

/** Run a command to the end, showing its output. Returns its exit code. */
export function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: viaShell })
  if (result.error) return 127
  return result.status ?? 1
}

/** Is this command available? */
export function has(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore', shell: viaShell })
  return !result.error && result.status === 0
}

/** Stop the program if what FairToy needs is missing. */
export function checkTools() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 22)) {
    fail(`Node.js ${process.versions.node} is too old. FairToy needs Node.js 22.22 or newer: https://nodejs.org/`)
  }
  if (!has('uv')) {
    fail('uv was not found. Install it, then open a new terminal: https://docs.astral.sh/uv/getting-started/installation/')
  }
}

/** Install the UI's packages the first time. */
export function ensureFrontendPackages() {
  if (fs.existsSync(path.join(FRONTEND, 'node_modules'))) return
  step('Installing the UI packages (first run only)')
  if (run('npm', ['install'], FRONTEND) !== 0) fail('npm install failed. See the output above.')
}

export function isSeeded() {
  return fs.existsSync(path.join(DATA_DIR, 'accounts.db'))
}

export function seed() {
  step('Creating the databases from the CSV files in toy_data')
  if (run('uv', ['run', 'python', '-m', 'app.seed'], BACKEND) !== 0) fail('The seed failed. See the output above.')
}

/** Is something already listening on this port? */
export async function portInUse(port) {
  const tryHost = (host) =>
    new Promise((resolve) => {
      const socket = net.connect({ port, host })
      socket.setTimeout(500)
      socket.once('connect', () => (socket.destroy(), resolve(true)))
      socket.once('timeout', () => (socket.destroy(), resolve(false)))
      socket.once('error', () => resolve(false))
    })
  return (await tryHost('127.0.0.1')) || (await tryHost('::1'))
}

/** Wait until a URL answers, or give up. */
export async function waitFor(url, timeoutMs, isStopped) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (isStopped()) return false
    try {
      const response = await fetch(url)
      if (response.status < 500) return true
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

/**
 * Start a long-running command. Its output is shown line by line with a label.
 * Returns the child process. `stopTree` stops it together with what it started.
 */
export function startService(label, paintLabel, command, args, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    shell: viaShell,
    // Its own process group, so it can be stopped with everything it started.
    detached: !isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const prefix = paintLabel(`[${label}]`.padEnd(6))
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop()
      for (const line of lines) console.log(`${prefix} ${line}`)
    })
  }
  return child
}

export function stopTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-child.pid, 'SIGTERM')
  } catch {
    // already gone
  }
}
