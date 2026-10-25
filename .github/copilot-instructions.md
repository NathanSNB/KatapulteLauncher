# Directives du Projet : Katapulte Launcher (Electron V1)

## Architecture & Framework
- **Tech Stack** : Electron 41, Vite 8, TypeScript, `eml-lib`, `electron-updater`.
- **Architecture à 2 couches** :
  - Back-end / Processus Main : `/electron` (`main.ts`, `preload.ts`, handlers IPC dans `electron/handlers/`).
  - Front-end / Renderer : `/src` (`views/`, `state.ts`, `ipc.ts`, styles SCSS).
- **Administration** : Backend dans `electron/const.ts` (`ADMINTOOL_URL`, `ROOT_ID = 'natSNB68'`).

## Règles IPC & Sécurité
- Toute communication Main <-> Renderer passe par `preload.ts` et `window.api`.
- Utiliser exclusivement `ipcMain.handle` et `ipcRenderer.invoke` (aucun `sendSync`).
- Ne jamais exposer directement d'API Node.js dans le Renderer.
- Sécurité WebPreferences : `nodeIntegration: false`, `contextIsolation: true`.

## Logique Métier & Bonnes Pratiques
- La logique lourde (auth Microsoft, téléchargements EML, gestion Java/mémoire, bootstraps) doit résider dans `electron/handlers/` et PAS dans les vues `/src/views/`.
- Les vues front ne doivent piloter que l'UI et réagir aux événements.
- Conserver `electron-log` pour le débogage.
- Toujours conserver le typage strict TypeScript et documenter avec JSDoc si nécessaire.

PS : Toutes modifications, suggestions ou problèmes doit être signaler à l'utiilsateur en fin de conversation.