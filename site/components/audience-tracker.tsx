"use client";

import { useEffect } from "react";

export function AudienceTracker() {
  useEffect(() => {
    void fetch("/api/audience", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { Accept: "application/json" },
    });
  }, []);

  return null;
}
