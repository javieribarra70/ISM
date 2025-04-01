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

interface SelectorTabProps {
  projectId: number;
  setActiveTab: (value: string) => void;
}

export default function SelectorTab({ projectId, setActiveTab }: SelectorTabProps) {
  const { user, isLoading: isUserLoading } = useAuth();
  const { toast } = useToast();
  const [selectedIdeas, setSelectedIdeas] = useState<number[]>([]);
  const [votingLimit, setVotingLimit] = useState<number>(0);

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
    enabled: !!projectId,
    onSuccess: (data) => {
      if (data && data.limit) {
        setVotingLimit(data.limit);
      }
    }
  });

  // Determine if user is admin of this project
  const isUserProjectAdmin = () => {
    if (!user) return false;
    // Fetch project users separately would be better, but for simplicity:
    return user.role === "admin";
  };

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
          <Separator className="mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ideas.sort((a, b) => getVoteCount(b.id) - getVoteCount(a.id)).map(idea => (
              <Card key={idea.id} className={`border-l-4 ${getVoteCount(idea.id) > 0 ? 'border-l-primary' : 'border-l-muted'}`}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{idea.title}</CardTitle>
                    <Badge variant="outline">{getVoteCount(idea.id)} votes</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground font-medium">Voters:</p>
                  <p className="text-sm">{formatVoters(getVotersForIdea(idea.id))}</p>
                </CardContent>
              </Card>
            ))}
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