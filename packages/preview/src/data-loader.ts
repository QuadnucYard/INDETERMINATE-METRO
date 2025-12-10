import van from "vanjs-core";
import type { PreviewData } from "./types";

/**
 * Load preview data from JSON file
 */
async function loadData(): Promise<PreviewData> {
  const resp = await fetch(`${import.meta.env.BASE_URL}preview-data.json`);
  if (!resp.ok) {
    throw new Error(`Failed to load preview-data.json: ${resp.status}`);
  }
  return resp.json();
}

export function useData() {
  const data = van.state<PreviewData | null>(null);

  // Load data
  loadData().then((loadedData) => {
    data.val = loadedData;
  });

  return { data };
}
