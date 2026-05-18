"use client";

import { useEffect } from "react";

export default function TraceBugInit() {
  useEffect(() => {
    import("tracebug-sdk").then(({ default: TraceBug }) => {
      TraceBug.init({
        projectId: "demo-project",
        enabled: "all",
        // Point at the local website dev server while testing cloud features.
        // In production this defaults to https://tracebug.netlify.app.
        cloudEndpoint: "http://localhost:3001",
      });
    });
  }, []);

  return null;
}
