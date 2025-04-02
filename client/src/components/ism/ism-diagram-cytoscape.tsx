import { useState, useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { Idea } from '@shared/schema';
import { computeTransitiveReduction } from './matrix-reduction';

// Registrar el layout de dagre con Cytoscape
cytoscape.use(dagre);

interface ISMDiagramProps {
  ideas: Idea[];
  levels: number[][];
  finalReachabilityMatrix: boolean[][];
}

const ISMDiagram = ({ ideas, levels, finalReachabilityMatrix }: ISMDiagramProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  
  useEffect(() => {
    // Limpiar cuando el componente se desmonta
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
    
    // Aplicar la reducción transitiva para eliminar relaciones redundantes
    const reducedMatrix = computeTransitiveReduction(finalReachabilityMatrix);
    console.log('Original Matrix:', finalReachabilityMatrix);
    console.log('Reduced Matrix:', reducedMatrix);
    
    // Crear elementos para el gráfico
    const elements: cytoscape.ElementDefinition[] = [];
    const idToNodeMap = new Map<number, { idea: Idea, level: number, index: number }>();
    
    // Color del nodo basado en el nivel de influencia
    const getLevelColor = (level: number) => {
      // Escala de colores: del más influyente (azul más intenso) al menos influyente
      const maxLevel = levels.length;
      const intensity = Math.max(0, 100 - Math.floor((level / maxLevel) * 80));
      return `rgba(59, 130, 246, ${intensity}%)`;
    };
    
    // Crear nodos
    levels.forEach((levelIdxs, levelNum) => {
      levelIdxs.forEach((ideaIdx, indexInLevel) => {
        const idea = ideas[ideaIdx];
        const influenceLevel = levels.length - levelNum;
        
        elements.push({
          data: {
            id: `node-${idea.id}`,
            label: idea.title,
            influenceLevel: influenceLevel,
            levelColor: getLevelColor(levelNum)
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
            
            // Para relaciones bidireccionales dentro del mismo nivel
            if (sourceInfo.level === targetInfo.level && hasBidirectional) {
              // Solo agregar si i < j para evitar duplicados
              if (i < j) {
                elements.push({
                  data: {
                    id: `edge-bidir-${sourceIdea.id}-${targetIdea.id}`,
                    source: `node-${sourceIdea.id}`,
                    target: `node-${targetIdea.id}`,
                    isBidirectional: true
                  },
                  group: 'edges'
                });
              }
            } 
            // Para relaciones unidireccionales o entre diferentes niveles
            else {
              elements.push({
                data: {
                  id: edgeId,
                  source: `node-${sourceIdea.id}`,
                  target: `node-${targetIdea.id}`,
                  isBidirectional: false
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
                  isDashed: true,
                  isBidirectional: false
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
                  isDashed: true,
                  isBidirectional: false
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
            'border-color': 'data(levelColor)',
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
        // Estilo para texto adicional (nivel de influencia)
        {
          selector: 'node',
          style: {
            'overlay-padding': 8,
            'overlay-opacity': 0,
            'z-index': 10,
            'label': (ele) => {
              return ele.data('label') + 
                '\n\nNivel de influencia: ' + ele.data('influenceLevel');
            }
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
        // Estilos para flechas bidireccionales
        {
          selector: 'edge[isBidirectional = true]',
          style: {
            'width': 2,
            'line-color': '#3b82f6',
            'target-arrow-color': '#3b82f6',
            'target-arrow-shape': 'triangle',
            'source-arrow-color': '#3b82f6',
            'source-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.5,
            'text-rotation': 'autorotate'
          }
        },
        // Estilos para líneas punteadas
        {
          selector: 'edge[isDashed = true]',
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
    
  }, [ideas, levels, finalReachabilityMatrix]);
  
  if (!ideas.length || !levels.length || !finalReachabilityMatrix.length) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-slate-50 rounded-md">
        <p className="text-sm text-muted-foreground">
          No hay datos suficientes para generar el diagrama.
        </p>
      </div>
    );
  }
  
  return (
    <div className="w-full h-[600px] border rounded-md">
      <div className="p-3 text-sm bg-blue-50 text-blue-700 border-b border-blue-200">
        <strong>Guía del diagrama:</strong>
        <ul className="list-disc ml-5 mt-1">
          <li>Mayor nivel de influencia = mayor capacidad de impactar al sistema</li>
          <li>Solo se muestran relaciones directas esenciales (se eliminan relaciones redundantes)</li>
          <li>Las flechas continuas representan relaciones directas entre ideas</li>
          <li>Las flechas punteadas conectan ideas aisladas que no tienen relaciones establecidas</li>
          <li>Las flechas bidireccionales indican influencia mutua entre ideas</li>
        </ul>
      </div>
      <div ref={containerRef} className="w-full h-[540px]" />
    </div>
  );
};

export default ISMDiagram;