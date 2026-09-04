// save.js — 存档/读档
import { state, persistState } from './state.js';

export class SaveSystem {
  constructor() {
    this.slots = [null, null, null];
    this.load();
  }

  load() {
    try {
      for (let i = 0; i < 3; i++) {
        const k = `witherbloom_save_${i}`;
        const raw = localStorage.getItem(k);
        if (raw) this.slots[i] = JSON.parse(raw);
      }
    } catch (e) { console.warn('读档失败', e); }
  }

  save(slot = 0) {
    state.currentSlot = slot;
    persistState();
    const data = JSON.parse(JSON.stringify(state));
    data._timestamp = Date.now();
    this.slots[slot] = data;
    try { localStorage.setItem(`witherbloom_save_${slot}`, JSON.stringify(data)); }
    catch (e) { console.warn('存档失败', e); }
  }

  loadSlot(slot = 0) {
    return this.slots[slot];
  }

  getLast() {
    let last = null, lastT = 0;
    for (let i = 0; i < 3; i++) {
      if (this.slots[i] && (this.slots[i]._timestamp ?? 0) > lastT) {
        last = this.slots[i];
        lastT = this.slots[i]._timestamp;
      }
    }
    return last;
  }

  hasSave() { return this.slots.some(s => s !== null); }
  clear() { for (let i = 0; i < 3; i++) { this.slots[i] = null; try { localStorage.removeItem(`witherbloom_save_${i}`); } catch {} } }
}
