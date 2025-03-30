import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Sidebar from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { User as SelectUser, Project } from "@shared/schema";
import { Loader2, UserPlus, FolderOpen, Edit, Trash, Download, RotateCw, UserCog, ShieldAlert, Shield } from "lucide-react";
import { useUsers } from "@/hooks/use-users";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Schema validación para crear nuevo usuario
const createUserSchema = z.object({
  username: z.string().min(3, {
    message: "Username must be at least 3 characters.",
  }),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters.",
  }),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

function UserManagementSection() {
  const { users, isLoading, updateUserRoleMutation, deleteUserMutation } = useUsers();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Formulario para crear nuevo usuario
  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
    },
  });
  
  // Función para crear usuario
  async function onSubmit(data: CreateUserFormValues) {
    try {
      // Cancelar consultas en curso
      await queryClient.cancelQueries({ queryKey: ["/api/users"] });
      
      // Guardar la data previa por si necesitamos hacer un rollback
      const previousUsers = queryClient.getQueryData<SelectUser[]>(["/api/users"]);
      
      // Optimistic update con un usuario temporal (id provisional)
      const tempUser: SelectUser = { 
        ...data, 
        id: Date.now(), // ID temporal que se reemplazará con la respuesta del servidor
        role: 'user',
        createdBy: 2, // ID del usuario actual 
        createdAt: new Date()
      };
      
      // Actualizar la lista de usuarios en la caché de forma optimista
      queryClient.setQueryData(["/api/users"], (oldData: SelectUser[] | undefined) => {
        if (!oldData) return [tempUser];
        return [...oldData, tempUser];
      });
      
      // Realizar la petición real
      const response = await apiRequest("POST", "/api/users", data);
      const newUser = await response.json();
      
      toast({
        title: "Success",
        description: `User ${newUser.username} created successfully`,
      });
      
      // Cerrar el diálogo y restablecer el formulario
      setIsDialogOpen(false);
      form.reset();
      
      // Actualizar la lista de usuarios con el dato real devuelto por el servidor
      queryClient.setQueryData(["/api/users"], (oldData: SelectUser[] | undefined) => {
        if (!oldData) return [newUser];
        // Reemplazar el usuario temporal con el real
        return oldData.map(user => user.id === tempUser.id ? newUser : user);
      });
      
      // Invalidar la caché para una actualización completa
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create user. Please try again.",
        variant: "destructive",
      });
      console.error("Error creating user:", error);
      
      // Restaurar el estado anterior en caso de error
      const previousUsers = queryClient.getQueryData<SelectUser[]>(["/api/users"]);
      if (previousUsers) {
        queryClient.setQueryData(["/api/users"], previousUsers);
      }
    }
  }
  
  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  const handleRoleChange = (userId: number, newRole: 'admin' | 'user') => {
    if (confirm(`¿Estás seguro de que deseas cambiar el rol de este usuario a ${newRole}?`)) {
      updateUserRoleMutation.mutate({ userId, role: newRole });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">User Management</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <UserPlus className="mr-2 h-4 w-4" />
              Add New User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new user to your organization. All users created by you will have regular user permissions.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="example@email.com" type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input placeholder="password" type="password" {...field} />
                      </FormControl>
                      <FormDescription>
                        Must be at least 6 characters
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <DialogFooter>
                  <Button 
                    type="submit" 
                    disabled={form.formState.isSubmitting}
                    className="w-full"
                  >
                    {form.formState.isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create User'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Manage user accounts and permissions</CardDescription>
        </CardHeader>
        <CardContent>
          {users && users.length > 0 ? (
            <div className="overflow-hidden border rounded-md">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left whitespace-nowrap p-2 font-medium">Username</th>
                    <th className="text-left whitespace-nowrap p-2 font-medium">Email</th>
                    <th className="text-left whitespace-nowrap p-2 font-medium">Current Role</th>
                    <th className="text-left whitespace-nowrap p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr 
                      key={user.id} 
                      className="border-b hover:bg-muted/50 transition-colors"
                    >
                      <td className="p-2">
                        <div className="font-medium">{user.username}</div>
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {user.email || 'No email'}
                      </td>
                      <td className="p-2">
                        <Badge variant={user.role === 'admin' ? "default" : "outline"}>
                          {user.role === 'admin' ? (
                            <ShieldAlert className="mr-1 h-3 w-3 inline" />
                          ) : (
                            <Shield className="mr-1 h-3 w-3 inline" />
                          )}
                          {user.role}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center space-x-2">
                          <Select
                            onValueChange={(value) => handleRoleChange(user.id, value as 'admin' | 'user')}
                            defaultValue={user.role}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="Cambiar rol" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="user">Usuario</SelectItem>
                            </SelectContent>
                          </Select>
                          
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-9 w-9 text-destructive hover:bg-destructive hover:text-white transition-colors"
                            onClick={() => {
                              if (confirm('¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer.')) {
                                deleteUserMutation.mutate(user.id);
                              }
                            }}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Alert>
              <UserCog className="h-4 w-4" />
              <AlertTitle>No users found</AlertTitle>
              <AlertDescription>
                There are no users in the system yet.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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
          if (tabParam && ['projects', 'users', 'reports', 'settings'].includes(tabParam)) {
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
      clearTimeout(window.tabChangeTimeout);
    }
    
    // Get tab from URL search params with a slight delay to ensure DOM is ready
    window.tabChangeTimeout = setTimeout(() => {
      const searchParams = new URLSearchParams(window.location.search);
      const tabParam = searchParams.get('tab');
      
      if (tabParam && ['projects', 'users', 'reports', 'settings'].includes(tabParam)) {
        console.log("Setting active tab from URL param:", tabParam);
        setActiveTab(tabParam);
      } else if (location === "/admin") {
        // Default to projects when no tab specified
        setActiveTab("projects");
      }
    }, 50);
    
    // Cleanup function to clear the timeout
    return () => {
      if (window.tabChangeTimeout) {
        clearTimeout(window.tabChangeTimeout);
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
          </div>

          <div className="mt-6">
            {/* Contenido específico para cada sección basado en activeTab */}
            {activeTab === "projects" && (
              <div className="space-y-4">
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
              </div>
            )}
            
            {activeTab === "users" && (
              <UserManagementSection />
            )}

            {activeTab === "reports" && (
              <div className="space-y-4">
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
              </div>
            )}
            
            {activeTab === "settings" && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>System Settings</CardTitle>
                    <CardDescription>Configure application settings and preferences</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-medium">Application Settings</h3>
                        <div className="mt-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Appearance</p>
                              <p className="text-sm text-muted-foreground">Choose your preferred visual theme</p>
                            </div>
                            <select className="border rounded px-3 py-2 w-40">
                              <option value="light">Light</option>
                              <option value="dark">Dark</option>
                              <option value="system">System</option>
                            </select>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Language</p>
                              <p className="text-sm text-muted-foreground">Set your preferred language</p>
                            </div>
                            <select className="border rounded px-3 py-2 w-40">
                              <option value="en">English</option>
                              <option value="es">Español</option>
                              <option value="fr">Français</option>
                            </select>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Notifications</p>
                              <p className="text-sm text-muted-foreground">Receive email notifications</p>
                            </div>
                            <div className="flex h-6 items-center">
                              <input type="checkbox" className="h-4 w-4" defaultChecked />
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <hr className="my-4" />
                      
                      <div>
                        <h3 className="text-lg font-medium">Database Backup</h3>
                        <p className="text-sm text-muted-foreground mt-1 mb-4">
                          Create and manage database backups
                        </p>
                        
                        <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                          <Button variant="outline">
                            <Download className="mr-2 h-4 w-4" />
                            Create Backup
                          </Button>
                          <Button variant="outline">
                            <Download className="mr-2 h-4 w-4" />
                            Download Latest
                          </Button>
                        </div>
                      </div>
                      
                      <hr className="my-4" />
                      
                      <div>
                        <h3 className="text-lg font-medium">System Information</h3>
                        <div className="grid gap-4 mt-4">
                          <div className="grid grid-cols-2 items-center gap-4">
                            <div className="font-medium">Version</div>
                            <div>1.0.0</div>
                          </div>
                          <div className="grid grid-cols-2 items-center gap-4">
                            <div className="font-medium">Database</div>
                            <div>PostgreSQL</div>
                          </div>
                          <div className="grid grid-cols-2 items-center gap-4">
                            <div className="font-medium">Last Update</div>
                            <div>{new Date().toLocaleDateString()}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}