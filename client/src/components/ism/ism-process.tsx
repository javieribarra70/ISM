import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Idea, Relationship } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, ArrowRight, ArrowLeft, ArrowLeftRight, Circle } from "lucide-react";
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
  // State to track saving progress
  const [isSaving, setIsSaving] = useState(false);
  
  // Get existing relationships to check if we need to load previous VAXO responses
  const { data: existingRelationships, isLoading: isLoadingRelationships, error: relationshipsError } = useQuery({
    queryKey: ['/api/projects', selectedIdeas[0]?.projectId, 'relationships'],
    enabled: isOpen && selectedIdeas.length > 0
  });
  
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

  // Load existing relationships from the database if available
  useEffect(() => {
    if (isOpen && selectedIdeas.length > 0 && existingRelationships && Array.isArray(existingRelationships) && existingRelationships.length > 0) {
      // Convert existing relationships to SSIM cells
      const existingSSIM: SSIMCell[] = [];
      
      (existingRelationships as Relationship[]).forEach(rel => {
        // Find the ideas in the selectedIdeas array
        const fromIdea = selectedIdeas.find(idea => idea.id === rel.fromIdeaId);
        const toIdea = selectedIdeas.find(idea => idea.id === rel.toIdeaId);
        
        if (fromIdea && toIdea) {
          // Add the relationship to the SSIM matrix
          existingSSIM.push({
            ideaI: fromIdea.id,
            ideaJ: toIdea.id,
            relation: rel.relationType as RelationType
          });
        }
      });
      
      // If we have enough relationships to populate the SSIM matrix, 
      // jump directly to the SSIM stage
      if (existingSSIM.length > 0) {
        setSSIMMatrix(existingSSIM);
        setStage("ssim");
        toast({
          title: "Existing relationships loaded",
          description: "Previous VAXO relationships were found and loaded.",
          variant: "default"
        });
        return;
      }
    }
    
    // If there are no existing relationships or we couldn't load them,
    // proceed with generating new questions
    if (isOpen && selectedIdeas.length > 0) {
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
      
      setQuestions(newQuestions);
      setCurrentQuestionIndex(0);
      setStage("intro");
      setSSIMMatrix([]);
      setReachabilityMatrix([]);
      setFinalReachabilityMatrix([]);
      setLevels([]);
    }
  }, [isOpen, selectedIdeas, existingRelationships, toast]);

  // Function to answer a question
  const answerQuestion = (response: RelationType) => {
    if (currentQuestionIndex < questions.length) {
      const updatedQuestions = [...questions];
      updatedQuestions[currentQuestionIndex].response = response;
      
      // Infer logical relationships if possible
      const inferredQuestions = applyLogicalInference(updatedQuestions, currentQuestionIndex);
      setQuestions(inferredQuestions);
      
      // Count how many questions are left to answer
      const pendingQuestions = inferredQuestions.filter(q => q.response === null);
      
      if (pendingQuestions.length > 0) {
        // Select the next most informative question
        selectNextMostInformativeQuestion(inferredQuestions);
      } else {
        // All questions have been answered, build the SSIM matrix
        buildSSIMMatrix(inferredQuestions);
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
      buildSSIMMatrix(currentQuestions);
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
      
      // Delete any existing relationships first (to avoid duplicates)
      if (existingRelationships && Array.isArray(existingRelationships) && existingRelationships.length > 0) {
        // Use Promise.all to delete all existing relationships
        await Promise.all(
          existingRelationships.map(rel => 
            apiRequest('DELETE', '/api/relationships/' + rel.id)
          )
        );
      }
      
      // Create the new VAXO relationships
      const savePromises = relationships
        .filter(rel => rel.relation !== RelationType.O) // Typically we don't store "no relationship"
        .map(rel => {
          return apiRequest('POST', '/api/relationships', {
            fromIdeaId: rel.ideaI,
            toIdeaId: rel.ideaJ,
            projectId: selectedIdeas[0].projectId,
            createdBy: user.id,
            relationType: rel.relation
          });
        });
      
      await Promise.all(savePromises);
      
      // Invalidate the relationships query to refresh the data
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', selectedIdeas[0].projectId, 'relationships']
      });
      
      toast({
        title: "Relationships saved",
        description: "The VAXO relationships have been saved to the database.",
        variant: "default"
      });
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
    saveVAXORelationshipsToDatabase(matrix);
    
    setStage("ssim");
  };

  // Proceed to the reachability matrix stage
  const proceedToReachabilityMatrix = () => {
    const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, ssimMatrix);
    setReachabilityMatrix(initialMatrix);
    setStage("reachability");
  };

  // Apply transitive closure and proceed to level determination
  const applyTransitiveClosureAndProceed = () => {
    const transitiveMatrix = applyTransitiveClosure(reachabilityMatrix);
    setFinalReachabilityMatrix(transitiveMatrix);
    identifyLevels(transitiveMatrix);
    setStage("levels");
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
    setStage("diagram");
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

  // Navigation buttons according to the stage
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
              View Final ISM Diagram Model
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
      <DialogContent className="max-w-4xl max-h-[95vh] h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {stage === "intro" && "Interpretive Structural Modeling (ISM)"}
            {stage === "questions" && "Relationship Identification"}
            {stage === "ssim" && "SSIM Matrix"}
            {stage === "reachability" && "Reachability Matrix"}
            {stage === "levels" && "Level Partitioning"}
            {stage === "diagram" && "Final ISM Diagram Model"}
          </DialogTitle>
          <DialogDescription>
            {stage === "intro" && "Build a structural model of relationships between selected ideas."}
            {stage === "questions" && "Determine the type of relationship between each pair of ideas."}
            {stage === "ssim" && "View the structural self-interaction matrix."}
            {stage === "reachability" && "Analyze the initial reachability matrix."}
            {stage === "levels" && "Explore the identified level hierarchy."}
            {stage === "diagram" && ""}
          </DialogDescription>
        </DialogHeader>
        
        <div className="my-4">
          {renderCurrentStage()}
        </div>
        
        <DialogFooter>
          {isSaving && (
            <div className="flex items-center justify-center w-full mb-2">
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent"></div>
              <p className="text-sm text-muted-foreground">Saving relationships...</p>
            </div>
          )}
          {renderNavigationButtons()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}