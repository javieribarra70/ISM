import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Idea, Relationship } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, ArrowRight, ArrowLeft, ArrowLeftRight, Circle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ISMDiagram from "./ism-diagram-fixed";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface ISMProcessProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIdeas: Idea[];
  projectContext: {
    context: string;
    triggeringQuestion: string;
    relation: string;
    restriction: string;
  } | null;
}

// Enum to represent VAXO relationships
enum RelationType {
  V = "V", // i influences j
  A = "A", // j influences i
  X = "X", // mutual influence
  O = "O", // no relationship
}

// Interface for a question in the ISM process
interface ISMQuestion {
  ideaI: Idea;
  ideaJ: Idea;
  response: RelationType | null;
}

// Interface for a SSIM matrix cell
interface SSIMCell {
  ideaI: number;
  ideaJ: number;
  relation: RelationType | null;
}

// Function that builds the initial reachability matrix
function buildInitialReachabilityMatrix(
  ideas: Idea[],
  ssimMatrix: SSIMCell[]
): boolean[][] {
  const n = ideas.length;
  const matrix: boolean[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(false));

  // Llenar la matriz con los valores iniciales basados en SSIM
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        // La diagonal siempre es 1 (true)
        matrix[i][j] = true;
        continue;
      }

      const cell = ssimMatrix.find(
        (c) => c.ideaI === ideas[i].id && c.ideaJ === ideas[j].id
      );
      const reverseCell = ssimMatrix.find(
        (c) => c.ideaI === ideas[j].id && c.ideaJ === ideas[i].id
      );

      if (cell && cell.relation) {
        if (cell.relation === RelationType.V || cell.relation === RelationType.X) {
          matrix[i][j] = true;
        }
      } else if (reverseCell && reverseCell.relation) {
        if (reverseCell.relation === RelationType.A || reverseCell.relation === RelationType.X) {
          matrix[i][j] = true;
        }
      }
    }
  }

  return matrix;
}

// Función para aplicar inferencia transitiva a la matriz de alcance
function applyTransitiveClosure(matrix: boolean[][]): boolean[][] {
  const n = matrix.length;
  let result = [...matrix.map((row) => [...row])];
  
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result[i][j] = result[i][j] || (result[i][k] && result[k][j]);
      }
    }
  }
  
  return result;
}

// Construir matriz de alcance inicial (para inferencia lógica)
// Esta función no está duplicada y tiene un nombre único
function buildMatrixFromRelationships(ideas: Idea[], ssimCells: SSIMCell[]): boolean[][] {
  const n = ideas.length;
  const matrix: boolean[][] = Array(n).fill(null).map(() => Array(n).fill(false));
  
  // Llenar la diagonal con true (cada elemento se alcanza a sí mismo)
  for (let i = 0; i < n; i++) {
    matrix[i][i] = true;
  }
  
  // Llenar la matriz según las relaciones VAXO
  ssimCells.forEach(cell => {
    const indexI = ideas.findIndex(idea => idea.id === cell.ideaI);
    const indexJ = ideas.findIndex(idea => idea.id === cell.ideaJ);
    
    if (indexI !== -1 && indexJ !== -1) {
      // Si hay influencia de I a J (V o X)
      if (cell.relation === RelationType.V || cell.relation === RelationType.X) {
        matrix[indexI][indexJ] = true;
      }
    }
  });
  
  return matrix;
}

// Calcular niveles de jerarquía
function calculateLevels(reachabilityMatrix: boolean[][], ideas: Idea[]): number[][] {
  if (!reachabilityMatrix.length) return [];
  
  // Crear una lista de índices de elementos restantes (0 a n-1)
  const n = reachabilityMatrix.length;
  let remainingElements = Array.from({ length: n }, (_, i) => i);
  const levels: number[][] = [];
  
  // Repetir hasta que todos los elementos hayan sido asignados a un nivel
  while (remainingElements.length > 0) {
    // Identificar elementos del nivel actual
    const currentLevel = determineLevel(remainingElements, reachabilityMatrix, ideas);
    
    if (currentLevel.length === 0) {
      // Si no se puede identificar un nivel, es posible que haya un ciclo
      // En este caso, colocamos todos los elementos restantes en el mismo nivel
      levels.push([...remainingElements]);
      console.log("No se pudieron separar más niveles. Posible ciclo encontrado.");
      break;
    }
    
    // Agregar el nivel actual a la lista de niveles
    levels.push(currentLevel);
    
    // Eliminar los elementos del nivel actual de la lista de elementos restantes
    remainingElements = remainingElements.filter(el => !currentLevel.includes(el));
  }
  
  return levels;
}

// Función para determinar el nivel de un conjunto de elementos
function determineLevel(
  remainingElements: number[],
  reachabilityMatrix: boolean[][],
  ideas: Idea[]
): number[] {
  const reachability: Map<number, Set<number>> = new Map();
  const antecedent: Map<number, Set<number>> = new Map();
  const intersection: Map<number, Set<number>> = new Map();
  
  // Para cada elemento restante, calcular su conjunto de alcance y antecedente
  remainingElements.forEach((ideaIndex) => {
    const reachSet = new Set<number>();
    const antSet = new Set<number>();
    
    remainingElements.forEach((j) => {
      if (reachabilityMatrix[ideaIndex][j]) {
        reachSet.add(j);
      }
      if (reachabilityMatrix[j][ideaIndex]) {
        antSet.add(j);
      }
    });
    
    reachability.set(ideaIndex, reachSet);
    antecedent.set(ideaIndex, antSet);
    
    // Calcular la intersección
    const intSet = new Set<number>();
    reachSet.forEach((item) => {
      if (antSet.has(item)) {
        intSet.add(item);
      }
    });
    intersection.set(ideaIndex, intSet);
  });
  
  // Identificar elementos donde el conjunto de alcance y la intersección son iguales
  const levelElements: number[] = [];
  remainingElements.forEach((ideaIndex) => {
    const reachSet = reachability.get(ideaIndex);
    const intSet = intersection.get(ideaIndex);
    
    if (reachSet && intSet && reachSet.size === intSet.size && areSetEqual(reachSet, intSet)) {
      levelElements.push(ideaIndex);
    }
  });
  
  return levelElements;
}

// Función auxiliar para comparar conjuntos
function areSetEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  
  // Usar Array.from para convertir el Set a un array y luego iterar
  return Array.from(a).every(item => b.has(item));
}

export default function ISMProcess({ isOpen, onClose, selectedIdeas, projectContext }: ISMProcessProps) {
  // Get current user from auth context
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // State to store the current stage of the ISM process
  const [stage, setStage] = useState<
    "intro" | "questions" | "ssim" | "reachability" | "levels" | "diagram"
  >("intro");

  // State for the VAXO questions to be asked
  const [questions, setQuestions] = useState<ISMQuestion[]>([]);
  // Index of the current question
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  // Resulting SSIM matrix
  const [ssimMatrix, setSSIMMatrix] = useState<SSIMCell[]>([]);
  // Reachability matrix
  const [reachabilityMatrix, setReachabilityMatrix] = useState<boolean[][]>([]);
  // Final reachability matrix (with transitivity)
  const [finalReachabilityMatrix, setFinalReachabilityMatrix] = useState<boolean[][]>([]);
  // Element levels
  const [levels, setLevels] = useState<number[][]>([]);
  // State to track saving progress - iniciamos con true para evitar cierres prematuros
  const [isSaving, setIsSaving] = useState(true);
  
  // Get existing relationships to check if we need to load previous VAXO responses
  const { data: existingRelationships, isLoading: isLoadingRelationships, error: relationshipsError } = useQuery({
    queryKey: [`/api/projects/${selectedIdeas[0]?.projectId}/relationships`],
    enabled: isOpen && selectedIdeas.length > 0 && selectedIdeas[0]?.projectId !== undefined
  });

  // Debug en consola para ver qué relaciones se están cargando
  useEffect(() => {
    if (existingRelationships && Array.isArray(existingRelationships) && existingRelationships.length > 0) {
      // Mostrar toda la información de las relaciones para depuración
      console.log("Relaciones VAXO cargadas (datos completos):", existingRelationships);
      
      // Mostrar las relaciones en un formato más legible
      console.log("Relaciones VAXO cargadas (formato resumen):", existingRelationships.map(r => ({
        id: r.id,
        from: r.fromIdeaId,
        to: r.toIdeaId,
        type: r.relationType
      })));
    } else {
      console.log("No se encontraron relaciones existentes o el array está vacío");
    }
  }, [existingRelationships]);
  
  // Display error if there is a problem loading relationships
  useEffect(() => {
    if (relationshipsError) {
      toast({
        title: "Error loading relationships",
        description: "Could not load existing VAXO relationships. Starting a new process.",
        variant: "destructive"
      });
      console.error("Error loading relationships:", relationshipsError);
    }
  }, [relationshipsError, toast]);

  // Estado para controlar la inicialización del proceso
  const [isInitialized, setIsInitialized] = useState(false);
  
  // CORRECCIÓN DE BUG: Nueva lógica para el manejo del estado de inicialización
  // El problema principal era que el estado se reiniciaba demasiado rápido
  useEffect(() => {
    if (!isOpen) {
      // El modal se ha cerrado desde fuera, pero NO reiniciamos el estado inmediatamente
      console.log("Modal cerrado, pero manteniendo estado para evitar cierre prematuro");
      
      // IMPORTANTE: Aumentamos el tiempo de espera considerablemente para dar más margen
      // Este cambio es crucial para resolver el problema de cierre prematuro
      setTimeout(() => {
        console.log("Ahora sí, reiniciando estado con retraso de 3 segundos");
        // Se hace la limpieza SOLO después de un retraso significativo
        setIsInitialized(false); 
        setIsSaving(false);
      }, 3000); // Aumento significativo del tiempo de espera a 3 segundos
    } 
    else if (isOpen) {
      // El modal está abierto - SIEMPRE activamos isSaving sin condición
      // Esto evita problemas de sincronización con isInitialized
      console.log("Modal abierto, activando prevención de cierre durante todo el proceso");
      setIsSaving(true);
      
      // Si no está inicializado, no hacemos nada más - otra parte del código se encargará
      if (!isInitialized) {
        console.log("Primera apertura - esperando inicialización");
      } else {
        console.log("Modal abierto y ya inicializado - manteniendo estado");
      }
    }
  }, [isOpen, isInitialized]);
  
  // Load existing relationships from the database if available - solo en la inicialización
  useEffect(() => {
    // Si ya está inicializado o no está abierto, no hacer nada
    if (!isOpen || isInitialized) return;
    
    // Marcamos como inicializado para evitar reiniciar el proceso
    setIsInitialized(true);
    
    // Marcar que estamos cargando para evitar cierres automáticos
    setIsSaving(true);
    
    if (selectedIdeas.length > 0) {
      console.log("Inicializando proceso ISM con relaciones existentes...");
      console.log("SelectedIdeas:", selectedIdeas);
      
      // Generamos todas las preguntas posibles
      const newQuestions: ISMQuestion[] = [];
      
      // Generate questions for each pair (i,j) where i < j
      for (let i = 0; i < selectedIdeas.length - 1; i++) {
        for (let j = i + 1; j < selectedIdeas.length; j++) {
          newQuestions.push({
            ideaI: selectedIdeas[i],
            ideaJ: selectedIdeas[j],
            response: null,
          });
        }
      }
      
      let processStarted = false;
      
      // Imprimir detalles de las relaciones existentes para depuración
      if (existingRelationships && Array.isArray(existingRelationships)) {
        console.log(`Relaciones existentes (${existingRelationships.length}):`, 
          existingRelationships.map(rel => ({
            id: rel.id,
            from: rel.fromIdeaId,
            to: rel.toIdeaId,
            type: rel.relationType,
          }))
        );
      }
      
      // Verificar si estamos recibiendo datos de relaciones correctamente (con campos fromIdeaId, toIdeaId)
      // Verificar la forma de las relaciones recibidas y normalizarlas
      let normalizedRelationships: any[] = [];
      
      if (existingRelationships && Array.isArray(existingRelationships) && existingRelationships.length > 0) {
        console.log("Estructura original de las relaciones:", existingRelationships[0]);
        
        // Normalizar las relaciones para manejar diferentes estructuras de respuesta
        normalizedRelationships = existingRelationships.map(rel => {
          // Mapear las propiedades según la estructura recibida
          return {
            id: rel.id,
            fromIdeaId: rel.fromIdeaId || rel.from_idea_id || rel.from,
            toIdeaId: rel.toIdeaId || rel.to_idea_id || rel.to,
            relationType: rel.relationType || rel.relation_type
          };
        });
        
        console.log("Relaciones normalizadas:", normalizedRelationships[0]);
      }
      
      // Filtrar relaciones para asegurarnos que solo consideramos las que tienen relationType definido
      // y la estructura correcta (fromIdeaId, toIdeaId)
      const validRelationships = normalizedRelationships.filter(rel => 
        rel.fromIdeaId !== undefined && 
        rel.toIdeaId !== undefined && 
        rel.relationType && 
        (rel.relationType === 'V' || rel.relationType === 'A' || rel.relationType === 'X' || rel.relationType === 'O')
      );
      
      console.log(`Relaciones válidas filtradas: ${validRelationships.length}`);
      
      // Si hay relaciones existentes, marcar las preguntas como ya respondidas
      if (validRelationships.length > 0) {
        console.log(`Se encontraron ${validRelationships.length} relaciones VAXO existentes`);
        
        const existingSSIM: SSIMCell[] = [];
        let answeredCount = 0;
        
        // Por cada relación existente, actualizamos la respuesta en las preguntas correspondientes
        validRelationships.forEach(rel => {
          console.log(`Procesando relación ${rel.id}: ${rel.fromIdeaId} -> ${rel.toIdeaId} (${rel.relationType})`);
          
          const fromIdea = selectedIdeas.find(idea => idea.id === rel.fromIdeaId);
          const toIdea = selectedIdeas.find(idea => idea.id === rel.toIdeaId);
          
          if (fromIdea && toIdea) {
            console.log(`Match encontrado: ${fromIdea.title} -> ${toIdea.title}`);
            
            // Añadir a la matriz SSIM para visualización
            existingSSIM.push({
              ideaI: fromIdea.id,
              ideaJ: toIdea.id,
              relation: rel.relationType as RelationType
            });
            
            // Buscar preguntas correspondientes a esta relación y marcarlas como respondidas
            const questionIndex = newQuestions.findIndex(
              q => (q.ideaI.id === fromIdea.id && q.ideaJ.id === toIdea.id) || 
                  (q.ideaI.id === toIdea.id && q.ideaJ.id === fromIdea.id)
            );
            
            if (questionIndex !== -1) {
              // Establecer la respuesta
              let response = rel.relationType as RelationType;
              
              // Si la dirección está invertida, también hay que invertir el tipo de relación
              if (newQuestions[questionIndex].ideaI.id === toIdea.id && newQuestions[questionIndex].ideaJ.id === fromIdea.id) {
                if (response === RelationType.V) response = RelationType.A;
                else if (response === RelationType.A) response = RelationType.V;
                // X y O se quedan igual en ambas direcciones
              }
              
              console.log(`Marcando pregunta ${questionIndex} como respondida: ${response}`);
              
              newQuestions[questionIndex].response = response;
              answeredCount++;
              processStarted = true;
            } else {
              console.log(`No se encontró una pregunta correspondiente para ${fromIdea.id} -> ${toIdea.id}`);
            }
          } else {
            console.log(`Ideas no encontradas para relación: fromIdea=${fromIdea?.title || "no encontrada"}, toIdea=${toIdea?.title || "no encontrada"}`);
          }
        });
        
        // Mostrar el progreso actual para depuración
        console.log("Estado de preguntas después de cargar relaciones existentes:");
        newQuestions.forEach((q, idx) => {
          console.log(`  Q${idx}: ${q.ideaI.title} -> ${q.ideaJ.title}: ${q.response || "no respondida"}`);
        });
        
        // Aplicar inferencia lógica a las relaciones conocidas para posiblemente deducir más respuestas
        console.log("Aplicando inferencia lógica a las relaciones existentes...");
        
        // Construir una matriz provisional con las relaciones conocidas
        const provisionalSSIM: SSIMCell[] = [];
        newQuestions.forEach(q => {
          if (q.response) {
            provisionalSSIM.push({
              ideaI: q.ideaI.id,
              ideaJ: q.ideaJ.id,
              relation: q.response
            });
            
            // Añadir la relación inversa
            if (q.response === RelationType.V) {
              provisionalSSIM.push({
                ideaI: q.ideaJ.id,
                ideaJ: q.ideaI.id,
                relation: RelationType.A
              });
            } else if (q.response === RelationType.A) {
              provisionalSSIM.push({
                ideaI: q.ideaJ.id,
                ideaJ: q.ideaI.id,
                relation: RelationType.V
              });
            } else if (q.response === RelationType.X) {
              provisionalSSIM.push({
                ideaI: q.ideaJ.id,
                ideaJ: q.ideaI.id,
                relation: RelationType.X
              });
            } else if (q.response === RelationType.O) {
              provisionalSSIM.push({
                ideaI: q.ideaJ.id,
                ideaJ: q.ideaI.id,
                relation: RelationType.O
              });
            }
          }
        });
        
        // Construir la matriz de alcance inicial
        const reachMatrix = buildInitialReachabilityMatrix(selectedIdeas, provisionalSSIM);
        
        // Aplicar clausura transitiva
        const transitiveMatrix = applyTransitiveClosure(reachMatrix);
        
        // Inferir relaciones adicionales
        let inferredCount = 0;
        for (let i = 0; i < newQuestions.length; i++) {
          // Ignorar preguntas ya respondidas
          if (newQuestions[i].response !== null) continue;
          
          const ideaI = newQuestions[i].ideaI;
          const ideaJ = newQuestions[i].ideaJ;
          
          // Encontrar los índices de estas ideas en la matriz
          const idxI = selectedIdeas.findIndex(idea => idea.id === ideaI.id);
          const idxJ = selectedIdeas.findIndex(idea => idea.id === ideaJ.id);
          
          if (idxI !== -1 && idxJ !== -1) {
            // Verificar si hay relación transitiva de I a J
            const iToJ = transitiveMatrix[idxI][idxJ];
            const jToI = transitiveMatrix[idxJ][idxI];
            
            // Inferir relaciones basadas en transitividad
            if (iToJ && !jToI) {
              // I influye en J, pero J no influye en I
              newQuestions[i].response = RelationType.V;
              inferredCount++;
              console.log(`Inferencia: ${ideaI.title} influye en ${ideaJ.title} (V)`);
            } else if (!iToJ && jToI) {
              // J influye en I, pero I no influye en J
              newQuestions[i].response = RelationType.A;
              inferredCount++;
              console.log(`Inferencia: ${ideaJ.title} influye en ${ideaI.title} (A)`);
            } else if (iToJ && jToI) {
              // Influencia mutua
              newQuestions[i].response = RelationType.X;
              inferredCount++;
              console.log(`Inferencia: Influencia mutua entre ${ideaI.title} y ${ideaJ.title} (X)`);
            }
          }
        }
        
        console.log(`Se infirieron ${inferredCount} relaciones adicionales`);
        
        // Actualizar el contador de respuestas 
        answeredCount += inferredCount;
        
        // Mostrar el estado final de las preguntas después de inferencias
        console.log("Estado final de preguntas después de inferencias:");
        newQuestions.forEach((q, idx) => {
          console.log(`  Q${idx}: ${q.ideaI.title} -> ${q.ideaJ.title}: ${q.response || "no respondida"}`);
        });
        
        // Actualizar la matriz SSIM
        setSSIMMatrix(existingSSIM);
        
        // Si todas las preguntas han sido respondidas, ir a la matriz SSIM
        if (answeredCount === newQuestions.length) {
          // Update questions state
          setQuestions(newQuestions);
          
          // Important: Calculate the initial reachability matrix before advancing
          const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, existingSSIM);
          setReachabilityMatrix(initialMatrix);
          
          // Calculate the final reachability matrix (with transitivity)
          const transitiveMatrix = applyTransitiveClosure(initialMatrix);
          setFinalReachabilityMatrix(transitiveMatrix);
          
          // Identify element levels
          // identifyLevels se llamará automáticamente cuando avancemos a la etapa de diagrama
          
          // Set stage to SSIM - this will show the complete matrix
          setStage("ssim");
          
          toast({
            title: "Proceso completado",
            description: "Todas las relaciones VAXO ya están definidas. Mostrando la matriz SSIM.",
            variant: "default",
            duration: 5000 // Duración de 5 segundos para que el usuario pueda leer la notificación
          });
        }
        
        // Si hay algunas preguntas respondidas pero no todas, encontrar la primera sin responder
        if (answeredCount > 0) {
          const nextUnansweredIndex = newQuestions.findIndex(q => q.response === null);
          
          if (nextUnansweredIndex !== -1) {
            console.log(`Continuando desde la pregunta ${nextUnansweredIndex + 1}: ${newQuestions[nextUnansweredIndex].ideaI.title} -> ${newQuestions[nextUnansweredIndex].ideaJ.title}`);
            
            setQuestions(newQuestions);
            setCurrentQuestionIndex(nextUnansweredIndex);
            setStage("questions");
            // Establecer un retraso breve antes de continuar para permitir que el usuario vea la notificación
            toast({
              title: "Continuando proceso",
              description: `Se encontraron ${answeredCount} relaciones. Continuando desde donde se quedó.`,
              variant: "default",
              duration: 5000 // Duración de 5 segundos para que el usuario pueda leer la notificación
            });
            
            // No devolver inmediatamente, para permitir que el componente permanezca montado
          }
        }
      } else {
        console.log("No se encontraron relaciones VAXO existentes. Iniciando proceso desde cero.");
      }
      
      // Si no hay relaciones o no se pudo continuar desde un punto específico, iniciar desde cero
      if (!processStarted) {
        setQuestions(newQuestions);
        setCurrentQuestionIndex(0);
        
        // Inicializar matrices vacías
        setReachabilityMatrix([]);
        setFinalReachabilityMatrix([]);
        setLevels([]);
        
        // Mostrar la introducción
        setStage("intro");
      }
      
      // Desactivar el indicador de carga después de completar la inicialización
      // Solo después de que se complete todo el proceso de inicialización
      // IMPORTANTE: En lugar de un gran setTimeout, usamos un enfoque diferente
      // que no depende de existingSSIM, buildReachabilityMatrix, ni identifyLevels
      
      // Cargamos las preguntas independientemente del estado
      setQuestions(newQuestions);
      
      // Si no hay un proceso iniciado, simplemente mostramos la introducción y terminamos
      if (!processStarted) {
        setStage("intro");
        setIsSaving(false); // Desactivamos el indicador de carga inmediatamente
        return;
      }
      
      // Comprobamos si todas las preguntas tienen respuesta
      const allQuestionsAnswered = newQuestions.every(q => q.response !== null);
      const questionsAnsweredCount = newQuestions.filter(q => q.response !== null).length;
      
      // Encontrar índice de primera pregunta sin responder (si hay alguna)
      const nextUnansweredIndex = newQuestions.findIndex(q => q.response === null);
      
      // Para debugging
      console.log(`Estado de carga: ${questionsAnsweredCount}/${newQuestions.length} preguntas respondidas`);
      console.log(`¿Todas respondidas? ${allQuestionsAnswered ? 'Sí' : 'No'}`);
      
      // Construir matriz SSIM para visualización
      const ssimMatrixFromQuestions: SSIMCell[] = [];
      newQuestions.forEach(q => {
        if (q.response) {
          ssimMatrixFromQuestions.push({
            ideaI: q.ideaI.id,
            ideaJ: q.ideaJ.id,
            relation: q.response
          });
        }
      });
      
      // Actualizar la matriz SSIM
      setSSIMMatrix(ssimMatrixFromQuestions);
      
      // SOLUCIÓN FINAL: Nueva implementación de finishLoading para corregir 
      // el problema de cierre prematuro al cambiar de etapa
      const finishLoading = (targetStage: "intro" | "questions" | "ssim" | "reachability" | "levels" | "diagram") => {
        console.log(`INICIANDO CAMBIO A ETAPA: ${targetStage}`);
        
        // Activamos el indicador de guardado para proteger el componente durante todo el proceso
        setIsSaving(true);
        
        // FASE 1: Cambiamos la etapa con un delay para asegurar la estabilidad
        setTimeout(() => {
          console.log(`FASE 1: Ejecutando cambio a etapa ${targetStage}`);
          
          // Cambiamos la etapa pero mantenemos isSaving=true
          setStage(targetStage);
          
          // FASE 2: Desactivamos el indicador solo después de que todo esté estable
          // Este retraso es mucho mayor al anterior para asegurar que no hay cierres automáticos
          setTimeout(() => {
            console.log(`FASE 2: Etapa ${targetStage} estabilizada - preparando desactivación de indicador de guardado`);
            
            // FASE 3: Desactivación segura con doble verificación
            // Solo desactivamos si el componente sigue montado (isOpen=true)
            // y si la etapa actual coincide con la etapa a la que cambiamos (evita condiciones de carrera)
            if (isOpen) {
              console.log(`FASE 3: Desactivando indicador de guardado para etapa ${targetStage}`);
              setIsSaving(false);
            } else {
              console.log(`AVISO: No se desactivó el indicador porque el componente ya está cerrado`);
            }
          }, 5000); // 5 segundos completos para asegurar la estabilidad total
        }, 1000); // 1 segundo para el cambio inicial
      };
      
      // Determinar la etapa a mostrar basada en el estado de las preguntas
      if (allQuestionsAnswered && questionsAnsweredCount > 0) {
        // Si todas las preguntas están respondidas, ir directamente al diagrama
        console.log("Todas las preguntas ya respondidas. Avanzando a etapa de diagrama...");
        
        // Asignar el índice de pregunta actual al último para mantener consistencia
        setCurrentQuestionIndex(newQuestions.length - 1);
        
        // Ir directamente al diagrama con el método seguro
        safeStageChange("diagram");
      } else if (nextUnansweredIndex !== -1) {
        // Si hay preguntas sin responder, continuamos desde la primera sin responder
        setCurrentQuestionIndex(nextUnansweredIndex);
        console.log(`Continuando desde la pregunta ${nextUnansweredIndex + 1}: ${newQuestions[nextUnansweredIndex].ideaI.title} -> ${newQuestions[nextUnansweredIndex].ideaJ.title}`);
        
        // Ir a la etapa de preguntas con el método seguro
        safeStageChange("questions");
      } else {
        // Caso excepcional: hay un problema con las preguntas, mostrar introducción
        console.log("Estado de preguntas inconsistente. Mostrando introducción...");
        safeStageChange("intro");
      }
    }
  }, [isOpen, selectedIdeas, existingRelationships, toast, isInitialized]);

  // Function to save individual VAXO relationship to the database
  const saveIndividualRelationship = async (ideaI: number, ideaJ: number, relation: RelationType) => {
    if (!user || !selectedIdeas[0]?.projectId) return;
    
    try {
      setIsSaving(true);
      
      // Find existing relationship for these ideas
      const existingRel = existingRelationships && Array.isArray(existingRelationships) ?
        (existingRelationships as any[]).find(rel => {
          // Extraer los IDs correctos según el formato de los datos
          const fromId = rel.fromIdeaId || rel.from_idea_id || rel.from;
          const toId = rel.toIdeaId || rel.to_idea_id || rel.to;
          
          return (fromId === ideaI && toId === ideaJ) ||
                (fromId === ideaJ && toId === ideaI && (relation === RelationType.X || relation === RelationType.O))
        }) : null;
      
      // Delete existing relationship if it exists
      if (existingRel) {
        try {
          await apiRequest('DELETE', `/api/relationships/${existingRel.id}`);
          console.log(`Relación existente ${existingRel.id} eliminada`);
        } catch (error) {
          console.error(`Error al eliminar relación ${existingRel.id}:`, error);
        }
      }
      
      // Create new relationship
      if (relation !== RelationType.O) { // No need to save "O" relationships
        try {
          console.log(`Guardando relación: ${ideaI} -> ${ideaJ} (${relation})`);
          
          await apiRequest('POST', `/api/projects/${selectedIdeas[0].projectId}/relationships`, {
            fromIdeaId: ideaI,
            toIdeaId: ideaJ,
            projectId: selectedIdeas[0].projectId,
            createdBy: user.id,
            relationType: relation
          });
          
          console.log(`Relación guardada correctamente`);
          
          // Also create inverse relationship if needed
          if (relation === RelationType.V || relation === RelationType.A || relation === RelationType.X) {
            const inverseRelation = relation === RelationType.V ? RelationType.A :
                                     relation === RelationType.A ? RelationType.V :
                                     RelationType.X;
            
            console.log(`Guardando relación inversa: ${ideaJ} -> ${ideaI} (${inverseRelation})`);
            
            await apiRequest('POST', `/api/projects/${selectedIdeas[0].projectId}/relationships`, {
              fromIdeaId: ideaJ,
              toIdeaId: ideaI,
              projectId: selectedIdeas[0].projectId,
              createdBy: user.id,
              relationType: inverseRelation
            });
            
            console.log(`Relación inversa guardada correctamente`);
          }
          
        } catch (error) {
          console.error(`Error al guardar relación:`, error);
          toast({
            title: "Error saving relationship",
            description: "There was a problem saving the VAXO relationship.",
            variant: "destructive"
          });
        }
      }
      
      // Invalidate relationships query to refresh data
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${selectedIdeas[0].projectId}/relationships`]
      });
      
    } catch (error) {
      console.error("Error saving relationship:", error);
    } finally {
      setIsSaving(false);
    }
    
    // Importante: NO cerrar el modal después de guardar
    // return true para indicar que todo salió bien
    return true;
  };

  // Function to answer a question
  const answerQuestion = async (response: RelationType) => {
    try {
      if (currentQuestionIndex < questions.length) {
        // Establecemos isSaving para evitar cierres automáticos
        setIsSaving(true);
        
        const updatedQuestions = [...questions];
        const currentQuestion = updatedQuestions[currentQuestionIndex];
        currentQuestion.response = response;
        
        console.log(`Guardando relación de pregunta ${currentQuestionIndex + 1}: ${currentQuestion.ideaI.title} -> ${currentQuestion.ideaJ.title} (${response})`);
        
        // Save this relationship to database immediately
        await saveIndividualRelationship(
          currentQuestion.ideaI.id,
          currentQuestion.ideaJ.id,
          response
        );
        
        // Infer logical relationships if possible
        const inferredQuestions = applyLogicalInference(updatedQuestions, currentQuestionIndex);
        setQuestions(inferredQuestions);
        
        // Count how many questions are left to answer
        const pendingQuestions = inferredQuestions.filter(q => q.response === null);
        
        if (pendingQuestions.length > 0) {
          // En lugar de utilizar selectNextMostInformativeQuestion, buscar directamente
          // el índice de la siguiente pregunta sin responder
          const nextIndex = inferredQuestions.findIndex(q => q.response === null);
          if (nextIndex !== -1) {
            console.log(`Pasando a la siguiente pregunta #${nextIndex + 1}: ${inferredQuestions[nextIndex].ideaI.title} -> ${inferredQuestions[nextIndex].ideaJ.title}`);
            setCurrentQuestionIndex(nextIndex);
          } else {
            console.error("Error: No se encontró la siguiente pregunta sin responder");
            // Como respaldo, usar el método anterior
            selectNextMostInformativeQuestion(inferredQuestions);
          }
        } else {
          // All questions have been answered, build the SSIM matrix (without saving again)
          const matrix: SSIMCell[] = [];
          
          // Add the directly answered relationships
          inferredQuestions.forEach((q) => {
            if (q.response) {
              matrix.push({
                ideaI: q.ideaI.id,
                ideaJ: q.ideaJ.id,
                relation: q.response,
              });
            }
          });
          
          setSSIMMatrix(matrix);
          setStage("ssim");
        }
      }
    } catch (error) {
      console.error("Error al procesar respuesta:", error);
      toast({
        title: "Error al procesar respuesta",
        description: "Ocurrió un error al guardar la relación. Por favor intente nuevamente.",
        variant: "destructive"
      });
    } finally {
      // Solo desactivamos isSaving cuando terminamos completamente
      setIsSaving(false);
    }
  };
  
  // Function to select the next most informative question
  const selectNextMostInformativeQuestion = (currentQuestions: ISMQuestion[]) => {
    // Find all questions that have not yet been answered
    const unansweredIndices = currentQuestions
      .map((q, index) => q.response === null ? index : -1)
      .filter(index => index !== -1);
    
    if (unansweredIndices.length === 0) {
      // No more questions to answer
      // Ya no necesitamos guardar las relaciones aquí, pues se han guardado conforme se avanza
      const matrix: SSIMCell[] = [];
      
      // Add the directly answered relationships
      currentQuestions.forEach((q) => {
        if (q.response) {
          matrix.push({
            ideaI: q.ideaI.id,
            ideaJ: q.ideaJ.id,
            relation: q.response,
          });
        }
      });
      
      setSSIMMatrix(matrix);
      setStage("ssim");
      return;
    }
    
    // For now, we use a simple strategy: select the first unanswered question
    // This can be improved with more advanced algorithms that analyze the current structure
    // and determine which question would provide the most information
    
    // In a more advanced implementation, we could:
    // 1. Calculate the centrality of each node in the current matrix
    // 2. Select questions involving nodes with high centrality
    // 3. Analyze patterns in existing responses
    
    const nextIndex = unansweredIndices[0];
    setCurrentQuestionIndex(nextIndex);
    
    console.log(`Selected the next question #${nextIndex + 1}: ` +
                `Does ${currentQuestions[nextIndex].ideaI.title} influence ${currentQuestions[nextIndex].ideaJ.title}?`);
  };

  // Function to apply logical inferences using transitive properties
  const applyLogicalInference = (
    currentQuestions: ISMQuestion[],
    answeredIndex: number
  ): ISMQuestion[] => {
    const updatedQuestions = [...currentQuestions];
    const answeredQuestion = updatedQuestions[answeredIndex];
    
    // If it has not been answered yet, there is nothing to infer
    if (!answeredQuestion.response) return updatedQuestions;
    
    // Build a provisional SSIM matrix with the questions answered so far
    const provisionalSSIM: SSIMCell[] = [];
    updatedQuestions.forEach((q, index) => {
      if (q.response) {
        provisionalSSIM.push({
          ideaI: q.ideaI.id,
          ideaJ: q.ideaJ.id,
          relation: q.response,
        });
        
        // Add the inverse relationship
        if (q.response === RelationType.V) {
          provisionalSSIM.push({
            ideaI: q.ideaJ.id,
            ideaJ: q.ideaI.id,
            relation: RelationType.A,
          });
        } else if (q.response === RelationType.A) {
          provisionalSSIM.push({
            ideaI: q.ideaJ.id,
            ideaJ: q.ideaI.id,
            relation: RelationType.V,
          });
        } else if (q.response === RelationType.X) {
          provisionalSSIM.push({
            ideaI: q.ideaJ.id,
            ideaJ: q.ideaI.id,
            relation: RelationType.X,
          });
        } else if (q.response === RelationType.O) {
          provisionalSSIM.push({
            ideaI: q.ideaJ.id,
            ideaJ: q.ideaI.id,
            relation: RelationType.O,
          });
        }
      }
    });
    
    // Build initial reachability matrix
    const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, provisionalSSIM);
    
    // Apply transitive closure to find indirect relationships
    const transitiveMatrix = applyTransitiveClosure(initialMatrix);
    
    // Use the transitive matrix to infer new relationships
    for (let i = 0; i < updatedQuestions.length; i++) {
      // Skip questions already answered
      if (updatedQuestions[i].response !== null) continue;
      
      const ideaI = updatedQuestions[i].ideaI;
      const ideaJ = updatedQuestions[i].ideaJ;
      
      // Find the indices of these ideas in the matrix
      const idxI = selectedIdeas.findIndex(idea => idea.id === ideaI.id);
      const idxJ = selectedIdeas.findIndex(idea => idea.id === ideaJ.id);
      
      if (idxI !== -1 && idxJ !== -1) {
        // Check if there is a transitive relationship from I to J
        const iToJ = transitiveMatrix[idxI][idxJ];
        const jToI = transitiveMatrix[idxJ][idxI];
        
        // Apply inferences based on transitive relationships
        if (iToJ && !jToI) {
          // I influences J, but J does not influence I
          updatedQuestions[i].response = RelationType.V;
          console.log(`Inference: ${ideaI.title} influences ${ideaJ.title} (V)`);
        } else if (!iToJ && jToI) {
          // J influences I, but I does not influence J
          updatedQuestions[i].response = RelationType.A;
          console.log(`Inference: ${ideaJ.title} influences ${ideaI.title} (A)`);
        } else if (iToJ && jToI) {
          // Mutual influence
          updatedQuestions[i].response = RelationType.X;
          console.log(`Inference: Mutual influence between ${ideaI.title} and ${ideaJ.title} (X)`);
        }
        // If there is no transitive relationship, we cannot infer with certainty that there is no direct relationship (O)
      }
    }
    
    return updatedQuestions;
  };

  // Save VAXO relationships to the database
  const saveVAXORelationshipsToDatabase = async (relationships: SSIMCell[]) => {
    if (!user || !selectedIdeas[0]?.projectId) return;
    
    try {
      setIsSaving(true);
      console.log("Guardando relaciones VAXO...");
      
      // Delete any existing relationships first (to avoid duplicates)
      if (existingRelationships && Array.isArray(existingRelationships) && existingRelationships.length > 0) {
        console.log(`Eliminando ${existingRelationships.length} relaciones existentes`);
        // Use Promise.all to delete all existing relationships
        for (const rel of existingRelationships) {
          try {
            await apiRequest('DELETE', `/api/relationships/${rel.id}`);
            console.log(`Relación ${rel.id} eliminada correctamente`);
          } catch (error) {
            console.error(`Error al eliminar relación ${rel.id}:`, error);
          }
        }
      }
      
      console.log(`Creando nuevas relaciones VAXO (${relationships.filter(rel => rel.relation !== RelationType.O).length})`);
      
      // Create the new VAXO relationships one by one to better track errors
      const filteredRelationships = relationships.filter(rel => rel.relation !== RelationType.O);
      
      try {
        // Realizar solicitudes de a 1 para evitar problemas
        for (const rel of filteredRelationships) {
          console.log(`Creando relación: ${rel.ideaI} -> ${rel.ideaJ} (${rel.relation})`);
          
          await apiRequest('POST', `/api/projects/${selectedIdeas[0].projectId}/relationships`, {
            fromIdeaId: rel.ideaI,
            toIdeaId: rel.ideaJ,
            projectId: selectedIdeas[0].projectId,
            createdBy: user.id,
            relationType: rel.relation
          });
          
          console.log(`Relación creada correctamente`);
          
          // Pequeña pausa para asegurar que las solicitudes no se sobrecarguen
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      
        // Invalidate the relationships query to refresh the data
        queryClient.invalidateQueries({
          queryKey: [`/api/projects/${selectedIdeas[0].projectId}/relationships`]
        });
        
        toast({
          title: "Relationships saved",
          description: "The VAXO relationships have been saved to the database.",
          variant: "default"
        });
        
        // Importante: No cerrar el modal después de guardar
        // Avanzar al siguiente paso automáticamente
        setStage("ssim");
      } catch (error) {
        console.error(`Error al crear relaciones:`, error);
        toast({
          title: "Error saving relationships",
          description: "There was a problem saving some VAXO relationships. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error saving VAXO relationships:", error);
      toast({
        title: "Error saving relationships",
        description: "There was a problem saving the VAXO relationships.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Build the SSIM matrix from the answered questions
  const buildSSIMMatrix = (answeredQuestions: ISMQuestion[]) => {
    const matrix: SSIMCell[] = [];
    
    // Add the directly answered relationships
    answeredQuestions.forEach((q) => {
      if (q.response) {
        matrix.push({
          ideaI: q.ideaI.id,
          ideaJ: q.ideaJ.id,
          relation: q.response,
        });
        
        // Add the inverse relationship if necessary
        if (q.response === RelationType.V) {
          matrix.push({
            ideaI: q.ideaJ.id,
            ideaJ: q.ideaI.id,
            relation: RelationType.A,
          });
        } else if (q.response === RelationType.A) {
          matrix.push({
            ideaI: q.ideaJ.id,
            ideaJ: q.ideaI.id,
            relation: RelationType.V,
          });
        } else if (q.response === RelationType.X) {
          matrix.push({
            ideaI: q.ideaJ.id,
            ideaJ: q.ideaI.id,
            relation: RelationType.X,
          });
        } else if (q.response === RelationType.O) {
          matrix.push({
            ideaI: q.ideaJ.id,
            ideaJ: q.ideaI.id,
            relation: RelationType.O,
          });
        }
      }
    });
    
    setSSIMMatrix(matrix);
    
    // Save the relationships to the database
    // Ya no pasamos al siguiente paso aquí, lo hacemos en saveVAXORelationshipsToDatabase
    saveVAXORelationshipsToDatabase(matrix);
  };

  // Proceed to the reachability matrix stage
  const proceedToReachabilityMatrix = () => {
    // Activamos isSaving inmediatamente para asegurar que el modal no se cierre
    setIsSaving(true);
    
    console.log("Creando matriz de alcance inicial...");
    
    // Mostrar feedback al usuario
    toast({
      title: "Procesando matriz",
      description: "Generando matriz de alcance inicial...",
      duration: 3000,
    });
    
    // Crear la matriz con un pequeño retraso para permitir que la UI se actualice
    setTimeout(() => {
      const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, ssimMatrix);
      setReachabilityMatrix(initialMatrix);
      
      console.log("Matriz de alcance inicial creada, avanzando a vista de matriz...");
      
      // Usamos el método seguro para cambios de etapa - tiene sus propios mecanismos de seguridad
      safeStageChange("reachability");
    }, 500);
  };

  // Apply transitive closure and proceed to level determination
  const applyTransitiveClosureAndProceed = () => {
    // Activamos isSaving para evitar cierre automático del modal
    setIsSaving(true);
    
    // Mostrar feedback al usuario
    toast({
      title: "Aplicando clausura transitiva",
      description: "Procesando relaciones indirectas entre ideas...",
      duration: 3000,
    });
    
    // Aplicar clausura transitiva después de un retraso para que la UI se actualice
    setTimeout(() => {
      const transitiveMatrix = applyTransitiveClosure(reachabilityMatrix);
      setFinalReachabilityMatrix(transitiveMatrix);
      
      console.log("Matriz transitiva creada, avanzando a identificación de niveles...");
      
      // La identificación de niveles se realizará cuando se muestre el diagrama 
      // (No llamamos a identifyLevels aquí para evitar problemas)
      
      // Usamos el método seguro para cambios de etapa
      safeStageChange("levels");
    }, 500);
  };

  // Identify levels in the hierarchy
  const identifyLevels = (transitiveMatrix: boolean[][]) => {
    const remainingIndices = Array.from({ length: selectedIdeas.length }, (_, i) => i);
    const computedLevels: number[][] = [];
    
    while (remainingIndices.length > 0) {
      const levelIndices = determineLevel(remainingIndices, transitiveMatrix, selectedIdeas);
      if (levelIndices.length > 0) {
        computedLevels.push(levelIndices);
        // Remove the identified elements for the next level
        for (const idx of levelIndices) {
          const removeIndex = remainingIndices.indexOf(idx);
          if (removeIndex !== -1) {
            remainingIndices.splice(removeIndex, 1);
          }
        }
      } else {
        // If no elements were identified for this level, avoid an infinite loop
        break;
      }
    }
    
    setLevels(computedLevels);
  };

  // Proceed to diagram visualization
  const proceedToDiagram = () => {
    // Activamos isSaving para evitar cierre automático del modal
    setIsSaving(true);
    
    // Mostrar feedback al usuario
    toast({
      title: "Generando diagrama ISM",
      description: "Preparando visualización del modelo estructural...",
      duration: 3000,
    });
    
    // Retrasamos el cambio para que la UI tenga tiempo de actualizarse
    setTimeout(() => {
      console.log("Generando diagrama final ISM...");
      
      // Preparamos datos necesarios para el diagrama
      if (finalReachabilityMatrix.length > 0 && levels.length === 0) {
        // Si no se han calculado aún los niveles, calculamos
        identifyLevels(finalReachabilityMatrix);
        console.log("Niveles identificados para diagrama");
      }
      
      // Usamos el método seguro para cambios de etapa con un retraso adicional
      // para permitir que la identificación de niveles termine
      setTimeout(() => {
        safeStageChange("diagram");
      }, 500);
    }, 500);
  };

  // Render the current stage
  const renderCurrentStage = () => {
    switch (stage) {
      case "intro":
        return (
          <div className="space-y-4">
            {isLoadingRelationships && (
              <Alert className="bg-yellow-50 mb-4">
                <Info className="h-5 w-5" />
                <AlertTitle>Loading...</AlertTitle>
                <AlertDescription>
                  Checking for existing VAXO relationships. Please wait...
                </AlertDescription>
              </Alert>
            )}
            
            <Alert className="bg-blue-50">
              <Info className="h-5 w-5" />
              <AlertTitle>Interpretive Structural Modeling (ISM) Process</AlertTitle>
              <AlertDescription>
                This process will guide you to build a relationship model between the selected ideas.
                We will use the VAXO system to record influence relationships:
              </AlertDescription>
            </Alert>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">V: i influences j</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Idea i has a direct influence on idea j
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">A: j influences i</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Idea j has a direct influence on idea i
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">X: mutual influence</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Ideas i and j influence each other
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">O: no relationship</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    There is no influence relationship between ideas i and j
                  </p>
                </CardContent>
              </Card>
            </div>
            
            {projectContext && (
              <div className="my-6 bg-slate-100 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">Project Context</h3>
                
                <div className="mb-3">
                  <h4 className="font-medium text-sm">Context:</h4>
                  <p className="text-sm">{projectContext.context}</p>
                </div>
                
                <div className="mb-3">
                  <h4 className="font-medium text-sm">Triggering Question:</h4>
                  <p className="text-sm">{projectContext.triggeringQuestion}</p>
                </div>
                
                <div className="mb-3">
                  <h4 className="font-medium text-sm">Relation:</h4>
                  <p className="text-sm">{projectContext.relation}</p>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm">Restriction:</h4>
                  <p className="text-sm">{projectContext.restriction}</p>
                </div>
              </div>
            )}
            
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Selected Ideas</h3>
              
              <ul className="list-disc pl-6 space-y-2">
                {selectedIdeas.map((idea) => (
                  <li key={idea.id} className="text-sm">
                    <span className="font-medium">{idea.title}</span>
                    {idea.description && (
                      <p className="text-xs text-muted-foreground">{idea.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="text-sm text-muted-foreground">
              <p>
                Next, you will be asked questions about the relationship between each pair of ideas.
                Use the context information to determine if there is an influence relationship
                according to the VAXO system.
              </p>
            </div>
          </div>
        );
        
      case "questions":
        if (currentQuestionIndex < questions.length) {
          const question = questions[currentQuestionIndex];
          return (
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Influence Relationship</h3>
                  <Badge variant="outline">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </Badge>
                </div>
                
                {/* Project context at the top */}
                <div className="text-center mb-8 text-lg font-medium">
                  {projectContext?.context || "Project Context"}
                </div>
                
                {/* Visual design of relationship diagram */}
                <div className="flex justify-between items-center gap-4 mb-8">
                  {/* Idea i (left) */}
                  <div className="w-2/5">
                    <div className="border-2 border-gray-300 p-4 h-full flex items-center justify-center">
                      <div className="text-center">
                        <p className="font-semibold text-lg">{question.ideaI.title}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Vertical relationship buttons (center) */}
                  <div className="flex flex-col space-y-3 items-center justify-center">
                    <div className="text-center mb-1">
                      <p className="font-semibold">{projectContext?.relation || "Influences"}</p>
                    </div>
                    
                    {/* Button V: Arrow from left to right */}
                    <Button
                      variant="outline"
                      className="p-2 border-2 w-12 h-12 flex items-center justify-center"
                      onClick={() => answerQuestion(RelationType.V)}
                      title="Yes (i influences j)"
                    >
                      <ArrowRight className="h-6 w-6 text-blue-600" />
                    </Button>
                    
                    {/* Button A: Arrow from right to left */}
                    <Button
                      variant="outline"
                      className="p-2 border-2 w-12 h-12 flex items-center justify-center"
                      onClick={() => answerQuestion(RelationType.A)}
                      title="No (j influences i)"
                    >
                      <ArrowLeft className="h-6 w-6 text-blue-600" />
                    </Button>
                    
                    {/* Button X: Arrows in both directions */}
                    <Button
                      variant="outline"
                      className="p-2 border-2 w-12 h-12 flex items-center justify-center"
                      onClick={() => answerQuestion(RelationType.X)}
                      title="Both (mutual influence)"
                    >
                      <ArrowLeftRight className="h-6 w-6 text-blue-600" />
                    </Button>
                    
                    {/* Button O: Circle */}
                    <Button
                      variant="outline"
                      className="p-2 border-2 w-12 h-12 flex items-center justify-center"
                      onClick={() => answerQuestion(RelationType.O)}
                      title="No (0) (no relationship)"
                    >
                      <Circle className="h-6 w-6 text-blue-600" strokeWidth={1.5} />
                    </Button>
                  </div>
                  
                  {/* Idea j (right) */}
                  <div className="w-2/5">
                    <div className="border-2 border-gray-300 p-4 h-full flex items-center justify-center">
                      <div className="text-center">
                        <p className="font-semibold text-lg">{question.ideaJ.title}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Restriction at the bottom */}
                <div className="text-center mb-4 text-base">
                  {projectContext?.restriction || "Restriction"}
                </div>
              </div>
            </div>
          );
        }
        return null;
        
      case "ssim":
        return (
          <div className="space-y-4">
            {isSaving && (
              <Alert className="bg-yellow-50 mb-4">
                <Info className="h-5 w-5" />
                <AlertTitle>Saving relationships</AlertTitle>
                <AlertDescription>
                  Saving VAXO relationships to the database. Please wait...
                </AlertDescription>
              </Alert>
            )}
            
            <h3 className="text-lg font-semibold">Structural Self-Interaction Matrix (SSIM)</h3>
            
            <p className="text-sm text-muted-foreground mb-4">
              The following matrix shows the influence relationships you have indicated
              between each pair of ideas.
            </p>
            
            <div className="overflow-x-auto mb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">i/j</TableHead>
                    {selectedIdeas.map((idea, idx) => (
                      <TableHead key={idea.id} className="text-center">
                        {idx + 1}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedIdeas.map((ideaI, i) => (
                    <TableRow key={ideaI.id}>
                      <TableCell className="font-medium">{i + 1}</TableCell>
                      {selectedIdeas.map((ideaJ, j) => {
                        // Diagonal
                        if (i === j) {
                          return <TableCell key={j} className="text-center">-</TableCell>;
                        }
                        
                        const cell = ssimMatrix.find(
                          (c) => c.ideaI === ideaI.id && c.ideaJ === ideaJ.id
                        );
                        
                        return (
                          <TableCell key={j} className="text-center">
                            {cell?.relation || ""}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="mt-4 space-y-4">
              <h4 className="font-medium">Legend:</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div>V: i influences j</div>
                <div>A: j influences i</div>
                <div>X: mutual influence</div>
                <div>O: no relationship</div>
              </div>
              
              <div className="mt-4">
                <h4 className="font-medium mb-2">Ideas reference:</h4>
                <ul className="list-decimal pl-6 space-y-1">
                  {selectedIdeas.map((idea, idx) => (
                    <li key={idea.id} className="text-sm">
                      {idea.title}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
        
      case "reachability":
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Initial Reachability Matrix</h3>
            
            <p className="text-sm text-muted-foreground mb-4">
              The initial reachability matrix shows the direct relationships between ideas.
              A 1 indicates that idea i can reach (influence) idea j.
            </p>
            
            <div className="overflow-x-auto mb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">i/j</TableHead>
                    {selectedIdeas.map((idea, idx) => (
                      <TableHead key={idea.id} className="text-center">
                        {idx + 1}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reachabilityMatrix.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{i + 1}</TableCell>
                      {row.map((cell, j) => (
                        <TableCell key={j} className="text-center">
                          {cell ? 1 : 0}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="mt-4">
              <h4 className="font-medium mb-2">Ideas reference:</h4>
              <ul className="list-decimal pl-6 space-y-1">
                {selectedIdeas.map((idea, idx) => (
                  <li key={idea.id} className="text-sm">
                    {idea.title}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
        
      case "levels":
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Level Partitioning</h3>
            
            <p className="text-sm text-muted-foreground mb-4">
              Elements have been organized into hierarchical levels according to their influence relationships.
              Each level represents a group of ideas with similar influence power in the system.
            </p>
            
            <div className="space-y-6 mt-6">
              {levels.map((levelIndices, levelNum) => (
                <div key={levelNum} className="border rounded-md p-4">
                  <h4 className="font-medium mb-3">Level {levelNum + 1}</h4>
                  <ul className="space-y-2">
                    {levelIndices.map((idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Badge variant="outline">{idx + 1}</Badge>
                        <div>
                          <p className="font-medium">{selectedIdeas[idx].title}</p>
                          <p className="text-sm text-muted-foreground">
                            {selectedIdeas[idx].description}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            

          </div>
        );
        
      case "diagram":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              The result of the ISM process is a hierarchical model that shows
              the influence relationships between ideas. This model will help you
              understand the underlying structure and dynamics of the system.
            </p>
            
            {/* ISM diagram using the ISMDiagram component */}
            <div className="mt-6">
              <ISMDiagram 
                ideas={selectedIdeas}
                levels={levels}
                finalReachabilityMatrix={finalReachabilityMatrix}
                projectId={selectedIdeas[0]?.projectId}
                projectInfo={{
                  name: "Producción",
                  description: selectedIdeas[0]?.projectId 
                    ? "Estos son problemas relacionados con el area de produccion" 
                    : "",
                  createdAt: new Date().toISOString()
                }}
              />
            </div>
          </div>
        );
    }
  };

  // Función para cambiar la etapa de forma segura
  const safeStageChange = (targetStage: "intro" | "questions" | "ssim" | "reachability" | "levels" | "diagram") => {
    console.log(`Solicitando cambio seguro a etapa: ${targetStage}`);
    
    // Forzar isSaving a true - prioridad máxima
    setIsSaving(true);
    
    // Si estamos cargando preguntas, mostrar notificación para mejor feedback
    if (targetStage === "questions" && questions.length > 0) {
      toast({
        title: "Cargando relaciones VAXO",
        description: "Preparando preguntas existentes...",
        duration: 5000,
      });
    }
    
    // Cambiamos la etapa con un delay para estabilidad
    setTimeout(() => {
      console.log(`Cambiando a etapa ${targetStage}`);
      
      // Asegurarse de que isSaving sigue activo antes de cambiar etapa
      setIsSaving(true);
      
      // Ahora cambiamos la etapa
      setStage(targetStage);
      
      // Desactivamos el indicador después de un tiempo extenso
      // Este tiempo debe ser suficiente para que el componente se estabilice
      setTimeout(() => {
        // Solo desactivamos si el modal sigue abierto
        if (isOpen && isInitialized) {
          console.log(`Cambio a ${targetStage} completado y estabilizado - Modal aún abierto`);
          // Aún no desactivamos isSaving, verificamos una vez más después de un breve periodo
          setTimeout(() => {
            if (isOpen) {
              console.log(`Verificación final para etapa ${targetStage} - Modal aún abierto`);
              setIsSaving(false);
            } else {
              console.log(`Cancelada desactivación de isSaving - Modal ya no está abierto`);
            }
          }, 1000);
        } else {
          console.log(`Cancelada desactivación de isSaving - Modal ya no está abierto o no inicializado`);
        }
      }, 5000); // Tiempo aumentado considerablemente
    }, 1000); // Retraso inicial aumentado
  };

  // Navigation buttons according to the stage
  const renderNavigationButtons = () => {
    switch (stage) {
      case "intro":
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={handleCloseAttempt}>
              Cancel
            </Button>
            <Button onClick={() => safeStageChange("questions")}>
              Start Process
            </Button>
          </div>
        );
        
      case "ssim":
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => safeStageChange("questions")}>
              Back to Questions
            </Button>
            <Button onClick={proceedToReachabilityMatrix}>
              Generate Reachability Matrix
            </Button>
          </div>
        );
        
      case "reachability":
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => safeStageChange("ssim")}>
              Back to SSIM
            </Button>
            <Button onClick={applyTransitiveClosureAndProceed}>
              Apply Transitive Closure
            </Button>
          </div>
        );
        
      case "levels":
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => safeStageChange("reachability")}>
              Back
            </Button>
            <Button onClick={proceedToDiagram}>
              View Final ISM Diagram Model
            </Button>
          </div>
        );
        
      case "diagram":
        return (
          <div className="flex justify-end">
            <Button onClick={handleCloseAttempt}>
              Finish
            </Button>
          </div>
        );
        
      default:
        return null;
    }
  };

  // Función para manejar el intento de cierre con confirmación si hay progreso
  const handleCloseAttempt = () => {
    // MEJORA: Agregamos logging para debug
    console.log(`Intento de cierre manual. Estado actual: isSaving=${isSaving}, stage=${stage}, isInitialized=${isInitialized}`);
    
    // SOLUCIÓN DEFINITIVA:
    // Forzar que siempre esté isSaving=true durante el proceso de cierre para evitar cierres prematuros
    // Esto garantiza que no se ejecutarán otros cierres paralelos mientras procesamos este cierre
    setIsSaving(true);
    
    // Verificar si estamos en medio de una operación sensible que no debe interrumpirse
    if (stage === "intro" && isInitialized === false) {
      console.log("Bloqueando cierre - el componente aún está inicializándose");
      toast({
        title: "Inicializando proceso",
        description: "Por favor espera a que termine la inicialización del proceso.",
        variant: "default",
        duration: 3000
      });
      
      // Importante: No cerramos, pero tampoco dejamos isSaving bloqueado para siempre
      // Lo desactivamos después de un tiempo prudencial
      setTimeout(() => setIsSaving(false), 3000);
      return;
    }
    
    // Si estamos en la etapa de preguntas y hay respuestas, pedimos confirmación
    if (stage === "questions") {
      const answeredQuestions = questions.filter(q => q.response !== null).length;
      if (answeredQuestions > 0) {
        const confirmMessage = `Has respondido ${answeredQuestions} de ${questions.length} preguntas. Si cierras ahora, tu progreso se guardará, pero tendrás que comenzar de nuevo la próxima vez. ¿Estás seguro de que quieres cerrar?`;
        console.log(`Pidiendo confirmación: ${confirmMessage}`);
        
        if (!window.confirm(confirmMessage)) {
          console.log("Usuario canceló el cierre en la confirmación");
          // Desbloquear el indicador de guardado después de que el usuario cancele
          setTimeout(() => setIsSaving(false), 500);
          return; // Usuario canceló, no cerramos
        }
      }
    }
    
    // Vamos a separar claramente el proceso de cierre en dos fases:
    console.log("FASE 1: Preparando componente para cierre seguro");
    
    // FASE 1: Preparar el componente para el cierre, manteniendo isSaving=true
    // para bloquear cualquier otro proceso que pudiera afectar al cierre
    
    // Mostramos una notificación explícita para que el usuario sepa que su acción
    // está siendo procesada (mejora UX y da tiempo a la operación)
    toast({
      title: "Cerrando proceso",
      description: "Guardando estado y cerrando...",
      variant: "default",
      duration: 2000
    });
    
    // Esperamos un tiempo prudencial antes de proceder con la FASE 2
    // Este retraso es crucial para permitir que cualquier proceso en curso termine
    setTimeout(() => {
      console.log("FASE 2: Ejecutando cierre después de preparación");
      
      // FASE 2: Limpiar y cerrar
      // En la fase 2 mantenemos isSaving=true hasta el último momento
      
      // El orden es importante:
      // 1. Marcar como no inicializado ANTES de cerrar
      setIsInitialized(false); 
      console.log("Componente marcado como no inicializado");
      
      // 2. Finalmente, cerrar
      console.log("Ejecutando onClose() después de preparación completa");
      onClose(); 
      
      // 3. Desactivar isSaving DESPUÉS DE cerrar - esto es solo para limpiar el estado
      // incluso aunque el componente ya no existirá
      setTimeout(() => {
        setIsSaving(false);
        console.log("Estado de isSaving limpiado post-cierre");
      }, 500);
    }, 1000); // Damos un segundo completo para la fase de preparación
  };

  // Si no está abierto, no renderizamos nada
  if (!isOpen) return null;
  
  // Modal personalizado
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-lg max-w-4xl max-h-[95vh] h-[95vh] overflow-y-auto w-full">
        <div className="p-6">
          {/* Header personalizado con botón de cerrar */}
          <div className="flex justify-between items-start mb-6">
            <div className="flex flex-col space-y-1.5">
              <h2 className="font-semibold leading-none tracking-tight text-lg">
                {stage === "intro" && "Interpretive Structural Modeling (ISM)"}
                {stage === "questions" && "Relationship Identification"}
                {stage === "ssim" && "SSIM Matrix"}
                {stage === "reachability" && "Reachability Matrix"}
                {stage === "levels" && "Level Partitioning"}
                {stage === "diagram" && "Final ISM Diagram Model"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {stage === "intro" && "Build a structural model of relationships between selected ideas."}
                {stage === "questions" && "Determine the type of relationship between each pair of ideas."}
                {stage === "ssim" && "View the structural self-interaction matrix."}
                {stage === "reachability" && "Analyze the initial reachability matrix."}
                {stage === "levels" && "Explore the identified level hierarchy."}
                {stage === "diagram" && ""}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleCloseAttempt} className="h-8 w-8 rounded-full" title="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="my-4">
            {renderCurrentStage()}
          </div>
          
          <div className="flex justify-end space-x-2 mt-6">
            {isSaving && (
              <div className="flex items-center justify-center w-full mb-2">
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent"></div>
                <p className="text-sm text-muted-foreground">Saving relationships...</p>
              </div>
            )}
            {renderNavigationButtons()}
          </div>
        </div>
      </div>
    </div>
  );
}