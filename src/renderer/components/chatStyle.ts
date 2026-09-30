import type { CSSProperties } from 'react';
import type { resolveAppearance } from '../../shared/chatAppearance';
import { fontStack } from '../../shared/fonts';
export function chatStyle(theme: ReturnType<typeof resolveAppearance>): CSSProperties {
  return {
    fontFamily: fontStack(theme.fontFamily),
    fontSize: theme.fontSize,
    lineHeight: theme.lineHeight,
    '--chat-text': theme.textColor,
    '--gap': `${theme.messageSpacing}px`,
    '--radius': `${theme.borderRadius}px`,
    '--message-padding': `${theme.messagePadding}px`,
    '--chat-icon-size': `${theme.iconSize}px`,
    '--message-background': theme.messageBackground ?? '#293135',
    textShadow: theme.shadow ? '0 1px 3px #0008' : 'none',
  } as CSSProperties;
}
