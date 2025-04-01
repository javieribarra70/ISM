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
  const lastCollisionCheck = useRef<number | null>(null);
  
  // Actualizar la posición cuando cambian las props de la idea
  useEffect(() => {
    console.log(`IdeaCard ${idea.id} recibió actualización de posición: X:${idea.positionX || '0'}, Y:${idea.positionY || '0'}`);
    
    // Convertir a números y establecer la posición, asegurando que siempre tenemos un valor válido
    const x = parseInt(String(idea.positionX || '0')) || 0;
    const y = parseInt(String(idea.positionY || '0')) || 0;
    
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
    if (!clusteringMode) {
      console.log(`Modo clustering desactivado, no se verifican colisiones para idea ${idea.id}`);
      return null;
    }
    
    if (!cardRef.current) {
      console.log(`No hay referencia DOM para idea ${idea.id}, no se pueden verificar colisiones`);
      return null;
    }
    
    console.log(`VERIFICANDO COLISIONES para idea ${idea.id} en posición (${currentPosition.x}, ${currentPosition.y})`);
    
    // Dimensiones de la tarjeta actual
    const cardWidth = cardRef.current.offsetWidth;
    const cardHeight = cardRef.current.offsetHeight;
    
    const currentRect = {
      left: currentPosition.x,
      top: currentPosition.y,
      right: currentPosition.x + cardWidth,
      bottom: currentPosition.y + cardHeight
    };
    
    // Mostrar rectángulo de la tarjeta actual para depuración
    console.log(`Tarjeta actual ${idea.id}: (${currentRect.left}, ${currentRect.top}) - (${currentRect.right}, ${currentRect.bottom})`);
    
    // Buscar tarjetas que se superpongan con un umbral de superposición mínimo (ahora 20% en lugar de 30% para facilitar)
    for (const otherIdea of allIdeas) {
      // No detectar colisión con la misma idea
      if (otherIdea.id === idea.id) continue;
      
      // Obtener posición de la otra idea con manejo seguro de valores nulos/undefined
      const otherX = parseInt(String(otherIdea.positionX || '0')) || 0;
      const otherY = parseInt(String(otherIdea.positionY || '0')) || 0;
      
      const otherRect = {
        left: otherX,
        top: otherY,
        right: otherX + cardWidth,
        bottom: otherY + cardHeight
      };
      
      // Mostrar rectángulo de la otra tarjeta para depuración
      console.log(`Comparando con tarjeta ${otherIdea.id}: (${otherRect.left}, ${otherRect.top}) - (${otherRect.right}, ${otherRect.bottom})`);
      
      // Verificar primero si hay alguna superposición en absoluto
      // Algoritmo simplificado: si el centro de una tarjeta está dentro de la otra, consideramos colisión
      const currentCenterX = currentRect.left + (cardWidth / 2);
      const currentCenterY = currentRect.top + (cardHeight / 2);
      
      const isPointInRect = (x: number, y: number, rect: any) => {
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      };
      
      // Verificamos si el centro de la tarjeta actual está dentro de la otra tarjeta
      const currentCenterInOther = isPointInRect(currentCenterX, currentCenterY, otherRect);
      
      // O si el centro de la otra tarjeta está dentro de la tarjeta actual
      const otherCenterX = otherRect.left + (cardWidth / 2);
      const otherCenterY = otherRect.top + (cardHeight / 2);
      const otherCenterInCurrent = isPointInRect(otherCenterX, otherCenterY, currentRect);
      
      // Si cualquiera de los centros está dentro de la otra tarjeta, consideramos que hay superposición
      const hasOverlap = currentCenterInOther || otherCenterInCurrent;
      
      console.log(`Verificando centros - Actual(${currentCenterX},${currentCenterY}) en Otra: ${currentCenterInOther}, Otra(${otherCenterX},${otherCenterY}) en Actual: ${otherCenterInCurrent}`);
      
      if (!hasOverlap) {
        console.log(`No hay superposición con idea ${otherIdea.id}`);
        continue;
      }
      
      // Calcular el área de superposición
      const overlapX = Math.max(0, Math.min(currentRect.right, otherRect.right) - Math.max(currentRect.left, otherRect.left));
      const overlapY = Math.max(0, Math.min(currentRect.bottom, otherRect.bottom) - Math.max(currentRect.top, otherRect.top));
      const overlapArea = overlapX * overlapY;
      
      // Área de la tarjeta actual
      const currentArea = cardWidth * cardHeight;
      
      // Porcentaje de superposición
      const overlapPercentage = overlapArea / currentArea;
      
      console.log(`Superposición con idea ${otherIdea.id}: ${Math.round(overlapPercentage * 100)}%`);
      
      // Consideramos colisión ahora si hay al menos un 20% de superposición (era 30%)
      if (overlapPercentage >= 0.2) {
        console.log(`¡COLISIÓN DETECTADA con idea ${otherIdea.id}!`);
        return otherIdea.id;
      }
    }
    
    console.log(`No se detectaron colisiones para idea ${idea.id}`);
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
      // Solo verificamos colisiones cada 100ms para mejorar rendimiento
      const now = Date.now();
      if (!lastCollisionCheck.current || now - lastCollisionCheck.current > 100) {
        lastCollisionCheck.current = now;
        
        const collidingIdeaId = checkForCollisions({ x: newX, y: newY });
        
        // Si hay una colisión con otra idea, cambiamos el estilo del borde para indicar
        // que se puede fusionar si se suelta
        if (collidingIdeaId !== overlappingIdeaId) {
          console.log(`Estado de superposición cambió: idea ${idea.id} ahora superpuesta con idea ${collidingIdeaId || 'ninguna'}`);
          setOverlappingIdeaId(collidingIdeaId);
          
          // Si hay una idea con la que se puede fusionar, mostramos un estilo visual
          if (collidingIdeaId !== null && cardRef.current) {
            console.log(`Aplicando estilo de colisión para fusión potencial entre ideas ${idea.id} y ${collidingIdeaId}`);
            cardRef.current.style.boxShadow = "0 0 0 5px rgba(34, 197, 94, 0.7)"; // Verde para indicar fusión
            cardRef.current.style.transform = "scale(1.05)";
            
            // También aplicamos un estilo a la otra tarjeta para mejor feedback visual
            const otherCardElement = document.querySelector(`[data-idea-id="${collidingIdeaId}"]`);
            if (otherCardElement) {
              otherCardElement.classList.add('merge-highlight');
            }
          } else if (cardRef.current) {
            // Si no hay colisión, volvemos al estilo normal
            cardRef.current.style.boxShadow = "";
            cardRef.current.style.transform = "";
            
            // Quitar todos los estilos de resaltado de fusión
            document.querySelectorAll('.merge-highlight').forEach(el => {
              el.classList.remove('merge-highlight');
            });
          }
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
    
    // Obtenemos la posición actual para verificar colisiones en el momento de soltar el mouse
    const currentX = parseInt(cardRef.current.style.left || '0px');
    const currentY = parseInt(cardRef.current.style.top || '0px');
    
    // Verificar explícitamente si hay colisión en el momento de soltar
    let finalOverlappingId = null;
    if (clusteringMode) {
      finalOverlappingId = checkForCollisions({ x: currentX, y: currentY });
      console.log(`Verificación final de colisión al soltar: ${finalOverlappingId || 'ninguna'}`);
    }
    
    // Restaurar los estilos visuales aplicados durante el arrastre
    if (cardRef.current) {
      cardRef.current.style.boxShadow = "";
      cardRef.current.style.transform = "";
      
      // Eliminar cualquier clase de resaltado
      document.querySelectorAll('.merge-highlight').forEach(el => {
        el.classList.remove('merge-highlight');
      });
    }
    
    console.log(`Mouse liberado en modo clustering: ${clusteringMode}, idea superpuesta: ${finalOverlappingId || overlappingIdeaId}`)
    
    // Usar el ID de colisión detectado en el momento de soltar o el que ya teníamos
    const targetIdeaId = finalOverlappingId || overlappingIdeaId;
    
    // Comprobar si estamos en modo clustering y si hay una idea superpuesta
    if (clusteringMode && targetIdeaId !== null) {
      // Encontrar la idea con la que se superpone
      const targetIdea = allIdeas.find(i => i.id === targetIdeaId);
      
      if (targetIdea) {
        // Mostrar confirmación al usuario
        const confirmMerge = window.confirm(
          `¿Quieres fusionar estas ideas?\n\n` +
          `"${idea.title}" y "${targetIdea.title}"`
        );
        
        if (confirmMerge) {
          toast({
            title: "Fusionando ideas con IA",
            description: "Procesando la combinación usando OpenAI...",
          });
          
          // Usar el nuevo endpoint para fusionar ideas con IA
          fetch(`/api/projects/${idea.projectId}/merge-ideas`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              idea1Id: idea.id,
              idea2Id: targetIdea.id,
              deleteOriginals: false // No eliminaremos las originales automáticamente
            })
          })
          .then(response => {
            if (!response.ok) {
              throw new Error(`Error en la fusión: ${response.status}`);
            }
            return response.json();
          })
          .then(data => {
            // Mostrar la nueva idea fusionada
            console.log("Ideas fusionadas con éxito:", data);
            
            toast({
              title: "¡Fusión completada!",
              description: "Las ideas se han combinado con IA. Refresca para ver los cambios."
            });
            
            // Opcional: recargar la página para mostrar la nueva idea fusionada
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          })
          .catch(error => {
            console.error("Error al fusionar ideas:", error);
            
            toast({
              title: "Error al fusionar ideas",
              description: "Ocurrió un problema al combinar las ideas. Utilizando fusión simple.",
              variant: "destructive"
            });
            
            // Fallback: utilizar la fusión simple anterior si falla el API
            const combinedTitle = `${idea.title} + ${targetIdea.title}`;
            const combinedDescription = `${idea.description}\n\n${targetIdea.description}`;
            
            // Si hay aclaración en ambas ideas, las combinamos también
            let combinedClarification = "";
            if (idea.clarification || targetIdea.clarification) {
              combinedClarification = [
                idea.clarification || "",
                targetIdea.clarification || ""
              ].filter(Boolean).join("\n\n");
            }
            
            // Crear una copia de la idea actual con los datos combinados
            const mergedIdea = {
              ...idea,
              title: combinedTitle,
              description: combinedDescription,
              clarification: combinedClarification || idea.clarification
            };
            
            // Abrir el modal de edición con la idea combinada como fallback
            if (onEdit) {
              onEdit(mergedIdea);
            }
          });
          
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
  
  // Efecto para detectar cambios en el modo clustering
  useEffect(() => {
    console.log(`Modo clustering: ${clusteringMode ? 'activado' : 'desactivado'} para idea ${idea.id}`);
    
    // Si tenemos referencia al elemento DOM, actualizamos su atributo
    if (cardRef.current) {
      cardRef.current.setAttribute('data-clustering-enabled', clusteringMode ? 'true' : 'false');
    }
  }, [clusteringMode, idea.id]);

  return (
    <Card 
      ref={cardRef}
      data-idea-id={idea.id}
      className={cn(
        "idea-card w-60 shadow-sm cursor-move",
        isSelected && "border-2 border-primary",
        isDragging ? "opacity-80 shadow-md transition-none" : "transition-all duration-200",
        overlappingIdeaId ? "merge-target" : ""
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
