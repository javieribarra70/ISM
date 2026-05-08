import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Project } from "@shared/schema";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: () => void;
}

export default function CreateProjectModal({
  isOpen,
  onClose,
  onProjectCreated,
}: CreateProjectModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      console.log("API Request starting with data:", data);
      const response = await apiRequest("POST", "/api/projects", data);
      const result = await response.json();
      console.log("API Response:", result);
      return result;
    },
    onSuccess: (project: Project) => {
      console.log("Project created successfully:", project);
      toast({
        title: "Project created",
        description: `"${project.name}" has been created successfully`,
      });
      
      // Reset form and call success callback
      setName("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onProjectCreated();
    },
    onError: (error: Error) => {
      console.error("Failed to create project:", error);
      toast({
        title: "Failed to create project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submit form triggered");
    
    if (!name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a project name",
        variant: "destructive",
      });
      return;
    }
    
    console.log("Submitting project:", { name, description });
    createProjectMutation.mutate({
      name,
      description,
    });
  };

  // If modal is not open, don't render anything
  if (!isOpen) {
    return null;
  }

  // Use a simple fixed position div for modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-lg rounded-lg bg-background p-6 shadow-lg">
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-500 hover:text-gray-700"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x">
            <path d="M18 6 6 18"/>
            <path d="m6 6 12 12"/>
          </svg>
        </button>
        
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Create New Project</h2>
          <p className="text-sm text-muted-foreground">
            Create a new Interpretive Structural Modeling project to collaborate with your team.
          </p>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter project name"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="project-description">Description (optional)</Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the purpose of your project"
                rows={3}
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={createProjectMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={createProjectMutation.isPending || !name.trim()}
            >
              {createProjectMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
