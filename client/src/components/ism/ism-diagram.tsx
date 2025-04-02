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
    const levelHeight = 150;
    const nodeWidth = 180;
    const nodeHeight = 80;
    const horizontalGap = 50;
    
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
        
        newNodes.push({
          id: getNodeId(idea),
          data: { 
            label: (
              <div className="text-center">
                <div className="font-medium text-sm truncate">{idea.title}</div>
              </div>
            ) 
          },
          position: { x, y },
          style: {
            width: nodeWidth,
            height: nodeHeight,
            background: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            padding: '10px',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          },
        });
        
        idToNodeMap.set(idea.id, { idea, level: levelNum, index: indexInLevel });
      });
    });
    
    // Crear conexiones entre nodos según la matriz de alcance
    const newEdges: Edge[] = [];
    const processedConnections = new Set<string>();
    
    for (let i = 0; i < ideas.length; i++) {
      for (let j = 0; j < ideas.length; j++) {
        if (i !== j && finalReachabilityMatrix[i][j]) {
          const sourceIdea = ideas[i];
          const targetIdea = ideas[j];
          
          const sourceInfo = idToNodeMap.get(sourceIdea.id);
          const targetInfo = idToNodeMap.get(targetIdea.id);
          
          if (sourceInfo && targetInfo) {
            // Solo crear conexiones entre nodos de niveles adyacentes
            // o dentro del mismo nivel si hay influencia mutua
            const isAdjacent = Math.abs(sourceInfo.level - targetInfo.level) <= 1;
            
            // Verificar relación bidireccional
            const hasBidirectional = 
              finalReachabilityMatrix[i][j] && 
              finalReachabilityMatrix[j][i];
            
            // Crear una clave única para esta conexión
            const connectionKey = [sourceIdea.id, targetIdea.id].sort().join('-');
            
            // Solo procesar si no hemos agregado esta conexión antes
            if (isAdjacent && !processedConnections.has(connectionKey)) {
              processedConnections.add(connectionKey);
              
              if (hasBidirectional) {
                // Conectar nodos bidireccionales
                newEdges.push({
                  id: `edge-${sourceIdea.id}-${targetIdea.id}`,
                  source: getNodeId(sourceIdea),
                  target: getNodeId(targetIdea),
                  type: 'straight',
                  animated: true,
                  style: { stroke: '#3b82f6', strokeWidth: 2 },
                  markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: '#3b82f6',
                  },
                });
                
                // Agregar la conexión inversa también
                newEdges.push({
                  id: `edge-${targetIdea.id}-${sourceIdea.id}`,
                  source: getNodeId(targetIdea),
                  target: getNodeId(sourceIdea),
                  type: 'straight',
                  animated: true,
                  style: { stroke: '#3b82f6', strokeWidth: 2 },
                  markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: '#3b82f6',
                  },
                });
              } else if (sourceInfo.level < targetInfo.level) {
                // Conexión entre niveles diferentes - solo hacia abajo
                newEdges.push({
                  id: `edge-${sourceIdea.id}-${targetIdea.id}`,
                  source: getNodeId(sourceIdea),
                  target: getNodeId(targetIdea),
                  type: 'straight',
                  animated: false,
                  style: { stroke: '#3b82f6', strokeWidth: 1.5 },
                  markerEnd: {
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
    <div className="w-full h-[500px] border rounded-md">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        connectionLineType={ConnectionLineType.Straight}
        fitView
        attributionPosition="bottom-right"
      >
        <Controls />
        <Background color="#f8fafc" gap={16} />
      </ReactFlow>
    </div>
  );
};

export default ISMDiagram;