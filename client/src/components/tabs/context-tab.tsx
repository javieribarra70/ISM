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
  context: z.string().min(1, "El contexto es obligatorio"),
  triggeringQuestion: z.string().min(1, "La pregunta desencadenante es obligatoria"),
  relation: z.string().min(1, "La relación es obligatoria"),
  restriction: z.string().min(1, "La restricción es obligatoria"),
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
        title: "Contexto actualizado",
        description: "La información de contexto ha sido actualizada con éxito.",
      });
      setIsEditing(false);
      refetch();
    },
    onError: (error) => {
      console.error("Error actualizando contexto:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la información de contexto. Intente nuevamente.",
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
    return <p>Cargando información del proyecto...</p>;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Información de Contexto del Proyecto</h1>
        <Button 
          variant="outline" 
          onClick={handleEditToggle}
          className="flex items-center gap-2"
        >
          {isEditing ? <Save size={16} /> : <Edit size={16} />}
          {isEditing ? "Guardar" : "Editar Información"}
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
                    <FormLabel>Contexto</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        rows={6} 
                        placeholder="Describe el contexto de este proyecto (mínimo 400 caracteres recomendados)"
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value.length} caracteres (mínimo 400 recomendados)
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
                    <FormLabel>Pregunta Desencadenante</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        rows={6} 
                        placeholder="¿Cuál es la pregunta desencadenante para este proyecto? (mínimo 400 caracteres recomendados)"
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value.length} caracteres (mínimo 400 recomendados)
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
                    <FormLabel>Relación</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        rows={6} 
                        placeholder="Describe la relación para este proyecto (mínimo 400 caracteres recomendados)"
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value.length} caracteres (mínimo 400 recomendados)
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
                    <FormLabel>Restricción</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        rows={6} 
                        placeholder="Describe las restricciones para este proyecto (mínimo 400 caracteres recomendados)"
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value.length} caracteres (mínimo 400 recomendados)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button type="submit" disabled={updateContextMutation.isPending}>
                Guardar Información
              </Button>
            </form>
          </Form>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Contexto</CardTitle>
                <CardDescription>Información de contexto del proyecto</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-justify">{project.context || "No se ha proporcionado información de contexto."}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Pregunta Desencadenante</CardTitle>
                <CardDescription>La pregunta central que motiva este proyecto</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-justify">{project.triggeringQuestion || "No se ha proporcionado una pregunta desencadenante."}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Relación</CardTitle>
                <CardDescription>Relación entre los elementos del proyecto</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-justify">{project.relation || "No se ha proporcionado información sobre relaciones."}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Restricción</CardTitle>
                <CardDescription>Limitaciones y restricciones del proyecto</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-justify">{project.restriction || "No se han proporcionado restricciones."}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}