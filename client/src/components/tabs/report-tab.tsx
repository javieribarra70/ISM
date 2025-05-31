import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, FileText, Network, Download } from "lucide-react";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";

interface ReportTabProps {
  projectId: number;
}

interface Idea {
  id: number;
  title: string;
  description?: string;
  categoryId?: number;
}

interface SelectedIdea {
  id: number;
  projectId: number;
  ideaId: number;
  selectedAt: string;
}

interface VaxoResults {
  ssimMatrix: boolean[][];
  reachabilityMatrix: boolean[][];
  levels: number[][];
  selectedIdeas: Idea[];
  processDate: string;
}

export default function ReportTab({ projectId }: ReportTabProps) {
  const [hasVaxoData, setHasVaxoData] = useState(false);
  const [vaxoResults, setVaxoResults] = useState<VaxoResults | null>(null);
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<cytoscape.Core | null>(null);
  const { toast } = useToast();

  // Fetch all ideas
  const { data: allIdeas = [] } = useQuery<Idea[]>({
    queryKey: [`/api/projects/${projectId}/ideas`],
  });

  // Fetch selected ideas
  const { data: selectedIdeas = [] } = useQuery<SelectedIdea[]>({
    queryKey: [`/api/projects/${projectId}/selected-ideas`],
  });

  // Initialize Cytoscape
  useEffect(() => {
    cytoscape.use(dagre);
  }, []);

  // Get the full idea objects for selected ideas
  const getSelectedIdeaObjects = () => {
    if (!selectedIdeas || !allIdeas) return [];
    
    return selectedIdeas
      .map(si => allIdeas.find(idea => idea.id === si.ideaId))
      .filter(Boolean) as Idea[];
  };

  const selectedIdeaObjects = getSelectedIdeaObjects();

  // Check if there's stored VAXO data in localStorage
  useEffect(() => {
    const checkVaxoData = () => {
      try {
        const storedData = localStorage.getItem(`vaxo-results-${projectId}`);
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          console.log('Loaded VAXO results from localStorage:', parsedData);
          setVaxoResults(parsedData);
          setHasVaxoData(true);
        } else {
          console.log('No VAXO results found in localStorage for project:', projectId);
          setHasVaxoData(false);
        }
      } catch (error) {
        console.error('Error loading VAXO results:', error);
        setHasVaxoData(false);
      }
    };

    checkVaxoData();
    
    // Check for updates every 5 seconds
    const interval = setInterval(checkVaxoData, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  // Initialize network diagram when VAXO results are available
  useEffect(() => {
    if (vaxoResults && cyRef.current && hasVaxoData) {
      initializeNetworkDiagram();
    }
  }, [vaxoResults, hasVaxoData]);

  // Initialize network diagram
  const initializeNetworkDiagram = useCallback(() => {
    if (!cyRef.current || !vaxoResults) return;

    // Destroy existing instance
    if (cyInstance.current) {
      cyInstance.current.destroy();
    }

    const ideas = vaxoResults.selectedIdeas || selectedIdeaObjects;
    const { ssimMatrix, levels } = vaxoResults;

    // Create nodes
    const nodes = ideas.map((idea, index) => {
      // Find which level this idea belongs to
      let levelIndex = 0;
      if (levels) {
        levels.forEach((level, lIndex) => {
          if (level.includes(index)) {
            levelIndex = lIndex;
          }
        });
      }

      // Color based on level
      const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
      const color = colors[levelIndex % colors.length];

      return {
        data: {
          id: `node-${index}`,
          label: idea.title,
          level: levelIndex,
        },
        style: {
          'background-color': color,
          'color': '#ffffff',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '12px',
          'width': '60px',
          'height': '60px',
        },
      };
    });

    // Create edges based on SSIM matrix
    const edges: any[] = [];
    if (ssimMatrix) {
      for (let i = 0; i < ssimMatrix.length; i++) {
        for (let j = 0; j < ssimMatrix[i].length; j++) {
          if (ssimMatrix[i][j]) {
            edges.push({
              data: {
                id: `edge-${i}-${j}`,
                source: `node-${i}`,
                target: `node-${j}`,
              },
              style: {
                'width': 2,
                'line-color': '#666',
                'target-arrow-color': '#666',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
              },
            });
          }
        }
      }
    }

    // Initialize Cytoscape
    cyInstance.current = cytoscape({
      container: cyRef.current,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: 'node',
          style: {
            'text-wrap': 'wrap',
            'text-max-width': '50px',
          },
        },
        {
          selector: 'edge',
          style: {
            opacity: 0.6,
          },
        },
        {
          selector: '.highlighted',
          style: {
            opacity: 1,
            'z-index': 999,
          },
        },
      ],
      layout: {
        name: 'dagre',
        spacingFactor: 1.5,
      } as any,
    });

    // Add click event to highlight connections
    cyInstance.current.on('tap', 'node', (event) => {
      const node = event.target;
      cyInstance.current?.elements().removeClass('highlighted');
      
      const connectedElements = node.neighborhood().add(node);
      connectedElements.addClass('highlighted');
    });

    // Style for highlighted and non-highlighted elements
    cyInstance.current
      .style()
      .selector('.highlighted')
      .style({
        'opacity': 1,
        'z-index': 999,
      })
      .update();
  }, [vaxoResults, selectedIdeaObjects]);

  // Generate SSIM Matrix display
  const renderSSIMMatrix = () => {
    if (!vaxoResults || !vaxoResults.ssimMatrix) return null;

    const matrix = vaxoResults.ssimMatrix;
    const ideas = vaxoResults.selectedIdeas || selectedIdeaObjects;

    return (
      <div className="overflow-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border p-2 bg-gray-50 text-xs"></th>
              {ideas.map((idea, index) => (
                <th key={index} className="border p-2 bg-gray-50 text-xs max-w-20">
                  {idea.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="border p-2 bg-gray-50 font-medium text-xs max-w-20">
                  {ideas[rowIndex]?.title}
                </td>
                {row.map((cell, colIndex) => (
                  <td
                    key={colIndex}
                    className={`border p-2 text-center text-xs ${
                      cell ? 'bg-green-100' : 'bg-gray-50'
                    }`}
                  >
                    {cell ? '1' : '0'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Export results as JSON
  const exportResults = () => {
    if (!vaxoResults) return;

    const dataStr = JSON.stringify(vaxoResults, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vaxo-results-project-${projectId}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Results exported",
      description: "VAXO results have been downloaded as JSON file.",
    });
  };

  if (!hasVaxoData) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No VAXO Results Available</h3>
          <p className="text-gray-600 mb-4">
            Complete the VAXO process in the Connection tab to see analysis results here.
          </p>
          <div className="space-y-2 text-sm text-gray-500">
            <p>Steps to generate results:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Go to the Selector tab and select ideas</li>
              <li>Go to the Connection tab</li>
              <li>Complete the VAXO relationship questions</li>
              <li>Return here to view the analysis</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">VAXO Analysis Report</h2>
          <p className="text-gray-600">
            Results from {selectedIdeaObjects.length} selected ideas
            {vaxoResults?.processDate && ` • Processed on ${new Date(vaxoResults.processDate).toLocaleDateString()}`}
          </p>
        </div>
        <Button onClick={exportResults} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Results
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Selected Ideas</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{selectedIdeaObjects.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Relationships</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vaxoResults?.ssimMatrix 
                ? vaxoResults.ssimMatrix.flat().filter(Boolean).length 
                : 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hierarchy Levels</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vaxoResults?.levels?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Network Diagram */}
      <Card>
        <CardHeader>
          <CardTitle>Network Diagram</CardTitle>
          <CardDescription>
            Interactive visualization of idea relationships and hierarchy levels. Click on nodes to highlight connections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span>Level 1</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span>Level 2</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span>Level 3</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>Level 4+</span>
              </div>
            </div>
          </div>
          <div
            ref={cyRef}
            className="w-full h-96 border border-gray-200 rounded-lg"
            style={{ background: '#fafafa' }}
          />
        </CardContent>
      </Card>

      {/* SSIM Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>SSIM Matrix</CardTitle>
          <CardDescription>
            Structural Self-Interaction Matrix showing direct relationships between ideas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderSSIMMatrix()}
        </CardContent>
      </Card>

      {/* Hierarchy Levels */}
      <Card>
        <CardHeader>
          <CardTitle>Hierarchy Levels</CardTitle>
          <CardDescription>
            Ideas organized by their hierarchical levels in the ISM model
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {vaxoResults?.levels?.map((level, levelIndex) => (
              <div key={levelIndex} className="flex items-center gap-4">
                <Badge variant="outline" className="text-sm">
                  Level {levelIndex + 1}
                </Badge>
                <div className="flex flex-wrap gap-2">
                  {level.map((ideaIndex) => {
                    const idea = vaxoResults.selectedIdeas?.[ideaIndex] || selectedIdeaObjects[ideaIndex];
                    return idea ? (
                      <Badge key={ideaIndex} variant="secondary" className="text-xs">
                        {idea.title}
                      </Badge>
                    ) : null;
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}