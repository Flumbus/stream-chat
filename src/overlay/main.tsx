import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ChatMessage, ChatProfile, StreamEvent } from '../shared/models';
import type { OverlayPacket } from '../shared/overlay';
import { applyEvents } from '../shared/events';
import { OverlayRenderer } from '../renderer/components/OverlayRenderer';
import '../renderer/styles.css';
import './overlay.css';
function Overlay() {
  const [profile, setProfile] = useState<ChatProfile>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;
    let ws: WebSocket;
    let sequence = 0;
    const params = new URLSearchParams(location.search);
    const id = location.pathname.split('/').at(-1) ?? '';
    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(
        `ws://${location.host}/events?${new URLSearchParams({ profile: id, key: params.get('key') ?? '' })}`,
      );
      ws.onmessage = (event) => {
        try {
          const p = JSON.parse(event.data) as OverlayPacket;
          if (p.version !== 1) return;
          if (p.type === 'overlay.ready') {
            sequence = p.sequence;
            retry = 0;
            setProfile(p.payload.profile);
            setMessages(p.payload.messages);
            return;
          }
          if (p.sequence <= sequence) return;
          sequence = p.sequence;
          if (p.type === 'profile.updated') {
            setProfile(p.payload);
            return;
          }
          if (p.type === 'settings.updated') return;
          const e: StreamEvent =
            p.type === 'chat.message' ? { type: 'chat', message: p.payload } : p.payload;
          setMessages((previous) => applyEvents(previous, [e], 500));
        } catch {
          ws.close();
        }
      };
      ws.onclose = () => {
        if (!stopped)
          timer = setTimeout(
            connect,
            Math.min(30_000, 1000 * 2 ** Math.min(retry++, 5)) * (0.8 + Math.random() * 0.4),
          );
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, []);
  return profile ? <OverlayRenderer messages={messages} theme={profile.theme} /> : null;
}
createRoot(document.getElementById('root')!).render(<Overlay />);
