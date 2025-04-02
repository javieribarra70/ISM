import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Idea, IdeaVote } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Trash } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface SelectorTabProps {
  projectId: number;
  setActiveTab: (value: string) => void;
}

export default function SelectorTab({ projectId, setActiveTab }: SelectorTabProps) {
  const { user, isLoading: isUserLoading } = useAuth();
  const { toast } = useToast();
  const [selectedIdeas, setSelectedIdeas] = useState<number[]>([]);
  const [votingLimit, setVotingLimit] = useState<number>(0);
  // Estado para las ideas seleccionadas por el administrador para el proceso de conexión
  const [connectionIdeas, setConnectionIdeas] = useState<number[]>([]);

  // Determine if user is admin of this project
  const isUserProjectAdmin = () => {
    if (!user) return false;
    // Fetch project users separately would be better, but for simplicity:
    return user.role === "admin";
  };

  // Fetch project ideas
  const { 
    data: ideas = [], 
    isLoading: isIdeasLoading,
    isError: isIdeasError
  } = useQuery<Idea[]>({
    queryKey: [`/api/projects/${projectId}/ideas`],
    enabled: !!projectId,
  });

  // Fetch user's votes
  const {
    data: userVotes = [],
    isLoading: isUserVotesLoading,
    refetch: refetchUserVotes
  } = useQuery<IdeaVote[]>({
    queryKey: [`/api/projects/${projectId}/user-votes`],
    enabled: !!projectId && !!user,
  });

  // Fetch all project votes (only visible to admins)
  const {
    data: allVotes = [],
    isLoading: isAllVotesLoading,
    refetch: refetchAllVotes,
    isError: isAllVotesError
  } = useQuery<(IdeaVote & { user: {id: number, username: string}})[]>({
    queryKey: [`/api/projects/${projectId}/votes`],
    enabled: !!projectId && !!user && (user.role === "admin" || isUserProjectAdmin()),
  });

  // Fetch voting limit for this project
  const {
    data: limitData,
    isLoading: isLimitLoading
  } = useQuery<{limit: number}>({
    queryKey: [`/api/projects/${projectId}/voting-limit`],
    enabled: !!projectId
  });
  
  // Set voting limit when data is loaded
  useEffect(() => {
    if (limitData && limitData.limit) {
      setVotingLimit(limitData.limit);
    } else {
      // Default voting limit calculation: 1/3 + 1 of total ideas
      const defaultLimit = Math.ceil(ideas.length / 3) + 1;
      setVotingLimit(defaultLimit);
    }
  }, [limitData, ideas.length]);

  // Load existing votes into selected state
  useEffect(() => {
    if (userVotes && userVotes.length > 0) {
      const votedIdeaIds = userVotes.map(vote => vote.ideaId);
      setSelectedIdeas(votedIdeaIds);
    }
  }, [userVotes]);

  // Vote toggle mutation
  const toggleVoteMutation = useMutation({
    mutationFn: async (ideaId: number) => {
      const response = await apiRequest(
        "POST", 
        `/api/ideas/${ideaId}/vote`, 
        {}
      );
      return response.json();
    },
    onSuccess: () => {
      // Refetch votes after toggling
      refetchUserVotes();
      refetchAllVotes();
      
      toast({
        title: "Vote Registered",
        description: "Your vote has been updated successfully."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to register vote: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  // Handle vote toggle
  const handleVoteToggle = (ideaId: number) => {
    // Check if already selected
    const isSelected = selectedIdeas.includes(ideaId);
    
    // If not selected and we've reached the limit, show error
    if (!isSelected && selectedIdeas.length >= votingLimit) {
      toast({
        title: "Voting Limit Reached",
        description: `You can only select up to ${votingLimit} ideas.`,
        variant: "destructive"
      });
      return;
    }
    
    // Call the vote toggle API
    toggleVoteMutation.mutate(ideaId);
  };

  // Count votes for a specific idea
  const getVoteCount = (ideaId: number): number => {
    if (!allVotes) return 0;
    return allVotes.filter(vote => vote.ideaId === ideaId).length;
  };

  // Get list of users who voted for a specific idea
  const getVotersForIdea = (ideaId: number): string[] => {
    if (!allVotes) return [];
    return allVotes
      .filter(vote => vote.ideaId === ideaId)
      .map(vote => vote.user.username);
  };

  // Format the voters list for display
  const formatVoters = (voters: string[]): string => {
    if (voters.length === 0) return "No votes yet";
    return voters.join(", ");
  };
  
  // Fetch project selected ideas for connection process
  const {
    data: selectedIdeaData = [],
    isLoading: isSelectedIdeasLoading,
    refetch: refetchSelectedIdeas
  } = useQuery({
    queryKey: [`/api/projects/${projectId}/selected-ideas`],
    enabled: !!projectId && !!user && (user.role === "admin" || isUserProjectAdmin()),
  });

  // Toggle selected idea mutation
  const toggleSelectedIdeaMutation = useMutation({
    mutationFn: async (ideaId: number) => {
      const response = await apiRequest(
        "POST", 
        `/api/ideas/${ideaId}/select`, 
        { projectId }
      );
      return response.json();
    },
    onSuccess: () => {
      // Refetch selected ideas after toggling
      refetchSelectedIdeas();
      
      toast({
        title: "Selection Updated",
        description: "Your idea selection has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update selection: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  // Function to handle selection/deselection of ideas for the connection process
  const handleConnectionToggle = (ideaId: number) => {
    console.log(`Toggle connection for idea ${ideaId}. Current selected:`, connectionIdeas);
    
    // Call the API to toggle the selected idea
    toggleSelectedIdeaMutation.mutate(ideaId);
    
    // Update local state for immediate UI feedback
    setConnectionIdeas(prevSelected => {
      // If already selected, remove it
      if (prevSelected.includes(ideaId)) {
        console.log(`Removing idea ${ideaId} from selection`);
        return prevSelected.filter(id => id !== ideaId);
      } 
      // If not selected, add it
      else {
        console.log(`Adding idea ${ideaId} to selection`);
        return [...prevSelected, ideaId];
      }
    });
  };
  
  // Load selected ideas from database when data is fetched
  useEffect(() => {
    if (selectedIdeaData && Array.isArray(selectedIdeaData)) {
      const selectedIdeaIds = selectedIdeaData.map(item => item.ideaId);
      console.log("Setting connection ideas from database:", selectedIdeaIds);
      setConnectionIdeas(selectedIdeaIds);
    }
  }, [selectedIdeaData]);

  // Loading state
  if (isIdeasLoading || isUserVotesLoading || isLimitLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-opacity-50 border-t-primary rounded-full"></div>
      </div>
    );
  }

  // Error state
  if (isIdeasError) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load ideas. Please try again later.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Idea Selector</h2>
          <p className="text-muted-foreground">
            Select which ideas are most important. You can vote for up to {votingLimit} ideas.
          </p>
          <p className="text-muted-foreground mt-1">
            Currently selected: {selectedIdeas.length} / {votingLimit}
          </p>
        </div>
        <Button 
          onClick={() => setActiveTab("ideas")}
          variant="outline"
        >
          Return to Ideas
        </Button>
      </div>

      {/* Admin view showing all users' votes */}
      {isUserProjectAdmin() && (
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-2">Vote Summary (Admin View)</h3>
          <div className="flex justify-between items-center">
            <p className="text-muted-foreground mb-4">
              Select the ideas to be used in the connection process, regardless of the number of votes.
            </p>
            <Badge variant="outline" className="mb-4">
              {connectionIdeas.length} ideas selected for connection
            </Badge>
          </div>
          <Separator className="mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ideas.sort((a, b) => getVoteCount(b.id) - getVoteCount(a.id)).map(idea => {
              const isSelectedForConnection = connectionIdeas.includes(idea.id);
              return (
                <Card 
                  key={idea.id} 
                  className={`border-l-4 ${
                    isSelectedForConnection 
                      ? 'border-l-green-500 bg-green-50' 
                      : getVoteCount(idea.id) > 0 
                        ? 'border-l-primary' 
                        : 'border-l-muted'
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{idea.title}</CardTitle>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge variant="outline">{getVoteCount(idea.id)} votes</Badge>
                          {isSelectedForConnection && (
                            <Badge variant="secondary">Selected for connection</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground font-medium">Voters:</p>
                    <p className="text-sm">{formatVoters(getVotersForIdea(idea.id))}</p>
                    
                    <div className="flex items-center space-x-2 mt-4">
                      <Checkbox 
                        id={`connection-checkbox-${idea.id}`}
                        checked={isSelectedForConnection}
                        onCheckedChange={() => handleConnectionToggle(idea.id)}
                      />
                      <Label 
                        htmlFor={`connection-checkbox-${idea.id}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        Select for connection process
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          
          {/* Clear Selection button - now using API to clear selected ideas */}
          <div className="mt-4 flex justify-end">
            <Button 
              variant="outline"
              size="sm"
              onClick={() => {
                // Call API to clear selected ideas
                apiRequest("DELETE", `/api/projects/${projectId}/selected-ideas`, {})
                  .then(() => {
                    // Update local state
                    setConnectionIdeas([]);
                    // Refresh data from server
                    refetchSelectedIdeas();
                    
                    toast({
                      title: "Selection Cleared",
                      description: "All selected ideas have been cleared from the connection process.",
                    });
                  })
                  .catch(error => {
                    toast({
                      title: "Error",
                      description: `Failed to clear selection: ${error.message}`,
                      variant: "destructive"
                    });
                  });
              }}
              disabled={connectionIdeas.length === 0}
            >
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {/* User selection view */}
      <div>
        <h3 className="text-xl font-semibold mb-2">Available Ideas</h3>
        <Separator className="mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ideas.map(idea => {
            const isSelected = selectedIdeas.includes(idea.id);
            return (
              <Card 
                key={idea.id} 
                className={`cursor-pointer transition-colors ${
                  isSelected ? 'ring-2 ring-primary' : 'hover:bg-slate-50'
                }`}
                onClick={() => handleVoteToggle(idea.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{idea.title}</CardTitle>
                  <CardDescription>
                    Category: {idea.category}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {idea.description && (
                    <p className="text-sm mb-2">{idea.description}</p>
                  )}
                </CardContent>
                <CardFooter className="pt-0 flex justify-between">
                  <Button 
                    variant={isSelected ? "default" : "outline"} 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVoteToggle(idea.id);
                    }}
                    disabled={toggleVoteMutation.isPending}
                  >
                    {isSelected ? (
                      <>
                        <Check className="h-4 w-4 mr-2" /> Selected
                      </>
                    ) : (
                      "Select"
                    )}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}