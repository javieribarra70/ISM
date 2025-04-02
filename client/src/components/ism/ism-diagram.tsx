import { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Controls,
  Background,
  ConnectionLineType,
  Node,
  Edge,
  Position,
  MarkerType,
} from 'react-flow-renderer';
import { Idea } from '@shared/schema';

interface ISMDiagramProps {
  ideas: Idea[];
  levels: number[][];
  finalReachabilityMatrix: boolean[][];
}

const ISMDiagram = ({ ideas, levels, finalReachabilityMatrix }: ISMDiagramProps) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const buildDiagram = useCallback(() => {
    if (!ideas.length || !levels.length || !finalReachabilityMatrix.length) {
      return;
    }

    const getNodeId = (idea: Idea) => `node-${idea.id}`;
    const levelHeight = 180; // Aumentar la separación vertical
    const nodeWidth = 200;   // Nodos más anchos
    const nodeHeight = 80;
    const horizontalGap = 100; // Mayor separación horizontal
    
    const newNodes: Node[] = [];
    const idToNodeMap = new Map<number, { idea: Idea, level: number, index: number }>();
    
    // Crear nodos organizados por niveles
    levels.forEach((levelIdxs, levelNum) => {
      const totalWidth = levelIdxs.length * nodeWidth + (levelIdxs.length - 1) * horizontalGap;
      const startX = -totalWidth / 2 + nodeWidth / 2;
      
      levelIdxs.forEach((ideaIdx, indexInLevel) => {
        const idea = ideas[ideaIdx];
        const x = startX + indexInLevel * (nodeWidth + horizontalGap);
        const y = levelNum * levelHeight;
        
        // Nivel de influencia más alto = nivel 0, nivel más bajo = nivel máximo
        const influenceLevel = levels.length - levelNum;
        
        // Color del nodo basado en el nivel de influencia
        const getLevelColor = (level: number) => {
          // Escala de colores: del más influyente (azul más intenso) al menos influyente
          const maxLevel = levels.length;
          const intensity = Math.max(0, 100 - Math.floor((level / maxLevel) * 80));
          return `rgba(59, 130, 246, ${intensity}%)`;
        };
        
        newNodes.push({
          id: getNodeId(idea),
          data: { 
            label: (
              <div className="text-center p-1">
                <div className="font-medium text-sm">{idea.title}</div>
                <div className="text-xs mt-1 text-blue-600 font-semibold">
                  Nivel de influencia: {influenceLevel}
                </div>
              </div>
            ) 
          },
          position: { x, y },
          style: {
            width: nodeWidth,
            height: nodeHeight,
            background: '#ffffff',
            borderRadius: '8px',
            border: `2px solid ${getLevelColor(levelNum)}`,
            padding: '10px',
            boxShadow: '0 2px 4px 0 rgba(0, 0, 0, 0.15)',
          },
        });
        
        idToNodeMap.set(idea.id, { idea, level: levelNum, index: indexInLevel });
      });
    });
    
    // Crear conexiones entre nodos según la matriz de alcance
    const newEdges: Edge[] = [];
    
    // Crear todas las conexiones directas basadas en la matriz de reachability
    for (let i = 0; i < ideas.length; i++) {
      for (let j = 0; j < ideas.length; j++) {
        if (i !== j && finalReachabilityMatrix[i][j]) {
          const sourceIdea = ideas[i];
          const targetIdea = ideas[j];
          
          const sourceInfo = idToNodeMap.get(sourceIdea.id);
          const targetInfo = idToNodeMap.get(targetIdea.id);
          
          if (sourceInfo && targetInfo) {
            // Verificar relación bidireccional
            const hasBidirectional = 
              finalReachabilityMatrix[i][j] && 
              finalReachabilityMatrix[j][i];
            
            // Crear una identificación única para esta conexión
            const edgeId = `edge-${sourceIdea.id}-${targetIdea.id}`;
            
            // Para relaciones bidireccionales dentro del mismo nivel
            if (sourceInfo.level === targetInfo.level && hasBidirectional) {
              // Solo agregar si i < j para evitar duplicados
              if (i < j) {
                newEdges.push({
                  id: `edge-bidir-${sourceIdea.id}-${targetIdea.id}`,
                  source: getNodeId(sourceIdea),
                  target: getNodeId(targetIdea),
                  type: 'straight',
                  animated: true,
                  style: { stroke: '#3b82f6', strokeWidth: 2 },
                  markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: '#3b82f6',
                  },
                  markerStart: {
                    type: MarkerType.ArrowClosed,
                    color: '#3b82f6',
                  },
                });
              }
            } 
            // Para relaciones unidireccionales o entre diferentes niveles
            else {
              // Para ideas que están en cualquier nivel, mostrar relaciones directas
              newEdges.push({
                id: edgeId,
                source: getNodeId(sourceIdea),
                target: getNodeId(targetIdea),
                type: 'default', // Usar curvas suaves
                animated: false,
                style: { stroke: '#3b82f6', strokeWidth: 1.5 },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#3b82f6',
                },
                // Si están en niveles adyacentes, usar manejadores de posición específicos
                ...(Math.abs(sourceInfo.level - targetInfo.level) === 1 ? {
                  sourceHandle: sourceInfo.level < targetInfo.level ? Position.Bottom : Position.Top,
                  targetHandle: sourceInfo.level < targetInfo.level ? Position.Top : Position.Bottom,
                } : {})
              });
            }
          }
        }
      }
    }
    
    // Agregar flechas para nodos solitarios que no tienen relaciones
    // si hay más de un nivel en el diagrama
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
            const hasExistingConnection = newEdges.some(edge => 
              edge.source === getNodeId(currIdea) || 
              edge.target === getNodeId(currIdea)
            );
            
            // Si el nodo no tiene conexiones existentes, agregar una flecha hacia el siguiente nivel
            if (!hasExistingConnection) {
              // Elegir el primer nodo del siguiente nivel para crear una relación predeterminada
              const nextIdea = ideas[nextLevelNodes[0]];
              
              newEdges.push({
                id: `edge-default-${currIdea.id}-${nextIdea.id}`,
                source: getNodeId(currIdea),
                target: getNodeId(nextIdea),
                type: 'default',
                animated: false,
                style: { stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '5,5' }, // Línea punteada
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#3b82f6',
                },
                sourceHandle: Position.Bottom,
                targetHandle: Position.Top,
              });
            }
          });
          
          // Para cada nodo en el siguiente nivel
          nextLevelNodes.forEach(nextIdx => {
            const nextIdea = ideas[nextIdx];
            const hasExistingConnection = newEdges.some(edge => 
              edge.source === getNodeId(nextIdea) || 
              edge.target === getNodeId(nextIdea)
            );
            
            // Si el nodo no tiene conexiones existentes, agregar una flecha desde el nivel anterior
            if (!hasExistingConnection) {
              // Elegir el primer nodo del nivel actual para crear una relación predeterminada
              const currIdea = ideas[currentLevelNodes[0]];
              
              newEdges.push({
                id: `edge-default-${currIdea.id}-${nextIdea.id}`,
                source: getNodeId(currIdea),
                target: getNodeId(nextIdea),
                type: 'default',
                animated: false,
                style: { stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '5,5' }, // Línea punteada
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#3b82f6',
                },
                sourceHandle: Position.Bottom,
                targetHandle: Position.Top,
              });
            }
          });
        }
      }
    }
    
    setNodes(newNodes);
    setEdges(newEdges);
  }, [ideas, levels, finalReachabilityMatrix]);

  useEffect(() => {
    buildDiagram();
  }, [buildDiagram]);

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
          <li>Las flechas continuas representan relaciones directas entre ideas</li>
          <li>Las flechas punteadas conectan ideas aisladas que no tienen relaciones establecidas</li>
          <li>Las flechas bidireccionales indican influencia mutua entre ideas</li>
        </ul>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        connectionLineType={ConnectionLineType.Bezier}
        fitView
        attributionPosition="bottom-right"
        minZoom={0.4}
        maxZoom={1.5}
        defaultZoom={0.8}
      >
        <Controls />
        <Background color="#f8fafc" gap={16} />
      </ReactFlow>
    </div>
  );
};

export default ISMDiagram;