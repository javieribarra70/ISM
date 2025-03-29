import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PlusCircle, Loader2 } from "lucide-react";
import Sidebar from "@/components/sidebar";
import { Project } from "@shared/schema";
import CreateProjectModal from "@/components/modals/create-project-modal";

export default function HomePage() {
  const [location, navigate] = useLocation();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  
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

  // After creating a project, refresh the projects list
  const handleProjectCreated = () => {
    refetch();
    setIsCreateModalOpen(false);
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
                onClick={() => setIsCreateModalOpen(true)}
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
              onClick={() => setIsCreateModalOpen(true)}
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
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  <PlusCircle className="mr-2 h-4 w-4" /> Create Your First Project
                </Button>
              </CardFooter>
            </Card>
          )}
        </main>
      </div>

      <CreateProjectModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)}
        onProjectCreated={handleProjectCreated}
      />
    </div>
  );
}
