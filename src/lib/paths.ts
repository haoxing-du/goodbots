/** URL of a model's page. Model ids look like "anthropic/claude-opus-4.1". */
export function versionPath(versionId: string) {
  return `/m/${versionId.split("/").map(encodeURIComponent).join("/")}`;
}

/** URL of the write page for a model (which may not have a page yet). */
export function writePath(versionId: string) {
  return `/write?v=${encodeURIComponent(versionId)}`;
}
