import { uiText, localizeLabel } from '../../i18n';
import type { CommandDisplayMode } from '../../../shared/displayPolicy';
import { useState } from 'react';
import { ShieldCheck, Trash2 } from 'lucide-react';
import {
  safeChatDefaults,
  type SafeChatSettings as Safety,
  type DictionaryEntry,
  type SafeCategory,
} from '../../../shared/safeChat';
import { perform, updateSettings, useApp } from '../../stores/app';
import { Modal } from '../../components/Modal';
import { MovingIndicator } from '../../components/MovingIndicator';
import { AnimatedDetails } from '../../components/AnimatedDetails';
export const categoryLabel = {
  soft: 'Лёгкая токсичность',
  blocked: 'Запрещённые слова',
  exception: 'Исключения',
};
export function changeSafety(change: (settings: Safety) => Safety) {
  return perform(() =>
    updateSettings((s) => ({ ...s, safeChat: change(s.safeChat ?? safeChatDefaults()) })),
  );
}
export function SafeChatSettings() {
  const settings = useApp((s) => s.snapshot.settings.safeChat) ?? safeChatDefaults();
  const experimental = useApp((s) => s.snapshot.settings.desktop?.experimental.enabled);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DictionaryEntry['category']>('blocked');
  const [word, setWord] = useState('');
  const [kind, setKind] = useState<DictionaryEntry['category']>('blocked');
  const [query, setQuery] = useState('');
  const [prefix, setPrefix] = useState('');
  const [durationDraft, setDurationDraft] = useState<Record<string, string>>({});
  const update = (patch: Partial<Safety>) => void changeSafety((s) => ({ ...s, ...patch }));
  const rules = settings.dictionary.filter(
    (e) => e.category === tab && e.text.toLowerCase().includes(query.toLowerCase()),
  );
  const blocked = settings.punishments.blocked;
  return (
    <section className="card safe-chat-settings">
      <h3>
        <ShieldCheck size={17} /> {uiText('releaseText129')}{' '}
      </h3>
      <label className="toggle">
        <span>{uiText('releaseText130')}</span>
        <input
          type="checkbox"
          checked={settings.filtering}
          onChange={(e) => update({ filtering: e.target.checked })}
        />
      </label>
      <label className="toggle">
        <span>{uiText('releaseText131')}</span>
        <input
          type="checkbox"
          checked={settings.automoderation}
          onChange={(e) => update({ automoderation: e.target.checked })}
        />
      </label>
      <label className="toggle">
        <span>{uiText('releaseText132')}</span>
        <input
          type="checkbox"
          checked={settings.hideViewerLinks}
          onChange={(e) => update({ hideViewerLinks: e.target.checked })}
        />
      </label>
      <label>
        {' '}
        {uiText('releaseText133')}{' '}
        <select
          aria-label={uiText('releaseText133')}
          value={settings.commandDisplayMode}
          onChange={(e) => update({ commandDisplayMode: e.target.value as CommandDisplayMode })}
        >
          <option value="show">{uiText('releaseText134')}</option>
          <option value="mask">{uiText('releaseText135')}</option>
          <option value="hide">{uiText('releaseText136')}</option>
        </select>
      </label>
      <p className="muted">
        {settings.automoderation
          ? `${uiText('releaseText91')} → ${blocked.action === 'timeout' ? `${uiText('releaseText159')} ${blocked.duration === 3600 ? uiText('releaseText137') : `${blocked.duration} ${uiText('releaseText107')}`}` : blocked.action === 'ban' ? uiText('releaseText138') : blocked.action === 'delete' ? uiText('releaseText139') : uiText('releaseText140')}`
          : uiText('releaseText141')}
      </p>
      <button onClick={() => setOpen(true)}>{uiText('releaseText142')}</button>
      {open && (
        <Modal title={uiText('releaseText129')} close={() => setOpen(false)}>
          <div className="safety-editor">
            <p className="muted"> {uiText('releaseText143')} </p>
            <AnimatedDetails>
              <summary>{uiText('releaseText144')}</summary>
              <p className="small muted"> {uiText('releaseText145')} </p>
              <label className="toggle">
                <span>{uiText('releaseText146')}</span>
                <input
                  type="checkbox"
                  checked={settings.allowSubscriberLinks}
                  onChange={(e) => update({ allowSubscriberLinks: e.target.checked })}
                />
              </label>
              <form
                className="dictionary-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = prefix.trim();
                  if (!value || /\s/u.test(value)) return;
                  void changeSafety((s) => ({
                    ...s,
                    commandPrefixes: [...new Set([...s.commandPrefixes, value])],
                  }));
                  setPrefix('');
                }}
              >
                <input
                  aria-label={uiText('releaseText147')}
                  placeholder={uiText('releaseText148')}
                  maxLength={8}
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                />
                <button disabled={!prefix.trim() || settings.commandPrefixes.length >= 10}>
                  {' '}
                  {uiText('releaseText149')}{' '}
                </button>
              </form>
              {settings.commandPrefixes.map((value) => (
                <div className="dictionary-row" key={value}>
                  <span>{value}</span>
                  <button
                    disabled={settings.commandPrefixes.length === 1}
                    onClick={() =>
                      void changeSafety((s) => ({
                        ...s,
                        commandPrefixes: s.commandPrefixes.filter((p) => p !== value),
                      }))
                    }
                    aria-label={`${uiText('removePrefix')} ${value}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <p>{uiText('releaseText150')}</p>
              <p className="small muted"> {uiText('releaseText151')} </p>
              {settings.trustedUsers.map((u) => (
                <div className="dictionary-row" key={`${u.platform}:${u.userId}`}>
                  <span>
                    {u.label} · {u.platform}
                  </span>
                  <button
                    aria-label={`${uiText('removeTrust')}: ${u.label}`}
                    onClick={() =>
                      void changeSafety((s) => ({
                        ...s,
                        trustedUsers: s.trustedUsers.filter(
                          (v) => !(v.platform === u.platform && v.userId === u.userId),
                        ),
                      }))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </AnimatedDetails>
            <div className="tabs moving-tabs" role="group" aria-label={uiText('releaseText152')}>
              <MovingIndicator selected={tab} />
              {(['blocked', 'soft', 'exception'] as const).map((c) => (
                <button
                  key={c}
                  data-selected={tab === c}
                  aria-pressed={tab === c}
                  onClick={() => {
                    setTab(c);
                    setKind(c);
                  }}
                >
                  {localizeLabel(categoryLabel[c])}
                </button>
              ))}
            </div>
            <form
              className="dictionary-add"
              onSubmit={(e) => {
                e.preventDefault();
                if (word.trim().length < 2) return;
                void changeSafety((s) => ({
                  ...s,
                  dictionary: [
                    ...s.dictionary.filter(
                      (v) => v.text.toLowerCase() !== word.trim().toLowerCase(),
                    ),
                    { id: crypto.randomUUID(), text: word.trim(), category: kind },
                  ],
                }));
                setWord('');
                setTab(kind);
              }}
            >
              <input
                aria-label={uiText('releaseText88')}
                placeholder={uiText('releaseText88')}
                maxLength={100}
                value={word}
                onChange={(e) => setWord(e.target.value)}
              />
              <select
                aria-label={uiText('releaseText153')}
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                {Object.entries(categoryLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {localizeLabel(String(label))}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={word.trim().length < 2 || settings.dictionary.length >= 500}
              >
                {' '}
                {uiText('releaseText90')}{' '}
              </button>
            </form>
            <input
              aria-label={uiText('releaseText154')}
              placeholder={uiText('releaseText154')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="dictionary-list">
              {rules.length ? (
                rules.map((rule) => (
                  <div className="dictionary-row" key={rule.id}>
                    <span>{rule.text}</span>
                    <select
                      aria-label={`${uiText('releaseText89')}: ${rule.text}`}
                      value={rule.category}
                      onChange={(e) =>
                        void changeSafety((s) => ({
                          ...s,
                          dictionary: s.dictionary.map((v) =>
                            v.id === rule.id
                              ? { ...v, category: e.target.value as DictionaryEntry['category'] }
                              : v,
                          ),
                        }))
                      }
                    >
                      {Object.entries(categoryLabel).map(([value, label]) => (
                        <option value={value} key={value}>
                          {localizeLabel(String(label))}
                        </option>
                      ))}
                    </select>
                    <button
                      aria-label={`${uiText('removeLabel')}: ${rule.text}`}
                      onClick={() =>
                        void changeSafety((s) => ({
                          ...s,
                          dictionary: s.dictionary.filter((v) => v.id !== rule.id),
                        }))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted">{uiText('releaseText155')}</p>
              )}
            </div>
            <p className="small muted"> {uiText('releaseText156')} </p>
            <AnimatedDetails className="safety-punishments">
              <summary>{uiText('releaseText157')}</summary>
              {(['soft', 'blocked'] as SafeCategory[]).map((category) => {
                const policy = settings.punishments[category];
                return (
                  <div className="punishment-row" key={category}>
                    <label>
                      {localizeLabel(categoryLabel[category])}
                      <select
                        aria-label={`${uiText('punishmentLabel')}: ${localizeLabel(categoryLabel[category])}`}
                        value={policy.action}
                        onChange={(e) =>
                          void changeSafety((s) => ({
                            ...s,
                            punishments: {
                              ...s.punishments,
                              [category]: { ...s.punishments[category], action: e.target.value },
                            },
                          }))
                        }
                      >
                        <option value="none">{uiText('releaseText158')}</option>
                        <option value="delete">{uiText('releaseText118')}</option>
                        <option value="timeout">{uiText('releaseText159')}</option>
                        <option value="ban">{uiText('releaseText160')}</option>
                      </select>
                    </label>
                    {policy.action === 'timeout' && (
                      <>
                        <select
                          aria-label={`${uiText('durationLabel')}: ${localizeLabel(categoryLabel[category])}`}
                          value={
                            durationDraft[category] === undefined &&
                            [600, 1800, 3600, 21600, 86400].includes(policy.duration)
                              ? policy.duration
                              : 'custom'
                          }
                          onChange={(e) => {
                            if (e.target.value === 'custom') {
                              setDurationDraft((d) => ({
                                ...d,
                                [category]: String(policy.duration),
                              }));
                              return;
                            }
                            setDurationDraft((d) => {
                              const next = { ...d };
                              delete next[category];
                              return next;
                            });
                            void changeSafety((s) => ({
                              ...s,
                              punishments: {
                                ...s.punishments,
                                [category]: {
                                  ...s.punishments[category],
                                  duration: Number(e.target.value),
                                },
                              },
                            }));
                          }}
                        >
                          {[
                            [600, uiText('releaseText161')],
                            [1800, uiText('releaseText162')],
                            [3600, uiText('releaseText163')],
                            [21600, uiText('releaseText164')],
                            [86400, uiText('releaseText165')],
                          ].map(([v, label]) => (
                            <option value={v} key={v}>
                              {localizeLabel(String(label))}
                            </option>
                          ))}
                          <option value="custom">{uiText('releaseText166')}</option>
                        </select>
                        {(durationDraft[category] !== undefined ||
                          ![600, 1800, 3600, 21600, 86400].includes(policy.duration)) && (
                          <form
                            className="inline"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const duration = Number(durationDraft[category] ?? policy.duration);
                              if (
                                Number.isInteger(duration) &&
                                duration >= 1 &&
                                duration <= 1209600
                              )
                                void changeSafety((s) => ({
                                  ...s,
                                  punishments: {
                                    ...s.punishments,
                                    [category]: { ...s.punishments[category], duration },
                                  },
                                }));
                            }}
                          >
                            <input
                              aria-label={`${uiText('timeoutSeconds')}: ${localizeLabel(categoryLabel[category])}`}
                              type="number"
                              min={1}
                              max={1209600}
                              value={durationDraft[category] ?? policy.duration}
                              onChange={(e) =>
                                setDurationDraft((d) => ({ ...d, [category]: e.target.value }))
                              }
                            />
                            <button>{uiText('releaseText167')}</button>
                          </form>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              <p className="small muted"> {uiText('releaseText168')} </p>
            </AnimatedDetails>
            <AnimatedDetails>
              <summary>{uiText('releaseText169')}</summary>
              <label className="toggle">
                <span>{uiText('releaseText170')}</span>
                <input
                  type="checkbox"
                  checked={settings.commonRules}
                  onChange={(e) => update({ commonRules: e.target.checked })}
                />
              </label>
              {!settings.commonRules &&
                (['twitch', 'youtube'] as const).map((p) => (
                  <div key={p}>
                    <b>{p === 'twitch' ? 'Twitch' : 'YouTube'}</b>
                    {(['filtering', 'automoderation'] as const).map((flag) => (
                      <label className="toggle" key={flag}>
                        <span>
                          {flag === 'filtering'
                            ? uiText('releaseText171')
                            : uiText('releaseText131')}{' '}
                          · {p}
                        </span>
                        <input
                          type="checkbox"
                          checked={settings.platforms[p][flag]}
                          onChange={(e) =>
                            void changeSafety((s) => ({
                              ...s,
                              platforms: {
                                ...s.platforms,
                                [p]: { ...s.platforms[p], [flag]: e.target.checked },
                              },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                ))}
            </AnimatedDetails>
            {experimental && (
              <AnimatedDetails>
                <summary>{uiText('releaseText172')}</summary>
                <p className="muted"> {uiText('releaseText173')} </p>
                <label className="toggle">
                  <span>{uiText('releaseText174')}</span>
                  <input
                    type="checkbox"
                    checked={settings.kindMode.enabled}
                    onChange={(e) =>
                      update({ kindMode: { ...settings.kindMode, enabled: e.target.checked } })
                    }
                  />
                </label>
                <select
                  aria-label={uiText('releaseText175')}
                  value={
                    ['[скрыто]', 'солнышко', 'котик', 'друг', 'космический огурец'].includes(
                      settings.kindMode.replacement,
                    )
                      ? settings.kindMode.replacement
                      : 'custom'
                  }
                  onChange={(e) => {
                    if (e.target.value !== 'custom')
                      update({ kindMode: { ...settings.kindMode, replacement: e.target.value } });
                  }}
                >
                  <option value="[скрыто]">{uiText('kindHidden')}</option>
                  <option value="солнышко">{uiText('kindSun')}</option>
                  <option value="котик">{uiText('kindCat')}</option>
                  <option value="друг">{uiText('kindFriend')}</option>
                  <option value="космический огурец">{uiText('kindCucumber')}</option>
                  <option value="custom">{uiText('releaseText176')}</option>
                </select>
                <input
                  aria-label={uiText('releaseText176')}
                  maxLength={80}
                  defaultValue={settings.kindMode.replacement}
                  key={settings.kindMode.replacement}
                  onBlur={(e) => {
                    if (e.target.value.trim())
                      update({
                        kindMode: { ...settings.kindMode, replacement: e.target.value.trim() },
                      });
                  }}
                />
              </AnimatedDetails>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
