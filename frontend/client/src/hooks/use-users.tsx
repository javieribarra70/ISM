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
  refetchUsers: () => Promise<any>;
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
    refetch: refetchUsers
  } = useQuery<SelectUser[]>({
    queryKey: ["/api/users"],
    queryFn: getQueryFn({ on401: "throw" }), // Podemos permitir fallos aquí ya que solo los administradores deberían acceder
    staleTime: 0, // Siempre obtener datos frescos
    refetchOnWindowFocus: true, // Actualizar cuando el usuario regresa a la ventana
    refetchOnMount: true, // Actualizar cuando el componente se monta
  });

  // Mutación para actualizar el rol de un usuario
  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: UpdateRoleData) => {
      // Hacer la petición API
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { role });
      const responseData = await res.json();
      return responseData;
    },
    onSuccess: (data) => {
      toast({
        title: "Rol actualizado",
        description: data.message || "El rol del usuario ha sido actualizado exitosamente.",
      });
      
      // Usar la función refetch directamente para obtener datos frescos
      setTimeout(() => {
        refetchUsers();
      }, 300);
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
      // Hacer la petición API
      const res = await apiRequest("DELETE", `/api/users/${userId}`);
      const responseData = await res.json();
      return { userId, response: responseData };
    },
    onSuccess: (data) => {
      const isAdminDeletion = data.response.deletedType === "admin";
      
      toast({
        title: isAdminDeletion ? "Administrador eliminado" : "Usuario eliminado",
        description: data.response.message || "El usuario ha sido eliminado exitosamente.",
        duration: isAdminDeletion ? 5000 : 3000, // Más tiempo para ver el mensaje de admin
        variant: isAdminDeletion ? "default" : "default",
      });
      
      // Usar la función refetch directamente para obtener datos frescos
      setTimeout(() => {
        refetchUsers();
      }, isAdminDeletion ? 500 : 300); // Esperar un poco más para refrescar si era un admin
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
        refetchUsers,
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