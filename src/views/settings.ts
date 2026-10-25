import { setView, closeOverlay } from '../state'
import { auth, game, settings, system, skin } from '../ipc'
import { Dialog } from './dialog'
import type { IGameSettings } from '../../electron/handlers/settings'
import shared from '../shared'
import packageJson from '../../package.json'

const resolutionList = [
  { label: 'Auto (default)', value: '854x480', width: 854, height: 480 },
  { label: 'Fullscreen', value: 'fullscreen', width: 854, height: 480 },
  { label: '2560x1440 (1440p)', value: '2560x1440', width: 2560, height: 1440 },
  { label: '1920x1080 (1080p)', value: '1920x1080', width: 1920, height: 1080 },
  { label: '1600x900', value: '1600x900', width: 1600, height: 900 },
  { label: '1366x768', value: '1366x768', width: 1366, height: 768 },
  { label: '1280x1024', value: '1280x1024', width: 1280, height: 1024 },
  { label: '1280x720 (720p)', value: '1280x720', width: 1280, height: 720 },
  { label: '1024x768', value: '1024x768', width: 1024, height: 768 },
  { label: '800x600', value: '800x600', width: 800, height: 600 }
]

let currentSettings: IGameSettings

export async function initSettings() {
  const sysInfo = await system.getInfo()
  currentSettings = await settings.get()

  initUIListeners()
  initDualSlider(sysInfo.totalMem)
  initFormValues(sysInfo.resolution)

  const versionElem = document.getElementById('version')
  if (versionElem) versionElem.innerText = `Katapulte v${packageJson.version}`
}

function initUIListeners() {
  const closeBtn = document.getElementById('btn-close-settings')
  const settingsOverlay = document.getElementById('view-settings')
  const tabContents = document.querySelectorAll('.tab-content')
  const tabButtons = document.querySelectorAll('.nav-btn')
  const logoutBtn = document.getElementById('btn-logout')
  const uninstallGameBtn = document.getElementById('btn-uninstall-game')

  const addSkinUrlBtn = document.getElementById('btn-add-skin-url')!
  const addSkinFileBtn = document.getElementById('btn-add-skin-file')!

  const addSkinFileForm = document.getElementById('form-add-skin-file')!
  const addSkinFileInput = document.getElementById('input-add-skin-file') as HTMLInputElement
  const addSkinFileButton = document.getElementById('btn-add-skin-choose-file') as HTMLButtonElement
  const addSkinFileSelectedDiv = document.getElementById('div-add-skin-file-selected')!
  const addSkinFileSelectedName = document.getElementById('span-add-skin-file-name')!
  const addSkinFileResetBtn = document.getElementById('btn-selected-file-reset') as HTMLButtonElement

  const addSkinUrlForm = document.getElementById('form-add-skin-url')!
  const addSkinUrlInput = document.getElementById('input-add-skin-url') as HTMLInputElement

  const addSkinSubmitBtn = document.getElementById('btn-add-skin-submit') as HTMLButtonElement

  closeBtn?.addEventListener('click', async () => {
    await saveSettings()
    closeOverlay('settings')
  })

  settingsOverlay?.addEventListener('click', async (event) => {
    if (event.target !== settingsOverlay) return
    await saveSettings()
    closeOverlay('settings')
  })

  logoutBtn?.addEventListener('click', async () => {
    if (
      await Dialog.show('Log out?', [
        { text: 'Cancel', type: 'cancel' },
        { text: 'Logout', type: 'danger' }
      ])
    ) {
      await auth.logout()
      closeOverlay('settings')
      setView('login')
    }
  })

  uninstallGameBtn?.addEventListener('click', async () => {
    if (!shared.activeProfileSlug) return
    const confirmed = await Dialog.show('Supprimer les fichiers du jeu pour ce profil ?', [
      { text: 'Annuler', type: 'cancel' },
      { text: 'Désinstaller', type: 'danger' }
    ])
    if (!confirmed) return
    const result = await game.uninstall(shared.activeProfileSlug)
    await Dialog.show(
      result.success ? 'Les fichiers du jeu ont été désinstallés.' : `Échec de la désinstallation : ${result.message ?? 'Erreur inconnue'}`,
      [{ text: 'OK', type: 'ok' }]
    )
  })

  addSkinUrlBtn?.addEventListener('click', () => {
    addSkinUrlBtn!.classList.add('active')
    addSkinFileBtn!.classList.remove('active')
    addSkinUrlForm!.style.display = 'block'
    addSkinFileForm!.style.display = 'none'
    addSkinFileInput.value = ''
    addSkinUrlInput.value = ''
    addSkinFileSelectedDiv.style.display = 'none'
    addSkinFileButton.style.display = 'block'
    addSkinSubmitBtn.disabled = true
  })

  addSkinFileBtn?.addEventListener('click', () => {
    addSkinFileBtn!.classList.add('active')
    addSkinUrlBtn!.classList.remove('active')
    addSkinUrlForm!.style.display = 'none'
    addSkinFileForm!.style.display = 'block'
    addSkinUrlInput.value = ''
    addSkinFileInput.value = ''
    addSkinFileSelectedDiv.style.display = 'none'
    addSkinFileButton.style.display = 'block'
    addSkinSubmitBtn.disabled = true
  })

  addSkinFileButton?.addEventListener('click', async () => {
    addSkinFileInput.click()
  })

  addSkinFileInput?.addEventListener('change', async () => {
    const file = addSkinFileInput.files?.[0]
    if (!file) {
      addSkinFileButton.style.display = 'block'
      addSkinSubmitBtn.disabled = true
      addSkinFileSelectedDiv.style.display = 'none'
      return
    }

    addSkinFileButton.style.display = 'none'
    addSkinSubmitBtn.disabled = false
    addSkinFileSelectedName.innerText = file.name
    addSkinFileSelectedDiv.style.display = 'block'
  })

  addSkinUrlInput?.addEventListener('input', () => {
    addSkinSubmitBtn.disabled = addSkinUrlInput.value.trim() === ''
  })

  addSkinFileResetBtn?.addEventListener('click', () => {
    addSkinFileInput.value = ''
    addSkinFileButton.style.display = 'block'
    addSkinSubmitBtn.disabled = true
    addSkinFileSelectedDiv.style.display = 'none'
  })

  addSkinSubmitBtn?.addEventListener('click', async () => {
    addSkin()
    addSkinUrlInput.value = ''
    addSkinFileInput.value = ''
    addSkinFileButton.style.display = 'block'
    addSkinSubmitBtn.disabled = true
    addSkinFileSelectedDiv.style.display = 'none'
    document.getElementById('settings-content')?.scrollTo({ top: 0, behavior: 'smooth' })
  })

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      const targetTab = btn.getAttribute('data-tab')
      tabContents.forEach((c) => (c.id === `tab-${targetTab}` ? c.classList.add('active') : c.classList.remove('active')))
      if (targetTab === 'skin') {
        void shared.resetMainView()
        void shared.resetSkinViews()
        void shared.resetCapesViews()
      }
      if (targetTab === 'mods') void loadMods()
    })
  })
}

async function loadMods() {
  const serverList = document.getElementById('server-mods-list')
  const clientList = document.getElementById('client-mods-list')
  if (!serverList || !clientList || !shared.activeProfileSlug) return
  serverList.innerHTML = '<p class="mods-empty">Chargement des mods...</p>'
  clientList.innerHTML = ''
  try {
    const mods = await game.mods.list(shared.activeProfileSlug)
    const serverMods = mods.filter((mod) => mod.managed)
    const clientMods = mods.filter((mod) => !mod.managed)
    serverList.innerHTML = ''
    clientList.innerHTML = ''
    renderMods(serverList, serverMods, 'Aucun mod serveur installé.')
    renderMods(clientList, clientMods, 'Aucun mod personnel installé.')
  } catch (error) {
    serverList.innerHTML = '<p class="mods-empty">Impossible de charger les mods.</p>'
    clientList.innerHTML = ''
  }
}

function displayModName(name: string): string {
  return name.replace(/\.jar\.disabled$/i, '').replace(/\.jar$/i, '')
}

function renderMods(list: HTMLElement, mods: Awaited<ReturnType<typeof game.mods.list>>, emptyMessage: string) {
  if (!mods.length) {
    list.innerHTML = `<p class="mods-empty">${emptyMessage}</p>`
    return
  }

  for (const mod of mods) {
      const row = document.createElement('div')
      row.className = `mod-row${mod.managed ? ' server-mod' : ' client-mod'}`
      const label = document.createElement('span')
      label.textContent = displayModName(mod.name)
      row.appendChild(label)
      if (mod.managed) {
        const badge = document.createElement('span')
        badge.className = 'mod-badge'
        badge.textContent = 'Serveur · Obligatoire'
        row.appendChild(badge)
      } else {
        const toggle = document.createElement('button')
        toggle.className = `mod-toggle${mod.enabled ? ' enabled' : ''}`
        toggle.textContent = mod.enabled ? 'ON' : 'OFF'
        toggle.setAttribute('aria-label', `${mod.enabled ? 'Désactiver' : 'Activer'} le mod ${displayModName(mod.name)}`)
        toggle.addEventListener('click', async () => {
          toggle.disabled = true
          try {
            await game.mods.toggle(shared.activeProfileSlug!, mod.name)
            await loadMods()
          } catch (error) {
            await Dialog.show(`Impossible de modifier ${mod.name}.`, [{ text: 'Fermer', type: 'ok' }])
          } finally {
            toggle.disabled = false
          }
        })
        row.appendChild(toggle)
      }
      list.appendChild(row)
  }
}

function initDualSlider(maxRamSystem: number) {
  maxRamSystem = Math.min(maxRamSystem, 16)
  const minInput = document.getElementById('ram-min') as HTMLInputElement
  const fill = document.getElementById('ram-track-fill')
  const minLabel = document.getElementById('ram-min-label')

  if (!minInput || !fill) return

  minInput.max = maxRamSystem.toString()
  const updateSlider = () => {
    const ram = parseFloat(minInput.value)
    if (minLabel) minLabel.innerText = `${ram} GB`

    const range = maxRamSystem - parseFloat(minInput.min)
    const percent = ((ram - parseFloat(minInput.min)) / range) * 100
    fill.style.left = '0%'
    fill.style.width = `${percent}%`
  }

  minInput.addEventListener('input', updateSlider)
  updateSlider()
}

function initFormValues(resolution: { width: number; height: number }) {
  if (!currentSettings) return

  const minInput = document.getElementById('ram-min') as HTMLInputElement
  const resolutionSelect = document.getElementById('resolution-select') as HTMLSelectElement
  const launcherActionSelect = document.getElementById('launcher-action-select') as HTMLSelectElement
  const javaSelect = document.getElementById('java-select') as HTMLSelectElement

  if (minInput) minInput.value = currentSettings.memory.ram + ''
  if (resolutionSelect) {
    const availableResolutions = getAvailableResolutions(resolution)
    resolutionSelect.innerHTML = ''
    availableResolutions.forEach((res) => {
      const option = document.createElement('option')
      option.value = res.value
      option.innerText = res.label
      resolutionSelect.appendChild(option)
    })

    resolutionSelect.value = currentSettings.resolution.fullscreen
      ? 'fullscreen'
      : `${currentSettings.resolution.width}x${currentSettings.resolution.height}`
  }
  if (launcherActionSelect) launcherActionSelect.value = currentSettings.launcherAction
  if (javaSelect) javaSelect.value = currentSettings.java === 'bundled' ? 'bundled' : 'custom'

  minInput.dispatchEvent(new Event('input'))
}

async function saveSettings() {
  const minInput = document.getElementById('ram-min') as HTMLInputElement
  const launcherActionSelect = document.getElementById('launcher-action-select') as HTMLSelectElement
  const resolutionSelect = document.getElementById('resolution-select') as HTMLSelectElement
  const javaSelect = document.getElementById('java-select') as HTMLSelectElement

  const newSettings: IGameSettings = {
    ...currentSettings,
    memory: {
      ram: parseFloat(minInput.value)
    },
    resolution: {
      height: resolutionList.find((r) => r.value === resolutionSelect.value)?.height ?? 854,
      width: resolutionList.find((r) => r.value === resolutionSelect.value)?.width ?? 480,
      fullscreen: resolutionSelect.value === 'fullscreen'
    },
    java: javaSelect.value === 'bundled' ? 'bundled' : 'path',
    launcherAction: launcherActionSelect.value as 'close' | 'keep' | 'hide'
  }

  await settings.set(newSettings)
  currentSettings = newSettings
}

async function addSkin() {
  const addSkinUrlBtn = document.getElementById('btn-add-skin-url')!
  const addSkinFileBtn = document.getElementById('btn-add-skin-file')!
  const addSkinFileInput = document.getElementById('input-add-skin-file') as HTMLInputElement
  const addSkinUrlInput = document.getElementById('input-add-skin-url') as HTMLInputElement
  const addSkinSlimVariant = document.getElementById('input-add-skin-variant-slim') as HTMLInputElement

  let skinSource: string | ArrayBuffer | null = null
  let variant: 'classic' | 'slim' = 'classic'

  if (addSkinUrlBtn.classList.contains('active')) {
    skinSource = addSkinUrlInput.value.trim()
  } else if (addSkinFileBtn.classList.contains('active')) {
    const file = addSkinFileInput.files?.[0]
    if (file) {
      skinSource = await file.arrayBuffer()
    }
  }

  if (!skinSource) return

  if (addSkinSlimVariant.checked) variant = 'slim'

  try {
    const result = await skin.updateSkin(skinSource, variant)
    if (!result) {
      await Dialog.show('Failed to add skin. Please check the URL or file and try again.', [{ text: 'Close', type: 'ok' }])
      return
    }

    shared.skins = result
    shared.resetMainView()
    shared.resetSkinViews()
  } catch (err) {
    await Dialog.show('An error occurred while adding the skin. Please try again in few minutes.', [{ text: 'Close', type: 'ok' }])
    return
  }
}

function getAvailableResolutions(systemResolution: { width: number; height: number }) {
  return resolutionList.filter((res) => res.width <= systemResolution.width && res.height <= systemResolution.height)
}
