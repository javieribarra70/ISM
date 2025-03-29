import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

interface AuthWrapperProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export default function AuthWrapper({
  children,
  requireAuth = true,
}: AuthWrapperProps) {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();
  
  // Handle authentication redirects
  useEffect(() => {
    if (!isLoading) {
      // If auth is required and user is not logged in, redirect to auth page
      if (requireAuth && !user && location !== "/auth") {
        navigate("/auth");
      }
      
      // If user is logged in and on auth page, redirect to home
      if (user && location === "/auth") {
        navigate("/");
      }
    }
  }, [user, isLoading, location, navigate, requireAuth]);
  
  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // Don't render protected content if not authenticated
  if (requireAuth && !user && location !== "/auth") {
    return null; // Will redirect to auth page via the useEffect
  }
  
  // Render children
  return <>{children}</>;
}