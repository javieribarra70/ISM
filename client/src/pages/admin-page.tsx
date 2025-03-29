import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import Sidebar from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Project } from "@shared/schema";
import { Loader2, UserPlus, Settings } from "lucide-react";

export default function AdminPage() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("projects");

  // Redirect if not admin
  if (user && user.role !== "admin") {
    navigate("/");
    return null;
  }

  // Fetch all projects (admin can see all)
  const { 
    data: projects, 
    isLoading: isProjectsLoading 
  } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: undefined,
  });

  if (isProjectsLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <main className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-text">Admin Dashboard</h1>
              <p className="text-muted-foreground">Manage users, projects and system settings</p>
            </div>
            <Button className="bg-primary text-white">
              <Settings className="mr-2 h-4 w-4" />
              System Settings
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
            <TabsList className="mb-6">
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>

            <TabsContent value="projects" className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">All Projects</h2>
                <Button 
                  onClick={() => navigate("/")}
                  variant="outline"
                >
                  Create New Project
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects?.map((project) => (
                  <Card 
                    key={project.id} 
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => navigate(`/project/${project.id}`)}
                  >
                    <CardHeader>
                      <CardTitle>{project.name}</CardTitle>
                      <CardDescription>{project.description || 'No description'}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Created: {new Date(project.createdAt).toLocaleDateString()}
                      </p>
                      <div className="mt-4 flex justify-end">
                        <Button size="sm" variant="outline">Manage</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {projects?.length === 0 && (
                  <Card className="col-span-full">
                    <CardHeader>
                      <CardTitle>No Projects Yet</CardTitle>
                      <CardDescription>Create a new project to get started.</CardDescription>
                    </CardHeader>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">User Management</h2>
                <Button variant="outline">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add New User
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Users</CardTitle>
                  <CardDescription>Manage user accounts and permissions</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    This feature will be implemented in the next version.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reports" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>System Reports</CardTitle>
                  <CardDescription>View and analyze system usage statistics</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    This feature will be implemented in the next version.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
