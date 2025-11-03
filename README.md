# quick-insight-notes

A lightweight notes/insights project extracted from Ubuntu and prepared for development on Windows. This repo includes a basic ESLint setup and adds Prettier configuration and common npm scripts.

## Prerequisites

- Node.js 18+ and npm
- Git

## Install

```sh
npm install
```

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

