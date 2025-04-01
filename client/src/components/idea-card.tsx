import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Idea, User, Category } from "@shared/schema";
import { Edit } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
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
  clusteringMode?: boolean; // Modo de agrupación de ideas
  allIdeas?: Idea[]; // Todas las ideas para detectar colisiones
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
  clusteringMode = false,
  allIdeas = [],
}: IdeaCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({
    x: parseInt(idea.positionX) || 0,
    y: parseInt(idea.positionY) || 0,
  });
  const [overlappingIdeaId, setOverlappingIdeaId] = useState<number | null>(null);
  const originalPosition = useRef({ x: 0, y: 0 });
  
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

  // Función para detectar colisiones entre ideas
  const checkForCollisions = (currentPosition: { x: number, y: number }) => {
    if (!clusteringMode || !cardRef.current) return null;
    
    const currentRect = {
      left: currentPosition.x,
      top: currentPosition.y,
      right: currentPosition.x + cardRef.current.offsetWidth,
      bottom: currentPosition.y + cardRef.current.offsetHeight
    };
    
    // Buscar tarjetas que se superpongan
    for (const otherIdea of allIdeas) {
      // No detectar colisión con la misma idea
      if (otherIdea.id === idea.id) continue;
      
      // Obtener posición de la otra idea
      const otherX = parseInt(otherIdea.positionX) || 0;
      const otherY = parseInt(otherIdea.positionY) || 0;
      
      // Suponer que todas las tarjetas son del mismo tamaño
      const cardWidth = cardRef.current.offsetWidth;
      const cardHeight = cardRef.current.offsetHeight;
      
      const otherRect = {
        left: otherX,
        top: otherY,
        right: otherX + cardWidth,
        bottom: otherY + cardHeight
      };
      
      // Comprobar si hay colisión (algoritmo simple de detección de colisión de cajas)
      const hasCollision = !(
        currentRect.right < otherRect.left || 
        currentRect.left > otherRect.right || 
        currentRect.bottom < otherRect.top || 
        currentRect.top > otherRect.bottom
      );
      
      if (hasCollision) {
        return otherIdea.id;
      }
    }
    
    return null;
  };

  // Mouse/Touch handlers for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    
    // Guardar la posición original para poder volver si se cancela
    originalPosition.current = { 
      x: position.x, 
      y: position.y 
    };
    
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
    let newX = Math.round(e.clientX - dragStartRef.current.x);
    let newY = Math.round(e.clientY - dragStartRef.current.y);
    
    // Restringir posición dentro de los límites
    // Límite izquierdo (X no puede ser < 0)
    newX = Math.max(0, newX);
    
    // Límite superior (Y no puede ser < 0)
    newY = Math.max(0, newY);
    
    // Obtener el ancho del contenedor padre (el canvas)
    const canvas = cardRef.current.closest('[data-testid="canvas"]') || cardRef.current.parentElement;
    if (canvas) {
      const canvasWidth = canvas.clientWidth;
      const cardWidth = cardRef.current.offsetWidth;
      
      // Límite derecho (X + cardWidth no puede ser > canvasWidth)
      // Agregar padding de 24px (equivalente a p-6)
      newX = Math.min(newX, canvasWidth - cardWidth - 24);
    }
    
    // Actualizar directamente el DOM primero para un movimiento más fluido
    cardRef.current.style.left = `${newX}px`;
    cardRef.current.style.top = `${newY}px`;
    
    // Verificar colisiones cuando está en modo clustering
    if (clusteringMode) {
      const collidingIdeaId = checkForCollisions({ x: newX, y: newY });
      
      // Si hay una colisión con otra idea, cambiamos el estilo del borde para indicar
      // que se puede fusionar si se suelta
      if (collidingIdeaId !== overlappingIdeaId) {
        setOverlappingIdeaId(collidingIdeaId);
        
        // Si hay una idea con la que se puede fusionar, mostramos un estilo visual
        if (collidingIdeaId !== null && cardRef.current) {
          cardRef.current.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.7)"; // Verde para indicar fusión
          cardRef.current.style.transform = "scale(1.02)";
        } else if (cardRef.current) {
          // Si no hay colisión, volvemos al estilo normal
          cardRef.current.style.boxShadow = "";
          cardRef.current.style.transform = "";
        }
      }
    }
    
    // Luego actualizamos el estado React
    setPosition({ x: newX, y: newY });
    
    // Prevenir comportamientos por defecto como la selección de texto
    e.preventDefault();
  };

  const handleMouseUp = () => {
    if (!isDragging || !cardRef.current) {
      setIsDragging(false);
      return;
    }
    
    // Restaurar los estilos visuales aplicados durante el arrastre
    if (cardRef.current) {
      cardRef.current.style.boxShadow = "";
      cardRef.current.style.transform = "";
    }
    
    // Comprobar si estamos en modo clustering y si hay una idea superpuesta
    if (clusteringMode && overlappingIdeaId !== null) {
      // Encontrar la idea con la que se superpone
      const targetIdea = allIdeas.find(i => i.id === overlappingIdeaId);
      
      if (targetIdea) {
        // Mostrar confirmación al usuario
        const confirmMerge = window.confirm(
          `¿Quieres fusionar estas ideas?\n\n` +
          `"${idea.title}" y "${targetIdea.title}"`
        );
        
        if (confirmMerge) {
          toast({
            title: "Fusionando ideas",
            description: "Se combinarán ambas ideas en una nueva",
          });
          
          // Simulamos la fusión para la demo
          // En una implementación real, aquí se llamaría a la API de OpenAI
          // para fusionar el contenido de las ideas
          
          // Por ahora, abrimos el modal de edición con la idea actual
          // En la implementación completa, esto debería abrir un nuevo modal
          // con una fusión generada por IA 
          if (onEdit) {
            onEdit(idea);
          }
          
          // Resetear el estado de superposición
          setOverlappingIdeaId(null);
          setIsDragging(false);
          return;
        } else {
          // Si el usuario cancela, devolvemos la idea a su posición original
          if (cardRef.current) {
            cardRef.current.style.left = `${originalPosition.current.x}px`;
            cardRef.current.style.top = `${originalPosition.current.y}px`;
            
            // Actualizar el estado y la idea
            setPosition(originalPosition.current);
            idea.positionX = originalPosition.current.x.toString();
            idea.positionY = originalPosition.current.y.toString();
            
            // Notificar al componente padre la posición original
            if (onPositionChange) {
              onPositionChange(
                originalPosition.current.x.toString(),
                originalPosition.current.y.toString()
              );
            }
            
            setIsDragging(false);
            setOverlappingIdeaId(null);
            return;
          }
        }
      }
    }
    
    // Si no hubo fusión, procedemos con el comportamiento normal
    // Obtener la posición ACTUAL directamente del elemento DOM
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
    if (onPositionChange) {
      setTimeout(() => {
        onPositionChange(newPosX, newPosY);
      }, 0);
    }
    
    // Desactivar el estado de arrastre al finalizar
    setIsDragging(false);
    setOverlappingIdeaId(null);
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
