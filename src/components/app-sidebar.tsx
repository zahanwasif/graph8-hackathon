'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { Blocks, LayoutDashboard, Settings } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { APP_MARK, APP_NAME } from '@/lib/app-config';
import { clerkSidebarAppearance } from '@/lib/clerk-appearance';

const navItems = [
  {
    title: 'Home',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Integrations',
    href: '/integrations',
    icon: Blocks,
  },
  {
    title: 'Workspace settings',
    href: '/workspace-settings',
    icon: Settings,
  },
];

/** `/` would prefix-match every route, so Home is only active on itself. */
function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <span className="text-sm font-semibold">{APP_MARK}</span>
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{APP_NAME}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive(pathname, item.href)}
                    tooltip={item.title}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggle className="group-data-[collapsible=icon]:hidden" />
        <UserButton
          showName
          appearance={{
            ...clerkSidebarAppearance,
            elements: {
              rootBox: '!w-full',
              userButtonTrigger: '!w-full',
              userButtonBox:
                '!flex !flex-row-reverse !justify-end !w-full !items-center !gap-2 !px-2 !py-1 !bg-sidebar-accent !rounded-lg',
            },
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
