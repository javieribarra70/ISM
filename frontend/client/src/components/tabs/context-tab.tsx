import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Project } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Edit, Save } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface ContextTabProps {
  projectId: number;
}

const formSchema = z.object({
  context: z.string().min(1, "Context is required"),
  triggeringQuestion: z.string().min(1, "Triggering question is required"),
  relation: z.string().min(1, "Relation is required"),
  restriction: z.string().min(1, "Restriction is required"),
});

type ContextFormValues = z.infer<typeof formSchema>;

export default function ContextTab({ projectId }: ContextTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  
  // Get project data
  const { data: project, isLoading, refetch } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
  });
  
  // Form for project information
  const form = useForm<ContextFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      context: "",
      triggeringQuestion: "",
      relation: "",
      restriction: "",
    },
    mode: "onChange",
  });
  
  // Set initial state when project data loads
  useEffect(() => {
    if (project) {
      form.reset({
        context: project.context || "",
        triggeringQuestion: project.triggeringQuestion || "",
        relation: project.relation || "",
        restriction: project.restriction || "",
      });
    }
  }, [project, form]);
  
  // Mutation to update context fields
  const updateContextMutation = useMutation({
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
        title: "Context updated",
        description: "Context information has been successfully updated.",
      });
      setIsEditing(false);
      refetch();
    },
    onError: (error) => {
      console.error("Error updating context:", error);
      toast({
        title: "Error",
        description: "Could not update context information. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const onSubmitContextInfo = (data: ContextFormValues) => {
    updateContextMutation.mutate(data);
  };
  
  const handleEditToggle = () => {
    setIsEditing(!isEditing);
  };
  
  if (isLoading || !project) {
    return <p>Loading project information...</p>;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Project Context Information</h1>
        <Button 
          variant="outline" 
          onClick={handleEditToggle}
          className="flex items-center gap-2"
        >
          {isEditing ? <Save size={16} /> : <Edit size={16} />}
          {isEditing ? "Save" : "Edit Information"}
        </Button>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6">
        {isEditing ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitContextInfo)} className="space-y-6">
              <FormField
                control={form.control}
                name="context"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Context</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        rows={6} 
                        placeholder="Describe the context of this project (minimum 400 characters recommended)"
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value.length} characters (minimum 400 recommended)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="triggeringQuestion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Triggering Question</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        rows={6} 
                        placeholder="What is the triggering question for this project? (minimum 400 characters recommended)"
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value.length} characters (minimum 400 recommended)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="relation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relation</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        rows={6} 
                        placeholder="Describe the relation for this project (minimum 400 characters recommended)"
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value.length} characters (minimum 400 recommended)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="restriction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Restriction</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        rows={6} 
                        placeholder="Describe the restrictions for this project (minimum 400 characters recommended)"
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value.length} characters (minimum 400 recommended)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button type="submit" disabled={updateContextMutation.isPending}>
                Save Information
              </Button>
            </form>
          </Form>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Context</CardTitle>
                <CardDescription>Project context information</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-justify">{project.context || "No context information has been provided."}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Triggering Question</CardTitle>
                <CardDescription>The central question that motivates this project</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-justify">{project.triggeringQuestion || "No triggering question has been provided."}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Relation</CardTitle>
                <CardDescription>Relationship between project elements</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-justify">{project.relation || "No relation information has been provided."}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Restriction</CardTitle>
                <CardDescription>Project limitations and restrictions</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-justify">{project.restriction || "No restrictions have been provided."}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}