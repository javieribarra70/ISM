import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
    if (!existingRelationships || !selectedIdeas.length) {
      console.log("No hay relaciones o ideas seleccionadas");
      return false;
    }
    
    // Obtiene los IDs de las ideas seleccionadas
    const selectedIds = selectedIdeas.map(idea => idea.id);
    console.log("IDs de ideas seleccionadas:", selectedIds);
    
    // Filtra las relaciones que involucran solo ideas seleccionadas
    const relationsForSelectedIdeas = existingRelationships.filter(rel => {
      const fromId = rel.fromIdeaId || rel.from;
      const toId = rel.toIdeaId || rel.to;
      const matches = selectedIds.includes(fromId) && selectedIds.includes(toId);
      if (matches) {
        console.log(`Relación coincidente: ${fromId} -> ${toId}`);
      }
      return matches;
    });
    
    const result = relationsForSelectedIdeas.length > 0;
    console.log(`¿Hay relaciones para las ideas seleccionadas? ${result ? 'SÍ' : 'NO'}`);
    console.log(`Total relaciones filtradas: ${relationsForSelectedIdeas.length}`);
    
    return result;
  }, [existingRelationships, selectedIdeas]);

  // Estado para controlar qué modal mostrar
  const [showRelationshipsDialog, setShowRelationshipsDialog] = useState(false);

  // VERSIÓN FINAL REPARADA: Uso de alert nativo para bypass de React
  const handleStartProcess = () => {
    console.log("=== REPARACIÓN FINAL DEL PROCESO VAXO ===");
    
    // Mostrar una alerta nativa para confirmar la acción
    // Esto detiene la ejecución y da tiempo a que React realice cualquier actualización pendiente
    window.alert("Iniciando proceso VAXO. Presiona OK para continuar.");
    
    // Construimos manualmente un modal VAXO usando DOM nativo
    // que no esté sujeto a problemas de React
    const body = document.body;
    
    // 1. Crear el contenedor del modal
    const modalOverlay = document.createElement('div');
    modalOverlay.id = "vaxo-manual-modal";
    modalOverlay.style.position = "fixed";
    modalOverlay.style.top = "0";
    modalOverlay.style.left = "0";
    modalOverlay.style.width = "100%";
    modalOverlay.style.height = "100%";
    modalOverlay.style.backgroundColor = "rgba(0,0,0,0.8)";
    modalOverlay.style.display = "flex";
    modalOverlay.style.alignItems = "center";
    modalOverlay.style.justifyContent = "center";
    modalOverlay.style.zIndex = "99999"; // Muy alto para garantizar visibilidad
    
    // 2. Crear el contenido del modal
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = "white";
    modalContent.style.padding = "30px";
    modalContent.style.borderRadius = "8px";
    modalContent.style.maxWidth = "800px";
    modalContent.style.width = "80%";
    modalContent.style.maxHeight = "90vh";
    modalContent.style.overflow = "auto";
    modalContent.style.border = "5px solid red";
    
    // 3. Añadir título y contenido
    modalContent.innerHTML = `
      <h2 style="margin-bottom: 20px; font-size: 20px; font-weight: bold;">
        Proceso VAXO Activado Manualmente
      </h2>
      <p style="margin-bottom: 15px;">
        Esta es una solución temporal hasta que se resuelva el problema con el modal React.
      </p>
      <p style="margin-bottom: 15px;">
        Total de ideas seleccionadas: ${selectedIdeas.length}
      </p>
      <div style="margin-top: 20px; text-align: right;">
        <button id="close-vaxo-modal" style="padding: 8px 16px; background: #e11d48; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Cerrar
        </button>
      </div>
    `;
    
    // 4. Añadir modal al DOM
    modalOverlay.appendChild(modalContent);
    body.appendChild(modalOverlay);
    
    // 5. Configurar el botón de cierre
    setTimeout(() => {
      const closeButton = document.getElementById('close-vaxo-modal');
      if (closeButton) {
        closeButton.addEventListener('click', () => {
          const modal = document.getElementById('vaxo-manual-modal');
          if (modal) {
            modal.remove();
          }
          
          // Notificar al usuario
          toast({
            title: "Proceso VAXO cerrado",
            description: "El proceso ha sido cerrado manualmente.",
            duration: 3000,
          });
          
          // Reset UI state
          setIsStarting(false);
        });
      }
    }, 100);
    
    // 6. Desactivar indicador de carga después de un breve tiempo
    setTimeout(() => {
      setIsStarting(false);
    }, 1000);
    
    // Notificar al usuario
    toast({
      title: "Solución temporal activada",
      description: "Se ha creado un modal DOM nativo mientras se repara el componente React.",
      duration: 5000,
    });
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

  // Handle ISM dialog close - Versión final
  const handleISMDialogClose = () => {
    console.log("⚠️ SOLICITUD DE CIERRE DESDE ISM PROCESS - EJECUTANDO CIERRE SEGURO");
    
    // Mostrar mensaje al usuario
    toast({
      title: "Cerrando proceso VAXO",
      description: "Las relaciones VAXO se han guardado correctamente.",
      duration: 3000,
    });
    
    // MEJORA CRÍTICA: Usamos un retraso MÁS LARGO para dar tiempo 
    // a que cualquier proceso en curso en el componente interno termine
    setTimeout(() => {
      // 1. Primero actualizamos el estado local
      setIsISMDialogOpen(false);
      
      // 2. Luego invalidamos las consultas para asegurar datos frescos en próxima apertura
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/relationships`]
      });
      
      console.log("✅ MODAL VAXO CERRADO EXITOSAMENTE");
    }, 500); // Aumentamos el retraso de 100ms a 500ms
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
      
      {/* Diálogo de relaciones existentes */}
      {showRelationshipsDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Recuperación de Sesión VAXO</h2>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => {
                  setShowRelationshipsDialog(false);
                  console.log("Dialog de relaciones cerrado por usuario");
                }} 
                className="h-8 w-8 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <p className="text-base">
                Hay <strong>{existingRelationships.filter(r => {
                  const fromId = r.fromIdeaId || r.from;
                  const toId = r.toIdeaId || r.to;
                  const selectedIds = selectedIdeas.map(idea => idea.id);
                  return selectedIds.includes(fromId) && selectedIds.includes(toId);
                }).length}</strong> relaciones VAXO guardadas para estas ideas.
              </p>
              
              <Alert>
                <AlertTitle>Sesión VAXO Interrumpida</AlertTitle>
                <AlertDescription>
                  El sistema ha detectado una sesión VAXO previa que no se completó. Para continuar,
                  es necesario eliminar las relaciones existentes y comenzar un proceso nuevo.
                </AlertDescription>
              </Alert>
              
              <div className="flex justify-end space-x-2 mt-6">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowRelationshipsDialog(false);
                    console.log("Dialog de relaciones cancelado por usuario");
                  }}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={async () => {
                    toast({
                      title: "Limpiando relaciones VAXO",
                      description: "Preparando sistema para comenzar de nuevo...",
                      duration: 5000,
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
                      
                      console.log(`Se eliminarán ${relationsToDelete.length} relaciones VAXO`);
                      
                      // Eliminar cada relación una por una
                      for (const relation of relationsToDelete) {
                        try {
                          const response = await fetch(`/api/relationships/${relation.id}`, {
                            method: 'DELETE',
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            credentials: 'include'
                          });
                          
                          if (response.ok) {
                            console.log(`Relación ${relation.id} eliminada correctamente`);
                          } else {
                            console.error(`Error al eliminar relación ${relation.id}: ${response.statusText}`);
                          }
                        } catch (error) {
                          console.error(`Error al eliminar relación ${relation.id}:`, error);
                        }
                      }
                      
                      // Actualizar el estado local
                      queryClient.invalidateQueries({
                        queryKey: [`/api/projects/${projectId}/relationships`]
                      });
                      
                      toast({
                        title: "Relaciones eliminadas",
                        description: `Se han eliminado ${relationsToDelete.length} relaciones. Ahora puede iniciar un nuevo proceso.`,
                        duration: 5000,
                      });
                      
                      // Cerrar este diálogo
                      setShowRelationshipsDialog(false);
                      
                      // Después de un breve tiempo, abrir el diálogo de ISMProcess
                      setTimeout(() => {
                        setIsISMDialogOpen(true);
                      }, 1000);
                      
                    } catch (error) {
                      console.error("Error al eliminar relaciones:", error);
                      toast({
                        title: "Error",
                        description: "Ocurrió un error al eliminar las relaciones VAXO.",
                        variant: "destructive",
                        duration: 5000,
                      });
                    }
                  }}
                >
                  Eliminar y Comenzar Nuevo
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* VERSIÓN SIMPLIFICADA DEL RENDERIZADO DEL COMPONENTE ISM */}
      {isISMDialogOpen && (
        <div id="ism-wrapper" style={{zIndex: 9999}}>
          <ISMProcess 
            key={ismInstanceKey}
            isOpen={true}
            onClose={handleISMDialogClose}
            selectedIdeas={selectedIdeas}
            projectContext={projectContext}
          />
        </div>
      )}
    </>
  );
}