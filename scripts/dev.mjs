// Run FairToy locally with one command, from the repository root:
//
//   npm start          set up what is missing, then start the API and the UI
//   npm run reset      delete the local databases and seed them again (findings are lost)
//
// What `npm start` does, in order:
//   1. checks for Node.js 22.22+ and uv;
//   2. installs the UI packages if they are missing;
//   3. seeds the databases if they do not exist yet (never overwrites them);
//   4. starts the API on port 8000 and the UI on port 5173, and stops both together.
import fs from 'node:fs'
import {
  BACKEND,
  DATA_DIR,
  FRONTEND,
  bold,
  checkTools,
  dim,
  ensureFrontendPackages,
  fail,
  green,
  isSeeded,
  magenta,
  portInUse,
  cyan,
  seed,
  startService,
  step,
  stopTree,
  waitFor,
} from './common.mjs'

const API_PORT = 8000
const UI_PORT = 5173

checkTools()

if (process.argv.includes('--reset-data')) {
  step(`Deleting ${DATA_DIR}`)
  fs.rmSync(DATA_DIR, { recursive: true, force: true })
  seed()
  console.log(`\n${green('✓')} Fresh databases. Start the app with ${bold('npm start')}.\n`)
  process.exit(0)
}

ensureFrontendPackages()
if (!isSeeded()) seed()

for (const [port, what] of [
  [API_PORT, 'the API'],
  [UI_PORT, 'the UI'],
]) {
  if (await portInUse(port)) {
    fail(`Port ${port}, needed for ${what}, is already in use. Is FairToy already running in another terminal?`)
  }
}

step('Starting the API and the UI (the first run also installs the Python packages)')
let stopping = false
const services = [
  startService('api', magenta, 'uv', ['run', 'uvicorn', 'app.main:app', '--port', String(API_PORT)], BACKEND),
  startService('ui', cyan, 'npm', ['run', 'dev', '--', '--port', String(UI_PORT), '--strictPort'], FRONTEND),
]

function stopAll(code) {
  if (stopping) return
  stopping = true
  for (const service of services) stopTree(service)
  // Give them a moment to exit cleanly.
  setTimeout(() => process.exit(code), 300)
}

for (const service of services) {
  service.on('exit', (code, signal) => {
    if (stopping) return
    console.error(`\nA service stopped (${signal ?? `exit code ${code}`}). Stopping FairToy.`)
    stopAll(code || 1)
  })
}
process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

const ready =
  (await waitFor(`http://127.0.0.1:${API_PORT}/docs`, 180_000, () => stopping)) &&
  (await waitFor(`http://localhost:${UI_PORT}/`, 60_000, () => stopping))

if (stopping) {
  // A service failed while starting; the message is above.
} else if (!ready) {
  console.error('\nFairToy did not start in time. See the output above.')
  stopAll(1)
} else {
  console.log(`
${green('✓')} ${bold('FairToy is running.')}

  App        ${bold(`http://localhost:${UI_PORT}`)}
  API docs   http://localhost:${API_PORT}/docs

  Sign in as ${bold('kestrel-play')}, or any Finisher's name in lower case with hyphens
  (for example ${bold('moonpath-brands')}). The password is ${bold('fairtoy-demo')} for everyone.

  ${dim('Press Ctrl+C to stop.')}
`)
}
