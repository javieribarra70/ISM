import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import { Project } from "@shared/schema";

type ProjectsContextType = {
  projects: Project[];
  refreshProjects: () => Promise<void>;
  isLoading: boolean;
};

const ProjectsContext = createContext<ProjectsContextType | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      console.log("Fetching projects from context...");
      const response = await fetch('/api/projects', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("Received projects from API in context:", data);
        setProjects(data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        refreshProjects: fetchProjects,
        isLoading
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