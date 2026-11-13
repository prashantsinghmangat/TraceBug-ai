// Result text for /email, shared by the server page (no-JS fallback) and EmailAction.

export type Result = { title: string; body: string };

export const RESULTS: Record<string, Result> = {
  confirmed: {
    title: "You're confirmed",
    body: "You'll get at most one email a month about new TraceBug features and early access. Every email has a one-click unsubscribe link.",
  },
  unsubscribed: {
    title: "You're unsubscribed",
    body: "TraceBug won't email this address again. Changed your mind? You can sign up again anytime from the extension or this site.",
  },
  invalid: { title: "That link doesn't work", body: "It may have been cut off when it was copied. Try clicking it straight from the email." },
  error: { title: "Something went wrong on our side", body: "Nothing was changed. Please try again in a minute." },
};
