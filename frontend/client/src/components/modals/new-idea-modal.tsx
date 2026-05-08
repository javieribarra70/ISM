import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Category } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface NewIdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateIdea: (ideaData: { 
    title: string; 
    description: string; 
    clarification: string; 
    category: string; 
    categoryId?: number;  // Agregamos categoryId opcional
    positionX: string; 
    positionY: string 
  }) => void;
  isCreating: boolean;
  projectCategories?: Category[]; // Lista de categorías específicas del proyecto
}

export default function NewIdeaModal({
  isOpen,
  onClose,
  onCreateIdea,
  isCreating,
  projectCategories = [] // Categorías específicas del proyecto
}: NewIdeaModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clarification, setClarification] = useState(""); // Agregamos estado para clarificación
  const [selectedCategoryValue, setSelectedCategoryValue] = useState<string>("");
  const { toast } = useToast();
  
  // Al abrir el modal, establecer una categoría por defecto de entre las del proyecto
  useEffect(() => {
    if (isOpen) {
      if (projectCategories && projectCategories.length > 0) {
        // Usar la primera categoría del proyecto si está disponible
        setSelectedCategoryValue(`custom_${projectCategories[0].id}`);
      } else {
        // Si no hay categorías de proyecto, dejar en blanco
        setSelectedCategoryValue("");
      }
    }
  }, [isOpen, projectCategories]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      return; // Prevent submission with empty title
    }
    
    // Generate a random position in the visible area of the canvas
    const positionX = Math.floor(Math.random() * 600).toString();
    const positionY = Math.floor(Math.random() * 400).toString();
    
    // Validar que se haya seleccionado una categoría válida del proyecto
    if (!selectedCategoryValue || 
        selectedCategoryValue === "no_categories" || 
        selectedCategoryValue === "project_categories_header") {
      // Mostrar un mensaje de error: se necesita seleccionar una categoría válida
      toast({
        title: "Error",
        description: "Por favor selecciona una categoría válida",
        variant: "destructive",
      });
      return;
    }
    
    // Obtener el ID y nombre de la categoría seleccionada
    let categoryId: number | undefined;
    let category: string = "";
    
    if (selectedCategoryValue.startsWith('custom_')) {
      // Es una categoría del proyecto, extraer el ID
      const id = parseInt(selectedCategoryValue.replace('custom_', ''), 10);
      const foundCategory = projectCategories.find(cat => cat.id === id);
      
      if (foundCategory) {
        categoryId = foundCategory.id;
        category = foundCategory.name;
      } else {
        // Si no se encuentra la categoría, mostrar un mensaje de error
        toast({
          title: "Error",
          description: "La categoría seleccionada no es válida o ya no existe",
          variant: "destructive",
        });
        return;
      }
    } else {
      // Si no es una categoría del proyecto válida, mostrar un mensaje de error
      toast({
        title: "Error",
        description: "Formato de categoría inválido",
        variant: "destructive",
      });
      return;
    }
    
    // Enviar los datos al componente padre
    onCreateIdea({
      title,
      description,
      clarification,
      category, // Nombre de la categoría
      categoryId, // ID de la categoría
      positionX,
      positionY
    });
    
    // Reset form after submission
    setTitle("");
    setDescription("");
    setClarification("");
    
    // Reset to default category if available
    if (projectCategories && projectCategories.length > 0) {
      setSelectedCategoryValue(`custom_${projectCategories[0].id}`);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-[425px]"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        <DialogHeader>
          <DialogTitle>Add New Idea</DialogTitle>
          <DialogDescription>
            Create a new idea for your project. Ideas can be connected to form relationships.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="idea-title">Title</Label>
              <Input
                id="idea-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter idea title"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="idea-description">Description</Label>
              <Textarea
                id="idea-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your idea"
                rows={3}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="idea-clarification">Clarification</Label>
              <Textarea
                id="idea-clarification"
                value={clarification}
                onChange={(e) => setClarification(e.target.value)}
                placeholder="Add any clarifications for this idea"
                rows={2}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="idea-category">Category</Label>
              <Select
                value={selectedCategoryValue}
                onValueChange={setSelectedCategoryValue}
              >
                <SelectTrigger id="idea-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {/* Mostrar categorías del proyecto si están disponibles */}
                  {projectCategories && projectCategories.length > 0 ? (
                    <>
                      <SelectItem value="project_categories_header" disabled>
                        <span className="font-semibold">Categorías del Proyecto</span>
                      </SelectItem>
                      {projectCategories.map((cat) => (
                        <SelectItem key={`custom_${cat.id}`} value={`custom_${cat.id}`}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </>
                  ) : (
                    <SelectItem value="no_categories" disabled>
                      No hay categorías disponibles
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={isCreating || !title.trim()}
            >
              {isCreating ? "Adding..." : "Add Idea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
