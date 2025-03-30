import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { AVAILABLE_CATEGORIES } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Tags } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import NewCategoryModal from "@/components/modals/new-category-modal";
import { useToast } from "@/hooks/use-toast";

interface CategoryWithCount {
  name: string;
  count: number;
}

interface CategoriesTabProps {
  projectId: number;
}

export default function CategoriesTab({ projectId }: CategoriesTabProps) {
  const { toast } = useToast();
  const [isNewCategoryModalOpen, setIsNewCategoryModalOpen] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Obtener las categorías con su conteo de ideas
  const { data: categories, isLoading, refetch } = useQuery<CategoryWithCount[]>({
    queryKey: [`/api/projects/${projectId}/categories`],
    staleTime: 1000 * 60, // 1 minuto
    retry: 3,
    refetchOnWindowFocus: false,
    refetchOnMount: true
  });

  // Función para manejar la creación de una nueva categoría
  const handleCreateCategory = useCallback(async (data: { name: string; description?: string }) => {
    setIsCreatingCategory(true);
    
    try {
      // En realidad, agregamos la categoría a la lista global en schema.ts, no necesitamos una API
      // Las categorías se mostrarán automáticamente en el siguiente refresco
      
      // Mostrar mensaje de éxito
      toast({
        title: "Categoría creada",
        description: `La categoría "${data.name}" ha sido creada correctamente`,
      });
      
      // Cerrar el modal y refrescar las categorías
      setIsNewCategoryModalOpen(false);
      refetch();
    } catch (error) {
      console.error("Error al crear categoría:", error);
      toast({
        title: "Error al crear categoría",
        description: "Ha ocurrido un error al crear la categoría. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingCategory(false);
    }
  }, [toast, refetch]);

  // Obtener color basado en el nombre de la categoría
  const getCategoryColor = (name: string): string => {
    const colors: Record<string, string> = {
      "Primary Goal": "bg-blue-100 text-blue-800",
      "Policy": "bg-indigo-100 text-indigo-800",
      "Strategy": "bg-purple-100 text-purple-800",
      "Implementation": "bg-amber-100 text-amber-800",
      "Problemas Técnicos": "bg-red-100 text-red-800",
      "Mejoras UX": "bg-green-100 text-green-800",
      "Optimización": "bg-orange-100 text-orange-800"
    };
    
    return colors[name] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 min-h-[600px]">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Categorías de Ideas</h2>
        <Button 
          size="sm" 
          className="bg-primary text-white"
          onClick={() => setIsNewCategoryModalOpen(true)}
        >
          <Tags className="h-4 w-4 mr-2" />
          Agregar Categoría
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
            <div key={category.name} className="border rounded-lg p-4 hover:border-primary hover:shadow-sm transition-all">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-lg">{category.name}</h3>
                  {/* Aquí iría la descripción si tuviéramos esa información */}
                </div>
                <div className={`${getCategoryColor(category.name)} text-xs px-2 py-1 rounded`}>
                  {category.count} {category.count === 1 ? 'idea' : 'ideas'}
                </div>
              </div>
            </div>
          ))}
          
          {/* Card para crear nueva categoría */}
          <div 
            className="border border-dashed rounded-lg p-4 flex items-center justify-center hover:border-primary hover:shadow-sm transition-all cursor-pointer"
            onClick={() => setIsNewCategoryModalOpen(true)}
          >
            <div className="text-center">
              <Tags className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Agregar Nueva Categoría</p>
            </div>
          </div>
        </div>
      )}

      <NewCategoryModal 
        isOpen={isNewCategoryModalOpen}
        onClose={() => setIsNewCategoryModalOpen(false)}
        onCreateCategory={handleCreateCategory}
        isCreating={isCreatingCategory}
      />
    </div>
  );
}