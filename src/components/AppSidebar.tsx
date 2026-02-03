import { useLocation, useNavigate } from 'react-router-dom';
import { Target, Building2, Users, Settings, Rocket } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const navItems = [
  { title: 'Campaigns', url: '/campaigns', icon: Target },
  { title: 'Companies', url: '/companies', icon: Building2 },
  { title: 'Contacts', url: '/contacts', icon: Users },
  { title: 'Settings', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAppStore();

  const isActive = (url: string) => {
    if (url === '/campaigns') {
      return location.pathname.startsWith('/campaigns') || 
             location.pathname === '/add-companies' ||
             location.pathname === '/research';
    }
    if (url === '/companies') {
      return location.pathname === '/companies' || location.pathname === '/company-preview';
    }
    if (url === '/contacts') {
      return location.pathname === '/contacts' || location.pathname === '/results';
    }
    return location.pathname === url;
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  return (
    <Sidebar className="border-r border-border bg-background">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-semibold text-foreground">Engagetech</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    className={cn(
                      'w-full h-10 px-3 rounded-lg transition-colors',
                      isActive(item.url)
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="w-5 h-5 mr-3" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <Avatar className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600">
            <AvatarFallback className="bg-transparent text-white font-medium">
              {getInitials(user?.name, user?.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 text-left overflow-hidden">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.name || 'User'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email || 'user@example.com'}
            </p>
          </div>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
