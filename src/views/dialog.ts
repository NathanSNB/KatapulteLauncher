import logger from 'electron-log/renderer'

export type ButtonType = 'ok' | 'cancel' | 'danger' | 'other'

export interface DialogButton {
  text: string
  type: ButtonType
  action?: () => any
}

class DialogSystem {
  private readonly overlay: HTMLElement
  private readonly messageEl: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly buttonsEl: HTMLElement
  private readonly closeButton: HTMLButtonElement
  private activeResolve: ((value: unknown) => void) | null = null

  constructor() {
    this.overlay = document.getElementById('custom-dialog')!
    this.messageEl = document.getElementById('dialog-message')!
    this.titleEl = document.getElementById('dialog-title')!
    this.buttonsEl = document.getElementById('dialog-buttons')!
    this.closeButton = document.getElementById('dialog-close') as HTMLButtonElement
    this.closeButton.addEventListener('click', () => this.close(false))
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.close(false)
    })
  }

  public async show<T = boolean>(message: string, buttons?: DialogButton[], title?: string): Promise<T> {
    return new Promise<T>((resolve) => {
      this.activeResolve = resolve as (value: unknown) => void
      this.messageEl.innerText = message
      this.buttonsEl.innerHTML = ''

      if (title) {
        this.titleEl.innerText = title
        this.titleEl.classList.remove('hidden')
      } else {
        this.titleEl.classList.add('hidden')
      }

      const configButtons = buttons ?? [
        { text: 'Cancel', type: 'cancel' },
        { text: 'OK', type: 'ok' }
      ]

      configButtons.forEach((btnConfig) => {
        const btn = document.createElement('button')
        btn.innerText = btnConfig.text
        btn.className = `btn btn-${btnConfig.type === 'ok' ? 'secondary' : btnConfig.type === 'danger' ? 'danger' : 'secondary'}`

        btn.onclick = async () => {
          if (btnConfig.action) {
            const result = await btnConfig.action()
            this.close(result !== undefined ? result : true)
          } else {
            switch (btnConfig.type) {
              case 'cancel':
                this.close(false)
                break
              case 'ok':
              case 'danger':
                this.close(true)
                break
              case 'other':
                logger.warn("The 'other' type button requires an action!")
                this.close(null)
                break
            }
          }
        }

        this.buttonsEl.appendChild(btn)
      })

      this.overlay.classList.remove('hidden')
    })
  }

  private close(result: unknown = false) {
    this.overlay.classList.add('hidden')
    this.activeResolve?.(result)
    this.activeResolve = null
  }
}

export const Dialog = new DialogSystem()
