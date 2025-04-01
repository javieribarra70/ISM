import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Edit, MoreHorizontal, Trash2, Copy, ArrowUpRight } from "lucide-react";
import { Idea } from "@shared/schema";

interface IdeaContextMenuProps {
  idea: Idea;
  onEdit: (idea: Idea) => void;
  onDelete?: (idea: Idea) => void;
  onDuplicate?: (idea: Idea) => void;
  onMoveToTop?: (idea: Idea) => void;
  children?: React.ReactNode;
}

export default function IdeaContextMenu({
  idea,
  onEdit,
  onDelete,
  onDuplicate,
  onMoveToTop,
  children
}: IdeaContextMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children || (
          <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-gray-500">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(idea)}>
          <Edit className="h-4 w-4 mr-2" />
          Editar idea
        </DropdownMenuItem>
        
        {onDuplicate && (
          <DropdownMenuItem onClick={() => onDuplicate(idea)}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicar
          </DropdownMenuItem>
        )}
        
        {onMoveToTop && (
          <DropdownMenuItem onClick={() => onMoveToTop(idea)}>
            <ArrowUpRight className="h-4 w-4 mr-2" />
            Mover al frente
          </DropdownMenuItem>
        )}
        
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => onDelete(idea)}
              className="text-red-600 hover:text-red-700 focus:text-red-700"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}