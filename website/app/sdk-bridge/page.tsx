// SDK iframe bridge: the TraceBug SDK on customer.com embeds this page as a
// hidden iframe. We hold Supabase cookies (tracebug.netlify.app origin) and
// proxy postMessage requests to the API on behalf of the SDK — so the customer
// site never sees the auth token.
//
// This is intentionally a tiny client component with no styling.

"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

// Origins the bridge will talk to. "*" during development; tighten before
// production launch (move to an env-driven allowlist).
const ALLOWED_PARENT_ORIGINS = "*";

type BridgeRequest =
  | { type: "check-auth"; requestId: string }
  | { type: "sign-in"; requestId: string }
  | { type: "sign-out"; requestId: string }
  | { type: "upload-init"; requestId: string; payload: any }
  | { type: "upload-blob"; requestId: string; storageKey: string; token: string; blob: Blob | ArrayBuffer; contentType: string }
  | { type: "upload-complete"; requestId: string; id: string }
  | { type: "get-quotas"; requestId: string };

export default function SdkBridgePage() {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    function reply(target: MessageEventSource | null, origin: string, requestId: string, data: unknown) {
      if (!target) return;
      const o = ALLOWED_PARENT_ORIGINS === "*" ? "*" : origin;
      (target as Window).postMessage({ requestId, data }, { targetOrigin: o });
    }

    async function handle(msg: BridgeRequest, source: MessageEventSource | null, origin: string) {
      switch (msg.type) {
        case "check-auth": {
          const { data: { user } } = await supabase.auth.getUser();
          reply(source, origin, msg.requestId, {
            authed: !!user,
            user: user ? { id: user.id, email: user.email } : null,
          });
          return;
        }
        case "sign-in": {
          // Open the auth page in a popup; parent waits for follow-up "check-auth".
          const w = window.open("/auth", "tracebug-auth", "width=420,height=560");
          reply(source, origin, msg.requestId, { popupOpened: !!w });
          return;
        }
        case "sign-out": {
          await supabase.auth.signOut();
          reply(source, origin, msg.requestId, { ok: true });
          return;
        }
        case "get-quotas": {
          const res = await fetch("/api/me", { credentials: "include" });
          if (!res.ok) {
            reply(source, origin, msg.requestId, { error: res.status });
            return;
          }
          reply(source, origin, msg.requestId, await res.json());
          return;
        }
        case "upload-init": {
          const res = await fetch("/api/upload/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(msg.payload),
          });
          const body = await res.json();
          reply(source, origin, msg.requestId, { status: res.status, body });
          return;
        }
        case "upload-blob": {
          // PUT the bytes directly to Supabase Storage using the signed-upload
          // token. Done from the iframe so the cookie origin is consistent.
          const { data, error } = await supabase.storage
            .from("reports")
            .uploadToSignedUrl(msg.storageKey, msg.token, msg.blob as Blob, {
              contentType: msg.contentType,
              upsert: false,
            });
          reply(source, origin, msg.requestId, error ? { error: error.message } : { ok: true, path: data?.path });
          return;
        }
        case "upload-complete": {
          const res = await fetch("/api/upload/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ id: msg.id }),
          });
          const body = await res.json();
          reply(source, origin, msg.requestId, { status: res.status, body });
          return;
        }
      }
    }

    function onMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== "object" || !("type" in e.data) || !("requestId" in e.data)) return;
      void handle(e.data as BridgeRequest, e.source, e.origin);
    }

    window.addEventListener("message", onMessage);

    // Broadcast auth-state changes to the parent so the SDK's signIn() can
    // resolve as soon as the magic-link callback fires in another tab.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (window.parent && window.parent !== window) {
        const authed = event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION";
        window.parent.postMessage(
          { type: "tracebug:auth-changed", authed, event },
          "*",
        );
      }
    });

    // Tell parent we're ready
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "tracebug:bridge-ready" }, "*");
    }
    return () => {
      window.removeEventListener("message", onMessage);
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
