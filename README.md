# quick-insight-notes

A lightweight notes/insights project extracted from Ubuntu and prepared for development on Windows. This repo includes a basic ESLint setup and adds Prettier configuration and common npm scripts.

## Prerequisites

- Node.js 18+ and npm
- Git

## Install

```sh
npm install
```

## Browser Extension (Load Unpacked)

- Chrome/Edge: open `chrome://extensions` or `edge://extensions`
- Enable Developer mode
- Click "Load unpacked" (or "加载未打包的扩展程序") and select:
  - `D:\Program File\Cusor_projects\quick-insight-notes\extension`
- Update after code changes: click "Reload" on the extension card (or toggle off/on)

Notes:
- Shortcut `Alt+N` toggles the panel on regular pages
- Restricted pages like `chrome://*` cannot be scripted; use a normal http/https tab
- To allow local file pages, enable "Allow access to file URLs" in the extension details

## Packaged ZIP

- Latest zip artifacts are generated under `artifacts/`, e.g. `quick-insight-notes-extension-YYYYMMDD-HHmmss.zip`
- Use for store submission or distribution (not for "Load unpacked")

## Scripts

- `npm run lint` - Lint the project with ESLint
- `npm run lint:fix` - Lint and auto-fix
- `npm run format` - Format with Prettier

## Recommended Workflow

1. Make changes under `extension/` (or relevant source dirs)
2. Lint and format before committing:
   ```sh
   npm run lint
   npm run format
   ```
3. Commit and push:
   ```sh
   git add -A
   git commit -m "feat: <your change summary>"
   git push origin main
   ```

## Notes

- `node_modules/` and other transient artifacts are ignored via `.gitignore`.
- If you see Prettier not found, install dev deps:
  ```sh
  npm install --save-dev prettier
  ```
- If this is a browser/extension project, packaging/manifest steps may live under `extension/`.

## Updating the Extension

- After local changes, reload the extension in `chrome://extensions`
- For a new ZIP, run packaging or ask the assistant to regenerate `artifacts/*.zip`
