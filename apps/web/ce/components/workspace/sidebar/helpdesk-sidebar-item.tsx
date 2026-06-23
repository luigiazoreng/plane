/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, ChevronRight, Headset, Settings, Ticket, Users } from "lucide-react";
import { cn } from "@plane/utils";
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
import { useAppTheme } from "@/hooks/store/use-app-theme";

const SUB_ITEMS = [
  { key: "tickets", label: "Tickets", href: "/helpdesk", Icon: Ticket },
  { key: "analytics", label: "Analytics", href: "/helpdesk/analytics", Icon: BarChart2 },
  { key: "settings", label: "Settings", href: "/helpdesk/settings", Icon: Settings },
  { key: "users", label: "Users", href: "/helpdesk/customers", Icon: Users },
] as const;

const STORAGE_KEY = "helpdesk_sidebar_open";

type Props = {
  workspaceSlug: string;
};

export function HelpdeskSidebarItem({ workspaceSlug }: Props) {
  const pathname = usePathname();
  const { toggleSidebar, isExtendedSidebarOpened, toggleExtendedSidebar } = useAppTheme();

  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? pathname.includes("/helpdesk") : stored === "true";
  });

  // Auto-open when navigating into helpdesk
  useEffect(() => {
    if (pathname.includes("/helpdesk") && !isOpen) {
      setIsOpen(true);
      localStorage.setItem(STORAGE_KEY, "true");
    }
  }, [pathname, isOpen]);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  const handleLinkClick = () => {
    if (window.innerWidth < 768) toggleSidebar();
    if (isExtendedSidebarOpened) toggleExtendedSidebar(false);
  };

  const isHelpdeskActive = pathname.includes(`/${workspaceSlug}/helpdesk`);

  return (
    <div>
      <button type="button" className="w-full" onClick={handleToggle}>
        <SidebarNavItem isActive={isHelpdeskActive && !isOpen}>
          <div className="flex items-center gap-1.5 py-px">
            <Headset className="size-4 shrink-0" />
            <p className="text-13 leading-5 font-medium">Helpdesk</p>
          </div>
          <ChevronRight
            className={cn("size-3 shrink-0 text-tertiary transition-transform duration-150", {
              "rotate-90": isOpen,
            })}
          />
        </SidebarNavItem>
      </button>

      {isOpen && (
        <div className="mt-0.5 flex flex-col gap-0.5 pl-7">
          {SUB_ITEMS.map(({ key, label, href, Icon }) => {
            const fullHref = `/${workspaceSlug}${href}`;
            const isActive =
              key === "tickets"
                ? // "Tickets" only active on exact /helpdesk (not sub-routes)
                  pathname === fullHref
                : pathname.startsWith(fullHref);
            return (
              <Link key={key} href={fullHref} onClick={handleLinkClick}>
                <SidebarNavItem isActive={isActive}>
                  <div className="flex items-center gap-1.5 py-px">
                    <Icon className="size-3.5 shrink-0" />
                    <p className="text-13 leading-5 font-medium">{label}</p>
                  </div>
                </SidebarNavItem>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
