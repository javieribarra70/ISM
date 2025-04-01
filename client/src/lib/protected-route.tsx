import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route, useLocation, useParams } from "wouter";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType<any>;
}

export function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  const { user, isLoading, refreshUser } = useAuth();
  const [location] = useLocation();
  const [isProjectAdmin, setIsProjectAdmin] = useState<boolean | null>(null);
  const [isCheckingProjectRole, setIsCheckingProjectRole] = useState(false);
  
  // Extraer el projectId de la URL si estamos en una página de proyecto
  const pathMatch = location.match(/\/projects\/(\d+)\/settings/);
  const projectIdFromUrl = pathMatch ? pathMatch[1] : null;
  
  // Refrescar los datos del usuario cuando se monta el componente
  useEffect(() => {
    // Refrescar los datos del usuario solo si parece que hay un usuario
    if (user) {
      console.log("ProtectedRoute: Refrescando datos del usuario...");
      refreshUser().catch(err => {
        console.error("Error al refrescar datos del usuario:", err);
      });
    }
  }, [refreshUser, location, user]);
  
  // Verificar si el usuario es administrador del proyecto específico
  useEffect(() => {
    const checkProjectAdmin = async () => {
      if (user && projectIdFromUrl && !isCheckingProjectRole) {
        try {
          setIsCheckingProjectRole(true);
          
          // Si el usuario es admin global, tiene acceso a todos los proyectos
          if (user.role === 'admin') {
            setIsProjectAdmin(true);
            return;
          }
          
          // Buscar si el usuario tiene permisos de administrador en este proyecto
          const response = await apiRequest(
            "GET",
            `/api/projects/${projectIdFromUrl}/users`,
          );
          
          if (response.ok) {
            const projectUsers = await response.json();
            const userProjectRole = projectUsers.find((pu: any) => pu.userId === user.id)?.role;
            setIsProjectAdmin(userProjectRole === 'admin');
          } else {
            console.error('Error al verificar permisos del proyecto');
            setIsProjectAdmin(false);
          }
        } catch (error) {
          console.error('Error al verificar permisos:', error);
          setIsProjectAdmin(false);
        } finally {
          setIsCheckingProjectRole(false);
        }
      }
    };
    
    checkProjectAdmin();
  }, [user, projectIdFromUrl, isCheckingProjectRole]);

  return (
    <Route
      path={path}
      component={() => {
        if (isLoading) {
          return (
            <div className="flex items-center justify-center min-h-screen bg-background">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          );
        }

        if (!user) {
          return <Redirect to="/auth" />;
        }

        // Para la ruta de admin, verificar que el usuario sea administrador global
        if (location.startsWith('/admin') && user.role !== 'admin') {
          console.log('Acceso denegado: usuario no es administrador global');
          return <Redirect to="/" />;
        }
        
        // Para la página de configuración del proyecto, verificar que el usuario sea admin del proyecto
        if (projectIdFromUrl) {
          if (isCheckingProjectRole || isProjectAdmin === null) {
            return (
              <div className="flex items-center justify-center min-h-screen bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            );
          }
          
          if (!isProjectAdmin) {
            console.log('Acceso denegado: usuario no es administrador del proyecto');
            return <Redirect to={`/projects/${projectIdFromUrl}`} />;
          }
        }

        return <Component />;
      }}
    />
  );
}
