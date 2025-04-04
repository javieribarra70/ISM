import { useEffect, useRef } from "react";
import { Idea } from "@shared/schema";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import cytoscapeSvg from "cytoscape-svg";
import { jsPDF } from "jspdf";

// Register the extensions
if (typeof window !== "undefined") {
  cytoscape.use(dagre);
  cytoscape.use(cytoscapeSvg);
}

interface ISMDiagramProps {
  ideas: Idea[];
  levels: number[][];
  relationships: boolean[][];
}

export default function ISMDiagram({ ideas, levels, relationships }: ISMDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<any>(null);

  // Memoize the graph data
  useEffect(() => {
    if (!containerRef.current || !ideas.length || !levels.length) return;

    const container = containerRef.current;

    // Create nodes from ideas
    const nodes = ideas.map((idea, i) => ({
      data: {
        id: idea.id.toString(),
        label: idea.title,
        level: levels.findIndex(l => l.includes(i)),
      },
    }));

    // Create edges from the reachability matrix
    const edges: any[] = [];
    for (let i = 0; i < ideas.length; i++) {
      for (let j = 0; j < ideas.length; j++) {
        // Only create direct edges between adjacent levels
        if (i !== j && relationships[i][j]) {
          // Find the level of each idea
          const levelI = levels.findIndex(l => l.includes(i));
          const levelJ = levels.findIndex(l => l.includes(j));

          // Only draw edges between adjacent levels
          if (Math.abs(levelI - levelJ) === 1) {
            edges.push({
              data: {
                id: `${ideas[i].id}-${ideas[j].id}`,
                source: ideas[i].id.toString(),
                target: ideas[j].id.toString(),
              },
            });
          }
        }
      }
    }

    // Initialize cytoscape
    cyRef.current = cytoscape({
      container,
      elements: {
        nodes,
        edges,
      },
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#6366f1",
            "color": "#fff",
            "label": "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "text-wrap": "wrap",
            "text-max-width": "100px",
            "font-size": "10px",
            "width": "120px",
            "height": "60px",
            "shape": "roundrectangle",
          },
        },
        {
          selector: "edge",
          style: {
            "width": 2,
            "line-color": "#94a3b8",
            "target-arrow-color": "#94a3b8",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
          },
        },
      ],
      layout: {
        name: "dagre",
        rankDir: "BT", // Bottom to Top
        rankSep: 100,
        nodeSep: 50,
        edgeSep: 50,
        ranker: "network-simplex",
        padding: 30,
      },
    });

    // Apply level-based coloring
    levels.forEach((level, levelIndex) => {
      level.forEach((nodeIndex) => {
        const nodeId = ideas[nodeIndex].id.toString();
        const node = cyRef.current.getElementById(nodeId);
        
        // Color gradient from top (primary color) to bottom (light blue)
        const colors = [
          "#6366f1", // Primary (Indigo)
          "#8b5cf6", // Violet
          "#d946ef", // Fuchsia
          "#ec4899", // Pink
          "#f43f5e", // Rose
          "#ef4444", // Red
          "#f97316", // Orange
          "#f59e0b", // Amber
          "#eab308", // Yellow
          "#84cc16", // Lime
          "#22c55e", // Green
          "#10b981", // Emerald
          "#14b8a6", // Teal
          "#06b6d4", // Cyan
          "#0ea5e9", // Light Blue
        ];
        
        const colorIndex = levelIndex % colors.length;
        node.style("background-color", colors[colorIndex]);
      });
    });

    // Fit the graph to the container
    cyRef.current.fit();
    cyRef.current.center();

    // Cleanup
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [ideas, levels, relationships]);

  // Export the diagram as PDF
  const exportAsPDF = () => {
    if (!cyRef.current) return;

    try {
      // Generate SVG
      const svgStr = cyRef.current.svg({ scale: 2, full: true });
      const svg = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      
      // Create a URL for the SVG
      const url = URL.createObjectURL(svg);
      
      // Create an image from the SVG
      const img = new Image();
      img.onload = () => {
        // Create PDF with appropriate dimensions
        const pdf = new jsPDF({
          orientation: img.width > img.height ? "landscape" : "portrait",
          unit: "px",
          format: [img.width, img.height]
        });
        
        // Add image to PDF
        pdf.addImage(img, "SVG", 0, 0, img.width, img.height);
        
        // Save PDF
        pdf.save("ism-diagram.pdf");
        
        // Cleanup
        URL.revokeObjectURL(url);
      };
      
      img.src = url;
    } catch (error) {
      console.error("Error exporting diagram:", error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={containerRef} className="flex-1" style={{ width: "100%", height: "calc(100% - 50px)" }} />
      <div className="p-2 flex justify-end">
        <button 
          onClick={exportAsPDF}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm"
        >
          Export as PDF
        </button>
      </div>
    </div>
  );
}