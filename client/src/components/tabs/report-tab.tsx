import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Idea, Project } from "@shared/schema";
import { BarChart3, Network, FileText, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReportTabProps {
  projectId: number;
}

interface VaxoResults {
  ssimMatrix: boolean[][];
  reachabilityMatrix: boolean[][];
  levels: number[][];
  selectedIdeas: Idea[];
  processDate: string;
}

export default function ReportTab({ projectId }: ReportTabProps) {
  const { toast } = useToast();
  const [vaxoResults, setVaxoResults] = useState<VaxoResults | null>(null);
  const [hasVaxoData, setHasVaxoData] = useState(false);

  // Fetch project data
  const { data: project } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
  });

  // Fetch selected ideas
  const { data: selectedIdeas = [] } = useQuery<{ ideaId: number }[]>({
    queryKey: [`/api/projects/${projectId}/selected-ideas`],
    enabled: !!projectId,
  });

  // Fetch all ideas to get the full idea objects
  const { data: allIdeas = [] } = useQuery<Idea[]>({
    queryKey: [`/api/projects/${projectId}/ideas`],
    enabled: !!projectId,
  });

  // Check if there's stored VAXO data in localStorage
  useEffect(() => {
    const checkVaxoData = () => {
      try {
        const storedData = localStorage.getItem(`vaxo-results-${projectId}`);
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          setVaxoResults(parsedData);
          setHasVaxoData(true);
        } else {
          setHasVaxoData(false);
        }
      } catch (error) {
        console.error('Error loading VAXO results:', error);
        setHasVaxoData(false);
      }
    };

    checkVaxoData();
    
    // Check for updates every 5 seconds
    const interval = setInterval(checkVaxoData, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  // Get the full idea objects for selected ideas
  const getSelectedIdeaObjects = () => {
    if (!selectedIdeas || !allIdeas) return [];
    
    return selectedIdeas
      .map(si => allIdeas.find(idea => idea.id === si.ideaId))
      .filter(Boolean) as Idea[];
  };

  const selectedIdeaObjects = getSelectedIdeaObjects();

  // Generate SSIM Matrix display
  const renderSSIMMatrix = () => {
    if (!vaxoResults || !vaxoResults.ssimMatrix) return null;

    const { ssimMatrix } = vaxoResults;
    const ideas = vaxoResults.selectedIdeas || selectedIdeaObjects;

    return (
      <div className="overflow-x-auto">
        <table className="w-full border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-sm font-medium">Ideas</th>
              {ideas.map((idea, i) => (
                <th key={i} className="border border-gray-300 p-2 text-sm font-medium min-w-[80px]">
                  {idea?.title || `Idea ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ssimMatrix.map((row, i) => (
              <tr key={i}>
                <td className="border border-gray-300 p-2 font-medium bg-gray-50">
                  {ideas[i]?.title || `Idea ${i + 1}`}
                </td>
                {row.map((cell, j) => (
                  <td key={j} className="border border-gray-300 p-2 text-center">
                    <span className={`inline-block w-6 h-6 rounded ${
                      cell ? 'bg-blue-500 text-white' : 'bg-gray-200'
                    }`}>
                      {cell ? '1' : '0'}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Generate Reachability Matrix display
  const renderReachabilityMatrix = () => {
    if (!vaxoResults || !vaxoResults.reachabilityMatrix) return null;

    const { reachabilityMatrix } = vaxoResults;
    const ideas = vaxoResults.selectedIdeas || selectedIdeaObjects;

    return (
      <div className="overflow-x-auto">
        <table className="w-full border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-sm font-medium">Ideas</th>
              {ideas.map((idea, i) => (
                <th key={i} className="border border-gray-300 p-2 text-sm font-medium min-w-[80px]">
                  {idea?.title || `Idea ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reachabilityMatrix.map((row, i) => (
              <tr key={i}>
                <td className="border border-gray-300 p-2 font-medium bg-gray-50">
                  {ideas[i]?.title || `Idea ${i + 1}`}
                </td>
                {row.map((cell, j) => (
                  <td key={j} className="border border-gray-300 p-2 text-center">
                    <span className={`inline-block w-6 h-6 rounded ${
                      cell ? 'bg-green-500 text-white' : 'bg-gray-200'
                    }`}>
                      {cell ? '1' : '0'}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Generate Levels display
  const renderLevels = () => {
    if (!vaxoResults || !vaxoResults.levels) return null;

    const { levels } = vaxoResults;
    const ideas = vaxoResults.selectedIdeas || selectedIdeaObjects;

    return (
      <div className="space-y-4">
        {levels.map((level, levelIndex) => (
          <div key={levelIndex} className="border rounded-lg p-4 bg-gray-50">
            <h4 className="font-semibold mb-2">Level {levelIndex + 1}</h4>
            <div className="flex flex-wrap gap-2">
              {level.map((ideaIndex) => {
                const idea = ideas[ideaIndex];
                return (
                  <Badge key={ideaIndex} variant="outline" className="bg-white">
                    {idea?.title || `Idea ${ideaIndex + 1}`}
                  </Badge>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Export results as JSON
  const exportResults = () => {
    if (!vaxoResults) {
      toast({
        title: "No data available",
        description: "No VAXO results to export.",
        variant: "destructive",
      });
      return;
    }

    const dataStr = JSON.stringify(vaxoResults, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vaxo-results-${project?.name || 'project'}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Results exported",
      description: "VAXO results have been downloaded as JSON file.",
    });
  };

  if (!hasVaxoData) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No VAXO Results Available</h3>
          <p className="text-gray-600 mb-4">
            Complete the VAXO process in the Connection tab to see analysis results here.
          </p>
          <div className="space-y-2 text-sm text-gray-500">
            <p>Steps to generate results:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Go to the Selector tab and select ideas</li>
              <li>Go to the Connection tab</li>
              <li>Complete the VAXO relationship questions</li>
              <li>Return here to view the analysis</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">VAXO Analysis Report</h2>
          <p className="text-gray-600">
            Results from {selectedIdeaObjects.length} selected ideas
            {vaxoResults?.processDate && ` • Processed on ${new Date(vaxoResults.processDate).toLocaleDateString()}`}
          </p>
        </div>
        <Button onClick={exportResults} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Results
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Selected Ideas</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{selectedIdeaObjects.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Relationships</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vaxoResults?.ssimMatrix 
                ? vaxoResults.ssimMatrix.flat().filter(Boolean).length 
                : 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hierarchy Levels</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vaxoResults?.levels?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SSIM Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>SSIM (Structural Self-Interaction Matrix)</CardTitle>
          <CardDescription>
            Shows the direct relationships between ideas based on VAXO analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderSSIMMatrix()}
        </CardContent>
      </Card>

      {/* Reachability Matrix */}
      {vaxoResults?.reachabilityMatrix && (
        <Card>
          <CardHeader>
            <CardTitle>Reachability Matrix</CardTitle>
            <CardDescription>
              Shows both direct and indirect relationships including transitivity
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderReachabilityMatrix()}
          </CardContent>
        </Card>
      )}

      {/* Level Partitioning */}
      {vaxoResults?.levels && (
        <Card>
          <CardHeader>
            <CardTitle>Level Partitioning</CardTitle>
            <CardDescription>
              Hierarchical organization of ideas based on their relationships
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderLevels()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}