import { ipcMain, BrowserWindow, shell } from 'electron'
import { Launcher } from 'eml-lib'
import emlUtils from 'eml-lib/lib/utils/utils.js'
import loaders from 'eml-lib/lib/utils/loaders.js'
import type { Account, ILoader } from 'eml-lib'
import { normalizeGameSettings, type IGameSettings } from './settings'
import logger from 'electron-log/main'
import { ADMINTOOL_URL, ROOT_ID } from '../const'
import { safeSend } from '../utils/ipc'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

export interface IModEntry {
  name: string
  enabled: boolean
  size: number
  managed: boolean
}

interface IServerManifestFile {
  path?: string
  name?: string
  type?: string
}

interface IServerModsState {
  files: string[]
}

interface FileHashCacheEntry {
  size: number
  mtimeMs: number
  hash: string
}

let hashCachePath: string | null = null
let hashCache = new Map<string, FileHashCacheEntry>()
let hashInFlight = new Map<string, Promise<string>>()
let hashCacheWriteTimer: NodeJS.Timeout | null = null
let hashCacheWriteQueue: Promise<void> = Promise.resolve()
let hashFunctionPatched = false
let forgeLoaderResolutionPatched = false

async function prepareFileHashCache(profileSlug: string): Promise<void> {
  const nextCachePath = path.join(getProfileRoot(profileSlug), '.katapulte-file-hashes.json')
  if (hashCachePath === nextCachePath) return

  hashCachePath = nextCachePath
  hashCache = new Map()
  hashInFlight = new Map()
  try {
    const contents = await fsp.readFile(nextCachePath, 'utf8')
    const entries = JSON.parse(contents) as Record<string, FileHashCacheEntry>
    for (const [filePath, entry] of Object.entries(entries)) {
      if (
        typeof entry?.size === 'number' &&
        typeof entry?.mtimeMs === 'number' &&
        typeof entry?.hash === 'string'
      ) {
        hashCache.set(filePath, entry)
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Unable to read file hash cache:', error)
    }
  }

  if (hashFunctionPatched) return
  const originalGetFileHash = emlUtils.getFileHash.bind(emlUtils)
  emlUtils.getFileHash = async (filePath: string): Promise<string> => {
    const stats = await fsp.stat(filePath)
    const cached = hashCache.get(filePath)
    if (cached && cached.size === stats.size && cached.mtimeMs === stats.mtimeMs) {
      return cached.hash
    }

    const existingHash = hashInFlight.get(filePath)
    if (existingHash) return existingHash

    const hashPromise = originalGetFileHash(filePath)
    hashInFlight.set(filePath, hashPromise)
    let hash: string
    try {
      hash = await hashPromise
    } finally {
      hashInFlight.delete(filePath)
    }
    hashCache.set(filePath, { size: stats.size, mtimeMs: stats.mtimeMs, hash })
    if (hashCacheWriteTimer) clearTimeout(hashCacheWriteTimer)
    hashCacheWriteTimer = setTimeout(() => {
      if (!hashCachePath) return
      const snapshot = Object.fromEntries(hashCache)
      hashCacheWriteQueue = hashCacheWriteQueue
        .then(() => fsp.mkdir(path.dirname(hashCachePath!), { recursive: true }))
        .then(() => fsp.writeFile(hashCachePath!, JSON.stringify(snapshot), 'utf8'))
        .catch((error) => logger.warn('Unable to write file hash cache:', error))
    }, 250)
    return hash
  }
  hashFunctionPatched = true
}

function patchForgeLoaderResolution(): void {
  if (forgeLoaderResolutionPatched) return

  const originalGetLoader = loaders.getLoader.bind(loaders)
  loaders.getLoader = async (config): Promise<ILoader> => {
    const loaderConfig = config.minecraft.loader
    if (loaderConfig?.loader !== 'forge' || !loaderConfig.version) {
      return originalGetLoader(config)
    }

    const loaderVersion = loaderConfig.version
    const minecraftVersion = config.minecraft.version
    if (!minecraftVersion) return originalGetLoader(config)

    const artifactVersion = `${minecraftVersion}-${loaderVersion}`
    const loaderId = `forge-${artifactVersion}`
    const loaderDirectory = path.join(config.root, 'versions', loaderId)
    const loaderName = `${loaderId}.jar`
    const loaderPath = path.join(loaderDirectory, loaderName)
    const loaderUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${artifactVersion}/forge-${artifactVersion}-installer.jar`
    let size: number | undefined

    try {
      size = (await fsp.stat(loaderPath)).size
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    return {
      type: 'FORGE',
      minecraftVersion,
      loaderVersion,
      format: 'INSTALLER',
      file: {
        name: loaderName,
        path: `versions/${loaderId}/`,
        url: loaderUrl,
        size,
        type: 'OTHER'
      },
      updatedAt: new Date()
    }
  }
  forgeLoaderResolutionPatched = true
}

function sanitizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
}

function getAppDataFolder(): string {
  if (process.platform === 'win32') return process.env.APPDATA ?? ''
  if (process.platform === 'darwin') return path.join(process.env.HOME ?? '', 'Library', 'Application Support')
  return process.env.HOME ?? ''
}

function getServerFolder(rootId: string): string {
  const normalizedRoot = rootId.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const folderName = process.platform === 'darwin' ? normalizedRoot : `.${normalizedRoot}`
  return path.join(getAppDataFolder(), folderName)
}

function getProfileRoot(profileSlug: string): string {
  return path.join(getServerFolder(ROOT_ID), sanitizeSlug(profileSlug))
}

function getModsPath(profileSlug: string): string {
  return path.join(getProfileRoot(profileSlug), 'mods')
}

function getServerModsStatePath(profileSlug: string): string {
  return path.join(getProfileRoot(profileSlug), '.katapulte-server-mods.json')
}

async function removeCorruptVersionManifest(
  profileSlug: string,
  versionDirectoryName: string,
  manifestName: string,
  expectedId: string
): Promise<void> {
  const versionDirectory = path.join(getProfileRoot(profileSlug), 'versions', versionDirectoryName)
  const manifestPath = path.join(versionDirectory, `${manifestName}.json`)
  let contents: string
  try {
    contents = await fsp.readFile(manifestPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }

  try {
    const manifest: unknown = JSON.parse(contents)
    if (
      typeof manifest === 'object' &&
      manifest !== null &&
      'id' in manifest &&
      manifest.id === expectedId
    ) {
      return
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }

  await fsp.rm(versionDirectory, { recursive: true, force: true })
  logger.warn(`Removed corrupt Minecraft version directory: ${versionDirectory}`)
}

function normalizeModName(value: string): string {
  return path.basename(value).toLowerCase().replace(/\.disabled$/, '')
}

async function fetchServerManifest(profileSlug: string): Promise<Set<string>> {
  const response = await fetch(`${ADMINTOOL_URL}/api/files-updater/${encodeURIComponent(profileSlug)}`)
  if (!response.ok) {
    throw new Error(`Impossible de télécharger le manifeste des mods (HTTP ${response.status})`)
  }

  const manifest = (await response.json()) as { files?: IServerManifestFile[] }
  return new Set(
    (manifest.files ?? [])
      .filter((file) => {
        const manifestPath = (file.path ?? file.name ?? '').replaceAll('\\', '/').toLowerCase()
        return (file.type ?? '').toUpperCase() === 'MOD' || manifestPath.startsWith('mods/') || manifestPath.includes('/mods/')
      })
      .map((file) => normalizeModName(file.path ?? file.name ?? ''))
      .filter((name) => name.endsWith('.jar'))
  )
}

async function synchronizeServerMods(profileSlug: string, serverFiles?: Set<string>) {
  const modsPath = getModsPath(profileSlug)
  const statePath = getServerModsStatePath(profileSlug)
  await fsp.mkdir(modsPath, { recursive: true })
  const officialServerFiles = serverFiles ?? await fetchServerManifest(profileSlug)

  let previousServerFiles: string[] = []
  let hasPreviousState = false
  try {
    const state = JSON.parse(await fsp.readFile(statePath, 'utf8')) as IServerModsState
    previousServerFiles = state.files ?? []
    hasPreviousState = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Unable to read server mods state:', error)
    }
  }

  if (hasPreviousState) {
    for (const file of previousServerFiles) {
      if (officialServerFiles.has(file)) continue
      for (const candidate of [file, `${file}.disabled`]) {
        const candidatePath = path.join(modsPath, candidate)
        try {
          await fsp.unlink(candidatePath)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.warn(`Unable to remove obsolete server mod ${candidate}:`, error)
          }
        }
      }
    }
  }

  await fsp.writeFile(statePath, JSON.stringify({ files: [...officialServerFiles] }, null, 2))
}

export function registerLauncherHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('game:launch', async (_event, payload: { account: Account; settings: IGameSettings; profileSlug: string }) => {
    const { account, settings, profileSlug } = payload
    const minecraftVersion = '1.20.1'
    const forgeVersion = '47.4.28'
    await prepareFileHashCache(profileSlug)
    await removeCorruptVersionManifest(profileSlug, minecraftVersion, minecraftVersion, minecraftVersion)
    const forgeManifestId = `forge-${minecraftVersion}-${forgeVersion}`
    await removeCorruptVersionManifest(profileSlug, forgeManifestId, forgeManifestId, forgeManifestId)
    const normalizedSettings = normalizeGameSettings(settings)
    const isLiteProfile = profileSlug.toLowerCase().includes('-fc')
    const effectiveRamGb = isLiteProfile ? Math.min(normalizedSettings.memory.ram, 4) : normalizedSettings.memory.ram
    const effectiveRamMb = effectiveRamGb * 1024
    const java = settings.java === 'system' ? { install: 'manual' as const, absolutePath: 'java' } : { install: 'auto' as const }
    logger.log('Launching')
    patchForgeLoaderResolution()

    const launcher = new Launcher({
      url: ADMINTOOL_URL, // CORRECTION : Utilisation de la constante
      root: ROOT_ID,      // CORRECTION : Utilisation de la constante
      profile: {
        slug: profileSlug,
        minecraft: {
          version: minecraftVersion,
          loader: {
            loader: 'forge',
            version: forgeVersion
          }
        }
      },
      account: account,
      cleaning: {
        enabled: false
      },
      java: java,
      memory: {
        min: effectiveRamMb,
        // eml-lib keeps max at 1023 when max is not strictly greater than min.
        max: effectiveRamMb + 1
      },
      window: {
        width: normalizedSettings.resolution.width,
        height: normalizedSettings.resolution.height,
        fullscreen: normalizedSettings.resolution.fullscreen
      }
    })

    launcher.on('launch_compute_download', () => {
      logger.log('Computing download...')
      safeSend(mainWindow, 'game:launch_compute_download')
    })

    launcher.on('launch_download', (download) => {
      logger.log(`Downloading ${download.total.amount} files (${download.total.size} B).`)
      safeSend(mainWindow, 'game:launch_download', download)
    })
    launcher.on('download_progress', (progress) => {
      safeSend(mainWindow, 'game:download_progress', progress)
    })
    launcher.on('download_error', (error) => {
      logger.error(`Error downloading ${error.filename}: ${error.message}`)
      safeSend(mainWindow, 'game:download_error', error)
    })
    launcher.on('download_end', (info) => {
      logger.log(`Downloaded ${info.downloaded.amount} files.`)
      safeSend(mainWindow, 'game:download_end', info)
    })

    launcher.on('launch_install_loader', (loader) => {
      logger.log(`Installing loader ${loader.type} ${loader.loaderVersion}...`)
      safeSend(mainWindow, 'game:launch_install_loader', loader)
    })

    launcher.on('launch_extract_natives', () => {
      logger.log('Extracting natives...')
      safeSend(mainWindow, 'game:launch_extract_natives')
    })
    launcher.on('extract_progress', (progress) => {
      logger.log(`Extracted ${progress.filename}.`)
      safeSend(mainWindow, 'game:extract_progress', progress)
    })
    launcher.on('extract_end', (info) => {
      logger.log(`Extracted ${info.amount} files.`)
      safeSend(mainWindow, 'game:extract_end', info)
    })

    launcher.on('launch_copy_assets', () => {
      logger.log('Copying assets...')
      safeSend(mainWindow, 'game:launch_copy_assets')
    })
    launcher.on('copy_progress', (progress) => {
      logger.log(`Copied ${progress.filename} to ${progress.dest}.`)
      safeSend(mainWindow, 'game:copy_progress', progress)
    })
    launcher.on('copy_end', (info) => {
      logger.log(`Copied ${info.amount} files.`)
      safeSend(mainWindow, 'game:copy_end', info)
    })

    launcher.on('launch_patch_loader', () => {
      logger.log('Patching loader...')
      safeSend(mainWindow, 'game:launch_patch_loader')
    })
    launcher.on('patch_progress', (progress) => {
      safeSend(mainWindow, 'game:patch_progress', progress)
    })
    launcher.on('patch_error', (error) => {
      logger.error(`Error patching ${error.filename}: ${error.message}`)
      safeSend(mainWindow, 'game:patch_error', error)
    })
    launcher.on('patch_end', (info) => {
      logger.log(`Patched ${info.amount} files.`)
      safeSend(mainWindow, 'game:patch_end', info)
    })

    launcher.on('launch_check_java', () => {
      logger.log('Checking Java...')
      safeSend(mainWindow, 'game:launch_check_java')
    })
    launcher.on('java_info', (info) => {
      logger.log(`Using Java ${info.version} ${info.arch}`)
      safeSend(mainWindow, 'game:java_info', info)
    })

    launcher.on('launch_clean', () => {
      logger.log('Cleaning game directory...')
      safeSend(mainWindow, 'game:launch_clean')
    })
    launcher.on('clean_progress', (progress) => {
      safeSend(mainWindow, 'game:clean_progress', progress)
    })
    launcher.on('clean_end', (info) => {
      logger.log(`Cleaned ${info.amount} files.`)
      safeSend(mainWindow, 'game:clean_end', info)
    })

    launcher.on('launch_launch', (info) => {
      logger.log(`Launching Minecraft ${info.version} (${info.type}${info.loaderVersion ? ` ${info.loaderVersion}` : ''})...`)
      safeSend(mainWindow, 'game:launch_launch', info)
      safeSend(mainWindow, 'game:launched')
    })
    launcher.on('launch_data', (message) => {
      logger.log(message)
      safeSend(mainWindow, 'game:launch_data', message)
    })
    launcher.on('launch_close', (code) => {
      logger.log(`Closed with code ${code}.`)
      safeSend(mainWindow, 'game:launch_close', code)

      // Restauration de la fenêtre si l'utilisateur a choisi de la cacher
      if (settings.launcherAction === 'hide') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
          } catch (err) {
            logger.error('Error restoring mainWindow:', err)
          }
        }
      }

    })

    launcher.on('launch_debug', (message) => {
      safeSend(mainWindow, 'game:launch_debug', message)
    })
    launcher.on('patch_debug', (message) => {
      safeSend(mainWindow, 'game:patch_debug', message)
    })

    try {
      await synchronizeServerMods(profileSlug)
      await launcher.launch()
    } catch (err) {
      logger.error('Launcher error:', err)
      safeSend(mainWindow, 'game:launch_error', err instanceof Error ? err.message : 'Erreur inconnue')
    }
  })

  ipcMain.handle('game:open_mods_folder', async (_event, payload: { profileSlug: string }) => {
    try {
      const modsPath = getModsPath(payload.profileSlug)

      fs.mkdirSync(modsPath, { recursive: true })
      const openError = await shell.openPath(modsPath)
      if (openError) {
        logger.error('Unable to open mods folder:', openError)
        return { success: false, message: openError, path: modsPath }
      }

      return { success: true, path: modsPath }
    } catch (err) {
      logger.error('Error while opening mods folder:', err)
      return { success: false, message: err instanceof Error ? err.message : 'Erreur inconnue' }
    }
  })

  ipcMain.handle('mods:list', async (_event, payload: { profileSlug: string }): Promise<IModEntry[]> => {
    const modsPath = getModsPath(payload.profileSlug)
    const managedMods = await fetchServerManifest(payload.profileSlug)
    await synchronizeServerMods(payload.profileSlug, managedMods)
    await fsp.mkdir(modsPath, { recursive: true })
    const entries = await fsp.readdir(modsPath, { withFileTypes: true })
    const mods = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && (entry.name.toLowerCase().endsWith('.jar') || entry.name.toLowerCase().endsWith('.jar.disabled')))
        .map(async (entry) => {
          const file = await fsp.stat(path.join(modsPath, entry.name))
          return {
            name: entry.name,
            enabled: entry.name.toLowerCase().endsWith('.jar'),
            size: file.size,
            managed: managedMods.has(normalizeModName(entry.name))
          }
        })
    )
    const installedMods = new Set(mods.map((mod) => normalizeModName(mod.name)))
    for (const serverMod of managedMods) {
      if (installedMods.has(serverMod)) continue
      mods.push({
        name: path.basename(serverMod),
        enabled: false,
        size: 0,
        managed: true
      })
    }
    return mods.sort((a, b) => a.name.localeCompare(b.name))
  })

  ipcMain.handle('mods:toggle', async (_event, payload: { profileSlug: string; name: string }): Promise<IModEntry> => {
    const name = path.basename(payload.name)
    if (!name.toLowerCase().endsWith('.jar') && !name.toLowerCase().endsWith('.jar.disabled')) {
      throw new Error('Le fichier fourni n’est pas un mod .jar')
    }

    const modsPath = getModsPath(payload.profileSlug)
    try {
      const state = JSON.parse(await fsp.readFile(getServerModsStatePath(payload.profileSlug), 'utf8')) as IServerModsState
      if ((state.files ?? []).includes(normalizeModName(name))) {
        throw new Error('Les mods serveur obligatoires ne peuvent pas être désactivés')
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('obligatoires')) throw error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const source = path.join(modsPath, name)
    const target = path.join(modsPath, name.toLowerCase().endsWith('.jar.disabled') ? name.slice(0, -'.disabled'.length) : `${name}.disabled`)
    await fsp.rename(source, target)
    const stats = await fsp.stat(target)
    return { name: path.basename(target), enabled: target.toLowerCase().endsWith('.jar'), size: stats.size, managed: false }
  })

  ipcMain.handle('game:uninstall', async (_event, payload: { profileSlug: string }) => {
    try {
      const profileRoot = getProfileRoot(payload.profileSlug)

      if (!fs.existsSync(profileRoot)) {
        return { success: true, message: 'Version déjà absente', path: profileRoot }
      }

      fs.rmSync(profileRoot, { recursive: true, force: true })
      return { success: true, path: profileRoot }
    } catch (err) {
      logger.error('Error while uninstalling profile:', err)
      return { success: false, message: err instanceof Error ? err.message : 'Erreur inconnue' }
    }
  })

  // Cleanup listeners when the window is closed
  mainWindow.on('closed', () => {
    try {
      // remove the ipc handler for game:launch to avoid stale references
      ipcMain.removeHandler('game:launch')
      ipcMain.removeHandler('game:open_mods_folder')
      ipcMain.removeHandler('mods:list')
      ipcMain.removeHandler('mods:toggle')
      ipcMain.removeHandler('game:uninstall')
      // remove any listeners attached to launcher instances
      // Note: launcher is scoped per-launch; this ensures any persisted references are cleaned by GC
      // If additional global child processes are used, ensure they are also cleaned here.
    } catch (err) {
      logger.error('Error during mainWindow closed cleanup:', err)
    }
  })
}
