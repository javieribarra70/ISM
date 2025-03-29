import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface NewIdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateIdea: (ideaData: { title: string; description: string; category: string; positionX: string; positionY: string }) => void;
  isCreating: boolean;
}

export default function NewIdeaModal({
  isOpen,
  onClose,
  onCreateIdea,
  isCreating
}: NewIdeaModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Primary Goal");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      return; // Prevent submission with empty title
    }
    
    // Generate a random position in the visible area of the canvas
    const positionX = Math.floor(Math.random() * 600).toString();
    const positionY = Math.floor(Math.random() * 400).toString();
    
    onCreateIdea({
      title,
      description,
      category,
      positionX,
      positionY
    });
    
    // Reset form after submission
    setTitle("");
    setDescription("");
    setCategory("Primary Goal");
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
              <Label htmlFor="idea-category">Category</Label>
              <Select
                value={category}
                onValueChange={setCategory}
              >
                <SelectTrigger id="idea-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Primary Goal">Primary Goal</SelectItem>
                  <SelectItem value="Policy">Policy</SelectItem>
                  <SelectItem value="Strategy">Strategy</SelectItem>
                  <SelectItem value="Implementation">Implementation</SelectItem>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
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
