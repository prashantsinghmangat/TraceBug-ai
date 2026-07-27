import type { Metadata } from "next";
import PricingClient from "./PricingClient";

export const metadata: Metadata = {
  title: "Pricing — TraceBug (Free for Local Capture)",
  description:
    "TraceBug is free: local bug capture, offline .html exports, and the MCP integration for AI agents cost nothing. Optional cloud features may come later — local capture and export will remain free.",
};

export default function PricingPage() {
  return <PricingClient />;
}
