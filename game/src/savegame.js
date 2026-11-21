// Save / load: cash, unlocked missions, completed missions and career stats
// persist in localStorage so a player can close the tab and come back.
const KEY = 'portoverde-save-v7';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d !== 'object' || d === null) return null;
    return d;
  } catch (e) { return null; }
}

export function writeSave(S) {
  try {
    const d = {
      cash: Math.round(S.player.cash),
      unlocked: S.missions.unlocked,
      done: S.missions.done,
      stats: S.missions.stats,
      day: S.day,
      clockMin: S.clockMin,
      version: 7,
    };
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch (e) { /* storage unavailable: play session-only */ }
}

export function applySave(S, d) {
  if (!d) return;
  if (typeof d.cash === 'number') S.player.cash = d.cash;
  if (typeof d.unlocked === 'number') S.missions.unlocked = Math.max(1, Math.min(5, d.unlocked));
  if (d.done && typeof d.done === 'object') S.missions.done = d.done;
  if (d.stats && typeof d.stats === 'object') Object.assign(S.missions.stats, d.stats);
  if (typeof d.clockMin === 'number') S.clockMin = d.clockMin;
  if (typeof d.day === 'number') S.day = d.day;
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
