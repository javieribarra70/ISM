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
      return createSimpleMerge(idea1, idea2);
    }
    
    const prompt = `
      Estoy fusionando dos ideas relacionadas en una plataforma de gestión de proyectos.
      Por favor, crea una nueva idea que combine de manera coherente el contenido de estas dos ideas:
      
      IDEA 1:
      Título: ${idea1.title}
      Descripción: ${idea1.description}
      ${idea1.clarification ? `Aclaración: ${idea1.clarification}` : ''}
      
      IDEA 2:
      Título: ${idea2.title}
      Descripción: ${idea2.description}
      ${idea2.clarification ? `Aclaración: ${idea2.clarification}` : ''}
      
      Por favor, genera:
      1. Un título conciso que represente la fusión de ambas ideas.
      2. Una descripción detallada que integre ambos conceptos de manera fluida.
      3. Una aclaración opcional si es necesario explicar algún detalle adicional.
      
      Devuelve el resultado en formato JSON con las propiedades: title, description, clarification
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
      return createSimpleMerge(idea1, idea2);
    }

    const data = await response.json() as OpenAIResponse;
    console.log("Respuesta de OpenAI:", data);

    try {
      // Verificar que la respuesta tenga la estructura esperada
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error("Formato de respuesta de OpenAI inesperado:", data);
        return createSimpleMerge(idea1, idea2);
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
      const result = JSON.parse(contentText);
      
      return {
        title: result.title || `${idea1.title} + ${idea2.title}`,
        description: result.description || `${idea1.description}\n\n${idea2.description}`,
        clarification: result.clarification || '',
        // Mantener la categoría de la primera idea
        category: idea1.category
      };
    } catch (parseError) {
      console.error("Error al parsear la respuesta de OpenAI:", parseError);
      
      // Verificar que la respuesta tenga la estructura esperada antes de intentar acceder a su contenido
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error("Formato de respuesta de OpenAI inesperado:", data);
        return createSimpleMerge(idea1, idea2);
      }
      
      // Extraer manualmente título y descripción de la respuesta si el formato no es JSON
      const content = data.choices[0].message.content;
      const titleMatch = content.match(/Título:?\s*([^\n]+)/i);
      const descriptionMatch = content.match(/Descripción:?\s*([^\n]+(?:\n(?!\n).+)*)/i);
      const clarificationMatch = content.match(/Aclaración:?\s*([^\n]+(?:\n(?!\n).+)*)/i);
      
      return {
        title: titleMatch ? titleMatch[1].trim() : `${idea1.title} + ${idea2.title}`,
        description: descriptionMatch ? descriptionMatch[1].trim() : `${idea1.description}\n\n${idea2.description}`,
        clarification: clarificationMatch ? clarificationMatch[1].trim() : '',
        category: idea1.category
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
    
    // Si hay cualquier error, caemos de nuevo a la fusión básica
    return createSimpleMerge(idea1, idea2);
  }
}

/**
 * Función de respaldo que simplemente concatena las dos ideas
 * cuando no se puede usar la API de OpenAI
 */
function createSimpleMerge(idea1: Idea, idea2: Idea): Partial<Idea> {
  // Combinar títulos
  const mergedTitle = `${idea1.title} + ${idea2.title}`;
  
  // Combinar descripciones
  const mergedDescription = `${idea1.description}\n\n${idea2.description}`;
  
  // Combinar aclaraciones si existen
  let mergedClarification = "";
  if (idea1.clarification || idea2.clarification) {
    mergedClarification = [
      idea1.clarification || "",
      idea2.clarification || ""
    ].filter(Boolean).join("\n\n");
  }
  
  return {
    title: mergedTitle,
    description: mergedDescription,
    clarification: mergedClarification,
    category: idea1.category // Mantener la categoría de la primera idea
  };
}