import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// Resolve package root URL from this test file location
const pkgRoot = new URL('../', import.meta.url)

// Load and parse package.json
const pkgJsonUrl = new URL('package.json', pkgRoot)
const pkg = JSON.parse(fs.readFileSync(pkgJsonUrl, 'utf8'))

const { name: pkgName, exports: exportMap } = pkg

// Lock the public API surface: enumerate expected subpath exports
const expectedExportKeys = [
  './nats-context',
  './subject',
  './subject/create/basic',
  './subject/create/telemetry',
  './subject/router',
  './component/agent',
  './component/builder',
  './component/builder/helper',
  './codes',
  './diagnostics',
  './diagnostics/metrics/nats',
  './diagnostics/metrics/console',
  './diagnostics/loggers/nats',
  './diagnostics/loggers/console',
]

test('exports keys match expected API surface', () => {
  assert.ok(exportMap && typeof exportMap === 'object', 'exports map missing')
  const actual = Object.keys(exportMap).sort()
  const expected = expectedExportKeys.slice().sort()
  assert.deepEqual(actual, expected, 'package.json exports keys changed; update expectedExportKeys if intentional')
})

test('all expected exports resolve and match target files', async () => {
  assert.ok(pkgName && typeof pkgName === 'string', 'package name missing')
  assert.ok(exportMap && typeof exportMap === 'object', 'exports map missing')

  // For each expected subpath export, import via subpath and direct file path and compare
  await Promise.all(expectedExportKeys.map(async (subpath) => {
    const target = exportMap[subpath]
    assert.ok(target, `missing mapping for ${subpath}`)
    // Validate mapping exists on disk
    const targetUrl = new URL(target, pkgRoot)
    assert.ok(fs.existsSync(targetUrl), `target missing for ${subpath}: ${target}`)

    // Compute the package subpath specifier, e.g. "@scope/pkg/nats-context"
    const spec = pkgName + subpath.slice(1) // remove leading './'

    // Import both ways
    const [viaExport, viaPath] = await Promise.all([
      import(spec),
      import(targetUrl.href),
    ])

    // They should resolve to the same module instance (same URL)
    assert.strictEqual(viaExport, viaPath, `mismatch for ${spec} -> ${target}`)

    // And have at least one export
    assert.ok(Object.keys(viaExport).length > 0, `no exports found for ${spec}`)
  }))
})
