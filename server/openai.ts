import { Idea } from "@shared/schema";
import fetch from "node-fetch";

// Definir una interfaz para la respuesta de OpenAI para mayor seguridad en el tipado
interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
    index: number;
    finish_reason: string;
  }[];
  model: string;
  object: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Helper function to check if a string has actual content
 */
function hasContent(value: string | null | undefined): boolean {
  return !!(value && value.trim().length > 0);
}

/**
 * Fusiona dos ideas usando la API de OpenAI para generar un contenido
 * coherente y bien integrado.
 * 
 * @param idea1 Primera idea a fusionar
 * @param idea2 Segunda idea a fusionar
 * @returns Una nueva idea con el contenido fusionado
 */
export async function mergeIdeasWithAI(idea1: Idea, idea2: Idea): Promise<Partial<Idea>> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error("Error: No se encontró OPENAI_API_KEY en las variables de entorno");
      return createSmartMerge(idea1, idea2);
    }
    
    // Determine which fields need AI fusion (both ideas have content)
    const bothHaveTitles = hasContent(idea1.title) && hasContent(idea2.title);
    const bothHaveDescriptions = hasContent(idea1.description) && hasContent(idea2.description);
    const bothHaveClarifications = hasContent(idea1.clarification) && hasContent(idea2.clarification);
    
    // If no fields need AI fusion (only one or neither has content for each field)
    // use the smart merge directly without calling OpenAI
    if (!bothHaveTitles && !bothHaveDescriptions && !bothHaveClarifications) {
      console.log("No hay campos que requieran fusión con IA, usando fusión directa");
      return createSmartMerge(idea1, idea2);
    }
    
    // Build a dynamic prompt based on what fields need to be merged
    let fieldsToMerge = [];
    
    if (bothHaveTitles) {
      fieldsToMerge.push({
        field: "title",
        instruction: `TÍTULOS A FUSIONAR:
- Título 1: "${idea1.title}"
- Título 2: "${idea2.title}"
Genera UNA SOLA FRASE que explique y combine ambas problemáticas/ideas en un título coherente.`
      });
    }
    
    if (bothHaveDescriptions) {
      fieldsToMerge.push({
        field: "description",
        instruction: `DESCRIPCIONES A FUSIONAR:
- Descripción 1: "${idea1.description}"
- Descripción 2: "${idea2.description}"
Genera una descripción unificada que integre ambos conceptos de manera fluida.`
      });
    }
    
    if (bothHaveClarifications) {
      fieldsToMerge.push({
        field: "clarification",
        instruction: `ACLARACIONES A FUSIONAR:
- Aclaración 1: "${idea1.clarification}"
- Aclaración 2: "${idea2.clarification}"
Genera una aclaración unificada que combine ambas explicaciones.`
      });
    }
    
    const prompt = `
Estoy fusionando dos ideas relacionadas en una plataforma de análisis ISM.
Por favor, fusiona SOLO los siguientes campos que tienen contenido en ambas ideas:

${fieldsToMerge.map(f => f.instruction).join('\n\n')}

INSTRUCCIONES IMPORTANTES:
- Fusiona SOLO los campos indicados arriba.
- Para cada campo, crea UNA versión unificada que represente ambos conceptos.
- NO añadas campos que no se te pidieron fusionar.
- Respeta el idioma original de las ideas.

Devuelve el resultado en formato JSON con SOLO las propiedades que fusionaste: ${fieldsToMerge.map(f => f.field).join(', ')}.
Ejemplo de formato: {"title": "...", "description": "..."} (solo incluye los campos que fusionaste)
    `;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Eres un asistente de fusión de ideas que genera contenido coherente cuando se combinan dos conceptos relacionados."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error en la API de OpenAI:", errorData);
      return createSmartMerge(idea1, idea2);
    }

    const data = await response.json() as OpenAIResponse;
    console.log("Respuesta de OpenAI:", data);

    try {
      // Verificar que la respuesta tenga la estructura esperada
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error("Formato de respuesta de OpenAI inesperado:", data);
        return createSmartMerge(idea1, idea2);
      }
      
      // Intentar extraer el JSON de la respuesta
      let contentText = data.choices[0].message.content;
      
      // A veces OpenAI devuelve el JSON con formato markdown
      if (contentText.includes('```json')) {
        contentText = contentText.split('```json')[1].split('```')[0].trim();
      }
      
      // Eliminar posibles saltos de línea y espacios extra
      contentText = contentText.replace(/\\n/g, ' ').trim();
      
      // Intentar parsear el resultado como JSON
      const aiResult = JSON.parse(contentText);
      
      // Get the base smart merge (handles fields where only one idea has content)
      const baseMerge = createSmartMerge(idea1, idea2);
      
      // Override with AI results only for fields that were fused by AI
      return {
        title: aiResult.title || baseMerge.title,
        description: aiResult.description || baseMerge.description,
        clarification: aiResult.clarification || baseMerge.clarification,
        category: baseMerge.category
      };
    } catch (parseError) {
      console.error("Error al parsear la respuesta de OpenAI:", parseError);
      
      // Verificar que la respuesta tenga la estructura esperada antes de intentar acceder a su contenido
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error("Formato de respuesta de OpenAI inesperado:", data);
        return createSmartMerge(idea1, idea2);
      }
      
      // Extraer manualmente título y descripción de la respuesta si el formato no es JSON
      const content = data.choices[0].message.content;
      const titleMatch = content.match(/Título:?\s*([^\n]+)/i);
      const descriptionMatch = content.match(/Descripción:?\s*([^\n]+(?:\n(?!\n).+)*)/i);
      const clarificationMatch = content.match(/Aclaración:?\s*([^\n]+(?:\n(?!\n).+)*)/i);
      
      const baseMerge = createSmartMerge(idea1, idea2);
      
      return {
        title: titleMatch ? titleMatch[1].trim() : baseMerge.title,
        description: descriptionMatch ? descriptionMatch[1].trim() : baseMerge.description,
        clarification: clarificationMatch ? clarificationMatch[1].trim() : baseMerge.clarification,
        category: baseMerge.category
      };
    }
  } catch (error) {
    console.error("Error al fusionar ideas con OpenAI:", error);
    console.error("API Key disponible:", !!process.env.OPENAI_API_KEY);
    console.error("Tipo de error:", typeof error);
    console.error("Ideas que intentamos fusionar:", {
      idea1: { id: idea1.id, title: idea1.title, projectId: idea1.projectId },
      idea2: { id: idea2.id, title: idea2.title, projectId: idea2.projectId }
    });
    
    // Si hay cualquier error, caemos de nuevo a la fusión inteligente
    return createSmartMerge(idea1, idea2);
  }
}

/**
 * Función de fusión inteligente que maneja campos vacíos:
 * - Si ambas ideas tienen contenido en un campo: concatena (será reemplazado por IA si está disponible)
 * - Si solo una idea tiene contenido: usa ese valor directamente
 * - Si ninguna tiene contenido: deja vacío
 */
function createSmartMerge(idea1: Idea, idea2: Idea): Partial<Idea> {
  // Merge titles intelligently
  let mergedTitle: string;
  if (hasContent(idea1.title) && hasContent(idea2.title)) {
    mergedTitle = `${idea1.title} + ${idea2.title}`;
  } else if (hasContent(idea1.title)) {
    mergedTitle = idea1.title;
  } else if (hasContent(idea2.title)) {
    mergedTitle = idea2.title;
  } else {
    mergedTitle = "";
  }
  
  // Merge descriptions intelligently
  let mergedDescription: string;
  if (hasContent(idea1.description) && hasContent(idea2.description)) {
    mergedDescription = `${idea1.description}\n\n${idea2.description}`;
  } else if (hasContent(idea1.description)) {
    mergedDescription = idea1.description!;
  } else if (hasContent(idea2.description)) {
    mergedDescription = idea2.description!;
  } else {
    mergedDescription = "";
  }
  
  // Merge clarifications intelligently
  let mergedClarification: string;
  if (hasContent(idea1.clarification) && hasContent(idea2.clarification)) {
    mergedClarification = `${idea1.clarification}\n\n${idea2.clarification}`;
  } else if (hasContent(idea1.clarification)) {
    mergedClarification = idea1.clarification!;
  } else if (hasContent(idea2.clarification)) {
    mergedClarification = idea2.clarification!;
  } else {
    mergedClarification = "";
  }
  
  // Category: use the one that exists, prefer idea1 if both have it
  let mergedCategory: string | undefined;
  if (hasContent(idea1.category)) {
    mergedCategory = idea1.category!;
  } else if (hasContent(idea2.category)) {
    mergedCategory = idea2.category!;
  }
  
  return {
    title: mergedTitle,
    description: mergedDescription,
    clarification: mergedClarification,
    category: mergedCategory
  };
}