import { useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import IdeaCard from "@/components/idea-card";
import { Idea, Project, Relationship, Category } from "@shared/schema";
import { PlusCircle, Pen, Link as LinkIcon, ArrowRightCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface WorkspaceProps {
  project: Project;
  ideas: Idea[];
  relationships: Relationship[];
  categories: Category[];
  onCreateIdea: () => void;
  onCreateRelationship: (fromIdeaId: number, toIdeaId: number) => void;
  onUpdateIdeaPosition: (ideaId: number, x: string, y: string) => void;
  onEditIdea?: (idea: Idea) => void;
  onDeleteIdea?: (idea: Idea) => void;
  anonymousMode?: boolean;
}

export default function Workspace({
  project,
  ideas,
  relationships,
  categories,
  onCreateIdea,
  onCreateRelationship,
  onUpdateIdeaPosition,
  onEditIdea,
  onDeleteIdea,
  anonymousMode = false,
}: WorkspaceProps) {
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedIdea, setSelectedIdea] = useState<number | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<number | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isDrawingLine, setIsDrawingLine] = useState(false);

  // Fetch users info for displaying creator names
  const { data: projectUsers } = useQuery({
    queryKey: [`/api/projects/${project.id}/users`],
    queryFn: undefined,
  });

  // Get users map for creator lookup
  const usersMap = new Map();
  if (projectUsers && Array.isArray(projectUsers)) {
    projectUsers.forEach((pu: any) => {
      if (pu && pu.user) {
        usersMap.set(pu.user.id, pu.user);
      }
    });
  }

  // Handle mouse move for drawing relationship lines
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // Start drawing a connection from an idea
  const handleStartConnection = (ideaId: number) => {
    setConnectingFrom(ideaId);
    setIsDrawingLine(true);
    toast({
      title: "Creating connection",
      description: "Click on another idea to establish a relationship",
    });
  };

  // Complete the connection or cancel it
  const handleCanvasClick = (e: React.MouseEvent) => {
    // If we're not connecting, do nothing
    if (!isDrawingLine || connectingFrom === null) return;
    
    // Clicked on the canvas, not an idea - cancel the connection
    setConnectingFrom(null);
    setIsDrawingLine(false);
    toast({
      title: "Connection cancelled",
      description: "Click on an idea card to start a new connection",
    });
  };

  // Handle selecting an idea
  const handleSelectIdea = (ideaId: number) => {
    // If we're drawing a line, this is the destination
    if (isDrawingLine && connectingFrom !== null) {
      // Don't connect to self
      if (connectingFrom === ideaId) {
        toast({
          title: "Cannot connect to self",
          description: "Please select a different idea to connect to",
          variant: "destructive",
        });
        return;
      }
      
      // Check if relationship already exists
      const exists = relationships.some(
        rel => (rel.fromIdeaId === connectingFrom && rel.toIdeaId === ideaId) ||
               (rel.fromIdeaId === ideaId && rel.toIdeaId === connectingFrom)
      );
      
      if (exists) {
        toast({
          title: "Relationship already exists",
          description: "These ideas are already connected",
          variant: "destructive",
        });
      } else {
        // Create the relationship
        onCreateRelationship(connectingFrom, ideaId);
        toast({
          title: "Relationship created",
          description: "Ideas are now connected",
        });
      }
      
      // Reset connection state
      setConnectingFrom(null);
      setIsDrawingLine(false);
    } else {
      // Just select the idea
      setSelectedIdea(selectedIdea === ideaId ? null : ideaId);
    }
  };

  // Efecto para registrar actualizaciones de ideas
  useEffect(() => {
    console.log("Workspace recibió actualización de ideas:", 
      ideas.map(i => `Idea ${i.id}: X:${i.positionX}, Y:${i.positionY}`).join(", "));
  }, [ideas]);

  // Find idea by id (for positioning)
  const findIdeaById = (id: number) => {
    return ideas.find(idea => idea.id === id);
  };
  
  // Calculate the minimum canvas height based on idea positions
  const calculateCanvasHeight = useMemo(() => {
    if (!ideas || ideas.length === 0) return 600; // Default minimum height
    
    // Find the idea with the highest y-position + reasonable card height (140px)
    const maxY = ideas.reduce((max, idea) => {
      const y = parseInt(idea.positionY) || 0;
      return Math.max(max, y + 140); // Adding card height
    }, 0);
    
    // Make sure canvas is at least 600px high, and add padding (100px) at the bottom
    return Math.max(600, maxY + 100);
  }, [ideas]);

  return (
    <main className="flex-1 relative overflow-y-auto bg-gray-100">
      <div className="py-6">
        {/* Workspace Tools */}
        <div className="flex justify-between px-4 sm:px-6 lg:px-8 mb-4">
          <div className="flex space-x-2">
            <Button
              className="bg-primary text-white shadow-sm"
              onClick={onCreateIdea}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              New Idea
            </Button>
          </div>
          
          <div className="flex items-center space-x-3">
            {isDrawingLine && (
              <div className="inline-flex items-center bg-primary/10 rounded-md px-2 py-1 text-xs text-primary animate-pulse">
                <Pen className="h-4 w-4 mr-1" />
                Drawing connection...
              </div>
            )}
          </div>
        </div>
        
        {/* Workspace Canvas */}
        <div 
          className="px-4 sm:px-6 lg:px-8"
          onMouseMove={handleMouseMove}
        >
          <div 
            ref={canvasRef}
            className="bg-white rounded-lg shadow p-6 relative"
            style={{ minHeight: `${calculateCanvasHeight}px` }}
            onClick={handleCanvasClick}
            data-testid="canvas"
          >
            {/* SVG Connector Lines */}
            <svg 
              ref={svgRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              <defs>
                <marker 
                  id="arrowhead" 
                  markerWidth="10" 
                  markerHeight="7" 
                  refX="9" 
                  refY="3.5" 
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#2196F3" />
                </marker>
              </defs>
              
              {/* Existing relationships */}
              {relationships.map(rel => {
                const fromIdea = findIdeaById(rel.fromIdeaId);
                const toIdea = findIdeaById(rel.toIdeaId);
                
                if (!fromIdea || !toIdea) return null;
                
                const x1 = parseInt(fromIdea.positionX) + 120; // middle of card
                const y1 = parseInt(fromIdea.positionY) + 60;
                const x2 = parseInt(toIdea.positionX) + 120;
                const y2 = parseInt(toIdea.positionY) + 60;
                
                return (
                  <g key={rel.id}>
                    {/* Línea de fondo más gruesa para mejorar visibilidad */}
                    <line 
                      className="relationship-line-background"
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#ffffff"
                      strokeWidth="4"
                      opacity="0.6"
                    />
                    {/* Línea principal de la relación */}
                    <line 
                      className="relationship-line"
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#2196F3"
                      strokeWidth="2"
                      strokeDasharray="5,5"
                      markerEnd="url(#arrowhead)"
                    />
                  </g>
                );
              })}
              
              {/* Currently drawing line */}
              {isDrawingLine && connectingFrom !== null && (
                <line
                  className="relationship-line"
                  x1={parseInt(findIdeaById(connectingFrom)?.positionX || "0") + 120}
                  y1={parseInt(findIdeaById(connectingFrom)?.positionY || "0") + 60}
                  x2={mousePosition.x}
                  y2={mousePosition.y}
                  stroke="#FF4081"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                  markerEnd="url(#arrowhead)"
                />
              )}
            </svg>
            
            {/* Idea Cards */}
            {ideas.map(idea => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                creator={usersMap.get(idea.createdBy)}
                isSelected={selectedIdea === idea.id || connectingFrom === idea.id}
                onClick={() => handleSelectIdea(idea.id)}
                onStartConnection={() => handleStartConnection(idea.id)}
                onPositionChange={(x, y) => onUpdateIdeaPosition(idea.id, x, y)}
                categories={categories}
                onEdit={onEditIdea}
                onDelete={onDeleteIdea}
                onContextMenu={true}
                anonymousMode={anonymousMode}
              />
            ))}
            
            {/* Empty state */}
            {ideas.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-center">
                <div className="max-w-md p-6">
                  <ArrowRightCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No ideas yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start by adding ideas to your workspace. You can then connect them to create relationships.
                  </p>
                  <Button onClick={onCreateIdea}>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add First Idea
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
