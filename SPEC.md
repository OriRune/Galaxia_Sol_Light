# Galaxia Functional Specification

## 1. Product summary

Galaxia is an interactive 2D galaxy sandbox for creating galaxies and watching them rotate, move, interact, collide, and merge. It is intended for relaxing, open-ended visual exploration rather than scientifically accurate astronomy.

The experience makes it easy to:

- Create a visually distinct galaxy from understandable parameters.
- Arrange and run scenes containing one or more galaxies.
- Generate repeatable random scenes.
- Observe visually compelling motion, close encounters, tidal disruption, and mergers.
- Save favorite configurations and export resulting imagery.

## 2. Normative language and measurement model

In this specification, the keywords apply irrespective of capitalization:

- **Must** identifies a requirement needed for conformance.
- **Should** identifies a recommended behavior that may be omitted only for a documented product reason.
- **May** identifies optional behavior.

Acceptance scenarios test only **must** requirements. Descriptive goals such as "relaxing" or "visually compelling" explain product intent and are not pass/fail criteria by themselves.

Galaxia uses stylized, dimensionless simulation units:

- **Distance unit (DU)** measures size and position.
- **Mass unit (MU)** measures configured galaxy mass.
- **Velocity unit (VU)** measures bulk and stellar velocity.
- One base simulation step advances **1/60 simulation-time unit**. At 1x playback, 60 base steps advance per real-time second; the other playback speeds scale that rate proportionally.

The interface does not have to expose these unit abbreviations, but values saved, loaded, and used in acceptance tests must map consistently to them. `Size` means a galaxy's generation radius in DU. A galaxy's **core radius** is `max(2 DU, 0.10 * size)`.

## 3. Scope

### In scope

- Procedural creation of spiral, barred spiral, elliptical, irregular, and dwarf galaxies.
- Real-time simulation of galaxy and star motion.
- Single-galaxy, collision, scene-building, and random-scenario workflows.
- Playback, camera, selection, editing, history, persistence, and capture controls.
- Reproducible galaxy and scenario generation from seeds.
- Live feedback about the current simulation.

### Out of scope

- Scientific prediction or research-grade physical accuracy.
- Star-by-star editing or multi-galaxy selection/editing.
- Modeling individual stellar evolution, gas, planets, or cosmology.
- Saving an exact mid-simulation state as a portable scene file.
- Producing a finished encoded video directly.
- Redo after undo.
- Guaranteed bit-for-bit generation compatibility between different application versions unless a later compatibility policy explicitly provides it.

## 4. Core concepts and supported ranges

### 4.1 Galaxy

A galaxy is a generated collection of stars with a shared center. Its **particle-generation configuration** contains:

- Type.
- Generation seed.
- Effective star count.
- Size.
- Mass.
- Signed spin strength and direction.
- Spiral arm count where applicable.
- Central-black-hole state.
- Visual variation derived deterministically from the listed values and seed.

A galaxy also has optional name metadata and scene placement containing its position and bulk velocity. The initial star positions, star velocities, and visual variation must be identical for the same complete particle-generation configuration in separate sessions and on separate machines running the same application version. Name and placement changes must not alter generated stars. Evolved simulation state is not covered by this reproducibility guarantee.

### 4.2 Scene

A scene contains zero to twelve galaxies plus global simulation settings. The total configured star count across a scene must not exceed 120,000, and total configured mass must not exceed 1,200 MU. Galaxies may be positioned and given velocities independently.

### 4.3 Draft galaxy

The draft galaxy is the configuration being prepared by the user. In Single mode it is linked to the sole visible galaxy. In Collision and Builder modes it is independent: changing the draft does not change a placed galaxy unless the user explicitly applies the draft to that selected galaxy.

### 4.4 Closed value ranges

| Value | Allowed values | Default |
| --- | --- | --- |
| Galaxy type | Spiral, barred spiral, elliptical, irregular, dwarf | Spiral |
| Seed | Whole number from 0 through 4,294,967,295 | 1 |
| Star count | Whole number from 500 through 120,000, subject to the scene total | Selected performance-level default |
| Size | 10 through 100 DU | 40 DU |
| Mass | 1 through 1,200 MU, subject to the scene total | 25 MU |
| Spin | -2.0 through +2.0; sign gives direction and 0 means no configured rotation | +1.0 |
| Arm count | Whole number from 1 through 8 for spiral and barred spiral; not applicable to other types | 2 |
| Central black hole | On or off | Off |
| Position | -10,000 through +10,000 DU on each axis | (0, 0) |
| Bulk speed | 0 through 20 VU in any direction | 0 VU |
| Gravity strength | 0.25x through 4.0x | 1.0x |
| Playback speed | 0.25x, 0.5x, 1x, 2x, or 4x | 1x |
| Name | 1 through 80 Unicode characters after trimming; optional | No name |

An in-range value is supported. The application must not silently reinterpret an out-of-range value as in-range.

## 5. Startup behavior

On first opening the application in a session:

- The active mode is Single.
- The performance level is Balanced, gravity is 1x, playback speed is 1x, trails are off, and the simulation is playing.
- One predefined galaxy named **First Light** is present at position `(0, 0)` with zero bulk velocity.
- First Light uses the defaults in section 4.4: Spiral, seed 1, 30,000 stars, size 40, mass 25, spin +1, two arms, and no central black hole.
- Automatic framing is enabled and frames the galaxy.
- Primary creation and playback controls are available without opening a saved item.

This startup state must reproduce the same initial arrangement wherever the same application version runs.

## 6. Operating modes

### 6.1 Single mode

- The scene contains exactly one galaxy linked to the draft configuration.
- Changing a draft parameter regenerates that galaxy immediately.
- Applying a preset replaces the current galaxy.
- Delete is unavailable, so the one-galaxy invariant cannot be broken.
- Regeneration follows the camera precedence rules in section 10; it does not by itself override a user's manual camera choice.

### 6.2 Collision mode

- The user can configure and add galaxies to a persistent scene.
- Adding a galaxy must not remove existing galaxies.
- A newly added galaxy is placed at the world point corresponding to the center of the current simulation viewport and becomes the sole selection. Overlap is permitted so that an encounter can be prepared immediately.
- Presets can be used as sources for additional galaxies.

### 6.3 Builder mode

- The user can assemble and edit a persistent multi-galaxy scene.
- Builder supports the same add, select, position, velocity, and deletion operations used to prepare encounters.
- The current draft or selected galaxy can be saved as a reusable preset.
- Loading a saved scene opens it as an editable Builder scene.

### 6.4 Random mode

- The user can generate a single galaxy, a two-galaxy collision, or a small cluster containing three through five galaxies inclusive.
- Category, scenario seed, and performance level together determine the complete initial scenario, including cluster galaxy count and each galaxy's explicit star count.
- Generating replaces the current scene, clears selection, enables automatic framing, and starts playback.
- The user can reroll the current category with a new seed or enter a seed to reproduce a scenario.
- Random generation must keep its total star count at or below the selected performance level's automatic-generation budget.

### 6.5 Mode transitions

- Switching between Collision and Builder preserves the scene, draft, and selection.
- Entering Collision or Builder from Single preserves the sole galaxy as a placed galaxy and initializes the draft from its configuration.
- Entering Random preserves the scene, draft, and selection until the user generates a scenario. Leaving Random for Collision or Builder preserves the current scene.
- Entering Single is scene-replacing when the current scene is not already a one-galaxy Single scene. It retains the selected galaxy's configuration; if nothing is selected, it uses the first galaxy in scene order; if the scene is empty, it uses the draft. It places the retained galaxy at `(0, 0)` with zero bulk velocity and selects it. This replacement is undoable and enables automatic framing.
- Loading a scene replaces the current scene and enters Builder. Loading and any mode transition that replaces a scene are undoable.

### 6.6 Empty scenes

Collision and Builder may contain no galaxies. In an empty scene:

- Galaxy and star counts display zero and selection is empty.
- Playback and single-step remain available and have no visible simulation effect.
- Automatic framing uses the default center `(0, 0)` and default zoom.
- Draft, preset, add, load, undo, and camera controls remain available.

## 7. Galaxy creation, editing, and selection

### 7.1 Draft configuration and star budgets

Through the draft, the user can set every particle-generation value and the optional name listed in section 4.4. Position and bulk velocity are set through scene editing, and the global values are set through section 9's controls. The user can request a new random seed; the resulting displayed seed must be usable to recreate the same initial galaxy.

Performance levels define defaults and automatic-generation budgets:

| Performance level | Default new-galaxy star count | Random-scene total budget |
| --- | ---: | ---: |
| Low | 10,000 | 10,000 |
| Balanced | 30,000 | 30,000 |
| High | 60,000 | 60,000 |

The performance level does not form part of a particle-generation configuration and must not change an already explicit star count. A user may explicitly choose a higher count up to the 120,000 scene maximum; the interface must warn when the resulting scene exceeds the selected level's budget. If adding or enlarging a galaxy would exceed 120,000 stars, 1,200 MU, or twelve galaxies, the action must be rejected without altering the scene, and the reason must be shown.

Changing performance level affects only later default values and random generation. It must not regenerate, clamp, or otherwise modify existing galaxies.

### 7.2 Selection

- At most one galaxy is selected at a time; multi-selection is out of scope.
- Selecting a visible galaxy chooses the galaxy whose projected core center is nearest to the input point among galaxies whose rendered footprint contains that point.
- An exact distance tie selects the most recently added of the tied galaxies.
- The application visually identifies the selected galaxy and exposes its editable properties and scene actions.
- Selecting empty space or explicitly dismissing the selection deselects it.

### 7.3 Selected-galaxy editing

The user can change a selected galaxy's type, seed, star count, size, mass, spin, arm count where applicable, central-black-hole state, and name. Committing any particle-generation value regenerates only that galaxy and keeps its center, bulk velocity, and name. Changing only the name does not regenerate it. The interface must make clear that regeneration resets that galaxy's evolved star positions.

The user can also:

- Move the galaxy's center directly within the scene.
- Set its bulk velocity by indicating a direction and magnitude from its center.
- Delete it in Collision or Builder.
- Save it as a reusable preset where that operation is available.

The view must distinguish galaxy centers, the current selection, and non-zero bulk velocity. All parameter names use **size**; `overall scale` is not a separate property.

## 8. Simulation behavior

### 8.1 Motion and stability

- When playing, stars and galaxy centers move continuously according to scene gravity and configured velocities.
- Stars may overlap and pass through one another without collision or contact effects.
- At gravity 1x and speed 1x, two default-mass, default-size galaxies initially separated by 160 DU with zero bulk velocity must have a core separation after 30 simulation-time units that is at least 1% smaller than their initial separation.
- In the interaction fixture defined in Acceptance Scenario 5, within the first 60 simulation-time units the core-to-core direction must rotate by at least 15 degrees and at least one galaxy's radius containing 90% of its stars must grow by at least 10%. This provides objective evidence of orbital motion and tidal distortion.
- For a lone First Light galaxy at gravity 1x and speed 1x, sampled once per simulation-time unit for 300 units, the radius containing 90% of its stars must remain between 75% and 125% of its initial value, and at least 95% of its stars must remain within twice the initial 90%-radius.
- If the simulation cannot produce a valid next state, it must pause, preserve the last valid visible state, and show a non-blocking error. Freezing, presenting invalid coordinates as normal output, or losing controls is not acceptable.

### 8.2 Central black hole

Enabling a central black hole must:

- Show a visually distinct central object and make peak rendered luminance inside the core at least 20% higher than in the otherwise-identical black-hole-off galaxy.
- Keep the configured total galaxy mass unchanged but concentrate 10% of it inside the core radius.
- Leave the initial star positions for the same non-black-hole configuration and seed unchanged.
- Ensure at least ten generated stars lie inside the core radius for every allowed star count, so the inner-speed effect is measurable.
- Increase the mean initial orbital speed of stars inside the core radius by at least 5% compared with the same configuration and seed with the option off.

Disabling the option reverses these effects on the next regeneration.

### 8.3 Deterministic merger

Two cores must merge on the next completed simulation step when both conditions are true at the start of that step:

1. Core-center separation is no greater than the sum of their core radii.
2. Relative core speed is no greater than 1 VU.

The merger produces one remnant with these properties:

- Galaxy count changes from two to one on the next visible status update.
- Mass is the exact sum of the input masses.
- Center and bulk velocity are mass-weighted averages of the inputs.
- Momentum error magnitude is no greater than `max(1% * (|p1| + |p2|), 0.01 MU*VU)`.
- Type is elliptical; arm count is not applicable.
- Size is `min(100 DU, sqrt(size1^2 + size2^2))`.
- Spin is the mass-weighted average of the input spins, clamped to the allowed range.
- The central black hole is on if it was on for either input.
- The live star set is the union of the two input star sets; total star count does not increase.
- The remnant seed and optional name are derived deterministically from the two inputs and remain within the ranges in section 4.4, so saving and regenerating the remnant configuration is repeatable.
- If either input was selected, the remnant becomes selected; otherwise selection remains empty.
- Peak rendered luminance inside the remnant core rises to at least 125% of the brighter input core's value immediately before merger. This interaction brightening begins on merger and remains above that threshold for at least one real-time second of active 1x playback. Pausing freezes this effect timer.

Encounters that do not meet both trigger conditions must not use this automatic core merger, though they may still produce attraction and tidal distortion. A non-merging close encounter occurs while core separation is no greater than twice the sum of the core radii; during that interval, peak rendered luminance inside at least one core must be at least 115% of its value immediately before entering the interval and must remain elevated for at least 0.5 real-time second of active 1x playback after the cores leave the interval.

## 9. Playback and global controls

Playback has two independent values: a playing/paused state and a non-zero playback-speed selection.

- Play and pause toggle only the playing state. Pausing remembers the selected speed; resuming uses that speed.
- Playback speed can be set to 0.25x, 0.5x, 1x, 2x, or 4x and does not itself pause or resume.
- Single-step first pauses if necessary, advances exactly one base step, records that moment in rewind history, and remains paused. The selected playback speed is unchanged.
- Gravity can be changed within the range in section 4.4.
- Regenerate recreates every galaxy from its stored configuration and stored seed; it never rerolls a seed.
- The user can select Low, Balanced, or High performance level and enable or disable star trails.

Current speed, playing/paused state, gravity, performance level, galaxy count, and star count must be visible.

## 10. Camera and view navigation

- The user can pan, zoom toward a chosen point, reset to the default center and zoom, and enable automatic framing.
- While automatic framing is enabled, the camera follows the bounds of all active galaxies; an empty scene uses the default view.
- Manual pan or zoom disables automatic framing.
- Automatic framing is enabled by startup, Random generation, successful scene load, applying a preset in Single mode, and any mode transition that replaces the scene. These are the only actions that enable it without the user explicitly doing so.
- In-place parameter edits, regeneration, adding a galaxy, applying a preset in a multi-galaxy mode, undo, and rewind do not enable it.
- Zooming toward a point must keep the same world point under the input location within one screen pixel after the zoom.
- After any pan or zoom, selecting and dragging must use the same screen-to-world mapping: a dragged center must track the input point within one screen pixel, excluding an explicitly rendered pointer offset.

## 11. History, undo, and recovery

### 11.1 Rewind and scrub

- While playing, the application captures exact simulation snapshots at 10 snapshots per real-time second and retains the latest 300 snapshots, giving 30 seconds of rewind reach after the buffer fills.
- A completed single-step adds one snapshot even while paused.
- The user can move backward and forward through retained snapshots. Entering history pauses playback.
- Resuming from an earlier snapshot discards every later rewind snapshot and continues from the chosen state.
- The application indicates history mode and the current position in the retained range.
- Selection and camera navigation remain available in history mode. Galaxy edits, add/delete, global-setting edits, preset application, mode changes, scene loading, undo, and recording are unavailable until the user resumes from or exits the selected snapshot.
- Merely entering, moving within, or exiting history does not change the undo stack.

### 11.2 Undo

The application retains the latest 20 committed undoable actions. The closed set of undoable actions is:

- Add or delete a galaxy.
- Commit a galaxy particle-generation or name change; a name-only change does not regenerate the galaxy.
- Complete a galaxy move or bulk-velocity edit.
- Apply a preset.
- Generate or reroll a Random scenario.
- Enter Single when that transition replaces the scene.
- Load a scene.
- Change gravity, playback speed, performance level, or star-trail state.

Before each action, undo captures the exact live simulation state, including star positions and velocities, galaxy configurations and names, the draft, gravity, selected playback speed, performance level, star-trail state, selection, and mode. Undo pauses playback, restores that snapshot, clears rewind history, and starts a new rewind timeline from the restored moment.

Selection changes, camera changes, play/pause, single-step, history navigation, help, screenshot capture, recording, save operations, and mode changes that preserve the scene are not undoable. Undo with an empty stack has no effect. There is no redo operation.

## 12. Presets

- The application includes presets representing every galaxy type.
- A preset stores one galaxy's particle-generation configuration and optional name, not its scene position, bulk velocity, live evolved particles, whole scene, or history.
- The user can save a draft or selected galaxy as a user preset in modes that expose that action.
- Saved presets are discoverable in later sessions.
- Loading a preset reproduces its particle-generation configuration and optional name.
- In Single mode, loading a preset replaces the current galaxy and enables automatic framing.
- In Collision or Builder, loading a preset adds a galaxy without clearing the scene and is subject to every scene limit in section 4.2.

## 13. Scene persistence

- The user can save, discover, and load scenes.
- A saved scene contains every galaxy's particle-generation configuration, optional name, position, and bulk velocity, plus exactly these global settings: gravity, selected playback speed, performance level, and star-trail state.
- Playing/paused state, camera position, zoom, automatic-framing state, selection, rewind history, undo history, and recording state are session state and are not saved.
- Saving does not alter the scene or its live state.
- Loading validates the complete saved item before changing anything. Malformed, truncated, unknown-version, out-of-range, or over-budget data must be rejected atomically; the current scene remains unchanged and the user receives a reason.
- Successful loading replaces the current scene, enters Builder, starts paused, clears selection, and enables automatic framing.
- Loading regenerates stars from each saved configuration and seed. A saved scene is a replayable setup, not an exact capture of a mid-simulation particle state.
- A save/load round trip in the same application version must preserve the exact documented scene information.

## 14. Capture and recording

### 14.1 Screenshot

- The user can capture the current simulation viewport as a retrievable image.
- The image contains the simulation artwork without editing panels, status overlays, selection markers, velocity handles, or help.
- The capture receives a unique default name, becomes discoverable from the application, and produces brief confirmation.

### 14.2 Recording

- The user can start and stop recording during a session, except while viewing rewind history.
- A recording has a hard maximum duration of 120 seconds (3,600 nominal frame slots). Before recording starts, the application may reduce that maximum when its storage preflight estimates that the full recording cannot be retained safely. The effective limit must be shown before recording starts and remain visible while recording is active.
- Reaching the effective duration limit stops and finalizes the recording cleanly with the same discoverability, confirmation, and final counts as an explicit user stop. If the storage estimate is unavailable, the 120-second maximum still applies and the application must show a durability/quota warning.
- Recording samples the simulation viewport at a fixed cadence of 30 frame slots per real-time second.
- Each successful sample captures the artwork without editing panels, status overlays, selection markers, velocity handles, or help.
- If a frame slot cannot be captured in time, the application skips that slot rather than blocking simulation and records it as missed.
- The application visibly indicates active recording and shows elapsed time plus captured- and missed-frame counts.
- Stopping creates one discoverable recording item containing an ordered, retrievable set of captured viewport images and timing metadata sufficient to preserve the wall-clock duration when assembled externally.
- The user can export the ordered images and timing metadata. Their internal storage representation is not prescribed.
- Stopping provides brief confirmation and final captured/missed counts. Direct encoded-video output remains out of scope.

## 15. Status and guidance

The application provides unobtrusive live status for:

- Measured render frame rate.
- Star and galaxy counts.
- Playback speed and playing/paused state.
- Gravity and performance level.
- Current selection context.
- Rewind/scrub state.
- Recording state and progress.
- Temporary confirmations and non-blocking errors.

A concise interaction-help summary is available and can be shown or hidden.

## 16. Input and validation

- Seed inputs accept only whole numbers in the range in section 4.4. Invalid seed text must not alter the galaxy or scenario.
- Typed numeric values outside their allowed ranges must be rejected without changing the active value; direct controls must prevent out-of-range choices.
- A user-provided preset, scene, capture, or recording name must remain associated with the saved item. If an export target cannot store the name verbatim, the exported identifier must be transformed into a valid unique name, the transformed name must be shown, and the item must remain findable. Reserved characters and duplicate names must not cause silent overwrite or data loss.
- Loading invalid data follows the atomic rejection behavior in section 13.
- If an action has no valid target, such as delete with no selection or undo with no history, the application remains stable and leaves the scene unchanged.

## 17. Performance and reliability

### 17.1 Reference performance target

Performance acceptance uses the Galaxia development computer as the reference device: a Snapdragon X 12-core X1E80100 processor, Qualcomm Adreno X1-85 integrated graphics, and 16 GiB RAM, running Windows Home 25H2. Benchmarks use a fixed 1920x1080 viewport with no unrelated foreground workload. Each result records the exact OS build, browser version, and graphics-driver version.

The release-gating performance matrix is the current stable Microsoft Edge and current stable Firefox on that Windows reference device. Functional conformance remains required on Windows Chromium, Windows Firefox, Windows Edge, Linux Chromium, and Linux Firefox; combinations outside the two release-gating runs are not normative performance qualifications for the first release.

For each fixture below, after a five-second warm-up and during a 60-second run at gravity 1x, speed 1x, automatic framing on, and trails on, the application must average at least 30 rendered frames per second, present 95% of frames within 50 ms of the preceding frame, and show a visible response to 95% of play/pause, pan, zoom, and selection inputs within 100 ms:

| Level | Fixture |
| --- | --- |
| Low | First Light with its star count changed to 10,000 |
| Balanced | Acceptance Scenario 5 with each galaxy's star count changed to 15,000 |
| High | Spiral, barred spiral, elliptical, irregular, and dwarf galaxies with seeds 1-5 respectively, 12,000 stars, default size/mass/spin, no black hole, equally spaced on a 200 DU radius around the origin, and tangential bulk speed 2 VU |

Explicit user configurations above the selected level's automatic budget remain functionally valid up to the 120,000-star scene limit, but the reference performance target applies only through the selected level's stated budget.

### 17.2 Reliability and reproducibility

- All in-range configurations, every galaxy type, and all three Random categories must generate valid star data and usable initial positions.
- The same complete particle-generation configuration must reproduce the same initial result under the version scope in section 4.1.
- The same Random category, scenario seed, and performance level must reproduce the same initial scene under that version scope.
- Regeneration must reuse stored seeds.
- Preset and scene save/load round trips must preserve their closed sets of documented data.
- Camera mapping must satisfy the one-pixel spatial-consistency criteria in section 10.
- A calculation failure must follow section 8.1's pause-and-preserve behavior.

## 18. Acceptance scenarios

1. **Verify startup:** Launch a new session and confirm Single mode, the exact First Light configuration, playing state, defaults, automatic framing, and reproducible initial arrangement.
2. **Create a galaxy:** In Single, manually pan, then change type, size, mass, and seed. Confirm exactly one regenerated galaxy, unchanged manual camera state, and visible effective values.
3. **Exercise mode transitions:** Move Single -> Collision -> Builder and confirm preservation; enter Random without generating and confirm no replacement; enter Single from a multi-galaxy scene and confirm the selected-galaxy retention rule, undoability, and automatic framing.
4. **Build an encounter:** In Collision, add two galaxies. Confirm each appears at viewport center without removing earlier galaxies, then position them, set velocities, and play.
5. **Observe attraction, orbit, tides, and a close flyby:** Use two 5,000-star default spirals with seeds 1 and 2 at `(-80, 0)` and `(80, 0)`, velocities `(0, +2)` and `(0, -2)`, gravity 1x, and speed 1x. Within 60 simulation-time units, confirm separation decreases below its initial value, the core-to-core direction rotates at least 15 degrees, neither core merges under the speed rule, and at least one galaxy's 90%-star radius grows by 10%. Then place two default-size galaxies at `(-9, 0)` and `(9, 0)` with velocities `(+3, 0)` and `(-3, 0)` and confirm a non-merging close encounter produces the specified 15% brightening and 0.5-second afterglow.
6. **Trigger a merger:** Use two default-size galaxies at `(-3, 0)` and `(3, 0)` with zero bulk velocity. Advance one step, then resume at 1x. Confirm the deterministic trigger, count change 2->1, remnant identity rules, mass and momentum tolerances, inherited selection, and the specified 25% brightening for at least one second of active playback.
7. **Toggle a black hole:** Regenerate the same seeded galaxy with the option off and on. Confirm unchanged initial star positions, the distinct central object, at least 20% higher peak core luminance, unchanged total mass, and at least 5% higher mean inner orbital speed when on.
8. **Reproduce a galaxy:** Save a galaxy as a preset, then recreate it in another session of the same version. Confirm identical initial star positions, velocities, and visual variation.
9. **Reproduce Random scenarios:** For each category, generate twice with the same seed and performance level and confirm an identical initial scene; change only performance level and confirm that any changed explicit star allocation is deterministic.
10. **Save and load a scene:** Save a multi-galaxy scene with non-default gravity, speed, performance level, and trails. Change both persisted and session-only values, load, and confirm that only the closed persisted set returns, the scene opens paused in Builder, and stars regenerate from stored seeds.
11. **Reject invalid load:** Attempt malformed, unknown-version, out-of-range, and over-budget loads. Confirm atomic rejection, unchanged current scene, and a reason for each failure.
12. **Rewind and resume:** Run for at least 30 seconds, scrub backward, confirm edits and recording are unavailable, then resume. Confirm the future branch is discarded and the undo stack was not changed by scrubbing.
13. **Undo edits:** Perform more than one action from the closed undo list, undo them, and confirm exact prior live states. Confirm a new timeline begins, non-undoable actions do not consume depth, only the latest 20 actions remain, and redo is unavailable.
14. **Exercise the empty state:** Delete every galaxy in Builder. Confirm zero counts, default auto-frame target, no-op playback/step, available creation controls, and unavailable deletion in Single.
15. **Capture output:** Save a screenshot and record for ten seconds. Confirm clean artwork, discoverability, 300 nominal frame slots, accurate captured/missed counts, timing metadata, and exportable ordered images.
16. **Navigate the view:** Pan, zoom toward a chosen point, select, and drag. Confirm the one-pixel mapping tolerances; reset and explicitly enable automatic framing.
17. **Validate limits and performance:** Exercise all boundary values, galaxy/star/mass scene limits, invalid seed text, duplicate/reserved names, and the three reference performance fixtures. Confirm rejection is non-destructive and each fixture meets its thresholds.

## 19. Design freedom

This specification defines product behavior, outputs, and acceptance thresholds, not internal implementation or visual layout. Programming language, frameworks, persistence internals, physics technique, rendering technique, component architecture, colors, typography, control placement, and internal data structures may change as long as every observable requirement above continues to hold.

In-session exact rewind/undo state and portable scene persistence operate at different layers and are intentionally not interchangeable. Requiring exported images, ordered recording frames, or measured frame-rate status defines user-visible behavior; it does not prescribe how those artifacts or measurements are represented internally.
