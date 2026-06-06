const STORAGE_KEY = "cv-local-scripts";

export interface SavedScript {
  script: string;
  savedAt: number;
}

function loadAll(): Record<string, SavedScript> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, SavedScript>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/** Persist a script under a given name. */
export function saveLocalScript(name: string, script: string): void {
  const all = loadAll();
  all[name] = { script, savedAt: Date.now() };
  saveAll(all);
}

/** Load a script by name. Returns null if not found. */
export function loadLocalScript(name: string): string | null {
  return loadAll()[name]?.script ?? null;
}

/** List all saved scripts, newest first. */
export function listLocalScripts(): { name: string; savedAt: number }[] {
  return Object.entries(loadAll())
    .map(([name, v]) => ({ name, savedAt: v.savedAt }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

/** Delete a saved script by name. */
export function deleteLocalScript(name: string): void {
  const all = loadAll();
  delete all[name];
  saveAll(all);
}
