import { useEffect, useState } from 'react';
import { useApp } from './stores/app';
export const motion = {
  instant: 90,
  fast: 140,
  normal: 190,
  large: 240,
  enter: 'cubic-bezier(.16,1,.3,1)',
  exit: 'cubic-bezier(.4,0,1,1)',
  move: 'cubic-bezier(.2,.8,.2,1)',
} as const;
export function useReducedMotion() {
  const preference = useApp((s) => s.snapshot.settings.desktop?.feedback.reducedMotion ?? 'system');
  const [system, setSystem] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystem(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return preference === 'on' || (preference === 'system' && system);
}
export function useMotionValue<T>(value: T) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const leaving = !reduced && shown !== value;
  useEffect(() => {
    if (shown === value) return;
    if (reduced) {
      setShown(value);
      return;
    }
    const timer = setTimeout(() => setShown(value), motion.instant);
    return () => clearTimeout(timer);
  }, [shown, value, reduced]);
  return { shown: reduced ? value : shown, phase: leaving ? 'leaving' : 'entering' } as const;
}
