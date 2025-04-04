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
  ssimCells: SSIMCell[]
): boolean[][] {
  const n = ideas.length;
  const matrix: boolean[][] = Array.from({ length: n }, () => 
    Array.from({ length: n }, () => false)
  );
  
  // Set diagonal to true
  for (let i = 0; i < n; i++) {
    matrix[i][i] = true;
  }
  
  // Populate matrix from SSIM cells
  for (const cell of ssimCells) {
    const i = ideas.findIndex(idea => idea.id === cell.ideaI);
    const j = ideas.findIndex(idea => idea.id === cell.ideaJ);
    
    if (i !== -1 && j !== -1) {
      if (cell.relation === RelationType.V) {
        matrix[i][j] = true;
      } else if (cell.relation === RelationType.A) {
        matrix[j][i] = true;
      } else if (cell.relation === RelationType.X) {
        matrix[i][j] = true;
        matrix[j][i] = true;
      }
      // RelationType.O is represented by false in both directions
    }
  }
  
  return matrix;
}

// Function that applies the transitive closure
function applyTransitiveClosure(matrix: boolean[][]): boolean[][] {
  const n = matrix.length;
  const result: boolean[][] = JSON.parse(JSON.stringify(matrix)); // Deep copy
  
  // Floyd-Warshall algorithm for transitive closure
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result[i][j] = result[i][j] || (result[i][k] && result[k][j]);
      }
    }
  }
  
  return result;
}

// Function to build a matrix from existing relationships
function buildMatrixFromRelationships(ideas: Idea[], ssimCells: SSIMCell[]): boolean[][] {
  const matrix: boolean[][] = [];
  
  for (let i = 0; i < ideas.length; i++) {
    matrix[i] = [];
    for (let j = 0; j < ideas.length; j++) {
      matrix[i][j] = false;
    }
  }
  
  for (const cell of ssimCells) {
    const i = ideas.findIndex(idea => idea.id === cell.ideaI);
    const j = ideas.findIndex(idea => idea.id === cell.ideaJ);
    
    if (i !== -1 && j !== -1) {
      if (cell.relation === RelationType.V) {
        matrix[i][j] = true;
      } else if (cell.relation === RelationType.A) {
        matrix[j][i] = true;
      } else if (cell.relation === RelationType.X) {
        matrix[i][j] = true;
        matrix[j][i] = true;
      }
    }
  }
  
  return matrix;
}

// Function to calculate levels based on reachability matrix
function calculateLevels(reachabilityMatrix: boolean[][], ideas: Idea[]): number[][] {
  const n = ideas.length;
  
  // Initialize sets for each element
  const reachability: Set<number>[] = [];
  const antecedent: Set<number>[] = [];
  const intersection: Set<number>[] = [];
  
  // Calculate reachability and antecedent sets
  for (let i = 0; i < n; i++) {
    reachability[i] = new Set();
    antecedent[i] = new Set();
    
    for (let j = 0; j < n; j++) {
      if (reachabilityMatrix[i][j]) {
        reachability[i].add(j);
      }
      if (reachabilityMatrix[j][i]) {
        antecedent[i].add(j);
      }
    }
    
    // Calculate intersection
    intersection[i] = new Set(Array.from(reachability[i]).filter(x => antecedent[i].has(x)));
  }
  
  // Find levels
  const levels: number[][] = [];
  let remainingElements = new Map();
  for(let i = 0; i < n; i++) {
    remainingElements.set(i, true);
  }
  
  while (remainingElements.size > 0) {
    const currentLevel: number[] = [];
    
    remainingElements.forEach((value, i) => {
      if (areSetEqual(reachability[i], intersection[i])) {
        currentLevel.push(i);
      }
    });
    
    if (currentLevel.length === 0) break; // No elements found for this level
    
    levels.push(currentLevel);
    
    // Remove elements of current level
    currentLevel.forEach(i => remainingElements.delete(i));
    
    // Update sets for remaining elements
    remainingElements.forEach((value, i) => {
      currentLevel.forEach(j => {
        reachability[i].delete(j);
        intersection[i] = new Set(Array.from(reachability[i]).filter(x => antecedent[i].has(x)));
      });
    });
  }
  
  return levels;
}

// Helper to determine level for remaining elements
function determineLevel(
  remainingIndices: number[],
  matrix: boolean[][],
  ideas: Idea[]
): number[] {
  // Create submatrix with only remaining elements
  const n = remainingIndices.length;
  const submatrix: boolean[][] = [];
  
  for (let i = 0; i < n; i++) {
    submatrix[i] = [];
    for (let j = 0; j < n; j++) {
      submatrix[i][j] = matrix[remainingIndices[i]][remainingIndices[j]];
    }
  }
  
  // For each element, calculate reachability set and intersection set
  const reachSet: Set<number>[] = [];
  const antecedentSet: Set<number>[] = [];
  const intersectionSet: Set<number>[] = [];
  
  for (let i = 0; i < n; i++) {
    reachSet[i] = new Set();
    antecedentSet[i] = new Set();
    
    for (let j = 0; j < n; j++) {
      if (submatrix[i][j]) {
        reachSet[i].add(j);
      }
      if (submatrix[j][i]) {
        antecedentSet[i].add(j);
      }
    }
    
    intersectionSet[i] = new Set(Array.from(reachSet[i]).filter(x => antecedentSet[i].has(x)));
  }
  
  // Identify elements for this level (R(Pi) = R(Pi) ∩ A(Pi))
  const levelElements: number[] = [];
  
  for (let i = 0; i < n; i++) {
    if (areSetEqual(reachSet[i], intersectionSet[i])) {
      levelElements.push(remainingIndices[i]);
    }
  }
  
  return levelElements;
}

// Helper to check if two sets are equal
function areSetEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  
  // Convert to array to avoid using spread
  const arr = Array.from(a);
  return arr.every(value => b.has(value));
}

// Main component
export default function ISMProcess({ isOpen, onClose, selectedIdeas, projectContext }: ISMProcessProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // SOLUCIÓN CRÍTICA: Flag para prevenir cierre automático del modal
  const [forceKeepModalOpen, setForceKeepModalOpen] = useState(true);
  
  // Stage management
  const [stage, setStage] = useState<
    "intro" | "questions" | "ssim" | "reachability" | "levels" | "diagram"
  >("intro");
  
  // Questions state
  const [questions, setQuestions] = useState<ISMQuestion[]>([]);
  // Current question index
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  // SSIM matrix
  const [ssimMatrix, setSSIMMatrix] = useState<SSIMCell[]>([]);
  // Reachability matrix (initial)
  const [reachabilityMatrix, setReachabilityMatrix] = useState<boolean[][]>([]);
  // Final reachability matrix (with transitive closure)
  const [finalReachabilityMatrix, setFinalReachabilityMatrix] = useState<boolean[][]>([]);
  // Identified levels
  const [levels, setLevels] = useState<number[][]>([]);
  // Loading indicator
  const [isSaving, setIsSaving] = useState(true);
  
  // Fetch existing relationships
  const {
    data: existingRelationships = [],
    isLoading: isLoadingRelationships,
    isError: relationshipsError
  } = useQuery<Relationship[]>({
    queryKey: [`/api/projects/${selectedIdeas[0]?.projectId}/relationships`],
    enabled: !!selectedIdeas[0]?.projectId && isOpen
  });
  
  // Debug en consola para ver qué relaciones se están cargando
  useEffect(() => {
    if (existingRelationships && Array.isArray(existingRelationships) && existingRelationships.length > 0) {
      console.log("Relaciones VAXO cargadas (datos completos):", existingRelationships);
      
      // Convertir a formato simplificado para debugging
      const simplifiedRelations = existingRelationships.map(rel => ({
        id: rel.id,
        from: rel.fromIdeaId,
        to: rel.toIdeaId,
        type: rel.relationType
      }));
      console.log("Relaciones VAXO cargadas (formato resumen):", simplifiedRelations);
    }
  }, [existingRelationships]);
  
  // Display error if there is a problem loading relationships
  useEffect(() => {
    if (relationshipsError) {
      toast({
        title: "Error loading relationships",
        description: "There was a problem loading existing VAXO relationships.",
        variant: "destructive"
      });
    }
  }, [relationshipsError, toast]);
  
  // State to track if the component has been initialized
  const [isInitialized, setIsInitialized] = useState(false);
  
  // PROTECCIÓN CRÍTICA: Usamos un useEffect específico para mantener isSaving activado
  // cuando hay preguntas sin responder
  useEffect(() => {
    if (!isOpen) return;
    
    const hasUnansweredQuestions = questions.some(q => q.response === null);
    
    if (hasUnansweredQuestions) {
      console.log(`PROTECCIÓN CRÍTICA: Hay ${questions.filter(q => q.response === null).length} preguntas sin responder, manteniendo isSaving=true`);
      setIsSaving(true);
      // Forzamos que el modal se mantenga abierto
      setForceKeepModalOpen(true);
    } else if (questions.length > 0) {
      console.log("Todas las preguntas han sido respondidas, se puede desactivar isSaving cuando sea seguro");
      // No desactivamos isSaving aquí, lo haremos en un momento controlado
      setForceKeepModalOpen(false);
    }
  }, [questions, isOpen]);
  
  // Function to initialize ISM questions
  useEffect(() => {
    if (!isOpen || !selectedIdeas || selectedIdeas.length === 0) return;
    
    // PROTECCIÓN ESENCIAL: Activamos isSaving para evitar cierre automático
    setIsSaving(true);
    setForceKeepModalOpen(true);
    
    const initialize = async () => {
      console.log("Inicializando el proceso ISM...");
      
      // Comprobar si ya hay datos existentes
      if (isInitialized) {
        console.log("El proceso ISM ya está inicializado, no es necesario reiniciar");
        return;
      }
      
      let processStarted = false;
      
      // Generar todas las combinaciones de preguntas posibles
      const newQuestions: ISMQuestion[] = [];
      
      // Para cada par de ideas, crear una pregunta
      for (let i = 0; i < selectedIdeas.length - 1; i++) {
        for (let j = i + 1; j < selectedIdeas.length; j++) {
          if (i !== j) {
            newQuestions.push({
              ideaI: selectedIdeas[i],
              ideaJ: selectedIdeas[j],
              response: null
            });
          }
        }
      }
      
      console.log(`Generadas ${newQuestions.length} preguntas para ${selectedIdeas.length} ideas`);
      
      // Si hay relaciones existentes, cargarlas
      if (existingRelationships && existingRelationships.length > 0) {
        let answeredCount = 0;
        const existingSSIM: SSIMCell[] = [];
        processStarted = true;
        
        // Para cada pregunta, buscar si ya existe una relación
        newQuestions.forEach((q, idx) => {
          const existingRelation = existingRelationships.find(
            rel => (rel.fromIdeaId === q.ideaI.id && rel.toIdeaId === q.ideaJ.id)
          );
          
          if (existingRelation) {
            // Si existe una relación directa, usar su tipo
            q.response = existingRelation.relationType as RelationType;
            answeredCount++;
            
            // Agregar a la matriz SSIM
            existingSSIM.push({
              ideaI: q.ideaI.id,
              ideaJ: q.ideaJ.id,
              relation: q.response,
            });
            
            // También agregar la relación inversa 
            const inverseRelation = existingRelationships.find(
              rel => (rel.fromIdeaId === q.ideaJ.id && rel.toIdeaId === q.ideaI.id)
            );
            
            if (inverseRelation) {
              existingSSIM.push({
                ideaI: q.ideaJ.id,
                ideaJ: q.ideaI.id,
                relation: inverseRelation.relationType as RelationType,
              });
            }
          } else {
            // Verificar si existe la relación inversa
            const inverseRelation = existingRelationships.find(
              rel => (rel.fromIdeaId === q.ideaJ.id && rel.toIdeaId === q.ideaI.id)
            );
            
            if (inverseRelation) {
              // Deducir la relación directa a partir de la inversa
              if (inverseRelation.relationType === RelationType.V) {
                q.response = RelationType.A;
              } else if (inverseRelation.relationType === RelationType.A) {
                q.response = RelationType.V;
              } else if (inverseRelation.relationType === RelationType.X) {
                q.response = RelationType.X;
              } else if (inverseRelation.relationType === RelationType.O) {
                q.response = RelationType.O;
              }
              
              answeredCount++;
              
              // Agregar a la matriz SSIM
              existingSSIM.push({
                ideaI: q.ideaI.id,
                ideaJ: q.ideaJ.id,
                relation: q.response,
              });
            }
          }
          
          console.log(`  Q${idx}: ${q.ideaI.title} -> ${q.ideaJ.title}: ${q.response || "no respondida"}`);
        });
        
        // Actualizar la matriz SSIM
        setSSIMMatrix(existingSSIM);
        
        // Verificar si hay preguntas sin responder
        const hasUnansweredQuestions = newQuestions.some(q => q.response === null);
        
        // Si todas las preguntas han sido respondidas, ir a la matriz SSIM
        if (answeredCount === newQuestions.length) {
          setQuestions(newQuestions);
          
          const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, existingSSIM);
          setReachabilityMatrix(initialMatrix);
          
          const transitiveMatrix = applyTransitiveClosure(initialMatrix);
          setFinalReachabilityMatrix(transitiveMatrix);
          
          setStage("ssim");
          
          toast({
            title: "Proceso completado",
            description: "Todas las relaciones VAXO ya están definidas. Mostrando la matriz SSIM.",
            variant: "default",
            duration: 5000
          });
        }
        // Si hay algunas preguntas respondidas pero no todas, encontrar la primera sin responder
        else if (answeredCount > 0 && hasUnansweredQuestions) {
          const nextUnansweredIndex = newQuestions.findIndex(q => q.response === null);
          
          if (nextUnansweredIndex !== -1) {
            console.log(`Continuando desde la pregunta ${nextUnansweredIndex + 1}: ${newQuestions[nextUnansweredIndex].ideaI.title} -> ${newQuestions[nextUnansweredIndex].ideaJ.title}`);
            
            // SOLUCIÓN CRÍTICA: Establecer timeout para asegurar que se cargan los estados correctamente
            setTimeout(() => {
              setQuestions(newQuestions);
              setCurrentQuestionIndex(nextUnansweredIndex);
              setStage("questions");
              setIsSaving(true); // Forzar que se mantenga el modal abierto
              
              toast({
                title: "Continuando proceso",
                description: `Se encontraron ${answeredCount} relaciones. Continuando desde donde se quedó.`,
                variant: "default",
                duration: 5000
              });
            }, 500);
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
      
      // Asegurarnos que las preguntas estén cargadas
      setQuestions(newQuestions);
      
      // CRÍTICO: Verificar si hay preguntas sin responder
      const hasUnansweredQuestions = newQuestions.some(q => q.response === null);
      
      if (hasUnansweredQuestions) {
        console.log(`Hay ${newQuestions.filter(q => q.response === null).length} preguntas sin responder, mantener isSaving activado`);
        setIsSaving(true);
        setForceKeepModalOpen(true);
      }
      
      // Finalmente, marcar como inicializado
      setIsInitialized(true);
    };
    
    // Retrasar ligeramente la inicialización para asegurar que el modal está completamente montado
    setTimeout(() => {
      initialize();
    }, 200);
    
  }, [isOpen, selectedIdeas, existingRelationships, toast]);
  
  // Save individual relationship to database
  const saveIndividualRelationship = async (ideaI: number, ideaJ: number, relation: RelationType) => {
    if (!user || !selectedIdeas[0]?.projectId) return false;
    
    try {
      setIsSaving(true);
      
      await apiRequest('POST', `/api/projects/${selectedIdeas[0].projectId}/relationships`, {
        fromIdeaId: ideaI,
        toIdeaId: ideaJ,
        projectId: selectedIdeas[0].projectId,
        createdBy: user.id,
        relationType: relation
      });
      
      // Also create the inverse relationship 
      let inverseRelation: RelationType | null = null;
      
      if (relation === RelationType.V) {
        inverseRelation = RelationType.A;
      } else if (relation === RelationType.A) {
        inverseRelation = RelationType.V;
      } else if (relation === RelationType.X) {
        inverseRelation = RelationType.X;
      } else if (relation === RelationType.O) {
        inverseRelation = RelationType.O;
      }
      
      if (inverseRelation) {
        await apiRequest('POST', `/api/projects/${selectedIdeas[0].projectId}/relationships`, {
          fromIdeaId: ideaJ,
          toIdeaId: ideaI,
          projectId: selectedIdeas[0].projectId,
          createdBy: user.id,
          relationType: inverseRelation
        });
      }
      
      // Invalidate the relationships query
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${selectedIdeas[0].projectId}/relationships`]
      });
      
    } catch (error) {
      console.error("Error saving relationship:", error);
    } finally {
      // CRÍTICO: No desactivamos isSaving si hay preguntas sin responder
      const hasUnansweredQuestions = questions.some(q => q.response === null);
      
      if (hasUnansweredQuestions) {
        console.log(`PROTECCIÓN en saveIndividualRelationship: Manteniendo isSaving=true porque aún quedan ${questions.filter(q => q.response === null).length} preguntas sin responder`);
        setIsSaving(true);
      } else {
        setIsSaving(false);
      }
    }
    
    return true;
  };
  
  // Function to answer a question
  const answerQuestion = async (response: RelationType) => {
    try {
      setIsSaving(true);
      
      if (currentQuestionIndex < questions.length) {
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
          // Find the index of the next unanswered question
          const nextIndex = inferredQuestions.findIndex(q => q.response === null);
          if (nextIndex !== -1) {
            console.log(`Pasando a la siguiente pregunta #${nextIndex + 1}: ${inferredQuestions[nextIndex].ideaI.title} -> ${inferredQuestions[nextIndex].ideaJ.title}`);
            setCurrentQuestionIndex(nextIndex);
          } else {
            console.error("Error: No se encontró la siguiente pregunta sin responder");
            // Fallback to the old method
            selectNextMostInformativeQuestion(inferredQuestions);
          }
        } else {
          // All questions have been answered, build the SSIM matrix
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
      // CRÍTICO: Verificar si hay preguntas sin responder antes de desactivar isSaving
      const hasUnansweredQuestions = questions.some(q => q.response === null);
      
      if (hasUnansweredQuestions) {
        console.log(`PROTECCIÓN en answerQuestion: Manteniendo isSaving=true porque aún quedan ${questions.filter(q => q.response === null).length} preguntas sin responder`);
        setIsSaving(true);
      } else {
        setIsSaving(false);
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
        // Process requests one at a time to avoid issues
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
          
          // Small pause to ensure requests are not overloaded
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
        
        // Progress to next step automatically
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
      // CRÍTICO: Verificar si hay preguntas sin responder
      const hasUnansweredQuestions = questions.some(q => q.response === null);
      
      if (hasUnansweredQuestions) {
        console.log(`PROTECCIÓN en saveVAXORelationshipsToDatabase: Manteniendo isSaving=true porque aún quedan ${questions.filter(q => q.response === null).length} preguntas sin responder`);
        setIsSaving(true);
      } else {
        setIsSaving(false);
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
    
    // Save the relationships to the database
    saveVAXORelationshipsToDatabase(matrix);
  };
  
  // Proceed to the reachability matrix stage
  const proceedToReachabilityMatrix = () => {
    // Activate isSaving to prevent automatic closure of the modal
    setIsSaving(true);
    
    console.log("Creando matriz de alcance inicial...");
    
    // Show feedback to the user
    toast({
      title: "Procesando matriz",
      description: "Generando matriz de alcance inicial...",
      duration: 3000,
    });
    
    // Create the matrix with a small delay to allow the UI to update
    setTimeout(() => {
      const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, ssimMatrix);
      setReachabilityMatrix(initialMatrix);
      
      console.log("Matriz de alcance inicial creada, avanzando a vista de matriz...");
      
      // Use the safe stage change method
      safeStageChange("reachability");
    }, 500);
  };
  
  // Apply transitive closure and proceed to level determination
  const applyTransitiveClosureAndProceed = () => {
    // Activate isSaving to prevent automatic closure of the modal
    setIsSaving(true);
    
    // Show feedback to the user
    toast({
      title: "Aplicando clausura transitiva",
      description: "Procesando relaciones indirectas entre ideas...",
      duration: 3000,
    });
    
    // Apply transitive closure after a delay to allow the UI to update
    setTimeout(() => {
      const transitiveMatrix = applyTransitiveClosure(reachabilityMatrix);
      setFinalReachabilityMatrix(transitiveMatrix);
      
      console.log("Matriz transitiva creada, avanzando a identificación de niveles...");
      
      // Level identification will happen when the diagram is shown
      
      // Use the safe stage change method
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
    // Activate isSaving to prevent automatic closure of the modal
    setIsSaving(true);
    
    // Show feedback to the user
    toast({
      title: "Generando diagrama ISM",
      description: "Preparando visualización del modelo estructural...",
      duration: 3000,
    });
    
    // Delay the change to give the UI time to update
    setTimeout(() => {
      console.log("Generando diagrama final ISM...");
      
      // Prepare necessary data for the diagram
      if (finalReachabilityMatrix.length > 0 && levels.length === 0) {
        // Calculate levels if they haven't been calculated yet
        identifyLevels(finalReachabilityMatrix);
        console.log("Niveles identificados para diagrama");
      }
      
      // Use the safe stage change method with an additional delay
      // to allow level identification to complete
      setTimeout(() => {
        safeStageChange("diagram");
      }, 500);
    }, 500);
  };
  
  // Safe method to change stage with protection against premature modal closure
  const safeStageChange = (targetStage: "intro" | "questions" | "ssim" | "reachability" | "levels" | "diagram") => {
    console.log(`Solicitando cambio seguro a etapa: ${targetStage}`);
    
    // Critical check: Are there unanswered questions?
    const hasUnansweredQuestions = questions.some(q => q.response === null);
    console.log(`Verificación de preguntas sin responder: ${hasUnansweredQuestions ? 'Hay preguntas pendientes' : 'Todas respondidas'}`);
    
    // CRITICAL PROTECTION: If there are unanswered questions, only allow changes to the "questions" stage
    // Exception: always allow returning to "intro" (to restart) or advancing to "questions"
    if (hasUnansweredQuestions && targetStage !== "intro" && targetStage !== "questions") {
      console.log(`BLOQUEO DE SEGURIDAD: No se permite cambiar a ${targetStage} mientras haya preguntas sin responder`);
      toast({
        title: "Acción no permitida",
        description: "Debe completar todas las preguntas VAXO pendientes antes de continuar",
        variant: "destructive",
        duration: 5000,
      });
      
      // Force change to questions stage to continue the process
      setTimeout(() => {
        console.log("Redirigiendo a la etapa de preguntas para completar el proceso VAXO");
        setStage("questions");
      }, 500);
      
      return; // Don't continue with the requested stage change
    }
    
    // Always keep isSaving active during the entire process if there are unanswered questions
    if (hasUnansweredQuestions) {
      setIsSaving(true);
      setForceKeepModalOpen(true);
    }
    
    // Show specific notification based on the state
    if (targetStage === "questions") {
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
    
    // Change the stage with a delay for stability
    setTimeout(() => {
      console.log(`Cambiando a etapa ${targetStage}`);
      
      // Make sure isSaving is still active before changing stage
      setIsSaving(true);
      
      // Now change the stage
      setStage(targetStage);
      
      // CRITICAL PROTECTION: If there are unanswered questions and we're in questions stage, 
      // NEVER deactivate isSaving to prevent automatic modal closure
      if (hasUnansweredQuestions && (targetStage === "questions" || targetStage === "intro")) {
        console.log(`PROTECCIÓN CRÍTICA: Manteniendo isSaving=true porque hay ${hasUnansweredQuestions ? 'preguntas sin responder' : 'condiciones que requieren mantener el modal abierto'}`);
        return; // Don't deactivate isSaving under any circumstances
      }
      
      // Deactivate the indicator after an extended time ONLY if there are no questions to answer
      // This time should be sufficient for the component to stabilize
      setTimeout(() => {
        // Check again if there are unanswered questions
        const stillHasUnansweredQuestions = questions.some(q => q.response === null);
        
        // Only deactivate if the modal is still open AND there are no unanswered questions
        if (isOpen && isInitialized && !stillHasUnansweredQuestions) {
          console.log(`Cambio a ${targetStage} completado y estabilizado - Modal aún abierto`);
          // Don't deactivate isSaving yet, check once more after a brief period
          setTimeout(() => {
            // Triple check for maximum safety
            const finalCheckUnanswered = questions.some(q => q.response === null);
            
            if (isOpen && !finalCheckUnanswered) {
              console.log(`Verificación final para etapa ${targetStage} - Modal aún abierto y todas las preguntas respondidas`);
              setIsSaving(false);
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
      }, 5000); // Time increased considerably
    }, 1000); // Initial delay increased
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
  
  // Function to handle close attempt with confirmation if there is progress
  const handleCloseAttempt = () => {
    // Add logging for debugging
    console.log(`Intento de cierre manual. Estado actual: isSaving=${isSaving}, stage=${stage}, isInitialized=${isInitialized}`);
    
    // CRITICAL SOLUTION:
    // Force isSaving=true during the close process to prevent premature closures
    setIsSaving(true);
    
    // Check if we're in the middle of a sensitive operation that should not be interrupted
    if (stage === "intro" && isInitialized === false) {
      console.log("Bloqueando cierre - el componente aún está inicializándose");
      toast({
        title: "Inicializando proceso",
        description: "Por favor espera a que termine la inicialización del proceso.",
        variant: "default",
        duration: 3000
      });
      
      // Important: Don't close, but don't leave isSaving blocked forever
      // Deactivate it after a reasonable time
      setTimeout(() => setIsSaving(false), 3000);
      return;
    }
    
    // If we're in the questions stage and there are answers, ask for confirmation
    if (stage === "questions") {
      const answeredQuestions = questions.filter(q => q.response !== null).length;
      if (answeredQuestions > 0) {
        const confirmMessage = `Has respondido ${answeredQuestions} de ${questions.length} preguntas. Si cierras ahora, tu progreso se guardará, pero tendrás que comenzar de nuevo la próxima vez. ¿Estás seguro de que quieres cerrar?`;
        console.log(`Pidiendo confirmación: ${confirmMessage}`);
        
        if (!window.confirm(confirmMessage)) {
          console.log("Usuario canceló el cierre en la confirmación");
          // Unblock the save indicator after the user cancels
          setTimeout(() => setIsSaving(false), 500);
          return; // User canceled, don't close
        }
      }
    }
    
    // Let's clearly separate the close process into two phases:
    console.log("FASE 1: Preparando componente para cierre seguro");
    
    // PHASE 1: Prepare the component for closure, keeping isSaving=true
    // to block any other process that could affect the closure
    
    // Show an explicit notification so the user knows their action
    // is being processed (improves UX and gives time for the operation)
    toast({
      title: "Cerrando proceso",
      description: "Guardando estado y cerrando...",
      variant: "default",
      duration: 2000
    });
    
    // Wait a reasonable time before proceeding with PHASE 2
    // This delay is crucial to allow any ongoing process to finish
    setTimeout(() => {
      console.log("FASE 2: Ejecutando cierre después de preparación");
      
      // PHASE 2: Clean up and close
      // In phase 2 we keep isSaving=true until the last moment
      
      // The order is important:
      // 1. Mark as not initialized BEFORE closing
      setIsInitialized(false); 
      console.log("Componente marcado como no inicializado");
      
      // 2. Finally, close
      console.log("Ejecutando onClose() después de preparación completa");
      onClose(); 
      
      // 3. Deactivate isSaving AFTER closing - this is just to clean up the state
      // even though the component will no longer exist
      setTimeout(() => {
        setIsSaving(false);
        console.log("Estado de isSaving limpiado post-cierre");
      }, 500);
    }, 1000); // Give a full second for the preparation phase
  };
  
  // If not open, don't render anything
  if (!isOpen) return null;
  
  // Custom modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-lg max-w-4xl max-h-[95vh] h-[95vh] overflow-y-auto w-full">
        <div className="p-6">
          {/* Custom header with close button */}
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
            {stage === "intro" && (
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
            )}
            
            {stage === "questions" && currentQuestionIndex < questions.length && (
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
                          <p className="font-semibold text-lg">{questions[currentQuestionIndex].ideaI.title}</p>
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
                          <p className="font-semibold text-lg">{questions[currentQuestionIndex].ideaJ.title}</p>
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
            )}
            
            {stage === "ssim" && (
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
                
                <h3 className="text-lg font-semibold">Structural Self-Interaction Matrix</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  The matrix below shows the relationships between all pairs of ideas.
                </p>
                
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Idea #</TableHead>
                        <TableHead>Idea</TableHead>
                        {selectedIdeas.map((idea, i) => (
                          <TableHead key={idea.id} className="text-center w-[50px]">{i + 1}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedIdeas.map((ideaI, i) => (
                        <TableRow key={ideaI.id}>
                          <TableCell className="font-medium">{i + 1}</TableCell>
                          <TableCell>{ideaI.title}</TableCell>
                          {selectedIdeas.map((ideaJ, j) => {
                            // Find relation
                            const relation = ssimMatrix.find(
                              cell => cell.ideaI === ideaI.id && cell.ideaJ === ideaJ.id
                            )?.relation;
                            
                            return (
                              <TableCell key={ideaJ.id} className="text-center">
                                {i === j ? "-" : relation || "-"}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                <div className="mt-4 text-sm text-muted-foreground">
                  <p><strong>V</strong>: Row influences column</p>
                  <p><strong>A</strong>: Column influences row</p>
                  <p><strong>X</strong>: Mutual influence</p>
                  <p><strong>O</strong> or <strong>-</strong>: No relationship</p>
                </div>
              </div>
            )}
            
            {stage === "reachability" && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Initial Reachability Matrix</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  The matrix below shows the direct influence relationships in binary form (1 = influence exists, 0 = no influence).
                </p>
                
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Idea #</TableHead>
                        <TableHead>Idea</TableHead>
                        {selectedIdeas.map((idea, i) => (
                          <TableHead key={idea.id} className="text-center w-[50px]">{i + 1}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedIdeas.map((ideaI, i) => (
                        <TableRow key={ideaI.id}>
                          <TableCell className="font-medium">{i + 1}</TableCell>
                          <TableCell>{ideaI.title}</TableCell>
                          {selectedIdeas.map((ideaJ, j) => (
                            <TableCell key={ideaJ.id} className="text-center">
                              {reachabilityMatrix[i] && reachabilityMatrix[i][j] ? "1" : "0"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                <div className="mt-4 text-sm text-muted-foreground">
                  <p>
                    This matrix represents the direct relationships identified through the VAXO questioning process.
                    The next step involves applying the transitive closure algorithm to identify indirect relationships.
                  </p>
                </div>
              </div>
            )}
            
            {stage === "levels" && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Final Reachability Matrix (With Transitive Closure)</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  The matrix below shows both direct and indirect (transitive) relationships.
                </p>
                
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Idea #</TableHead>
                        <TableHead>Idea</TableHead>
                        {selectedIdeas.map((idea, i) => (
                          <TableHead key={idea.id} className="text-center w-[50px]">{i + 1}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedIdeas.map((ideaI, i) => (
                        <TableRow key={ideaI.id}>
                          <TableCell className="font-medium">{i + 1}</TableCell>
                          <TableCell>{ideaI.title}</TableCell>
                          {selectedIdeas.map((ideaJ, j) => (
                            <TableCell key={ideaJ.id} className="text-center">
                              {finalReachabilityMatrix[i] && finalReachabilityMatrix[i][j] ? "1" : "0"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                <h3 className="text-lg font-semibold mt-8">Level Partitioning</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Based on the reachability matrix, ideas are partitioned into levels.
                </p>
                
                {levels.length > 0 ? (
                  <div className="space-y-4">
                    {levels.map((levelItems, levelIndex) => (
                      <div key={levelIndex} className="border rounded-md p-4">
                        <h4 className="font-medium mb-2">Level {levelIndex + 1}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {levelItems.map(itemIndex => (
                            <div key={itemIndex} className="border rounded p-2 text-sm">
                              {selectedIdeas[itemIndex].title}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p>No levels have been identified yet.</p>
                  </div>
                )}
              </div>
            )}
            
            {stage === "diagram" && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">ISM Diagram</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  The diagram below shows the hierarchical structure of ideas based on their influence relationships.
                </p>
                
                <div className="border rounded-md p-2" style={{ height: '600px' }}>
                  <ISMDiagram
                    ideas={selectedIdeas}
                    levels={levels}
                    relationships={finalReachabilityMatrix}
                  />
                </div>
                
                <div className="mt-4 text-sm text-muted-foreground">
                  <p>
                    This diagram represents the final Interpretive Structural Model. Ideas at higher levels have greater driving power
                    and influence over ideas at lower levels. The arrows show significant influence relationships.
                  </p>
                </div>
              </div>
            )}
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