import type { ProjectSnapshot } from "@/engine/types";

const STORAGE_KEY = "glowbraid.project";
/** Pre-rename key; still read on load so existing saves aren't orphaned. */
const LEGACY_STORAGE_KEY = "filament.project";

export function saveProject(snapshot: ProjectSnapshot): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function loadProject(): ProjectSnapshot | null {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProjectSnapshot) : null;
  } catch {
    return null;
  }
}
