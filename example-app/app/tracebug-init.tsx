"use client";

import { useEffect } from "react";

export default function TraceBugInit() {
  useEffect(() => {
    import("tracebug-sdk").then(({ default: TraceBug }) => {
      // cloudEndpoint resolution order:
      //   1. NEXT_PUBLIC_TRACEBUG_CLOUD env var (set this in .env.local for
      //      local dev — typically http://localhost:3001)
      //   2. Production default — tracebug.netlify.app
      // The previous hardcoded localhost broke any non-localhost deploy.
      const cloudEndpoint =
        process.env.NEXT_PUBLIC_TRACEBUG_CLOUD || "https://tracebug.netlify.app";
      TraceBug.init({
        projectId: "demo-project",
        enabled: "all",
        cloudEndpoint,
      });
    });
  }, []);

  return null;
}
