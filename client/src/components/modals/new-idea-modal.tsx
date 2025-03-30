import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AVAILABLE_CATEGORIES, type Category } from "@shared/schema";

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
  
  // Al abrir el modal, establecer una categoría por defecto si hay categorías del proyecto disponibles
  useEffect(() => {
    if (isOpen) {
      if (projectCategories && projectCategories.length > 0) {
        // Usa la primera categoría del proyecto si está disponible
        setSelectedCategoryValue(`custom_${projectCategories[0].id}`);
      } else {
        // O usa una categoría predeterminada si no hay categorías de proyecto
        setSelectedCategoryValue("Primary Goal");
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
    
    // Determinar si estamos usando una categoría personalizada o predeterminada
    let categoryId: number | undefined;
    let category: string;
    
    if (selectedCategoryValue.startsWith('custom_')) {
      // Es una categoría personalizada, extraer el ID
      const id = parseInt(selectedCategoryValue.replace('custom_', ''), 10);
      const foundCategory = projectCategories.find(cat => cat.id === id);
      
      if (foundCategory) {
        categoryId = foundCategory.id;
        category = foundCategory.name;
      } else {
        // Fallback si no se encuentra la categoría (no debería ocurrir)
        category = "Primary Goal";
      }
    } else {
      // Es una categoría predeterminada
      category = selectedCategoryValue;
    }
    
    onCreateIdea({
      title,
      description,
      clarification,
      category,
      categoryId, // Incluir el ID de categoría si existe
      positionX,
      positionY
    });
    
    // Reset form after submission
    setTitle("");
    setDescription("");
    setClarification("");
    
    // Reset to default category
    if (projectCategories && projectCategories.length > 0) {
      setSelectedCategoryValue(`custom_${projectCategories[0].id}`);
    } else {
      setSelectedCategoryValue("Primary Goal");
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
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
                  {projectCategories && projectCategories.length > 0 && (
                    <>
                      <SelectItem value="project_categories_header" disabled>
                        <span className="font-semibold">Project Categories</span>
                      </SelectItem>
                      {projectCategories.map((cat) => (
                        <SelectItem key={`custom_${cat.id}`} value={`custom_${cat.id}`}>
                          {cat.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="default_categories_header" disabled>
                        <span className="font-semibold">Default Categories</span>
                      </SelectItem>
                    </>
                  )}
                  
                  {/* Mostrar categorías predeterminadas */}
                  {AVAILABLE_CATEGORIES.map((categoryName) => (
                    <SelectItem key={categoryName} value={categoryName}>
                      {categoryName}
                    </SelectItem>
                  ))}
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
