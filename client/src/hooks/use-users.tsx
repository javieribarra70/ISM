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
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { role });
      return await res.json();
    },
    onSuccess: (data) => {
      // Invalidar la caché de usuarios para forzar una recarga
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      
      toast({
        title: "Rol actualizado",
        description: data.message || "El rol del usuario ha sido actualizado exitosamente.",
      });
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
      const res = await apiRequest("DELETE", `/api/users/${userId}`);
      return { userId, response: await res.json() };
    },
    onMutate: async (userId: number) => {
      // Cancelar consultas en curso
      await queryClient.cancelQueries({ queryKey: ["/api/users"] });
      
      // Guardar el estado anterior
      const previousUsers = queryClient.getQueryData<SelectUser[]>(["/api/users"]);
      
      // Optimistic update
      if (previousUsers) {
        queryClient.setQueryData(["/api/users"], 
          previousUsers.filter(user => user.id !== userId)
        );
      }
      
      return { previousUsers };
    },
    onSuccess: (data) => {
      toast({
        title: "Usuario eliminado",
        description: data.response.message || "El usuario ha sido eliminado exitosamente.",
      });
      
      // Forzar recargar los datos para asegurar sincronización
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