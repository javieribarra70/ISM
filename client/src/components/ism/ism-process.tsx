import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Idea } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, ArrowRight, ArrowLeft, ArrowLeftRight, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ISMDiagram from "./ism-diagram-cytoscape";

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

// Enum para representar las relaciones VAXO
enum RelationType {
  V = "V", // i influye en j
  A = "A", // j influye en i
  X = "X", // se influyen mutuamente
  O = "O", // no hay relación
}

// Interface para una pregunta en el proceso ISM
interface ISMQuestion {
  ideaI: Idea;
  ideaJ: Idea;
  response: RelationType | null;
}

// Interface para una celda de la matriz SSIM
interface SSIMCell {
  ideaI: number;
  ideaJ: number;
  relation: RelationType | null;
}

// Función que construye la matriz de alcance inicial
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
  // Estado para almacenar la etapa actual del proceso ISM
  const [stage, setStage] = useState<
    "intro" | "questions" | "ssim" | "reachability" | "levels" | "diagram"
  >("intro");

  // Estado para las preguntas VAXO a realizar
  const [questions, setQuestions] = useState<ISMQuestion[]>([]);
  // Índice de la pregunta actual
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  // Matriz SSIM resultante
  const [ssimMatrix, setSSIMMatrix] = useState<SSIMCell[]>([]);
  // Matriz de alcance
  const [reachabilityMatrix, setReachabilityMatrix] = useState<boolean[][]>([]);
  // Matriz de alcance final (con transitividad)
  const [finalReachabilityMatrix, setFinalReachabilityMatrix] = useState<boolean[][]>([]);
  // Niveles de los elementos
  const [levels, setLevels] = useState<number[][]>([]);

  // Generar todas las preguntas necesarias para el ISM cuando se abra el diálogo
  useEffect(() => {
    if (isOpen && selectedIdeas.length > 0) {
      const newQuestions: ISMQuestion[] = [];
      
      // Generamos preguntas para cada par (i,j) donde i < j
      for (let i = 0; i < selectedIdeas.length - 1; i++) {
        for (let j = i + 1; j < selectedIdeas.length; j++) {
          newQuestions.push({
            ideaI: selectedIdeas[i],
            ideaJ: selectedIdeas[j],
            response: null,
          });
        }
      }
      
      setQuestions(newQuestions);
      setCurrentQuestionIndex(0);
      setStage("intro");
      setSSIMMatrix([]);
      setReachabilityMatrix([]);
      setFinalReachabilityMatrix([]);
      setLevels([]);
    }
  }, [isOpen, selectedIdeas]);

  // Función para responder a una pregunta
  const answerQuestion = (response: RelationType) => {
    if (currentQuestionIndex < questions.length) {
      const updatedQuestions = [...questions];
      updatedQuestions[currentQuestionIndex].response = response;
      
      // Inferir relaciones lógicas si es posible
      const inferredQuestions = applyLogicalInference(updatedQuestions, currentQuestionIndex);
      setQuestions(inferredQuestions);
      
      // Contar cuántas preguntas faltan por responder
      const pendingQuestions = inferredQuestions.filter(q => q.response === null);
      
      if (pendingQuestions.length > 0) {
        // Seleccionar la siguiente pregunta más informativa
        selectNextMostInformativeQuestion(inferredQuestions);
      } else {
        // Todas las preguntas han sido respondidas, construir la matriz SSIM
        buildSSIMMatrix(inferredQuestions);
      }
    }
  };
  
  // Función para seleccionar la siguiente pregunta más informativa
  const selectNextMostInformativeQuestion = (currentQuestions: ISMQuestion[]) => {
    // Encontrar todas las preguntas que aún no se han respondido
    const unansweredIndices = currentQuestions
      .map((q, index) => q.response === null ? index : -1)
      .filter(index => index !== -1);
    
    if (unansweredIndices.length === 0) {
      // No hay más preguntas por responder
      buildSSIMMatrix(currentQuestions);
      return;
    }
    
    // Por ahora, usamos una estrategia simple: seleccionar la primera pregunta no respondida
    // Esto se puede mejorar con algoritmos más avanzados que analicen la estructura actual
    // y determinen qué pregunta aportaría más información
    
    // En una implementación más avanzada, podríamos:
    // 1. Calcular la centralidad de cada nodo en la matriz actual
    // 2. Seleccionar preguntas que involucren nodos con alta centralidad
    // 3. Analizar patrones en las respuestas existentes
    
    const nextIndex = unansweredIndices[0];
    setCurrentQuestionIndex(nextIndex);
    
    console.log(`Seleccionada la siguiente pregunta #${nextIndex + 1}: ` +
                `¿${currentQuestions[nextIndex].ideaI.title} influye en ${currentQuestions[nextIndex].ideaJ.title}?`);
  };

  // Función para aplicar inferencias lógicas utilizando propiedades transitivas
  const applyLogicalInference = (
    currentQuestions: ISMQuestion[],
    answeredIndex: number
  ): ISMQuestion[] => {
    const updatedQuestions = [...currentQuestions];
    const answeredQuestion = updatedQuestions[answeredIndex];
    
    // Si aún no se ha respondido, no hay nada que inferir
    if (!answeredQuestion.response) return updatedQuestions;
    
    // Construir una matriz SSIM provisional con las preguntas respondidas hasta ahora
    const provisionalSSIM: SSIMCell[] = [];
    updatedQuestions.forEach((q, index) => {
      if (q.response) {
        provisionalSSIM.push({
          ideaI: q.ideaI.id,
          ideaJ: q.ideaJ.id,
          relation: q.response,
        });
        
        // Añadir la relación inversa
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
    
    // Construir matriz de alcanzabilidad inicial
    const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, provisionalSSIM);
    
    // Aplicar cierre transitivo para encontrar relaciones indirectas
    const transitiveMatrix = applyTransitiveClosure(initialMatrix);
    
    // Usar la matriz transitiva para inferir nuevas relaciones
    for (let i = 0; i < updatedQuestions.length; i++) {
      // Saltamos las preguntas ya respondidas
      if (updatedQuestions[i].response !== null) continue;
      
      const ideaI = updatedQuestions[i].ideaI;
      const ideaJ = updatedQuestions[i].ideaJ;
      
      // Encontrar los índices de estas ideas en la matriz
      const idxI = selectedIdeas.findIndex(idea => idea.id === ideaI.id);
      const idxJ = selectedIdeas.findIndex(idea => idea.id === ideaJ.id);
      
      if (idxI !== -1 && idxJ !== -1) {
        // Verificar si hay relación transitiva de I a J
        const iToJ = transitiveMatrix[idxI][idxJ];
        const jToI = transitiveMatrix[idxJ][idxI];
        
        // Aplicar inferencias basadas en las relaciones transitivas
        if (iToJ && !jToI) {
          // I influye en J, pero J no influye en I
          updatedQuestions[i].response = RelationType.V;
          console.log(`Inferencia: ${ideaI.title} influye en ${ideaJ.title} (V)`);
        } else if (!iToJ && jToI) {
          // J influye en I, pero I no influye en J
          updatedQuestions[i].response = RelationType.A;
          console.log(`Inferencia: ${ideaJ.title} influye en ${ideaI.title} (A)`);
        } else if (iToJ && jToI) {
          // Influencia mutua
          updatedQuestions[i].response = RelationType.X;
          console.log(`Inferencia: Influencia mutua entre ${ideaI.title} y ${ideaJ.title} (X)`);
        }
        // Si no hay relación transitiva, no podemos inferir con certeza que no hay relación directa (O)
      }
    }
    
    return updatedQuestions;
  };

  // Construir la matriz SSIM a partir de las preguntas respondidas
  const buildSSIMMatrix = (answeredQuestions: ISMQuestion[]) => {
    const matrix: SSIMCell[] = [];
    
    // Añadir las relaciones directamente respondidas
    answeredQuestions.forEach((q) => {
      if (q.response) {
        matrix.push({
          ideaI: q.ideaI.id,
          ideaJ: q.ideaJ.id,
          relation: q.response,
        });
        
        // Añadir la relación inversa si es necesario
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
    setStage("ssim");
  };

  // Avanzar a la etapa de matriz de alcance
  const proceedToReachabilityMatrix = () => {
    const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, ssimMatrix);
    setReachabilityMatrix(initialMatrix);
    setStage("reachability");
  };

  // Aplicar cierre transitivo y avanzar a la determinación de niveles
  const applyTransitiveClosureAndProceed = () => {
    const transitiveMatrix = applyTransitiveClosure(reachabilityMatrix);
    setFinalReachabilityMatrix(transitiveMatrix);
    identifyLevels(transitiveMatrix);
    setStage("levels");
  };

  // Identificar niveles en la jerarquía
  const identifyLevels = (transitiveMatrix: boolean[][]) => {
    const remainingIndices = Array.from({ length: selectedIdeas.length }, (_, i) => i);
    const computedLevels: number[][] = [];
    
    while (remainingIndices.length > 0) {
      const levelIndices = determineLevel(remainingIndices, transitiveMatrix, selectedIdeas);
      if (levelIndices.length > 0) {
        computedLevels.push(levelIndices);
        // Remover los elementos identificados para el siguiente nivel
        for (const idx of levelIndices) {
          const removeIndex = remainingIndices.indexOf(idx);
          if (removeIndex !== -1) {
            remainingIndices.splice(removeIndex, 1);
          }
        }
      } else {
        // Si no se identificaron elementos para este nivel, evitar un bucle infinito
        break;
      }
    }
    
    setLevels(computedLevels);
  };

  // Avanzar a la visualización del diagrama
  const proceedToDiagram = () => {
    setStage("diagram");
  };

  // Renderizar la etapa actual
  const renderCurrentStage = () => {
    switch (stage) {
      case "intro":
        return (
          <div className="space-y-4">
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
                
                {/* Contexto del proyecto en la parte superior */}
                <div className="text-center mb-8 text-lg font-medium">
                  {projectContext?.context || "Project Context"}
                </div>
                
                {/* Diseño visual del diagrama de relación */}
                <div className="flex justify-between items-center gap-4 mb-8">
                  {/* Idea i (izquierda) */}
                  <div className="w-2/5">
                    <div className="border-2 border-gray-300 p-4 h-full flex items-center justify-center">
                      <div className="text-center">
                        <p className="font-semibold text-lg">{question.ideaI.title}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Botones de relación verticales (centro) */}
                  <div className="flex flex-col space-y-3 items-center justify-center">
                    <div className="text-center mb-1">
                      <p className="font-semibold">{projectContext?.relation || "Influences"}</p>
                    </div>
                    
                    {/* Botón V: Flecha izquierda a derecha */}
                    <Button
                      variant="outline"
                      className="p-2 border-2 w-12 h-12 flex items-center justify-center"
                      onClick={() => answerQuestion(RelationType.V)}
                      title="Yes (i influences j)"
                    >
                      <ArrowRight className="h-6 w-6 text-blue-600" />
                    </Button>
                    
                    {/* Botón A: Flecha derecha a izquierda */}
                    <Button
                      variant="outline"
                      className="p-2 border-2 w-12 h-12 flex items-center justify-center"
                      onClick={() => answerQuestion(RelationType.A)}
                      title="No (j influences i)"
                    >
                      <ArrowLeft className="h-6 w-6 text-blue-600" />
                    </Button>
                    
                    {/* Botón X: Flechas en ambos sentidos */}
                    <Button
                      variant="outline"
                      className="p-2 border-2 w-12 h-12 flex items-center justify-center"
                      onClick={() => answerQuestion(RelationType.X)}
                      title="Both (mutual influence)"
                    >
                      <ArrowLeftRight className="h-6 w-6 text-blue-600" />
                    </Button>
                    
                    {/* Botón O: Círculo */}
                    <Button
                      variant="outline"
                      className="p-2 border-2 w-12 h-12 flex items-center justify-center"
                      onClick={() => answerQuestion(RelationType.O)}
                      title="No (0) (no relationship)"
                    >
                      <Circle className="h-6 w-6 text-blue-600" strokeWidth={1.5} />
                    </Button>
                  </div>
                  
                  {/* Idea j (derecha) */}
                  <div className="w-2/5">
                    <div className="border-2 border-gray-300 p-4 h-full flex items-center justify-center">
                      <div className="text-center">
                        <p className="font-semibold text-lg">{question.ideaJ.title}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Restricción en la parte inferior */}
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
            
            <div className="mt-6 p-4 bg-slate-50 rounded-md">
              <h4 className="font-medium mb-2">Interpretation:</h4>
              <p className="text-sm">
                • Elements in Level 1 have the least influence power but receive influence
                  from other elements.
              </p>
              <p className="text-sm">
                • As the level increases, the influence power over the system increases.
              </p>
              <p className="text-sm">
                • Elements at the highest level are the most influential and can be considered
                  as key factors or drivers.
              </p>
            </div>
          </div>
        );
        
      case "diagram":
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Final ISM Model</h3>
            
            <p className="text-sm text-muted-foreground mb-4">
              The final result of the ISM process is a hierarchical model that shows
              the influence relationships between ideas. This model will help you
              understand the underlying structure and dynamics of the system.
            </p>
            
            {/* Diagrama ISM usando el componente ISMDiagram */}
            <div className="mt-6">
              <ISMDiagram 
                ideas={selectedIdeas}
                levels={levels}
                finalReachabilityMatrix={finalReachabilityMatrix}
              />
            </div>
            
            <div className="mt-6">
              <h4 className="font-medium mb-2">Key Elements by Level:</h4>
              
              <div className="space-y-4">
                {levels.map((levelIndices, levelNum) => (
                  <div key={levelNum} className="border-l-4 border-primary pl-4 py-1">
                    <h5 className="font-medium">Level {levelNum + 1}</h5>
                    <ul className="mt-2 space-y-1">
                      {levelIndices.map((idx) => (
                        <li key={idx} className="text-sm">
                          {selectedIdeas[idx].title}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-slate-50 rounded-md">
              <h4 className="font-medium mb-2">Conclusions:</h4>
              <p className="text-sm">
                • Ideas at higher levels have greater influence over the system.
              </p>
              <p className="text-sm">
                • To generate effective changes, consider focusing first on ideas
                  at higher levels.
              </p>
              <p className="text-sm">
                • The model helps simplify the initial complexity and provides
                  a structure for decision-making.
              </p>
            </div>
          </div>
        );
    }
  };

  // Botones de navegación según la etapa
  const renderNavigationButtons = () => {
    switch (stage) {
      case "intro":
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => setStage("questions")}>
              Start Process
            </Button>
          </div>
        );
        
      case "ssim":
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStage("questions")}>
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
            <Button variant="outline" onClick={() => setStage("ssim")}>
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
            <Button variant="outline" onClick={() => setStage("reachability")}>
              Back
            </Button>
            <Button onClick={proceedToDiagram}>
              View Final Diagram
            </Button>
          </div>
        );
        
      case "diagram":
        return (
          <div className="flex justify-end">
            <Button onClick={onClose}>
              Finish
            </Button>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {stage === "intro" && "Interpretive Structural Modeling (ISM)"}
            {stage === "questions" && "Relationship Identification"}
            {stage === "ssim" && "SSIM Matrix"}
            {stage === "reachability" && "Reachability Matrix"}
            {stage === "levels" && "Level Partitioning"}
            {stage === "diagram" && "Final ISM Diagram"}
          </DialogTitle>
          <DialogDescription>
            {stage === "intro" && "Build a structural model of relationships between selected ideas."}
            {stage === "questions" && "Determine the type of relationship between each pair of ideas."}
            {stage === "ssim" && "View the structural self-interaction matrix."}
            {stage === "reachability" && "Analyze the initial reachability matrix."}
            {stage === "levels" && "Explore the identified level hierarchy."}
            {stage === "diagram" && "View the complete structural model."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="my-4">
          {renderCurrentStage()}
        </div>
        
        <DialogFooter>
          {renderNavigationButtons()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}