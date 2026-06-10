import http from "node:http";
import { InMemoryLinkStore } from "../store/LinkStore.js";
import { mint, resolve } from "../links/links.js";

const store = new InMemoryLinkStore();

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/mint") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { target } = JSON.parse(body || "{}");
        const link = mint(store, target);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ slug: link.slug }));
      });
      return;
    }
    if (req.method === "GET" && req.url?.startsWith("/r/")) {
      const slug = req.url.slice(3);
      const target = resolve(store, slug);
      if (!target) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(302, { location: target });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });
}
