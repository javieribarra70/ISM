import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Idea, SelectedIdea, Project } from "@shared/schema";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PlayCircle, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import ISMProcess from "@/components/ism/ism-process";

// Interface for ProjectUser
interface ProjectUser {
  id: number;
  projectId: number;
  userId: number;
  role: string;
}

interface ConnectionTabProps {
  projectId: number;
}

export default function ConnectionTab({ projectId }: ConnectionTabProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isStarting, setIsStarting] = useState(false);
  const [isISMDialogOpen, setIsISMDialogOpen] = useState(false);
  const [ismInstanceKey, setIsmInstanceKey] = useState<string>("");
  const [isStartingAlternative, setIsStartingAlternative] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Fetch project users to determine user role
  const {
    data: projectUsers = [],
    isLoading: isProjectUsersLoading
  } = useQuery<ProjectUser[]>({
    queryKey: [`/api/projects/${projectId}/users`],
    enabled: !!projectId && !!user,
  });

  // Determine if the current user is an admin (global or project)
  useEffect(() => {
    if (user && projectUsers) {
      // Global admin check
      if (user.role === "admin") {
        setIsAdmin(true);
        return;
      }
      
      // Project admin check
      const userProjectRole = projectUsers.find(pu => pu.userId === user.id)?.role;
      setIsAdmin(userProjectRole === "admin");
    }
  }, [user, projectUsers]);

  // Fetch project details to get context information
  const {
    data: project,
    isLoading: isProjectLoading
  } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId
  });

  // Fetch all project ideas
  const { 
    data: ideas = [], 
    isLoading: isIdeasLoading,
    isError: isIdeasError
  } = useQuery<Idea[]>({
    queryKey: [`/api/projects/${projectId}/ideas`],
    enabled: !!projectId,
  });
  
  // Fetch selected ideas for connection process
  const {
    data: selectedIdeasData = [],
    isLoading: isSelectedIdeasLoading,
    isError: isSelectedIdeasError
  } = useQuery<SelectedIdea[]>({
    queryKey: [`/api/projects/${projectId}/selected-ideas`],
    enabled: !!projectId,
  });
  
  // Extract idea IDs from selected ideas
  const selectedIdeaIds = selectedIdeasData.map(item => item.ideaId);
  
  // Filter ideas to only include those that were selected
  const selectedIdeas = ideas.filter(idea => selectedIdeaIds.includes(idea.id));

  // Fetch existing relationship data
  const { 
    data: existingRelationships = [], 
    isLoading: isRelationshipsLoading 
  } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/relationships`],
    enabled: !!projectId
  });

  // Verificar si hay relaciones VAXO existentes para estas ideas
  const hasExistingVaxoRelationships = useMemo(() => {
    if (!existingRelationships || !selectedIdeas.length) return false;
    
    // Obtiene los IDs de las ideas seleccionadas
    const selectedIds = selectedIdeas.map(idea => idea.id);
    
    // Filtra las relaciones que involucran solo ideas seleccionadas
    const relationsForSelectedIdeas = existingRelationships.filter(rel => {
      const fromId = rel.fromIdeaId || rel.from;
      const toId = rel.toIdeaId || rel.to;
      return selectedIds.includes(fromId) && selectedIds.includes(toId);
    });
    
    return relationsForSelectedIdeas.length > 0;
  }, [existingRelationships, selectedIdeas]);

  // Handle the start VAXO process button
  const handleStartProcess = () => {
    // Set starting state to show loading UI
    setIsStarting(true);
    
    // Genera una nueva clave única para este proceso
    const uniqueKey = `ism-process-${Date.now()}`;
    setIsmInstanceKey(uniqueKey);
    
    // Log para diagnóstico
    console.log("Iniciando proceso VAXO con clave única:", uniqueKey);
    console.log(`Hay ${existingRelationships.length} relaciones VAXO en la base de datos`);
    console.log(`¿Hay relaciones para las ideas seleccionadas? ${hasExistingVaxoRelationships ? 'SÍ' : 'NO'}`);

    // Mostrar mensaje antes de abrir el diálogo
    if (hasExistingVaxoRelationships) {
      toast({
        title: "Relaciones VAXO existentes",
        description: "Se han encontrado relaciones VAXO guardadas previamente. Continuando desde donde quedó.",
        duration: 5000,
      });
    }
    
    // Retraso deliberado para mostrar el mensaje antes de abrir el modal
    setTimeout(() => {
      // Open the ISM dialog
      setIsISMDialogOpen(true);
      
      // Reset the starting state
      setIsStarting(false);
    }, 1000);
  };

  // Handle the start alternative process button
  const handleStartAlternativeProcess = () => {
    // Set starting state to show loading UI
    setIsStartingAlternative(true);
    
    // Por ahora simplemente muestra un mensaje toast, pero se puede extender
    toast({
      title: "Start Voting Process",
      description: "Iniciando el proceso de votación...",
    });
    
    // Reset the starting state after a short delay
    setTimeout(() => {
      setIsStartingAlternative(false);
    }, 500);
  };

  // Handle ISM dialog close
  const handleISMDialogClose = () => {
    console.log("ISM Dialog close requested - closing the dialog");
    // CORRECCIÓN DE BUG: Añadimos un retraso deliberado para asegurar que el componente
    // interno pueda hacer su limpieza antes de que el padre lo desmonte.
    // Este cambio es crucial para resolver el problema de cierre prematuro.
    setTimeout(() => {
      setIsISMDialogOpen(false);
      console.log("Dialog closed after deliberate delay to prevent premature unmounting");
    }, 100);
  };

  // Prepare project context information for ISM process
  const projectContext = project ? {
    context: project.context || "No context has been defined for this project.",
    triggeringQuestion: project.triggeringQuestion || "No triggering question has been defined.",
    relation: project.relation || "No specific relationship has been defined.",
    restriction: project.restriction || "No restrictions have been defined."
  } : null;

  // Loading state
  if (isIdeasLoading || isSelectedIdeasLoading || isProjectLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-opacity-50 border-t-primary rounded-full"></div>
      </div>
    );
  }

  // Error state
  if (isIdeasError || isSelectedIdeasError) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Could not load selected ideas. Please try again later.</AlertDescription>
      </Alert>
    );
  }
  
  // No selected ideas state
  if (selectedIdeas.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-semibold mb-2">Connection Process</h2>
        <p className="text-muted-foreground mb-6">
          Manage connections between selected ideas.
        </p>
        
        <Alert className="mb-4">
          <AlertTitle>No ideas selected</AlertTitle>
          <AlertDescription>
            There are no ideas selected for the connection process. Please go to the 
            &quot;Selector&quot; tab and select the ideas you want to connect.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">Connection Process</h2>
            <p className="text-muted-foreground">
              Connect selected ideas to create a relationship structure.
            </p>
          </div>
          <div className="flex space-x-3">
            {/* Solo mostrar el botón VAXO para administradores */}
            {isAdmin && (
              <Button 
                onClick={handleStartProcess}
                className="gap-2"
                disabled={isStarting || isStartingAlternative || selectedIdeas.length < 2}
              >
                <PlayCircle className="h-5 w-5" />
                {isStarting ? "Starting..." : "Start VAXO Process"}
              </Button>
            )}
            {/* Mostrar el botón de votación para todos */}
            <Button 
              onClick={handleStartAlternativeProcess}
              className="gap-2"
              variant="outline"
              disabled={isStarting || isStartingAlternative || selectedIdeas.length < 2}
            >
              <PlayCircle className="h-5 w-5" />
              {isStartingAlternative ? "Starting..." : "Start VAXO Process"}
            </Button>
          </div>
        </div>
        
        <Separator className="mb-4" />
        
        <div className="mb-4">
          <Badge variant="outline" className="mb-2">
            {selectedIdeas.length} selected ideas
          </Badge>
          <p className="text-sm text-muted-foreground">
            The following ideas have been selected for the connection process:
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {selectedIdeas.map(idea => (
            <Card key={idea.id} className="border-l-4 border-l-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{idea.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {idea.description && (
                  <p className="text-sm line-clamp-3">{idea.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      
      {/* ISM Process Dialog - Con acercamiento completamente diferente para evitar problemas de estado */}
      {isISMDialogOpen && (
        <>
          {hasExistingVaxoRelationships ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-lg shadow-lg max-w-lg w-full p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Retomando Proceso VAXO</h2>
                  <Button variant="ghost" size="icon" onClick={handleISMDialogClose} className="h-8 w-8 rounded-full">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <p>Se han encontrado {existingRelationships.filter(r => {
                    const fromId = r.fromIdeaId || r.from;
                    const toId = r.toIdeaId || r.to;
                    const selectedIds = selectedIdeas.map(idea => idea.id);
                    return selectedIds.includes(fromId) && selectedIds.includes(toId);
                  }).length} relaciones VAXO existentes para las ideas seleccionadas.</p>
                  
                  <Alert>
                    <AlertTitle>Recuperación de sesión</AlertTitle>
                    <AlertDescription>
                      Para solucionar el problema actual, primero debemos eliminar todas las relaciones existentes
                      y luego comenzar un nuevo proceso. Esto es una solución temporal.
                    </AlertDescription>
                  </Alert>
                  
                  <div className="flex justify-end space-x-2 mt-4">
                    <Button variant="outline" onClick={handleISMDialogClose}>
                      Cancelar
                    </Button>
                    <Button 
                      onClick={async () => {
                        // Mensaje mientras se procesan las relaciones
                        toast({
                          title: "Eliminando relaciones existentes",
                          description: "Preparando sistema para nueva sesión VAXO...",
                          duration: 3000,
                        });
                        
                        try {
                          // Obtener los IDs de las ideas seleccionadas
                          const selectedIds = selectedIdeas.map(idea => idea.id);
                          
                          // Obtener las relaciones para las ideas seleccionadas
                          const relationsToDelete = existingRelationships.filter(rel => {
                            const fromId = rel.fromIdeaId || rel.from;
                            const toId = rel.toIdeaId || rel.to;
                            return selectedIds.includes(fromId) && selectedIds.includes(toId);
                          });
                          
                          // Eliminar cada relación una por una
                          for (const relation of relationsToDelete) {
                            try {
                              await apiRequest('DELETE', `/api/relationships/${relation.id}`);
                              console.log(`Relación ${relation.id} eliminada correctamente`);
                            } catch (error) {
                              console.error(`Error al eliminar relación ${relation.id}:`, error);
                            }
                          }
                          
                          // Invalidar la consulta para actualizar los datos
                          queryClient.invalidateQueries({
                            queryKey: [`/api/projects/${projectId}/relationships`]
                          });
                          
                          // Mostrar mensaje de éxito
                          toast({
                            title: "Relaciones eliminadas",
                            description: `Se han eliminado ${relationsToDelete.length} relaciones VAXO. Puede iniciar un nuevo proceso.`,
                            duration: 5000,
                          });
                        } catch (error) {
                          console.error("Error al eliminar relaciones:", error);
                          toast({
                            title: "Error",
                            description: "Ocurrió un error al eliminar las relaciones.",
                            variant: "destructive",
                            duration: 5000,
                          });
                        }
                        
                        // Cierra este diálogo después de un tiempo
                        setTimeout(() => {
                          handleISMDialogClose();
                        }, 2000);
                      }}
                    >
                      Eliminar y Reiniciar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <ISMProcess 
              key={ismInstanceKey || `ism-process-${Date.now()}`}
              isOpen={isISMDialogOpen}
              onClose={handleISMDialogClose}
              selectedIdeas={selectedIdeas}
              projectContext={projectContext}
            />
          )}
        </>
      )}
    </>
  );
}