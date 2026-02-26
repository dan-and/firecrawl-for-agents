/**
 * Rewrites well-known non-scrapable URLs to their directly-fetchable equivalents.
 * Returns undefined if no rewrite applies (URL is already fine to scrape as-is).
 */
export function rewriteUrl(url: string): string | undefined {
  // Google Docs — export as HTML (skip already-public /d/e/ published docs)
  if (
    (url.startsWith("https://docs.google.com/document/d/") ||
      url.startsWith("http://docs.google.com/document/d/")) &&
    !url.includes("/document/d/e/")
  ) {
    const id = url.match(/\/document\/d\/([-\w]+)/)?.[1];
    if (id) {
      return `https://docs.google.com/document/d/${id}/export?format=html`;
    }
  }

  // Google Slides — export as HTML
  if (
    (url.startsWith("https://docs.google.com/presentation/d/") ||
      url.startsWith("http://docs.google.com/presentation/d/")) &&
    !url.includes("/presentation/d/e/")
  ) {
    const id = url.match(/\/presentation\/d\/([-\w]+)/)?.[1];
    if (id) {
      return `https://docs.google.com/presentation/d/${id}/export?format=html`;
    }
  }

  // Google Sheets — export as HTML table (preserves selected tab via gid)
  if (
    (url.startsWith("https://docs.google.com/spreadsheets/d/") ||
      url.startsWith("http://docs.google.com/spreadsheets/d/")) &&
    !url.includes("/spreadsheets/d/e/")
  ) {
    const id = url.match(/\/spreadsheets\/d\/([-\w]+)/)?.[1];
    if (id) {
      const gidMatch = url.match(/[?&#]gid=(\d+)/);
      const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : "";
      return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:html${gidParam}`;
    }
  }

  // Google Drive file — direct download link
  if (
    url.startsWith("https://drive.google.com/file/d/") ||
    url.startsWith("http://drive.google.com/file/d/")
  ) {
    const id = url.match(/\/file\/d\/([-\w]+)/)?.[1];
    if (id) {
      return `https://drive.google.com/uc?export=download&id=${id}`;
    }
  }

  return undefined;
}
