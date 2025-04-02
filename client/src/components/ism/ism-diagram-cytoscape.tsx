import { useState, useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { Idea, Category } from '@shared/schema';
import { computeTransitiveReduction } from './matrix-reduction';
import { useQuery } from '@tanstack/react-query';

// Register the dagre layout with Cytoscape
cytoscape.use(dagre);

interface ISMDiagramProps {
  ideas: Idea[];
  levels: number[][];
  finalReachabilityMatrix: boolean[][];
  projectId?: number; // We add projectId to obtain the categories
}

const ISMDiagram = ({ ideas, levels, finalReachabilityMatrix, projectId }: ISMDiagramProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  
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
        
        // Si la idea tiene una categoría con color, usamos ese color; de lo contrario, usamos el color basado en nivel
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
            // Las posiciones se asignarán automáticamente por el layout
            x: 0,
            y: 0
          },
          group: 'nodes'
        });
        
        idToNodeMap.set(idea.id, { idea, level: levelNum, index: indexInLevel });
      });
    });
    
    // Crear conexiones directas basadas en la matriz de reachability reducida
    for (let i = 0; i < ideas.length; i++) {
      for (let j = 0; j < ideas.length; j++) {
        if (i !== j && reducedMatrix[i][j]) {
          const sourceIdea = ideas[i];
          const targetIdea = ideas[j];
          
          const sourceInfo = idToNodeMap.get(sourceIdea.id);
          const targetInfo = idToNodeMap.get(targetIdea.id);
          
          if (sourceInfo && targetInfo) {
            // Verificar relación bidireccional (usando la matriz reducida)
            const hasBidirectional = 
              reducedMatrix[i][j] && 
              reducedMatrix[j][i];
            
            // Crear una identificación única para esta conexión
            const edgeId = `edge-${sourceIdea.id}-${targetIdea.id}`;
            
            // Para todas las relaciones, usamos flechas unidireccionales
            // Incluso cuando hay relación bidireccional, creamos dos flechas por separado
            elements.push({
              data: {
                id: edgeId,
                source: `node-${sourceIdea.id}`,
                target: `node-${targetIdea.id}`
              },
              group: 'edges'
            });
            
            // Si hay relación bidireccional (I→J y J→I), agregar también la flecha en sentido contrario
            if (hasBidirectional && i < j) { // Solo agregar cuando i < j para evitar duplicados
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
    
    // Agregar flechas para nodos solitarios
    if (levels.length > 1) {
      // Para cada nivel, excepto el último
      for (let levelNum = 0; levelNum < levels.length - 1; levelNum++) {
        const currentLevelNodes = levels[levelNum];
        const nextLevelNodes = levels[levelNum + 1];
        
        // Si ambos niveles tienen nodos
        if (currentLevelNodes.length > 0 && nextLevelNodes.length > 0) {
          // Para cada nodo en el nivel actual
          currentLevelNodes.forEach(currIdx => {
            const currIdea = ideas[currIdx];
            const hasExistingConnection = elements.some(
              ele => ele.group === 'edges' && 
              (ele.data.source === `node-${currIdea.id}` || ele.data.target === `node-${currIdea.id}`)
            );
            
            // Si el nodo no tiene conexiones existentes, agregar una flecha hacia el siguiente nivel
            if (!hasExistingConnection) {
              // Elegir el primer nodo del siguiente nivel para crear una relación predeterminada
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
          
          // Para cada nodo en el siguiente nivel
          nextLevelNodes.forEach(nextIdx => {
            const nextIdea = ideas[nextIdx];
            const hasExistingConnection = elements.some(
              ele => ele.group === 'edges' && 
              (ele.data.source === `node-${nextIdea.id}` || ele.data.target === `node-${nextIdea.id}`)
            );
            
            // Si el nodo no tiene conexiones existentes, agregar una flecha desde el nivel anterior
            if (!hasExistingConnection) {
              // Elegir el primer nodo del nivel actual para crear una relación predeterminada
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
    
    // Inicializar Cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      style: [
        // Estilos para nodos
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
        // Estilo para nodos con categoryColor (prioridad sobre levelColor)
        {
          selector: 'node[categoryColor]',
          style: {
            'border-color': 'data(categoryColor)',
            'background-color': function(ele) {
              // Apply category color with 30% opacity to the background
              const color = ele.data('categoryColor');
              if (!color) return 'white';
              
              // Convert hex color to rgba with 30% opacity
              if (color.startsWith('#')) {
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                return `rgba(${r}, ${g}, ${b}, 0.3)`;
              }
              // If it's already rgba, adjust opacity to 0.3
              else if (color.startsWith('rgba')) {
                return color.replace(/[\d\.]+\)$/, '0.3)');
              }
              // If it's another format, return the color
              return color;
            }
          }
        },
        // Estilo para nodos con levelColor (solo si no tienen categoryColor)
        {
          selector: 'node[levelColor]:not([categoryColor])',
          style: {
            'border-color': 'data(levelColor)'
          }
        },
        // Estilo para texto adicional (solo el título)
        {
          selector: 'node',
          style: {
            'overlay-padding': 8,
            'overlay-opacity': 0,
            'z-index': 10
          }
        },
        // Estilos para bordes (flechas)
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

        // Estilos para líneas punteadas
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
      } as any, // El tipo any es necesario porque dagre no está incluido en los tipos de Cytoscape
      userZoomingEnabled: true,
      userPanningEnabled: true,
      autoungrabify: false, // Permitir mover nodos
      wheelSensitivity: 0.2 // Reducir sensibilidad del zoom
    });
    
    // Agregar un manejador para ajustar el tamaño después de renderizar
    cy.on('layoutstop', () => {
      cy.fit();
      cy.center();
    });
    
    // Guardar la referencia
    cyRef.current = cy;
    
    // Aplicar el diseño
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
    <div className="w-full h-[600px] border rounded-md">
      <div ref={containerRef} className="w-full h-[600px]" />
    </div>
  );
};

export default ISMDiagram;