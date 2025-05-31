import { useState, useEffect, useMemo } from "react";
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
function buildBooleanMatrix(ideas: Idea[], ssimMatrix: SSIMCell[]): boolean[][] {
  const n = ideas.length;
  const matrix: boolean[][] = Array(n).fill(null).map(() => Array(n).fill(false));
  
  ssimMatrix.forEach(cell => {
    const iIndex = ideas.findIndex(idea => idea.id === cell.ideaI);
    const jIndex = ideas.findIndex(idea => idea.id === cell.ideaJ);
    
    if (iIndex !== -1 && jIndex !== -1) {
      if (cell.relation === RelationType.V) {
        matrix[iIndex][jIndex] = true;
      } else if (cell.relation === RelationType.A) {
        matrix[jIndex][iIndex] = true;
      } else if (cell.relation === RelationType.X) {
        matrix[iIndex][jIndex] = true;
        matrix[jIndex][iIndex] = true;
      }
      // RelationType.O relationships remain false
    }
  });
  
  return matrix;
}

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
  // Debug para seguimiento de renderizaciones
  console.log(`ISMProcess render - isOpen:`, isOpen);
  if (!isOpen) {
    console.log("ISMProcess - NO está abierto, pero sigue montado");
  } else {
    console.log("👁️👁️👁️ ISMProcess - ABIERTO Y VISIBLE - debe estar renderizado en pantalla");
  }
  // Get current user from auth context
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // State to store the current stage of the ISM process
  const [stage, setStage] = useState<
    "intro" | "questions" | "ssim" | "reachability" | "levels" | "diagram"
  >("questions"); // Iniciamos directamente en las preguntas VAXO

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
  // Control de guardado: false para resultados, true para preguntas
  const [isSaving, setIsSaving] = useState(true);
  const [forceOpen, setForceOpen] = useState(false);
  
  // Actualizar isSaving basado en la etapa
  useEffect(() => {
    if (stage === "ssim" || stage === "reachability" || stage === "levels" || stage === "diagram") {
      setIsSaving(false); // Permitir navegación en resultados
      setForceOpen(true); // Forzar que el modal permanezca abierto
      console.log("🔒 FORZANDO MODAL A PERMANECER ABIERTO - Mostrando resultados");
    } else {
      setIsSaving(true); // Bloquear cierre durante preguntas
      setForceOpen(false);
    }
  }, [stage]);
  
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
  
  // Fallback element para cuando el modal no se muestra correctamente
  useEffect(() => {
    const fallback = document.getElementById("ism-process-fallback");
    if (!fallback) return;
    fallback.style.display = isOpen ? "none" : "block";
  }, [isOpen]);
  
  // Mejora de visibilidad: Cuando el modal se abre, asegura que sea visible en pantalla
  // y genera preguntas VAXO inmediatamente
  useEffect(() => {
    if (isOpen) {
      // PRIMERO: Generar las preguntas VAXO inmediatamente cuando el modal se abre
      if (selectedIdeas.length > 0) {
        console.log("🟢 MODAL ABIERTO Y HAY IDEAS SELECCIONADAS - GENERANDO PREGUNTAS DE INMEDIATO");
        
        // Forzar la generación de preguntas aquí
        const newQuestions: ISMQuestion[] = [];
        
        // Generate questions for each pair (i,j) where i < j para evitar duplicados
        for (let i = 0; i < selectedIdeas.length - 1; i++) {
          for (let j = i + 1; j < selectedIdeas.length; j++) {
            newQuestions.push({
              ideaI: selectedIdeas[i],
              ideaJ: selectedIdeas[j],
              response: null,  // Inicialmente todas sin responder
            });
          }
        }
        
        if (newQuestions.length > 0) {
          console.log(`⭐ URGENTE: Generando ${newQuestions.length} preguntas para mostrar inmediatamente`);
          setQuestions(newQuestions);
          setCurrentQuestionIndex(0);
          setIsInitialized(true);
        }
      }
      
      // SEGUNDO: Intentar hacer scroll al modal principal
      const modalElement = document.querySelector(".fixed.inset-0.z-\\[9999\\]");
      if (modalElement) {
        modalElement.scrollIntoView({ behavior: "smooth" });
        console.log("👁 Modal ahora debe estar visible visualmente - forzando scroll");
      }
      
      // También podemos forzar el foco para asegurar accesibilidad
      setTimeout(() => {
        // Buscar un elemento interno del modal para darle foco
        const firstFocusableElement = 
          document.querySelector(".fixed.inset-0.z-\\[9999\\] button") as HTMLElement;
        if (firstFocusableElement) {
          firstFocusableElement.focus();
          console.log("💡 Foco establecido en el primer elemento interactivo del modal");
        }
      }, 100);
    }
  }, [isOpen]);
  
  // CORRECCIÓN DE BUG: Nueva lógica para el manejo del estado de inicialización
  // El problema principal era que el estado se reiniciaba demasiado rápido y
  // causaba un bucle infinito de actualizaciones
  // SOLUCIÓN AL BUG: Replanteamiento completo del efecto que controla el ciclo de vida del modal
  useEffect(() => {
    console.log(`🔍 Estado del modal: isOpen=${isOpen}, isSaving=${isSaving}, isInitialized=${isInitialized}`);
    
    // Para evitar el bucle de actualizaciones, usamos un identificador de timeout
    let timeoutId: NodeJS.Timeout | null = null;
    
    if (isOpen) {
      // 1. MODAL ABIERTO: Nos aseguramos que isSaving esté activo para prevenir cierre automático
      console.log("🟢 MODAL ABIERTO - Previniendo cierre automático");
      
      // Solo forzamos la etapa "questions" al inicio cuando esté en "intro"
      // pero NO cuando ya ha avanzado a otra etapa como "ssim"
      if (stage === "intro") {
        console.log("⚠️ Cambiando de 'intro' a 'questions' al iniciar:", stage);
        setStage("questions");
      }
      
      // Generar preguntas inmediatamente si el modal está abierto y no hay preguntas
      if (questions.length === 0 && selectedIdeas.length > 0) {
        console.log("🔴 EFECTO DETECTÓ isOpen=true - ABRIENDO MODAL");
        
        // Crear preguntas VAXO
        const newQuestions: ISMQuestion[] = [];
        for (let i = 0; i < selectedIdeas.length - 1; i++) {
          for (let j = i + 1; j < selectedIdeas.length; j++) {
            newQuestions.push({
              ideaI: selectedIdeas[i],
              ideaJ: selectedIdeas[j],
              response: null,  // Inicialmente todas sin responder
            });
          }
        }
        
        console.log(`⭐ CRÍTICO: Generando ${newQuestions.length} preguntas VAXO en apertura`);
        setQuestions(newQuestions);
        setCurrentQuestionIndex(0);
        setIsInitialized(true);
      }
      
      // Si el modal está abierto pero no inicializado, mostramos un mensaje explícito
      if (!isInitialized) {
        console.log("⏳ Modal abierto pero pendiente de inicialización");
        setIsInitialized(true);
      }
      
      // Resaltamos a nivel visual la apertura del modal con un elemento DOM
      const container = document.getElementById("ism-modal-container");
      if (container) {
        container.classList.add("highlight-animation");
        setTimeout(() => {
          container.classList.remove("highlight-animation");
        }, 2000);
      }
      
      // Intenta hacer scroll al modal para asegurarse que sea visible
      timeoutId = setTimeout(() => {
        const modalElement = document.querySelector(".fixed.inset-0.z-\\[9999\\]");
        if (modalElement) {
          modalElement.scrollIntoView({ behavior: "smooth" });
          console.log("🔍 Intentando hacer visible el modal VAXO con scroll...");
          
          // También podemos intentar forzar el scroll al elemento interno
          const modalContent = document.getElementById("ism-modal-container");
          if (modalContent) {
            modalContent.scrollIntoView({ behavior: "smooth" });
            console.log("✅ Modal VAXO desplazado a la vista");
          }
        }
      }, 300);
    } 
    else if (!isOpen && isInitialized) {
      // 2. MODAL CERRADO: No reseteamos el estado inmediatamente para evitar problemas de sincronización
      console.log("🟠 MODAL CERRADO - Pero manteniendo estado temporalmente");
      
      // IMPORTANTE: Ahora que isSaving es una constante, no debemos intentar reinicializar el componente
      // ya que esto podría causar problemas. Simplemente reportamos el estado.
      console.log("Estado del modal al cerrarse:", { isOpen, isInitialized, isSaving });
    }
    
    // Limpieza del timeout cuando el componente se desmonta o las dependencias cambian
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        console.log("⚠️ Limpiando timeout de cierre automático");
      }
    };
  }, [isOpen, isInitialized, isSaving, questions.length, selectedIdeas, stage, setStage]);
  
  // Load existing relationships from the database if available - solo en la inicialización
  useEffect(() => {
    // Si no está abierto, no hacer nada
    if (!isOpen) return;
    
    // Crear una bandera para evitar actualizaciones de estado después de desmontaje
    let isMounted = true;
    
    // Ahora simplificamos la lógica y evitamos reiniciar el proceso si ya está inicializado
    // Este enfoque evita ciclos innecesarios de setIsInitialized
    if (isInitialized) {
      console.log("⚠️ Proceso VAXO ya inicializado, continuando operación normal.");
      return () => {
        isMounted = false;
      };
    }
    
    // Ya no necesitamos activar isSaving porque ahora es una constante true
    // if (isMounted && !isSaving) {
    //   setIsSaving(true);
    //   console.log("PROTECCIÓN ACTIVADA: isSaving=true durante inicialización");
    // }
    
    // Marcamos como inicializado para evitar reiniciar el proceso
    setIsInitialized(true);
    
    // Función para inicializar el proceso ISM
    const initializeISMProcess = () => {
      if (selectedIdeas.length === 0) {
        console.error("ERROR CRÍTICO: No hay ideas seleccionadas para el proceso ISM");
        toast({
          title: "Error de inicialización",
          description: "No hay ideas seleccionadas para realizar el análisis ISM.",
          variant: "destructive"
        });
        return;
      }
      
      console.log("Inicializando proceso ISM con ideas seleccionadas...");
      console.log(`SelectedIdeas (${selectedIdeas.length}):`, selectedIdeas.map(idea => idea.title));
      
      try {
        // Paso 1: Generamos todas las preguntas posibles VAXO
        const newQuestions: ISMQuestion[] = [];
        
        // Generate questions for each pair (i,j) where i < j para evitar duplicados
        for (let i = 0; i < selectedIdeas.length - 1; i++) {
          for (let j = i + 1; j < selectedIdeas.length; j++) {
            newQuestions.push({
              ideaI: selectedIdeas[i],
              ideaJ: selectedIdeas[j],
              response: null,  // Inicialmente todas sin responder
            });
          }
        }
        
        console.log(`Generadas ${newQuestions.length} preguntas VAXO para ${selectedIdeas.length} ideas`);
        
        // Variables para controlar el estado del proceso
        let hasExistingRelationships = false;
        let processStarted = false;
        
        // Procesar relaciones existentes si están disponibles
        if (existingRelationships && Array.isArray(existingRelationships) && existingRelationships.length > 0) {
          console.log(`Procesando ${existingRelationships.length} relaciones existentes`);
          
          // Normalizar las relaciones para manejar diferentes estructuras de datos
          const validRelationships = existingRelationships.map(rel => ({
            id: rel.id,
            fromIdeaId: rel.fromIdeaId || rel.from,
            toIdeaId: rel.toIdeaId || rel.to,
            relationType: rel.relationType
          })).filter(rel => 
            rel.fromIdeaId && 
            rel.toIdeaId && 
            rel.relationType && 
            ["V", "A", "X", "O"].includes(rel.relationType)
          );
          
          if (validRelationships.length > 0) {
            // Procesar relaciones válidas
            const existingSSIM: SSIMCell[] = [];
            let answeredCount = 0;
            
            // Aplicar relaciones existentes a las preguntas
            validRelationships.forEach(rel => {
              const fromIdea = selectedIdeas.find(idea => idea.id === rel.fromIdeaId);
              const toIdea = selectedIdeas.find(idea => idea.id === rel.toIdeaId);
              
              if (fromIdea && toIdea) {
                // Añadir a la matriz SSIM
                existingSSIM.push({
                  ideaI: fromIdea.id,
                  ideaJ: toIdea.id,
                  relation: rel.relationType as RelationType
                });
                
                // Encontrar y actualizar la pregunta correspondiente
                const questionIndex = newQuestions.findIndex(
                  q => (q.ideaI.id === fromIdea.id && q.ideaJ.id === toIdea.id) || 
                      (q.ideaI.id === toIdea.id && q.ideaJ.id === fromIdea.id)
                );
                
                if (questionIndex !== -1) {
                  // Ajustar la relación según la dirección
                  let response = rel.relationType as RelationType;
                  if (newQuestions[questionIndex].ideaI.id === toIdea.id && newQuestions[questionIndex].ideaJ.id === fromIdea.id) {
                    if (response === RelationType.V) response = RelationType.A;
                    else if (response === RelationType.A) response = RelationType.V;
                  }
                  
                  newQuestions[questionIndex].response = response;
                  answeredCount++;
                  processStarted = true;
                }
              }
            });
            
            // Actualizar la matriz SSIM
            setSSIMMatrix(existingSSIM);
            
            // Determinar la próxima acción basada en las respuestas
            if (answeredCount > 0) {
              if (answeredCount === newQuestions.length) {
                // Todas las preguntas respondidas, avanzar a SSIM
                setQuestions(newQuestions);
                
                // Calcular matrices
                const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, existingSSIM);
                setReachabilityMatrix(initialMatrix);
                
                const transitiveMatrix = applyTransitiveClosure(initialMatrix);
                setFinalReachabilityMatrix(transitiveMatrix);
                
                setStage("ssim");
                toast({
                  title: "Proceso completado",
                  description: "Todas las relaciones VAXO ya están definidas.",
                  variant: "default",
                  duration: 3000
                });
              } else {
                // Hay preguntas pendientes, continuar desde la primera sin responder
                const nextUnansweredIndex = newQuestions.findIndex(q => q.response === null);
                
                if (nextUnansweredIndex !== -1) {
                  // CRÍTICO: Primero establecemos todas las variables de estado
                  setQuestions(newQuestions);
                  setCurrentQuestionIndex(nextUnansweredIndex);
                  
                  // Ya no necesitamos activar isSaving porque ahora es una constante true
                  // setIsSaving(true);
                  
                  // Notificación con aumento de duración
                  toast({
                    title: "Continuando proceso",
                    description: `Se encontraron ${answeredCount} relaciones. Continuando desde donde se quedó.`,
                    variant: "default",
                    duration: 5000
                  });
                  
                  // IMPORTANTE: Usamos un retraso para el cambio de etapa
                  // Esto da tiempo a que los otros estados se establezcan primero
                  console.log("Preparando cambio a etapa de preguntas con retraso...");
                  setTimeout(() => {
                    console.log("Cambiando a etapa de preguntas para continuar con relaciones pendientes");
                    setStage("questions");
                  }, 1000); // Retraso considerable para garantizar estabilidad
                }
              }
            }
          }
        }
        
        // Si no se ha iniciado el proceso, comenzar desde cero
        if (!processStarted) {
          setQuestions(newQuestions);
          setCurrentQuestionIndex(0);
          setReachabilityMatrix([]);
          setFinalReachabilityMatrix([]);
          setLevels([]);
          setStage("intro");
        }
        
        // Verificar estado final
        const hasUnansweredQuestions = newQuestions.some(q => q.response === null);
        
        // Ya no necesitamos modificar isSaving porque ahora es una constante true
        if (hasUnansweredQuestions) {
          console.log("MANTENIENDO isSaving=true porque hay preguntas sin responder");
          // setIsSaving(true); - Ya no es necesario
        } else {
          console.log("No hay preguntas pendientes, pero mantenemos isSaving constante");
          // setIsSaving(false); - Ya no es necesario
        }
      } catch (error) {
        // Manejo de errores durante la inicialización
        console.error("ERROR durante la inicialización del proceso ISM:", error);
        toast({
          title: "Error de inicialización",
          description: "Ocurrió un error al preparar el proceso ISM. Inténtelo nuevamente.",
          variant: "destructive",
          duration: 5000
        });
        
        // En caso de error, establecer un estado básico
        setQuestions([]);
        setStage("intro");
        // setIsSaving(false); - Ya no es necesario porque ahora isSaving es una constante
      }
    };
    
    // Ejecutar el proceso de inicialización
    initializeISMProcess();
    
  }, [isOpen, selectedIdeas, existingRelationships, toast, isInitialized]);

  // Function to process individual VAXO relationship (in memory only)
  const saveIndividualRelationship = async (ideaI: number, ideaJ: number, relation: RelationType) => {
    if (!user || !selectedIdeas[0]?.projectId) return;
    
    try {
      // Ya no necesitamos activar isSaving porque ahora es una constante true
      // setIsSaving(true);
      
      // Ya no buscamos ni eliminamos relaciones existentes
      // Todo se mantiene solo en memoria
      
      // Procesamos la relación solo en memoria
      console.log(`Procesando relación en memoria: ${ideaI} -> ${ideaJ} (${relation})`);
      
      // Actualizar la matriz SSIM inmediatamente
      const updatedSSIM = [...ssimMatrix];
      
      // Agregar la relación directa
      updatedSSIM.push({
        ideaI: ideaI,
        ideaJ: ideaJ,
        relation: relation
      });
      
      // Agregar la relación inversa según el tipo
      if (relation === RelationType.V) {
        updatedSSIM.push({
          ideaI: ideaJ,
          ideaJ: ideaI,
          relation: RelationType.A
        });
        console.log(`Relación inversa procesada en memoria: ${ideaJ} -> ${ideaI} (A)`);
      } else if (relation === RelationType.A) {
        updatedSSIM.push({
          ideaI: ideaJ,
          ideaJ: ideaI,
          relation: RelationType.V
        });
        console.log(`Relación inversa procesada en memoria: ${ideaJ} -> ${ideaI} (V)`);
      } else if (relation === RelationType.X) {
        updatedSSIM.push({
          ideaI: ideaJ,
          ideaJ: ideaI,
          relation: RelationType.X
        });
        console.log(`Relación inversa procesada en memoria: ${ideaJ} -> ${ideaI} (X)`);
      } else if (relation === RelationType.O) {
        updatedSSIM.push({
          ideaI: ideaJ,
          ideaJ: ideaI,
          relation: RelationType.O
        });
        console.log(`Relación inversa procesada en memoria: ${ideaJ} -> ${ideaI} (O)`);
      }
      
      // Actualizar el estado de la matriz SSIM
      setSSIMMatrix(updatedSSIM);
      console.log(`Relación procesada en memoria: ${ideaI} -> ${ideaJ} (${relation})`);
      console.log(`Matriz SSIM actualizada, total relaciones: ${updatedSSIM.length}`);
      
      // IMPORTANTE: NO cambiar de etapa aquí ya que se maneja en answerQuestion
      // Solo actualizar la matriz SSIM y procesar las matrices si es necesario
      
      // Ya no invalidamos consultas porque no hay cambios en la base de datos
      
    } catch (error) {
      console.error("Error saving relationship:", error);
    } finally {
      // Ya no es necesario verificar preguntas sin responder para gestionar isSaving
      const hasUnansweredQuestions = questions.some(q => q.response === null);
      
      if (!hasUnansweredQuestions) {
        console.log("Método saveIndividualRelationship: Todas las preguntas respondidas");
        
        // CRÍTICO: Avanzar a la matriz SSIM cuando se contesten todas las preguntas
        // Aseguramos que esto suceda con un timeout para permitir que los estados se actualicen
        setTimeout(() => {
          console.log("✅ Avanzando a la etapa SSIM - todas las preguntas están respondidas");
          
          // Construir matrices necesarias
          const updatedSSIM = [...ssimMatrix];
          const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, updatedSSIM);
          setReachabilityMatrix(initialMatrix);
          
          // Calcular matriz de accesibilidad con cierre transitivo
          const finalMatrix = applyTransitiveClosure(initialMatrix);
          setFinalReachabilityMatrix(finalMatrix);
          
          // Calcular niveles
          const computedLevels = calculateLevels(finalMatrix, selectedIdeas);
          setLevels(computedLevels);
          
          // Cambiar etapa
          setStage("ssim");
          
          // Notificar al usuario
          toast({
            title: "Proceso completado",
            description: "Todas las relaciones VAXO establecidas. Mostrando matriz SSIM.",
            variant: "default",
            duration: 3000
          });
        }, 500);
      } else {
        console.log(`Quedan ${questions.filter(q => q.response === null).length} preguntas sin responder`);
      }
    }
    
    // Importante: NO cerrar el modal después de guardar
    // return true para indicar que todo salió bien
    return true;
  };

  // Function to answer a question
  const answerQuestion = async (response: RelationType) => {
    try {
      if (currentQuestionIndex < questions.length) {
        // Ya no necesitamos establecer isSaving porque ahora es una constante true
        // setIsSaving(true);
        console.log("isSaving siempre es true - no es necesario establecerlo durante answerQuestion");
        
        const updatedQuestions = [...questions];
        const currentQuestion = updatedQuestions[currentQuestionIndex];
        currentQuestion.response = response;
        
        console.log(`Procesando relación de pregunta ${currentQuestionIndex + 1}: ${currentQuestion.ideaI.title} -> ${currentQuestion.ideaJ.title} (${response})`);
        
        // NO guardar en base de datos - mantener solo en memoria como solicitado
        
        // Infer logical relationships if possible
        const inferredQuestions = applyLogicalInference(updatedQuestions, currentQuestionIndex);
        setQuestions(inferredQuestions);
        
        // Count how many questions are left to answer
        const pendingQuestions = inferredQuestions.filter(q => q.response === null);
        
        if (pendingQuestions.length > 0) {
          // Ya no necesitamos asegurarnos que isSaving sea true porque ahora es una constante
          console.log(`Quedan ${pendingQuestions.length} preguntas pendientes`);
          // setIsSaving(true); - Ya no es necesario
          
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
          // All questions have been answered, build the SSIM matrix and advance to next stage
          console.log("✅ Todas las preguntas completadas en answerQuestion - avanzando a SSIM");
          
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
          
          // Construir matrices de accesibilidad
          const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, matrix);
          setReachabilityMatrix(initialMatrix);
          
          const finalMatrix = applyTransitiveClosure(initialMatrix);
          setFinalReachabilityMatrix(finalMatrix);
          
          const computedLevels = calculateLevels(finalMatrix, selectedIdeas);
          setLevels(computedLevels);
          
          // Construir matriz booleana para visualización
          const n = selectedIdeas.length;
          const booleanMatrix: boolean[][] = Array(n).fill(null).map(() => Array(n).fill(false));
          
          matrix.forEach(cell => {
            const iIndex = selectedIdeas.findIndex(idea => idea.id === cell.ideaI);
            const jIndex = selectedIdeas.findIndex(idea => idea.id === cell.ideaJ);
            
            if (iIndex !== -1 && jIndex !== -1) {
              if (cell.relation === 'V') {
                booleanMatrix[iIndex][jIndex] = true;
              } else if (cell.relation === 'A') {
                booleanMatrix[jIndex][iIndex] = true;
              } else if (cell.relation === 'X') {
                booleanMatrix[iIndex][jIndex] = true;
                booleanMatrix[jIndex][iIndex] = true;
              }
              // 'O' relationships remain false
            }
          });

          // Guardar resultados en localStorage para la pestaña Report
          const vaxoResults = {
            ssimMatrix: booleanMatrix,
            reachabilityMatrix: initialMatrix,
            levels: computedLevels,
            selectedIdeas: selectedIdeas,
            processDate: new Date().toISOString(),
          };
          
          try {
            localStorage.setItem(`vaxo-results-${selectedIdeas[0]?.projectId}`, JSON.stringify(vaxoResults));
            console.log("✅ Resultados VAXO guardados en localStorage para la pestaña Report");
          } catch (error) {
            console.error("Error guardando resultados VAXO:", error);
          }
          
          // Cambiar a la etapa SSIM INMEDIATAMENTE sin retraso
          console.log("🎯 CAMBIANDO A ETAPA SSIM - todas las preguntas completadas");
          setStage("ssim");
          
          // Forzar que el modal permanezca abierto
          console.log("🔒 FORZANDO MODAL A PERMANECER ABIERTO PARA MOSTRAR RESULTADOS");
          
          toast({
            title: "Proceso completado",
            description: "Resultados guardados. Ve a la pestaña Report para ver el análisis completo.",
            variant: "default",
            duration: 5000
          });
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
      // Ya no necesitamos verificar preguntas sin responder para gestionar isSaving
      const stillHasUnansweredQuestions = questions.some(q => q.response === null);
      
      if (!stillHasUnansweredQuestions) {
        console.log("Todas las preguntas respondidas");
        // setIsSaving(false); - Ya no es necesario porque isSaving es una constante
      } else {
        console.log(`Aún quedan ${questions.filter(q => q.response === null).length} preguntas sin responder`);
        // Ya no necesitamos mantener setIsSaving(true) porque ahora isSaving es una constante
      }
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

  // Process VAXO relationships in memory (no longer saves to database)
  const processVAXORelationshipsInMemory = async (relationships: SSIMCell[]) => {
    if (!user || !selectedIdeas[0]?.projectId) return;
    
    try {
      // Ya no necesitamos establecer isSaving porque ahora es una constante true
      // setIsSaving(true);
      console.log("Procesando relaciones VAXO en memoria...");
      
      // Ya no eliminamos relaciones existentes
      // Ya no guardamos relaciones en la base de datos
      
      console.log(`Relaciones VAXO procesadas en memoria (${relationships.filter(rel => rel.relation !== RelationType.O).length})`);
      
      // Mostramos las relaciones en formato de registro para depuración
      const filteredRelationships = relationships.filter(rel => rel.relation !== RelationType.O);
      filteredRelationships.forEach(rel => {
        console.log(`Relación en memoria: ${rel.ideaI} -> ${rel.ideaJ} (${rel.relation})`);
      });
      
      toast({
        title: "Relationships processed in memory",
        description: "The VAXO relationships have been processed and stored in memory. No database changes were made.",
        variant: "default",
        duration: 5000
      });
      
      // Avanzar al siguiente paso automáticamente
      setStage("ssim");
    } catch (error) {
      console.error("Error processing VAXO relationships:", error);
      toast({
        title: "Error processing relationships",
        description: "There was a problem processing the VAXO relationships.",
        variant: "destructive"
      });
    } finally {
      // Ya no necesitamos verificar preguntas sin responder para gestionar isSaving
      const hasUnansweredQuestions = questions.some(q => q.response === null);
      
      if (!hasUnansweredQuestions) {
        console.log("Todas las relaciones procesadas correctamente, no hay preguntas pendientes");
        // setIsSaving(false); - Ya no es necesario
      } else {
        console.log(`Quedan ${questions.filter(q => q.response === null).length} preguntas sin responder`);
        // No necesitamos establecer isSaving porque ahora es una constante
      }
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
    
    // Process the relationships in memory
    // Ya no pasamos al siguiente paso aquí, lo hacemos en processVAXORelationshipsInMemory
    processVAXORelationshipsInMemory(matrix);
  };

  // Proceed to the reachability matrix stage
  const proceedToReachabilityMatrix = () => {
    // Ya no necesitamos activar isSaving porque ahora es una constante true
    // setIsSaving(true);
    
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
    // Ya no necesitamos activar isSaving porque ahora es una constante true
    // setIsSaving(true);
    
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
    // Ya no necesitamos activar isSaving porque ahora es una constante true
    // setIsSaving(true);
    
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
  // Verificar si hay preguntas generadas, si no, intentar generarlas
  // Este efecto ahora tiene prioridad alta y se ejecuta SIEMPRE que el modal esté abierto
  useEffect(() => {
    // Se ejecuta SIEMPRE que el modal esté abierto, independientemente del estado
    if (isOpen && selectedIdeas.length > 0) {
      console.log("🔴 MODAL ABIERTO - Generando preguntas VAXO forzadamente");
      
      // Generamos preguntas VAXO inmediatamente, siempre que el modal esté abierto
      const newQuestions: ISMQuestion[] = [];
      
      // Generate questions for each pair (i,j) where i < j para evitar duplicados
      for (let i = 0; i < selectedIdeas.length - 1; i++) {
        for (let j = i + 1; j < selectedIdeas.length; j++) {
          newQuestions.push({
            ideaI: selectedIdeas[i],
            ideaJ: selectedIdeas[j],
            response: null,  // Inicialmente todas sin responder
          });
        }
      }
      
      // Solo actualizamos si realmente hay preguntas generadas y no había preguntas antes
      if (newQuestions.length > 0 && questions.length === 0) {
        console.log(`🔄 Generadas ${newQuestions.length} preguntas VAXO para ${selectedIdeas.length} ideas`);
        setQuestions(newQuestions);
        setCurrentQuestionIndex(0);
        setIsInitialized(true);
      } else if (questions.length > 0) {
        console.log(`✅ Ya existen ${questions.length} preguntas, no es necesario regenerar`);
      }
    }
  }, [isOpen, selectedIdeas]);  // Dependencias reducidas para que se ejecute con mayor frecuencia

  const renderCurrentStage = () => {
    switch (stage) {
      // El caso "intro" ha sido eliminado ya que ahora iniciamos directamente en las preguntas
      case "intro":
        // Este caso ya no se utilizará, pero lo mantenemos por compatibilidad
        // con el valor "intro" que pueda venir de otros componentes
        return null;
      case "questions":
        // Este es ahora el primer caso, ya que saltamos "intro"
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
            <Alert className="bg-yellow-50 mb-4">
              <Info className="h-5 w-5" />
              <AlertTitle>Processing relationships</AlertTitle>
              <AlertDescription>
                Processing VAXO relationships in memory. Please wait...
              </AlertDescription>
            </Alert>
            
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
    
    // Ya no necesitamos activar isSaving porque siempre es true
    // El modal permanecerá abierto
    
    // VERIFICACIÓN CRÍTICA: ¿Hay preguntas sin responder?
    const hasUnansweredQuestions = questions.some(q => q.response === null);
    console.log(`Verificación de preguntas sin responder: ${hasUnansweredQuestions ? 'Hay preguntas pendientes' : 'Todas respondidas'}`);
    
    // CASO ESPECIAL: Cambiando de "intro" a "questions" - esta es la transición más crucial
    if (stage === "intro" && targetStage === "questions") {
      // Si estamos iniciando el proceso, verificamos si hay al menos una pregunta
      if (questions.length === 0) {
        console.error("ERROR CRÍTICO: No hay preguntas que responder");
        toast({
          title: "Error de inicialización",
          description: "No se pudieron generar las preguntas necesarias. Inténtelo de nuevo.",
          variant: "destructive",
          duration: 5000
        });
        return;
      }
      
      // Asegurarnos de que el índice de pregunta actual es válido
      if (currentQuestionIndex >= questions.length) {
        console.log("Corrigiendo índice de pregunta fuera de rango");
        setCurrentQuestionIndex(0);
      }
      
      // Mensaje para el usuario
      toast({
        title: "Iniciando proceso VAXO",
        description: `Preparando ${questions.length} preguntas sobre relaciones entre ideas...`,
        variant: "default",
        duration: 3000,
      });
      
      // CORRECCIÓN CRÍTICA: Cambiar a etapa questions en un setTimeout para garantizar estabilidad
      setTimeout(() => {
        console.log("Cambiando a etapa preguntas después de inicialización estable");
        setStage(targetStage);
      }, 500);
      
      return; // Terminamos aquí para este caso específico
    }
    
    // PROTECCIÓN: Si hay preguntas sin responder, solo permitimos cambios a la etapa "questions" o "intro"
    if (hasUnansweredQuestions && targetStage !== "intro" && targetStage !== "questions") {
      console.log(`BLOQUEO DE SEGURIDAD: No se permite cambiar a ${targetStage} mientras haya preguntas sin responder`);
      toast({
        title: "Acción no permitida",
        description: "Debe completar todas las preguntas VAXO pendientes antes de continuar",
        variant: "destructive",
        duration: 5000,
      });
      
      // Forzar el cambio a la etapa de preguntas para continuar el proceso
      setTimeout(() => {
        console.log("Redirigiendo a la etapa de preguntas para completar el proceso VAXO");
        setStage("questions");
      }, 500);
      
      return; // Importante: no seguir con el cambio de etapa solicitado
    }
    
    // Mostrar notificación específica según el estado de destino
    if (targetStage === "questions" && stage !== "questions") {
      if (hasUnansweredQuestions) {
        toast({
          title: "Continuando proceso ISM",
          description: "Hay preguntas pendientes por responder. Continuando desde donde quedó.",
          duration: 5000,
        });
      } else {
        toast({
          title: "Cargando relaciones VAXO",
          description: "Preparando preguntas existentes...",
          duration: 5000,
        });
      }
    }
    
    // Cambiamos la etapa con un delay para estabilidad
    setTimeout(() => {
      console.log(`Cambiando a etapa ${targetStage}`);
      
      // Ya no necesitamos asegurar que isSaving sea true porque ahora es una constante
      // El modal permanecerá abierto
      
      // Ahora cambiamos la etapa
      setStage(targetStage);
      
      // CORRECCIÓN CRÍTICA: Si hay preguntas sin responder y estamos en etapa questions, 
      // NUNCA desactivamos isSaving para evitar el cierre automático del modal
      if (hasUnansweredQuestions && (targetStage === "questions" || targetStage === "intro")) {
        console.log(`PROTECCIÓN CRÍTICA: Manteniendo isSaving=true porque hay ${hasUnansweredQuestions ? 'preguntas sin responder' : 'condiciones que requieren mantener el modal abierto'}`);
        return; // No desactivar isSaving bajo ninguna circunstancia
      }
      
      // Desactivamos el indicador después de un tiempo extenso SOLO si no hay preguntas por responder
      // Este tiempo debe ser suficiente para que el componente se estabilice
      setTimeout(() => {
        // Verificamos nuevamente si hay preguntas sin responder
        const stillHasUnansweredQuestions = questions.some(q => q.response === null);
        
        // Solo desactivamos si el modal sigue abierto Y no hay preguntas sin responder
        if (isOpen && isInitialized && !stillHasUnansweredQuestions) {
          console.log(`Cambio a ${targetStage} completado y estabilizado - Modal aún abierto`);
          // Aún no desactivamos isSaving, verificamos una vez más después de un breve periodo
          setTimeout(() => {
            // Triple verificación para máxima seguridad
            const finalCheckUnanswered = questions.some(q => q.response === null);
            
            if (isOpen && !finalCheckUnanswered) {
              console.log(`Verificación final para etapa ${targetStage} - Modal aún abierto y todas las preguntas respondidas`);
              // Ya no es necesario porque isSaving es una constante
              console.log(`Ya no es necesario cambiar isSaving porque ahora es una constante`);
            } else if (finalCheckUnanswered) {
              console.log(`NO se desactiva isSaving - Aún hay preguntas sin responder`);
            } else {
              console.log(`Cancelada desactivación de isSaving - Modal ya no está abierto`);
            }
          }, 2000);
        } else if (stillHasUnansweredQuestions) {
          console.log(`PROTECCIÓN: NO se desactiva isSaving porque aún hay preguntas sin responder`);
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
        // Este caso ya no se utilizará nunca, pero lo mantenemos por compatibilidad
        // devolviendo null para evitar mostrar botones innecesarios
        return null;
        
      case "questions":
        // Este es ahora el caso inicial
        if (currentQuestionIndex < questions.length && currentQuestionIndex > 0) {
          // Solo mostrar botón para retroceder si no estamos en la primera pregunta
          return (
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setCurrentQuestionIndex(currentQuestionIndex - 1);
                }}
              >
                Previous Question
              </Button>
              <Button variant="outline" onClick={handleCloseAttempt}>
                Cancel
              </Button>
            </div>
          );
        } else {
          // En la primera pregunta, solo el botón Cancel
          return (
            <div className="flex justify-end">
              <Button variant="outline" onClick={handleCloseAttempt}>
                Cancel
              </Button>
            </div>
          );
        }
        
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
    
    // BLOQUEAR cierre cuando estamos mostrando resultados
    if (stage === "ssim" || stage === "reachability" || stage === "levels" || stage === "diagram") {
      console.log("🚫 BLOQUEANDO CIERRE - Mostrando resultados, usar botones de navegación");
      toast({
        title: "Resultados disponibles",
        description: "Usa los botones de navegación para explorar los resultados o volver a las preguntas.",
        variant: "default",
        duration: 3000
      });
      return;
    }
    
    // Ya no verificamos bloqueo en etapa "intro" ya que fue eliminada,
    // pero mantenemos una comprobación de inicialización por seguridad
    if (isInitialized === false) {
      console.log("Bloqueando cierre - el componente aún está inicializándose");
      toast({
        title: "Inicializando proceso",
        description: "Por favor espera a que termine la inicialización del proceso.",
        variant: "default",
        duration: 3000
      });
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
          return; // Usuario canceló, no cerramos
        }
      }
    }
    
    // Proceso de cierre
    console.log("Iniciando proceso para cerrar el modal de forma segura");
    
    // Mostramos una notificación explícita para que el usuario sepa que su acción
    // está siendo procesada (mejora UX y da tiempo a la operación)
    toast({
      title: "Cerrando proceso",
      description: "Guardando estado y cerrando...",
      variant: "default",
      duration: 2000
    });
    
    // Eliminar cualquier overlay temporal que pueda estar mostrándose
    const tempOverlay = document.getElementById("temp-overlay");
    if (tempOverlay) tempOverlay.remove();
    
    // CRÍTICO: Llamamos a la función onClose para notificar al padre
    console.log("Llamando a la función onClose proporcionada por el padre");
    onClose();
  };

  // Si no está abierto, no renderizamos nada
  // Añadamos un useEffect específico para detectar cambios en isOpen
  useEffect(() => {
    if (isOpen) {
      console.log("🔴 EFECTO DETECTÓ isOpen=true - ABRIENDO MODAL");
      
      // Hack de emergencia: forzar que el modal permanezca abierto
      const timer = setTimeout(() => {
        console.log("🔴 VERIFICACIÓN ADICIONAL DE MODAL ABIERTO");
        // Si por alguna razón el estado se pierde, este código garantiza que se mantenga abierto
        const tempOverlay = document.getElementById("temp-overlay");
        if (tempOverlay) tempOverlay.remove();
      }, 1500);
      
      return () => clearTimeout(timer);
    } else {
      console.log("🔴 EFECTO DETECTÓ isOpen=false - CERRANDO MODAL");
    }
  }, [isOpen]); // Este efecto se ejecuta solo cuando isOpen cambia
  
  // Debugging para determinar si se está renderizando el componente correctamente
  console.log("ISMProcess render - isOpen:", isOpen);
  
  // ELIMINADO el return condicional - SIEMPRE se renderiza el modal, pero se oculta con CSS
  console.log(isOpen ? "👁️👁️👁️ ISMProcess - ESTÁ abierto, renderizando modal!!!" : "ISMProcess - NO está abierto, pero sigue montado");
  
  // Intenta hacer scroll al modal cuando cambia de estado - pero solo una vez
  useEffect(() => {
    if (isOpen) {
      // Evitar actualizaciones infinitas usando un flag de referencia
      const timeoutId = setTimeout(() => {
        console.log('🔍 Intentando hacer visible el modal VAXO con scroll...');
        try {
          const modalElement = document.getElementById("ism-modal-container");
          if (modalElement) {
            modalElement.scrollIntoView({ behavior: 'smooth' });
            console.log('✅ Modal VAXO desplazado a la vista');
            
            // Añadir animación pero sin modificar la clase para evitar re-renderizados
            modalElement.style.animation = 'pulse 1s';
            setTimeout(() => {
              modalElement.style.animation = '';
            }, 1000);
          } else {
            console.log('❌ No se encontró el elemento modal para desplazar');
          }
        } catch (error) {
          console.error('Error al intentar hacer scroll al modal:', error);
        }
      }, 300);
      
      // Limpiar timeout para evitar memory leaks
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);
  
  // Modal personalizado con z-index muy alto - utilizando CSS para controlar visibilidad
  return (
    <>
      <div
        className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 ${
          (!isOpen && !forceOpen) ? 'hidden' : ''
        }`}
        id="ism-modal-container"
      >
        <div className="bg-white rounded-lg shadow-lg max-w-4xl max-h-[95vh] h-[95vh] overflow-y-auto w-full"
             id="ism-modal-content">
          <div className="p-6">
            {/* Header personalizado con botón de cerrar */}
            <div className="flex justify-between items-start mb-6">
              <div className="flex flex-col space-y-1.5">
                <h2 className="font-semibold leading-none tracking-tight text-lg">
                  {stage === "intro" && "VAXO Relationship Analysis"}
                  {stage === "questions" && "VAXO Relationship Identification"}
                  {stage === "ssim" && "SSIM Matrix"}
                  {stage === "reachability" && "Reachability Matrix"}
                  {stage === "levels" && "Level Partitioning"}
                  {stage === "diagram" && "Final ISM Diagram Model"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {stage === "intro" && "Analyzing relationships between selected ideas."}
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
              {/* Se ha eliminado el indicador de "procesando" que ya no es necesario */}
              {renderNavigationButtons()}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}