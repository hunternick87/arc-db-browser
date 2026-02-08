# arc-db-browser

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Auto-updates (GitHub Releases)

This app uses `electron-updater` and publishes update artifacts to GitHub Releases.

### Configure publish target

Set these environment variables when running `electron-builder`:

- `GH_OWNER` (e.g. `user`)
- `GH_REPO` (e.g. `arc-db-browser`)
- `GH_TOKEN` (a GitHub token with `repo` scope for private repos, or `public_repo` for public repos)

The config is in [electron-builder.yml](electron-builder.yml).

### GitHub Actions (recommended)

This repo includes a workflow that builds installers when you publish a GitHub Release:

- Workflow: [.github/workflows/release.yml](.github/workflows/release.yml)
- Trigger: GitHub Release **published**
- Output: artifacts + `latest*.yml` uploaded to that Release (used by `electron-updater`)

Notes:

- The workflow expects the release tag to match `package.json` version (e.g. tag `v1.1.0` with version `1.1.0`).
- Linux builds `AppImage` + `deb` (snap is intentionally skipped in CI to avoid snapcraft setup).
- macOS builds an unsigned `dmg` by default; for a smooth macOS install experience you’ll want code signing/notarization later.

### Release

```bash
# Build + publish a Windows installer and update metadata
GH_OWNER=... GH_REPO=... GH_TOKEN=... npm run build:win
```

### Frontend

Open **Updates** from the sidebar footer to check/download/install updates.
