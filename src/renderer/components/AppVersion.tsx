import { useEffect, useState } from 'react';
import type { ApplicationInfo } from '../../shared/appVersion';
import { applicationTitle } from '../../shared/appVersion';
import { useText } from '../i18n';
export function AppVersion() {
  const [info, setInfo] = useState<ApplicationInfo>();
  const t = useText();
  useEffect(() => {
    let active = true;
    void window.desktop.applicationInfo().then((value) => {
      if (!active) return;
      setInfo(value);
      document.title = applicationTitle(value.version);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  if (!info) return null;
  return (
    <span className="version app-version" title={`${t('installedVersion')}: ${info.version} ${info.stage}`}>
      {info.version} <span className="release-stage">{info.stage}</span>
    </span>
  );
}
