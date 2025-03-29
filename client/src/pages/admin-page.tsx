import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Sidebar from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Project } from "@shared/schema";
import { Loader2, UserPlus, Settings, FolderOpen, Edit, Trash, Download, RotateCw } from "lucide-react";

export default function AdminPage() {
  const [user, setUser] = useState<any>(null);
  const [location, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("projects");
  const [isLoading, setIsLoading] = useState(true);
  
  // Fetch user data
  useEffect(() => {
    const fetchUserData = async () => {
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
          
          // Redirect if not admin
          if (userData.role !== "admin") {
            navigate("/");
            return;
          }
          
          // Check for tab param in URL
          const url = new URL(window.location.href);
          const tabParam = url.searchParams.get('tab');
          if (tabParam && ['projects', 'users', 'reports'].includes(tabParam)) {
            setActiveTab(tabParam);
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        navigate('/auth');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUserData();
  }, [navigate]);
  
  // React to URL param changes and also initialize
  useEffect(() => {
    // Clear any existing timeouts to prevent race conditions
    if (window.tabChangeTimeout) {
      clearTimeout(window.tabChangeTimeout as any);
    }
    
    // Get tab from URL search params with a slight delay to ensure DOM is ready
    window.tabChangeTimeout = setTimeout(() => {
      const searchParams = new URLSearchParams(window.location.search);
      const tabParam = searchParams.get('tab');
      
      if (tabParam && ['projects', 'users', 'reports'].includes(tabParam)) {
        console.log("Setting active tab from URL param:", tabParam);
        setActiveTab(tabParam);
        
        // Directly click the tab element to ensure UI state is correct
        const tabElement = document.querySelector(`[role="tab"][value="${tabParam}"]`) as HTMLElement;
        if (tabElement) {
          tabElement.click();
        }
      } else if (location === "/admin") {
        // Default to projects when no tab specified
        setActiveTab("projects");
        
        // Directly click the projects tab to ensure UI state is correct
        const projectsTab = document.querySelector(`[role="tab"][value="projects"]`) as HTMLElement;
        if (projectsTab) {
          projectsTab.click();
        }
      }
    }, 50);
    
    // Cleanup function to clear the timeout
    return () => {
      if (window.tabChangeTimeout) {
        clearTimeout(window.tabChangeTimeout as any);
      }
    };
  }, [location]);
  
  // Handle tab changes from UI controls
  const handleTabChange = (value: string) => {
    console.log("Tab clicked:", value);
    setActiveTab(value);
    
    // Update URL without full navigation
    const newUrl = value === "projects" 
      ? "/admin" 
      : `/admin?tab=${value}`;
    
    window.history.pushState({}, '', newUrl);
  };

  // We're already checking admin role in the useEffect

  // Fetch all projects manually (admin can see all)
  const [projects, setProjects] = useState<Project[]>([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  
  useEffect(() => {
    const fetchProjects = async () => {
      if (!user) return;
      
      try {
        setIsProjectsLoading(true);
        const response = await fetch('/api/projects', {
          credentials: 'include',
        });
        
        if (response.ok) {
          const projectsData = await response.json();
          console.log("Admin projects:", projectsData);
          setProjects(projectsData);
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setIsProjectsLoading(false);
      }
    };
    
    fetchProjects();
  }, [user]);

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

          <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
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

              <div className="overflow-hidden border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left whitespace-nowrap p-2 font-medium">Project Name</th>
                      <th className="text-left whitespace-nowrap p-2 font-medium">Description</th>
                      <th className="text-left whitespace-nowrap p-2 font-medium">Created At</th>
                      <th className="text-left whitespace-nowrap p-2 font-medium">
                        <div className="flex items-center justify-between">
                          <span>Actions</span>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 mr-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              const fetchProjects = async () => {
                                if (!user) return;
                                
                                try {
                                  setIsProjectsLoading(true);
                                  const response = await fetch('/api/projects', {
                                    credentials: 'include',
                                  });
                                  
                                  if (response.ok) {
                                    const projectsData = await response.json();
                                    setProjects(projectsData);
                                  }
                                } catch (error) {
                                  console.error('Error refreshing projects:', error);
                                } finally {
                                  setIsProjectsLoading(false);
                                }
                              };
                              
                              fetchProjects();
                            }}
                          >
                            <RotateCw className="h-4 w-4" />
                          </Button>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects?.map((project) => (
                      <tr 
                        key={project.id} 
                        className="border-b hover:bg-muted/50 transition-colors"
                      >
                        <td className="p-2">
                          <div className="font-medium">{project.name}</div>
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {project.description || 'No description'}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {new Date(project.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center space-x-2">
                            <Button 
                              size="icon" 
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/project/${project.id}`);
                              }}
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Edit functionality will be implemented later
                                alert('Edit project: ' + project.name);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Delete functionality will be implemented later
                                if (confirm(`Are you sure you want to delete project: ${project.name}?`)) {
                                  alert('Project deletion will be implemented later');
                                }
                              }}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Export functionality will be implemented later
                                alert('Export project: ' + project.name);
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {projects?.length === 0 && (
                  <div className="p-4 text-center text-muted-foreground">
                    No projects found. Create your first project to get started.
                  </div>
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
