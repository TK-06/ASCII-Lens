'use client';

import { useCallback, useRef, useState } from 'react';

import { useCoarsePointer } from '@/lib/useCoarsePointer';

/**
 * The landing hero.
 *
 * This is the first and only thing on the page before an image exists, so it
 * is centred and given the full stage rather than tucked into a sidebar.
 * A compact variant reuses the same drop handling for the persistent
 * "replace" control once something is loaded.
 */
export function ImageDropzone({
  onFile,
  compact = false,
}: {
  onFile: (file: File) => void;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  // A phone cannot drag a file, so the invitation has to change.
  const touch = useCoarsePointer();

  const take = useCallback(
    (files: FileList | null | undefined) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      take(e.dataTransfer?.files);
    },
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      className="sr-only"
      onChange={(e) => {
        take(e.target.files);
        // Reset so choosing the same file twice still fires a change.
        e.target.value = '';
      }}
    />
  );

  if (compact) {
    return (
      <>
        {picker}
        <button
          type="button"
          {...dragProps}
          onClick={() => input.current?.click()}
          className={[
            'press drop-sm keyline px-3 py-1.5',
            'text-[11px] font-bold uppercase tracking-[0.06em]',
            over ? 'bg-orange text-ink' : 'bg-field text-ink hover:bg-stage',
          ].join(' ')}
        >
          {touch ? 'New photo' : 'Replace image'}
        </button>
      </>
    );
  }

  return (
    <>
      {picker}
      <button
        type="button"
        {...dragProps}
        onClick={() => input.current?.click()}
        aria-label="Drop an image here, or click to choose a file"
        className={[
          'press keyline drop-ink group relative w-full max-w-[520px]',
          'px-8 py-14 text-center sm:px-14 sm:py-16',
          over ? 'bg-orange' : 'bg-field',
        ].join(' ')}
      >
        <span
          aria-hidden
          className="mb-4 block text-[42px] leading-none tracking-[0.1em] text-blue"
          style={{ fontFamily: 'var(--font-art)' }}
        >
          {over ? '█████' : '▓▒░ ░▒▓'}
        </span>

        <span className="block text-[26px] font-extrabold uppercase leading-[1.05] tracking-[0.015em] text-ink sm:text-[31px]">
          {over ? 'Let go' : touch ? 'Add a photo' : 'Drop an image'}
        </span>

        <span className="mx-auto mt-3 block max-w-[30ch] text-[13px] font-medium leading-relaxed text-muted">
          {touch ? 'Take one, or pick from your library' : 'or click to choose · paste works too'}
        </span>

        <span className="mt-6 inline-block bg-blue px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-paper drop-sm keyline">
          {touch ? 'Choose a photo' : 'Choose a file'}
        </span>

        <span className="mt-7 block text-[10px] font-bold uppercase leading-relaxed tracking-[0.14em] text-muted">
          Converted on this device · nothing is uploaded
        </span>
      </button>
    </>
  );
}
