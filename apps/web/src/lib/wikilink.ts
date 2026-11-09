/**
 * Wiki-link utilities: [[Page Name]] bidirectional linking.
 *
 * A wiki link is written as [[Page Name]] or [[Page Name|display text]].
 * Links are resolved by page title (case-insensitive). When no page
 * matches, the link renders as "unlinked" and clicking offers to create one.
 */
import type { Page, PageMap } from '../types';

export interface WikiLinkRef {
  /** The target page title written inside [[ ]] */
  target: string;
  /** Display text (the part after |), or the target if no alias */
  display: string;
}

const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

/** Extract all wiki-link references from a block text. */
export function parseWikiLinks(text: string): WikiLinkRef[] {
  const refs: WikiLinkRef[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(WIKILINK_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    refs.push({ target: m[1].trim(), display: (m[2] ?? m[1]).trim() });
  }
  return refs;
}

/** Check whether a text contains at least one wiki link. */
export function hasWikiLink(text: string): boolean {
  const re = new RegExp(WIKILINK_RE.source, 'g');
  return re.test(text);
}

/** Find a page by title (case-insensitive, trimmed). */
export function findPageByTitle(pages: PageMap, title: string): Page | undefined {
  const t = title.trim().toLowerCase();
  return Object.values(pages).find((p) => p.title.trim().toLowerCase() === t);
}

/**
 * Find all pages that link to the given page via [[title]] wiki links.
 * Returns pages that reference the target page's title in any of their blocks.
 */
export function getBacklinks(pages: PageMap, targetPage: Page): Page[] {
  const targetTitle = targetPage.title.trim().toLowerCase();
  if (!targetTitle) return [];
  const results: Page[] = [];
  for (const page of Object.values(pages)) {
    if (page.id === targetPage.id) continue;
    for (const block of page.blocks) {
      const refs = parseWikiLinks(block.text);
      if (refs.some((r) => r.target.toLowerCase() === targetTitle)) {
        results.push(page);
        break;
      }
    }
  }
  return results.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Get all unique wiki-link targets used across all pages (for autocomplete). */
export function getAllWikiLinkTargets(pages: PageMap): string[] {
  const set = new Set<string>();
  for (const page of Object.values(pages)) {
    for (const block of page.blocks) {
      for (const ref of parseWikiLinks(block.text)) {
        set.add(ref.target);
      }
    }
  }
  return [...set].sort();
}

/**
 * Find pages whose title fuzzy-matches the query (for the [[ autocomplete).
 * Returns at most `limit` pages, best matches first.
 */
export function searchPages(pages: PageMap, query: string, limit = 8): Page[] {
  const q = query.trim().toLowerCase();
  const all = Object.values(pages);
  if (!q) return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  const scored = all
    .map((p) => {
      const t = p.title.trim().toLowerCase();
      if (t === q) return { p, score: 0 };
      if (t.startsWith(q)) return { p, score: 1 };
      if (t.includes(q)) return { p, score: 2 };
      return { p, score: 3 };
    })
    .filter((x) => x.score < 3);
  return scored.sort((a, b) => a.score - b.score || b.p.updatedAt - a.p.updatedAt).slice(0, limit).map((x) => x.p);
}
