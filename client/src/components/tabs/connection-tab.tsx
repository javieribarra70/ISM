import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Idea, SelectedIdea, Project } from "@shared/schema";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PlayCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import ISMProcess from "@/components/ism/ism-process-fixed";

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

  // Handle the start VAXO process button
  const handleStartProcess = () => {
    // Set starting state to show loading UI
    setIsStarting(true);
    
    // Open the ISM dialog
    setIsISMDialogOpen(true);
    
    // Reset the starting state after a short delay
    setTimeout(() => {
      setIsStarting(false);
    }, 500);
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
    // SOLUCIÓN DEFINITIVA: Aumentamos el retraso considerablemente para asegurar
    // que toda la lógica interna del componente ISM tenga tiempo de ejecutarse 
    // antes de que el padre lo desmonte. Este cambio es crucial.
    setTimeout(() => {
      setIsISMDialogOpen(false);
      console.log("Dialog closed after substantial delay to prevent premature unmounting");
    }, 1000); // Aumentado a 1 segundo
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
      
      {/* ISM Process Dialog */}
      <ISMProcess 
        isOpen={isISMDialogOpen}
        onClose={handleISMDialogClose}
        selectedIdeas={selectedIdeas}
        projectContext={projectContext}
      />
    </>
  );
}