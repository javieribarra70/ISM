import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface NewCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCategory: (categoryData: { name: string; description?: string }) => void;
  isCreating: boolean;
}

// Schema para validar el formulario
const formSchema = z.object({
  name: z.string().min(3, {
    message: "El nombre debe tener al menos 3 caracteres.",
  }).max(50, {
    message: "El nombre no puede exceder los 50 caracteres."
  }),
  description: z.string().max(200, {
    message: "La descripción no puede exceder los 200 caracteres."
  }).optional(),
});

export default function NewCategoryModal({
  isOpen,
  onClose,
  onCreateCategory,
  isCreating
}: NewCategoryModalProps) {
  // Configuración del formulario con react-hook-form y zod
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    onCreateCategory(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Crear Nueva Categoría</DialogTitle>
          <DialogDescription>
            Las categorías ayudan a organizar las ideas en grupos temáticos.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Categoría</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Problemas Técnicos" {...field} />
                  </FormControl>
                  <FormDescription>
                    Elige un nombre descriptivo para la categoría.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe el propósito de esta categoría" 
                      className="resize-none h-24"
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Proporciona más contexto sobre el tipo de ideas que pertenecen a esta categoría.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="pt-4">
              <Button 
                variant="outline" 
                type="button" 
                onClick={onClose}
                disabled={isCreating}
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="bg-primary text-white"
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  "Crear Categoría"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}