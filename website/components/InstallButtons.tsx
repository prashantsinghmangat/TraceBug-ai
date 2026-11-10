"use client";

import { useEffect, useState } from "react";
import { LINKS } from "@/lib/site";
import { Logo } from "@/components/ui/logos";

// Every store button on the site comes from here, so a Firefox visitor gets
// "Add to Firefox" as the filled button everywhere, not a Chrome link they
// can't use. Server render and first paint are Chrome-first (most visitors);
// the swap happens after hydration. User-agent sniffing is fine for this one
// cosmetic choice — both buttons stay visible either way.

export type Store = "chrome" | "firefox";

export function useVisitorStore(): Store {
  const [store, setStore] = useState<Store>("chrome");
  useEffect(() => {
    if (/firefox\//i.test(navigator.userAgent)) setStore("firefox");
  }, []);
  return store;
}

const LABEL: Record<Store, string> = {
  chrome: "Add to Chrome, free",
  firefox: "Add to Firefox, free",
};

const BTN =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-[background-color,transform] duration-150 active:scale-[0.98]";
const SIZE = { lg: "h-12 px-5 text-[15px]", sm: "h-9 rounded-lg px-4 text-[14px]" } as const;
const PRIMARY = "bg-cta text-on-cta hover:bg-cta/85";
const SECONDARY = "border border-border-strong bg-background text-text-primary hover:bg-surface";

// Both stores, the visitor's first and filled. Renders a fragment so the
// parent's grid/flex decides the layout. `itemClassName` goes on each button.
export default function InstallButtons({
  size = "lg",
  itemClassName = "",
}: {
  size?: keyof typeof SIZE;
  itemClassName?: string;
}) {
  const first = useVisitorStore();
  const order: Store[] = first === "firefox" ? ["firefox", "chrome"] : ["chrome", "firefox"];
  return (
    <>
      {order.map((store, i) => (
        <a
          key={store}
          href={LINKS[store]}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BTN} ${SIZE[size]} ${i === 0 ? PRIMARY : SECONDARY} ${itemClassName}`}
        >
          <Logo name={store} size={size === "lg" ? 18 : 16} />
          {i === 0 ? LABEL[store] : `Add to ${store === "chrome" ? "Chrome" : "Firefox"}`}
        </a>
      ))}
    </>
  );
}

// One button for tight spots (the navbar): the visitor's own store.
export function InstallButton({ className = "" }: { className?: string }) {
  const store = useVisitorStore();
  return (
    <a
      href={LINKS[store]}
      target="_blank"
      rel="noopener noreferrer"
      className={`${BTN} ${SIZE.sm} ${PRIMARY} ${className}`}
    >
      <Logo name={store} size={16} />
      {store === "chrome" ? "Add to Chrome" : "Add to Firefox"}
    </a>
  );
}
