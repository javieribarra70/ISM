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
    
    // Primero, crear todas las conexiones directas basadas en la matriz de reachability
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
            
            // Para relaciones entre niveles adyacentes, mostrar siempre la flecha
            if (Math.abs(sourceInfo.level - targetInfo.level) === 1) {
              // Si el nivel de origen es menor (más arriba en el diagrama),
              // la flecha va hacia abajo (mayor influencia → menor influencia)
              if (sourceInfo.level < targetInfo.level) {
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
                  sourceHandle: Position.Bottom,
                  targetHandle: Position.Top,
                });
              }
            }
            
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
          }
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
      <div className="p-2 text-sm bg-blue-50 text-blue-700 border-b border-blue-200">
        <strong>Guía:</strong> Los elementos se organizan por niveles de influencia. Mayor nivel = mayor influencia.
        Las flechas indican relaciones de influencia entre ideas.
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