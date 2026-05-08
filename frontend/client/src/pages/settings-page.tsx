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
  
  // Local state for anonymous mode
  const [anonymousMode, setAnonymousMode] = useState(false);
  
  // Get project data
  const { data: project, isLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${parsedProjectId}`],
    enabled: !!parsedProjectId,
  });
  
  // Set initial state when project data loads
  useEffect(() => {
    if (project?.anonymousMode !== undefined) {
      setAnonymousMode(project.anonymousMode);
    }
  }, [project]);
  
  // Mutation to update settings
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
        title: "Settings updated",
        description: "Project settings have been updated successfully.",
      });
    },
    onError: (error) => {
      console.error("Error updating settings:", error);
      toast({
        title: "Error",
        description: "Could not update settings. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const handleAnonymousModeChange = () => {
    const newValue = !anonymousMode;
    setAnonymousMode(newValue);
    
    // Update in the backend
    updateSettingsMutation.mutate({ anonymousMode: newValue });
    
    // Notify the user for better experience
    toast({
      title: newValue ? "Anonymous mode enabled" : "Anonymous mode disabled",
      description: newValue 
        ? "Idea creator names are now hidden." 
        : "Idea creator names are now visible.",
    });
  };
  
  if (isLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 p-8">
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }
  
  if (!project) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 p-8">
          <p>Project not found.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 p-8">
        <h1 className="text-2xl font-bold mb-6">System Settings</h1>
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
            <CardDescription>
              Configure privacy options for this project
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
                  Anonymous Mode {anonymousMode ? <EyeOff size={16} /> : <Eye size={16} />}
                </Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, hides the names of idea creators in the ideas view.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Separator className="my-6" />
        
        <Card>
          <CardHeader>
            <CardTitle>Project Information</CardTitle>
            <CardDescription>
              Details of the current project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">Name</h3>
                <p>{project.name}</p>
              </div>
              
              <div>
                <h3 className="font-medium">Description</h3>
                <p>{project.description || "No description"}</p>
              </div>
              
              <div>
                <h3 className="font-medium">Creation Date</h3>
                <p>{new Date(project.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline">Edit Information</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}