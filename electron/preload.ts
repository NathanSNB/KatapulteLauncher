import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { IGameSettings, ISystemInfo } from './handlers/settings'
import type { IModEntry } from './handlers/launcher'
import type { IAuthResponse } from './handlers/auth'
import type {
  Account,
  BootstrapsEvents,
  CleanerEvents,
  DownloaderEvents,
  FilesManagerEvents,
  IAvatar,
  IBackground,
  IBootstraps,
  ICape,
  IMaintenance,
  INews,
  INewsCategory,
  IServerStatus,
  IProfile,
  ISkin,
  JavaEvents,
  LauncherEvents,
  PatcherEvents
} from 'eml-lib'

console.log('Preload script loaded')

type IpcCleanup = () => void

function subscribe<T>(channel: string, callback: (value: T) => void): IpcCleanup {
  const listener = (_event: IpcRendererEvent, value: T) => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

function subscribeVoid(channel: string, callback: () => void): IpcCleanup {
  const listener = () => callback()
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', {
  auth: {
    login: (): Promise<IAuthResponse> => ipcRenderer.invoke('auth:login'),
    refresh: (): Promise<IAuthResponse> => ipcRenderer.invoke('auth:refresh'),
    logout: (): Promise<{ success: boolean }> => ipcRenderer.invoke('auth:logout')
  },
  profiles: {
    get: (): Promise<IProfile[] | null> => ipcRenderer.invoke('profiles:get')
  },
  game: {
    launch: (payload: { account: Account; settings: IGameSettings; profileSlug: string }): Promise<void> => ipcRenderer.invoke('game:launch', payload),
    openModsFolder: (profileSlug: string): Promise<{ success: boolean; message?: string; path?: string }> =>
      ipcRenderer.invoke('game:open_mods_folder', { profileSlug }),
    uninstall: (profileSlug: string): Promise<{ success: boolean; message?: string; path?: string }> =>
      ipcRenderer.invoke('game:uninstall', { profileSlug }),
    mods: {
      list: (profileSlug: string): Promise<IModEntry[]> => ipcRenderer.invoke('mods:list', { profileSlug }),
      toggle: (profileSlug: string, name: string): Promise<IModEntry> => ipcRenderer.invoke('mods:toggle', { profileSlug, name })
    },

    launchComputeDownload: (callback: () => void): IpcCleanup => subscribeVoid('game:launch_compute_download', callback),

    launchDownload: (callback: (value: LauncherEvents['launch_download'][0]) => void) =>
      subscribe('game:launch_download', callback),
    downloadProgress: (callback: (value: DownloaderEvents['download_progress'][0]) => void) =>
      subscribe('game:download_progress', callback),
    downloadError: (callback: (value: DownloaderEvents['download_error'][0]) => void) =>
      subscribe('game:download_error', callback),
    downloadEnd: (callback: (value: DownloaderEvents['download_end'][0]) => void) =>
      subscribe('game:download_end', callback),

    launchInstallLoader: (callback: (value: LauncherEvents['launch_install_loader'][0]) => void) =>
      subscribe('game:launch_install_loader', callback),

    launchExtractNatives: (callback: () => void): IpcCleanup => subscribeVoid('game:launch_extract_natives', callback),
    extractProgress: (callback: (value: FilesManagerEvents['extract_progress'][0]) => void) =>
      subscribe('game:extract_progress', callback),
    extractEnd: (callback: (value: FilesManagerEvents['extract_end'][0]) => void) =>
      subscribe('game:extract_end', callback),
    launchCopyAssets: (callback: () => void): IpcCleanup => subscribeVoid('game:launch_copy_assets', callback),
    copyProgress: (callback: (value: FilesManagerEvents['copy_progress'][0]) => void) =>
      subscribe('game:copy_progress', callback),
    copyEnd: (callback: (value: FilesManagerEvents['copy_end'][0]) => void): IpcCleanup => subscribe('game:copy_end', callback),
    launchPatchLoader: (callback: () => void): IpcCleanup => subscribeVoid('game:launch_patch_loader', callback),
    patchProgress: (callback: (value: PatcherEvents['patch_progress'][0]) => void) =>
      subscribe('game:patch_progress', callback),
    patchError: (callback: (value: PatcherEvents['patch_error'][0]) => void) =>
      subscribe('game:patch_error', callback),
    patchEnd: (callback: (value: PatcherEvents['patch_end'][0]) => void): IpcCleanup => subscribe('game:patch_end', callback),
    launchCheckJava: (callback: () => void): IpcCleanup => subscribeVoid('game:launch_check_java', callback),
    javaInfo: (callback: (value: JavaEvents['java_info'][0]) => void): IpcCleanup => subscribe('game:java_info', callback),

    launchClean: (callback: () => void): IpcCleanup => subscribeVoid('game:launch_clean', callback),
    cleanProgress: (callback: (value: CleanerEvents['clean_progress'][0]) => void) =>
      subscribe('game:clean_progress', callback),
    cleanEnd: (callback: (value: CleanerEvents['clean_end'][0]) => void): IpcCleanup => subscribe('game:clean_end', callback),
    launchLaunch: (callback: (value: LauncherEvents['launch_launch'][0]) => void) =>
      subscribe('game:launch_launch', callback),
    launched: (callback: () => void): IpcCleanup => subscribeVoid('game:launched', callback),

    launchData: (callback: (value: LauncherEvents['launch_data'][0]) => void) =>
      subscribe('game:launch_data', callback),
    launchClose: (callback: (value: number) => void): IpcCleanup => subscribe('game:launch_close', callback),
    launchDebug: (callback: (value: LauncherEvents['launch_debug'][0]) => void) =>
      subscribe('game:launch_debug', callback),
    patchDebug: (callback: (value: PatcherEvents['patch_debug'][0]) => void): IpcCleanup => subscribe('game:patch_debug', callback)
  },
  skin: {
    reload: (account: Account): Promise<void | null> => ipcRenderer.invoke('skin:reload', account),
    getSkin: (account?: Account): Promise<ISkin[] | null> => ipcRenderer.invoke('skin:get_skin', account),
    getCape: (account?: Account): Promise<ICape[] | null> => ipcRenderer.invoke('skin:get_cape', account),
    getAvatar: (account?: Account): Promise<IAvatar | null> => ipcRenderer.invoke('skin:get_avatar', account),
    updateSkin: (source: string | Blob, model?: 'classic' | 'slim'): Promise<ISkin[] | null> => ipcRenderer.invoke('skin:update_skin', source, model),
    // updateCape: (source: string | Blob): Promise<ICape[] | null> => ipcRenderer.invoke('skin:update_cape', source), --- Not implemented with Microsoft accounts ---
    switchCape: (id: string): Promise<ICape[] | null> => ipcRenderer.invoke('skin:switch_cape', id),
    deleteSkin: (id: string): Promise<ISkin[] | null> => ipcRenderer.invoke('skin:delete_skin', id),
    // deleteCape: (): Promise<ICape[] | null> => ipcRenderer.invoke('skin:delete_cape'), --- Not implemented with Microsoft accounts ---
    hideCape: (): Promise<ICape[] | null> => ipcRenderer.invoke('skin:hide_cape')
  },
  server: {
    getStatus: (ip: string, port?: number): Promise<IServerStatus | null> => ipcRenderer.invoke('server:status', ip, port)
  },
  news: {
    getNews: (): Promise<INews[]> => ipcRenderer.invoke('news:get_news'),
    getCategories: (): Promise<INewsCategory[]> => ipcRenderer.invoke('news:get_categories')
  },
  background: {
    get: (): Promise<IBackground | null> => ipcRenderer.invoke('background:get')
  },
  maintenance: {
    get: (): Promise<IMaintenance | null> => ipcRenderer.invoke('maintenance:get')
  },
  bootstraps: {
    check: (): Promise<IBootstraps> => ipcRenderer.invoke('bootstraps:check'),
    download: (): Promise<string[]> => ipcRenderer.invoke('bootstraps:download'),
    install: (): Promise<void> => ipcRenderer.invoke('bootstraps:install'),
    downloadProgress: (callback: (value: DownloaderEvents['download_progress'][0]) => void): IpcCleanup =>
      subscribe('bootstraps:download_progress', callback),
    downloadEnd: (callback: (value: DownloaderEvents['download_end'][0]) => void): IpcCleanup =>
      subscribe('bootstraps:download_end', callback),
    error: (callback: (value: BootstrapsEvents['bootstraps_error'][0]) => void): IpcCleanup =>
      subscribe('bootstraps:error', callback)
  },
  settings: {
    get: (): Promise<IGameSettings> => ipcRenderer.invoke('settings:get'),
    set: (s: IGameSettings): Promise<boolean> => ipcRenderer.invoke('settings:set', s),
    pickJava: (): Promise<string | null> => ipcRenderer.invoke('settings:pick_java')
  },
  system: {
    getInfo: (): Promise<ISystemInfo> => ipcRenderer.invoke('system:info')
  }
})
