import { ipcMain, app, screen, dialog } from 'electron'
import logger from 'electron-log/main'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

export interface ISystemInfo {
  totalMem: number // in GB
  resolution: {
    width: number
    height: number
  }
  version: string
}

export interface IGameSettings {
  java: string
  memory: {
    ram: number
  }
  resolution: {
    width: number
    height: number
    fullscreen: boolean
  }
  launcherAction: 'close' | 'keep' | 'hide'
}

export const DEFAULT_SETTINGS: IGameSettings = {
  java: 'bundled',
  memory: {
    ram: 4
  },
  resolution: {
    width: 1280,
    height: 720,
    fullscreen: false
  },
  launcherAction: 'close'
}

function normalizeRamGb(value: unknown): number {
  const ram = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(ram) || ram <= 0) return DEFAULT_SETTINGS.memory.ram
  return Math.max(1, Math.round(ram))
}

export function normalizeGameSettings(settings: Partial<IGameSettings> & { memory?: { min?: number; max?: number; ram?: number } }): IGameSettings {
  const legacyRam = settings.memory?.ram ?? settings.memory?.max ?? settings.memory?.min
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    memory: {
      ram: normalizeRamGb(legacyRam)
    }
  }
}

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get', async () => {
    try {
      if (!fs.existsSync(settingsPath)) {
        fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2))
        return DEFAULT_SETTINGS
      }
      const data = fs.readFileSync(settingsPath, 'utf-8')
      const saved = JSON.parse(data) as Partial<IGameSettings> & { memory?: { min?: number; max?: number; ram?: number } }
      return normalizeGameSettings(saved)
    } catch (err) {
      logger.error('Error reading settings:', err)
      return DEFAULT_SETTINGS
    }
  })

  ipcMain.handle('settings:set', async (_event, newSettings: IGameSettings) => {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(normalizeGameSettings(newSettings), null, 2))
      return true
    } catch (err) {
      logger.error('Error writing settings:', err)
      return false
    }
  })

  ipcMain.handle('system:info', async () => {
    const totalMemBytes = os.totalmem()
    const totalMemGB = Math.round(totalMemBytes / 1024 / 1024 / 1024)

    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    return {
      totalMem: totalMemGB,
      resolution: { width, height },
      version: app.getVersion()
    }
  })

  ipcMain.handle('settings:pick_java', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Java Executable', extensions: ['exe', 'bin', ''] }]
    })
    return result.filePaths[0] ?? null
  })
}
