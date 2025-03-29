import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import Sidebar from "@/components/sidebar";
import Workspace from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Project, Idea, Relationship, ProjectUser } from "@shared/schema";
import { Loader2, Share2, Users, UserPlus } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import NewIdeaModal from "@/components/modals/new-idea-modal";
import InviteUsersModal from "@/components/modals/invite-users-modal";
import { Avatars } from "@/components/avatars";

export default function ProjectPage() {
  const { projectId } = useParams();
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const [isNewIdeaModalOpen, setIsNewIdeaModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [lastPolled, setLastPolled] = useState<Date>(new Date());

  // Validate projectId
  const parsedProjectId = parseInt(projectId || "");
  if (isNaN(parsedProjectId)) {
    navigate("/");
    return null;
  }

  // Fetch project details
  const { data: project, isLoading: isProjectLoading, isError: isProjectError } = useQuery<Project>({
    queryKey: [`/api/projects/${parsedProjectId}`],
    queryFn: undefined,
  });

  // Fetch project ideas
  const { 
    data: ideas, 
    isLoading: isIdeasLoading, 
    isError: isIdeasError,
    refetch: refetchIdeas
  } = useQuery<Idea[]>({
    queryKey: [`/api/projects/${parsedProjectId}/ideas`],
    queryFn: undefined,
    refetchInterval: 5000, // Poll every 5 seconds for updates
  });

  // Fetch project relationships
  const { 
    data: relationships, 
    isLoading: isRelationshipsLoading, 
    isError: isRelationshipsError,
    refetch: refetchRelationships
  } = useQuery<Relationship[]>({
    queryKey: [`/api/projects/${parsedProjectId}/relationships`],
    queryFn: undefined,
    refetchInterval: 5000, // Poll every 5 seconds for updates
  });

  // Fetch project users
  const { 
    data: projectUsers, 
    isLoading: isProjectUsersLoading,
    refetch: refetchProjectUsers
  } = useQuery<(ProjectUser & { user: {id: number, username: string, email: string}})[]>({
    queryKey: [`/api/projects/${parsedProjectId}/users`],
    queryFn: undefined,
    refetchInterval: 10000, // Poll every 10 seconds
  });

  // Update the lastPolled time after a successful poll
  useEffect(() => {
    if (ideas && relationships) {
      setLastPolled(new Date());
    }
  }, [ideas, relationships]);

  // Create a new idea
  const createIdeaMutation = useMutation({
    mutationFn: async (newIdea: Omit<Idea, "id" | "createdAt" | "updatedAt" | "createdBy">) => {
      const response = await fetch(`/api/projects/${parsedProjectId}/ideas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newIdea),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create idea");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${parsedProjectId}/ideas`] });
      setIsNewIdeaModalOpen(false);
    },
  });

  // Create a relationship
  const createRelationshipMutation = useMutation({
    mutationFn: async ({ fromIdeaId, toIdeaId }: { fromIdeaId: number; toIdeaId: number }) => {
      const response = await fetch(`/api/projects/${parsedProjectId}/relationships`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fromIdeaId, toIdeaId }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create relationship");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${parsedProjectId}/relationships`] });
    },
  });

  // Update idea position
  const updateIdeaPositionMutation = useMutation({
    mutationFn: async ({ ideaId, positionX, positionY }: { ideaId: number; positionX: string; positionY: string }) => {
      const response = await fetch(`/api/ideas/${ideaId}/position`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ positionX, positionY }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update idea position");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${parsedProjectId}/ideas`] });
    },
  });

  // Handle loading state
  if (isProjectLoading || isIdeasLoading || isRelationshipsLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex justify-center items-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">Loading project workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  // Handle error state
  if (isProjectError || isIdeasError || isRelationshipsError || !project) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 p-8 flex justify-center items-center">
          <div className="text-center">
            <h2 className="text-xl font-bold text-error mb-2">Failed to load project</h2>
            <p className="text-muted-foreground mb-4">The project may not exist or you don't have access.</p>
            <Button onClick={() => navigate("/")}>Return to Dashboard</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        {/* Top navbar */}
        <div className="bg-white shadow-sm z-10">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold text-text">{project.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Last updated: {lastPolled.toLocaleTimeString()}
              </p>
            </div>
            
            <div className="flex space-x-3">
              {/* Collaborators */}
              <div className="flex items-center">
                <Avatars users={projectUsers?.map(pu => pu.user) || []} />
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="ml-2"
                  onClick={() => setIsInviteModalOpen(true)}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite
                </Button>
              </div>
              
              {/* Share button */}
              <Button size="sm" className="bg-primary text-white">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        </div>
        
        {/* Main workspace content */}
        <Workspace
          project={project}
          ideas={ideas || []}
          relationships={relationships || []}
          onCreateIdea={() => setIsNewIdeaModalOpen(true)}
          onCreateRelationship={(fromId, toId) => 
            createRelationshipMutation.mutate({ fromIdeaId: fromId, toIdeaId: toId })
          }
          onUpdateIdeaPosition={(ideaId, x, y) => 
            updateIdeaPositionMutation.mutate({ ideaId, positionX: x, positionY: y })
          }
        />
      </div>

      {/* Modals */}
      <NewIdeaModal 
        isOpen={isNewIdeaModalOpen}
        onClose={() => setIsNewIdeaModalOpen(false)}
        onCreateIdea={(ideaData) => createIdeaMutation.mutate({
          ...ideaData,
          projectId: parsedProjectId,
        })}
        isCreating={createIdeaMutation.isPending}
      />

      <InviteUsersModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        projectId={parsedProjectId}
        onInviteSent={() => {
          refetchProjectUsers();
          setIsInviteModalOpen(false);
        }}
      />
    </div>
  );
}
