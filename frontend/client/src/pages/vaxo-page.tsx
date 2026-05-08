import { useParams, useSearch, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import VaxoWizard from "@/components/ism/vaxo-wizard";

export default function VaxoPage() {
  const params = useParams<{ projectId: string }>();
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  
  const projectId = parseInt(params.projectId || "0", 10);
  
  const searchParams = new URLSearchParams(searchString);
  const ideasParam = searchParams.get("ideas");
  const preselectedIdeaIds = ideasParam 
    ? ideasParam.split(",").map(id => parseInt(id, 10)).filter(id => !isNaN(id))
    : [];

  const handleBack = () => {
    console.log("Back button clicked, navigating to:", `/projects/${projectId}`);
    try {
      setLocation(`/projects/${projectId}`);
    } catch (e) {
      console.error("Navigation error:", e);
      window.location.href = `/projects/${projectId}`;
    }
  };

  const handleComplete = () => {
    console.log("Complete callback, navigating to:", `/projects/${projectId}`);
    try {
      setLocation(`/projects/${projectId}`);
    } catch (e) {
      console.error("Navigation error:", e);
      window.location.href = `/projects/${projectId}`;
    }
  };

  if (!projectId || projectId === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-muted-foreground">Invalid project ID.</p>
            <Button onClick={() => setLocation("/")} className="mt-4">
              Go to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Button 
            type="button"
            variant="ghost" 
            onClick={handleBack} 
            className="gap-2"
            data-testid="button-back-to-project"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Project
          </Button>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <VaxoWizard 
            projectId={projectId} 
            preselectedIdeaIds={preselectedIdeaIds}
            onComplete={handleComplete}
          />
        </div>
      </div>
    </div>
  );
}
