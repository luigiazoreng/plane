/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef } from "react";
import Link from "next/link";
import { cn } from "@plane/utils";

// ============================================================================
// TYPES
// ============================================================================

interface AppSidebarItemData {
  href?: string;
  label?: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  showLabel?: boolean;
}

interface AppSidebarItemProps {
  variant?: "link" | "button";
  item?: AppSidebarItemData;
  renderAs?: "button" | "div";
}

interface AppSidebarItemLabelProps {
  highlight?: boolean;
  label?: string;
}

interface AppSidebarItemIconProps {
  icon?: React.ReactNode;
  highlight?: boolean;
}

interface AppSidebarLinkItemProps {
  href?: string;
  children: React.ReactNode;
  className?: string;
}

interface AppSidebarButtonItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  renderAs?: "button" | "div";
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  base: "group flex flex-col gap-0.5 items-center justify-center text-tertiary",
  icon: "flex items-center justify-center gap-2 size-8 rounded-md text-tertiary",
  iconActive: "bg-layer-transparent-selected text-secondary !text-icon-primary",
  iconInactive: "group-hover:text-icon-secondary group-hover:bg-layer-transparent-hover !text-icon-tertiary",
  label: "text-11 font-medium",
  labelActive: "text-secondary",
  labelInactive: "group-hover:text-secondary text-tertiary",
} as const;

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function AppSidebarItemLabel({ highlight = false, label }: AppSidebarItemLabelProps) {
  if (!label) return null;

  return (
    <span
      className={cn(styles.label, {
        [styles.labelActive]: highlight,
        [styles.labelInactive]: !highlight,
      })}
    >
      {label}
    </span>
  );
}

function AppSidebarItemIcon({ icon, highlight }: AppSidebarItemIconProps) {
  if (!icon) return null;

  return (
    <div
      className={cn(styles.icon, {
        [styles.iconActive]: highlight,
        [styles.iconInactive]: !highlight,
      })}
    >
      {icon}
    </div>
  );
}

const AppSidebarLinkItem = forwardRef<HTMLAnchorElement, AppSidebarLinkItemProps>(function AppSidebarLinkItem(
  { href, children, className },
  ref
) {
  if (!href) return null;

  return (
    <Link ref={ref} href={href} className={cn(styles.base, className)}>
      {children}
    </Link>
  );
});

const AppSidebarButtonItem = forwardRef<HTMLButtonElement | HTMLDivElement, AppSidebarButtonItemProps>(
  function AppSidebarButtonItem({ children, onClick, disabled = false, className, renderAs = "button" }, ref) {
    if (renderAs === "div") {
      return (
        <div ref={ref as React.Ref<HTMLDivElement>} className={cn(styles.base, className)}>
          {children}
        </div>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        className={cn(styles.base, className)}
        onClick={onClick}
        disabled={disabled}
        type="button"
      >
        {children}
      </button>
    );
  }
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export type AppSidebarItemComponent = React.FC<AppSidebarItemProps> & {
  Label: React.FC<AppSidebarItemLabelProps>;
  Icon: React.FC<AppSidebarItemIconProps>;
  Link: typeof AppSidebarLinkItem;
  Button: typeof AppSidebarButtonItem;
};

const AppSidebarItemBase = forwardRef<HTMLAnchorElement | HTMLButtonElement | HTMLDivElement, AppSidebarItemProps>(
  function AppSidebarItem({ variant = "link", item, renderAs = "button" }, ref) {
    if (!item) return null;

    const { icon, isActive, label, href, onClick, disabled, showLabel = true } = item;

    const commonItems = (
      <>
        <AppSidebarItemIcon icon={icon} highlight={isActive} />
        {showLabel && <AppSidebarItemLabel highlight={isActive} label={label} />}
      </>
    );

    if (variant === "link") {
      return (
        <AppSidebarLinkItem ref={ref as React.Ref<HTMLAnchorElement>} href={href}>
          {commonItems}
        </AppSidebarLinkItem>
      );
    }

    return (
      <AppSidebarButtonItem
        ref={ref as React.Ref<HTMLButtonElement | HTMLDivElement>}
        onClick={onClick}
        disabled={disabled}
        renderAs={renderAs}
      >
        {commonItems}
      </AppSidebarButtonItem>
    );
  }
);

const AppSidebarItem = AppSidebarItemBase as unknown as AppSidebarItemComponent;

// ============================================================================
// COMPOUND COMPONENT ASSIGNMENT
// ============================================================================

AppSidebarItem.Label = AppSidebarItemLabel;
AppSidebarItem.Icon = AppSidebarItemIcon;
AppSidebarItem.Link = AppSidebarLinkItem;
AppSidebarItem.Button = AppSidebarButtonItem;

export { AppSidebarItem };
export type { AppSidebarItemData, AppSidebarItemProps };
