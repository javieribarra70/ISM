import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route, useLocation } from "wouter";
import { useEffect } from "react";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType<any>;
}

export function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  const { user, isLoading, refreshUser } = useAuth();
  const [location] = useLocation();
  
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

        // Para la ruta de admin, verificar que el usuario sea administrador
        if (location.startsWith('/admin') && user.role !== 'admin') {
          console.log('Acceso denegado: usuario no es administrador');
          return <Redirect to="/" />;
        }

        return <Component />;
      }}
    />
  );
}
