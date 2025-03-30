import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { randomBytes } from "crypto";
import { db } from "./db";
import { eq, or, isNull } from "drizzle-orm";
import { 
  insertProjectSchema, 
  insertIdeaSchema, 
  insertRelationshipSchema, 
  User,
  users
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
  if (req.isAuthenticated()) {
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

    // Check if user has access to this specific project
    const role = await storage.getUserProjectRole(req.user.id, projectId);
    if (!role) {
      return res.status(403).json({ message: "You don't have access to this project" });
    }

    // Add the role to the request for further checks if needed
    req.projectRole = role;
    next();
  } catch (error) {
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
      });
      
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
      });
      
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

  app.patch("/api/ideas/:ideaId", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      const ideaId = parseInt(req.params.ideaId);
      const idea = await storage.getIdea(ideaId);
      
      if (!idea) {
        return res.status(404).json({ message: "Idea not found" });
      }
      
      // Only allow update if user is admin or created the idea
      const isProjectAdmin = req.projectRole === "admin";
      if (!isProjectAdmin && idea.createdBy !== req.user.id) {
        return res.status(403).json({ message: "You can only edit your own ideas unless you're a project admin" });
      }
      
      const { title, description, category } = req.body;
      const updateData: Partial<typeof idea> = {};
      
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (category !== undefined) updateData.category = category;
      
      const updatedIdea = await storage.updateIdea(ideaId, updateData);
      res.json(updatedIdea);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/ideas/:ideaId/position", hasProjectAccess, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ideaId = parseInt(req.params.ideaId);
      const { positionX, positionY } = req.body;
      
      if (!positionX || !positionY) {
        return res.status(400).json({ message: "Position X and Y are required" });
      }
      
      const idea = await storage.getIdea(ideaId);
      if (!idea) {
        return res.status(404).json({ message: "Idea not found" });
      }
      
      const updatedIdea = await storage.updateIdeaPosition(ideaId, positionX, positionY);
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
  
  // Endpoint para obtener usuarios (solo para administradores)
  // Los administradores solo ven los usuarios que ellos crearon y los usuarios auto-registrados
  app.get("/api/users", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      // Obtener usuarios que este admin creó o usuarios auto-registrados (createdBy es null)
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
          eq(users.createdBy, req.user.id),
          isNull(users.createdBy)
        )
      );
      
      res.json(visibleUsers);
    } catch (error) {
      next(error);
    }
  });
  
  app.patch("/api/users/:userId/role", isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.userId);
      const { role } = req.body;
      
      if (!role || (role !== 'admin' && role !== 'user')) {
        return res.status(400).json({ message: "Invalid role. Role must be 'admin' or 'user'." });
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

  const httpServer = createServer(app);
  return httpServer;
}
