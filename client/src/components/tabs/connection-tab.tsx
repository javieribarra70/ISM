import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Idea, SelectedIdea } from "@shared/schema";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PlayCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface ConnectionTabProps {
  projectId: number;
}

export default function ConnectionTab({ projectId }: ConnectionTabProps) {
  const { toast } = useToast();
  const [isStarting, setIsStarting] = useState(false);

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

  // Handle the start process button
  const handleStartProcess = () => {
    // Set starting state to show loading UI
    setIsStarting(true);
    
    // Create a temporary toast notification
    toast({
      title: "Iniciando proceso de conexión",
      description: "El proceso de conexión se iniciaría aquí (funcionalidad en desarrollo).",
    });
    
    // Reset the starting state after a short delay
    setTimeout(() => {
      setIsStarting(false);
    }, 1500);
  };

  // Loading state
  if (isIdeasLoading || isSelectedIdeasLoading) {
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
        <AlertDescription>No se pudieron cargar las ideas seleccionadas. Por favor, intenta de nuevo más tarde.</AlertDescription>
      </Alert>
    );
  }
  
  // No selected ideas state
  if (selectedIdeas.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-semibold mb-2">Proceso de Conexión</h2>
        <p className="text-muted-foreground mb-6">
          Gestiona las conexiones entre ideas seleccionadas.
        </p>
        
        <Alert className="mb-4">
          <AlertTitle>No hay ideas seleccionadas</AlertTitle>
          <AlertDescription>
            No hay ideas seleccionadas para el proceso de conexión. Por favor, ve a la pestaña 
            &quot;Selector&quot; y selecciona las ideas que deseas conectar.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Proceso de Conexión</h2>
          <p className="text-muted-foreground">
            Conecta las ideas seleccionadas para crear una estructura de relaciones.
          </p>
        </div>
        <Button 
          onClick={handleStartProcess}
          className="gap-2"
          disabled={isStarting || selectedIdeas.length < 2}
        >
          <PlayCircle className="h-5 w-5" />
          {isStarting ? "Iniciando..." : "Iniciar Proceso"}
        </Button>
      </div>
      
      <Separator className="mb-4" />
      
      <div className="mb-4">
        <Badge variant="outline" className="mb-2">
          {selectedIdeas.length} ideas seleccionadas
        </Badge>
        <p className="text-sm text-muted-foreground">
          Las siguientes ideas han sido seleccionadas para el proceso de conexión:
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
  );
}