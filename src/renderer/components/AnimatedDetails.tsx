import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import { motion, useReducedMotion } from '../motion';
export function AnimatedDetails({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [present, setPresent] = useState(false);
  const reduced = useReducedMotion();
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    if (expanded) {
      setPresent(true);
      return;
    }
    const timer = setTimeout(() => setPresent(false), reduced ? 0 : motion.normal);
    return () => clearTimeout(timer);
  }, [expanded, reduced]);
  const [summary, ...body] = Children.toArray(children);
  return (
    <details
      className={`animated-details ${className ?? ''}`}
      open={expanded || present}
      data-expanded={expanded}
    >
      {isValidElement(summary) &&
        cloneElement(
          summary as ReactElement<{
            onClick: (e: import('react').MouseEvent) => void;
            'aria-expanded': boolean;
          }>,
          {
            onClick: (e) => {
              e.preventDefault();
              cancelAnimationFrame(frame.current);
              if (expanded || reduced) {
                setExpanded(!expanded);
                return;
              }
              setPresent(true);
              frame.current = requestAnimationFrame(() => {
                frame.current = requestAnimationFrame(() => setExpanded(true));
              });
            },
            'aria-expanded': expanded,
          },
        )}
      <div className="details-grid" inert={!expanded} onClick={(e) => e.stopPropagation()}>
        <div>{body}</div>
      </div>
    </details>
  );
}
