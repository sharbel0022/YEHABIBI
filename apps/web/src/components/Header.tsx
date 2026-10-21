"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Phone, X } from "lucide-react";
import { useRef } from "react";
import { phoneHref } from "@yehabibi/shared";
import { Brand } from "@/components/Brand";
import { keepDialogFocus } from "@/components/hospitality/dialog-focus";

const links = [
  ["/", "Hem"],
  ["/catering", "Catering"],
  ["/festlokal", "Festlokaler"],
  ["/om-oss", "Om oss"],
  ["/kontakt", "Kontakt"],
];
export function Header({ phone }: { phone: string }) {
  const path = usePathname();
  const isHome = path === "/";
  const dialog = useRef<HTMLDialogElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const current = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);
  const call = phoneHref(phone);
  return (
    <header className="header" data-home={isHome || undefined}>
      <div className="header-inner">
        <Brand signature={isHome} />
        <nav className="primary-nav" aria-label="Huvudmeny">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={current(href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        {call && (
          <a
            href={call}
            className="btn btn-primary header-cta"
            aria-label={`Ring oss på ${phone}`}
          >
            <Phone size={16} aria-hidden="true" />
            <span>Ring oss</span>
          </a>
        )}
        <button
          ref={toggle}
          type="button"
          className="nav-toggle"
          aria-haspopup="dialog"
          aria-controls="mobile-navigation"
          aria-label="Öppna meny"
          onClick={() => dialog.current?.showModal()}
        >
          <Menu />
        </button>
        <dialog
          ref={dialog}
          id="mobile-navigation"
          className="mobile-navigation"
          aria-label="Huvudmeny"
          onKeyDown={keepDialogFocus}
          onClose={() => toggle.current?.focus()}
        >
          <div className="mobile-navigation-top">
            <Brand signature={isHome} onNavigate={() => dialog.current?.close()} />
            <button
              type="button"
              className="icon-button"
              aria-label="Stäng meny"
              onClick={() => dialog.current?.close()}
            >
              <X />
            </button>
          </div>
          <nav aria-label="Mobilmeny">
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={current(href) ? "page" : undefined}
                onClick={() => dialog.current?.close()}
              >
                {label}
              </Link>
            ))}
          </nav>
          {call && (
            <a href={call} className="btn btn-primary">
              <Phone size={17} aria-hidden="true" />
              Ring {phone}
            </a>
          )}
        </dialog>
      </div>
    </header>
  );
}
