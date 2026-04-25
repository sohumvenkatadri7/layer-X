import type http from "node:http";
import { handleHttpRequest } from "../server/index";

export default async function handler(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.url) {
    const parsed = new URL(req.url, "http://localhost");
    let pathname = parsed.pathname;

    if (pathname === "/api") {
      pathname = "/";
    } else if (pathname.startsWith("/api/")) {
      pathname = pathname.slice(4);
    }

    req.url = `${pathname}${parsed.search}`;
  }

  return handleHttpRequest(req, res);
}
