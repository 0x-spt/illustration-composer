import {
  exportScene,
  validateScene,
  type Format,
  type LoadedLibrary,
  type Scene,
  type Violation,
} from '@ic/core';

/** How long the download URL stays valid. */
export const REVOKE_AFTER_MS = 10_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** `illustration-<W>x<H>-<YYYY-MM-DD>.svg`, date in local time. */
export function exportFileName(format: Format, date = new Date()): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `illustration-${format.width}x${format.height}-${day}.svg`;
}

export interface DownloadResult {
  fileName: string;
  violations: Violation[];
}

/** Validates (non-blocking), serialises and saves the scene as an SVG file. */
export function downloadSvg(scene: Scene, lib: LoadedLibrary): DownloadResult {
  const violations = validateScene(scene, lib);
  const svg = exportScene(scene, lib);
  const fileName = exportFileName(scene.format);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // some browsers start reading the blob after click() returns: keep it alive a while
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
  return { fileName, violations };
}
