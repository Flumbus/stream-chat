import { randomUUID } from 'node:crypto';
import type {
  ChatMessage,
  ModerationRecord,
  ModerationRequest,
  PlatformAccount,
} from '../../shared/models';
import {
  automaticSkipReason,
  platformSafety,
  type SafeAnnotation,
  type SafeChatEngine,
} from '../../shared/safeChat';
import { readableError } from '../../platforms/common/errors';
import { messageKey } from '../../shared/events';

interface Options {
  engine: SafeChatEngine;
  account: (id: string) => Promise<PlatformAccount>;
  moderate: (request: ModerationRequest) => Promise<void>;
  record: (record: ModerationRecord) => Promise<void>;
  update: (key: string, value: SafeAnnotation) => void;
}
/** Serial bounded queue; reading/filtering never waits for a platform request. */
export class Automoderator {
  private queue: ChatMessage[] = [];
  private running = false;
  private seen = new Set<string>();
  private nextActionAt = 0;
  private stopped = false;
  private cooldown = new Map<string, number>();
  private finished: Promise<void> = Promise.resolve();
  constructor(private options: Options) {}
  submit(message: ChatMessage) {
    const key = messageKey(message);
    if (this.stopped || this.seen.has(key) || !this.options.engine.detect(message.text).length)
      return;
    this.seen.add(key);
    while (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value!);
    if (this.queue.length >= 100) {
      void this.skip(message, 'Очередь модерации заполнена').catch(() => undefined);
      return;
    }
    this.queue.push(message);
    if (!this.running) {
      this.running = true;
      this.finished = Promise.resolve().then(() => this.drain());
    }
  }
  private annotation(message: ChatMessage): SafeAnnotation | undefined {
    const matches = this.options.engine.detect(message.text);
    if (!matches.length) return;
    const category = matches.some((m) => m.category === 'blocked') ? 'blocked' : 'soft';
    const policy = this.options.engine.settings.punishments[category];
    return {
      category,
      ruleIds: [...new Set(matches.map((m) => m.ruleId))],
      filtered: platformSafety(this.options.engine.settings, message.platform).filtering,
      action: policy.action,
      duration: policy.action === 'timeout' ? policy.duration : undefined,
    };
  }
  private async skip(message: ChatMessage, reason: string) {
    const info = this.annotation(message);
    if (!info) return;
    this.options.update(messageKey(message), { ...info, status: 'skipped', reason });
    await this.options.record({
      id: randomUUID(),
      accountId: message.accountId,
      platform: message.platform,
      channelId: message.channelId,
      targetUserId: message.user.platformUserId,
      targetUsername: message.user.username,
      messageId: message.id,
      action: info.action ?? 'none',
      duration: info.duration,
      reason: `AUTO · ${info.category} · ${info.ruleIds.join(',')}`.slice(0, 500),
      createdAt: new Date().toISOString(),
      success: false,
      error: reason,
    });
  }
  private async drain() {
    try {
      while (this.queue.length && !this.stopped) {
        const message = this.queue.shift()!;
        try {
          await this.run(message);
        } catch {
          this.options.update(messageKey(message), {
            ...this.annotation(message)!,
            status: 'failed',
            reason: 'Не удалось завершить автоматическую модерацию',
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
  private async run(message: ChatMessage) {
    let info = this.annotation(message);
    if (!info) return;
    if (!platformSafety(this.options.engine.settings, message.platform).automoderation)
      return this.skip(message, 'Автомодерация отключена');
    if (info.action === 'none') return this.skip(message, 'Без наказания');
    let account: PlatformAccount | undefined;
    try {
      account = await this.options.account(message.accountId);
    } catch {
      /* detached account */
    }
    const reason = automaticSkipReason(account, message, info.action!);
    if (reason) return this.skip(message, reason);
    const user = `${message.accountId}:${message.channelId}:${message.user.platformUserId}`;
    if ((this.cooldown.get(user) ?? 0) > Date.now())
      return this.skip(message, 'Повторное действие ограничено: 30 секунд');
    if (this.nextActionAt > Date.now())
      await new Promise((resolve) => setTimeout(resolve, this.nextActionAt - Date.now()));
    if (this.stopped) return;
    if (!platformSafety(this.options.engine.settings, message.platform).automoderation)
      return this.skip(message, 'Автомодерация отключена');
    info = this.annotation(message);
    if (!info) return;
    if (info.action === 'none') return this.skip(message, 'Без наказания');
    const changedReason = automaticSkipReason(account, message, info.action!);
    if (changedReason) return this.skip(message, changedReason);
    this.nextActionAt = Date.now() + 500;
    this.cooldown.set(user, Date.now() + 30000);
    while (this.cooldown.size > 2000) this.cooldown.delete(this.cooldown.keys().next().value!);
    this.options.update(messageKey(message), { ...info, status: 'pending' });
    const request: ModerationRequest = {
      accountId: message.accountId,
      channelId: message.channelId,
      targetUserId: message.user.platformUserId,
      targetUsername: message.user.username,
      messageId: message.id,
      action: info.action as ModerationRequest['action'],
      duration: info.duration,
      reason: `AUTO · ${info.category} · ${info.ruleIds.join(',')}`.slice(0, 500),
    };
    const record: ModerationRecord = {
      ...request,
      id: randomUUID(),
      platform: message.platform,
      createdAt: new Date().toISOString(),
      success: false,
    };
    try {
      await this.options.moderate(request);
      await this.options.record({ ...record, success: true });
      this.options.update(messageKey(message), { ...info, status: 'success' });
    } catch (error) {
      await this.options.record({ ...record, error: readableError(error) });
      this.options.update(messageKey(message), {
        ...info,
        status: 'failed',
        reason: 'Платформа отклонила действие. Подробности в истории модерации.',
      });
    }
  }
  async close() {
    this.stopped = true;
    this.queue = [];
    await this.finished;
  }
}
