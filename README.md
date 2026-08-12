# Katapulte Launcher

Launcher Electron pour le projet Katapulte, basé sur une architecture moderne TypeScript + Vite + Electron et intégrant la librairie EML pour la gestion de l’authentification Microsoft, des profils de jeu, du lancement du client Minecraft et des mises à jour.

Ce projet correspond à la V1 de la base de lancement. Il a été pensé pour pouvoir être repris, étendu et adapté par un autre développeur sans repartir de zéro.

> Documentation EML utile : https://emlproject.com/docs

## Sommaire

- [Vue d’ensemble](#vue-densemble)
- [Fonctionnalités principales](#fonctionnalités-principales)
- [Stack technique](#stack-technique)
- [Architecture du projet](#architecture-du-projet)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Scripts disponibles](#scripts-disponibles)
- [Lancer le projet en développement](#lancer-le-projet-en-développement)
- [Construire les builds](#construire-les-builds)
- [Roadmap](#roadmap)
- [GitHub Actions - packaging multi-plateforme](#github-actions---packaging-multi-plateforme)
- [Release Guide](#release-guide)
- [Configuration clé du launcher](#configuration-clé-du-launcher)
- [Points d’entrée pour reprendre la base](#points-dentrée-pour-reprendre-la-base)
- [Bonnes pratiques de développement](#bonnes-pratiques-de-développement)
- [Problèmes connus / points à vérifier](#problèmes-connus--points-à-vérifier)
- [Licence](#licence)

## Vue d’ensemble

Katapulte Launcher est une application de bureau destinée à lancer un jeu Minecraft dans un environnement custom, avec :

- connexion Microsoft / session utilisateur gérée localement,
- sélection de profils de serveur,
- lancement du jeu avec paramètres Java / mémoire / résolution,
- gestion des skins et avatars,
- intégration de nouvelles / contenus d’actualité,
- gestion du back-office du launcher via des handlers Electron,
- maintenance / mise à jour / bootstraps automatisés.

L’application est structurée en deux grandes parties :

1. le processus Electron principal (`electron/`), qui gère le cycle de vie de l’application, les IPC, les mises à jour et les données système ;
2. le front-end rendu dans le navigateur (`src/`), qui contient les vues visuelles et la logique d’interface.

## Fonctionnalités principales

- Authentification Microsoft avec validation et refresh de session.
- Sauvegarde des sessions utilisateur dans le dossier utilisateur d’Electron.
- Chargement des profils et des serveurs depuis la configuration EML / API distante.
- Démarrage du jeu avec gestion des réglages Java, mémoire et résolution.
- Vérification des mises à jour de bootstraps et installation automatique.
- Système de news/annonces dans l’interface.
- Gestion de l’état de maintenance du launcher.
- Gestion des skins, capes et avatars du compte.
- Vérification du status du serveur (ping / joueurs en ligne).
- Interface dark mode avec vues login, home, settings et maintenance.

## Stack technique

- Electron 41
- Vite 8
- TypeScript
- eml-lib
- electron-updater
- electron-log
- marked + DOMPurify
- skinview3d
- Sass

## Architecture du projet

```text
.
├─ electron/
│  ├─ const.ts                 # URL d’administration / identifiant racine
│  ├─ main.ts                 # Fenêtre Electron + lifecycle app
│  ├─ preload.ts              # Exposition des APIs vers le renderer
│  ├─ handlers/
│  │  ├─ auth.ts              # Microsoft auth + session
│  │  ├─ background.ts        # Backgrounds / wallpapers
│  │  ├─ bootstraps.ts        # Bootstraps + mise à jour
│  │  ├─ launcher.ts          # Lancement du jeu via eml-lib
│  │  ├─ maintenance.ts       # Maintenance
│  │  ├─ news.ts              # Feed / actualités
│  │  ├─ profiles.ts          # Profils, serveurs, groupes
│  │  ├─ server.ts            # Vérification du status serveur
│  │  ├─ settings.ts          # Paramètres utilisateur
│  │  └─ skin.ts              # Skins / capes / avatar
│  └─ utils/
│     └─ ipc.ts               # Helpers IPC sécurisés
├─ src/
│  ├─ app.ts                  # Point d’entrée des styles et initialisation des vues
│  ├─ init.ts                 # Bootstrap du launcher
│  ├─ ipc.ts                  # API exposée côté renderer
│  ├─ shared.ts               # Éventuels utilitaires partagés
│  ├─ state.ts                # État global UI / session
│  ├─ static/
│  │  └─ styles/
│  └─ views/
│     ├─ dialog.ts
│     ├─ home.ts
│     ├─ login.ts
│     └─ settings.ts
├─ public/
│  └─ images/
├─ build/
├─ dist-electron/
├─ release/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ electron-builder.yml
├─ LICENSE
└─ README.md
```

### Rôle de chaque couche

#### `electron/main.ts`

- initialise l’application Electron,
- crée la fenêtre principale,
- configure le menu,
- enregistre tous les handlers IPC nécessaires,
- gère le chargement de la vue principale.

#### `electron/preload.ts`

- expose une API sécurisée dans `window.api`,
- permet au renderer d’envoyer des appels IPC au processus principal sans exposer Node directement.

#### `electron/handlers/*.ts`

- centralisent toutes les fonctionnalités back-end,
- sont branchés à l’objet `window.api` du front,
- gèrent les appels de type `ipcRenderer.invoke` / `ipcMain.handle`.

#### `src/views/*.ts`

- contiennent la logique d’UI et les interactions utilisateur,
- chargent et affichent les données de la session,
- déclenchent les actions de lancement, réglages et navigation.

## Prérequis

Avant de lancer le projet, il faut avoir installé :

- Node.js 20+ (recommandé)
- npm
- Git
- Un environnement Windows / macOS / Linux compatible Electron

## Installation

```bash
npm install
```

## Scripts disponibles

Dans `package.json` :

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build && electron-builder",
    "build:win": "vite build && electron-builder --win",
    "build:mac": "vite build && electron-builder --mac",
    "build:mac-universal": "vite build && electron-builder --mac --universal",
    "build:lin": "vite build && electron-builder --linux"
  }
}
```

## Lancer le projet en développement

Pour démarrer le launcher en mode dev :

```bash
npm run dev
```

Cela démarre Vite avec la config Electron, et la fenêtre principale est ensuite chargée via le processus Electron.

## Construire les builds

### Windows

```bash
npm run build:win
```

### macOS

```bash
npm run build:mac
```

### Linux

```bash
npm run build:lin
```

### Build générique

```bash
npm run build
```

Les livrables sont généralement générés dans le dossier `release/` selon la configuration Electron Builder.

## Roadmap

### V1 — Base du launcher

- [x] Authentification Microsoft
- [x] Gestion de session et refresh
- [x] Sélection des profils
- [x] Démarrage du jeu avec Java / mémoire / résolution
- [x] Gestion des skin, cape et avatar
- [x] Système de news / maintenance
- [x] Gestion des mises à jour / bootstraps
- [x] Interface login, home, settings et maintenance

### V2 — Polissage et stabilité

- [ ] Nettoyage du code et refacto des composants UI
- [ ] Optimisation des performances d’ouverture de l’application
- [ ] Gestion des erreurs détaillée et logs utilisateur
- [ ] Meilleure validation des états de connexion et de session
- [ ] Gestion des téléchargements / mises à jour plus robuste

### V3 — Expérience et distribution

- [ ] Packagings multi-plateformes automatisés et reproductibles
- [ ] Release notes plus lisibles et automatiques
- [ ] Déploiement/gestion versionning plus propre
- [ ] Ajout de modules de contenu / gestion administrateur
- [ ] Expérience de mise à jour plus transparente pour les joueurs

## GitHub Actions - packaging multi-plateforme

Le projet est prévu pour être packagé automatiquement via GitHub Actions sur plusieurs OS, ce qui permet de produire les builds Windows, macOS et Linux sans devoir les générer manuellement sur chaque machine.

### Objectif

- compiler automatiquement le projet à chaque release,
- générer les fichiers installables pour plusieurs plateformes,
- publier les artefacts sur GitHub,
- déclencher les mises à jour via Electron Builder / GitHub Releases.

### Exemple de workflow recommandé

```yaml
name: Build Electron App

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    runs-on: ${{ matrix.os }}

    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm install

      - name: Build app
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: katapulte-launcher-${{ matrix.os }}
          path: |
            release/*
            dist-electron/**
```

### Bonnes pratiques

- utiliser un tag Git versionné (`v1.0.3`, `v1.1.0`, etc.),
- ne pas publier une release sans incrémenter la version dans `package.json`,
- conserver un build Windows, macOS et Linux séparés dans les artefacts,
- sécuriser les variables d’environnement si tu utilises GitHub Releases / signing,
- vérifier les builds sur les systèmes cibles avant de finaliser une vraie release publique.

> Le packaging multiplateforme via GitHub Actions est une excellente manière de rendre la base de Katapulte plus sérieuse, plus reproductible et plus facile à maintenir par un autre développeur.

## Release Guide

### 1. Mettre à jour le numéro de version

C’est l’étape la plus importante. Pour que le système de mise à jour automatique comprenne qu’il y a une nouveauté, il faut incrémenter la version de ton application.

Ouvre le fichier `package.json` situé à la racine de ton projet.

Change la pour ton nouveau numéro de version, par exemple : `"version": "1.x.x"`.

Sauvegarde le fichier.

> Règle d’or : ne fais jamais de nouvelle release sans changer ce numéro, sinon `electron-builder` peut écraser tes anciens fichiers sur GitHub et tes joueurs ne recevront pas la mise à jour.

### 2. Sauvegarder et envoyer le code (Commit & Push)

Maintenant que tes modifications et ton nouveau numéro de version sont prêts, il faut les envoyer sur GitHub pour déclencher la compilation.

Dans le terminal :

```bash
git add .
git commit -m "Release v1.0.3 : Ajout de la nouvelle interface"
git push origin main
```

### 3. Vérifier la publication / build

Après le push :

- GitHub Actions se déclenche automatiquement,
- le build est lancé selon la configuration du workflow,
- les artefacts sont générés,
- la release peut ensuite être créée ou mise à jour avec les binaires produits.

### 4. Créer la release GitHub

Une fois le build terminé :

1. aller dans l’onglet Releases de GitHub,
2. créer une nouvelle release,
3. sélectionner le tag correspondant (ex. `v1.0.3`),
4. ajouter les notes de version,
5. attacher les fichiers buildés,
6. publier la release.

### 5. Vérifier la mise à jour du launcher

Ensuite, un utilisateur qui lance le logiciel va recevoir la nouvelle version automatiquement si la mise à jour est correctement branchée côté Electron / GitHub Releases.

## Configuration clé du launcher

### 1. URL de l’admin tool / backend

Le fichier `electron/const.ts` contient :

```ts
export const ADMINTOOL_URL = 'https://launcher.mathysie.eu'
export const ROOT_ID = 'natSNB68'
```

Ces valeurs pilotent le backend EML et l’identifiant racine du launcher. Si le projet évolue vers une autre infrastructure, c’est ici qu’il faut modifier les points d’entrée.

### 2. Paramètres de jeu

Les réglages par défaut sont définis dans `electron/handlers/settings.ts` :

- Java : bundled ou system
- Memory : min / max
- Résolution
- Action du launcher après lancement : close / keep / hide

Ces paramètres sont sérialisés dans le dossier utilisateur d’Electron via `app.getPath('userData')`.

### 3. Session utilisateur

La session Microsoft est stockée dans `session.json` dans le userData. Le code gère ensuite :

- login,
- refresh,
- validation,
- logout.

### 4. Mise à jour / bootstraps

Le projet inclut :

- vérification des update bootstraps,
- téléchargement,
- installation,
- notification de mise à jour,
- reload de l’application.

Les événements de bootstraps sont gérés avec `window.api.bootstraps.*` et le backend EML.

## Points d’entrée pour reprendre la base

Si un autre dev reprend l’application, les zones les plus importantes à connaître sont :

### A. Modifier la logique de lancement du jeu

- `electron/handlers/launcher.ts`

C’est ici que le `Launcher` de `eml-lib` est instancié, configuré, et branché sur les événements de téléchargement, installation, patch, et lancement.

### B. Modifier les états de session et d’authentification

- `electron/handlers/auth.ts`
- `src/ipc.ts`
- `src/state.ts`

Ces fichiers centralisent les behaviours de connexion, session active et vue actuelle de l’application.

### C. Modifier les vues et le design

- `src/views/*.ts`
- `src/static/styles/*.scss`

Les vues sont séparées par contexte : login, home, settings, maintenance, dialog. La logique métier y est découplée de la présentation.

### D. Modifier les profils / serveurs / nouveautés

- `electron/handlers/profiles.ts`
- `electron/handlers/server.ts`
- `electron/handlers/news.ts`

### E. Modifier les paramètres de l’application

- `electron/handlers/settings.ts`

## Bonnes pratiques de développement

- Ne pas exposer directement des APIs Node dans le renderer.
- Garder les handlers Electron cohérents et centralisés par domaine.
- Préférer les appels IPC typés (`window.api.*`).
- Ajouter des logs via `electron-log` pour faciliter le debug.
- Lorsque l’on change la configuration de backend, vérifier `electron/const.ts` et les services associés.
- Tester les builds sur les OS cibles avant publication.

## Problèmes connus / points à vérifier

Avant de mettre en production, vérifier impérativement :

- les URL backend et ids de profils sont corrects,
- la configuration Java est bien fonctionnelle sur les machines ciblées,
- les flux de mise à jour ne cassent pas les profils existants,
- la session utilisateur est bien valide après reboot,
- les assets / backgrounds / images de serveur existent bien,
- le packaging ElectronBuilder est bien validé pour le système de sortie choisi.

## Licence

Ce projet est distribué sous licence MIT.

Voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

## À retenir pour la suite

Cette V1 constitue une base solide pour un launcher Electron moderne :

- claire,
- extensible,
- modulaire,
- compatible avec la logique EML,
- prête à évoluer vers de nouveaux profils, modules, ou services.

Le point le plus important pour le prochain développeur est de comprendre que la vraie logique métier est concentrée dans les handlers Electron, et que les vues front ne doivent faire que piloter l’interface et les événements utilisateur.

Si vous relancez le projet, commencez par :

1. lire `electron/const.ts`,
2. comprendre `electron/handlers/launcher.ts`,
3. vérifier le flux `auth → session → profiles → launch`,
4. puis travailler sur les vues et le design.

---

Projet : Katapulte Launcher
Mise en place : Electron + Vite + TypeScript + EML
