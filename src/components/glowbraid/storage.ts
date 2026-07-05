import type { ProjectSnapshot } from "@/engine/types";

const STORAGE_KEY = "glowbraid.project";

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
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProjectSnapshot) : null;
  } catch {
    return null;
  }
}
