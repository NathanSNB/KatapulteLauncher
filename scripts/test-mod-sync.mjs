import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { createServer } from 'node:http'

const modContent = Buffer.from('known-good-mod-content')
const largeModContent = Buffer.alloc(512 * 1024, 7)
const sha1 = (content) => createHash('sha1').update(content).digest('hex')

let server
let baseUrl
let root

function manifestFile(name, content, extra = {}) {
  return {
    name,
    path: 'mods/',
    type: 'MOD',
    url: `${baseUrl}/files/${name}`,
    sha1: sha1(content),
    ...extra
  }
}

async function syncFile(file, modsPath, options = {}) {
  const targetPath = path.join(modsPath, file.name)
  const temporaryPath = `${targetPath}.download`

  try {
    if (await sha1(await readFile(targetPath)) === file.sha1) return 'unchanged'
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const response = await fetch(file.url, { signal: AbortSignal.timeout(2_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  try {
    await writeFile(temporaryPath, Buffer.from(await response.arrayBuffer()))
    if (options.rename) await options.rename(temporaryPath, targetPath)
    else await writeFile(targetPath, await readFile(temporaryPath))
    return 'downloaded'
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

async function fetchManifest(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2_000) })
  if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`)
  return response.json()
}

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'katapulte-mod-sync-'))
  await mkdir(path.join(root, 'mods'), { recursive: true })
  server = createServer((request, response) => {
    if (request.url === '/manifest') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ files: [manifestFile('required.jar', modContent)] }))
      return
    }
    if (request.url === '/manifest-500') {
      response.statusCode = 500
      response.end('unavailable')
      return
    }
    if (request.url === '/manifest-invalid') {
      response.setHeader('content-type', 'application/json')
      response.end('{invalid-json')
      return
    }
    if (request.url === '/files/required.jar') {
      response.end(modContent)
      return
    }
    if (request.url === '/files/large.jar') {
      response.write(largeModContent.subarray(0, 64))
      setTimeout(() => response.destroy(), 10)
      return
    }
    response.statusCode = 404
    response.end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(root, { recursive: true, force: true })
})

describe('mod synchronization robustness', () => {
  it('redownloads a jar when its local SHA-1 is stale', async () => {
    const target = path.join(root, 'mods', 'required.jar')
    await writeFile(target, 'corrupted')
    const manifest = await fetchManifest(`${baseUrl}/manifest`)

    assert.equal(await syncFile(manifest.files[0], path.join(root, 'mods')), 'downloaded')
    assert.deepEqual(await readFile(target), modContent)
  })

  it('cleans the temporary file when the connection drops mid-download', async () => {
    const target = path.join(root, 'mods', 'large.jar')
    const temporary = `${target}.download`
    await assert.rejects(
      syncFile({
        name: 'large.jar',
        url: `${baseUrl}/files/large.jar`,
        sha1: sha1(largeModContent)
      }, path.join(root, 'mods')),
      /fetch failed|aborted|terminated|socket/i
    )
    await assert.rejects(stat(target), { code: 'ENOENT' })
    await assert.rejects(stat(temporary), { code: 'ENOENT' })
  })

  it('turns an unavailable or invalid API response into a handled error', async () => {
    await assert.rejects(fetchManifest(`${baseUrl}/manifest-500`), /Manifest HTTP 500/)
    await assert.rejects(fetchManifest(`${baseUrl}/manifest-invalid`), /Unexpected token|JSON/i)
  })

  it('surfaces a locked destination error without leaving a download behind', async () => {
    const target = path.join(root, 'mods', 'required.jar')
    const temporary = `${target}.download`
    const manifest = await fetchManifest(`${baseUrl}/manifest`)
    await writeFile(target, 'stale-content')
    await assert.rejects(
      syncFile(manifest.files[0], path.join(root, 'mods'), {
        rename: async () => {
          const error = new Error('The process cannot access the file because it is being used by another process')
          error.code = 'EBUSY'
          throw error
        }
      }),
      (error) => error.code === 'EBUSY'
    )
    await assert.rejects(stat(temporary), { code: 'ENOENT' })
  })
})
