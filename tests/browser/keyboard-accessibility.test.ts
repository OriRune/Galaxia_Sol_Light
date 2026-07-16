import { describe, expect, it } from "vitest";
import { DialogFocusManager, keyboardShortcut } from "../../src/app/selectionService";
const context = { dialogOpen: false, dragActive: false, selected: true };
describe("keyboard and dialog accessibility", () => {
  it("ignores shortcuts in fields, native/custom buttons, and links", () => {
    for (const element of [
      document.createElement("input"),
      document.createElement("select"),
      document.createElement("textarea"),
      document.createElement("button"),
      Object.assign(document.createElement("div"), { role: "button" }),
      Object.assign(document.createElement("a"), { href: "#" }),
    ]) {
      document.body.append(element);
      if (element instanceof HTMLDivElement) element.setAttribute("role", "button");
      expect(keyboardShortcut({ key: " ", target: element }, context)).toBeNull();
      element.remove();
    }
  });
  it("maps global shortcuts and Escape priority", () => {
    expect(keyboardShortcut({ key: " ", target: document.body }, context)).toBe("toggle-playback");
    expect(keyboardShortcut({ key: ".", target: document.body }, context)).toBe("single-step");
    expect(keyboardShortcut({ key: "f", target: document.body }, context)).toBe("toggle-framing");
    expect(
      keyboardShortcut(
        { key: "Escape", target: document.body },
        { dialogOpen: true, dragActive: true, selected: true },
      ),
    ).toBe("close-dialog");
  });
  it("traps dialog focus and returns it to the labelled opener", () => {
    const opener = document.createElement("button");
    opener.setAttribute("aria-label", "Help");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Interaction help");
    const first = document.createElement("button"),
      last = document.createElement("button");
    first.textContent = "First";
    last.textContent = "Last";
    dialog.append(first, last);
    document.body.append(opener, dialog);
    opener.focus();
    const manager = new DialogFocusManager();
    manager.open(dialog, opener);
    expect(document.activeElement).toBe(first);
    manager.handleTab(dialog, true);
    expect(document.activeElement).toBe(last);
    manager.close();
    expect(document.activeElement).toBe(opener);
    dialog.remove();
    opener.remove();
  });
});
