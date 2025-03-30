import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Idea, User, Category } from "@shared/schema";
import { Edit, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface IdeaCardProps {
  idea: Idea;
  creator?: {
    id: number;
    username: string;
  };
  isSelected?: boolean;
  onClick?: () => void;
  onStartConnection?: () => void;
  onPositionChange?: (x: string, y: string) => void;
  style?: React.CSSProperties;
  categories?: Category[]; // Añadimos las categorías para poder obtener el color
}

export default function IdeaCard({
  idea,
  creator,
  isSelected = false,
  onClick,
  onStartConnection,
  onPositionChange,
  style,
  categories = [],
}: IdeaCardProps) {
  const { user } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({
    x: parseInt(idea.positionX) || 0,
    y: parseInt(idea.positionY) || 0,
  });
  
  // Actualizar la posición cuando cambian las props de la idea
  useEffect(() => {
    setPosition({
      x: parseInt(idea.positionX) || 0,
      y: parseInt(idea.positionY) || 0,
    });
  }, [idea.positionX, idea.positionY]);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Estado para almacenar el color de la categoría
  const [categoryColor, setCategoryColor] = useState<string | undefined>(undefined);
  
  // Buscar el color de la categoría cuando la idea o las categorías cambien
  useEffect(() => {
    if (idea.categoryId && categories.length > 0) {
      const category = categories.find(cat => cat.id === idea.categoryId);
      if (category) {
        setCategoryColor(category.color);
      }
    }
  }, [idea.categoryId, categories]);

  // Get badge color based on category color
  const getBadgeStyle = (color: string | undefined) => {
    if (!color) {
      return { backgroundColor: "#F1F5F9", color: "#475569" }; // Default gray
    }
    
    // Usar el color directamente para el fondo con transparencia
    const backgroundColor = `${color}25`; // 25 es hexadecimal para 15% de opacidad
    
    // Para el texto, usamos el mismo color pero más oscuro
    const textColor = color;
    
    return { 
      backgroundColor, 
      color: textColor,
      borderColor: `${color}50` // 50 es hexadecimal para 30% de opacidad
    };
  };

  // Get time ago string
  const getTimeAgo = (timestamp: Date) => {
    const seconds = Math.floor((new Date().getTime() - new Date(timestamp).getTime()) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    
    if (seconds < 10) return "just now";
    
    return Math.floor(seconds) + "s ago";
  };

  // Mouse/Touch handlers for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    
    e.stopPropagation();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !cardRef.current) return;
    
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    
    // Update the position
    setPosition({ x: newX, y: newY });
    
    e.preventDefault();
  };

  const handleMouseUp = () => {
    if (isDragging && onPositionChange) {
      onPositionChange(position.x.toString(), position.y.toString());
    }
    setIsDragging(false);
  };

  // Add/remove event listeners for mouse movement
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <Card 
      ref={cardRef}
      className={cn(
        "idea-card w-60 shadow-sm cursor-move transition-all",
        isSelected && "border-2 border-primary",
        isDragging && "opacity-70 shadow-md"
      )}
      style={{
        ...style,
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: isDragging ? 10 : 1,
      }}
      onClick={onClick}
      onMouseDown={handleMouseDown}
    >
      <CardHeader className="p-3 pb-2">
        <div className="flex justify-between items-start">
          <Badge 
            className="font-medium border"
            style={getBadgeStyle(categoryColor)}
          >
            {idea.category || "Sin categoría"}
          </Badge>
          <div className="flex space-x-1">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-gray-500">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-gray-500">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <h3 className="text-sm font-medium text-gray-900">{idea.title}</h3>
        <p className="mt-1 text-xs text-gray-500 line-clamp-3">{idea.description}</p>
        {idea.clarification && (
          <p className="mt-1 text-xs text-gray-500 italic bg-gray-50 p-1 rounded">
            <span className="font-medium">Clarification:</span> {idea.clarification}
          </p>
        )}
        <div className="mt-2 flex justify-between items-center">
          <span className="inline-flex items-center text-xs text-gray-500">
            <div className="h-4 w-4 rounded-full bg-primary-light text-primary text-[8px] flex items-center justify-center mr-1">
              {creator?.username?.substring(0, 1).toUpperCase() || 'U'}
            </div>
            <span className="ml-1">{creator?.username || 'Unknown'}</span>
          </span>
          <span className="text-xs text-gray-400">{getTimeAgo(idea.updatedAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
