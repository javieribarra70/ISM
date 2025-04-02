import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Idea } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
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
      setQuestions(updatedQuestions);
      
      // Inferir relaciones lógicas si es posible
      const inferredQuestions = applyLogicalInference(updatedQuestions, currentQuestionIndex);
      setQuestions(inferredQuestions);
      
      // Avanzar a la siguiente pregunta no respondida
      let nextIndex = currentQuestionIndex + 1;
      while (
        nextIndex < inferredQuestions.length &&
        inferredQuestions[nextIndex].response !== null
      ) {
        nextIndex++;
      }
      
      if (nextIndex < inferredQuestions.length) {
        setCurrentQuestionIndex(nextIndex);
      } else {
        // Todas las preguntas han sido respondidas, construir la matriz SSIM
        buildSSIMMatrix(inferredQuestions);
      }
    }
  };

  // Función para aplicar inferencias lógicas
  const applyLogicalInference = (
    currentQuestions: ISMQuestion[],
    answeredIndex: number
  ): ISMQuestion[] => {
    const updatedQuestions = [...currentQuestions];
    const answeredQuestion = updatedQuestions[answeredIndex];
    
    // Si aún no se ha respondido, no hay nada que inferir
    if (!answeredQuestion.response) return updatedQuestions;
    
    const iId = answeredQuestion.ideaI.id;
    const jId = answeredQuestion.ideaJ.id;
    const relation = answeredQuestion.response;
    
    // No implementamos inferencias adicionales por ahora
    // Este es un punto donde se podría extender la lógica
    
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
              <AlertTitle>Proceso de Modelado Estructural Interpretativo (ISM)</AlertTitle>
              <AlertDescription>
                Este proceso te guiará para construir un modelo de relaciones entre las ideas seleccionadas.
                Utilizaremos el sistema VAXO para registrar las relaciones de influencia:
              </AlertDescription>
            </Alert>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">V: i influye en j</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    La idea i tiene una influencia directa sobre la idea j
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">A: j influye en i</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    La idea j tiene una influencia directa sobre la idea i
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">X: influencia mutua</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Las ideas i y j se influyen mutuamente
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">O: sin relación</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    No existe relación de influencia entre las ideas i y j
                  </p>
                </CardContent>
              </Card>
            </div>
            
            {projectContext && (
              <div className="my-6 bg-slate-100 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">Contexto del Proyecto</h3>
                
                <div className="mb-3">
                  <h4 className="font-medium text-sm">Contexto:</h4>
                  <p className="text-sm">{projectContext.context}</p>
                </div>
                
                <div className="mb-3">
                  <h4 className="font-medium text-sm">Pregunta Desencadenante:</h4>
                  <p className="text-sm">{projectContext.triggeringQuestion}</p>
                </div>
                
                <div className="mb-3">
                  <h4 className="font-medium text-sm">Relación:</h4>
                  <p className="text-sm">{projectContext.relation}</p>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm">Restricción:</h4>
                  <p className="text-sm">{projectContext.restriction}</p>
                </div>
              </div>
            )}
            
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Ideas Seleccionadas</h3>
              
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
                A continuación, se te harán preguntas sobre la relación entre cada par de ideas.
                Utiliza la información del contexto para determinar si existe una relación
                de influencia de acuerdo con el sistema VAXO.
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
                  <h3 className="text-lg font-semibold">Relación de Influencia</h3>
                  <Badge variant="outline">
                    Pregunta {currentQuestionIndex + 1} de {questions.length}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Idea i: {question.ideaI.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{question.ideaI.description}</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Idea j: {question.ideaJ.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{question.ideaJ.description}</p>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-2">
                    Relación de contexto:
                  </h4>
                  <p className="text-sm p-3 bg-slate-100 rounded">
                    {projectContext?.relation}
                  </p>
                </div>
                
                <div className="mb-6">
                  <h4 className="font-medium mb-2">
                    ¿Qué tipo de relación existe entre las ideas i y j?
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Selecciona la opción más apropiada según el contexto y la relación definida.
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="p-6"
                  onClick={() => answerQuestion(RelationType.V)}
                >
                  <div className="text-center">
                    <span className="text-lg font-bold block">V</span>
                    <span className="text-xs">i influye en j</span>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="p-6"
                  onClick={() => answerQuestion(RelationType.A)}
                >
                  <div className="text-center">
                    <span className="text-lg font-bold block">A</span>
                    <span className="text-xs">j influye en i</span>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="p-6"
                  onClick={() => answerQuestion(RelationType.X)}
                >
                  <div className="text-center">
                    <span className="text-lg font-bold block">X</span>
                    <span className="text-xs">influencia mutua</span>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="p-6"
                  onClick={() => answerQuestion(RelationType.O)}
                >
                  <div className="text-center">
                    <span className="text-lg font-bold block">O</span>
                    <span className="text-xs">sin relación</span>
                  </div>
                </Button>
              </div>
            </div>
          );
        }
        return null;
        
      case "ssim":
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Matriz de Estructura de Auto-Interacción (SSIM)</h3>
            
            <p className="text-sm text-muted-foreground mb-4">
              La siguiente matriz muestra las relaciones de influencia que has indicado
              entre cada par de ideas.
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
              <h4 className="font-medium">Leyenda:</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div>V: i influye en j</div>
                <div>A: j influye en i</div>
                <div>X: influencia mutua</div>
                <div>O: sin relación</div>
              </div>
              
              <div className="mt-4">
                <h4 className="font-medium mb-2">Referencia de ideas:</h4>
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
            <h3 className="text-lg font-semibold">Matriz de Alcance Inicial</h3>
            
            <p className="text-sm text-muted-foreground mb-4">
              La matriz de alcance inicial muestra las relaciones directas entre las ideas.
              Un 1 indica que la idea i puede alcanzar (influir en) la idea j.
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
              <h4 className="font-medium mb-2">Referencia de ideas:</h4>
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
            <h3 className="text-lg font-semibold">Partición por Niveles</h3>
            
            <p className="text-sm text-muted-foreground mb-4">
              Los elementos han sido organizados en niveles jerárquicos según sus relaciones de influencia.
              Cada nivel representa un grupo de ideas con similar poder de influencia en el sistema.
            </p>
            
            <div className="space-y-6 mt-6">
              {levels.map((levelIndices, levelNum) => (
                <div key={levelNum} className="border rounded-md p-4">
                  <h4 className="font-medium mb-3">Nivel {levelNum + 1}</h4>
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
              <h4 className="font-medium mb-2">Interpretación:</h4>
              <p className="text-sm">
                • Los elementos del nivel 1 tienen el menor poder de influencia pero reciben influencia
                  de otros elementos.
              </p>
              <p className="text-sm">
                • Conforme aumenta el nivel, aumenta el poder de influencia sobre el sistema.
              </p>
              <p className="text-sm">
                • Los elementos del nivel más alto son los más influyentes y pueden considerarse
                  como factores clave o impulsores.
              </p>
            </div>
          </div>
        );
        
      case "diagram":
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Modelo ISM Final</h3>
            
            <p className="text-sm text-muted-foreground mb-4">
              El resultado final del proceso ISM es un modelo jerárquico que muestra
              las relaciones de influencia entre las ideas. Este modelo te ayudará a
              comprender la estructura subyacente y las dinámicas del sistema.
            </p>
            
            <div className="p-6 bg-slate-50 rounded-md text-center">
              <p className="text-sm">
                El diagrama será implementado para mostrar una representación gráfica
                de las relaciones entre elementos en una actualización posterior.
              </p>
            </div>
            
            <div className="mt-6">
              <h4 className="font-medium mb-2">Elementos Clave por Nivel:</h4>
              
              <div className="space-y-4">
                {levels.map((levelIndices, levelNum) => (
                  <div key={levelNum} className="border-l-4 border-primary pl-4 py-1">
                    <h5 className="font-medium">Nivel {levelNum + 1}</h5>
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
              <h4 className="font-medium mb-2">Conclusiones:</h4>
              <p className="text-sm">
                • Las ideas en los niveles superiores tienen mayor influencia sobre el sistema.
              </p>
              <p className="text-sm">
                • Para generar cambios efectivos, considera enfocarte primero en las ideas
                  de los niveles superiores.
              </p>
              <p className="text-sm">
                • El modelo ayuda a simplificar la complejidad inicial y proporciona
                  una estructura para la toma de decisiones.
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
              Cancelar
            </Button>
            <Button onClick={() => setStage("questions")}>
              Comenzar Proceso
            </Button>
          </div>
        );
        
      case "ssim":
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStage("questions")}>
              Volver a Preguntas
            </Button>
            <Button onClick={proceedToReachabilityMatrix}>
              Generar Matriz de Alcance
            </Button>
          </div>
        );
        
      case "reachability":
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStage("ssim")}>
              Volver a SSIM
            </Button>
            <Button onClick={applyTransitiveClosureAndProceed}>
              Aplicar Cierre Transitivo
            </Button>
          </div>
        );
        
      case "levels":
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStage("reachability")}>
              Volver
            </Button>
            <Button onClick={proceedToDiagram}>
              Ver Diagrama Final
            </Button>
          </div>
        );
        
      case "diagram":
        return (
          <div className="flex justify-end">
            <Button onClick={onClose}>
              Finalizar
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
            {stage === "intro" && "Modelado Estructural Interpretativo (ISM)"}
            {stage === "questions" && "Identificación de Relaciones"}
            {stage === "ssim" && "Matriz SSIM"}
            {stage === "reachability" && "Matriz de Alcance"}
            {stage === "levels" && "Jerarquización por Niveles"}
            {stage === "diagram" && "Diagrama ISM Final"}
          </DialogTitle>
          <DialogDescription>
            {stage === "intro" && "Construye un modelo de la estructura de relaciones entre las ideas seleccionadas."}
            {stage === "questions" && "Determina el tipo de relación entre cada par de ideas."}
            {stage === "ssim" && "Visualiza la matriz de estructura de auto-interacción."}
            {stage === "reachability" && "Analiza la matriz de alcance inicial."}
            {stage === "levels" && "Explora la jerarquía de niveles identificada."}
            {stage === "diagram" && "Visualiza el modelo estructural completo."}
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