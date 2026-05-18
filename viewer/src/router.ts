/**
 * Plain hash router. URLs:
 *   #/                       Explore (filtered list)
 *   #/f/<findingId>          Single finding detail
 *   #/a/<artifactName>       Artifact dossier
 *
 * Filter state can be appended as ?key=val,val&q=…
 */

import { useEffect, useState } from "react";

export interface RouteState {
  path: string[];               // ["f", "<id>"] etc.
  params: URLSearchParams;
}

export function parseHash(hash: string): RouteState {
  const raw = hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart = ""] = raw.split("?");
  const path = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
  return { path, params: new URLSearchParams(queryPart) };
}

export function buildHref(path: (string | undefined)[], params?: URLSearchParams): string {
  const segs = path.filter((p): p is string => !!p).map(encodeURIComponent).join("/");
  const q = params && [...params.keys()].length > 0 ? `?${params.toString()}` : "";
  return `#/${segs}${q}`;
}

export function useRoute(): [RouteState, (next: RouteState | ((cur: RouteState) => RouteState), replace?: boolean) => void] {
  const [state, setState] = useState<RouteState>(() => parseHash(location.hash));
  useEffect(() => {
    const fn = () => setState(parseHash(location.hash));
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  const navigate = (next: RouteState | ((cur: RouteState) => RouteState), replace = false) => {
    const target = typeof next === "function" ? next(state) : next;
    const href = buildHref(target.path, target.params);
    if (href === location.hash) return;
    if (replace) history.replaceState(null, "", href);
    else location.hash = href;
    // hashchange will fire and update state
  };
  return [state, navigate];
}
