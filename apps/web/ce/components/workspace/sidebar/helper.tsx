/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {
  AnalyticsIcon,
  ArchiveIcon,
  CycleIcon,
  DraftIcon,
  HomeIcon,
  InboxIcon,
  MultipleStickyIcon,
  ProjectIcon,
  ViewsIcon,
  YourWorkIcon,
} from "@plane/propel/icons";
import { cn } from "@plane/utils";
import { Gauge, Headset, LayoutDashboard } from "lucide-react";

export const getSidebarNavigationItemIcon = (key: string, className: string = "") => {
  switch (key) {
    case "home":
      return <HomeIcon className={cn("size-4 shrink-0", className)} />;
    case "inbox":
      return <InboxIcon className={cn("size-4 shrink-0", className)} />;
    case "projects":
      return <ProjectIcon className={cn("size-4 shrink-0", className)} />;
    case "views":
      return <ViewsIcon className={cn("size-4 shrink-0", className)} />;
    case "active_cycles":
      return <CycleIcon className={cn("size-4 shrink-0", className)} />;
    case "analytics":
      return <AnalyticsIcon className={cn("size-4 shrink-0", className)} />;
    case "your_work":
      return <YourWorkIcon className={cn("size-4 shrink-0", className)} />;
    case "drafts":
      return <DraftIcon className={cn("size-4 shrink-0", className)} />;
    case "archives":
      return <ArchiveIcon className={cn("size-4 shrink-0", className)} />;
    case "stickies":
      return <MultipleStickyIcon className={cn("size-4 shrink-0", className)} />;
    case "helpdesk":
      return <Headset className={cn("size-4 shrink-0", className)} />;
    case "kpi":
      return <Gauge className={cn("size-4 shrink-0", className)} />;
    case "executive":
      return <LayoutDashboard className={cn("size-4 shrink-0", className)} />;
  }
};
