'use client';

import { useEffect, useState } from 'react';

import { buildGlyphAtlas, type GlyphAtlas } from '@/src/render/glyphAtlas';
import type { RampCanvas } from '@/src/render/measureRamp';

const makeCanvas = (w: number, h: number): RampCanvas => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c as unknown as RampCanvas;
};

/**
 * Rasterise the glyph atlas once, in the browser, from the font the browser
 * actually resolved.
 *
 * Building it from the real font matters for the same reason the character
 * aspect does: coverage is a property of the face, and an atlas measured
 * against Consolas would mis-describe a machine that fell back to Courier.
 * Costs about 40 ms, once, and only when shape matching is first requested.
 */
export function useGlyphAtlas(enabled: boolean, fontFamily: string): GlyphAtlas | null {
  const [atlas, setAtlas] = useState<GlyphAtlas | null>(null);

  useEffect(() => {
    if (!enabled || atlas) return;
    // Defer past paint so switching engines never blocks the frame that
    // renders the control's own pressed state.
    const id = window.setTimeout(() => {
      try {
        setAtlas(
          buildGlyphAtlas(makeCanvas, {
            fontFamily,
            fontSize: 48,
            sx: 4,
            sy: 8,
            exclude: '\\`',
          }),
        );
      } catch {
        // A missing font is not worth breaking the app over; the ramp engine
        // stays available and the control simply has no effect.
        setAtlas(null);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [enabled, atlas, fontFamily]);

  return atlas;
}
