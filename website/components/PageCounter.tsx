"use client";

// Cookieless page-view counter for tracebug.dev (GoatCounter), disclosed on
// /privacy. The website only: the extension, the SDK and exported reports
// never load it (ADR 001/002).
//
// Off unless NEXT_PUBLIC_GOATCOUNTER_CODE is set (e.g. "tracebug" for
// https://tracebug.goatcounter.com), so local dev and forks count nothing.
//
// count.js always sends location.search with a hit (that is how it reads
// ?ref= and utm_* tags), so pages whose URL can carry a token or a personal
// value are never counted, and the script isn't even loaded there.

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const RAW_CODE = (process.env.NEXT_PUBLIC_GOATCOUNTER_CODE || "").trim().toLowerCase();
const CODE = /^[a-z0-9-]{2,50}$/.test(RAW_CODE) ? RAW_CODE : "";

// Version-pinned script with its SRI hash (from gc.zgo.at, 2026-11-17).
// Upgrading: download the new count.vN.js, recompute
// `openssl dgst -sha384 -binary count.vN.js | openssl base64 -A`, update both.
const SCRIPT_SRC = "https://gc.zgo.at/count.v4.js";
const SCRIPT_SRI = "sha384-nRw6qfbWyJha9LhsOtSb2YJDyZdKvvCFh0fJYlkquSFjUxp9FVNugbfy8q1jdxI+";

// Token-bearing or form pages: email confirm/unsubscribe, sign-in, shared
// reports, the dashboard, the SDK iframe bridge, and the two forms that
// promise "nothing else collected".
const NOT_COUNTED = ["/api", "/auth", "/email", "/share", "/dashboard", "/sdk-bridge", "/feedback", "/bye"];

export function isCounted(path: string): boolean {
  return !NOT_COUNTED.some((p) => path === p || path.startsWith(p + "/"));
}

type GoatCounter = { count?: (vars: { path: string; referrer?: string }) => void };

export default function PageCounter() {
  const pathname = usePathname() || "/";
  const [loaded, setLoaded] = useState(false);
  const counted = useRef(0);
  const counting = CODE !== "" && isCounted(pathname);

  useEffect(() => {
    if (!counting || !loaded) return;
    const gc = (window as unknown as { goatcounter?: GoatCounter }).goatcounter;
    if (!gc?.count) return;
    // Path only: never the query string or a canonical URL. After the first
    // view, client-side navigations would otherwise repeat the external
    // referrer (document.referrer doesn't change), so they send none.
    gc.count(counted.current === 0 ? { path: pathname } : { path: pathname, referrer: "" });
    counted.current += 1;
  }, [counting, loaded, pathname]);

  if (!counting && !loaded) return null;
  return (
    <Script
      src={SCRIPT_SRC}
      integrity={SCRIPT_SRI}
      crossOrigin="anonymous"
      strategy="afterInteractive"
      data-goatcounter={`https://${CODE}.goatcounter.com/count`}
      data-goatcounter-settings='{"no_onload": true, "no_events": true}'
      onLoad={() => setLoaded(true)}
    />
  );
}
