import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, FileText, Network, Download } from "lucide-react";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import { jsPDF } from "jspdf";
import { removeTransitiveRedundancies, findStronglyConnectedComponents } from "@/lib/matrix-utils";

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
    
    // Remove transitive redundancies for cleaner visualization
    const reducedMatrix = removeTransitiveRedundancies(ssimMatrix);
    
    console.log('Original SSIM Matrix:', ssimMatrix);
    console.log('Reduced SSIM Matrix (without redundancies):', reducedMatrix);
    console.log('Ideas:', ideas.map(idea => idea.title));

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
          color: color,
        },
      };
    });

    // Create edges based on reduced SSIM matrix (without transitive redundancies)
    const edges: any[] = [];
    if (reducedMatrix) {
      for (let i = 0; i < reducedMatrix.length; i++) {
        for (let j = 0; j < reducedMatrix[i].length; j++) {
          if (reducedMatrix[i][j]) {
            edges.push({
              data: {
                id: `edge-${i}-${j}`,
                source: `node-${i}`,
                target: `node-${j}`,
              },
            });
          }
        }
      }
    }

    // Note: Level separators removed due to Cytoscape warnings

    // Initialize Cytoscape
    cyInstance.current = cytoscape({
      container: cyRef.current,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'background-color': 'data(color)',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '70px',
            'font-size': '16px',
            'font-weight': 'bold',
            'color': '#ffffff',
            'text-outline-width': '2px',
            'text-outline-color': '#000000',
            'width': '80px',
            'height': '80px',
            'border-width': '3px',
            'border-color': '#ffffff',
            'shape': 'ellipse',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 3,
            'line-color': '#4f46e5',
            'target-arrow-color': '#4f46e5',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'opacity': 0.8,
          },
        },
        {
          selector: '.highlighted',
          style: {
            'opacity': 1,
            'z-index': 999,
          },
        },
      ],
      layout: {
        name: 'dagre',
        rankDir: 'LR', // Left to Right direction
        spacingFactor: 2,
        rankSep: 150, // Horizontal spacing between levels
        nodeSep: 80,  // Vertical spacing between nodes in same level
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

    // Add level labels after layout is complete
    cyInstance.current.ready(() => {
      setTimeout(() => {
        addLevelLabels();
      }, 100);
    });
  }, [vaxoResults, selectedIdeaObjects]);

  // Function to add level labels to the diagram
  const addLevelLabels = useCallback(() => {
    if (!cyInstance.current || !vaxoResults?.levels) return;

    const container = cyRef.current;
    if (!container) return;

    // Remove existing level labels
    const existingLabels = container.querySelectorAll('.level-label');
    existingLabels.forEach(label => label.remove());

    // Get nodes grouped by level
    const nodesByLevel: { [key: number]: any[] } = {};
    cyInstance.current.nodes().forEach((node) => {
      const level = node.data('level');
      if (!nodesByLevel[level]) nodesByLevel[level] = [];
      nodesByLevel[level].push(node);
    });

    // Add labels for each level
    Object.keys(nodesByLevel).forEach((levelStr) => {
      const level = parseInt(levelStr);
      const nodesInLevel = nodesByLevel[level];
      
      if (nodesInLevel.length > 0) {
        // Get the leftmost position of nodes in this level
        let minX = Infinity;
        let avgY = 0;
        
        nodesInLevel.forEach(node => {
          const pos = node.renderedPosition();
          minX = Math.min(minX, pos.x);
          avgY += pos.y;
        });
        
        avgY /= nodesInLevel.length;

        // Create level label
        const label = document.createElement('div');
        label.className = 'level-label';
        label.style.position = 'absolute';
        label.style.left = (minX - 80) + 'px';
        label.style.top = (avgY - 10) + 'px';
        label.style.fontSize = '14px';
        label.style.fontWeight = 'bold';
        label.style.color = '#374151';
        label.style.backgroundColor = '#f9fafb';
        label.style.padding = '4px 8px';
        label.style.borderRadius = '4px';
        label.style.border = '1px solid #e5e7eb';
        label.style.zIndex = '1000';
        label.textContent = `Level ${level + 1}`;
        
        container.appendChild(label);
      }
    });
  }, [vaxoResults]);

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

  // Export results as PDF with diagram and node information
  const exportResults = async () => {
    if (!vaxoResults) return;

    try {
      toast({
        title: "Generating PDF...",
        description: "Please wait while the report is being generated.",
      });

      const ideas = vaxoResults.selectedIdeas || selectedIdeaObjects;
      const { ssimMatrix, levels } = vaxoResults;
      
      // Detect cycles (SCCs with more than one node)
      const sccs = findStronglyConnectedComponents(ssimMatrix);
      const cycles = sccs.filter(scc => scc.length > 1);
      
      // Create PDF document
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPos = margin;

      // Helper function to check if we need a new page
      const checkNewPage = (height: number) => {
        if (yPos + height > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
          return true;
        }
        return false;
      };

      // Title
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('VAXO Analysis Report', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      // Date
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const dateStr = vaxoResults.processDate 
        ? new Date(vaxoResults.processDate).toLocaleDateString()
        : new Date().toLocaleDateString();
      pdf.text(`Generated: ${dateStr}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      // Summary section
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Summary', margin, yPos);
      yPos += 8;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const totalRelationships = ssimMatrix.flat().filter(Boolean).length;
      pdf.text(`• Total Ideas Analyzed: ${ideas.length}`, margin, yPos);
      yPos += 5;
      pdf.text(`• Total Relationships: ${totalRelationships}`, margin, yPos);
      yPos += 5;
      pdf.text(`• Hierarchy Levels: ${levels?.length || 0}`, margin, yPos);
      yPos += 5;
      pdf.text(`• Cycles Detected: ${cycles.length}`, margin, yPos);
      yPos += 15;

      // Network Diagram Section
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Network Diagram', margin, yPos);
      yPos += 8;

      // Capture diagram as image
      if (cyInstance.current) {
        try {
          const pngData = cyInstance.current.png({ 
            full: true, 
            scale: 2,
            bg: '#fafafa'
          });
          
          // Calculate image dimensions to fit in PDF
          const imgWidth = pageWidth - (margin * 2);
          const imgHeight = 100; // Fixed height for diagram
          
          pdf.addImage(pngData, 'PNG', margin, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 10;
        } catch (imgError) {
          console.error('Error capturing diagram:', imgError);
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'italic');
          pdf.text('(Diagram could not be captured)', margin, yPos);
          yPos += 10;
        }
      }

      // Cycles Section (if any)
      if (cycles.length > 0) {
        checkNewPage(30);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Detected Cycles', margin, yPos);
        yPos += 8;

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        cycles.forEach((cycle, index) => {
          checkNewPage(10);
          const cycleIdeas = cycle.map(idx => ideas[idx]?.title || `Idea ${idx + 1}`).join(' ↔ ');
          pdf.text(`Cycle ${index + 1}: ${cycleIdeas}`, margin, yPos);
          yPos += 5;
        });
        yPos += 10;
      }

      // Hierarchy Levels Section
      checkNewPage(30);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Hierarchy Levels', margin, yPos);
      yPos += 8;

      pdf.setFontSize(10);
      if (levels && levels.length > 0) {
        levels.forEach((level, levelIndex) => {
          checkNewPage(10);
          pdf.setFont('helvetica', 'bold');
          pdf.text(`Level ${levelIndex + 1}:`, margin, yPos);
          pdf.setFont('helvetica', 'normal');
          const levelIdeas = level.map(idx => ideas[idx]?.title || `Idea ${idx + 1}`).join(', ');
          const textLines = pdf.splitTextToSize(levelIdeas, pageWidth - margin * 2 - 25);
          pdf.text(textLines, margin + 25, yPos);
          yPos += (textLines.length * 5) + 3;
        });
      }
      yPos += 10;

      // Detailed Node Information Section
      checkNewPage(30);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Node Details', margin, yPos);
      yPos += 10;

      ideas.forEach((idea, index) => {
        // Find level for this idea
        let nodeLevel = 0;
        if (levels) {
          levels.forEach((level, lIndex) => {
            if (level.includes(index)) {
              nodeLevel = lIndex + 1;
            }
          });
        }

        // Find if this idea is part of a cycle
        const partOfCycle = cycles.find(cycle => cycle.includes(index));
        const cycleInfo = partOfCycle 
          ? `Part of cycle with: ${partOfCycle.filter(i => i !== index).map(i => ideas[i]?.title).join(', ')}`
          : 'Not part of any cycle';

        // Find connections
        const influencesNodes: string[] = [];
        const influencedByNodes: string[] = [];
        
        if (ssimMatrix) {
          for (let j = 0; j < ssimMatrix.length; j++) {
            if (ssimMatrix[index][j] && index !== j) {
              influencesNodes.push(ideas[j]?.title || `Idea ${j + 1}`);
            }
            if (ssimMatrix[j][index] && index !== j) {
              influencedByNodes.push(ideas[j]?.title || `Idea ${j + 1}`);
            }
          }
        }

        // Calculate space needed for this node
        const estimatedHeight = 35 + (idea.description ? 10 : 0) + 
          (influencesNodes.length > 0 ? 10 : 0) + 
          (influencedByNodes.length > 0 ? 10 : 0);
        
        checkNewPage(estimatedHeight);

        // Node title
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${index + 1}. ${idea.title}`, margin, yPos);
        yPos += 6;

        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        
        // Level
        pdf.text(`Level: ${nodeLevel}`, margin + 5, yPos);
        yPos += 4;

        // Description if available
        if (idea.description) {
          const descLines = pdf.splitTextToSize(`Description: ${idea.description}`, pageWidth - margin * 2 - 10);
          pdf.text(descLines, margin + 5, yPos);
          yPos += descLines.length * 4;
        }

        // Cycle information
        pdf.text(`Cycle Status: ${cycleInfo}`, margin + 5, yPos);
        yPos += 4;

        // Influences
        if (influencesNodes.length > 0) {
          const influencesText = `Influences: ${influencesNodes.join(', ')}`;
          const influencesLines = pdf.splitTextToSize(influencesText, pageWidth - margin * 2 - 10);
          pdf.text(influencesLines, margin + 5, yPos);
          yPos += influencesLines.length * 4;
        }

        // Influenced by
        if (influencedByNodes.length > 0) {
          const influencedByText = `Influenced by: ${influencedByNodes.join(', ')}`;
          const influencedByLines = pdf.splitTextToSize(influencedByText, pageWidth - margin * 2 - 10);
          pdf.text(influencedByLines, margin + 5, yPos);
          yPos += influencedByLines.length * 4;
        }

        yPos += 5;
      });

      // Save PDF
      const fileName = `vaxo-report-project-${projectId}-${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

      toast({
        title: "PDF Exported",
        description: "The complete VAXO report has been downloaded.",
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Export Error",
        description: "There was an error generating the PDF. Please try again.",
        variant: "destructive",
      });
    }
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