// Helpers for files that travel through the authenticated API (so a plain <a href> won't do:
// the JWT is attached by the axios instance).
import { api } from './api';

/** Reads a File as base64 (without the data: URL prefix), for JSON uploads. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Fetches a protected file and either opens it in a new tab or saves it.
 * The tab is opened before the request so pop-up blockers allow it.
 */
export async function openProtectedFile(url: string, fileName: string, download: boolean): Promise<void> {
  const tab = download ? null : window.open('', '_blank');
  try {
    const { data } = await api.get<Blob>(url, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(data);
    if (tab) {
      tab.location.href = objectUrl;
    } else {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      a.click();
    }
    // Give the tab or download time to read it before releasing the memory.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** 44 B, 230 KB, 1.4 MB */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
