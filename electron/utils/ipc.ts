import { BrowserWindow } from 'electron'
import logger from 'electron-log/main'

export function safeSend(win: BrowserWindow | null | undefined, channel: string, ...args: any[]): boolean {
  try {
    if (!win) return false
    if (win.isDestroyed()) return false
    const wc = win.webContents
    if (!wc || wc.isDestroyed()) return false
    wc.send(channel, ...args)
    return true
  } catch (err) {
    logger.error('safeSend error:', err)
    return false
  }
}
