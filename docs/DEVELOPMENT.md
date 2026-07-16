# Galaxia development

## Prerequisites

- Node.js 24 LTS and npm 10 or newer
- Git
- Current Microsoft Edge and Firefox on Windows
- Current Firefox and Playwright's requested system libraries on Linux

## Setup and daily commands

The commands are identical in Windows PowerShell, Windows Command Prompt, and a Linux terminal:

```text
npm ci
npx playwright install chromium firefox
npm run dev
npm run typecheck
npm run build
```

On Linux only, install missing browser system libraries when Playwright requests them:

```text
npx playwright install-deps chromium firefox
```

The normal development address is `http://127.0.0.1:5173`. Both `127.0.0.1` and `localhost` are treated as trustworthy local-development contexts by browsers. Opening the LAN server from another device may require an HTTPS tunnel before secure-context browser APIs are available. Galaxia intentionally provides no operating-system-specific certificate-generation script.

Use `npm run dev:lan` only when testing from another device. Production remains a static client-only Vite build.
