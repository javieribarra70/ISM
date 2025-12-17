import { useState, useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import cytoscapeSvg from 'cytoscape-svg';
import { jsPDF } from 'jspdf';
import { Idea, Category } from '@shared/schema';
import { computeTransitiveReduction } from '@/lib/matrix-utils';
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
  
  // States for legend positions (make them draggable)
  const [projectInfoPosition, setProjectInfoPosition] = useState({ x: 4, y: 4 });
  // We use a union type for x, it can be 'right' (anchored to right) or a number (absolute position)
  const [categoriesPosition, setCategoriesPosition] = useState<{ x: 'right' | number, y: number }>({ x: 'right', y: 4 });
  
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
          
          // Ensure the image fits in the page, leaving space for title
          if (imgHeight > pdfHeight - 30) { // Extra space for title
            imgHeight = pdfHeight - 30;
            imgWidth = imgHeight * imgAspectRatio;
          }
          
          // Add a title "Final ISM Diagram Model" at the top center
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(16);
          pdf.setTextColor(0, 0, 0); // Black
          pdf.text('Final ISM Diagram Model', pdfWidth / 2, 15, { align: 'center' });
          
          // Add the image to the PDF
          pdf.addImage(
            imgData, 
            'PNG', 
            (pdfWidth - imgWidth) / 2, // center horizontally
            (pdfHeight - imgHeight) / 2 + 5, // center vertically, move down a bit for title
            imgWidth, 
            imgHeight
          );
          
          // Draw the legends directly on the PDF
          const margin = 10;
          const titleHeight = 5;
          const itemHeight = 5;
          
          // 1. Project Info Legend - Use the current position from UI
          if (projectInfo) {
            // Calculate relative position for PDF based on current UI position
            // First convert from pixels to PDF units (mm)
            // Assuming 72 DPI conversion (approximate)
            const pxToMm = 0.352778; // Conversion factor from pixels to mm
            
            // Calculate the relative position in PDF coordinates
            // projectInfoPosition is in screen pixels
            const projectLegendX = Math.max(margin, projectInfoPosition.x * pxToMm);
            const projectLegendY = Math.max(margin, projectInfoPosition.y * pxToMm);
            const projectLegendWidth = 100; // Adjusted width to fit text without excesive space
            
            // Calculate project legend height
            let projectItemsCount = 2; // Name and Created always shown
            if (projectInfo.description) projectItemsCount++;
            const projectTotalHeight = titleHeight + (projectItemsCount * 2 * itemHeight); // Double the height for line breaks
            
            // Draw project info background
            pdf.setFillColor(255, 255, 255); // white
            pdf.setDrawColor(226, 232, 240); // light gray border
            pdf.roundedRect(projectLegendX, projectLegendY, projectLegendWidth, projectTotalHeight, 1, 1, 'FD');
            
            // Project info title
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(75, 85, 99); // gray
            pdf.text('Project Information', projectLegendX + 4, projectLegendY + 4);
            
            // Current Y position tracker
            let currentY = projectLegendY + titleHeight + 2;
            
            // Name field
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7);
            pdf.text('Name:', projectLegendX + 4, currentY);
            currentY += itemHeight;
            
            pdf.setFont('helvetica', 'normal');
            pdf.text(projectInfo.name, projectLegendX + 8, currentY);
            currentY += itemHeight + 1;
            
            // Description field (if exists)
            if (projectInfo.description) {
              pdf.setFont('helvetica', 'bold');
              pdf.text('Description:', projectLegendX + 4, currentY);
              currentY += itemHeight;
              
              pdf.setFont('helvetica', 'normal');
              // Use full description with text wrapping for long descriptions
              const desc = projectInfo.description;
              const splitDesc = pdf.splitTextToSize(desc, projectLegendWidth - 20); // Increased margin for text
              pdf.text(splitDesc, projectLegendX + 8, currentY);
              
              // Adjust currentY based on number of lines in the description
              currentY += (splitDesc.length - 1) * 4;
              currentY += itemHeight + 1;
            }
            
            // Created field
            pdf.setFont('helvetica', 'bold');
            pdf.text('Created:', projectLegendX + 4, currentY);
            currentY += itemHeight;
            
            pdf.setFont('helvetica', 'normal');
            const date = new Date(projectInfo.createdAt).toLocaleDateString();
            pdf.text(date, projectLegendX + 8, currentY);
          }
          
          // 2. Categories Legend - Use position from UI
          const categoriesLegendWidth = 60; // Optimal width for category names
          
          // Calculate position based on UI position (convert from pixels to PDF units)
          const pxToMm = 0.352778; // Conversion factor from pixels to mm
          
          // Determine X position based on categoriesPosition
          let categoriesLegendX: number;
          if (categoriesPosition.x === 'right') {
            // If anchored to right side
            categoriesLegendX = pdfWidth - categoriesLegendWidth - margin;
          } else {
            // If absolute position
            categoriesLegendX = Math.max(margin, categoriesPosition.x * pxToMm);
          }
          
          // Y position is always a number
          const categoriesLegendY = Math.max(margin, categoriesPosition.y * pxToMm);
          
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
          
          // Calculate dynamic height to account for potentially multi-line category names
          let categoryItemsHeight = 0;
          if (pdfVisibleCategories.length > 0) {
            pdfVisibleCategories.forEach(category => {
              const splitName = pdf.splitTextToSize(category.name, categoriesLegendWidth - 16);
              categoryItemsHeight += Math.max(itemHeight, (splitName.length * 4));
            });
          } else {
            categoryItemsHeight = itemHeight;
          }
          
          const categoriesHeight = titleHeight + categoryItemsHeight + 2;
          pdf.roundedRect(categoriesLegendX, categoriesLegendY, categoriesLegendWidth, categoriesHeight, 1, 1, 'FD');
          
          // Add categories title
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(75, 85, 99); // gray
          pdf.text('Categories', categoriesLegendX + 4, categoriesLegendY + 4);
          
          // Add category items
          if (pdfVisibleCategories.length > 0) {
            // Track the current vertical position
            let currentItemY = categoriesLegendY + titleHeight + 2;
            
            pdfVisibleCategories.forEach((category) => {
              // Draw colored square
              const color = category.color || '#cbd5e1';
              const r = parseInt(color.slice(1, 3), 16);
              const g = parseInt(color.slice(3, 5), 16);
              const b = parseInt(color.slice(5, 7), 16);
              pdf.setFillColor(r, g, b);
              pdf.rect(categoriesLegendX + 4, currentItemY + 1, 3, 3, 'F');
              
              // Draw category name with text wrapping for long names
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(7);
              pdf.setTextColor(75, 85, 99); // #4b5563
              const splitName = pdf.splitTextToSize(category.name, categoriesLegendWidth - 16);
              pdf.text(splitName, categoriesLegendX + 10, currentItemY + 3);
              
              // Calculate height for this category and update position for next one
              const categoryHeight = Math.max(itemHeight, (splitName.length * 4));
              currentItemY += categoryHeight;
            });
          } else {
            // If no categories, show a message
            const itemY = categoriesLegendY + titleHeight + 2;
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(7);
            pdf.setTextColor(75, 85, 99); // #4b5563
            pdf.text('No categories found', categoriesLegendX + 4, itemY + 3);
          }
          
          // 3. Levels Legend - positioned below the categories legend
          if (levels && levels.length > 0) {
            const levelsLegendWidth = 70;
            const levelsLegendX = categoriesLegendX;
            const levelsLegendY = categoriesLegendY + categoriesHeight + 5;
            
            // Calculate levels legend height
            let levelsItemsHeight = 0;
            levels.forEach((levelIdeas, levelIndex) => {
              const levelIdeasNames = levelIdeas.map(idx => ideas[idx]?.title || `Idea ${idx + 1}`).join(', ');
              const splitText = pdf.splitTextToSize(`Level ${levelIndex + 1}: ${levelIdeasNames}`, levelsLegendWidth - 8);
              levelsItemsHeight += Math.max(itemHeight, (splitText.length * 4));
            });
            
            const levelsHeight = titleHeight + levelsItemsHeight + 4;
            
            // Draw levels legend background
            pdf.setFillColor(255, 255, 255);
            pdf.setDrawColor(226, 232, 240);
            pdf.roundedRect(levelsLegendX, levelsLegendY, levelsLegendWidth, levelsHeight, 1, 1, 'FD');
            
            // Levels title
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(75, 85, 99);
            pdf.text('Levels', levelsLegendX + 4, levelsLegendY + 4);
            
            // Add level items
            let currentLevelY = levelsLegendY + titleHeight + 2;
            levels.forEach((levelIdeas, levelIndex) => {
              const levelIdeasNames = levelIdeas.map(idx => ideas[idx]?.title || `Idea ${idx + 1}`).join(', ');
              const levelText = `Level ${levelIndex + 1}: ${levelIdeasNames}`;
              
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(6);
              pdf.setTextColor(75, 85, 99);
              
              const splitText = pdf.splitTextToSize(levelText, levelsLegendWidth - 8);
              pdf.text(splitText, levelsLegendX + 4, currentLevelY + 3);
              
              const levelHeight = Math.max(itemHeight, (splitText.length * 4));
              currentLevelY += levelHeight;
            });
          }
          
          // Save the PDF with a simple name
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
      // Also clean up level labels
      if (containerRef.current) {
        const labels = containerRef.current.querySelectorAll('.level-label');
        labels.forEach(label => label.remove());
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
        
        // Calculate position based on level and index within level
        const nodeWidth = 200;
        const nodeHeight = 80;
        const horizontalGap = 40;
        const verticalGap = 100;
        const levelWidth = levelIdxs.length * (nodeWidth + horizontalGap);
        const startX = -(levelWidth / 2) + (nodeWidth / 2);
        
        // If the idea has a category with color, we use that color; otherwise, we use the level-based color
        elements.push({
          data: {
            id: `node-${idea.id}`,
            label: idea.title,
            influenceLevel: influenceLevel,
            level: levelNum, // Store the level number for level labels
            levelColor: getLevelColor(levelNum),
            categoryColor: categoryColor,
            category: idea.category
          },
          position: {
            // Position nodes horizontally within the same level
            x: startX + indexInLevel * (nodeWidth + horizontalGap),
            y: levelNum * (nodeHeight + verticalGap)
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
        name: 'preset' // We'll manually position nodes based on levels
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      autoungrabify: false, // Allow moving nodes
      wheelSensitivity: 0.2 // Reduce zoom sensitivity
    });
    
    // Function to add level labels to the diagram (positioned below each level as separators)
    const addLevelLabels = () => {
      if (!containerRef.current) return;
      
      // Remove existing level labels
      const existingLabels = containerRef.current.querySelectorAll('.level-label');
      existingLabels.forEach(label => label.remove());
      
      // Get nodes grouped by level
      const nodesByLevel: { [key: number]: cytoscape.NodeSingular[] } = {};
      cy.nodes().forEach((node) => {
        const level = node.data('level');
        if (level !== undefined) {
          if (!nodesByLevel[level]) nodesByLevel[level] = [];
          nodesByLevel[level].push(node);
        }
      });
      
      // Sort levels in ascending order
      const sortedLevels = Object.keys(nodesByLevel).map(Number).sort((a, b) => a - b);
      const totalLevels = sortedLevels.length;
      
      // Add labels for each level (positioned below the level as a separator)
      sortedLevels.forEach((level, idx) => {
        const nodesInLevel = nodesByLevel[level];
        
        if (nodesInLevel.length > 0) {
          // Get the leftmost position and bottom Y of nodes in this level
          let minX = Infinity;
          let maxY = -Infinity;
          
          nodesInLevel.forEach(node => {
            const pos = node.renderedPosition();
            const bb = node.renderedBoundingBox();
            minX = Math.min(minX, pos.x);
            maxY = Math.max(maxY, bb.y2); // Bottom of the node
          });
          
          // Create level label - positioned below the nodes as a separator
          const label = document.createElement('div');
          label.className = 'level-label';
          label.style.position = 'absolute';
          label.style.left = Math.max(10, minX - 100) + 'px';
          // Position below the nodes - the label acts as a separator between levels
          label.style.top = (maxY + 15) + 'px';
          label.style.fontSize = '14px';
          label.style.fontWeight = 'bold';
          label.style.color = '#374151';
          label.style.backgroundColor = '#f9fafb';
          label.style.padding = '4px 8px';
          label.style.borderRadius = '4px';
          label.style.border = '1px solid #e5e7eb';
          label.style.zIndex = '1000';
          label.style.pointerEvents = 'none';
          // Display level number inverted (Level 1 at bottom, higher numbers at top)
          label.textContent = `Level ${totalLevels - level}`;
          
          containerRef.current?.appendChild(label);
        }
      });
    };
    
    // Add handler to adjust size after rendering
    cy.on('layoutstop', () => {
      cy.fit(undefined, 60); // Add padding for level labels
      cy.center();
      // Add level labels after layout is complete
      setTimeout(() => addLevelLabels(), 100);
    });
    
    // Also update labels when viewport changes
    cy.on('viewport', () => {
      addLevelLabels();
    });
    
    // Save the reference
    cyRef.current = cy;
    
    // Apply the preset layout (positions are already set in elements)
    cy.layout({ 
      name: 'preset',
      padding: 60
    }).run();
    
    // Fit and center after initial render with padding for level labels
    cy.fit(undefined, 60);
    cy.center();
    setTimeout(() => addLevelLabels(), 100);
    
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
        <div ref={containerRef} className="w-full min-h-[500px]" style={{ height: `${Math.max(500, levels.length * 180 + 150)}px`, paddingBottom: '50px' }} />
        
        {/* Project Info Legend - Draggable */}
        {projectInfo && (
          <div 
            className="absolute bg-white border border-slate-200 rounded-md p-3 shadow-sm cursor-move"
            style={{ 
              maxWidth: '300px', 
              zIndex: 10,
              top: projectInfoPosition.y,
              left: projectInfoPosition.x,
            }}
            onMouseDown={(startEvent) => {
              // Only handle left mouse button
              if (startEvent.button !== 0) return;
              
              startEvent.preventDefault();
              const initialX = startEvent.clientX;
              const initialY = startEvent.clientY;
              const initialPosX = projectInfoPosition.x;
              const initialPosY = projectInfoPosition.y;
              
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const deltaX = moveEvent.clientX - initialX;
                const deltaY = moveEvent.clientY - initialY;
                setProjectInfoPosition({
                  x: initialPosX + deltaX,
                  y: initialPosY + deltaY
                });
              };
              
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          >
            <div className="text-sm font-semibold text-gray-600 mb-2 flex justify-between items-center">
              <span>Project Information</span>
              <span className="text-xs text-gray-400 italic">(Drag)</span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-600">Name:</span>
                <span className="text-xs text-gray-600 block">{projectInfo.name}</span>
              </div>
              {projectInfo.description && (
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-600">Description:</span>
                  <span className="text-xs text-gray-600 block line-clamp-2">{projectInfo.description}</span>
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-600">Created:</span>
                <span className="text-xs text-gray-600 block">
                  {new Date(projectInfo.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Categories legend - Draggable */}
        {visibleCategories.length > 0 && (
          <div 
            className="absolute bg-white border border-slate-200 rounded-md p-3 shadow-sm cursor-move"
            style={{ 
              minWidth: '180px', 
              zIndex: 10,
              top: categoriesPosition.y,
              right: categoriesPosition.x === 'right' ? 4 : undefined,
              left: categoriesPosition.x !== 'right' ? categoriesPosition.x : undefined
            }}
            onMouseDown={(startEvent) => {
              // Only handle left mouse button
              if (startEvent.button !== 0) return;
              
              startEvent.preventDefault();
              const initialX = startEvent.clientX;
              const initialY = startEvent.clientY;
              const elem = startEvent.currentTarget;
              const rect = elem.getBoundingClientRect();
              const initialRight = window.innerWidth - (rect.x + rect.width);
              const initialPosY = categoriesPosition.y;
              const wasOnRight = categoriesPosition.x === 'right';
              
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const deltaX = moveEvent.clientX - initialX;
                const deltaY = moveEvent.clientY - initialY;
                
                // Initial movement - switch from right edge to absolute positioning
                if (wasOnRight && deltaX !== 0) {
                  // Convert from right-anchored to absolute position
                  setCategoriesPosition({
                    x: window.innerWidth - initialRight - rect.width - deltaX,
                    y: initialPosY + deltaY
                  });
                } else if (typeof categoriesPosition.x === 'number') {
                  // Already using absolute position, just update it
                  setCategoriesPosition({
                    x: categoriesPosition.x + deltaX,
                    y: initialPosY + deltaY
                  });
                }
              };
              
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          >
            <div className="text-sm font-semibold text-gray-600 mb-2 flex justify-between items-center">
              <span>Categories</span>
              <span className="text-xs text-gray-400 italic">(Drag)</span>
            </div>
            <div className="flex flex-col gap-2">
              {visibleCategories.map((category) => (
                <div key={category.id} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: category.color || '#cbd5e1' }}
                  />
                  <span className="text-xs text-gray-600 break-words w-auto">
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