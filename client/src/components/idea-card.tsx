import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Idea, User, Category } from "@shared/schema";
import { Edit } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import IdeaContextMenu from "./idea-context-menu";

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
  onEdit?: (idea: Idea) => void;
  onDelete?: (idea: Idea) => void;
  onContextMenu?: boolean;
  anonymousMode?: boolean; // Modo anónimo para ocultar nombres de creadores
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
  onEdit,
  onDelete,
  onContextMenu = false,
  anonymousMode = false,
}: IdeaCardProps) {
  const { user } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({
    x: parseInt(idea.positionX) || 0,
    y: parseInt(idea.positionY) || 0,
  });
  
  // Actualizar la posición cuando cambian las props de la idea
  useEffect(() => {
    console.log(`IdeaCard ${idea.id} recibió actualización de posición: X:${idea.positionX}, Y:${idea.positionY}`);
    
    // Convertir a números y establecer la posición
    const x = parseInt(idea.positionX) || 0;
    const y = parseInt(idea.positionY) || 0;
    
    // Actualizar el estado local con la posición recibida de la base de datos
    setPosition({ x, y });
    
    // Actualizar también los valores iniciales para mantener la coherencia
    if (cardRef.current) {
      cardRef.current.style.left = `${x}px`;
      cardRef.current.style.top = `${y}px`;
    }
  }, [idea.id, idea.positionX, idea.positionY]);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Estado para almacenar el color de la categoría
  const [categoryColor, setCategoryColor] = useState<string | undefined>(undefined);
  
  // Buscar el color de la categoría cuando la idea o las categorías cambien
  useEffect(() => {
    if (idea.category && categories.length > 0) {
      const category = categories.find(cat => cat.name === idea.category);
      if (category) {
        console.log(`Encontrada categoría ${category.name} con color ${category.color}`);
        setCategoryColor(category.color);
      }
    }
  }, [idea.category, categories]);

  // Get badge color based on category
  const getBadgeStyle = (color: string | undefined) => {
    // Añadir logs para debuggear
    console.log(`Idea ${idea.id} - Categoría: ${idea.category}, Color: ${color}`);

    if (!color) {
      // Si no hay color, buscamos por el nombre de la categoría
      if (idea.category && categories.length > 0) {
        const category = categories.find(cat => cat.name === idea.category);
        if (category) {
          console.log(`Encontrado color ${category.color} para categoría ${category.name}`);
          color = category.color;
        }
      }
      
      // Si aún no hay color, usamos el gris por defecto
      if (!color) {
        return { backgroundColor: "#F1F5F9", color: "#475569" }; // Default gray
      }
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

  // Función getTimeAgo eliminada ya que no la necesitamos más

  // Mouse/Touch handlers for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    
    // Activar el estado de arrastre
    setIsDragging(true);
    
    // Calcular y guardar el offset entre la posición del clic y la esquina superior izquierda de la tarjeta
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    
    // Evitar que el evento se propague a elementos padre
    e.stopPropagation();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !cardRef.current) return;
    
    // Calcular la nueva posición restando el offset inicial
    // Esto hace que el movimiento sea relativo al punto donde el usuario hizo clic inicialmente
    const newX = Math.round(e.clientX - dragStartRef.current.x);
    const newY = Math.round(e.clientY - dragStartRef.current.y);
    
    // Actualizar directamente el DOM primero para un movimiento más fluido
    // Esto es lo más importante para que el elemento siga exactamente al cursor
    cardRef.current.style.left = `${newX}px`;
    cardRef.current.style.top = `${newY}px`;
    
    // Luego actualizamos el estado React (pero el DOM ya está actualizado)
    // Usamos los mismos valores exactos para evitar cualquier discrepancia
    setPosition({ x: newX, y: newY });
    
    // Prevenir comportamientos por defecto como la selección de texto
    e.preventDefault();
  };

  const handleMouseUp = () => {
    if (isDragging && onPositionChange && cardRef.current) {
      // Obtener la posición ACTUAL directamente del elemento DOM
      // Esto garantiza que usamos la posición final exacta donde el usuario soltó el cursor
      const finalPosition = {
        x: parseInt(cardRef.current.style.left || '0px') || position.x,
        y: parseInt(cardRef.current.style.top || '0px') || position.y
      };
      
      // Convertir a string para la API
      const newPosX = finalPosition.x.toString();
      const newPosY = finalPosition.y.toString();
      
      console.log(`Card dropped at final DOM position: X:${newPosX}, Y:${newPosY}`);
      
      // Actualizar el estado React para mantener sincronizado el componente
      setPosition(finalPosition);
      
      // Actualizar los valores de la idea para mantener la coherencia
      idea.positionX = newPosX;
      idea.positionY = newPosY;
      
      // Asegurar que el DOM refleja exactamente esta posición final
      cardRef.current.style.left = `${finalPosition.x}px`;
      cardRef.current.style.top = `${finalPosition.y}px`;
      
      // Notificar al componente padre para guardar la posición en la base de datos
      // con un pequeño retraso para asegurar que todo está actualizado
      setTimeout(() => {
        onPositionChange(newPosX, newPosY);
      }, 0);
    }
    
    // Desactivar el estado de arrastre al finalizar
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
        "idea-card w-60 shadow-sm cursor-move",
        isSelected && "border-2 border-primary",
        isDragging ? "opacity-80 shadow-md transition-none" : "transition-all duration-200"
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
            className="font-medium border select-none"
            style={getBadgeStyle(categoryColor)}
          >
            {idea.category || "Sin categoría"}
          </Badge>
          <div className="flex space-x-1">
            {user && (user.role === "admin" || idea.createdBy === user.id) && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-gray-400 hover:text-gray-500"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onEdit) onEdit(idea);
                }}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onContextMenu && user && (user.role === "admin" || idea.createdBy === user.id) && (
              <IdeaContextMenu 
                idea={idea} 
                onEdit={onEdit || (() => {})}
                onDelete={onDelete}
              />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 select-none">
        <h3 className="text-sm font-medium text-gray-900">{idea.title}</h3>
        <p className="mt-1 text-xs text-gray-500 line-clamp-3">{idea.description}</p>
        {idea.clarification && (
          <p className="mt-1 text-xs text-gray-500 italic bg-gray-50 p-1 rounded">
            <span className="font-medium">Clarification:</span> {idea.clarification}
          </p>
        )}
        {!anonymousMode && (
          <div className="mt-2 flex items-center">
            <span className="inline-flex items-center text-xs text-gray-500">
              <div className="h-4 w-4 rounded-full bg-primary-light text-primary text-[8px] flex items-center justify-center mr-1">
                {creator?.username?.substring(0, 1).toUpperCase() || 'U'}
              </div>
              <span className="ml-1">{creator?.username || 'Unknown'}</span>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
