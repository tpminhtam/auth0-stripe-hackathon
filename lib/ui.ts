/**
 * Shared class tokens for the "Midnight Console" system.
 * The heavy lifting (glass, glow, motion) lives in app/globals.css —
 * these are the composed shorthands the pages reach for.
 */

export const pageShell =
  'mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:pb-18';

export const centeredPageShell =
  'mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8';

export const heroPanel = 'panel anim-rise p-7 sm:p-10';

export const buttonRow = 'mt-1 flex flex-wrap gap-3';

export const primaryButton = 'btn btn-primary h-11 px-6';

export const secondaryButton = 'btn btn-ghost h-11 px-6';

export const buttonIcon = 'h-4 w-4 shrink-0';

export const inlineIcon = 'h-3.5 w-3.5 shrink-0';

export const eyebrow = 'eyebrow mb-3 inline-flex text-dim';

export const bodyCopy = 'leading-7 text-mist';

export const statusList = 'ml-5 list-disc space-y-1 text-mist';

export const mutedText = 'mt-2 text-sm text-dim';

/** Section heading used above card grids. */
export const sectionTitle = 'text-xl font-semibold tracking-tight text-ink';
