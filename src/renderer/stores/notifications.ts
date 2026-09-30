import { create } from 'zustand';
import type { SoundKind } from '../services/SoundService';
export type ToastKind = 'success' | 'info' | 'warning' | 'error';
export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  details?: string;
  sound?: SoundKind;
}
let nextId = 0;
export const useNotifications = create<{ items: Toast[] }>(() => ({ items: [] }));
export function notify(
  message: string,
  kind: ToastKind = 'info',
  details?: string,
  sound?: SoundKind,
) {
  const state = useNotifications.getState();
  if (state.items.some((item) => item.message === message && item.details === details)) return;
  useNotifications.setState({
    items: [...state.items.slice(-3), { id: ++nextId, message, kind, details, sound }],
  });
}
export function dismiss(id: number) {
  useNotifications.setState((state) => ({ items: state.items.filter((item) => item.id !== id) }));
}
