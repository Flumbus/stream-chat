import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from '../motion';
export function MotionPresence({
  show,
  children,
  className = '',
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [present, setPresent] = useState(show);
  const content = useRef(children);
  if (show) content.current = children;
  useEffect(() => {
    if (show) {
      setPresent(true);
      return;
    }
    const timer = setTimeout(() => setPresent(false), reduced ? 0 : motion.fast);
    return () => clearTimeout(timer);
  }, [show, reduced]);
  return present || show ? (
    <div className={`motion-presence ${className}`} data-state={show ? 'open' : 'leaving'}>
      {show ? children : content.current}
    </div>
  ) : null;
}
