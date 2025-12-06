/**
 * Consolidated Matrix Utilities
 * Contains all functions for matrix operations used in VAXO/ISM processing
 */

/**
 * Find strongly connected components using Tarjan's algorithm
 * A strongly connected component is a maximal set of nodes where every node
 * is reachable from every other node in the set.
 * 
 * @param matrix - Adjacency matrix representing the graph
 * @returns Array of arrays, where each inner array contains node indices of one SCC
 */
export function findStronglyConnectedComponents(matrix: boolean[][]): number[][] {
  const n = matrix.length;
  const index = new Array(n).fill(-1);
  const lowLink = new Array(n).fill(-1);
  const onStack = new Array(n).fill(false);
  const stack: number[] = [];
  const sccs: number[][] = [];
  let currentIndex = 0;

  const strongConnect = (v: number) => {
    index[v] = currentIndex;
    lowLink[v] = currentIndex;
    currentIndex++;
    stack.push(v);
    onStack[v] = true;

    for (let w = 0; w < n; w++) {
      if (matrix[v][w]) {
        if (index[w] === -1) {
          strongConnect(w);
          lowLink[v] = Math.min(lowLink[v], lowLink[w]);
        } else if (onStack[w]) {
          lowLink[v] = Math.min(lowLink[v], index[w]);
        }
      }
    }

    if (lowLink[v] === index[v]) {
      const scc: number[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack[w] = false;
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  };

  for (let v = 0; v < n; v++) {
    if (index[v] === -1) {
      strongConnect(v);
    }
  }

  return sccs;
}

/**
 * Remove transitive redundancies from a matrix considering strongly connected components.
 * This is the SCC-aware algorithm that correctly handles cycles while preserving
 * essential connections between hierarchical levels.
 * 
 * @param matrix - Boolean adjacency matrix
 * @returns Reduced matrix with only essential connections
 */
export function removeTransitiveRedundancies(matrix: boolean[][]): boolean[][] {
  const n = matrix.length;
  const reducedMatrix = matrix.map(row => [...row]);
  
  const sccs = findStronglyConnectedComponents(matrix);
  console.log('Strongly Connected Components:', sccs);
  
  const nodeToScc = new Array(n);
  sccs.forEach((scc, sccIndex) => {
    scc.forEach(node => {
      nodeToScc[node] = sccIndex;
    });
  });
  
  const sccCount = sccs.length;
  const condensedGraph = Array(sccCount).fill(null).map(() => Array(sccCount).fill(false));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (matrix[i][j] && nodeToScc[i] !== nodeToScc[j]) {
        condensedGraph[nodeToScc[i]][nodeToScc[j]] = true;
      }
    }
  }
  
  const closure = condensedGraph.map(row => [...row]);
  for (let k = 0; k < sccCount; k++) {
    for (let i = 0; i < sccCount; i++) {
      for (let j = 0; j < sccCount; j++) {
        closure[i][j] = closure[i][j] || (closure[i][k] && closure[k][j]);
      }
    }
  }
  
  let hasChanges = true;
  let passes = 0;
  while (hasChanges && passes < 5) {
    hasChanges = false;
    passes++;
    
    for (let i = 0; i < sccCount; i++) {
      for (let j = 0; j < sccCount; j++) {
        if (condensedGraph[i][j]) {
          let hasIndirectPath = false;
          for (let k = 0; k < sccCount; k++) {
            if (k !== i && k !== j && condensedGraph[i][k] && closure[k][j]) {
              hasIndirectPath = true;
              break;
            }
          }
          if (hasIndirectPath) {
            condensedGraph[i][j] = false;
            hasChanges = true;
          }
        }
      }
    }
  }
  
  console.log(`SCC graph reduction completed in ${passes} passes`);
  console.log('Final condensed graph:', condensedGraph);
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (matrix[i][j]) {
        const sccI = nodeToScc[i];
        const sccJ = nodeToScc[j];
        
        if (sccI === sccJ) {
          reducedMatrix[i][j] = true;
        } else {
          reducedMatrix[i][j] = condensedGraph[sccI][sccJ];
        }
      }
    }
  }
  
  const transitiveClosureMatrix = reducedMatrix.map(row => [...row]);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        transitiveClosureMatrix[i][j] = transitiveClosureMatrix[i][j] || 
          (transitiveClosureMatrix[i][k] && transitiveClosureMatrix[k][j]);
      }
    }
  }
  
  const finalMatrix = reducedMatrix.map(row => [...row]);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (finalMatrix[i][j] && i !== j) {
        const sccI = nodeToScc[i];
        const sccJ = nodeToScc[j];
        
        if (sccI !== sccJ) {
          const sccISize = sccs[sccI].length;
          
          if (sccISize > 1) {
            let hasOtherOutgoingConnections = false;
            for (let otherNode = 0; otherNode < n; otherNode++) {
              if (nodeToScc[otherNode] === sccI) {
                for (let targetNode = 0; targetNode < n; targetNode++) {
                  if (nodeToScc[targetNode] !== sccI && finalMatrix[otherNode][targetNode] && 
                      !(otherNode === i && targetNode === j)) {
                    hasOtherOutgoingConnections = true;
                    break;
                  }
                }
                if (hasOtherOutgoingConnections) break;
              }
            }
            
            if (!hasOtherOutgoingConnections) {
              continue;
            }
          }
        }
        
        let hasAlternativePath = false;
        for (let k = 0; k < n; k++) {
          if (k !== i && k !== j && finalMatrix[i][k] && transitiveClosureMatrix[k][j]) {
            hasAlternativePath = true;
            break;
          }
        }
        
        if (hasAlternativePath) {
          finalMatrix[i][j] = false;
        }
      }
    }
  }
  
  console.log('Final matrix after complete redundancy elimination:', finalMatrix);
  console.log('Transitive reduction completed with SCC-aware algorithm');
  return finalMatrix;
}

/**
 * Apply transitive closure to a boolean matrix (Floyd-Warshall algorithm)
 * This computes all reachable paths in the graph.
 * 
 * @param matrix - Boolean adjacency matrix
 * @returns Matrix with transitive closure applied
 */
export function applyTransitiveClosure(matrix: boolean[][]): boolean[][] {
  const n = matrix.length;
  const result = matrix.map(row => [...row]);
  
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result[i][j] = result[i][j] || (result[i][k] && result[k][j]);
      }
    }
  }
  
  return result;
}

/**
 * Compute transitive reduction of a matrix.
 * Removes edges that can be inferred through other paths.
 * 
 * @param matrix - Boolean adjacency matrix (should have transitive closure applied)
 * @returns Reduced matrix with minimum necessary edges
 */
export function computeTransitiveReduction(matrix: boolean[][]): boolean[][] {
  const n = matrix.length;
  const reducedMatrix = matrix.map(row => [...row]);
  
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (i !== j && reducedMatrix[i][j]) {
        for (let k = 0; k < n; k++) {
          if (k !== i && k !== j && reducedMatrix[j][k] && reducedMatrix[i][k]) {
            reducedMatrix[i][k] = false;
          }
        }
      }
    }
  }
  
  return reducedMatrix;
}

/**
 * Simple removal of redundant relations for basic cases
 * 
 * @param matrix - Boolean adjacency matrix
 * @returns Reduced matrix without obvious redundancies
 */
export function removeRedundantRelations(matrix: boolean[][]): boolean[][] {
  const n = matrix.length;
  const reducedMatrix = matrix.map(row => [...row]);
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      
      if (reducedMatrix[i][j]) {
        for (let k = 0; k < n; k++) {
          if (k === i || k === j) continue;
          
          if (reducedMatrix[i][k] && reducedMatrix[k][j]) {
            reducedMatrix[i][j] = false;
            break;
          }
        }
      }
    }
  }
  
  return reducedMatrix;
}

/**
 * Compare two sets for equality
 * 
 * @param a - First set
 * @param b - Second set
 * @returns True if sets contain the same elements
 */
export function areSetsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  return Array.from(a).every(item => b.has(item));
}
