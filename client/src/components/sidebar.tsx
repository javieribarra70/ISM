import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Project } from "@shared/schema";
import { 
  Home, 
  PanelLeft, 
  Users, 
  LogOut, 
  FolderKanban, 
  Plus,
  Settings,
  Info
} from "lucide-react";

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [open, setOpen] = useState(false);

  // Fetch user's projects for the sidebar
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: undefined,
  });

  const isCurrentPath = (path: string) => {
    return location === path;
  };

  const isCurrentProject = (projectId: number) => {
    return location.startsWith(`/project/${projectId}`);
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const MobileSidebar = () => (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <PanelLeft className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-64">
        <SidebarContent isMobile />
      </SheetContent>
    </Sheet>
  );

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="h-full border-r border-border bg-white flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-white font-bold">ISM</div>
          <span className="ml-2 text-lg font-semibold">ISM Platform</span>
        </div>
      </div>
      
      {/* User Profile */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center text-primary font-medium">
            {user?.username?.substring(0, 2).toUpperCase()}
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium">{user?.username}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="mb-4">
            <Link href="/" onClick={() => isMobile && setOpen(false)}>
              <a className={cn(
                "flex items-center px-3 py-2 text-sm font-medium rounded-md",
                isCurrentPath("/") 
                  ? "bg-primary-light text-primary" 
                  : "text-gray-700 hover:bg-gray-50"
              )}>
                <Home className="h-5 w-5 mr-2" />
                Dashboard
              </a>
            </Link>
          </div>

          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Projects
          </h3>
          
          {/* Projects List */}
          <div className="space-y-1 mb-4">
            {projects?.map(project => (
              <Link 
                key={project.id} 
                href={`/project/${project.id}`}
                onClick={() => isMobile && setOpen(false)}
              >
                <a className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md truncate",
                  isCurrentProject(project.id) 
                    ? "bg-primary-light text-primary" 
                    : "text-gray-700 hover:bg-gray-50"
                )}>
                  <FolderKanban className="h-5 w-5 mr-2 flex-shrink-0" />
                  <span className="truncate">{project.name}</span>
                </a>
              </Link>
            ))}
            
            {(!projects || projects.length === 0) && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No projects yet
              </div>
            )}
          </div>
          
          {/* Admin Section (only for admins) */}
          {user?.role === "admin" && (
            <>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Administration
              </h3>
              
              <div className="space-y-1">
                <Link href="/admin" onClick={() => isMobile && setOpen(false)}>
                  <a className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md",
                    isCurrentPath("/admin") 
                      ? "bg-primary-light text-primary" 
                      : "text-gray-700 hover:bg-gray-50"
                  )}>
                    <Settings className="h-5 w-5 mr-2" />
                    Admin Panel
                  </a>
                </Link>
                <Link href="/admin?tab=users" onClick={() => isMobile && setOpen(false)}>
                  <a className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-50">
                    <Users className="h-5 w-5 mr-2" />
                    Manage Users
                  </a>
                </Link>
              </div>
            </>
          )}
        </div>
      </nav>
      
      {/* Bottom actions */}
      <div className="p-4 border-t border-border">
        <Button 
          variant="outline" 
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5 mr-2" />
          Sign Out
        </Button>
        
        <div className="mt-4 text-xs text-center text-muted-foreground">
          <p>ISM Platform v1.0</p>
          <p className="flex items-center justify-center mt-1">
            <Info className="h-3 w-3 mr-1" />
            Help & Support
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <MobileSidebar />
      <div className="hidden md:block w-64 flex-shrink-0">
        <SidebarContent />
      </div>
    </>
  );
}
