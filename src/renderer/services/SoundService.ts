import type { DesktopPreferences } from '../../shared/preferences';
export type SoundKind = 'connect' | 'disconnect' | 'error' | 'notification' | 'moderation';
const notes: Record<SoundKind, number[]> = {
  connect: [440, 660],
  disconnect: [440, 330],
  error: [220, 196],
  notification: [523],
  moderation: [587, 784],
};
export class SoundService {
  private context?: AudioContext;
  private lastPlayed = 0;
  async play(kind: SoundKind, preferences: DesktopPreferences['feedback'], test = false) {
    if ((!preferences.sounds && !test) || preferences.volume === 0) return;
    if (!test && Date.now() - this.lastPlayed < 400) return;
    this.lastPlayed = Date.now();
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
      if (this.context.state !== 'running') return;
      const start = this.context.currentTime;
      notes[kind].forEach((frequency, index) => {
        const oscillator = this.context!.createOscillator();
        const gain = this.context!.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        const time = start + index * 0.075;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(preferences.volume * 0.12, time + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
        oscillator.connect(gain).connect(this.context!.destination);
        oscillator.start(time);
        oscillator.stop(time + 0.14);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      });
    } catch {
      /* Audio output may be unavailable; chat remains fully usable. */
    }
  }
}
export const soundService = new SoundService();
