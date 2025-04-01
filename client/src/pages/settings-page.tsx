import { useState, useEffect } from "react";
import { useParams } from "wouter";
type ProjectParams = {
  projectId: string;
};
import { useQuery, useMutation } from "@tanstack/react-query";
import { Project } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import Sidebar from "@/components/sidebar";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff } from "lucide-react";

export default function SettingsPage() {
  const { projectId } = useParams<ProjectParams>();
  const parsedProjectId = projectId ? parseInt(projectId) : 0;
  
  // Estado local para el modo anónimo
  const [anonymousMode, setAnonymousMode] = useState(false);
  
  // Obtener datos del proyecto
  const { data: project, isLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${parsedProjectId}`],
    enabled: !!parsedProjectId,
  });
  
  // Configurar el estado inicial cuando cargan los datos del proyecto
  useEffect(() => {
    if (project?.anonymousMode !== undefined) {
      setAnonymousMode(project.anonymousMode);
    }
  }, [project]);
  
  // Mutación para actualizar la configuración
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { anonymousMode: boolean }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/projects/${parsedProjectId}/settings`,
        data
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${parsedProjectId}`] });
      toast({
        title: "Configuración actualizada",
        description: "La configuración del proyecto se ha actualizado correctamente.",
      });
    },
    onError: (error) => {
      console.error("Error al actualizar configuración:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la configuración. Inténtelo de nuevo.",
        variant: "destructive",
      });
    },
  });
  
  const handleAnonymousModeChange = () => {
    const newValue = !anonymousMode;
    setAnonymousMode(newValue);
    
    // Actualizar en el backend
    updateSettingsMutation.mutate({ anonymousMode: newValue });
    
    // Notificamos al usuario para mejor experiencia
    toast({
      title: newValue ? "Modo anónimo activado" : "Modo anónimo desactivado",
      description: newValue 
        ? "Los nombres de los creadores de ideas están ocultos." 
        : "Los nombres de los creadores de ideas son visibles.",
    });
  };
  
  if (isLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 p-8">
          <p>Cargando configuración...</p>
        </div>
      </div>
    );
  }
  
  if (!project) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 p-8">
          <p>Proyecto no encontrado.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 p-8">
        <h1 className="text-2xl font-bold mb-6">Configuración del Sistema</h1>
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Privacidad</CardTitle>
            <CardDescription>
              Configurar opciones de privacidad para este proyecto
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4 mb-4">
              <Switch 
                id="anonymous-mode" 
                checked={anonymousMode}
                onCheckedChange={handleAnonymousModeChange}
              />
              <div className="space-y-1">
                <Label htmlFor="anonymous-mode" className="font-medium flex items-center gap-2">
                  Modo anónimo {anonymousMode ? <EyeOff size={16} /> : <Eye size={16} />}
                </Label>
                <p className="text-sm text-muted-foreground">
                  Cuando está activado, oculta los nombres de los creadores de ideas en la vista de ideas.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Separator className="my-6" />
        
        <Card>
          <CardHeader>
            <CardTitle>Información del proyecto</CardTitle>
            <CardDescription>
              Detalles del proyecto actual
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">Nombre</h3>
                <p>{project.name}</p>
              </div>
              
              <div>
                <h3 className="font-medium">Descripción</h3>
                <p>{project.description || "Sin descripción"}</p>
              </div>
              
              <div>
                <h3 className="font-medium">Fecha de creación</h3>
                <p>{new Date(project.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline">Editar información</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}