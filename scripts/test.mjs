// Run every test, from the repository root:  npm test
//
//   1. the backend tests (pytest): seed, exposure rule, API, isolation;
//   2. the end-to-end tests (Playwright): the UI in a real browser against a real API.
//
// The end-to-end tests start their own API and UI on other ports with a temporary
// copy of the data, so they never touch your databases and nothing needs to be running.
import { BACKEND, FRONTEND, bold, checkTools, ensureFrontendPackages, green, red, run, step } from './common.mjs'

checkTools()
ensureFrontendPackages()

const results = []

step('Backend tests')
results.push(['Backend tests', run('uv', ['run', 'pytest'], BACKEND)])

step('Test browser (downloaded once)')
const browser = run('npx', ['playwright', 'install', 'chromium'], FRONTEND)

step('End-to-end tests')
results.push(['End-to-end tests', browser === 0 ? run('npm', ['test'], FRONTEND) : browser])

console.log()
for (const [name, code] of results) {
  console.log(`  ${code === 0 ? green('✓ passed') : red('✗ failed')}  ${name}`)
}
console.log()
const failed = results.some(([, code]) => code !== 0)
if (failed) console.log(`${red('Some tests failed.')} See the output above.\n`)
else console.log(`${bold('All tests passed.')}\n`)
process.exit(failed ? 1 : 0)
