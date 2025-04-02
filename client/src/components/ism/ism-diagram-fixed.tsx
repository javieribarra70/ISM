import { useState, useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import cytoscapeSvg from 'cytoscape-svg';
import { jsPDF } from 'jspdf';
import { Idea, Category } from '@shared/schema';
import { computeTransitiveReduction } from './matrix-reduction';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../ui/button';
import { Download, RefreshCw } from 'lucide-react';

// Register the extensions
cytoscape.use(dagre);

// Only register cytoscapeSvg once
if (!('svg' in cytoscape.prototype)) {
  cytoscape.use(cytoscapeSvg);
}

// Interface for ISM Diagram props
interface ISMDiagramProps {
  ideas: Idea[];
  levels: number[][];
  finalReachabilityMatrix: boolean[][];
  projectId?: number; // We add projectId to obtain the categories
  projectInfo?: {
    name: string;
    description: string;
    createdAt: string;
  };
}

const ISMDiagram = ({ ideas, levels, finalReachabilityMatrix, projectId, projectInfo }: ISMDiagramProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  // Get the project categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: projectId ? [`/api/projects/${projectId}/categories`] : ['no-categories'],
    enabled: !!projectId,
  });
  
  // Create a state for visible categories
  const [visibleCategories, setVisibleCategories] = useState<Category[]>([]);
  
  // Function to get the color of a category
  const getCategoryColor = (categoryName: string | null | undefined) => {
    if (!categoryName) return null;
    
    const category = categories.find(cat => cat.name === categoryName);
    return category?.color || null;
  };
  
  // Update visibleCategories state based on ideas and categories
  useEffect(() => {
    if (!ideas.length || !categories.length) return;
    
    // Collect all categories used in ideas
    const usedCategoryNames = new Set<string>();
    ideas.forEach(idea => {
      if (idea.category) {
        usedCategoryNames.add(idea.category);
      }
    });
    
    // Filter categories that are used in the diagram
    const visibleCats = categories.filter(cat => usedCategoryNames.has(cat.name));
    setVisibleCategories(visibleCats);
  }, [ideas, categories]);
  
  // Function to download the diagram as PDF
  const handleDownloadPDF = () => {
    if (!cyRef.current) return;
    
    setIsDownloading(true);
    
    try {
      // Generate the SVG string from Cytoscape graph
      const svg = (cyRef.current as any).svg({ scale: 2, full: true, bg: 'white' });
      
      // Create a new jsPDF instance
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
      });
      
      // Create a temporary image element to convert SVG to Canvas
      const img = new Image();
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      
      img.onload = () => {
        // Create a canvas and draw the image
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          
          // Convert canvas to image data URL
          const imgData = canvas.toDataURL('image/png');
          
          // Calculate dimensions to fit in PDF
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const imgAspectRatio = img.width / img.height;
          
          let imgWidth = pdfWidth - 20; // margins
          let imgHeight = imgWidth / imgAspectRatio;
          
          // Ensure the image fits in the page
          if (imgHeight > pdfHeight - 20) {
            imgHeight = pdfHeight - 20;
            imgWidth = imgHeight * imgAspectRatio;
          }
          
          // Add the image to the PDF
          pdf.addImage(
            imgData, 
            'PNG', 
            (pdfWidth - imgWidth) / 2, // center horizontally
            (pdfHeight - imgHeight) / 2, // center vertically
            imgWidth, 
            imgHeight
          );
          
          // Draw the legends directly on the PDF
          const margin = 10;
          const legendWidth = 50;
          const titleHeight = 5;
          const itemHeight = 5;
          
          // 1. Project Info Legend (Left Side)
          if (projectInfo) {
            const projectLegendX = margin;
            const projectLegendY = margin;
            const projectLegendWidth = 60;
            
            // Calculate project legend height
            let projectItemsCount = 2; // Name and Created always shown
            if (projectInfo.description) projectItemsCount++;
            const projectTotalHeight = titleHeight + (projectItemsCount * itemHeight);
            
            // Draw project info background
            pdf.setFillColor(255, 255, 255); // white
            pdf.setDrawColor(226, 232, 240); // light gray border
            pdf.roundedRect(projectLegendX, projectLegendY, projectLegendWidth, projectTotalHeight, 1, 1, 'FD');
            
            // Project info title
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(75, 85, 99); // gray
            pdf.text('Project Information', projectLegendX + 4, projectLegendY + 4);
            
            // Project info content
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7);
            pdf.text('Name:', projectLegendX + 4, projectLegendY + titleHeight + 2);
            
            pdf.setFont('helvetica', 'normal');
            pdf.text(projectInfo.name, projectLegendX + 15, projectLegendY + titleHeight + 2);
            
            let currentY = projectLegendY + titleHeight + itemHeight;
            
            if (projectInfo.description) {
              pdf.setFont('helvetica', 'bold');
              pdf.text('Description:', projectLegendX + 4, currentY + 2);
              
              pdf.setFont('helvetica', 'normal');
              // Truncate description if too long
              const desc = projectInfo.description.length > 30 
                ? projectInfo.description.substring(0, 30) + '...' 
                : projectInfo.description;
              pdf.text(desc, projectLegendX + 15, currentY + 2);
              
              currentY += itemHeight;
            }
            
            pdf.setFont('helvetica', 'bold');
            pdf.text('Created:', projectLegendX + 4, currentY + 2);
            
            pdf.setFont('helvetica', 'normal');
            const date = new Date(projectInfo.createdAt).toLocaleDateString();
            pdf.text(date, projectLegendX + 15, currentY + 2);
          }
          
          // 2. Categories Legend (Right Side)
          const categoriesLegendX = pdfWidth - legendWidth - margin;
          const categoriesLegendY = margin;
          
          // Filter the categories that are used
          const usedCategoryNames = new Set<string>();
          ideas.forEach(idea => {
            if (idea.category) {
              usedCategoryNames.add(idea.category);
            }
          });
          
          // Filter only the categories used in the diagram
          const pdfVisibleCategories = categories.filter(cat => usedCategoryNames.has(cat.name));
          
          // Set background for categories legend
          pdf.setFillColor(255, 255, 255); // white
          pdf.setDrawColor(226, 232, 240); // light gray border
          const categoriesHeight = titleHeight + (pdfVisibleCategories.length > 0 ? pdfVisibleCategories.length * itemHeight : itemHeight);
          pdf.roundedRect(categoriesLegendX, categoriesLegendY, legendWidth, categoriesHeight, 1, 1, 'FD');
          
          // Add categories title
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(75, 85, 99); // gray
          pdf.text('Categories', categoriesLegendX + 4, categoriesLegendY + 4);
          
          // Add category items
          if (pdfVisibleCategories.length > 0) {
            pdfVisibleCategories.forEach((category, index) => {
              const itemY = categoriesLegendY + titleHeight + (index * itemHeight);
              
              // Draw colored square
              const color = category.color || '#cbd5e1';
              const r = parseInt(color.slice(1, 3), 16);
              const g = parseInt(color.slice(3, 5), 16);
              const b = parseInt(color.slice(5, 7), 16);
              pdf.setFillColor(r, g, b);
              pdf.rect(categoriesLegendX + 4, itemY + 1, 3, 3, 'F');
              
              // Draw category name
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(7);
              pdf.setTextColor(75, 85, 99); // #4b5563
              pdf.text(category.name, categoriesLegendX + 10, itemY + 3);
            });
          } else {
            // If no categories, show a message
            const itemY = categoriesLegendY + titleHeight;
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(7);
            pdf.setTextColor(75, 85, 99); // #4b5563
            pdf.text('No categories found', categoriesLegendX + 4, itemY + 3);
          }
          
          // Save the PDF
          pdf.save('ism-diagram.pdf');
          
          // Clean up
          URL.revokeObjectURL(url);
          setIsDownloading(false);
        }
      };
      
      img.src = url;
    } catch (error) {
      console.error('Error generating PDF:', error);
      setIsDownloading(false);
    }
  };
  
  // Function to reset the diagram to its original layout
  const handleResetLayout = () => {
    if (!cyRef.current) return;
    
    setIsResetting(true);
    
    // Apply the original layout
    cyRef.current.layout({ 
      name: 'dagre',
      rankDir: 'TB',
      rankSep: 120,
      nodeSep: 80,
      padding: 40,
      animate: true,
      animationDuration: 500,
    } as any).run();
    
    // Fit and center the diagram
    setTimeout(() => {
      if (cyRef.current) {
        cyRef.current.fit();
        cyRef.current.center();
      }
      setIsResetting(false);
    }, 600);
  };
  
  useEffect(() => {
    // Clean up when component unmounts
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, []);
  
  useEffect(() => {
    if (!containerRef.current || !ideas.length || !levels.length || !finalReachabilityMatrix.length) {
      return;
    }
    
    // Apply transitive reduction to eliminate redundant relationships
    const reducedMatrix = computeTransitiveReduction(finalReachabilityMatrix);
    console.log('Original Matrix:', finalReachabilityMatrix);
    console.log('Reduced Matrix:', reducedMatrix);
    
    // Create elements for the graph
    const elements: cytoscape.ElementDefinition[] = [];
    const idToNodeMap = new Map<number, { idea: Idea, level: number, index: number }>();
    
    // Node color based on influence level
    const getLevelColor = (level: number) => {
      // Color scale: from most influential (intense blue) to least influential
      const maxLevel = levels.length;
      const intensity = Math.max(0, 100 - Math.floor((level / maxLevel) * 80));
      return `rgba(59, 130, 246, ${intensity}%)`;
    };
    
    // Create nodes
    levels.forEach((levelIdxs, levelNum) => {
      levelIdxs.forEach((ideaIdx, indexInLevel) => {
        const idea = ideas[ideaIdx];
        const influenceLevel = levels.length - levelNum;
        const categoryColor = getCategoryColor(idea.category);
        
        // If the idea has a category with color, we use that color; otherwise, we use the level-based color
        elements.push({
          data: {
            id: `node-${idea.id}`,
            label: idea.title,
            influenceLevel: influenceLevel,
            levelColor: getLevelColor(levelNum),
            categoryColor: categoryColor,
            category: idea.category
          },
          position: {
            // Positions will be automatically assigned by the layout
            x: 0,
            y: 0
          },
          group: 'nodes'
        });
        
        idToNodeMap.set(idea.id, { idea, level: levelNum, index: indexInLevel });
      });
    });
    
    // Create direct connections based on the reduced reachability matrix
    // Use a Set to track which bidirectional connections we've already processed
    const processedBidirectionalPairs = new Set<string>();
    
    for (let i = 0; i < ideas.length; i++) {
      for (let j = 0; j < ideas.length; j++) {
        if (i !== j && reducedMatrix[i][j]) {
          const sourceIdea = ideas[i];
          const targetIdea = ideas[j];
          
          const sourceInfo = idToNodeMap.get(sourceIdea.id);
          const targetInfo = idToNodeMap.get(targetIdea.id);
          
          if (sourceInfo && targetInfo) {
            // Verify if there's a bidirectional relationship (using the reduced matrix)
            const hasBidirectional = 
              reducedMatrix[i][j] && 
              reducedMatrix[j][i];
            
            // For bidirectional relationships, only process each pair once
            if (hasBidirectional) {
              // Create a unique key for this bidirectional pair (using smaller id first to ensure consistency)
              const pairKey = sourceIdea.id < targetIdea.id 
                ? `${sourceIdea.id}-${targetIdea.id}` 
                : `${targetIdea.id}-${sourceIdea.id}`;
              
              // Skip if we've already processed this bidirectional pair
              if (processedBidirectionalPairs.has(pairKey)) {
                continue;
              }
              
              // Mark this pair as processed
              processedBidirectionalPairs.add(pairKey);
              
              // Add both directions for this bidirectional relationship
              elements.push({
                data: {
                  id: `edge-${sourceIdea.id}-${targetIdea.id}`,
                  source: `node-${sourceIdea.id}`,
                  target: `node-${targetIdea.id}`
                },
                group: 'edges'
              });
              
              elements.push({
                data: {
                  id: `edge-${targetIdea.id}-${sourceIdea.id}`,
                  source: `node-${targetIdea.id}`,
                  target: `node-${sourceIdea.id}`
                },
                group: 'edges'
              });
            } 
            // For unidirectional relationships, just add the single arrow
            else {
              // Create a unique identifier for this connection
              const edgeId = `edge-${sourceIdea.id}-${targetIdea.id}`;
              
              elements.push({
                data: {
                  id: edgeId,
                  source: `node-${sourceIdea.id}`,
                  target: `node-${targetIdea.id}`
                },
                group: 'edges'
              });
            }
          }
        }
      }
    }
    
    // Add arrows for solitary nodes
    if (levels.length > 1) {
      // For each level, except the last one
      for (let levelNum = 0; levelNum < levels.length - 1; levelNum++) {
        const currentLevelNodes = levels[levelNum];
        const nextLevelNodes = levels[levelNum + 1];
        
        // If both levels have nodes
        if (currentLevelNodes.length > 0 && nextLevelNodes.length > 0) {
          // For each node in the current level
          currentLevelNodes.forEach(currIdx => {
            const currIdea = ideas[currIdx];
            const hasExistingConnection = elements.some(
              ele => ele.group === 'edges' && 
              (ele.data.source === `node-${currIdea.id}` || ele.data.target === `node-${currIdea.id}`)
            );
            
            // If the node has no existing connections, add an arrow to the next level
            if (!hasExistingConnection) {
              // Choose the first node from the next level to create a default relationship
              const nextIdea = ideas[nextLevelNodes[0]];
              
              elements.push({
                data: {
                  id: `edge-default-${currIdea.id}-${nextIdea.id}`,
                  source: `node-${currIdea.id}`,
                  target: `node-${nextIdea.id}`,
                  type: 'dashed'
                },
                group: 'edges'
              });
            }
          });
          
          // For each node in the next level
          nextLevelNodes.forEach(nextIdx => {
            const nextIdea = ideas[nextIdx];
            const hasExistingConnection = elements.some(
              ele => ele.group === 'edges' && 
              (ele.data.source === `node-${nextIdea.id}` || ele.data.target === `node-${nextIdea.id}`)
            );
            
            // If the node has no existing connections, add an arrow from the previous level
            if (!hasExistingConnection) {
              // Choose the first node from the current level to create a default relationship
              const currIdea = ideas[currentLevelNodes[0]];
              
              elements.push({
                data: {
                  id: `edge-default-${currIdea.id}-${nextIdea.id}`,
                  source: `node-${currIdea.id}`,
                  target: `node-${nextIdea.id}`,
                  type: 'dashed'
                },
                group: 'edges'
              });
            }
          });
        }
      }
    }
    
    // Initialize Cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      style: [
        // Styles for nodes
        {
          selector: 'node',
          style: {
            'background-color': 'white',
            'border-width': '2px',
            'width': '200px',
            'height': '80px',
            'shape': 'rectangle',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '180px',
            'content': 'data(label)',
            'font-size': '12px',
            'font-weight': 'bold',
            'text-outline-width': 1,
            'text-outline-color': '#fff',
            'text-outline-opacity': 1
          }
        },
        // Style for nodes with categoryColor (priority over levelColor)
        {
          selector: 'node[categoryColor]',
          style: {
            'border-color': 'data(categoryColor)',
            // Use semi-transparent color for fills (mix category color with white at 50%)
            'background-color': (ele) => {
              const categoryColor = ele.data('categoryColor');
              if (!categoryColor) return 'white';
              
              // Convert HEX to RGB
              const r = parseInt(categoryColor.slice(1, 3), 16);
              const g = parseInt(categoryColor.slice(3, 5), 16);
              const b = parseInt(categoryColor.slice(5, 7), 16);
              
              // Mix with white (255,255,255) at 50% opacity
              const mixedR = Math.round(r * 0.5 + 255 * 0.5);
              const mixedG = Math.round(g * 0.5 + 255 * 0.5);
              const mixedB = Math.round(b * 0.5 + 255 * 0.5);
              
              return `rgb(${mixedR}, ${mixedG}, ${mixedB})`;
            }
          }
        },
        // Style for nodes without categoryColor (fallback to levelColor)
        {
          selector: 'node:not([categoryColor])',
          style: {
            'border-color': 'data(levelColor)'
          }
        },
        // Style for edges (arrows)
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#64748b', // slate-500
            'target-arrow-color': '#64748b',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.5
          }
        },
        // Style for dashed edges
        {
          selector: 'edge[type="dashed"]',
          style: {
            'line-style': 'dashed',
            'line-dash-pattern': [6, 3],
            'opacity': 0.7
          }
        }
      ],
      layout: {
        name: 'dagre',
        rankDir: 'TB', // Top to Bottom
        rankSep: 120,  // Vertical spacing
        nodeSep: 80,   // Horizontal spacing
        padding: 40
      } as any, // The 'any' type is necessary because dagre is not included in Cytoscape types
      userZoomingEnabled: true,
      userPanningEnabled: true,
      autoungrabify: false, // Allow moving nodes
      wheelSensitivity: 0.2 // Reduce zoom sensitivity
    });
    
    // Add handler to adjust size after rendering
    cy.on('layoutstop', () => {
      cy.fit();
      cy.center();
    });
    
    // Save the reference
    cyRef.current = cy;
    
    // Apply the layout
    cy.layout({ 
      name: 'dagre',
      rankDir: 'TB',
      rankSep: 120,
      nodeSep: 80,
      padding: 40
    } as any).run();
    
  }, [ideas, levels, finalReachabilityMatrix, categories, getCategoryColor]);
  
  if (!ideas.length || !levels.length || !finalReachabilityMatrix.length) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-slate-50 rounded-md">
        <p className="text-sm text-muted-foreground">
          Not enough data to generate the diagram.
        </p>
      </div>
    );
  }
  
  return (
    <div className="w-full border rounded-md relative">
      {/* Controls bar */}
      <div className="p-2 bg-slate-50 border-b flex justify-end gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleResetLayout}
          disabled={isResetting}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isResetting ? 'animate-spin' : ''}`} />
          Reset
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleDownloadPDF}
          disabled={isDownloading}
        >
          <Download className="h-4 w-4 mr-2" />
          {isDownloading ? 'Downloading...' : 'Download PDF'}
        </Button>
      </div>
      
      {/* Diagram container */}
      <div className="relative">
        {/* Cytoscape container */}
        <div ref={containerRef} className="w-full h-[570px]" />
        
        {/* Project Info Legend */}
        {projectInfo && (
          <div 
            className="absolute top-4 left-4 bg-white border border-slate-200 rounded-md p-3 shadow-sm"
            style={{ maxWidth: '300px', zIndex: 10 }}
          >
            <div className="text-sm font-semibold text-gray-600 mb-2">Project Information</div>
            <div className="flex flex-col gap-1">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-600">Name:</span>
                <span className="text-xs text-gray-600">{projectInfo.name}</span>
              </div>
              {projectInfo.description && (
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-600">Description:</span>
                  <span className="text-xs text-gray-600 line-clamp-2">{projectInfo.description}</span>
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-600">Created:</span>
                <span className="text-xs text-gray-600">
                  {new Date(projectInfo.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Categories legend */}
        {visibleCategories.length > 0 && (
          <div 
            className="absolute top-4 right-4 bg-white border border-slate-200 rounded-md p-3 shadow-sm"
            style={{ minWidth: '180px', zIndex: 10 }}
          >
            <div className="text-sm font-semibold text-gray-600 mb-2">Categories</div>
            <div className="flex flex-col gap-2">
              {visibleCategories.map((category) => (
                <div key={category.id} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: category.color || '#cbd5e1' }}
                  />
                  <span className="text-xs text-gray-600 truncate max-w-[140px]">
                    {category.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ISMDiagram;