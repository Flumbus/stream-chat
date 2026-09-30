import { useCallback, useEffect, useRef, useState } from 'react';
export function useMotionClose(onClose: () => void) {
  const [leaving, setLeaving] = useState(false);
  const callback = useRef(onClose);
  callback.current = onClose;
  useEffect(() => {
    if (!leaving) return;
    const reduced = document.querySelector('.app')?.getAttribute('data-reduced-motion') === 'true';
    const timer = setTimeout(() => callback.current(), reduced ? 0 : 140);
    return () => clearTimeout(timer);
  }, [leaving]);
  return { leaving, close: useCallback(() => setLeaving(true), []) };
}
