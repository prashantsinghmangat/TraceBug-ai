"use client";

import { useEffect, useState } from "react";
import { RESULTS } from "./messages";

// The one-click step on /email. With JavaScript, the button posts in place and the
// card turns into the result (no second page); a confirm then goes on to tracebug.dev.
// Without JavaScript the plain form still posts and /api/* redirects to /email?s=….
// Opening the link alone never acts (mail scanners open links), only this click.

export const REDIRECT_AFTER_MS = 3500;

/** After a confirm, go on to the home page. */
export function GoHome() {
  useEffect(() => {
    const t = setTimeout(() => window.location.assign("/"), REDIRECT_AFTER_MS);
    return () => clearTimeout(t);
  }, []);
  return <p className="mt-4 text-sm text-text-muted">Taking you to tracebug.dev…</p>;
}

export default function EmailAction(props: {
  title: string; body: string; action: string; button: string; token: string; page?: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  const result = RESULTS[state];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch(props.action, { method: "POST", body: new FormData(e.currentTarget) });
      setState(new URL(res.url).searchParams.get("s") || "error");
    } catch {
      setState("error");
    }
  }

  if (result) {
    return (
      <>
        <h1 className="text-lg font-semibold text-text-primary mb-2">{result.title}</h1>
        <p className="text-sm text-text-muted leading-relaxed">{result.body}</p>
        {state === "confirmed" && <GoHome />}
      </>
    );
  }
  return (
    <>
      <h1 className="text-lg font-semibold text-text-primary mb-2">{props.title}</h1>
      <p className="text-sm text-text-muted leading-relaxed">{props.body}</p>
      <form method="post" action={props.action} onSubmit={submit} className="mt-5">
        <input type="hidden" name="token" value={props.token} />
        {props.page && <input type="hidden" name="from" value="page" />}
        <button
          type="submit"
          disabled={state === "busy"}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-60"
        >
          {state === "busy" ? "One moment…" : props.button}
        </button>
      </form>
    </>
  );
}
