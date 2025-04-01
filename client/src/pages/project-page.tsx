import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Sidebar from "@/components/sidebar";
import Workspace from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Project, Idea, Relationship, ProjectUser, Category } from "@shared/schema";
import { Loader2, Share2, Users, UserPlus, Settings } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import NewIdeaModal from "@/components/modals/new-idea-modal";
import EditIdeaModal from "@/components/modals/edit-idea-modal";
import InviteUsersModal from "@/components/modals/invite-users-modal";
import NewCategoryModal from "@/components/modals/new-category-modal";
import CategoriesTab from "@/components/tabs/categories-tab";
import SelectorTab from "@/components/tabs/selector-tab";
import { Avatars } from "@/components/avatars";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [location, navigate] = useLocation();
  const { user, isLoading: isLoadingUser } = useAuth();
  const { toast } = useToast();
  const [isNewIdeaModalOpen, setIsNewIdeaModalOpen] = useState(false);
  const [isNewCategoryModalOpen, setIsNewCategoryModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [lastPolled, setLastPolled] = useState<Date>(new Date());
  const [ideaToEdit, setIdeaToEdit] = useState<Idea | null>(null);
  const [isEditIdeaModalOpen, setIsEditIdeaModalOpen] = useState(false);
  // Estado para controlar la pestaña activa - debe estar aquí con los otros estados
  // Intentar recordar la última pestaña activa usando sessionStorage
  const getInitialTab = () => {
    try {
      const savedTab = sessionStorage.getItem(`project_${projectId}_active_tab`);
      return savedTab || "categories"; // Si no hay valor guardado, mostrar categorías por defecto
    } catch (e) {
      return "categories"; // Fallback si hay problemas con sessionStorage
    }
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab());
  
  // Cuando cambia la pestaña, guardarla en sessionStorage
  const handleTabChange = (tab: string) => {
    console.log(`Cambiando a pestaña: ${tab}`);
    setActiveTab(tab);
    
    try {
      // Guardar la pestaña activa en sessionStorage
      sessionStorage.setItem(`project_${projectId}_active_tab`, tab);
      
      // Si estamos cambiando a la pestaña de ideas, forzar una recarga de las ideas
      // para asegurar que tengamos las posiciones actualizadas
      if (tab === "ideas") {
        console.log("Recargando ideas para asegurar posiciones correctas");
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${parsedProjectId}/ideas`] });
        refetchIdeas();
      }
    } catch (e) {
      console.error("Error al procesar cambio de pestaña:", e);
    }
  };
  
  // Validate projectId
  const parsedProjectId = parseInt(projectId || "");
  if (isNaN(parsedProjectId)) {
    navigate("/");
    return null;
  }
  
  // Redirect to auth page if user is not authenticated
  useEffect(() => {
    if (!isLoadingUser && !user) {
      navigate('/auth');
    }
  }, [user, isLoadingUser, navigate]);
  
  // Función para verificar si el usuario actual es administrador del proyecto
  const isUserProjectAdmin = () => {
    if (!user || !projectUsers) return false;
    
    // Si el usuario es admin global, tiene acceso de administrador a todos los proyectos
    if (user.role === "admin") return true;
    
    // Buscar el rol del usuario en este proyecto específico
    const userProjectRole = projectUsers.find(pu => pu.userId === user.id)?.role;
    return userProjectRole === "admin";
  };

  // Fetch project details
  const { 
    data: project, 
    isLoading: isProjectLoading, 
    isError: isProjectError,
    refetch: refetchProject 
  } = useQuery<Project>({
    queryKey: [`/api/projects/${parsedProjectId}`],
    retry: 3, // Intente hasta 3 veces
    retryDelay: 1000, // Espere 1 segundo entre reintentos
  });

  // Fetch project ideas
  const { 
    data: ideas = [], // Default to empty array
    isLoading: isIdeasLoading, 
    isError: isIdeasError,
    refetch: refetchIdeas
  } = useQuery<Idea[]>({
    queryKey: [`/api/projects/${parsedProjectId}/ideas`],
    enabled: !!project, // Solo cargar ideas si el proyecto existe
    refetchInterval: 5000, // Poll every 5 seconds for updates
    staleTime: 0, // Siempre tratar los datos como obsoletos para forzar recargas
  });

  // Fetch project relationships
  const { 
    data: relationships = [], // Default to empty array 
    isLoading: isRelationshipsLoading, 
    isError: isRelationshipsError,
    refetch: refetchRelationships
  } = useQuery<Relationship[]>({
    queryKey: [`/api/projects/${parsedProjectId}/relationships`],
    enabled: !!project, // Solo cargar relaciones si el proyecto existe
    refetchInterval: 5000, // Poll every 5 seconds for updates
  });
  
  // Fetch project categories
  const { 
    data: projectCategories = [], // Default to empty array 
    isLoading: isCategoriesLoading, 
    isError: isCategoriesError,
    refetch: refetchCategories
  } = useQuery<Category[]>({
    queryKey: [`/api/projects/${parsedProjectId}/categories`],
    enabled: !!project, // Solo cargar categorías si el proyecto existe
  });

  // Fetch project users
  const { 
    data: projectUsers = [], // Default to empty array
    isLoading: isProjectUsersLoading,
    refetch: refetchProjectUsers
  } = useQuery<(ProjectUser & { user: {id: number, username: string, email: string}})[]>({
    queryKey: [`/api/projects/${parsedProjectId}/users`],
    enabled: !!project, // Solo cargar usuarios si el proyecto existe
    refetchInterval: 10000, // Poll every 10 seconds
  });
  
  // Efecto para refrescar los datos del proyecto cuando cambie el usuario
  useEffect(() => {
    if (user && parsedProjectId) {
      console.log(`Refrescando datos del proyecto ${parsedProjectId}...`);
      
      // Refrescar inmediatamente
      const refreshAll = async () => {
        try {
          await refetchProject();
          await refetchIdeas();
          await refetchRelationships();
          await refetchProjectUsers();
          console.log("Datos del proyecto actualizados correctamente");
        } catch (error) {
          console.error("Error al refrescar datos del proyecto:", error);
        }
      };
      
      refreshAll();
      
      // Configurar un intervalo para refrescar periódicamente
      const interval = setInterval(refreshAll, 10000);
      
      // Limpiar el intervalo al desmontar el componente
      return () => clearInterval(interval);
    }
  }, [user, parsedProjectId, refetchProject, refetchIdeas, refetchRelationships, refetchProjectUsers]);

  // Update the lastPolled time after a successful poll
  useEffect(() => {
    if (ideas && relationships) {
      setLastPolled(new Date());
    }
  }, [ideas, relationships]);

  // Create a new idea
  const createIdeaMutation = useMutation({
    mutationFn: async (newIdea: Omit<Idea, "id" | "createdAt" | "updatedAt" | "createdBy">) => {
      const response = await fetch(`/api/projects/${parsedProjectId}/ideas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newIdea),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create idea");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${parsedProjectId}/ideas`] });
      setIsNewIdeaModalOpen(false);
    },
  });

  // Create a relationship
  const createRelationshipMutation = useMutation({
    mutationFn: async ({ fromIdeaId, toIdeaId }: { fromIdeaId: number; toIdeaId: number }) => {
      const response = await fetch(`/api/projects/${parsedProjectId}/relationships`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fromIdeaId, toIdeaId }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create relationship");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${parsedProjectId}/relationships`] });
    },
  });

  // Create a new category
  const createCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; color: string }) => {
      const response = await apiRequest("POST", `/api/projects/${parsedProjectId}/categories`, {
        ...data,
      });
      return response.json();
    },
    onSuccess: () => {
      // Guardar explícitamente "categories" como la pestaña activa en sessionStorage
      try {
        sessionStorage.setItem(`project_${projectId}_active_tab`, "categories");
        console.log("Persistiendo pestaña activa: categories en sessionStorage");
      } catch (e) {
        console.error("Error al guardar pestaña en sessionStorage:", e);
      }
      
      // Primer paso: Invalidar la consulta para forzar una recarga
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${parsedProjectId}/categories`] });
      
      // Segundo paso: Cerrar el modal
      setIsNewCategoryModalOpen(false);
      
      // Tercer paso: Forzar que se muestre la pestaña de categorías con retraso
      // Usar setTimeout con un retraso más largo para asegurar que todos los cambios de estado se completen
      setTimeout(() => {
        // Asegurarse de que la pestaña activa sea "categories" explícitamente
        setActiveTab("categories");
        console.log("Estableciendo pestaña activa a 'categories' después de crear categoría");
      }, 200);
    },
    onError: (error: Error) => {
      console.error("Error al crear categoría:", error);
      toast({
        title: "Error al crear categoría",
        description: "Ha ocurrido un error al crear la categoría. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  });

  // Update idea
  const updateIdeaMutation = useMutation({
    mutationFn: async (ideaData: Partial<Idea> & { id: number }) => {
      const { id, ...updateData } = ideaData;
      
      console.log(`Actualizando idea ${id} con datos:`, updateData);
      
      // Usar un fetch completo para poder ver los errores en detalle
      const response = await fetch(`/api/ideas/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error al actualizar idea: ${response.status} - ${errorText}`);
        throw new Error(`Error al actualizar idea: ${response.status} - ${errorText}`);
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${parsedProjectId}/ideas`] });
      setIsEditIdeaModalOpen(false);
      setIdeaToEdit(null);
      
      toast({
        title: "Idea actualizada",
        description: "La idea ha sido actualizada exitosamente.",
      });
    },
    onError: (error: Error) => {
      console.error("Error al actualizar idea:", error);
      toast({
        title: "Error al actualizar idea",
        description: "Ha ocurrido un error al actualizar la idea. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  });

  // Update idea position
  const updateIdeaPositionMutation = useMutation({
    mutationFn: async ({ ideaId, positionX, positionY }: { ideaId: number; positionX: string; positionY: string }) => {
      console.log(`Actualizando posición de idea ${ideaId} a X:${positionX}, Y:${positionY} via mutación`);
      
      // Usar apiRequest en lugar de fetch directo para asegurar consistencia
      const response = await apiRequest(
        "PATCH", 
        `/api/projects/${parsedProjectId}/ideas/${ideaId}/position`, 
        { positionX, positionY }
      );
      
      const data = await response.json();
      console.log(`Respuesta de actualización de posición:`, data);
      return data;
    },
    onSuccess: (data) => {
      console.log(`Posición actualizada exitosamente`, data);
      
      // Guardar explícitamente "ideas" como la pestaña activa en sessionStorage
      try {
        sessionStorage.setItem(`project_${projectId}_active_tab`, "ideas");
        console.log("Guardando pestaña activa: ideas en sessionStorage");
      } catch (e) {
        console.error("Error al guardar pestaña en sessionStorage:", e);
      }
      
      // Invalidar la consulta para forzar una recarga
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${parsedProjectId}/ideas`] });
    },
    onError: (error: Error) => {
      console.error("Error al actualizar posición de idea:", error);
      toast({
        title: "Error al actualizar posición",
        description: "Ha ocurrido un error al guardar la posición de la idea.",
        variant: "destructive",
      });
    }
  });
  
  // Delete idea mutation
  const deleteIdeaMutation = useMutation({
    mutationFn: async (ideaId: number) => {
      const response = await apiRequest("DELETE", `/api/ideas/${ideaId}`, {});
      return response.ok;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${parsedProjectId}/ideas`] });
      toast({
        title: "Idea eliminada",
        description: "La idea ha sido eliminada con éxito.",
      });
    },
    onError: (error: Error) => {
      console.error("Error al eliminar idea:", error);
      toast({
        title: "Error al eliminar idea",
        description: "Ha ocurrido un error al eliminar la idea.",
        variant: "destructive",
      });
    }
  });

  // Handle loading state for project only
  if (isProjectLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex justify-center items-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">Loading project workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  // Handle error state for project only
  if (isProjectError || !project) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 p-8 flex justify-center items-center">
          <div className="text-center">
            <h2 className="text-xl font-bold text-destructive mb-2">Failed to load project</h2>
            <p className="text-muted-foreground mb-4">The project may not exist or you don't have access.</p>
            <Button onClick={() => navigate("/")}>Return to Dashboard</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        {/* Top navbar */}
        <div className="bg-white shadow-sm z-10">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold text-text">{project.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Last updated: {lastPolled.toLocaleTimeString()}
              </p>
            </div>
            
            <div className="flex space-x-3">
              {/* Collaborators */}
              <div className="flex items-center">
                <Avatars users={projectUsers?.map(pu => pu.user) || []} />
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="ml-2"
                  onClick={() => setIsInviteModalOpen(true)}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite
                </Button>
              </div>
              
              {/* Share button */}
              <Button size="sm" className="bg-primary text-white">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
          
          {/* Pestañas de navegación */}
          <Tabs 
            value={activeTab}
            onValueChange={handleTabChange}
            className="w-full px-4 sm:px-6 lg:px-8"
          >
            <TabsList className={`grid w-full max-w-lg ${isUserProjectAdmin() ? 'grid-cols-6' : 'grid-cols-5'} mb-4`}>
              <TabsTrigger value="categories">
                Categories
              </TabsTrigger>
              <TabsTrigger value="ideas">
                Ideas
              </TabsTrigger>
              <TabsTrigger value="context">
                Context
              </TabsTrigger>
              <TabsTrigger value="selector">
                Selector
              </TabsTrigger>
              <TabsTrigger value="connection">
                Connection
              </TabsTrigger>
              {isUserProjectAdmin() && (
                <TabsTrigger 
                  value="settings"
                  onClick={() => navigate(`/projects/${projectId}/settings`)}
                >
                  Settings
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="categories" className="mt-0 p-4">
              <CategoriesTab 
                projectId={parsedProjectId} 
                setActiveTab={setActiveTab}
              />
            </TabsContent>
            
            <TabsContent value="ideas" className="mt-0 p-0">
              {/* Main workspace content */}
              <Workspace
                project={project}
                ideas={ideas || []}
                relationships={relationships || []}
                categories={projectCategories || []}
                onCreateIdea={() => setIsNewIdeaModalOpen(true)}
                onCreateRelationship={(fromId, toId) => 
                  createRelationshipMutation.mutate({ fromIdeaId: fromId, toIdeaId: toId })
                }
                onUpdateIdeaPosition={(ideaId, x, y) => 
                  updateIdeaPositionMutation.mutate({ ideaId, positionX: x, positionY: y })
                }
                onEditIdea={(idea) => {
                  setIdeaToEdit(idea);
                  setIsEditIdeaModalOpen(true);
                }}
                onDeleteIdea={(idea) => {
                  // Aquí añadimos la lógica para eliminar una idea
                  if (window.confirm(`¿Estás seguro de que deseas eliminar la idea "${idea.title}"?`)) {
                    deleteIdeaMutation.mutate(idea.id);
                  }
                }}
                anonymousMode={project.anonymousMode}
              />
            </TabsContent>
            
            <TabsContent value="context" className="mt-0 p-4">
              <div className="bg-white rounded-lg shadow p-6 min-h-[600px]">
                <h2 className="text-xl font-semibold mb-4">Project Context</h2>
                <p className="text-muted-foreground">
                  This section will allow adding and editing contextual information about the project,
                  such as reference documents, objectives, and scope.
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="selector" className="mt-0 p-4">
              <SelectorTab 
                projectId={parsedProjectId}
                setActiveTab={setActiveTab}
              />
            </TabsContent>
            
            <TabsContent value="connection" className="mt-0 p-4">
              <div className="bg-white rounded-lg shadow p-6 min-h-[600px]">
                <h2 className="text-xl font-semibold mb-4">Connection Management</h2>
                <p className="text-muted-foreground">
                  This section will allow viewing and editing relationships between project ideas,
                  creating more complex structures and hierarchies.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Modals */}
      <NewIdeaModal 
        isOpen={isNewIdeaModalOpen}
        onClose={() => setIsNewIdeaModalOpen(false)}
        onCreateIdea={(ideaData) => createIdeaMutation.mutate({
          ...ideaData,
          projectId: parsedProjectId,
          categoryId: ideaData.categoryId || 0, // Proporcionar un valor por defecto para categoryId
        })}
        isCreating={createIdeaMutation.isPending}
        projectCategories={projectCategories}
      />

      <InviteUsersModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        projectId={parsedProjectId}
        onInviteSent={() => {
          refetchProjectUsers();
          setIsInviteModalOpen(false);
        }}
      />

      <NewCategoryModal
        isOpen={isNewCategoryModalOpen}
        onClose={() => setIsNewCategoryModalOpen(false)}
        onSaveCategory={(categoryData) => {
          console.log("Category created, submitting:", categoryData);
          createCategoryMutation.mutate(categoryData);
        }}
        isSubmitting={createCategoryMutation.isPending}
      />
      
      <EditIdeaModal
        isOpen={isEditIdeaModalOpen}
        onClose={() => {
          setIsEditIdeaModalOpen(false);
          setIdeaToEdit(null);
        }}
        idea={ideaToEdit}
        onUpdateIdea={(ideaData) => {
          if (ideaToEdit) {
            updateIdeaMutation.mutate({
              id: ideaToEdit.id,
              ...ideaData
            });
          }
        }}
        isUpdating={updateIdeaMutation.isPending}
        projectCategories={projectCategories}
      />
    </div>
  );
}
