// frontend/components/nav-sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { logout as authLogout } from "@/lib/auth";

interface NavItem {
  href: string;
  label: string;
}

interface NavSidebarProps {
  items: NavItem[];
  title: string;
}

export function NavSidebar({ items, title }: NavSidebarProps) {
  const pathname = usePathname();

  function logout() {
    void authLogout();
  }

  return (
    <nav
      className="flex h-full w-56 flex-col border-r bg-card px-4 py-6"
      aria-label={`Navigation ${title}`}
    >
      <p className="mb-6 px-2 text-lg font-semibold tracking-tight">{title}</p>
      <ul className="flex flex-col gap-1" role="list">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto">
        <Separator className="mb-4" />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={logout}
        >
          Déconnexion
        </Button>
      </div>
    </nav>
  );
}
