import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user data directly
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch('/api/user', {
          credentials: 'include',
        });
        
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          
          // Fetch projects once we have a user
          const projectsResponse = await fetch('/api/projects', {
            credentials: 'include',
          });
          
          if (projectsResponse.ok) {
            const projectsData = await projectsResponse.json();
            setProjects(projectsData);
          }
        } else if (response.status === 401) {
          // Redirect to login if not authenticated
          navigate('/auth');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUserData();
  }, [navigate]);

  const isCurrentPath = (path: string) => {
    return location === path;
  };

  const isCurrentProject = (projectId: number) => {
    return location.startsWith(`/project/${projectId}`);
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        navigate('/auth');
      }
    } catch (error) {
      console.error('Error logging out:', error);
    }
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
            <div 
              onClick={() => {
                navigate("/");
                isMobile && setOpen(false)
              }}
              className={cn(
                "flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer",
                isCurrentPath("/") 
                  ? "bg-primary-light text-primary" 
                  : "text-gray-700 hover:bg-gray-50"
              )}>
                <Home className="h-5 w-5 mr-2" />
                Dashboard
            </div>
          </div>

          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Projects
          </h3>
          
          {/* Projects List */}
          <div className="space-y-1 mb-4">
            {projects?.map(project => (
              <div
                key={project.id}
                onClick={() => {
                  navigate(`/project/${project.id}`);
                  isMobile && setOpen(false);
                }}
                className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md truncate cursor-pointer",
                  isCurrentProject(project.id) 
                    ? "bg-primary-light text-primary" 
                    : "text-gray-700 hover:bg-gray-50"
                )}
              >
                <FolderKanban className="h-5 w-5 mr-2 flex-shrink-0" />
                <span className="truncate">{project.name}</span>
              </div>
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
                <div
                  onClick={() => {
                    navigate("/admin");
                    isMobile && setOpen(false);
                  }}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer",
                    isCurrentPath("/admin") && !location.includes("?tab=") 
                      ? "bg-primary-light text-primary" 
                      : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <Settings className="h-5 w-5 mr-2" />
                  Admin Panel
                </div>
                <div
                  onClick={() => {
                    navigate("/admin?tab=projects");
                    isMobile && setOpen(false);
                  }}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer",
                    location.includes("?tab=projects")
                      ? "bg-primary-light text-primary" 
                      : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <FolderKanban className="h-5 w-5 mr-2" />
                  Admin Projects
                </div>
                <div
                  onClick={() => {
                    navigate("/admin?tab=users");
                    isMobile && setOpen(false);
                  }}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer",
                    location.includes("?tab=users")
                      ? "bg-primary-light text-primary" 
                      : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <Users className="h-5 w-5 mr-2" />
                  Manage Users
                </div>
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
