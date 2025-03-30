import { useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Category } from "@shared/schema";

interface NewCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCategory: (categoryData: { name: string; description?: string; color: string }) => void;
  isSubmitting: boolean;
  category?: Category | null;
  isEditMode?: boolean;
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
  color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
    message: "El color debe ser un código hexadecimal válido (ej: #FF5733)"
  }).default("#E2E8F0"),
});

export default function NewCategoryModal({
  isOpen,
  onClose,
  onSaveCategory,
  isSubmitting,
  category,
  isEditMode = false
}: NewCategoryModalProps) {
  // Configuración del formulario con react-hook-form y zod
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: category?.name || "",
      description: category?.description || "",
      color: category?.color || "#E2E8F0",
    },
  });

  // Actualizar el formulario cuando cambia la categoría seleccionada
  useEffect(() => {
    if (category) {
      form.reset({
        name: category.name,
        description: category.description || "",
        color: category.color || "#E2E8F0",
      });
    } else {
      form.reset({
        name: "",
        description: "",
        color: "#E2E8F0",
      });
    }
  }, [category, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    onSaveCategory(values);
  };

  const generateRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    form.setValue("color", color);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {isEditMode ? 'Editar Categoría' : 'Crear Nueva Categoría'}
          </DialogTitle>
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
            
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <div className="flex gap-2 items-center">
                    <FormControl>
                      <Input type="color" {...field} className="w-12 h-10 p-1" />
                    </FormControl>
                    <Input 
                      type="text" 
                      placeholder="#E2E8F0" 
                      value={field.value} 
                      onChange={field.onChange} 
                      className="flex-1"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={generateRandomColor}
                    >
                      Aleatorio
                    </Button>
                  </div>
                  <FormDescription>
                    Selecciona un color para identificar visualmente esta categoría.
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
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="bg-primary text-white"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isEditMode ? 'Guardando...' : 'Creando...'}
                  </>
                ) : (
                  isEditMode ? 'Guardar Cambios' : 'Crear Categoría'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}