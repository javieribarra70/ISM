/**
 * Esta función elimina las relaciones redundantes de una matriz de adyacencia.
 * Una relación es redundante si existe un camino indirecto entre dos nodos que tiene la misma 
 * efectividad que la relación directa.
 * 
 * Por ejemplo, si A -> B y B -> C, entonces A -> C es redundante y puede eliminarse.
 * 
 * @param matrix La matriz de adyacencia con todas las relaciones (cierre transitivo)
 * @return Una nueva matriz con las relaciones mínimas necesarias
 */
export function removeRedundantRelations(matrix: boolean[][]): boolean[][] {
  const n = matrix.length;
  // Crear una copia de la matriz original para trabajar con ella
  const reducedMatrix: boolean[][] = matrix.map(row => [...row]);
  
  // Verificar si existe un camino indirecto entre cada par de nodos
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // Ignorar la diagonal (relaciones de un nodo consigo mismo)
      if (i === j) continue;
      
      // Si hay una relación directa, verificar si es redundante
      if (reducedMatrix[i][j]) {
        // Comprobar si hay un camino indirecto a través de cualquier otro nodo
        for (let k = 0; k < n; k++) {
          // Evitar considerar el nodo i o j como intermedio
          if (k === i || k === j) continue;
          
          // Si existe un camino i -> k -> j, entonces i -> j es redundante
          if (reducedMatrix[i][k] && reducedMatrix[k][j]) {
            reducedMatrix[i][j] = false;
            break; // Una vez encontramos que es redundante, podemos dejar de buscar
          }
        }
      }
    }
  }
  
  return reducedMatrix;
}

/**
 * Esta función es una versión más avanzada que tiene en cuenta caminos indirectos
 * de cualquier longitud, no solo los caminos de longitud 2.
 * Implementa un algoritmo de reducción transitiva basado en Warshall.
 * 
 * @param matrix La matriz de adyacencia con todas las relaciones (cierre transitivo)
 * @return Una matriz con las relaciones mínimas necesarias (reducción transitiva)
 */
export function computeTransitiveReduction(matrix: boolean[][]): boolean[][] {
  const n = matrix.length;
  
  // Crear una copia de la matriz original
  const reducedMatrix: boolean[][] = matrix.map(row => [...row]);
  
  // Implementación basada en el algoritmo de reducción transitiva
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (i !== j && reducedMatrix[i][j]) {
        for (let k = 0; k < n; k++) {
          // Si hay un camino i→j→k, entonces eliminar el camino directo i→k si existe
          if (k !== i && k !== j && reducedMatrix[j][k] && reducedMatrix[i][k]) {
            reducedMatrix[i][k] = false;
          }
        }
      }
    }
  }
  
  return reducedMatrix;
}