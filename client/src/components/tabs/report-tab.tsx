import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, FileText, Network, Download } from "lucide-react";
import { jsPDF } from "jspdf";
import { findStronglyConnectedComponents } from "@/lib/matrix-utils";
import ISMDiagram from "@/components/ism/ism-diagram-fixed";

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
  const { toast } = useToast();

  // Fetch all ideas
  const { data: allIdeas = [] } = useQuery<Idea[]>({
    queryKey: [`/api/projects/${projectId}/ideas`],
  });

  // Fetch selected ideas
  const { data: selectedIdeas = [] } = useQuery<SelectedIdea[]>({
    queryKey: [`/api/projects/${projectId}/selected-ideas`],
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<{ id: number; name: string; description?: string; color?: string }[]>({
    queryKey: [`/api/projects/${projectId}/categories`],
  });

  // Get the full idea objects for selected ideas
  const getSelectedIdeaObjects = () => {
    if (!selectedIdeas || !allIdeas) return [];
    
    return selectedIdeas
      .map(si => allIdeas.find(idea => idea.id === si.ideaId))
      .filter(Boolean) as Idea[];
  };

  const selectedIdeaObjects = getSelectedIdeaObjects();

  // Check if there's stored VAXO data in localStorage (only once on mount)
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
    // Removed periodic refresh to prevent diagram from resetting user changes
  }, [projectId]);

  // Note: Old network diagram code removed - now using ISMDiagram component

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

      // Final ISM Diagram Model Section
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Final ISM Diagram Model', margin, yPos);
      yPos += 8;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(100, 100, 100);
      pdf.text('Note: Use the "Download PDF" button on the diagram to export the high-definition ISM diagram separately.', margin, yPos);
      pdf.setTextColor(0, 0, 0);
      yPos += 15;

      // Cycles Section (if any)
      if (cycles.length > 0) {
        checkNewPage(30);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Detected Cycles', margin, yPos);
        yPos += 10;

        pdf.setFontSize(10);
        cycles.forEach((cycle, index) => {
          checkNewPage(20);
          pdf.setFont('helvetica', 'bold');
          pdf.text(`Cycle ${index + 1}:`, margin, yPos);
          yPos += 5;
          
          pdf.setFont('helvetica', 'normal');
          const cycleIdeas = cycle.map(idx => ideas[idx]?.title || `Idea ${idx + 1}`).join(', ');
          const maxWidth = pageWidth - margin * 2;
          const textLines = pdf.splitTextToSize(cycleIdeas, maxWidth);
          textLines.forEach((line: string) => {
            checkNewPage(6);
            pdf.text(line, margin + 5, yPos);
            yPos += 5;
          });
          yPos += 3;
        });
        yPos += 7;
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

      // SSIM Matrix Section
      checkNewPage(50);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('SSIM Matrix (Structural Self-Interaction Matrix)', margin, yPos);
      yPos += 8;

      if (ssimMatrix && ideas.length > 0) {
        const cellSize = Math.min(12, (pageWidth - margin * 2) / (ideas.length + 1));
        const headerCellWidth = 40;
        const tableWidth = headerCellWidth + (cellSize * ideas.length);
        
        // Check if matrix fits on current page
        const tableHeight = cellSize * (ideas.length + 1);
        if (yPos + tableHeight > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
        }

        pdf.setFontSize(6);
        
        // Header row with idea names (abbreviated)
        pdf.setFont('helvetica', 'bold');
        for (let j = 0; j < ideas.length; j++) {
          const headerText = ideas[j].title.substring(0, 8) + (ideas[j].title.length > 8 ? '...' : '');
          const xPos = margin + headerCellWidth + (j * cellSize);
          pdf.text(headerText, xPos + 1, yPos + 3, { maxWidth: cellSize - 1 });
        }
        yPos += cellSize;

        // Matrix rows
        for (let i = 0; i < ssimMatrix.length; i++) {
          // Row header (idea name)
          pdf.setFont('helvetica', 'bold');
          const rowHeader = ideas[i].title.substring(0, 15) + (ideas[i].title.length > 15 ? '...' : '');
          pdf.text(rowHeader, margin, yPos + 3, { maxWidth: headerCellWidth - 2 });
          
          // Matrix cells
          pdf.setFont('helvetica', 'normal');
          for (let j = 0; j < ssimMatrix[i].length; j++) {
            const xPos = margin + headerCellWidth + (j * cellSize);
            const value = ssimMatrix[i][j] ? '1' : '0';
            
            // Draw cell background
            if (ssimMatrix[i][j]) {
              pdf.setFillColor(187, 247, 208); // Light green for 1
            } else {
              pdf.setFillColor(243, 244, 246); // Light gray for 0
            }
            pdf.rect(xPos, yPos - 3, cellSize, cellSize, 'F');
            pdf.setDrawColor(200, 200, 200);
            pdf.rect(xPos, yPos - 3, cellSize, cellSize, 'S');
            
            // Draw value
            pdf.setTextColor(0, 0, 0);
            pdf.text(value, xPos + cellSize/2, yPos + 1, { align: 'center' });
          }
          yPos += cellSize;
        }
        yPos += 10;
      }

      // Categories Section - support both categoryId (number) and category (string from localStorage)
      const usedCategoryNames = new Set<string>();
      ideas.forEach(idea => {
        // Check both category (string) and categoryId (number)
        if ((idea as any).category) {
          usedCategoryNames.add((idea as any).category);
        } else if (idea.categoryId) {
          const cat = categories.find(c => c.id === idea.categoryId);
          if (cat) usedCategoryNames.add(cat.name);
        }
      });
      
      // Get full category info for used categories
      const usedCategories = categories.filter(c => usedCategoryNames.has(c.name));
      
      if (usedCategories.length > 0 || usedCategoryNames.size > 0) {
        checkNewPage(30);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Categories', margin, yPos);
        yPos += 8;

        pdf.setFontSize(10);
        // If we have category details from DB, show them
        if (usedCategories.length > 0) {
          usedCategories.forEach((cat) => {
            checkNewPage(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`• ${cat.name}`, margin, yPos);
            pdf.setFont('helvetica', 'normal');
            if (cat.description) {
              const descLines = pdf.splitTextToSize(cat.description, pageWidth - margin * 2 - 15);
              pdf.text(descLines, margin + 5, yPos + 5);
              yPos += 5 + (descLines.length * 4);
            } else {
              yPos += 5;
            }
          });
        } else {
          // Fallback: just list category names from ideas
          Array.from(usedCategoryNames).forEach((catName) => {
            checkNewPage(8);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`• ${catName}`, margin, yPos);
            yPos += 5;
          });
        }
        yPos += 10;
      }

      // Detailed Idea Information Section
      checkNewPage(30);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Idea Details', margin, yPos);
      yPos += 10;

      const textMaxWidth = pageWidth - margin * 2 - 10;

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

        // Find category for this idea - support both category (string) and categoryId (number)
        let categoryName = 'No category';
        if ((idea as any).category) {
          categoryName = (idea as any).category;
        } else if (idea.categoryId) {
          const cat = categories.find(c => c.id === idea.categoryId);
          if (cat) categoryName = cat.name;
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

        // Get clarification (may exist on the idea object)
        const ideaClarification = (idea as any).clarification || '';

        // Calculate space needed for this idea (estimate based on content)
        const estimatedHeight = 50 + 
          (idea.description ? 15 : 0) + 
          (ideaClarification ? 15 : 0) +
          (influencesNodes.length > 0 ? 10 : 0) + 
          (influencedByNodes.length > 0 ? 10 : 0);
        
        checkNewPage(estimatedHeight);

        // Idea title with text wrapping for long titles
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        const titleText = `${index + 1}. ${idea.title}`;
        const titleLines = pdf.splitTextToSize(titleText, textMaxWidth);
        pdf.text(titleLines, margin, yPos);
        yPos += titleLines.length * 5 + 2;

        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        
        // Level
        pdf.setFont('helvetica', 'bold');
        pdf.text('Level: ', margin + 5, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${nodeLevel}`, margin + 5 + pdf.getTextWidth('Level: '), yPos);
        yPos += 5;
        
        // Category
        pdf.setFont('helvetica', 'bold');
        pdf.text('Category: ', margin + 5, yPos);
        pdf.setFont('helvetica', 'normal');
        const categoryLines = pdf.splitTextToSize(categoryName, textMaxWidth - 20);
        pdf.text(categoryLines, margin + 5 + pdf.getTextWidth('Category: '), yPos);
        yPos += categoryLines.length * 4 + 1;

        // Description if available
        if (idea.description) {
          pdf.setFont('helvetica', 'bold');
          pdf.text('Description: ', margin + 5, yPos);
          yPos += 4;
          pdf.setFont('helvetica', 'normal');
          const descLines = pdf.splitTextToSize(idea.description, textMaxWidth);
          pdf.text(descLines, margin + 8, yPos);
          yPos += descLines.length * 4 + 1;
        }

        // Clarification if available
        if (ideaClarification) {
          pdf.setFont('helvetica', 'bold');
          pdf.text('Clarification: ', margin + 5, yPos);
          yPos += 4;
          pdf.setFont('helvetica', 'normal');
          const clarLines = pdf.splitTextToSize(ideaClarification, textMaxWidth);
          pdf.text(clarLines, margin + 8, yPos);
          yPos += clarLines.length * 4 + 1;
        }

        // Cycle information
        pdf.setFont('helvetica', 'bold');
        pdf.text('Cycle Status: ', margin + 5, yPos);
        pdf.setFont('helvetica', 'normal');
        const cycleLines = pdf.splitTextToSize(cycleInfo, textMaxWidth - 25);
        pdf.text(cycleLines, margin + 5 + pdf.getTextWidth('Cycle Status: '), yPos);
        yPos += cycleLines.length * 4 + 1;

        // Influences
        if (influencesNodes.length > 0) {
          pdf.setFont('helvetica', 'bold');
          pdf.text('Influences: ', margin + 5, yPos);
          yPos += 4;
          pdf.setFont('helvetica', 'normal');
          const influencesText = influencesNodes.join(', ');
          const influencesLines = pdf.splitTextToSize(influencesText, textMaxWidth);
          pdf.text(influencesLines, margin + 8, yPos);
          yPos += influencesLines.length * 4 + 1;
        }

        // Influenced by
        if (influencedByNodes.length > 0) {
          pdf.setFont('helvetica', 'bold');
          pdf.text('Influenced by: ', margin + 5, yPos);
          yPos += 4;
          pdf.setFont('helvetica', 'normal');
          const influencedByText = influencedByNodes.join(', ');
          const influencedByLines = pdf.splitTextToSize(influencedByText, textMaxWidth);
          pdf.text(influencedByLines, margin + 8, yPos);
          yPos += influencedByLines.length * 4 + 1;
        }

        yPos += 8; // More spacing between ideas
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

      {/* Final ISM Diagram Model */}
      {vaxoResults && vaxoResults.selectedIdeas && vaxoResults.levels && vaxoResults.reachabilityMatrix && (
        <Card>
          <CardHeader>
            <CardTitle>Final ISM Diagram Model</CardTitle>
            <CardDescription>
              Interactive visualization of idea relationships and hierarchy levels.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ISMDiagram
              ideas={vaxoResults.selectedIdeas.map(idea => {
                // Get full idea info from allIdeas to obtain category
                const fullIdea = allIdeas.find(ai => ai.id === idea.id);
                return {
                  id: idea.id,
                  title: idea.title,
                  projectId: projectId,
                  description: idea.description || '',
                  clarification: '',
                  createdAt: new Date(),
                  createdBy: 0,
                  categoryId: idea.categoryId || 0,
                  category: (fullIdea as any)?.category || '',
                  updatedAt: new Date(),
                  positionX: '0',
                  positionY: '0'
                };
              })}
              levels={vaxoResults.levels}
              finalReachabilityMatrix={vaxoResults.reachabilityMatrix}
              projectId={projectId}
            />
          </CardContent>
        </Card>
      )}

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

      {/* Detected Cycles */}
      {(() => {
        const ideas = vaxoResults?.selectedIdeas || selectedIdeaObjects;
        const ssimMatrix = vaxoResults?.ssimMatrix;
        if (!ssimMatrix || ideas.length === 0) return null;
        
        const sccs = findStronglyConnectedComponents(ssimMatrix);
        const cycles = sccs.filter(scc => scc.length > 1);
        
        if (cycles.length === 0) return null;
        
        return (
          <Card>
            <CardHeader>
              <CardTitle>Detected Cycles</CardTitle>
              <CardDescription>
                Strongly connected components with mutual influence relationships
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cycles.map((cycle, cycleIndex) => (
                  <div key={cycleIndex} className="flex items-start gap-4">
                    <Badge variant="destructive" className="text-sm">
                      Cycle {cycleIndex + 1}
                    </Badge>
                    <div className="flex flex-wrap gap-2">
                      {cycle.map((ideaIndex) => {
                        const idea = ideas[ideaIndex];
                        return idea ? (
                          <Badge key={ideaIndex} variant="outline" className="text-xs border-red-300 text-red-700">
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
        );
      })()}
    </div>
  );
}