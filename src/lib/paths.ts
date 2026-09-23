/** URL of a model version's page. Every version has its own page. */
export function versionPath(versionId: string) {
  return `/m/${encodeURIComponent(versionId)}`;
}
