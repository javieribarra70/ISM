import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Project } from "@shared/schema";
import { useProjects } from "@/hooks/use-projects";
import { 
  Home, 
  PanelLeft, 
  Users, 
  LogOut, 
  FolderKanban, 
  Plus,
  Settings,
  Info,
  BarChart2
} from "lucide-react";

export default function Sidebar() {
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("projects");
  const [projectRoles, setProjectRoles] = useState<Record<number, string>>({});
  
  // Uso del contexto global de proyectos
  const { projects, refreshProjects } = useProjects();
  
  // Detectar la pestaña activa basada en la URL y resetear cuando estamos fuera de admin
  useEffect(() => {
    // Si estamos en la página de admin, detectar la pestaña activa
    if (location.startsWith("/admin")) {
      const searchParams = new URLSearchParams(window.location.search);
      const tabParam = searchParams.get('tab');
      
      if (tabParam && ['projects', 'users', 'reports', 'settings'].includes(tabParam)) {
        setActiveTab(tabParam);
        console.log("Setting active tab from URL param:", tabParam);
      } else {
        setActiveTab("projects");
      }
    } else {
      // Si estamos en cualquier otra página, resetear la pestaña activa
      setActiveTab("");
      console.log("Resetting active tab, we're not in admin page");
    }
  }, [location]);

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
  
  // Solo refrescar proyectos cuando el usuario inicia sesión, no en cada cambio de ubicación
  useEffect(() => {
    if (user) {
      // Solo refrescar si es necesario, useProjects ya maneja la lógica de throttling
      refreshProjects();
      
      // Obtener los roles del usuario en los proyectos
      const fetchProjectRoles = async () => {
        const roles: Record<number, string> = {};
        
        if (projects && projects.length > 0) {
          for (const project of projects) {
            try {
              const response = await fetch(`/api/projects/${project.id}/users`, {
                credentials: 'include',
              });
              
              if (response.ok) {
                const projectUsers = await response.json();
                const currentUserInProject = projectUsers.find((pu: any) => pu.userId === user.id);
                if (currentUserInProject) {
                  roles[project.id] = currentUserInProject.role;
                }
              }
            } catch (error) {
              console.error(`Error fetching role for project ${project.id}:`, error);
            }
          }
          setProjectRoles(roles);
        }
      };
      
      fetchProjectRoles();
    }
  }, [user, refreshProjects, projects]); // Agregado 'projects' para actualizar roles cuando cambian los proyectos

  const isCurrentPath = (path: string) => {
    return location === path;
  };

  const isCurrentProject = (projectId: number) => {
    const result = location.startsWith(`/projects/${projectId}`);
    console.log(`Checking if ${location} starts with /projects/${projectId}: ${result}`);
    return result;
  };

  const handleLogout = async () => {
    try {
      console.log('Intentando cerrar sesión...');
      const response = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        console.log('Sesión cerrada correctamente, redirigiendo a /auth');
        window.location.href = '/auth';
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

  // Función para la navegación en el sidebar
  const handleSidebarNavigation = (tab: string) => {
    console.log("Navegando a la pestaña:", tab);
    setActiveTab(tab);
    
    // Usar window.location para asegurar recarga completa
    window.location.href = tab === "projects" 
      ? "/admin" 
      : `/admin?tab=${tab}`;
  };

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
                console.log("Navegando al dashboard");
                window.location.href = "/";
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
              <div key={project.id} className="space-y-1">
                <div
                  onClick={() => {
                    console.log(`Navegando al proyecto ${project.id}`);
                    window.location.href = `/projects/${project.id}`;
                    isMobile && setOpen(false);
                  }}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md truncate cursor-pointer",
                    location === `/projects/${project.id}`
                      ? "bg-primary-light text-primary" 
                      : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <FolderKanban className="h-5 w-5 mr-2 flex-shrink-0" />
                  <span className="truncate">{project.name}</span>
                </div>
                
                {/* Solo mostrar enlace de configuración para administradores del proyecto */}
                {(projectRoles[project.id] === "admin" || user?.role === "admin") && (
                  <div
                    onClick={() => {
                      console.log(`Navegando a la configuración del proyecto ${project.id}`);
                      window.location.href = `/projects/${project.id}/settings`;
                      isMobile && setOpen(false);
                    }}
                    className={cn(
                      "flex items-center px-3 py-2 ml-4 text-sm font-medium rounded-md truncate cursor-pointer",
                      location === `/projects/${project.id}/settings`
                        ? "bg-primary-light text-primary" 
                        : "text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    <Settings className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">Configuración</span>
                  </div>
                )}
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
                    handleSidebarNavigation("projects");
                    isMobile && setOpen(false);
                  }}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer",
                    activeTab === "projects"
                      ? "bg-primary-light text-primary" 
                      : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <FolderKanban className="h-5 w-5 mr-2" />
                  Admin Projects
                </div>
                <div
                  onClick={() => {
                    handleSidebarNavigation("users");
                    isMobile && setOpen(false);
                  }}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer",
                    activeTab === "users"
                      ? "bg-primary-light text-primary" 
                      : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <Users className="h-5 w-5 mr-2" />
                  Manage Users
                </div>
                <div
                  onClick={() => {
                    handleSidebarNavigation("reports");
                    isMobile && setOpen(false);
                  }}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer",
                    activeTab === "reports"
                      ? "bg-primary-light text-primary" 
                      : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <BarChart2 className="h-5 w-5 mr-2" />
                  Manage Reports
                </div>
                <div
                  onClick={() => {
                    handleSidebarNavigation("settings");
                    isMobile && setOpen(false);
                  }}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer",
                    activeTab === "settings"
                      ? "bg-primary-light text-primary" 
                      : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <Settings className="h-5 w-5 mr-2" />
                  System Settings
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