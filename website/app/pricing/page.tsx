import type { Metadata } from "next";
import PricingClient from "./PricingClient";
import { social } from "@/lib/social";

export const metadata: Metadata = {
  title: "Pricing — TraceBug (Free for Local Capture)",
  description:
    "TraceBug is free: local bug capture, offline .html exports, and the MCP integration for AI agents cost nothing. Optional cloud features may come later — local capture and export will remain free.",
  alternates: { canonical: "/pricing" },
  ...social("TraceBug pricing: free for local capture", "Local bug capture, offline .html exports and the MCP integration for AI agents are free. Any change to what is free is announced first.", { url: "https://tracebug.dev/pricing" }),
};

export default function PricingPage() {
  return <PricingClient />;
}
