'use client';

import { useEffect, useState } from 'react';

/**
 * True when the primary input is a finger rather than a mouse.
 *
 * Drives copy ("drop an image" is meaningless on a phone) and the default
 * output width, since a phone has both a narrower screen and a slower CPU.
 * Starts false so server and first client render agree, then corrects on mount.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return coarse;
}
