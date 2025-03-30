import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User as SelectUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type UsersContextType = {
  users: SelectUser[] | null;
  isLoading: boolean;
  error: Error | null;
  updateUserRoleMutation: UseMutationResult<any, Error, UpdateRoleData>;
  deleteUserMutation: UseMutationResult<any, Error, number>;
};

type UpdateRoleData = {
  userId: number;
  role: 'admin' | 'user';
};

export const UsersContext = createContext<UsersContextType | null>(null);

export function UsersProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  
  // Consulta para obtener todos los usuarios (solo disponible para administradores)
  const {
    data: users,
    error,
    isLoading,
  } = useQuery<SelectUser[]>({
    queryKey: ["/api/users"],
    queryFn: getQueryFn({ on401: "throw" }), // Podemos permitir fallos aquí ya que solo los administradores deberían acceder
  });

  // Mutación para actualizar el rol de un usuario
  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: UpdateRoleData) => {
      // Guardar una referencia a los datos actuales antes de la mutación
      const currentUsers = queryClient.getQueryData<SelectUser[]>(["/api/users"]) || [];
      
      // Hacer la petición API
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { role });
      const responseData = await res.json();
      
      // Actualizar la caché manualmente DESPUÉS de la respuesta exitosa
      queryClient.setQueryData(["/api/users"], 
        currentUsers.map(user => 
          user.id === userId 
            ? { ...user, role } 
            : user
        )
      );
      
      return responseData;
    },
    onSuccess: (data) => {
      toast({
        title: "Rol actualizado",
        description: data.message || "El rol del usuario ha sido actualizado exitosamente.",
      });
      
      // Intentar recargar los datos en segundo plano para asegurar sincronización
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al actualizar rol",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Mutación para eliminar un usuario
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      // Guardar una referencia a los datos actuales antes de la mutación
      const currentUsers = queryClient.getQueryData<SelectUser[]>(["/api/users"]) || [];
      
      // Hacer la petición API
      const res = await apiRequest("DELETE", `/api/users/${userId}`);
      const responseData = await res.json();
      
      // Actualizar la caché manualmente DESPUÉS de la respuesta exitosa
      queryClient.setQueryData(["/api/users"], 
        currentUsers.filter(user => user.id !== userId)
      );
      
      return { userId, response: responseData };
    },
    onSuccess: (data) => {
      toast({
        title: "Usuario eliminado",
        description: data.response.message || "El usuario ha sido eliminado exitosamente.",
      });
      
      // Intentar recargar los datos en segundo plano para asegurar sincronización
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al eliminar usuario",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <UsersContext.Provider
      value={{
        users: users ?? null,
        isLoading,
        error,
        updateUserRoleMutation,
        deleteUserMutation,
      }}
    >
      {children}
    </UsersContext.Provider>
  );
}

export function useUsers() {
  const context = useContext(UsersContext);
  if (!context) {
    throw new Error("useUsers must be used within a UsersProvider");
  }
  return context;
}