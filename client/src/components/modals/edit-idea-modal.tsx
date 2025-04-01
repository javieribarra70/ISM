import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Category, Idea } from "@shared/schema";

interface EditIdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  idea: Idea | null;
  onUpdateIdea: (ideaData: Partial<Idea>) => void;
  isUpdating: boolean;
  projectCategories: Category[];
}

export default function EditIdeaModal({
  isOpen,
  onClose,
  idea,
  onUpdateIdea,
  isUpdating,
  projectCategories,
}: EditIdeaModalProps) {
  // Si no hay idea, no podemos editar nada
  if (!idea) return null;

  const [title, setTitle] = useState(idea.title);
  const [description, setDescription] = useState(idea.description || "");
  const [clarification, setClarification] = useState(idea.clarification || "");
  // Si no hay categoría o es string vacío, usar "sin_categoria" como valor inicial
  const [category, setCategory] = useState(idea.category && idea.category !== "" ? idea.category : "sin_categoria");
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Si la categoría es "sin_categoria", enviamos una cadena vacía
    const finalCategory = category === "sin_categoria" ? "" : category;
    
    onUpdateIdea({
      id: idea.id,
      title,
      description: description || null,
      clarification: clarification || null,
      category: finalCategory,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Idea</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="title" className="text-right">
                Title
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="col-span-3"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="category" className="text-right">
                Category
              </Label>
              <div className="col-span-3">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sin_categoria">No category</SelectItem>
                    {projectCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="col-span-3"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clarification" className="text-right">
                Clarification
              </Label>
              <Textarea
                id="clarification"
                value={clarification}
                onChange={(e) => setClarification(e.target.value)}
                className="col-span-3"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isUpdating}>
              {isUpdating ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}