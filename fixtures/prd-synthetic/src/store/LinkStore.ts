export interface Link {
  slug: string;
  target: string;
  visits: number;
}

export interface LinkStore {
  put(link: Link): void;
  get(slug: string): Link | undefined;
  incrementVisits(slug: string): void;
}

export class InMemoryLinkStore implements LinkStore {
  private links = new Map<string, Link>();
  put(link: Link): void {
    this.links.set(link.slug, link);
  }
  get(slug: string): Link | undefined {
    return this.links.get(slug);
  }
  incrementVisits(slug: string): void {
    const link = this.links.get(slug);
    if (link) link.visits += 1;
  }
}
