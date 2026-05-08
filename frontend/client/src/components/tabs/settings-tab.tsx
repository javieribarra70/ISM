import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Project } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Save, Edit } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface SettingsTabProps {
  projectId: number;
}

const formSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  description: z.string().optional(),
});

type ProjectFormValues = z.infer<typeof formSchema>;

export default function SettingsTab({ projectId }: SettingsTabProps) {
  // Local state for anonymous mode
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Get project data
  const { data: project, isLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
  });
  
  // Form for project information
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
    },
    mode: "onChange",
  });
  
  // Set initial state when project data loads
  useEffect(() => {
    if (project) {
      setAnonymousMode(project.anonymousMode || false);
      
      // Populate form with project data
      form.reset({
        name: project.name || "",
        description: project.description || "",
      });
    }
  }, [project, form]);
  
  // Mutation to update settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<Project>) => {
      const response = await apiRequest(
        "PATCH",
        `/api/projects/${projectId}/settings`,
        data
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({
        title: "Settings updated",
        description: "Project settings have been updated successfully.",
      });
      setIsEditing(false);
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
  
  const onSubmitProjectInfo = (data: ProjectFormValues) => {
    updateSettingsMutation.mutate(data);
  };
  
  const handleEditToggle = () => {
    setIsEditing(!isEditing);
  };
  
  if (isLoading || !project) {
    return <p>Loading settings...</p>;
  }
  
  return (
    <div className="space-y-6">
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
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Basic Project Information</CardTitle>
            <CardDescription>
              Basic details of the current project
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            onClick={handleEditToggle}
            className="flex items-center gap-2"
          >
            {isEditing ? <Save size={16} /> : <Edit size={16} />}
            {isEditing ? "Save" : "Edit Information"}
          </Button>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitProjectInfo)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button type="submit" disabled={updateSettingsMutation.isPending}>
                  Save Information
                </Button>
              </form>
            </Form>
          ) : (
            <div className="space-y-6">
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
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Project Context Information</CardTitle>
          <CardDescription>
            The detailed context information for this project is now available in the "Context" tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>For detailed information about project context, triggering questions, relations, and restrictions, please visit the <strong>Context</strong> tab.</p>
        </CardContent>
      </Card>
    </div>
  );
}