import type { LinkStore, Link } from "../store/LinkStore.js";

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateSlug(length = 4): string {
  let slug = "";
  for (let i = 0; i < length; i++) {
    slug += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return slug;
}

export function mint(store: LinkStore, target: string): Link {
  const link: Link = { slug: generateSlug(), target, visits: 0 };
  store.put(link);
  return link;
}

export function resolve(store: LinkStore, slug: string): string | undefined {
  const link = store.get(slug);
  if (!link) return undefined;
  store.incrementVisits(slug);
  return link.target;
}
