import {
  Bot,
  CalendarDays,
  LayoutDashboard,
  Phone,
  Plug,
  Settings,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/services", label: "Services & hours", icon: Settings },
  { href: "/agent", label: "AI agent", icon: Bot },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/team", label: "Team", icon: UsersRound },
];
