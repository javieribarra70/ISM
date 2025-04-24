import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import ISMProcess from "@/components/ism/ism-process";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

// Definiendo tipos aquí mismo para evitar problemas de importación
interface Idea {
  id: number;
  title: string;
  description?: string;
  projectId: number;
  [key: string]: any;
}

interface Relationship {
  id: number;
  fromIdeaId?: number;
  toIdeaId?: number;
  from?: number;
  to?: number;
  relationType?: string;
  projectId?: number;
  [key: string]: any;
}

interface Project {
  id: number;
  name: string;
  description?: string;
  context?: string;
  triggeringQuestion?: string;
  relation?: string;
  restriction?: string;
  [key: string]: any;
}

// Tipo para los parámetros de la URL
type ISMProcessParams = {
  projectId: string;
};

export default function ISMProcessPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<ISMProcessParams>();
  const projectId = params?.projectId;
  
  // Estado para la clave de instancia ISM
  const [ismInstanceKey, setIsmInstanceKey] = useState<string>(`ism-process-${Date.now()}`);
  
  // Obtener ideas seleccionadas de la URL
  const searchParams = new URLSearchParams(window.location.search);
  const ideaIdsParam = searchParams.get('ideas');
  const selectedIdeaIds = ideaIdsParam ? ideaIdsParam.split(',').map(Number) : [];
  
  // Fetch project details
  const { data: project, isLoading: isProjectLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId
  });
  
  // Fetch all ideas
  const { data: ideas, isLoading: isIdeasLoading } = useQuery<Idea[]>({
    queryKey: [`/api/projects/${projectId}/ideas`],
    enabled: !!projectId
  });
  
  // Fetch all relationships
  const { data: relationships, isLoading: isRelationshipsLoading } = useQuery<Relationship[]>({
    queryKey: [`/api/projects/${projectId}/relationships`],
    enabled: !!projectId
  });
  
  // Filtrar ideas seleccionadas
  const selectedIdeas = ideas?.filter(idea => selectedIdeaIds.includes(idea.id)) || [];

  // Verificar si hay ideas seleccionadas
  useEffect(() => {
    if (!isIdeasLoading && selectedIdeas.length === 0) {
      console.error("No se especificaron ideas para el proceso ISM");
      setLocation(`/projects/${projectId}`);
    }
  }, [selectedIdeas, isIdeasLoading, projectId, setLocation]);
  
  // Loading state
  if (isProjectLoading || isIdeasLoading || isRelationshipsLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-opacity-50 border-t-primary rounded-full"></div>
      </div>
    );
  }
  
  // Prepare project context information for ISM process
  const projectContext = project ? {
    context: project.context || "No context has been defined for this project.",
    triggeringQuestion: project.triggeringQuestion || "No triggering question has been defined.",
    relation: project.relation || "No specific relationship has been defined.",
    restriction: project.restriction || "No restrictions have been defined."
  } : null;
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center gap-4 mb-6">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setLocation(`/projects/${projectId}`)}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al proyecto
        </Button>
        <h1 className="text-2xl font-bold">Proceso ISM</h1>
      </div>
      
      {/* En lugar de renderizar el componente ISM, mostramos una alternativa más simple */}
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
        <div className="text-center my-10">
          <h2 className="text-2xl font-bold mb-4">Proceso ISM para {selectedIdeas.length} ideas</h2>
          <p className="mb-6">Se encontraron {relationships?.length || 0} relaciones VAXO existentes.</p>
          
          <div className="mb-8">
            {selectedIdeas.map(idea => (
              <div key={idea.id} className="p-3 border rounded-md mb-2 text-left">
                <span className="font-semibold">#{idea.id}:</span> {idea.title}
              </div>
            ))}
          </div>
          
          <Button
            size="lg"
            onClick={() => setLocation(`/projects/${projectId}`)}
          >
            Volver a la pantalla principal
          </Button>
        </div>
      </div>
    </div>
  );
}