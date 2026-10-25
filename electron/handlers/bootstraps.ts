import type Electron from 'electron'
import { app, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import logger from 'electron-log/main'
import type { IBootstraps } from 'eml-lib'
import { safeSend } from '../utils/ipc'

let updateInfo: UpdateInfo | null = null
let updateDownloaded = false
let handlersRegistered = false

function toUpdateStatus(info: UpdateInfo | null): IBootstraps {
  return {
    updateAvailable: info !== null,
    currentVersion: app.getVersion(),
    latestVersion: info?.version ?? app.getVersion(),
    updateInfo: info
      ? {
          releaseName: info.releaseName,
          releaseNotes: info.releaseNotes,
          releaseDate: new Date(info.releaseDate)
        }
      : undefined
  }
}

function toProgress(progress: ProgressInfo) {
  return {
    total: { amount: progress.total, size: progress.total },
    downloaded: { amount: progress.transferred, size: progress.transferred },
    speed: progress.bytesPerSecond,
    type: 'launcher'
  }
}

export function registerBootstrapHandlers(mainWindow: Electron.BrowserWindow) {
  autoUpdater.logger = logger
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  if (!handlersRegistered) {
    autoUpdater.on('update-available', (info) => {
      updateInfo = info
      updateDownloaded = false
      logger.info(`Launcher update available: ${info.version}`)
      safeSend(mainWindow, 'bootstraps:update_available', toUpdateStatus(info))
    })

    autoUpdater.on('update-not-available', () => {
      updateInfo = null
      updateDownloaded = false
      logger.info('Launcher is up to date')
    })

    autoUpdater.on('download-progress', (progress) => {
      safeSend(mainWindow, 'bootstraps:download_progress', toProgress(progress))
    })

    autoUpdater.on('update-downloaded', (info) => {
      updateInfo = info
      updateDownloaded = true
      logger.info(`Launcher update downloaded: ${info.version}`)
      safeSend(mainWindow, 'bootstraps:download_end', {
        downloaded: { amount: 1, size: 0 }
      })
    })

    autoUpdater.on('error', (error) => {
      logger.error('Launcher update error:', error)
      safeSend(mainWindow, 'bootstraps:error', { message: error })
    })

    handlersRegistered = true
  }

  ipcMain.handle('bootstraps:check', async () => {
    try {
      if (!autoUpdater.isUpdaterActive()) {
        return toUpdateStatus(null)
      }

      const result = await autoUpdater.checkForUpdates()
      if (result?.updateInfo && result.updateInfo.version !== app.getVersion()) {
        updateInfo = result.updateInfo
      }
      return toUpdateStatus(updateInfo)
    } catch (error) {
      logger.error('Error checking for launcher updates:', error)
      return toUpdateStatus(null)
    }
  })

  ipcMain.handle('bootstraps:download', async () => {
    if (!autoUpdater.isUpdaterActive()) {
      return []
    }

    if (updateDownloaded) {
      safeSend(mainWindow, 'bootstraps:download_end', {
        downloaded: { amount: 1, size: 0 }
      })
      return []
    }

    try {
      return await autoUpdater.downloadUpdate()
    } catch (error) {
      logger.error('Error downloading launcher update:', error)
      throw error
    }
  })

  ipcMain.handle('bootstraps:install', async () => {
    if (!updateDownloaded) {
      return
    }

    autoUpdater.quitAndInstall(false, true)
  })

  mainWindow.once('closed', () => {
    ipcMain.removeHandler('bootstraps:check')
    ipcMain.removeHandler('bootstraps:download')
    ipcMain.removeHandler('bootstraps:install')
  })

}

export function startAutomaticUpdateCheck() {
  if (!autoUpdater.isUpdaterActive()) {
    return
  }

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((error) => {
      logger.error('Background launcher update check failed:', error)
    })
  }, 1000)
}
