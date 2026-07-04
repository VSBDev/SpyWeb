export interface MissionRecord {
  completed: boolean;
  bestRank: string;   // "" if never completed
  bestTime: number;   // seconds, 0 if never
  ghostClear: boolean; // completed with no kills and no alarms
}

export interface SaveData {
  missions: Record<string, MissionRecord>;
  settings: { musicVolume: number; sfxVolume: number; invertY: boolean; sensitivity: number };
}

const KEY = "spyweb-save-v1";

const defaults = (): SaveData => ({
  missions: {},
  settings: { musicVolume: 0.8, sfxVolume: 1.0, invertY: false, sensitivity: 1.0 },
});

export class SaveSystem {
  data: SaveData;

  constructor() {
    this.data = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = { ...defaults(), ...parsed, settings: { ...defaults().settings, ...(parsed.settings ?? {}) } };
      }
    } catch { /* corrupted save -> fresh start */ }
  }

  persist() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage full/blocked */ }
  }

  getMission(id: string): MissionRecord {
    return this.data.missions[id] ?? { completed: false, bestRank: "", bestTime: 0, ghostClear: false };
  }

  recordMission(id: string, rank: string, time: number, ghost: boolean, rankScore: number, prevScore: number) {
    const rec = this.getMission(id);
    rec.completed = true;
    if (rankScore >= prevScore) rec.bestRank = rank;
    if (rec.bestTime === 0 || time < rec.bestTime) rec.bestTime = time;
    if (ghost) rec.ghostClear = true;
    this.data.missions[id] = rec;
    this.persist();
  }

  isUnlocked(missionIndex: number, order: string[]): boolean {
    if (missionIndex <= 1) return true; // tutorial + first compound always open
    return this.getMission(order[missionIndex - 1]).completed;
  }
}
