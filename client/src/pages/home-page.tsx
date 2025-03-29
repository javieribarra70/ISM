import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PlusCircle, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/sidebar";
import { Project } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function HomePage() {
  const [location, navigate] = useLocation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();
  
  // Fetch user authentication status manually
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/user', {
          credentials: 'include',
        });
        
        if (response.status === 401) {
          navigate('/auth');
          return;
        }
        
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          // Handle other errors
          console.error('Error checking auth status');
          navigate('/auth');
        }
      } catch (error) {
        console.error('Error checking auth status', error);
        navigate('/auth');
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, [navigate]);
  
  // Fetch user's projects only if authenticated
  const { data: projects, isLoading: isProjectsLoading, isError, refetch } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: undefined, // Use the default query function
    enabled: !!user, // Only run query if user is authenticated
  });

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const response = await apiRequest("POST", "/api/projects", data);
      return response.json();
    },
    onSuccess: (project: Project) => {
      toast({
        title: "Project created",
        description: `"${project.name}" has been created successfully`,
      });
      
      // Reset form and close modal
      setProjectName("");
      setProjectDescription("");
      setShowCreateModal(false);
      
      // Refresh projects list
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!projectName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a project name",
        variant: "destructive",
      });
      return;
    }
    
    createProjectMutation.mutate({
      name: projectName,
      description: projectDescription,
    });
  };
  
  // Function to handle opening the modal
  const handleOpenModal = () => {
    console.log("Opening create project modal");
    setShowCreateModal(true);
  };
  
  // Function to handle closing the modal
  const handleCloseModal = () => {
    console.log("Closing create project modal");
    setShowCreateModal(false);
  };

  if (isLoading || isProjectsLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 p-8 flex justify-center items-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="mt-4 text-gray-500">Loading your projects...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 p-8 flex justify-center items-center">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>No Projects Yet</CardTitle>
              <CardDescription>You don't have any projects yet. Create your first project to get started.</CardDescription>
            </CardHeader>
            <CardFooter className="flex justify-between">
              <Button onClick={() => refetch()} variant="outline">Refresh</Button>
              <Button 
                className="bg-primary text-white"
                onClick={handleOpenModal}
              >
                <PlusCircle className="mr-2 h-4 w-4" /> Create New Project
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  const hasProjects = projects && projects.length > 0;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <main className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-text">Welcome, {user?.username}!</h1>
              <p className="text-muted-foreground">Manage your collaborative ISM projects</p>
            </div>
            <Button 
              className="bg-primary text-white" 
              onClick={handleOpenModal}
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Create Project
            </Button>
          </div>

          <Separator className="my-6" />

          {hasProjects ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <Card 
                  key={project.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer border-border"
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      {project.description || 'No description provided'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Created: {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </CardContent>
                  <CardFooter className="pt-2">
                    <Button variant="outline" className="w-full">Open Project</Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="max-w-md mx-auto">
              <CardHeader>
                <CardTitle>No Projects Yet</CardTitle>
                <CardDescription>Create your first ISM project to get started.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button 
                  className="w-full bg-primary text-white"
                  onClick={handleOpenModal}
                >
                  <PlusCircle className="mr-2 h-4 w-4" /> Create Your First Project
                </Button>
              </CardFooter>
            </Card>
          )}
        </main>
      </div>

      {/* Create Project Modal - Inline implementation */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative w-full max-w-lg rounded-lg bg-background p-6 shadow-lg">
            <button 
              onClick={handleCloseModal}
              className="absolute right-4 top-4 text-gray-500 hover:text-gray-700"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
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
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Enter project name"
                    required
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="project-description">Description (optional)</Label>
                  <Textarea
                    id="project-description"
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    placeholder="Describe the purpose of your project"
                    rows={3}
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCloseModal}
                  disabled={createProjectMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createProjectMutation.isPending || !projectName.trim()}
                >
                  {createProjectMutation.isPending ? "Creating..." : "Create Project"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
