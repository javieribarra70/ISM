import { createContext, ReactNode, useContext, useState, useEffect, useCallback } from "react";
import { Project } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

type ProjectsContextType = {
  projects: Project[];
  refreshProjects: () => Promise<void>;
  isLoading: boolean;
  lastUpdated: Date | null;
};

const ProjectsContext = createContext<ProjectsContextType | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Usar React Query para las solicitudes (reducirá peticiones automáticamente)
  const { 
    data: projects = [], 
    isLoading,
    refetch,
    isError 
  } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    staleTime: 30000, // 30 segundos (reduce las solicitudes frecuentes)
    refetchInterval: 60000, // Actualizar cada minuto en segundo plano
    // Importante: asegurarse de que nunca devuelva undefined o null
    select: (data) => {
      // Siempre devolver un array para evitar errores cuando se accede a .length
      return Array.isArray(data) ? data : [];
    },
    // No retroceder a la página de inicio si no está autenticado
    retry: (failureCount, error) => {
      // No reintentar en caso de error 401 (no autenticado)
      if (error instanceof Error && error.message.includes('401')) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Optimizado refreshProjects para evitar actualizaciones innecesarias
  const refreshProjects = useCallback(async () => {
    // Si se actualizó hace menos de 5 segundos, no actualizar otra vez
    if (lastUpdated && (new Date().getTime() - lastUpdated.getTime() < 5000)) {
      return;
    }
    
    try {
      await refetch();
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error al refrescar proyectos:", error);
    }
  }, [refetch, lastUpdated]);

  // Solo ejecutar este efecto una vez al montar
  useEffect(() => {
    // Establecer lastUpdated inicial cuando los datos se carguen
    if (Array.isArray(projects) && projects.length > 0 && !lastUpdated) {
      setLastUpdated(new Date());
    }
  }, [projects, lastUpdated]);

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        refreshProjects,
        isLoading,
        lastUpdated
      }}
    >
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  
  if (!context) {
    throw new Error("useProjects must be used within a ProjectsProvider");
  }
  
  return context;
}