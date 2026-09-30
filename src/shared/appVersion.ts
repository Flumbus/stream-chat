// Product maturity is independent from the numeric update version.
// Keep the existing latest.yml channel so installed 0.4.x can receive Phase 5.
export const RELEASE_STAGE = 'Alpha' as const;
export interface ApplicationInfo {
  version: string;
  stage: typeof RELEASE_STAGE;
}
export const applicationTitle = (version: string) => `StreamChat ${version} ${RELEASE_STAGE}`;
