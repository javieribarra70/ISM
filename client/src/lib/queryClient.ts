import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Manejo especial para el caso 401
    if (res.status === 401) {
      console.warn("La sesión ha expirado o no tiene permiso. Se redirigirá a la página de inicio de sesión.");
      throw new Error(`401: No autorizado`);
    }
    
    try {
      const text = await res.text();
      throw new Error(`${res.status}: ${text || res.statusText}`);
    } catch (error) {
      // Si hay un error al obtener el texto, lanzar el error original
      throw new Error(`${res.status}: ${res.statusText}`);
    }
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Configuración de reintentos
  const MAX_RETRIES = 3;
  let retryCount = 0;
  let lastError: any = null;
  
  // Implementación con reintentos
  while (retryCount < MAX_RETRIES) {
    try {
      // Add cache-busting for GET requests to prevent caching issues
      const urlWithCacheBuster = method === 'GET' 
        ? `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}` 
        : url;
      
      // Log para depuración de reintentos
      if (retryCount > 0) {
        console.log(`apiRequest: Reintento #${retryCount} para ${method} ${url}`);
      }
      
      const res = await fetch(urlWithCacheBuster, {
        method,
        headers: {
          ...(data ? { "Content-Type": "application/json" } : {}),
          // Add extra headers to ensure proper caching behavior
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        },
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include", // Always send cookies for CORS requests
      });

      // Log response status for debugging
      console.debug(`API Request to ${url}: ${res.status}`);
      
      await throwIfResNotOk(res);
      return res;
    } catch (error) {
      // Guardamos el último error para relanzarlo si todos los reintentos fallan
      lastError = error;
      
      // Si el error está relacionado con red/conexión, reintentamos
      const isNetworkError = error instanceof TypeError && 
        (!error.message || 
         error.message.includes('Failed to fetch') || 
         error.message.includes('NetworkError') ||
         error.message.includes('network') ||
         error.message.includes('Network'));
      
      // No reintentamos operaciones de escritura (POST, PATCH, DELETE) automáticamente,
      // excepto si son errores de red puros (para evitar duplicaciones de datos)
      const isSafeToRetry = method === 'GET' || isNetworkError;
      
      if (isSafeToRetry && retryCount < MAX_RETRIES - 1) {
        // Esperar un tiempo exponencial antes de reintentar (backoff exponencial)
        const waitTime = Math.min(1000 * Math.pow(2, retryCount), 8000);
        console.warn(`Error en ${method} ${url}, reintentando en ${waitTime}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        retryCount++;
        continue;
      }
      
      // Registrar el error y relanzarlo si ya hemos intentado demasiadas veces
      console.error(`Error en ${method} ${url} (intento ${retryCount+1}/${MAX_RETRIES}):`, error);
      retryCount++;
    }
  }
  
  // Si llegamos aquí, todos los reintentos fallaron
  throw lastError || new Error(`Error de conexión después de ${MAX_RETRIES} intentos para ${method} ${url}`);
}

type UnauthorizedBehavior = "returnNull" | "throw";
// Eliminando caché local para asegurar datos actualizados
// Función mejorada con reintentos para manejar errores de red y sesión
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let lastError: any = null;
    
    // Implementación con reintentos automáticos en caso de errores de red
    while (retryCount < MAX_RETRIES) {
      try {
        // Add cache busting parameter to GET requests para garantizar respuestas frescas
        const now = Date.now();
        const urlWithCacheBuster = `${url}${url.includes('?') ? '&' : '?'}_t=${now}`;
        
        // Log para depuración
        if (retryCount > 0) {
          console.log(`Reintento #${retryCount} para ${url}`);
        }
        
        const res = await fetch(urlWithCacheBuster, {
          headers: {
            // Cabeceras anti-caché
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
          },
          credentials: "include", // Always include cookies
        });
        
        // Solo loguear en desarrollo
        console.debug(`Query to ${url}: ${res.status}`);

        // Manejo especial para 401 Unauthorized
        if (res.status === 401) {
          if (unauthorizedBehavior === "returnNull") {
            console.debug(`Returning null for unauthorized request to ${url}`);
            return null;
          } else {
            throw new Error(`401: No autorizado - La sesión ha expirado o no tiene permiso.`);
          }
        }

        // Verificar que la respuesta sea exitosa
        await throwIfResNotOk(res);
        
        try {
          // Intentar parsear como JSON
          const data = await res.json();
          return data;
        } catch (jsonError) {
          console.error(`Error parsing JSON from ${url}:`, jsonError);
          throw new Error(`Error al procesar la respuesta del servidor: ${jsonError}`);
        }
      } catch (error) {
        // Guardamos el último error para relanzarlo si todos los reintentos fallan
        lastError = error;
        
        // Si el error está relacionado con red/conexión, reintentamos
        const isNetworkError = error instanceof TypeError && 
          (error.message.includes('Failed to fetch') || 
           error.message.includes('NetworkError') ||
           error.message.includes('network') ||
           error.message.includes('Network'));
        
        if (isNetworkError && retryCount < MAX_RETRIES - 1) {
          // Esperar un tiempo exponencial antes de reintentar (backoff exponencial)
          const waitTime = Math.min(1000 * Math.pow(2, retryCount), 8000);
          console.warn(`Error de red en ${url}, reintentando en ${waitTime}ms...`, error);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
          continue;
        }
        
        // Registrar el error y relanzarlo si no es un error de red o ya hemos intentado demasiadas veces
        console.error(`Error fetching ${url} (intento ${retryCount+1}/${MAX_RETRIES}):`, error);
        retryCount++;
      }
    }
    
    // Si llegamos aquí, todos los reintentos fallaron
    throw lastError || new Error(`Error de conexión después de ${MAX_RETRIES} intentos para ${url}`);
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }), // Changed to returnNull to handle auth cleanly
      refetchInterval: false,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: true,
      staleTime: 0, // Reducido a 0 para siempre obtener datos frescos, especialmente importante para la página de usuarios
      retry: (failureCount, error) => {
        // Don't retry on 401 errors
        if (error instanceof Error && error.message.includes('401')) {
          return false;
        }
        return failureCount < 3;
      },
    },
    mutations: {
      retry: (failureCount, error) => {
        // Don't retry on 401 errors
        if (error instanceof Error && error.message.includes('401')) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});
