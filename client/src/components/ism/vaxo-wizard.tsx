import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Idea, Relationship, Project } from "@shared/schema";
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
import { applyTransitiveClosure, areSetsEqual, findStronglyConnectedComponents } from "@/lib/matrix-utils";

interface VaxoWizardProps {
  projectId: number;
  preselectedIdeaIds?: number[];
  onComplete?: () => void;
}

enum RelationType {
  V = "V",
  A = "A",
  X = "X",
  O = "O",
}

interface ISMQuestion {
  ideaI: Idea;
  ideaJ: Idea;
  response: RelationType | null;
}

interface SSIMCell {
  ideaI: number;
  ideaJ: number;
  relation: RelationType | null;
}

function buildInitialReachabilityMatrix(
  ideas: Idea[],
  ssimMatrix: SSIMCell[]
): boolean[][] {
  const n = ideas.length;
  const matrix: boolean[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(false));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
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

function calculateLevels(reachabilityMatrix: boolean[][], ideas: Idea[]): number[][] {
  if (!reachabilityMatrix.length) return [];
  
  const n = reachabilityMatrix.length;
  let remainingElements = Array.from({ length: n }, (_, i) => i);
  const levels: number[][] = [];
  
  while (remainingElements.length > 0) {
    const currentLevel = determineLevel(remainingElements, reachabilityMatrix, ideas);
    
    if (currentLevel.length === 0) {
      levels.push([...remainingElements]);
      break;
    }
    
    levels.push(currentLevel);
    remainingElements = remainingElements.filter(el => !currentLevel.includes(el));
  }
  
  return levels;
}

function determineLevel(
  remainingElements: number[],
  reachabilityMatrix: boolean[][],
  ideas: Idea[]
): number[] {
  const reachability: Map<number, Set<number>> = new Map();
  const antecedent: Map<number, Set<number>> = new Map();
  const intersection: Map<number, Set<number>> = new Map();
  
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
    
    const intSet = new Set<number>();
    reachSet.forEach((item) => {
      if (antSet.has(item)) {
        intSet.add(item);
      }
    });
    intersection.set(ideaIndex, intSet);
  });
  
  const levelElements: number[] = [];
  remainingElements.forEach((ideaIndex) => {
    const reachSet = reachability.get(ideaIndex);
    const intSet = intersection.get(ideaIndex);
    
    if (reachSet && intSet && reachSet.size === intSet.size && areSetsEqual(reachSet, intSet)) {
      levelElements.push(ideaIndex);
    }
  });
  
  return levelElements;
}

export default function VaxoWizard({ projectId, preselectedIdeaIds = [], onComplete }: VaxoWizardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [stage, setStage] = useState<
    "loading" | "questions" | "ssim" | "reachability" | "levels" | "diagram"
  >("loading");

  const [questions, setQuestions] = useState<ISMQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [ssimMatrix, setSSIMMatrix] = useState<SSIMCell[]>([]);
  const [reachabilityMatrix, setReachabilityMatrix] = useState<boolean[][]>([]);
  const [finalReachabilityMatrix, setFinalReachabilityMatrix] = useState<boolean[][]>([]);
  const [levels, setLevels] = useState<number[][]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedIdeas, setSelectedIdeas] = useState<Idea[]>([]);
  const [projectContext, setProjectContext] = useState<{
    context: string;
    triggeringQuestion: string;
    relation: string;
    restriction: string;
  } | null>(null);

  const { data: project, isLoading: isProjectLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data: allIdeas = [], isLoading: isIdeasLoading } = useQuery<Idea[]>({
    queryKey: [`/api/projects/${projectId}/ideas`],
    enabled: !!projectId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data: existingRelationships = [], isLoading: isRelationshipsLoading } = useQuery<Relationship[]>({
    queryKey: [`/api/projects/${projectId}/relationships`],
    enabled: !!projectId && !isInitialized,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data: selectedIdeasData = [], isLoading: isSelectedIdeasLoading } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/selected-ideas`],
    enabled: !!projectId && preselectedIdeaIds.length === 0 && !isInitialized,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  useEffect(() => {
    if (project) {
      setProjectContext({
        context: project.context || "No context has been defined for this project.",
        triggeringQuestion: project.triggeringQuestion || "No triggering question has been defined.",
        relation: project.relation || "No specific relationship has been defined.",
        restriction: project.restriction || "No restrictions have been defined.",
      });
    }
  }, [project]);

  useEffect(() => {
    if (isIdeasLoading || isRelationshipsLoading || isSelectedIdeasLoading || isProjectLoading) {
      return;
    }

    if (isInitialized) {
      return;
    }

    let ideasToUse: Idea[] = [];
    
    if (preselectedIdeaIds.length > 0) {
      ideasToUse = allIdeas.filter(idea => preselectedIdeaIds.includes(idea.id));
    } else if (selectedIdeasData.length > 0) {
      const selectedIdeaIdsList = selectedIdeasData.map((item: any) => item.ideaId);
      ideasToUse = allIdeas.filter(idea => selectedIdeaIdsList.includes(idea.id));
    }

    if (ideasToUse.length < 2) {
      setIsInitialized(true);
      setStage("questions");
      return;
    }

    setSelectedIdeas(ideasToUse);
    
    const newQuestions: ISMQuestion[] = [];
    for (let i = 0; i < ideasToUse.length - 1; i++) {
      for (let j = i + 1; j < ideasToUse.length; j++) {
        newQuestions.push({
          ideaI: ideasToUse[i],
          ideaJ: ideasToUse[j],
          response: null,
        });
      }
    }

    let preFilled = 0;
    if (existingRelationships && Array.isArray(existingRelationships)) {
      existingRelationships.forEach(rel => {
        if (rel.fromIdeaId && rel.toIdeaId && rel.relationType && ["V", "A", "X", "O"].includes(rel.relationType)) {
          const questionIndex = newQuestions.findIndex(
            q => (q.ideaI.id === rel.fromIdeaId && q.ideaJ.id === rel.toIdeaId) ||
                 (q.ideaI.id === rel.toIdeaId && q.ideaJ.id === rel.fromIdeaId)
          );
          
          if (questionIndex !== -1) {
            let response = rel.relationType as RelationType;
            if (newQuestions[questionIndex].ideaI.id === rel.toIdeaId && newQuestions[questionIndex].ideaJ.id === rel.fromIdeaId) {
              if (response === RelationType.V) response = RelationType.A;
              else if (response === RelationType.A) response = RelationType.V;
            }
            newQuestions[questionIndex].response = response;
            preFilled++;
          }
        }
      });
    }

    const firstUnansweredIndex = newQuestions.findIndex(q => q.response === null);
    const answeredCount = newQuestions.filter(q => q.response !== null).length;
    
    setQuestions(newQuestions);
    setCurrentQuestionIndex(firstUnansweredIndex !== -1 ? firstUnansweredIndex : 0);
    setIsInitialized(true);
    setStage("questions");
    
    if (answeredCount > 0 && firstUnansweredIndex !== -1) {
      toast({
        title: "Continuing process",
        description: `Found ${answeredCount} saved relationships. Continuing from where you left off.`,
        variant: "default",
        duration: 3000
      });
    } else if (answeredCount > 0 && firstUnansweredIndex === -1) {
      toast({
        title: "Process previously completed",
        description: `All ${answeredCount} relationships were already answered.`,
        variant: "default",
        duration: 3000
      });
    }
  }, [isIdeasLoading, isRelationshipsLoading, isSelectedIdeasLoading, isProjectLoading, allIdeas, existingRelationships, selectedIdeasData, preselectedIdeaIds, isInitialized, toast]);

  const answerQuestion = async (response: RelationType) => {
    try {
      if (currentQuestionIndex < questions.length) {
        const updatedQuestions = [...questions];
        const currentQuestion = updatedQuestions[currentQuestionIndex];
        currentQuestion.response = response;
        
        if (projectId) {
          try {
            await apiRequest('POST', `/api/projects/${projectId}/relationships`, {
              fromIdeaId: currentQuestion.ideaI.id,
              toIdeaId: currentQuestion.ideaJ.id,
              relationType: response
            });
          } catch (saveError) {
            console.error('Error saving VAXO relationship:', saveError);
            toast({
              title: "Error saving",
              description: "Could not save the relationship. Progress might be lost.",
              variant: "destructive"
            });
          }
        }
        
        const inferredQuestions = applyLogicalInference(updatedQuestions, currentQuestionIndex);
        setQuestions(inferredQuestions);
        
        const pendingQuestions = inferredQuestions.filter(q => q.response === null);
        
        if (pendingQuestions.length > 0) {
          const nextIndex = inferredQuestions.findIndex(q => q.response === null);
          if (nextIndex !== -1) {
            setCurrentQuestionIndex(nextIndex);
          }
        } else {
          const matrix: SSIMCell[] = [];
          
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
          
          const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, matrix);
          setReachabilityMatrix(initialMatrix);
          
          const finalMatrix = applyTransitiveClosure(initialMatrix);
          setFinalReachabilityMatrix(finalMatrix);
          
          const computedLevels = calculateLevels(finalMatrix, selectedIdeas);
          setLevels(computedLevels);
          
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
            }
          });

          const vaxoResults = {
            ssimMatrix: booleanMatrix,
            reachabilityMatrix: initialMatrix,
            levels: computedLevels,
            selectedIdeas: selectedIdeas,
            processDate: new Date().toISOString(),
          };
          
          try {
            localStorage.setItem(`vaxo-results-${projectId}`, JSON.stringify(vaxoResults));
          } catch (error) {
            console.error("Error saving VAXO results:", error);
          }
          
          setStage("ssim");
          
          toast({
            title: "Process completed",
            description: "Results saved. Go to the Report tab to see the full analysis.",
            variant: "default",
            duration: 5000
          });
        }
      }
    } catch (error) {
      console.error("Error processing response:", error);
      toast({
        title: "Error processing response",
        description: "An error occurred while saving the relationship. Please try again.",
        variant: "destructive"
      });
    }
  };

  const applyLogicalInference = (
    currentQuestions: ISMQuestion[],
    answeredIndex: number
  ): ISMQuestion[] => {
    const updatedQuestions = [...currentQuestions];
    const answeredQuestion = updatedQuestions[answeredIndex];
    
    if (!answeredQuestion.response) return updatedQuestions;
    
    const provisionalSSIM: SSIMCell[] = [];
    updatedQuestions.forEach((q) => {
      if (q.response) {
        provisionalSSIM.push({
          ideaI: q.ideaI.id,
          ideaJ: q.ideaJ.id,
          relation: q.response,
        });
        
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
    
    const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, provisionalSSIM);
    const transitiveMatrix = applyTransitiveClosure(initialMatrix);
    
    for (let i = 0; i < updatedQuestions.length; i++) {
      if (updatedQuestions[i].response !== null) continue;
      
      const ideaI = updatedQuestions[i].ideaI;
      const ideaJ = updatedQuestions[i].ideaJ;
      
      const idxI = selectedIdeas.findIndex(idea => idea.id === ideaI.id);
      const idxJ = selectedIdeas.findIndex(idea => idea.id === ideaJ.id);
      
      if (idxI !== -1 && idxJ !== -1) {
        const iToJ = transitiveMatrix[idxI][idxJ];
        const jToI = transitiveMatrix[idxJ][idxI];
        
        if (iToJ && !jToI) {
          updatedQuestions[i].response = RelationType.V;
        } else if (!iToJ && jToI) {
          updatedQuestions[i].response = RelationType.A;
        } else if (iToJ && jToI) {
          updatedQuestions[i].response = RelationType.X;
        }
      }
    }
    
    return updatedQuestions;
  };

  const proceedToReachabilityMatrix = () => {
    toast({
      title: "Processing matrix",
      description: "Generating initial reachability matrix...",
      duration: 3000,
    });
    
    setTimeout(() => {
      const initialMatrix = buildInitialReachabilityMatrix(selectedIdeas, ssimMatrix);
      setReachabilityMatrix(initialMatrix);
      setStage("reachability");
    }, 300);
  };

  const applyTransitiveClosureAndProceed = () => {
    toast({
      title: "Applying transitive closure",
      description: "Processing indirect relationships between ideas...",
      duration: 3000,
    });
    
    setTimeout(() => {
      const transitiveMatrix = applyTransitiveClosure(reachabilityMatrix);
      setFinalReachabilityMatrix(transitiveMatrix);
      setStage("levels");
    }, 300);
  };

  const identifyLevels = (transitiveMatrix: boolean[][]) => {
    const remainingIndices = Array.from({ length: selectedIdeas.length }, (_, i) => i);
    const computedLevels: number[][] = [];
    
    while (remainingIndices.length > 0) {
      const levelIndices = determineLevel(remainingIndices, transitiveMatrix, selectedIdeas);
      if (levelIndices.length > 0) {
        computedLevels.push(levelIndices);
        for (const idx of levelIndices) {
          const removeIndex = remainingIndices.indexOf(idx);
          if (removeIndex !== -1) {
            remainingIndices.splice(removeIndex, 1);
          }
        }
      } else {
        break;
      }
    }
    
    setLevels(computedLevels);
  };

  const proceedToDiagram = () => {
    toast({
      title: "Generating ISM diagram",
      description: "Preparing structural model visualization...",
      duration: 3000,
    });
    
    setTimeout(() => {
      if (finalReachabilityMatrix.length > 0 && levels.length === 0) {
        identifyLevels(finalReachabilityMatrix);
      }
      
      setTimeout(() => {
        setStage("diagram");
      }, 300);
    }, 300);
  };

  const getTitle = () => {
    switch(stage) {
      case "loading": return "Loading VAXO Process";
      case "questions": return "VAXO Relationship Identification";
      case "ssim": return "SSIM Matrix";
      case "reachability": return "Reachability Matrix";
      case "levels": return "Level Partitioning";
      case "diagram": return "Final ISM Diagram Model";
      default: return "VAXO Process";
    }
  };
  
  const getDescription = () => {
    switch(stage) {
      case "loading": return "Loading data and preparing questions...";
      case "questions": return "Determine the type of relationship between each pair of ideas.";
      case "ssim": return "View the structural self-interaction matrix.";
      case "reachability": return "Analyze the initial reachability matrix.";
      case "levels": return "Explore the identified level hierarchy.";
      case "diagram": return "";
      default: return "";
    }
  };

  const renderCurrentStage = () => {
    if (stage === "loading" || isIdeasLoading || isRelationshipsLoading || isSelectedIdeasLoading || isProjectLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-opacity-50 border-t-primary rounded-full"></div>
          <p className="text-muted-foreground">Loading VAXO process...</p>
          <p className="text-sm text-muted-foreground">
            Verifying existing relationships...
          </p>
        </div>
      );
    }

    if (stage === "questions" && questions.length === 0 && selectedIdeas.length > 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-opacity-50 border-t-primary rounded-full"></div>
          <p className="text-muted-foreground">Preparing VAXO questions...</p>
        </div>
      );
    }

    if (selectedIdeas.length < 2) {
      return (
        <Alert variant="destructive" className="my-4">
          <AlertTitle>Not enough ideas</AlertTitle>
          <AlertDescription>
            At least 2 ideas are required for the VAXO process. Please go back and select more ideas.
          </AlertDescription>
        </Alert>
      );
    }
    
    switch (stage) {
      case "questions":
        if (questions.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <p className="text-muted-foreground">Preparing VAXO questions...</p>
            </div>
          );
        }
        
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
                
                {projectContext && (
                  <Card className="mb-4 bg-muted/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Info className="h-4 w-4" />
                        Context
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <p><strong>Question:</strong> {projectContext.triggeringQuestion}</p>
                      <p><strong>Relationship:</strong> {projectContext.relation}</p>
                    </CardContent>
                  </Card>
                )}

                <Card className="mb-4">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-center gap-4 text-center">
                      <div className="p-4 bg-primary/10 rounded-lg flex-1">
                        <p className="font-semibold">{question.ideaI.title}</p>
                        {question.ideaI.description && (
                          <p className="text-sm text-muted-foreground mt-1">{question.ideaI.description}</p>
                        )}
                      </div>
                      <ArrowRight className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                      <div className="p-4 bg-primary/10 rounded-lg flex-1">
                        <p className="font-semibold">{question.ideaJ.title}</p>
                        {question.ideaJ.description && (
                          <p className="text-sm text-muted-foreground mt-1">{question.ideaJ.description}</p>
                        )}
                      </div>
                    </div>
                    
                    <p className="text-center mt-4 text-muted-foreground">
                      Does <strong>{question.ideaI.title}</strong> influence <strong>{question.ideaJ.title}</strong>?
                    </p>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Button
                    variant="outline"
                    className="flex flex-col items-center py-4 h-auto"
                    onClick={() => answerQuestion(RelationType.V)}
                    data-testid="button-vaxo-v"
                  >
                    <ArrowRight className="h-6 w-6 mb-2 text-blue-500" />
                    <span className="font-semibold">V</span>
                    <span className="text-xs text-muted-foreground">I influences J</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="flex flex-col items-center py-4 h-auto"
                    onClick={() => answerQuestion(RelationType.A)}
                    data-testid="button-vaxo-a"
                  >
                    <ArrowLeft className="h-6 w-6 mb-2 text-green-500" />
                    <span className="font-semibold">A</span>
                    <span className="text-xs text-muted-foreground">J influences I</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="flex flex-col items-center py-4 h-auto"
                    onClick={() => answerQuestion(RelationType.X)}
                    data-testid="button-vaxo-x"
                  >
                    <ArrowLeftRight className="h-6 w-6 mb-2 text-purple-500" />
                    <span className="font-semibold">X</span>
                    <span className="text-xs text-muted-foreground">Mutual influence</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="flex flex-col items-center py-4 h-auto"
                    onClick={() => answerQuestion(RelationType.O)}
                    data-testid="button-vaxo-o"
                  >
                    <Circle className="h-6 w-6 mb-2 text-gray-400" />
                    <span className="font-semibold">O</span>
                    <span className="text-xs text-muted-foreground">No relationship</span>
                  </Button>
                </div>
              </div>
              
              <div className="mt-4">
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${((questions.filter(q => q.response !== null).length) / questions.length) * 100}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {questions.filter(q => q.response !== null).length} of {questions.length} relationships defined
                </p>
              </div>
            </div>
          );
        } else {
          return (
            <div className="text-center py-8">
              <p>All questions answered. Building SSIM matrix...</p>
            </div>
          );
        }
        
      case "ssim":
        return (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>SSIM Matrix</AlertTitle>
              <AlertDescription>
                This is the Structural Self-Interaction Matrix showing the direct relationships between ideas.
              </AlertDescription>
            </Alert>
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Idea</TableHead>
                    {selectedIdeas.map((idea, idx) => (
                      <TableHead key={idea.id} className="text-center min-w-[80px]">
                        {idx + 1}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedIdeas.map((ideaI, idxI) => (
                    <TableRow key={ideaI.id}>
                      <TableCell className="font-medium">
                        {idxI + 1}. {ideaI.title.substring(0, 20)}...
                      </TableCell>
                      {selectedIdeas.map((ideaJ, idxJ) => {
                        if (idxI === idxJ) {
                          return (
                            <TableCell key={ideaJ.id} className="text-center bg-muted">
                              -
                            </TableCell>
                          );
                        }
                        
                        const cell = ssimMatrix.find(
                          c => c.ideaI === ideaI.id && c.ideaJ === ideaJ.id
                        );
                        
                        return (
                          <TableCell key={ideaJ.id} className="text-center">
                            {cell?.relation || "-"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
        
      case "reachability":
        return (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Initial Reachability Matrix</AlertTitle>
              <AlertDescription>
                This matrix shows which ideas can directly reach other ideas based on the VAXO relationships.
              </AlertDescription>
            </Alert>
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Idea</TableHead>
                    {selectedIdeas.map((idea, idx) => (
                      <TableHead key={idea.id} className="text-center min-w-[60px]">
                        {idx + 1}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedIdeas.map((ideaI, idxI) => (
                    <TableRow key={ideaI.id}>
                      <TableCell className="font-medium">
                        {idxI + 1}. {ideaI.title.substring(0, 15)}...
                      </TableCell>
                      {selectedIdeas.map((ideaJ, idxJ) => (
                        <TableCell 
                          key={ideaJ.id} 
                          className={`text-center ${reachabilityMatrix[idxI]?.[idxJ] ? 'bg-primary/20' : ''}`}
                        >
                          {reachabilityMatrix[idxI]?.[idxJ] ? "1" : "0"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
        
      case "levels":
        return (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Level Partitioning</AlertTitle>
              <AlertDescription>
                Ideas are organized into hierarchical levels based on their reachability relationships.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-4">
              {levels.map((level, levelIdx) => (
                <Card key={levelIdx}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Level {levelIdx + 1}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {level.map((ideaIdx) => (
                        <Badge key={ideaIdx} variant="secondary">
                          {selectedIdeas[ideaIdx]?.title}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
        
      case "diagram":
        return (
          <div className="space-y-4">
            <ISMDiagram
              ideas={selectedIdeas}
              levels={levels}
              finalReachabilityMatrix={finalReachabilityMatrix}
              projectId={projectId}
            />
          </div>
        );
        
      default:
        return null;
    }
  };

  const renderNavigationButtons = () => {
    switch (stage) {
      case "questions":
        return null;
        
      case "ssim":
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStage("questions")}>
              Back to Questions
            </Button>
            <Button onClick={proceedToReachabilityMatrix}>
              View Reachability Matrix
            </Button>
          </div>
        );
        
      case "reachability":
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStage("ssim")}>
              Back
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
            <Button onClick={onComplete}>
              Finish
            </Button>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold">{getTitle()}</h2>
        <p className="text-muted-foreground">{getDescription()}</p>
      </div>
      
      <div className="my-4">
        {renderCurrentStage()}
      </div>
      
      <div className="flex justify-end space-x-2 mt-6">
        {renderNavigationButtons()}
      </div>
    </div>
  );
}
