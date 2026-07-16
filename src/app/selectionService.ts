import type { SceneDeltaEvent } from "../simulation/protocol";
export function arbitrateSelection(
  current: string | null,
  delta: SceneDeltaEvent,
  liveIds: ReadonlySet<string>,
): string | null {
  if (current === null) return null;
  for (const mapping of delta.mergerMappings)
    if (mapping.inputIds.includes(current))
      return liveIds.has(mapping.remnantId) ? mapping.remnantId : null;
  return liveIds.has(current) ? current : null;
}
export type ShortcutAction =
  | "toggle-playback"
  | "single-step"
  | "toggle-framing"
  | "close-dialog"
  | "cancel-drag"
  | "deselect"
  | null;
export interface ShortcutContext {
  dialogOpen: boolean;
  dragActive: boolean;
  selected: boolean;
}
function matches(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}
export function keyboardShortcut(
  event: Pick<KeyboardEvent, "key" | "target">,
  context: ShortcutContext,
): ShortcutAction {
  if (
    matches(event.target, 'input,select,textarea,[contenteditable]:not([contenteditable="false"])')
  )
    return null;
  if (event.key === " ")
    return matches(event.target, 'button,[role="button"],a[href]') ? null : "toggle-playback";
  if (event.key === ".") return "single-step";
  if (event.key.toLowerCase() === "f") return "toggle-framing";
  if (event.key === "Escape")
    return context.dialogOpen
      ? "close-dialog"
      : context.dragActive
        ? "cancel-drag"
        : context.selected
          ? "deselect"
          : null;
  return null;
}
export class DialogFocusManager {
  private opener: HTMLElement | null = null;
  open(dialog: HTMLElement, opener: HTMLElement): void {
    this.opener = opener;
    const first = dialog.querySelector<HTMLElement>(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  }
  handleTab(dialog: HTMLElement, shift: boolean): void {
    const items = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
      ),
    ].filter((item) => !item.hasAttribute("disabled"));
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement),
      next = shift
        ? index <= 0
          ? items.length - 1
          : index - 1
        : index < 0 || index === items.length - 1
          ? 0
          : index + 1;
    items[next]?.focus();
  }
  close(): void {
    this.opener?.focus();
    this.opener = null;
  }
}
