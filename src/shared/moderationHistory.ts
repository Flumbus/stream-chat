import type { ModerationRecord } from './models';
import type { DictionaryEntry } from './safeChat';
export function moderationHistoryReason(
  record: ModerationRecord,
  dictionary: DictionaryEntry[],
  labels = {
    automatic: 'Автоматически',
    blocked: 'Запрещённые слова',
    soft: 'Лёгкая токсичность',
    deleted: 'удалённое правило',
  },
) {
  if (!record.reason?.startsWith('AUTO · ')) return record.reason ?? '—';
  const [, category, ids] = record.reason.split(' · ');
  const words = (ids ?? '')
    .split(',')
    .map((id) => dictionary.find((e) => e.id === id)?.text ?? labels.deleted);
  return `${labels.automatic} · ${category === 'blocked' ? labels.blocked : labels.soft} · ${words.map((w) => `«${w}»`).join(', ')}`;
}
