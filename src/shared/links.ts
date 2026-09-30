export const STREAMCHAT_API_URL = 'https://api-streamchat.fromflamb.ru';
export const BOOSTY_URL = 'https://boosty.to/itsflamb';
export const DONATION_ALERTS_URL = 'https://www.donationalerts.com/r/itsflamb';
export const DEVELOPER_URL = 'https://github.com/Flumbus';
export const DESKTOP_REPOSITORY_URL = 'https://github.com/Flumbus/stream-chat';
export const externalLinks = {
  boosty: BOOSTY_URL,
  donationAlerts: DONATION_ALERTS_URL,
  developer: DEVELOPER_URL,
} as const;
export type ExternalLink = keyof typeof externalLinks;
export function allowedExternalUrl(input: string) {
  try {
    const u = new URL(input);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      Object.values(externalLinks).includes(u.href as typeof BOOSTY_URL)
    );
  } catch {
    return false;
  }
}
