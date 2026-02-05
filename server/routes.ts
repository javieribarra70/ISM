import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { randomBytes } from "crypto";
import { db } from "./db";
import { eq, or, isNull, and } from "drizzle-orm";
import { mergeIdeasWithAI } from "./openai";
import { 
  insertProjectSchema, 
  insertIdeaSchema, 
  insertRelationshipSchema,
  insertCategorySchema,
  insertIdeaVoteSchema,
  User,
  users,
  AVAILABLE_CATEGORIES
} from "@shared/schema";

// Extend the Express Request interface
declare global {
  namespace Express {
    interface Request {
      projectRole?: string;
    }
  }
}

// Middleware to check if user is authenticated
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};

// Middleware to check if user is admin
const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user && req.user.role === "admin") {
    return next();
  }
  res.status(403).json({ message: "Forbidden - Admin access required" });
};

// Middleware to check if user has access to project
const hasProjectAccess = async (req: Request, res: Response, next: NextFunction) => {
  // Verificar autenticación
  if (!req.isAuthenticated() || !req.user) {
    console.log("No está autenticado o no hay usuario en la solicitud");
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  console.log(`Usuario autenticado: ${req.user.id} - ${req.user.username} - Rol: ${req.user.role}`);

  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) {
    console.log(`ID de proyecto inválido: ${req.params.projectId}`);
    return res.status(400).json({ message: "Invalid project ID" });
  }

  try {
    // Check if user is an admin (system-wide)
    if (req.user.role === "admin") {
      console.log(`Usuario es admin global, acceso permitido a proyecto ${projectId}`);
      return next();
    }

    // Check if user has access to this specific project
    const role = await storage.getUserProjectRole(req.user.id, projectId);
    console.log(`Rol del usuario en el proyecto ${projectId}: ${role || 'ninguno'}`);
    
    if (!role) {
      return res.status(403).json({ message: "You don't have access to this project" });
    }

    // Add the role to the request for further checks if needed
    req.projectRole = role;
    next();
  } catch (error) {
    console.error(`Error al verificar acceso al proyecto: ${error}`);
    next(error);
  }
};

// Middleware to check if user is project admin
const isProjectAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) {
    return res.status(400).json({ message: "Invalid project ID" });
  }

  try {
    // Check if user is an admin (system-wide)
    if (req.user.role === "admin") {
      return next();
    }

    // Check if user is an admin for this specific project
    const role = await storage.getUserProjectRole(req.user.id, projectId);
    if (role !== "admin") {
      return res.status(403).json({ message: "You must be a project admin" });
    }

    next();
  } catch (error) {
    next(error);
  }
};

export function registerRoutes(app: Express): Server {
  // Set up authentication routes
  setupAuth(app);

  // Añadir middleware para cache-control
  app.use((req, res, next) => {
    // No cachear API por defecto
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    next();
  });

  // Project routes
  app.get("/api/projects", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      const projects = await storage.getUserProjects(req.user.id);
      res.json(projects);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const projectData = insertProjectSchema.parse({
        ...req.body,
        createdBy: req.user.id
      });
      
      const project = await storage.createProject(projectData);
      res.status(201).json(project);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.json(project);
    } catch (error) {
      next(error);
    }
  });
  
  // Ruta para actualizar la configuración del proyecto (incluyendo modo anónimo y campos descriptivos)
  app.patch("/api/projects/:projectId/settings", isProjectAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { 
        anonymousMode, 
        context, 
        triggeringQuestion, 
        relation, 
        restriction,
        name,
        description
      } = req.body;
      
      // Preparar objeto de actualización
      const updateData: Partial<any> = {};
      
      // Procesar modo anónimo si está presente
      if (anonymousMode !== undefined) {
        // Validar que sea un booleano
        if (typeof anonymousMode !== 'boolean') {
          return res.status(400).json({ message: "anonymousMode must be a boolean" });
        }
        updateData.anonymousMode = anonymousMode;
      }
      
      // Procesar campos de texto
      if (context !== undefined) updateData.context = context;
      if (triggeringQuestion !== undefined) updateData.triggeringQuestion = triggeringQuestion;
      if (relation !== undefined) updateData.relation = relation;
      if (restriction !== undefined) updateData.restriction = restriction;
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      
      // Verificar si hay algo que actualizar
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }
      
      const updatedProject = await storage.updateProject(projectId, updateData);
      
      if (!updatedProject) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      console.log(`Proyecto ${projectId} actualizado:`, updateData);
      res.json(updatedProject);
    } catch (error) {
      next(error);
    }
  });

  // Project users routes
  app.get("/api/projects/:projectId/users", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const projectUsers = await storage.getProjectUsers(projectId);
      res.json(projectUsers);
    } catch (error) {
      next(error);
    }
  });

  // Invitation routes
  app.post("/api/projects/:projectId/invitations", isProjectAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { email, role = "user" } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Generate a random token
      const token = randomBytes(32).toString("hex");
      
      // Calculate expiration date (7 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      const invitation = await storage.createInvitation({
        projectId,
        email,
        token,
        role,
        expiresAt
      } as any);
      
      res.status(201).json(invitation);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/invitations/:token/accept", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const { token } = req.params;
      const invitation = await storage.getInvitationByToken(token);
      
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }
      
      if (invitation.used) {
        return res.status(400).json({ message: "Invitation has already been used" });
      }
      
      // Check if invitation is expired
      if (invitation.expiresAt && new Date() > invitation.expiresAt) {
        return res.status(400).json({ message: "Invitation has expired" });
      }
      
      // Add user to project
      await storage.addUserToProject({
        projectId: invitation.projectId,
        userId: req.user.id,
        role: invitation.role
      } as any);
      
      // Mark invitation as used
      await storage.markInvitationAsUsed(invitation.id);
      
      res.json({ message: "Successfully joined project" });
    } catch (error) {
      next(error);
    }
  });

  // Ideas routes
  app.get("/api/projects/:projectId/ideas", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const ideas = await storage.getProjectIdeas(projectId);
      res.json(ideas);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/ideas", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const projectId = parseInt(req.params.projectId);
      
      const ideaData = insertIdeaSchema.parse({
        ...req.body,
        projectId,
        createdBy: req.user.id
      });
      
      const idea = await storage.createIdea(ideaData);
      res.status(201).json(idea);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/ideas/:ideaId", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const ideaId = parseInt(req.params.ideaId);
      const idea = await storage.getIdea(ideaId);
      
      if (!idea) {
        return res.status(404).json({ message: "Idea not found" });
      }
      
      // Verificar permisos: Administradores pueden editar cualquier idea, usuarios regulares solo las propias
      const isAdmin = req.user.role === "admin";
      const isCreator = idea.createdBy === req.user.id;
      
      console.log(`Verificando permisos para editar idea: isAdmin=${isAdmin}, userID=${req.user.id}, creadorIdea=${idea.createdBy}`);
      
      // Si el usuario no es admin y tampoco es el creador, no tiene permisos
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ message: "No tienes permisos para editar esta idea" });
      }
      
      const { title, description, clarification, category } = req.body;
      const updateData: Partial<typeof idea> = {};
      
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (clarification !== undefined) updateData.clarification = clarification;
      if (category !== undefined) updateData.category = category;
      
      const updatedIdea = await storage.updateIdea(ideaId, updateData);
      res.json(updatedIdea);
    } catch (error) {
      next(error);
    }
  });

  // Ruta para fusionar ideas con IA
  app.post("/api/projects/:projectId/merge-ideas", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const { idea1Id, idea2Id } = req.body;
      
      if (!idea1Id || !idea2Id) {
        return res.status(400).json({ message: "Both idea IDs are required" });
      }
      
      const idea1 = await storage.getIdea(parseInt(idea1Id));
      const idea2 = await storage.getIdea(parseInt(idea2Id));
      
      if (!idea1 || !idea2) {
        return res.status(404).json({ message: "One or both ideas not found" });
      }
      
      const projectId = parseInt(req.params.projectId);
      
      // Verify both ideas belong to the same project
      if (idea1.projectId !== projectId || idea2.projectId !== projectId) {
        return res.status(403).json({ message: "Ideas must belong to the specified project" });
      }
      
      console.log(`Fusionando ideas ${idea1Id} y ${idea2Id} con IA`);
      
      // Usar OpenAI para fusionar las ideas
      const mergedContent = await mergeIdeasWithAI(idea1, idea2);
      
      // Crear la nueva idea combinada
      const newIdea = await storage.createIdea({
        projectId,
        title: mergedContent.title || `${idea1.title} + ${idea2.title}`,
        description: mergedContent.description || `${idea1.description}\n\n${idea2.description}`,
        clarification: mergedContent.clarification || "",
        category: mergedContent.category || idea1.category,
        createdBy: req.user.id,
        positionX: idea1.positionX,
        positionY: idea1.positionY
      } as any);
      
      // Opcionalmente, eliminar las ideas originales
      // Esto se puede hacer si se pasa un parámetro deleteOriginals=true
      if (req.body.deleteOriginals) {
        await storage.deleteIdea(parseInt(idea1Id));
        await storage.deleteIdea(parseInt(idea2Id));
        console.log(`Ideas originales ${idea1Id} y ${idea2Id} eliminadas después de la fusión`);
      }
      
      res.status(201).json({
        mergedIdea: newIdea,
        originalIdeasDeleted: !!req.body.deleteOriginals
      });
    } catch (error) {
      console.error("Error al fusionar ideas:", error);
      console.error("API Key presente:", !!process.env.OPENAI_API_KEY);
      console.error("Detalles de la solicitud:", {
        projectId: req.params.projectId,
        idea1Id: req.body.idea1Id,
        idea2Id: req.body.idea2Id
      });
      
      // En caso de error, intentamos hacer una fusión básica como respaldo
      try {
        const idea1 = await storage.getIdea(parseInt(req.body.idea1Id));
        const idea2 = await storage.getIdea(parseInt(req.body.idea2Id));
        
        if (!idea1 || !idea2) {
          return res.status(404).json({ message: "One or both ideas not found" });
        }
        
        const projectId = parseInt(req.params.projectId);
        
        // Fusión inteligente: solo combina si ambos tienen contenido, sino usa el que existe
        const hasContent = (val: string | null | undefined) => !!(val && val.trim().length > 0);
        
        let mergedTitle: string;
        if (hasContent(idea1.title) && hasContent(idea2.title)) {
          mergedTitle = `${idea1.title} + ${idea2.title}`;
        } else {
          mergedTitle = hasContent(idea1.title) ? idea1.title : (hasContent(idea2.title) ? idea2.title : "");
        }
        
        let mergedDescription: string;
        if (hasContent(idea1.description) && hasContent(idea2.description)) {
          mergedDescription = `${idea1.description}\n\n${idea2.description}`;
        } else {
          mergedDescription = hasContent(idea1.description) ? idea1.description! : (hasContent(idea2.description) ? idea2.description! : "");
        }
        
        let mergedClarification: string;
        if (hasContent(idea1.clarification) && hasContent(idea2.clarification)) {
          mergedClarification = `${idea1.clarification}\n\n${idea2.clarification}`;
        } else {
          mergedClarification = hasContent(idea1.clarification) ? idea1.clarification! : (hasContent(idea2.clarification) ? idea2.clarification! : "");
        }
        
        const mergedCategory = hasContent(idea1.category) ? idea1.category : (hasContent(idea2.category) ? idea2.category : undefined);
        
        const simpleContent = {
          title: mergedTitle,
          description: mergedDescription,
          clarification: mergedClarification,
          category: mergedCategory
        };
        
        // Crear la nueva idea combinada
        const fallbackIdea = await storage.createIdea({
          projectId,
          title: simpleContent.title,
          description: simpleContent.description,
          clarification: simpleContent.clarification,
          category: simpleContent.category,
          createdBy: req.user.id,
          positionX: idea1.positionX,
          positionY: idea1.positionY
        } as any);
        
        return res.status(201).json({
          mergedIdea: fallbackIdea,
          originalIdeasDeleted: false,
          usedFallback: true
        });
      } catch (fallbackError) {
        console.error("Error en el fallback de fusión:", fallbackError);
        next(error);
      }
    }
  });
  
  app.delete("/api/ideas/:ideaId", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const ideaId = parseInt(req.params.ideaId);
      const idea = await storage.getIdea(ideaId);
      
      if (!idea) {
        return res.status(404).json({ message: "Idea not found" });
      }
      
      // Verificar permisos: Administradores pueden eliminar cualquier idea, usuarios regulares solo las propias
      const isAdmin = req.user.role === "admin";
      const isCreator = idea.createdBy === req.user.id;
      
      console.log(`Verificando permisos para eliminar idea: isAdmin=${isAdmin}, userID=${req.user.id}, creadorIdea=${idea.createdBy}`);
      
      // Si el usuario no es admin y tampoco es el creador, no tiene permisos
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ message: "No tienes permisos para eliminar esta idea" });
      }
      
      // Check if the idea is selected for VAXO process
      const selectedIdea = await storage.getSelectedIdea(ideaId, idea.projectId);
      if (selectedIdea) {
        return res.status(400).json({ 
          message: "Deselect the idea before attempting to delete it. Do this in the Selector tab." 
        });
      }
      
      // Eliminar la idea
      const success = await storage.deleteIdea(ideaId);
      
      if (success) {
        console.log(`Idea ${ideaId} eliminada por usuario ${req.user.id}`);
        res.status(200).json({ success: true });
      } else {
        console.error(`Error al eliminar idea ${ideaId}`);
        res.status(500).json({ message: "Error al eliminar la idea" });
      }
    } catch (error) {
      console.error('Error en DELETE /api/ideas/:ideaId:', error);
      next(error);
    }
  });

  app.patch("/api/projects/:projectId/ideas/:ideaId/position", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const ideaId = parseInt(req.params.ideaId);
      const { positionX, positionY } = req.body;
      
      if (!positionX || !positionY) {
        return res.status(400).json({ message: "Position X and Y are required" });
      }
      
      const idea = await storage.getIdea(ideaId);
      if (!idea) {
        return res.status(404).json({ message: "Idea not found" });
      }
      
      // Verify that idea belongs to the specified project
      if (idea.projectId !== projectId) {
        return res.status(403).json({ message: "Idea does not belong to this project" });
      }
      
      console.log(`Actualizando posición de idea ${ideaId} a X:${positionX}, Y:${positionY}`);
      const updatedIdea = await storage.updateIdeaPosition(ideaId, positionX, positionY);
      console.log(`Idea actualizada:`, updatedIdea);
      res.json(updatedIdea);
    } catch (error) {
      next(error);
    }
  });

  // Relationships routes
  app.get("/api/projects/:projectId/relationships", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const relationships = await storage.getProjectRelationships(projectId);
      res.json(relationships);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/relationships", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const projectId = parseInt(req.params.projectId);
      const { fromIdeaId, toIdeaId, relationType } = req.body;
      
      // Check for existing relationship between these two ideas (in either direction)
      const existingRelationships = await storage.getProjectRelationships(projectId);
      const existingRel = existingRelationships.find(
        r => (r.fromIdeaId === fromIdeaId && r.toIdeaId === toIdeaId) ||
             (r.fromIdeaId === toIdeaId && r.toIdeaId === fromIdeaId)
      );
      
      if (existingRel) {
        // Delete existing relationship before creating new one (upsert behavior)
        await storage.deleteRelationship(existingRel.id);
        console.log(`Deleted existing relationship ${existingRel.id} for upsert`);
      }
      
      const relationshipData = insertRelationshipSchema.parse({
        ...req.body,
        projectId,
        createdBy: req.user.id
      });
      
      const relationship = await storage.createRelationship(relationshipData);
      res.status(201).json(relationship);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/relationships/:relationshipId", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const relationshipId = parseInt(req.params.relationshipId);
      const deleted = await storage.deleteRelationship(relationshipId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Relationship not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Delete all relationships for a project (admin only)
  app.delete("/api/projects/:projectId/relationships", isProjectAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const deletedCount = await storage.deleteAllProjectRelationships(projectId);
      
      console.log(`Deleted ${deletedCount} relationships for project ${projectId}`);
      res.json({ deletedCount });
    } catch (error) {
      next(error);
    }
  });
  
  // Endpoint para obtener usuarios (solo para administradores)
  // Los administradores solo ven los usuarios que ellos crearon y los usuarios auto-registrados
  app.get("/api/users", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      // Obtener:
      // 1. A sí mismo (el admin que hace la consulta)
      // 2. Los usuarios que este admin creó 
      // 3. Los usuarios auto-registrados (createdBy es null), pero solo los que no son admin
      const visibleUsers = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        createdBy: users.createdBy,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        or(
          // El admin actual puede verse a sí mismo
          eq(users.id, req.user.id),
          
          // El admin actual puede ver los usuarios que él creó
          eq(users.createdBy, req.user.id),
          
          // El admin actual puede ver usuarios auto-registrados QUE NO SEAN ADMIN
          and(
            isNull(users.createdBy),
            eq(users.role, 'user')  // Solo usuarios regulares, no otros admins
          )
        )
      );
      
      res.json(visibleUsers);
    } catch (error) {
      next(error);
    }
  });
  
  app.patch("/api/users/:userId/role", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const userId = parseInt(req.params.userId);
      const { role } = req.body;
      
      if (!role || (role !== 'admin' && role !== 'user')) {
        return res.status(400).json({ message: "Invalid role. Role must be 'admin' or 'user'." });
      }
      
      // Verificar que el usuario a modificar fue creado por este admin o es uno auto-registrado
      const userToUpdate = await db.select({
        id: users.id,
        role: users.role,
        createdBy: users.createdBy
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
      
      if (userToUpdate.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verificar que el admin actual tenga permisos para modificar este usuario
      if (userToUpdate[0].createdBy !== null && userToUpdate[0].createdBy !== req.user.id) {
        return res.status(403).json({ message: "You don't have permission to modify this user" });
      }
      
      // No permitir que un admin cambie el rol de otro admin (que no haya creado)
      if (userToUpdate[0].role === 'admin' && userToUpdate[0].id !== req.user.id && userToUpdate[0].createdBy !== req.user.id) {
        return res.status(403).json({ message: "You don't have permission to modify this administrator's role" });
      }
      
      const updatedUser = await storage.updateUserRole(userId, role);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Eliminar la contraseña de la respuesta
      const { password: _, ...userWithoutPassword } = updatedUser;
      
      res.json({ 
        message: `User role updated successfully to ${role}`,
        user: userWithoutPassword
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Endpoint para eliminar un usuario
  app.delete("/api/users/:userId", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const userId = parseInt(req.params.userId);
      
      // Verificar que el usuario a eliminar fue creado por el admin actual o es uno auto-registrado
      const userToDelete = await db.select({
        id: users.id,
        role: users.role,
        createdBy: users.createdBy
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
      
      if (userToDelete.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verificar que el admin actual tenga permisos para eliminar este usuario
      if (userToDelete[0].createdBy !== null && userToDelete[0].createdBy !== req.user.id) {
        return res.status(403).json({ message: "You don't have permission to delete this user" });
      }
      
      // Prevenir la auto-eliminación
      if (userId === req.user.id) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }
      
      const isAdmin = userToDelete[0].role === 'admin';
      const deleted = await storage.deleteUser(userId);
      
      if (!deleted) {
        return res.status(404).json({ message: "User not found or could not be deleted" });
      }
      
      if (isAdmin) {
        res.json({ 
          message: "Administrador eliminado correctamente junto con todos sus usuarios y proyectos asociados. Esta acción ha eliminado en cascada todos los datos relacionados.", 
          deletedType: "admin"
        });
      } else {
        res.json({ 
          message: "Usuario eliminado correctamente",
          deletedType: "user"
        });
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      next(error);
    }
  });

  // Endpoint para obtener las categorías disponibles
  app.get("/api/categories", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Retornar categorías predefinidas del sistema
      res.json(AVAILABLE_CATEGORIES);
    } catch (error) {
      next(error);
    }
  });

  // Endpoint para obtener categorías específicas de un proyecto
  app.get("/api/projects/:projectId/categories", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Obtener las categorías del proyecto desde la base de datos
      const categories = await storage.getProjectCategories(projectId);
      res.json(categories);
    } catch (error) {
      next(error);
    }
  });
  
  // Endpoint para crear una nueva categoría en un proyecto
  app.post("/api/projects/:projectId/categories", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const projectId = parseInt(req.params.projectId);
      
      const categoryData = insertCategorySchema.parse({
        ...req.body,
        projectId,
        createdBy: req.user.id
      });
      
      const category = await storage.createCategory(categoryData);
      res.status(201).json(category);
    } catch (error) {
      next(error);
    }
  });
  
  // Endpoint para actualizar una categoría existente
  app.patch("/api/projects/:projectId/categories/:categoryId", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categoryId = parseInt(req.params.categoryId);
      const projectId = parseInt(req.params.projectId);
      
      const category = await storage.getCategory(categoryId);
      
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
      
      // Verificar que la categoría pertenezca al proyecto especificado
      if (category.projectId !== projectId) {
        return res.status(403).json({ message: "Category does not belong to this project" });
      }
      
      const { name, description, color } = req.body;
      const updateData: Partial<typeof category> = {};
      
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (color !== undefined) updateData.color = color;
      
      const updatedCategory = await storage.updateCategory(categoryId, updateData);
      
      // If the name was updated, also update all ideas with this category
      if (name && name !== category.name) {
        console.log(`Category name changed from ${category.name} to ${name}, updating all ideas with this category.`);
        
        // Get all ideas that use this category
        const projectIdeas = await storage.getProjectIdeas(projectId);
        
        // Filter ideas with the old category name
        const ideasToUpdate = projectIdeas.filter(idea => idea.category === category.name);
        
        // Update each idea with the new category name
        for (const idea of ideasToUpdate) {
          await storage.updateIdea(idea.id, { category: name });
        }
        
        console.log(`Updated ${ideasToUpdate.length} ideas with the new category name.`);
      }
      
      res.json(updatedCategory);
    } catch (error) {
      next(error);
    }
  });
  
  // Endpoint para eliminar una categoría
  app.delete("/api/projects/:projectId/categories/:categoryId", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const categoryId = parseInt(req.params.categoryId);
      console.log(`Intentando eliminar categoría con ID: ${categoryId}`);
      
      // Verificar que la categoría exista
      const category = await storage.getCategory(categoryId);
      if (!category) {
        console.log(`Categoría con ID ${categoryId} no encontrada`);
        return res.status(404).json({ message: "Category not found" });
      }
      
      // Verificar que la categoría pertenezca al proyecto especificado
      if (category.projectId !== parseInt(req.params.projectId)) {
        console.log(`La categoría ${categoryId} no pertenece al proyecto ${req.params.projectId}`);
        return res.status(403).json({ message: "Category does not belong to this project" });
      }
      
      // Intentar eliminar la categoría
      const deleted = await storage.deleteCategory(categoryId);
      
      console.log(`Resultado de eliminar categoría ${categoryId}: ${deleted ? 'Eliminado' : 'No eliminado'}`);
      
      if (!deleted) {
        return res.status(400).json({ message: "Category is in use by ideas and cannot be deleted" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error(`Error al eliminar categoría: ${error}`);
      next(error);
    }
  });

  // Rutas para la funcionalidad de votación
  
  // Obtener votos de ideas para un proyecto
  app.get("/api/projects/:projectId/votes", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const votes = await storage.getProjectIdeaVotes(projectId);
      res.json(votes);
    } catch (error) {
      next(error);
    }
  });
  
  // Obtener votos de un usuario en un proyecto
  app.get("/api/projects/:projectId/user-votes", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user?.id as number;
      const votes = await storage.getUserVotes(userId, projectId);
      res.json(votes);
    } catch (error) {
      next(error);
    }
  });
  
  // Obtener límite de votación para un proyecto
  app.get("/api/projects/:projectId/voting-limit", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Get all ideas for the project to calculate the limit
      const ideas = await storage.getProjectIdeas(projectId);
      
      // Voting limit calculation: 1/3 + 1 of total ideas
      const limit = Math.ceil(ideas.length / 3) + 1;
      
      res.json({ limit });
    } catch (error) {
      next(error);
    }
  });
  
  // Votar por una idea (toggle)
  app.post("/api/ideas/:ideaId/vote", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ideaId = parseInt(req.params.ideaId);
      const userId = req.user?.id as number;
      
      // Obtener la idea para verificar que existe
      const idea = await storage.getIdea(ideaId);
      if (!idea) {
        return res.status(404).json({ message: "Idea not found" });
      }
      
      // Verificar que el usuario tiene acceso al proyecto
      const projectId = idea.projectId;
      const userRole = await storage.getUserProjectRole(userId, projectId);
      if (!userRole) {
        return res.status(403).json({ message: "You don't have access to this project" });
      }
      
      // Obtener los votos actuales del usuario en el proyecto
      const userVotes = await storage.getUserVotes(userId, projectId);
      
      // Verificar si ya se votó por esta idea
      const existingVote = userVotes.find(vote => vote.ideaId === ideaId);
      
      // Si no hay voto existente, verificar si no excede el límite
      if (!existingVote) {
        // Get all ideas for the project to calculate the limit
        const ideas = await storage.getProjectIdeas(projectId);
        
        // Voting limit calculation: 1/3 + 1 of total ideas
        const votingLimit = Math.ceil(ideas.length / 3) + 1;
        
        // Si ya alcanzó el límite, no permitir más votos
        if (userVotes.length >= votingLimit) {
          return res.status(400).json({ 
            message: `You've reached the voting limit (${votingLimit}) for this project`,
            currentVotes: userVotes.length,
            limit: votingLimit
          });
        }
      }
      
      // Crear/eliminar el voto
      const voteResult = await storage.toggleIdeaVote({
        userId,
        ideaId,
        projectId,
        createdAt: new Date()
      });
      
      // Responder con el resultado
      if (voteResult) {
        // El voto fue creado
        res.status(201).json({
          message: "Vote added successfully",
          vote: voteResult
        });
      } else {
        // El voto fue eliminado
        res.status(200).json({
          message: "Vote removed successfully"
        });
      }
    } catch (error) {
      next(error);
    }
  });
  
  // Obtener conteo de votos para una idea
  app.get("/api/ideas/:ideaId/votes/count", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ideaId = parseInt(req.params.ideaId);
      const count = await storage.countIdeaVotes(ideaId);
      res.json({ count });
    } catch (error) {
      next(error);
    }
  });

  // Get all selected ideas for a project
  app.get("/api/projects/:projectId/selected-ideas", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const selectedIdeas = await storage.getProjectSelectedIdeas(projectId);
      res.json(selectedIdeas);
    } catch (error) {
      next(error);
    }
  });

  // Toggle idea selection (select/deselect)
  app.post("/api/ideas/:ideaId/select", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ideaId = parseInt(req.params.ideaId);
      const userId = req.user!.id;
      const { projectId } = req.body;
      
      console.log(`[SELECT IDEA] Starting process with ideaId=${ideaId}, userId=${userId}, projectId=${projectId}`);
      console.log(`[SELECT IDEA] Full request body:`, req.body);
      
      if (!projectId) {
        console.log(`[SELECT IDEA] Missing projectId in request body`);
        return res.status(400).json({ error: "Project ID is required" });
      }
      
      // Verify user has admin access to the project
      const userRole = await storage.getUserProjectRole(userId, projectId);
      console.log(`[SELECT IDEA] User role check: userRole=${userRole}, isGlobalAdmin=${req.user!.role === 'admin'}`);
      
      if (!userRole || (userRole !== 'admin' && req.user!.role !== 'admin')) {
        console.log(`[SELECT IDEA] Permission denied: User does not have admin access`);
        return res.status(403).json({ 
          error: "Only administrators can select ideas for the connection process" 
        });
      }
      
      // Get the idea to verify it exists and belongs to the project
      const idea = await storage.getIdea(ideaId);
      console.log(`[SELECT IDEA] Idea check: idea exists=${!!idea}, belongs to project=${idea?.projectId === projectId}`);
      
      if (!idea || idea.projectId !== projectId) {
        console.log(`[SELECT IDEA] Idea not found or does not belong to project`);
        return res.status(404).json({ error: "Idea not found in the specified project" });
      }
      
      console.log(`[SELECT IDEA] Attempting to toggle idea selection with data:`, {
        ideaId,
        projectId,
        selectedBy: userId
      });
      
      // Toggle the idea selection
      try {
        const toggleData = {
          ideaId,
          projectId,
          selectedBy: userId
        };
        console.log(`[SELECT IDEA] Calling storage.toggleSelectedIdea with:`, JSON.stringify(toggleData));
        
        const selectionResult = await storage.toggleSelectedIdea(toggleData);
        
        console.log(`[SELECT IDEA] Toggle result:`, selectionResult);
        
        if (selectionResult) {
          // Idea was selected
          res.status(201).json({
            message: "Idea selected successfully",
            selectedIdea: selectionResult
          });
        } else {
          // Idea was deselected
          res.status(200).json({
            message: "Idea deselected successfully"
          });
        }
      } catch (toggleError) {
        console.error(`[SELECT IDEA] Error in toggle operation:`, toggleError);
        throw toggleError;
      }
    } catch (error) {
      console.error(`[SELECT IDEA] Unhandled error:`, error);
      next(error);
    }
  });

  // Clear all selected ideas for a project
  app.delete("/api/projects/:projectId/selected-ideas", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      
      // Verify user has admin access to the project
      const userRole = await storage.getUserProjectRole(userId, projectId);
      if (!userRole || (userRole !== 'admin' && req.user!.role !== 'admin')) {
        return res.status(403).json({ 
          error: "Only administrators can clear selected ideas" 
        });
      }
      
      const result = await storage.clearProjectSelectedIdeas(projectId);
      res.json({ success: result });
    } catch (error) {
      next(error);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
