import { setView, getUser } from '../state'
import { game, news, server, settings, profiles, auth, maintenance } from '../ipc'
import { Dialog } from './dialog'
import logger from 'electron-log/renderer'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// ---------------------------------------------------------
// CONFIGURATION LOCALE DES SERVEURS (Titres, Descriptions, Backgrounds)
// ---------------------------------------------------------
const SERVER_INFO: Record<string, { title: string, desc: string, bg: string }> = {
  'vanilla': {
    title: 'Vanilla',
    desc: 'L\'expérience vanilla de la mathysie !',
    bg: './images/bg-vanilla.png' // Place ton image ici
  },
  'mathysia': {
    title: 'Mathysia',
    desc: 'Plongez dans l\'univers unique de MathysiaSMP.',
    bg: './images/bg-mathysia.png' // Place ton image ici
  },
  'events': {
    title: 'Événements',
    desc: 'Participez à nos événements communautaires exclusifs.',
    bg: './images/bg-events.png' // Place ton image ici
  },
  'default': {
    title: 'Serveur',
    desc: 'Rejoignez l\'aventure sur ce serveur.',
    bg: './images/bg.png' // Image de secours
  }
}
// ---------------------------------------------------------

// Sécurisation des liens
marked.use({
  renderer: {
    link(link) {
      const href = link.href ?? '#'
      const titleAttr = link.title ? ` title="${link.title}"` : ''
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${link.text}</a>`
    }
  }
})

const parseNews = (rawContent: string) => DOMPurify.sanitize(marked.parse(rawContent) as string, { ADD_ATTR: ['target', 'rel'] })

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', year: 'numeric' })
}

const getIconForProfile = (prefix: string) => {
  const lowerPrefix = prefix.toLowerCase()
  if (lowerPrefix.includes('vanilla')) return 'fa-tree'
  if (lowerPrefix.includes('modde') || lowerPrefix.includes('modpack')) return 'fa-flask'
  if (lowerPrefix.includes('mathysia')) return 'fa-globe'
  if (lowerPrefix.includes('mini') || lowerPrefix.includes('jeux')) return 'fa-gamepad'
  if (lowerPrefix.includes('event')) return 'fa-calendar'
  return 'fa-server'
}

export function initHome() {
  const heroTitle = document.getElementById('hero-title')!
  const heroDesc = document.getElementById('hero-desc')!
  const playButtonsContainer = document.getElementById('play-buttons-container')!
  const launchSecondaryActions = document.getElementById('launch-secondary-actions')!
  const newsList = document.getElementById('news-list')!
  const bgElement = document.getElementById('server-background')!
  const statusDot = document.getElementById('server-status-dot')!
  const playerCount = document.getElementById('player-count')!
  const progressContainer = document.getElementById('launch-progress-container')!
  const progressBar = document.getElementById('launch-progress-bar')!
  const progressLabel = document.getElementById('launch-progress-label')!
  const progressPercent = document.getElementById('launch-progress-percent')!
  const logsViewContent = document.getElementById('logs-view-content')!
  const copyLogsButton = document.getElementById('btn-copy-logs')
  const backHomeFromLogsButton = document.getElementById('btn-back-home-from-logs')

  let groupedProfiles: Record<string, any[]> = {}
  let activeUtilityProfile: any | null = null
  let totalToDownload = 0
  let totalDownloadedByType: { type: string; size: number }[] = []
  let logsLines: string[] = []

  document.getElementById('btn-discord')?.addEventListener('click', () => {
    window.open('https://discord.gg/QsCh9pdsTE', '_blank')
  })

  document.getElementById('btn-settings')?.addEventListener('click', () => setView('settings'))

  document.getElementById('btn-logout-sidebar')?.addEventListener('click', async () => {
    const isConfirmed = await Dialog.show('Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', type: 'cancel' },
      { text: 'Déconnexion', type: 'danger' }
    ])
    if (isConfirmed) {
      await auth.logout()
      setView('login')
    }
  })

  const appendLogLine = (message: string) => {
    const prefix = new Date().toLocaleTimeString('fr-FR', { hour12: false })
    const line = `[${prefix}] ${message}`

    logsLines.push(line)
    if (logsLines.length > 500) logsLines.splice(0, logsLines.length - 500)

    logsViewContent.textContent = logsLines.join('\n')
    logsViewContent.scrollTop = logsViewContent.scrollHeight
  }

  const setLogsMode = () => {
    setView('logs')
    appendLogLine('Mode logs activé: le launcher reste ouvert pendant l\'exécution.')
  }

  copyLogsButton?.addEventListener('click', async () => {
    const text = logsLines.join('\n')
    if (!text.trim()) {
      await Dialog.show('Aucun log à copier pour le moment.', [{ text: 'OK', type: 'ok' }])
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      await Dialog.show('Logs copiés dans le presse-papiers.', [{ text: 'OK', type: 'ok' }])
    } catch {
      await Dialog.show('Impossible de copier automatiquement les logs.', [{ text: 'OK', type: 'ok' }])
    }
  })

  backHomeFromLogsButton?.addEventListener('click', () => setView('home'))

  const renderUtilityActions = () => {
    launchSecondaryActions.innerHTML = ''
    if (!activeUtilityProfile) return

    const uninstallBtn = document.createElement('button')
    uninstallBtn.className = 'btn-launch-tool uninstall'
    uninstallBtn.innerHTML = `<i class="fa-solid fa-trash"></i> Désinstaller la version`
    uninstallBtn.title = `Supprimer les fichiers de ${activeUtilityProfile.slug}`

    uninstallBtn.addEventListener('click', async () => {
      const isConfirmed = await Dialog.show(
        `Supprimer la version locale ${activeUtilityProfile.slug} ?\nLe prochain lancement retéléchargera les fichiers.`,
        [
          { text: 'Annuler', type: 'cancel' },
          { text: 'Désinstaller', type: 'danger' }
        ]
      )
      if (!isConfirmed) return

      const result = await game.uninstallProfile(activeUtilityProfile.slug)
      if (!result.success) {
        await Dialog.show(`Échec de la désinstallation: ${result.message ?? 'Erreur inconnue'}`, [{ text: 'Fermer', type: 'ok' }])
        return
      }

      await Dialog.show('Version désinstallée avec succès.', [{ text: 'OK', type: 'ok' }])
    })

    const openModsBtn = document.createElement('button')
    openModsBtn.className = 'btn-launch-tool icon-only'
    openModsBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i>'
    openModsBtn.title = 'Ouvrir le dossier mods'
    openModsBtn.setAttribute('aria-label', 'Ouvrir le dossier mods')

    openModsBtn.addEventListener('click', async () => {
      const result = await game.openModsFolder(activeUtilityProfile.slug)
      if (result.success) return
      await Dialog.show(`Impossible d'ouvrir le dossier mods: ${result.message ?? 'Erreur inconnue'}`, [{ text: 'Fermer', type: 'ok' }])
    })

    launchSecondaryActions.appendChild(uninstallBtn)
    launchSecondaryActions.appendChild(openModsBtn)
  }

  const switchServerGroup = (prefix: string) => {
    const group = groupedProfiles[prefix]
    if (!group || group.length === 0) return

    document.querySelectorAll('.nav-server').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-target') === prefix)
    })

    // Récupération des infos locales via le préfixe
    const info = SERVER_INFO[prefix.toLowerCase()] || SERVER_INFO['default']

    heroTitle.innerText = info.title
    heroDesc.innerText = info.desc
    bgElement.style.backgroundImage = `url('${info.bg}')`

    playButtonsContainer.innerHTML = ''
    logsLines = []
    logsViewContent.textContent = ''
    activeUtilityProfile = group.find((profile) => !profile.slug.toLowerCase().includes('-fc')) ?? group[0]
    renderUtilityActions()
    
    // Génération des boutons (Petite config / Normal)
    group.forEach(profile => {
      const btn = document.createElement('button')
      const isLite = profile.slug.toLowerCase().includes('-fc')
      
      btn.className = isLite ? 'btn-play-normal lite-btn' : 'btn-play-normal'
      btn.style.margin = '0 5px'
      
      if (isLite) {
        btn.innerHTML = `<i class="fa-solid fa-feather"></i> Jouer en petite config`
        btn.style.background = 'rgba(255, 255, 255, 0.1)'
        btn.style.border = '1px solid rgba(255, 255, 255, 0.2)'
      } else {
        btn.innerHTML = `<i class="fa-solid fa-play"></i> Jouer`
      }
      
      btn.onclick = () => launchGame(profile)
      playButtonsContainer.appendChild(btn)
    })

    updateServerStatus(group[0])
  }

  const updateServerStatus = async (profile: any) => {
    statusDot.className = 'status-dot pinging'
    playerCount.innerHTML = 'Ping en cours...'

    if (!profile.ip) {
      statusDot.className = 'status-dot offline'
      playerCount.innerHTML = 'IP non configurée'
      return
    }

    try {
      const status = await server.getStatus(profile.ip, profile.port || 25565)
      if (status && status.players) {
        statusDot.className = 'status-dot online'
        playerCount.innerHTML = `${status.players.online.toLocaleString()} joueurs en ligne`
      } else {
        throw new Error('Status object is empty')
      }
    } catch (e) {
      statusDot.className = 'status-dot offline'
      playerCount.innerHTML = 'Rejoindre pour découvrir le serveur !'
    }
  }

  const showNewsPopup = (item: any) => {
    const overlay = document.createElement('div')
    overlay.className = 'dialog-overlay'
    overlay.style.alignItems = 'flex-start'
    overlay.style.justifyContent = 'flex-end'

    const bodyHtml = item.content ? parseNews(item.content) : 'Aucun contenu.'

    overlay.innerHTML = `
      <div class="dialog-box" style="width: 400px; background: #1a1a1a; margin: 40px;">
        <h2 style="color: white; font-size: 18px;">${item.title}</h2>
        <div style="color: #ddd; font-size: 14px;">${bodyHtml}</div>
        <button id="close-news" class="btn btn-secondary">Fermer</button>
      </div>`
    document.body.appendChild(overlay)
    document.getElementById('close-news')?.addEventListener('click', () => overlay.remove())
  }

  const loadNews = async () => {
    try {
      const feed = await news.getNews()
      newsList.innerHTML = ''
      feed.slice(0, 2).forEach((item: any) => {
        const div = document.createElement('div')
        div.className = 'mini-article'
        
        let tagsHtml = ''
        if (item.tags && item.tags.length > 0) {
          tagsHtml = '<div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">' + 
                     item.tags.map((t: any) => `<span style="font-size: 10px; background: rgba(255,87,34,0.15); color: #ff5722; padding: 2px 6px; border-radius: 4px; font-weight: bold;">#${t.name || t}</span>`).join('') + 
                     '</div>'
        }

        div.innerHTML = `
          <div style="font-size: 11px; color: #888; margin-bottom: 4px;">${formatDate(item.createdAt)}</div>
          <strong style="color: white;">${item.title}</strong>
          ${tagsHtml}
        `
        div.onclick = () => showNewsPopup(item)
        newsList.appendChild(div)
      })
    } catch (e) { newsList.innerHTML = 'Erreur chargement' }
  }

  const launchGame = async (profile: any) => {
    const user = getUser()
    if (!user) return
    logsLines = []
    logsViewContent.textContent = ''
    playButtonsContainer.style.display = 'none'
    launchSecondaryActions.style.display = 'none'
    progressContainer.classList.remove('hidden')
    
    const config = await settings.get()
    if (profile.slug.toLowerCase().includes('-fc')) {
       config.memory.max = Math.min(config.memory.max, 4) 
    }

    game.launch({ account: user, settings: config, profileSlug: profile.slug })
  }

  const setIndeterminate = (active: boolean) => {
    if (active) {
      progressBar.classList.add('indeterminate')
      progressPercent.style.display = 'none'
    } else {
      progressBar.classList.remove('indeterminate')
      progressPercent.style.display = 'block'
    }
  }

  game.launchComputeDownload(() => { setIndeterminate(true); progressLabel.innerText = 'Analyse des fichiers...' })
  game.launchDownload((download) => { setIndeterminate(false); totalToDownload = download.total.size; progressLabel.innerText = `Téléchargement en cours...` })
  game.downloadProgress((progress) => {
    const index = totalDownloadedByType.findIndex(t => t.type === progress.type)
    if (index === -1) totalDownloadedByType.push({ type: progress.type, size: progress.downloaded.size })
    else totalDownloadedByType[index].size = progress.downloaded.size
    
    const downloadedSum = totalDownloadedByType.reduce((acc, curr) => acc + curr.size, 0)
    const percentage = Math.min((downloadedSum / totalToDownload) * 100, 100)
    
    progressBar.style.width = `${percentage}%`
    progressPercent.innerText = `${Math.round(percentage)}%`
  })
  
  game.launchInstallLoader(() => { setIndeterminate(true); progressLabel.innerText = 'Installation...' })
  game.launchExtractNatives(() => progressLabel.innerText = 'Extraction...')
  game.launchCopyAssets(() => progressLabel.innerText = 'Finalisation des ressources...')
  game.launchPatchLoader(() => progressLabel.innerText = 'Application des patchs...')
  game.launchLaunch(() => {
    progressLabel.innerText = 'Lancement du jeu...'
    setLogsMode()
  })

  game.launchData((message) => appendLogLine(message))
  game.launchDebug((message) => appendLogLine(message))
  game.patchDebug((message) => appendLogLine(message))
  game.downloadError((error) => appendLogLine(`Erreur de téléchargement ${error.filename}: ${error.message}`))
  game.patchError((error) => appendLogLine(`Erreur de patch ${error.filename}: ${error.message}`))
  game.launchClose((code) => appendLogLine(`Processus Minecraft fermé avec le code ${code}.`))
  
  game.launched(() => {
    playButtonsContainer.style.display = 'flex'
    launchSecondaryActions.style.display = 'flex'
    progressContainer.classList.add('hidden')
  })

  const loadInitialData = async () => {
    try {
      const maint = await maintenance.get()
      if (maint && (maint as any).active) {
        setView('maintenance' as any)
        return
      }
      
      const rawProfiles = await profiles.get()
      if (!rawProfiles || rawProfiles.length === 0) throw new Error('Aucun profil')

      groupedProfiles = {}
      rawProfiles.forEach((p: any) => {
        const prefix = p.slug.split('-')[0]
        if (!groupedProfiles[prefix]) groupedProfiles[prefix] = []
        groupedProfiles[prefix].push(p)
      })

      const nav = document.getElementById('server-nav')
      if (nav) {
        nav.innerHTML = ''
        Object.keys(groupedProfiles).forEach(prefix => {
          const btn = document.createElement('button')
          btn.className = 'nav-server'
          btn.setAttribute('data-target', prefix)
          
          // Utilisation du titre du dictionnaire local au lieu du nom AdminTool
          const info = SERVER_INFO[prefix.toLowerCase()] || { title: prefix }
          
          btn.innerHTML = `
            <i class="fa-solid ${getIconForProfile(prefix)}"></i>
            <span>${info.title}</span>
          `
          btn.onclick = () => switchServerGroup(prefix)
          nav.appendChild(btn)
        })
      }
      
      switchServerGroup(Object.keys(groupedProfiles)[0])
      await loadNews()
    } catch (e) { logger.error(e) }
  }

  loadInitialData()
}