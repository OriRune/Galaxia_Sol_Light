# Galaxia

Galaxia is an interactive browser-based galaxy simulator. Create deterministic galaxies, assemble collision scenes, watch gravity-driven encounters, rewind recent simulation history, and save or export your work locally.

## Run locally

Requirements:

- Node.js 24.x
- npm 10 or newer
- A current Chromium-, Edge-, or Firefox-based browser with WebGL enabled

Install and start the development server:

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`.

To run the production build locally:

```powershell
npm run build
npm run preview
```

## First launch

Galaxia starts in **Single** mode with a predefined galaxy named **First Light**. The simulation is playing at 1× speed and gravity, Balanced performance is selected, trails are off, and automatic framing is on.

The screen is organized around:

- The top bar for modes, playback, global settings, capture, recording, help, and live status.
- The creation panel for galaxy or random-scenario settings.
- The central viewport for navigation and direct galaxy manipulation.
- The inspector and library tabs for selection, presets, scenes, captures, and recordings.
- The history strip when rewind snapshots are available.

## Operating modes

### Single

Single always contains exactly one galaxy. Editing its type, seed, star count, size, mass, spin, arms, black-hole setting, or name updates that galaxy. Loading a preset replaces it.

Use Single when you want to design or inspect one reproducible galaxy.

### Collision

Collision keeps the current scene and lets you add more galaxies. A new galaxy is placed at the world position in the center of the viewport and becomes selected.

Use Collision to prepare two- or multi-galaxy encounters quickly.

### Builder

Builder supports persistent multi-galaxy scenes. You can add, select, move, edit, give galaxies bulk velocity, delete them, and save reusable presets or complete scenes. Empty Builder scenes are supported.

### Random

Choose a category—single galaxy, collision, or cluster—and a scenario seed, then select **Generate scenario**. The same category, seed, and performance level reproduce the same initial scenario. Generation replaces the scene, enables automatic framing, and starts playback.

## Create and edit galaxies

The creation controls include:

- Type: Spiral, Barred Spiral, Elliptical, Irregular, or Dwarf.
- Seed: a whole number used for deterministic generation.
- Star count, size, mass, and spin.
- Arm count for galaxy types that use arms.
- Optional central black hole and name.

In Collision or Builder, select **Add galaxy** to add the draft to the current scene. Select a galaxy in the viewport or Selection tab to inspect it. Selected galaxies can be:

- Regenerated from edited generation settings.
- Moved by dragging their visible core or by editing Position X/Y.
- Given bulk velocity through Velocity X/Y or the velocity handle.
- Deleted in Collision or Builder.
- Saved as a preset.

Invalid or out-of-range input is rejected without changing the committed value. Press `Escape` while editing a numeric or name field to restore its last committed value.

## Playback and view controls

- **Play/Pause** toggles simulation playback.
- **Step** pauses and advances exactly one simulation step.
- **Speed** selects 0.25×, 0.5×, 1×, 2×, or 4× without changing the play/pause state.
- **Gravity** changes the global gravitational strength.
- **Performance** controls later defaults and Random generation budgets; it does not modify existing explicit star counts.
- **Trails** toggles star trails.
- **Auto-frame** follows the bounds of active galaxies.
- **Reset camera** restores the default center and zoom.

Use the mouse or trackpad wheel to zoom toward the pointer. Drag empty viewport space to pan. Manual pan or zoom turns automatic framing off.

The status line shows playback state, speed, gravity, performance level, galaxy and star counts, frame rate, and selection context.

## Keyboard shortcuts

When focus is not in an editable field or interactive control:

| Key      | Action                                 |
| -------- | -------------------------------------- |
| `Space`  | Play or pause                          |
| `.`      | Single-step                            |
| `F`      | Toggle automatic framing               |
| `Escape` | Close help, cancel a drag, or deselect |

Select **Help** in the application for a concise interaction summary.

## History and undo

Galaxia retains roughly 30 seconds of recent rewind history while playing.

- Move the history slider to inspect an earlier retained state.
- **Exit to present** returns without changing the current timeline.
- **Resume here** discards later rewind snapshots and continues from the selected point.

Editing, scene loading, mode replacement, recording, and other mutations are disabled while viewing history.

**Undo** restores the exact state before the latest undoable edit and pauses playback. Up to 20 actions are retained. Undo includes galaxy edits, moves, velocity changes, add/delete, preset application, scene loading, Random generation, and global-setting changes. There is no redo.

## Presets and scenes

Open the corresponding library tab to manage saved items.

### Presets

A preset stores one galaxy's generation settings and optional name. It does not store position, velocity, evolved particles, or the whole scene.

- **Save preset** stores the current draft or selected galaxy.
- **Load preset** replaces the galaxy in Single or adds a galaxy in Collision/Builder.
- Saved presets can be renamed, deleted, and exported.
- Use **Import preset** to load a compatible exported preset file.

### Scenes

A scene stores all galaxy configurations, names, positions, and bulk velocities, plus gravity, selected playback speed, performance level, and trails.

- **Save scene** stores the current setup.
- Loading opens the scene in Builder, paused, with automatic framing enabled.
- Saved scenes can be renamed, deleted, and exported.
- Use **Import scene** to load a compatible exported scene file.

Scene files reproduce a setup from stored seeds; they are not exact mid-simulation particle snapshots.

## Screenshots and recordings

### Screenshot

Select **Screenshot** to capture the simulation artwork without panels, status overlays, selection rings, velocity handles, or help. Open **Captures** to preview, rename, delete, or download saved images.

### Recording

Choose a duration from 10 to 120 seconds and select **Record**. Galaxia performs a storage preflight, records artwork at 30 nominal frame slots per second, and reports captured and missed frames. Slow frames are skipped instead of blocking the simulation.

Select **Stop recording** to finalize early, or let the effective duration expire. Open **Recordings** to:

- Inspect metadata and individual captured frames.
- Move to previous or next frames.
- Rename or delete a recording.
- Export one or more ZIP parts containing ordered images and timing metadata.

Recordings can consume significant browser storage. The displayed quota or durability warning explains when storage estimates are unavailable or capacity is limited.

## Local data and privacy

Presets, scenes, captures, recording metadata, and recording frames are stored in browser IndexedDB for the current site origin. No application server or account is required.

Browser storage is origin-specific. Clearing site data removes the local library, and opening the application under a different hostname or port creates a separate library. Export important presets, scenes, captures, and recordings before clearing browser data.

## Verify the project

Run the complete static, unit, browser, build, and Chromium/Firefox acceptance gate:

```powershell
npm run verify
```

Additional release checks include:

```powershell
npm run e2e:edge
npm run verify:dist-hosting
npm run e2e:hosted:local
```

## Deploy to Vercel

The repository includes `vercel.json` and deployment scripts. After authenticating and choosing the intended Vercel team and project:

```powershell
npx vercel link
npm run vercel:build
npm run deploy:preview
```

Set `PLAYWRIGHT_BASE_URL` to the returned HTTPS preview URL and run `npm run e2e:hosted`. Only after the hosted suite passes, deploy production:

```powershell
npm run deploy:production
```

See `docs/handoffs/10.2-preview-deployment.md` and `docs/handoffs/10.3-production-promotion.md` for the release checklist and required evidence.
