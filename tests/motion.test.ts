import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectionFeedback } from '../src/renderer/components/ConnectionFeedback';
it.each(['connecting', 'reconnecting', 'authorizing'] as const)(
  'shows a pending icon for %s',
  (status) => {
    const html = renderToStaticMarkup(ConnectionFeedback({ status }));
    expect(html).toContain('motion-spinner');
    expect(html).toContain(`data-status="${status}"`);
  },
);
it('replaces progress with connected/error feedback instead of leaving a spinner', () => {
  for (const status of ['connected', 'error'] as const) {
    const html = renderToStaticMarkup(ConnectionFeedback({ status }));
    expect(html).not.toContain('motion-spinner');
    expect(html).toContain(`state-${status}`);
  }
});
