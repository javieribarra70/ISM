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
  // Add cache-busting for GET requests to prevent caching issues
  const urlWithCacheBuster = method === 'GET' 
    ? `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}` 
    : url;
    
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
}

type UnauthorizedBehavior = "returnNull" | "throw";
// Eliminando caché local para asegurar datos actualizados
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    
    try {
      // Add cache busting parameter to GET requests para garantizar respuestas frescas
      const now = Date.now();
      const urlWithCacheBuster = `${url}${url.includes('?') ? '&' : '?'}_t=${now}`;
      
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
      // Registrar el error y relanzarlo
      console.error(`Error fetching ${url}:`, error);
      throw error;
    }
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
