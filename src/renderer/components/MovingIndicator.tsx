import { useLayoutEffect, useRef, useState } from 'react';
export function MovingIndicator({
  selected,
  selector = '[data-selected="true"]',
}: {
  selected: unknown;
  selector?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; width: number; height: number }>();
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const target = parent.querySelector<HTMLElement>(selector);
      if (!target || !target.getClientRects().length) {
        setBox(undefined);
        return;
      }
      const p = parent.getBoundingClientRect(),
        r = target.getBoundingClientRect();
      setBox({
        x: r.left - p.left + parent.scrollLeft,
        y: r.top - p.top + parent.scrollTop,
        width: r.width,
        height: r.height,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    const target = parent.querySelector(selector);
    if (target) observer.observe(target);
    parent.addEventListener('scroll', measure, { passive: true });
    parent.addEventListener('toggle', measure, true);
    return () => {
      observer.disconnect();
      parent.removeEventListener('scroll', measure);
      parent.removeEventListener('toggle', measure, true);
    };
  }, [selected, selector]);
  return (
    <span
      ref={ref}
      className="moving-indicator"
      aria-hidden="true"
      data-visible={!!box}
      style={
        box
          ? { width: box.width, height: box.height, transform: `translate(${box.x}px, ${box.y}px)` }
          : { opacity: 0 }
      }
    />
  );
}
