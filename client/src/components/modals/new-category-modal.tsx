import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, Loader2 } from "lucide-react";

// Esquema de validación
const categorySchema = z.object({
  name: z.string().min(3, { message: "El nombre debe tener al menos 3 caracteres" }),
  description: z.string().optional(),
});

// Tipado para los datos del formulario
type CategoryFormData = z.infer<typeof categorySchema>;

interface NewCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCategory: (data: CategoryFormData) => void;
  isCreating: boolean;
}

export default function NewCategoryModal({
  isOpen,
  onClose,
  onCreateCategory,
  isCreating
}: NewCategoryModalProps) {
  // Inicializar el formulario con react-hook-form
  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // Función que se ejecuta al enviar el formulario
  const onSubmit = (data: CategoryFormData) => {
    onCreateCategory(data);
  };

  // Resetear el formulario cuando se cierre el modal
  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex justify-between items-center">
            <span>Crear Nueva Categoría</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 rounded-full" 
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la categoría</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ej: Problemas Técnicos" 
                      {...field} 
                      autoFocus
                    />
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
                  <FormLabel>Descripción (opcional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Breve descripción de la categoría"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isCreating}
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  'Crear Categoría'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}