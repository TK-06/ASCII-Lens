'use client';

import { Press } from '@/components/ui/Press';
import { Toggle } from '@/components/ui/Field';

/** The webcam equivalent of the dropzone: centred, and the only thing on stage. */
export function WebcamPanel({
  streaming,
  busy,
  mirror,
  canFlip,
  facing,
  onStart,
  onStop,
  onMirror,
  onFlip,
}: {
  streaming: boolean;
  busy: boolean;
  mirror: boolean;
  canFlip: boolean;
  facing: 'user' | 'environment';
  onStart: () => void;
  onStop: () => void;
  onMirror: (v: boolean) => void;
  onFlip: () => void;
}) {
  if (streaming) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {canFlip && (
          <Press variant="ghost" disabled={busy} onClick={onFlip}>
            {facing === 'user' ? 'Rear camera' : 'Front camera'}
          </Press>
        )}
        <Toggle label="Mirror" checked={mirror} onChange={onMirror} />
        <Press variant="orange" onClick={onStop}>
          Stop camera
        </Press>
      </div>
    );
  }

  return (
    <div className="keyline drop-ink w-full max-w-[520px] bg-field px-8 py-14 text-center sm:px-14 sm:py-16">
      <span
        aria-hidden
        className="mb-4 block text-[42px] leading-none tracking-[0.1em] text-blue"
        style={{ fontFamily: 'var(--font-art)' }}
      >
        ▓▒░ ░▒▓
      </span>

      <h2 className="text-[26px] font-extrabold uppercase leading-[1.05] tracking-[0.015em] sm:text-[31px]">
        {busy ? 'Waiting for you' : 'Use your camera'}
      </h2>

      <p className="mx-auto mt-3 max-w-[30ch] text-[13px] font-medium leading-relaxed text-muted">
        {busy
          ? 'Allow camera access in the browser prompt.'
          : 'Your browser will ask permission first.'}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Press variant="blue" disabled={busy} onClick={onStart}>
          {busy ? 'Starting…' : 'Start camera'}
        </Press>
        <Toggle label="Mirror" checked={mirror} onChange={onMirror} />
      </div>

      <p className="mt-7 text-[10px] font-bold uppercase leading-relaxed tracking-[0.14em] text-muted">
        Frames never leave this device
      </p>
    </div>
  );
}
