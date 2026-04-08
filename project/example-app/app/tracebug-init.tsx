"use client";

import { useEffect } from "react";

export default function TraceBugInit() {
  useEffect(() => {
    import("tracebug-sdk").then(({ default: TraceBug }) => {
      TraceBug.init({ projectId: "demo-project", enabled: "all" });
    });
  }, []);

  return null;
}
