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

// Register the dagre layout and svg extension with Cytoscape
cytoscape.use(dagre);
cytoscape.use(cytoscapeSvg);

interface ISMDiagramProps {
  ideas: Idea[];
  levels: number[][];
  finalReachabilityMatrix: boolean[][];
  projectId?: number; // We add projectId to obtain the categories
}

const ISMDiagram = ({ ideas, levels, finalReachabilityMatrix, projectId }: ISMDiagramProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  // Get the project categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: projectId ? [`/api/projects/${projectId}/categories`] : ['no-categories'],
    enabled: !!projectId,
  });
  
  // Function to get the color of a category
  const getCategoryColor = (categoryName: string | null | undefined) => {
    if (!categoryName) return null;
    
    const category = categories.find(cat => cat.name === categoryName);
    return category?.color || null;
  };
  
  // Function to download the diagram as PDF
  const handleDownloadPDF = () => {
    if (!cyRef.current) return;
    
    setIsDownloading(true);
    
    try {
      // Generate SVG string from Cytoscape graph
      // Use type assertion to access the svg method added by the cytoscapeSvg extension
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
    for (let i = 0; i < ideas.length; i++) {
      for (let j = 0; j < ideas.length; j++) {
        if (i !== j && reducedMatrix[i][j]) {
          const sourceIdea = ideas[i];
          const targetIdea = ideas[j];
          
          const sourceInfo = idToNodeMap.get(sourceIdea.id);
          const targetInfo = idToNodeMap.get(targetIdea.id);
          
          if (sourceInfo && targetInfo) {
            // Verify bidirectional relationship (using the reduced matrix)
            const hasBidirectional = 
              reducedMatrix[i][j] && 
              reducedMatrix[j][i];
            
            // Create a unique identifier for this connection
            const edgeId = `edge-${sourceIdea.id}-${targetIdea.id}`;
            
            // For all relationships, we use unidirectional arrows
            // Even when there is a bidirectional relationship, we create two separate arrows
            elements.push({
              data: {
                id: edgeId,
                source: `node-${sourceIdea.id}`,
                target: `node-${targetIdea.id}`
              },
              group: 'edges'
            });
            
            // If there is a bidirectional relationship (I→J and J→I), also add the arrow in the opposite direction
            if (hasBidirectional && i < j) { // Only add when i < j to avoid duplicates
              elements.push({
                data: {
                  id: `edge-reverse-${targetIdea.id}-${sourceIdea.id}`,
                  source: `node-${targetIdea.id}`,
                  target: `node-${sourceIdea.id}`
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
            'background-color': function(ele) {
              // Blend category color with white at 50%
              const color = ele.data('categoryColor');
              if (!color) return 'white';
              
              // Convert hex color to rgb components and blend with white (255,255,255)
              if (color.startsWith('#')) {
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                
                // Blend with white at 50%
                const blendedR = Math.round((r + 255) / 2);
                const blendedG = Math.round((g + 255) / 2);
                const blendedB = Math.round((b + 255) / 2);
                
                return `rgb(${blendedR}, ${blendedG}, ${blendedB})`;
              }
              // If it's rgba, extract rgb components and blend with white
              else if (color.startsWith('rgba')) {
                const matches = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (matches) {
                  const r = parseInt(matches[1], 10);
                  const g = parseInt(matches[2], 10);
                  const b = parseInt(matches[3], 10);
                  
                  // Blend with white at 50%
                  const blendedR = Math.round((r + 255) / 2);
                  const blendedG = Math.round((g + 255) / 2);
                  const blendedB = Math.round((b + 255) / 2);
                  
                  return `rgb(${blendedR}, ${blendedG}, ${blendedB})`;
                }
              }
              // If it's rgb, extract components and blend with white
              else if (color.startsWith('rgb(')) {
                const matches = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
                if (matches) {
                  const r = parseInt(matches[1], 10);
                  const g = parseInt(matches[2], 10);
                  const b = parseInt(matches[3], 10);
                  
                  // Blend with white at 50%
                  const blendedR = Math.round((r + 255) / 2);
                  const blendedG = Math.round((g + 255) / 2);
                  const blendedB = Math.round((b + 255) / 2);
                  
                  return `rgb(${blendedR}, ${blendedG}, ${blendedB})`;
                }
              }
              
              // For other formats, use a fallback lightened color
              return 'rgb(240, 240, 240)';
            }
          }
        },
        // Style for nodes with levelColor (only if they don't have categoryColor)
        {
          selector: 'node[levelColor]:not([categoryColor])',
          style: {
            'border-color': 'data(levelColor)'
          }
        },
        // Style for additional text (only the title)
        {
          selector: 'node',
          style: {
            'overlay-padding': 8,
            'overlay-opacity': 0,
            'z-index': 10
          }
        },
        // Styles for edges (arrows)
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': '#3b82f6',
            'target-arrow-color': '#3b82f6',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.5
          }
        },

        // Styles for dashed lines
        {
          selector: 'edge[type = "dashed"]',
          style: {
            'line-style': 'dashed',
            'line-dash-pattern': [5, 5]
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
    
  }, [ideas, levels, finalReachabilityMatrix, categories]);
  
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
    <div className="w-full border rounded-md">
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
      <div ref={containerRef} className="w-full h-[570px]" />
    </div>
  );
};

export default ISMDiagram;