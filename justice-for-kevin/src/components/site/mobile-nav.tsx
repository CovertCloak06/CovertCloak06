"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export function MobileNav({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector("a")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-charcoal-200 hover:bg-charcoal-800"
      >
        {open ? <X aria-hidden className="size-6" /> : <Menu aria-hidden className="size-6" />}
      </button>
      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          className="absolute inset-x-0 top-16 border-b border-charcoal-800 bg-charcoal-900 shadow-lg"
        >
          <nav aria-label="Mobile" className="flex flex-col p-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-4 py-3 text-base text-charcoal-100 hover:bg-charcoal-800"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
