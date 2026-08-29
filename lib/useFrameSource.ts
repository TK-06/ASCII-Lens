'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  hasMultipleCameras,
  imageSource,
  webcamSource,
  type Facing,
  type FrameSource,
} from '@/src/browser/sources';
import type { Mode } from './options';

function describe(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError') {
    return 'Camera blocked. Allow it from the icon in the address bar, then press Start.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera found.';
  if (name === 'NotReadableError') return 'Another app is already using the camera.';
  return err instanceof Error ? err.message : String(err);
}

export interface SourceState {
  source: FrameSource | null;
  label: string;
  error: string | null;
  busy: boolean;
  loadFile: (file: File) => Promise<void>;
  startCamera: (facing?: Facing) => Promise<void>;
  stopCamera: () => void;
  clearError: () => void;
  /** Front/rear swap. Only meaningful where more than one camera exists. */
  flipCamera: () => Promise<void>;
  canFlip: boolean;
  facing: Facing;
}

/**
 * Owns the lifetime of whatever is currently producing frames.
 *
 * The subtle part is cancellation. getUserMedia stays pending for as long as
 * the permission prompt is open, and during that window there is no source to
 * stop — so a teardown would release nothing and the late continuation would
 * then install a live camera behind the user's back, in the wrong mode. Every
 * acquisition carries a generation number, and anything superseded is stopped
 * rather than adopted.
 */
export function useFrameSource(
  mode: Mode,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  mirror: boolean,
): SourceState {
  const [source, setSource] = useState<FrameSource | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canFlip, setCanFlip] = useState(false);
  const [facing, setFacing] = useState<Facing>('user');

  const generation = useRef(0);
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;
  const facingRef = useRef<Facing>('user');

  // Kept in a ref as well as state so cleanup can reach the current source
  // without re-running effects every time it changes.
  const live = useRef<FrameSource | null>(null);
  const adopt = useCallback((next: FrameSource | null, nextLabel: string) => {
    live.current?.stop();
    live.current = next;
    setSource(next);
    setLabel(nextLabel);
  }, []);

  const stopCamera = useCallback(() => {
    generation.current++;
    if (live.current?.kind === 'webcam') adopt(null, '');
    setBusy(false);
  }, [adopt]);

  const loadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError(`${file.name} is not an image file.`);
        return;
      }
      generation.current++;
      const mine = generation.current;
      setError(null);
      try {
        const next = await imageSource(file);
        if (mine !== generation.current) {
          next.stop();
          return;
        }
        adopt(next, next.label);
      } catch (err) {
        if (mine === generation.current) setError(describe(err));
      }
    },
    [adopt],
  );

  const startCamera = useCallback(
    async (want?: Facing) => {
      const target = want ?? facingRef.current;
      // A flip has to replace the running stream, so only bail out when the
      // camera we already have is the one being asked for.
      if (live.current?.kind === 'webcam' && live.current.facing === target) return;
      generation.current++;
      const mine = generation.current;
      setBusy(true);
      setError(null);
      try {
        const next = await webcamSource({
          video: videoRef.current!,
          mirror: () => mirrorRef.current,
          facing: target,
          onLost: () => {
            stopCamera();
            setError('The camera was disconnected or taken by another app.');
          },
        });
        if (mine !== generation.current) {
          next.stop();
          return;
        }
        adopt(next, next.label);
        if (next.facing) {
          facingRef.current = next.facing;
          setFacing(next.facing);
        }
        // Labels only populate after permission, so re-check now.
        void hasMultipleCameras().then(setCanFlip);
      } catch (err) {
        if (mine === generation.current) setError(describe(err));
      } finally {
        if (mine === generation.current) setBusy(false);
      }
    },
    [adopt, stopCamera, videoRef],
  );

  const flipCamera = useCallback(async () => {
    const next: Facing = facingRef.current === 'user' ? 'environment' : 'user';
    facingRef.current = next;
    setFacing(next);
    await startCamera(next);
  }, [startCamera]);

  /**
   * Own the mode transition here rather than in the page.
   *
   * Both directions need work: leaving webcam mode has to release the hardware
   * or the camera light stays on, and entering it has to drop the still image
   * first — otherwise the old source is still non-null, an "is anything loaded"
   * guard passes, and the camera silently never starts.
   *
   * All three callbacks are stable, so this runs on mode change only.
   */
  useEffect(() => {
    if (mode === 'webcam') {
      if (live.current?.kind === 'image') adopt(null, '');
      void startCamera();
    } else {
      stopCamera();
    }
  }, [mode, adopt, startCamera, stopCamera]);

  // Whether a flip control is worth showing at all.
  useEffect(() => {
    void hasMultipleCameras().then(setCanFlip);
  }, []);

  useEffect(
    () => () => {
      generation.current++;
      live.current?.stop();
      live.current = null;
    },
    [],
  );

  return {
    source,
    label,
    error,
    busy,
    loadFile,
    startCamera,
    stopCamera,
    clearError: useCallback(() => setError(null), []),
    flipCamera,
    canFlip,
    facing,
  };
}
