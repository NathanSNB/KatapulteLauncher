import { ipcMain, BrowserWindow, app } from 'electron'
import { Launcher } from 'eml-lib'
import * as emlLib from 'eml-lib'
import type { Account, IProfile } from 'eml-lib'
import type { IGameSettings } from './settings'
import logger from 'electron-log/main'
import { ADMINTOOL_URL, ROOT_ID } from '../const'
import { safeSend } from '../utils/ipc'



export function registerLauncherHandlers(mainWindow: BrowserWindow) {
  // AJOUT CRITIQUE : Le mot-clé "async" avant "_event"
  ipcMain.handle('game:launch', async (_event, payload: { account: Account; settings: IGameSettings; profileSlug: string }) => {
    const { account, settings, profileSlug } = payload
    const java = settings.java === 'system' ? { install: 'manual' as const, absolutePath: 'java' } : { install: 'auto' as const }
    logger.log('Launching')

    const launcher = new Launcher({
      url: ADMINTOOL_URL, // CORRECTION : Utilisation de la constante
      root: ROOT_ID,      // CORRECTION : Utilisation de la constante
      profile: { slug: profileSlug },
      account: account,
      cleaning: {
        enabled: false
      },
      java: java,
      memory: {
        min: +settings.memory.min * 1024,
        max: +settings.memory.max * 1024
      },
      window: {
        width: settings.resolution.width,
        height: settings.resolution.height,
        fullscreen: settings.resolution.fullscreen
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
      if (settings.launcherAction === 'close') {
        setTimeout(() => app.quit(), 5000)
      } else if (settings.launcherAction === 'hide') {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
        }, 5000)
      }
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

      // Cleanup listeners after launch finishes
      try {
        launcher.removeAllListeners()
      } catch (err) {
        logger.error('Error removing launcher listeners:', err)
      }
    })

    launcher.on('launch_debug', (message) => {
      safeSend(mainWindow, 'game:launch_debug', message)
    })
    launcher.on('patch_debug', (message) => {
      safeSend(mainWindow, 'game:patch_debug', message)
    })

    try {
      await launcher.launch()
    } catch (err) {
      logger.error('Launcher error:', err)
      safeSend(mainWindow, 'game:launch_error', err instanceof Error ? err.message : 'Erreur inconnue')
    }
  })
  // Cleanup listeners when the window is closed
  mainWindow.on('closed', () => {
    try {
      // remove the ipc handler for game:launch to avoid stale references
      ipcMain.removeHandler('game:launch')
      // remove any listeners attached to launcher instances
      // Note: launcher is scoped per-launch; this ensures any persisted references are cleaned by GC
      // If additional global child processes are used, ensure they are also cleaned here.
    } catch (err) {
      logger.error('Error during mainWindow closed cleanup:', err)
    }
  })
}