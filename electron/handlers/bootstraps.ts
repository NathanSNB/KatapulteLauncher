import type Electron from 'electron'
import { ipcMain } from 'electron'
import { Bootstraps } from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'
import { safeSend } from '../utils/ipc'

let bootstraps: Bootstraps | null = null

export function registerBootstrapHandlers(mainWindow: Electron.BrowserWindow) {
  if (!bootstraps) {
    bootstraps = new Bootstraps(ADMINTOOL_URL)

    bootstraps.on('download_progress', (data) => {
      safeSend(mainWindow, 'bootstraps:download_progress', data)
    })

    bootstraps.on('download_end', (data) => {
      safeSend(mainWindow, 'bootstraps:download_end', data)
    })

    bootstraps.on('bootstraps_error', (data) => {
      safeSend(mainWindow, 'bootstraps:error', data)
    })
  }

  // Cleanup when the window is closed
  mainWindow.on('closed', () => {
    if (bootstraps) {
      bootstraps.removeAllListeners()
      bootstraps = null
    }
    try {
      ipcMain.removeHandler('bootstraps:check')
      ipcMain.removeHandler('bootstraps:download')
      ipcMain.removeHandler('bootstraps:install')
    } catch (err) {
      logger.error('Error removing bootstraps ipc handlers:', err)
    }
  })

  ipcMain.handle('bootstraps:check', async () => {
    try {
      return await bootstraps?.checkForUpdate()
    } catch (err) {
      logger.error('Error checking for bootstraps update', err)
      return { updateAvailable: false }
    }
  })

  ipcMain.handle('bootstraps:download', async () => {
    return await bootstraps?.download()
  })

  ipcMain.handle('bootstraps:install', async () => {
    return await bootstraps?.runUpdate()
  })
}


