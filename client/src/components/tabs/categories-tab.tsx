import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Tags, Pencil, Trash2, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Category } from "@shared/schema";
import NewCategoryModal from "@/components/modals/new-category-modal";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CategoriesTabProps {
  projectId: number;
  setActiveTab: (value: string) => void;
}

export default function CategoriesTab({ projectId, setActiveTab }: CategoriesTabProps) {
  const { toast } = useToast();
  const [isNewCategoryModalOpen, setIsNewCategoryModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentCategory, setCurrentCategory] = useState<Category | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  
  // Función auxiliar para mantener pestaña de categorías
  const persistCategoriesTab = useCallback(() => {
    try {
      sessionStorage.setItem(`project_${projectId}_active_tab`, "categories");
      console.log("Guardando pestaña activa: categories en sessionStorage");
    } catch (e) {
      console.error("Error al guardar pestaña en sessionStorage:", e);
    }
    setActiveTab("categories");
  }, [projectId, setActiveTab]);

  // Obtener las categorías del proyecto
  const { data: categories, isLoading, refetch: refetchCategories } = useQuery<Category[]>({
    queryKey: [`/api/projects/${projectId}/categories`],
    staleTime: 0, // Sin caché
    retry: 3,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 3000 // Refrescar cada 3 segundos
  });

  // Mutación para crear categoría
  const createCategoryMutation = useMutation({
    mutationFn: async (categoryData: { name: string; description?: string; color: string }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/categories`, {
        ...categoryData,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/categories`] });
      // Forzar una recarga inmediata de las categorías
      refetchCategories();
      toast({
        title: "Categoría creada",
        description: "La categoría ha sido creada correctamente",
      });
      setIsNewCategoryModalOpen(false);
      // Asegurar que la pestaña permanezca en categorías
      persistCategoriesTab();
    },
    onError: (error: Error) => {
      console.error("Error al crear categoría:", error);
      toast({
        title: "Error al crear categoría",
        description: "Ha ocurrido un error al crear la categoría. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  });

  // Mutación para actualizar categoría
  const updateCategoryMutation = useMutation({
    mutationFn: async (data: { id: number; name: string; description?: string; color: string }) => {
      const { id, ...updateData } = data;
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/categories/${id}`, updateData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/categories`] });
      // Forzar una recarga inmediata de las categorías
      refetchCategories();
      toast({
        title: "Categoría actualizada",
        description: "La categoría ha sido actualizada correctamente",
      });
      setIsNewCategoryModalOpen(false);
      setCurrentCategory(null);
      setIsEditMode(false);
      // Asegurar que la pestaña permanezca en categorías
      persistCategoriesTab();
    },
    onError: (error: Error) => {
      console.error("Error al actualizar categoría:", error);
      toast({
        title: "Error al actualizar categoría",
        description: "Ha ocurrido un error al actualizar la categoría. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  });

  // Mutación para eliminar categoría
  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: number) => {
      console.log(`Enviando solicitud DELETE a /api/projects/${projectId}/categories/${categoryId}`);
      const response = await apiRequest("DELETE", `/api/projects/${projectId}/categories/${categoryId}`);
      console.log(`Respuesta recibida para DELETE a /api/projects/${projectId}/categories/${categoryId}: ${response.status}`);
      return response;
    },
    onSuccess: () => {
      console.log("Categoría eliminada con éxito");
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/categories`] });
      toast({
        title: "Categoría eliminada",
        description: "La categoría ha sido eliminada correctamente",
      });
      setCategoryToDelete(null);
      // Asegurar que la pestaña permanezca en categorías
      persistCategoriesTab();
    },
    onError: (error: Error) => {
      console.error("Error al eliminar categoría:", error);
      const errorMessage = error.message.includes("400") 
        ? "Esta categoría está siendo utilizada por ideas y no puede ser eliminada."
        : error.message.includes("404")
          ? "No se encontró la categoría. Es posible que ya haya sido eliminada."
          : "Ha ocurrido un error al eliminar la categoría. Inténtalo de nuevo más tarde.";
      
      toast({
        title: "Error al eliminar categoría",
        description: errorMessage,
        variant: "destructive",
      });
      setCategoryToDelete(null);
    }
  });

  // Función para manejar la creación/edición de una categoría
  const handleCategorySave = useCallback((data: { name: string; description?: string; color: string }) => {
    if (isEditMode && currentCategory) {
      updateCategoryMutation.mutate({
        id: currentCategory.id,
        ...data
      });
    } else {
      createCategoryMutation.mutate(data);
    }
  }, [createCategoryMutation, updateCategoryMutation, isEditMode, currentCategory]);

  // Manejar edición de categoría
  const handleEditCategory = (category: Category) => {
    setCurrentCategory(category);
    setIsEditMode(true);
    setIsNewCategoryModalOpen(true);
  };

  // Manejar eliminación de categoría
  const handleDeleteCategory = (category: Category) => {
    setCategoryToDelete(category);
  };

  // Confirmar eliminación de categoría
  const confirmDeleteCategory = () => {
    if (categoryToDelete) {
      deleteCategoryMutation.mutate(categoryToDelete.id);
      // Asegurar que la pestaña permanezca en categorías
      persistCategoriesTab();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 min-h-[600px]">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Idea Categories</h2>
        <Button 
          size="sm" 
          className="bg-primary text-white"
          onClick={() => {
            setIsEditMode(false);
            setCurrentCategory(null);
            setIsNewCategoryModalOpen(true);
          }}
        >
          <Tags className="h-4 w-4 mr-2" />
          Add Category
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="border rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="w-3/4">
                  <Skeleton className="h-5 w-full mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
                <Skeleton className="h-6 w-12" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Lista de categorías existentes */}
          {categories && categories.map((category) => (
            <div key={category.id} className="border rounded-lg p-4 hover:border-primary hover:shadow-sm transition-all">
              <div className="flex justify-between items-start">
                <div className="w-3/4">
                  <div className="flex items-center">
                    <span 
                      className="inline-block w-4 h-4 rounded-full mr-2"
                      style={{ backgroundColor: category.color || '#E2E8F0' }}
                    />
                    <h3 className="font-medium text-lg truncate">{category.name}</h3>
                  </div>
                  {category.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{category.description}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button 
                    className="p-1 hover:bg-gray-100 rounded" 
                    onClick={() => handleEditCategory(category)}
                  >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button 
                    className="p-1 hover:bg-gray-100 rounded" 
                    onClick={() => handleDeleteCategory(category)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {/* Card para crear nueva categoría */}
          <div 
            className="border border-dashed rounded-lg p-4 flex items-center justify-center hover:border-primary hover:shadow-sm transition-all cursor-pointer"
            onClick={() => {
              setIsEditMode(false);
              setCurrentCategory(null);
              setIsNewCategoryModalOpen(true);
            }}
          >
            <div className="text-center">
              <Tags className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Add New Category</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal para crear/editar categoría */}
      <NewCategoryModal 
        isOpen={isNewCategoryModalOpen}
        onClose={() => {
          setIsNewCategoryModalOpen(false);
          setCurrentCategory(null);
          setIsEditMode(false);
        }}
        onSaveCategory={handleCategorySave}
        isSubmitting={createCategoryMutation.isPending || updateCategoryMutation.isPending}
        category={currentCategory}
        isEditMode={isEditMode}
      />

      {/* Delete category confirmation dialog */}
      <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <AlertCircle className="text-destructive mr-2 h-5 w-5" />
              Delete Category
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the category "{categoryToDelete?.name}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteCategory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCategoryMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}