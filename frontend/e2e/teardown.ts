import fs from 'node:fs'

/** Remove the temporary databases of this run. */
export default function teardown() {
  const dataDir = process.env.FAIRTOY_E2E_DATA_DIR
  if (!dataDir) return
  try {
    fs.rmSync(dataDir, { recursive: true, force: true })
  } catch {
    // The API may still hold a file for a moment. It is a temporary folder: leave it.
  }
}
