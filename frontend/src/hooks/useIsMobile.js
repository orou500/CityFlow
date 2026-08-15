import { useEffect, useState } from 'react';

function matchesMobile(breakpoint) {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches;
  }
  return window.innerWidth < breakpoint;
}

export default function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => matchesMobile(breakpoint));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    if (typeof window.matchMedia === 'function') {
      const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
      const onChange = (e) => setIsMobile(e.matches);
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
      }
      mq.addListener(onChange);
      return () => mq.removeListener(onChange);
    }

    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);

  return isMobile;
}
