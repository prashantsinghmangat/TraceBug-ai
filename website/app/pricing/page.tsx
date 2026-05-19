import type { Metadata } from "next";
import PricingClient from "./PricingClient";

export const metadata: Metadata = {
  title: "Pricing — TraceBug",
  description:
    "Local bug capture and .html export are free forever. Pay only for cloud collaboration when your team needs it. No SaaS lock-in.",
};

export default function PricingPage() {
  return <PricingClient />;
}
