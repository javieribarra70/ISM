import {
  users, ideas, projects, projectUsers, relationships, invitations, categories, ideaVotes, selectedIdeas,
  type User, type Idea, type Project, type ProjectUser, type Relationship, type Invitation, type Category, type IdeaVote, type SelectedIdea,
  type InsertUser, type InsertIdea, type InsertProject, type InsertProjectUser, 
  type InsertRelationship, type InsertInvitation, type InsertCategory, type InsertIdeaVote, type InsertSelectedIdea
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import { randomBytes } from "crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, and } from "drizzle-orm";
import connectPgSimple from "connect-pg-simple";
import postgres from 'postgres';

// Database setup - using postgres package for better compatibility
const connectionString = process.env.DATABASE_URL;
const sql = postgres(connectionString as string, { 
  ssl: 'require',
  connect_timeout: 10,
  idle_timeout: 30
});
const db = drizzle(sql);

// PostgreSQL session store
const PostgresSessionStore = connectPgSimple(session);

// Create memory store for sessions as fallback
const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserRole(userId: number, role: string): Promise<User | undefined>;
  deleteUser(userId: number): Promise<boolean>;
  getUserProjects(userId: number): Promise<Project[]>;

  // Project operations
  getProject(id: number): Promise<Project | undefined>;
  getProjectUsers(projectId: number): Promise<(ProjectUser & { user: User })[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, project: Partial<InsertProject>): Promise<Project | undefined>;
  addUserToProject(projectUser: InsertProjectUser): Promise<ProjectUser>;
  getUserProjectRole(userId: number, projectId: number): Promise<string | undefined>;

  // Category operations
  getProjectCategories(projectId: number): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, category: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: number): Promise<boolean>;

  // Idea operations
  getProjectIdeas(projectId: number): Promise<Idea[]>;
  getIdea(id: number): Promise<Idea | undefined>;
  createIdea(idea: InsertIdea): Promise<Idea>;
  updateIdea(id: number, idea: Partial<InsertIdea>): Promise<Idea | undefined>;
  updateIdeaPosition(id: number, positionX: string, positionY: string): Promise<Idea | undefined>;
  deleteIdea(id: number): Promise<boolean>;

  // Relationship operations
  getProjectRelationships(projectId: number): Promise<Relationship[]>;
  createRelationship(relationship: InsertRelationship): Promise<Relationship>;
  deleteRelationship(id: number): Promise<boolean>;

  // Invitation operations
  createInvitation(invitation: InsertInvitation): Promise<Invitation>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  markInvitationAsUsed(id: number): Promise<Invitation | undefined>;
  
  // Idea vote operations
  getProjectIdeaVotes(projectId: number): Promise<(IdeaVote & { user: User })[]>;
  getIdeaVotes(ideaId: number): Promise<IdeaVote[]>;
  getUserVotes(userId: number, projectId: number): Promise<IdeaVote[]>;
  toggleIdeaVote(vote: InsertIdeaVote): Promise<IdeaVote | undefined>;
  countIdeaVotes(ideaId: number): Promise<number>;
  getVotingLimitForProject(projectId: number): Promise<number>;
  
  // Selected ideas for connection process
  getProjectSelectedIdeas(projectId: number): Promise<SelectedIdea[]>;
  getSelectedIdea(ideaId: number, projectId: number): Promise<SelectedIdea | undefined>;
  toggleSelectedIdea(selectedIdea: InsertSelectedIdea): Promise<SelectedIdea | undefined>;
  clearProjectSelectedIdeas(projectId: number): Promise<boolean>;

  // Session store
  sessionStore: any; // Using any to avoid type issues with session.SessionStore
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private projects: Map<number, Project>;
  private projectUsers: Map<number, ProjectUser>;
  private categories: Map<number, Category>;
  private ideas: Map<number, Idea>;
  private relationships: Map<number, Relationship>;
  private invitations: Map<number, Invitation>;
  private ideaVotes: Map<string, IdeaVote>;
  private selectedIdeas: Map<string, SelectedIdea>;
  
  sessionStore: any; // Using any type for session store
  
  private currentUserId: number;
  private currentProjectId: number;
  private currentProjectUserId: number;
  private currentCategoryId: number;
  private currentIdeaId: number;
  private currentRelationshipId: number;
  private currentInvitationId: number;

  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.projectUsers = new Map();
    this.categories = new Map();
    this.ideas = new Map();
    this.relationships = new Map();
    this.invitations = new Map();
    this.ideaVotes = new Map();
    this.selectedIdeas = new Map();
    
    this.currentUserId = 1;
    this.currentProjectId = 1;
    this.currentProjectUserId = 1;
    this.currentCategoryId = 1;
    this.currentIdeaId = 1;
    this.currentRelationshipId = 1;
    this.currentInvitationId = 1;
    
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // 24 hours
    });
    
    // Create a demo user for testing purposes
    this.createDemoUser();
  }
  
  private createDemoUser() {
    // Using a special marker password that will be recognized in comparePasswords
    const demoUser = {
      id: 1,
      username: "demo",
      password: "demo-password", // Special marker recognized in comparePasswords
      email: "demo@example.com",
      role: "admin"
    };
    
    this.users.set(demoUser.id, demoUser);
    this.currentUserId = 2; // Next user ID would be 2
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async updateUserRole(userId: number, role: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;

    // Validar que el rol sea válido
    const validRole = role === 'admin' || role === 'user' ? role : user.role;
    
    // Actualizar el rol del usuario
    const updatedUser: User = { ...user, role: validRole };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }
  
  async deleteUser(userId: number): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;
    
    // Eliminar el usuario
    const result = this.users.delete(userId);
    
    // En una aplicación real aquí deberíamos hacer cleanup de objetos relacionados
    // por ejemplo, eliminar todas las ideas creadas por el usuario, etc.
    
    return result;
  }

  async getUserProjects(userId: number): Promise<Project[]> {
    // Find all projectUsers entries for this user
    const userProjectIds = Array.from(this.projectUsers.values())
      .filter(pu => pu.userId === userId)
      .map(pu => pu.projectId);
    
    // Get the projects
    return Array.from(this.projects.values())
      .filter(project => userProjectIds.includes(project.id));
  }

  // Project operations
  async getProject(id: number): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getProjectUsers(projectId: number): Promise<(ProjectUser & { user: User })[]> {
    const projectUserEntries = Array.from(this.projectUsers.values())
      .filter(pu => pu.projectId === projectId);
    
    return projectUserEntries.map(pu => {
      const user = this.users.get(pu.userId);
      if (!user) throw new Error(`User not found: ${pu.userId}`);
      return { ...pu, user };
    });
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = this.currentProjectId++;
    const now = new Date();
    const project: Project = { 
      ...insertProject, 
      id,
      createdAt: now
    };
    this.projects.set(id, project);
    
    // Also add the creator as a project admin
    await this.addUserToProject({
      projectId: id,
      userId: insertProject.createdBy,
      role: "admin"
    });
    
    return project;
  }
  
  async updateProject(id: number, projectUpdate: Partial<InsertProject>): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    
    const updatedProject: Project = { 
      ...project, 
      ...projectUpdate
    };
    
    this.projects.set(id, updatedProject);
    return updatedProject;
  }

  async addUserToProject(insertProjectUser: InsertProjectUser): Promise<ProjectUser> {
    const id = this.currentProjectUserId++;
    const projectUser: ProjectUser = { ...insertProjectUser, id };
    this.projectUsers.set(id, projectUser);
    return projectUser;
  }

  async getUserProjectRole(userId: number, projectId: number): Promise<string | undefined> {
    const projectUser = Array.from(this.projectUsers.values()).find(
      pu => pu.userId === userId && pu.projectId === projectId
    );
    return projectUser?.role;
  }

  // Category operations
  async getProjectCategories(projectId: number): Promise<Category[]> {
    return Array.from(this.categories.values())
      .filter(category => category.projectId === projectId);
  }

  async getCategory(id: number): Promise<Category | undefined> {
    return this.categories.get(id);
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const id = this.currentCategoryId++;
    const now = new Date();
    const category: Category = { 
      ...insertCategory, 
      id,
      createdAt: now
    };
    this.categories.set(id, category);
    return category;
  }

  async updateCategory(id: number, categoryUpdate: Partial<InsertCategory>): Promise<Category | undefined> {
    const category = this.categories.get(id);
    if (!category) return undefined;
    
    const updatedCategory: Category = { 
      ...category, 
      ...categoryUpdate
    };
    
    this.categories.set(id, updatedCategory);
    return updatedCategory;
  }

  async deleteCategory(id: number): Promise<boolean> {
    // Obtener la categoría
    const category = this.categories.get(id);
    if (!category) return false;
    
    // Eliminar la categoría
    return this.categories.delete(id);
  }

  // Category operations
  async getProjectCategories(projectId: number): Promise<Category[]> {
    try {
      const result = await db.select()
        .from(categories)
        .where(eq(categories.projectId, projectId));
      return result;
    } catch (error) {
      console.error('Error getting project categories:', error);
      throw error;
    }
  }

  async getCategory(id: number): Promise<Category | undefined> {
    try {
      const result = await db.select()
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);
      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      console.error('Error getting category:', error);
      throw error;
    }
  }

  async createCategory(categoryData: InsertCategory): Promise<Category> {
    try {
      const result = await db.insert(categories)
        .values(categoryData)
        .returning();
      return result[0];
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }

  async updateCategory(id: number, categoryUpdate: Partial<InsertCategory>): Promise<Category | undefined> {
    try {
      const result = await db.update(categories)
        .set(categoryUpdate)
        .where(eq(categories.id, id))
        .returning();
      
      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }

  async deleteCategory(id: number): Promise<boolean> {
    try {
      // First check if there are ideas using this category
      const ideasResult = await db.select({ id: ideas.id })
        .from(ideas)
        .where(eq(ideas.categoryId, id))
        .limit(1);
      
      if (ideasResult.length > 0) {
        // Don't delete categories that are in use
        console.warn(`Category ${id} is in use by ideas and cannot be deleted`);
        return false;
      }
      
      const result = await db.delete(categories)
        .where(eq(categories.id, id))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  }

  // Idea operations
  async getProjectIdeas(projectId: number): Promise<Idea[]> {
    return Array.from(this.ideas.values())
      .filter(idea => idea.projectId === projectId);
  }

  async getIdea(id: number): Promise<Idea | undefined> {
    return this.ideas.get(id);
  }

  async createIdea(insertIdea: InsertIdea): Promise<Idea> {
    const id = this.currentIdeaId++;
    const now = new Date();
    const idea: Idea = { 
      ...insertIdea, 
      id,
      createdAt: now,
      updatedAt: now
    };
    this.ideas.set(id, idea);
    return idea;
  }

  async updateIdea(id: number, ideaUpdate: Partial<InsertIdea>): Promise<Idea | undefined> {
    const idea = this.ideas.get(id);
    if (!idea) return undefined;
    
    const updatedIdea: Idea = { 
      ...idea, 
      ...ideaUpdate,
      updatedAt: new Date()
    };
    
    this.ideas.set(id, updatedIdea);
    return updatedIdea;
  }

  async updateIdeaPosition(id: number, positionX: string, positionY: string): Promise<Idea | undefined> {
    const idea = this.ideas.get(id);
    if (!idea) return undefined;
    
    const updatedIdea: Idea = { 
      ...idea, 
      positionX,
      positionY,
      updatedAt: new Date()
    };
    
    this.ideas.set(id, updatedIdea);
    return updatedIdea;
  }
  
  async deleteIdea(id: number): Promise<boolean> {
    // Verificar que la idea existe
    const idea = this.ideas.get(id);
    if (!idea) return false;
    
    // Eliminar primero las relaciones que involucran a esta idea
    // Esto es para mantener la integridad referencial
    const relationships = Array.from(this.relationships.values());
    
    // Identificar relaciones a eliminar
    const relationsToDelete = relationships.filter(
      rel => rel.fromIdeaId === id || rel.toIdeaId === id
    );
    
    // Eliminar cada relación
    for (const rel of relationsToDelete) {
      this.relationships.delete(rel.id);
    }
    
    // Finalmente eliminar la idea
    return this.ideas.delete(id);
  }

  // Relationship operations
  async getProjectRelationships(projectId: number): Promise<Relationship[]> {
    return Array.from(this.relationships.values())
      .filter(rel => rel.projectId === projectId);
  }

  async createRelationship(insertRelationship: InsertRelationship): Promise<Relationship> {
    const id = this.currentRelationshipId++;
    const relationship: Relationship = { ...insertRelationship, id };
    this.relationships.set(id, relationship);
    return relationship;
  }

  async deleteRelationship(id: number): Promise<boolean> {
    return this.relationships.delete(id);
  }

  // Invitation operations
  async createInvitation(insertInvitation: InsertInvitation): Promise<Invitation> {
    const id = this.currentInvitationId++;
    const invitation: Invitation = { 
      ...insertInvitation, 
      id,
      used: false,
      createdAt: new Date()
    };
    this.invitations.set(id, invitation);
    return invitation;
  }

  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    return Array.from(this.invitations.values()).find(
      invitation => invitation.token === token
    );
  }

  async markInvitationAsUsed(id: number): Promise<Invitation | undefined> {
    const invitation = this.invitations.get(id);
    if (!invitation) return undefined;
    
    const updatedInvitation: Invitation = { 
      ...invitation, 
      used: true
    };
    
    this.invitations.set(id, updatedInvitation);
    return updatedInvitation;
  }
  
  // Idea vote operations
  async getProjectIdeaVotes(projectId: number): Promise<(IdeaVote & { user: User })[]> {
    // Obtener todas las ideas del proyecto
    const projectIdeas = await this.getProjectIdeas(projectId);
    const ideaIds = projectIdeas.map(idea => idea.id);

    // Filtrar los votos que corresponden a ideas del proyecto
    const projectVotes = Array.from(this.ideaVotes.values())
      .filter(vote => ideaIds.includes(vote.ideaId));

    // Añadir información del usuario a cada voto
    return Promise.all(
      projectVotes.map(async vote => {
        const user = await this.getUser(vote.userId);
        if (!user) throw new Error(`User not found for vote: ${vote.userId}`);
        return { ...vote, user };
      })
    );
  }

  async getIdeaVotes(ideaId: number): Promise<IdeaVote[]> {
    return Array.from(this.ideaVotes.values())
      .filter(vote => vote.ideaId === ideaId);
  }

  async getUserVotes(userId: number, projectId: number): Promise<IdeaVote[]> {
    // Obtener todas las ideas del proyecto
    const projectIdeas = await this.getProjectIdeas(projectId);
    const ideaIds = projectIdeas.map(idea => idea.id);

    // Filtrar los votos del usuario para ideas de este proyecto
    return Array.from(this.ideaVotes.values())
      .filter(vote => vote.userId === userId && ideaIds.includes(vote.ideaId));
  }

  async toggleIdeaVote(voteData: InsertIdeaVote): Promise<IdeaVote | undefined> {
    // Generar una clave única para el voto (combinación de userId + ideaId)
    const voteKey = `${voteData.userId}-${voteData.ideaId}`;
    
    // Verificar si el voto ya existe
    const existingVote = this.ideaVotes.get(voteKey);
    
    if (existingVote) {
      // Si el voto ya existe, lo eliminamos
      this.ideaVotes.delete(voteKey);
      return undefined;
    } else {
      // Si el voto no existe, lo creamos
      const newVote: IdeaVote = {
        ...voteData,
        createdAt: new Date()
      };
      
      this.ideaVotes.set(voteKey, newVote);
      return newVote;
    }
  }

  async countIdeaVotes(ideaId: number): Promise<number> {
    return Array.from(this.ideaVotes.values())
      .filter(vote => vote.ideaId === ideaId)
      .length;
  }

  async getVotingLimitForProject(projectId: number): Promise<number> {
    // Contar la cantidad de ideas en el proyecto
    const ideas = await this.getProjectIdeas(projectId);
    const ideaCount = ideas.length;
    
    // La regla es "1/3 + 1" del total de ideas
    const votingLimit = Math.floor(ideaCount / 3) + 1;
    return votingLimit;
  }
  
  // Selected ideas for connection process
  async getProjectSelectedIdeas(projectId: number): Promise<SelectedIdea[]> {
    return Array.from(this.selectedIdeas.values())
      .filter(selected => selected.projectId === projectId);
  }
  
  async getSelectedIdea(ideaId: number, projectId: number): Promise<SelectedIdea | undefined> {
    const selectedKey = `${projectId}-${ideaId}`;
    return this.selectedIdeas.get(selectedKey);
  }
  
  async toggleSelectedIdea(selectedIdeaData: InsertSelectedIdea): Promise<SelectedIdea | undefined> {
    // Generar una clave única para la idea seleccionada (combinación de projectId + ideaId)
    const selectedKey = `${selectedIdeaData.projectId}-${selectedIdeaData.ideaId}`;
    
    // Verificar si la idea ya está seleccionada
    const existingSelectedIdea = this.selectedIdeas.get(selectedKey);
    
    if (existingSelectedIdea) {
      // Si la idea ya está seleccionada, la eliminamos
      this.selectedIdeas.delete(selectedKey);
      return undefined;
    } else {
      // Si la idea no está seleccionada, la agregamos
      const newSelectedIdea: SelectedIdea = {
        id: Date.now(), // Usamos timestamp como ID único
        ...selectedIdeaData,
        createdAt: new Date()
      };
      
      this.selectedIdeas.set(selectedKey, newSelectedIdea);
      return newSelectedIdea;
    }
  }
  
  async clearProjectSelectedIdeas(projectId: number): Promise<boolean> {
    // Obtener todas las ideas seleccionadas del proyecto
    const selectedIdeas = await this.getProjectSelectedIdeas(projectId);
    
    // Eliminar cada una de las ideas seleccionadas
    for (const selected of selectedIdeas) {
      const selectedKey = `${selected.projectId}-${selected.ideaId}`;
      this.selectedIdeas.delete(selectedKey);
    }
    
    return true;
  }
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  sessionStore: any; // Type workaround
  
  constructor() {
    try {
      // Set up the session store
      this.sessionStore = new PostgresSessionStore({
        conObject: {
          connectionString: connectionString,
          ssl: { rejectUnauthorized: false }
        },
        createTableIfMissing: true,
      });
      
      console.log('PostgreSQL session store initialized');
      
      // Run migrations
      this.initializeDatabase();
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }
  
  private async initializeDatabase() {
    try {
      // Create tables if they don't exist
      console.log('Running database migrations...');
      
      // This is just a basic check - in a production app, we would use drizzle-kit for migrations
      try {
        await db.select().from(users).limit(1);
        console.log('Users table exists');
      } catch (error) {
        console.log('Creating database schema...');
        // We need to execute each table creation as a separate SQL query
        // to avoid "cannot insert multiple commands into a prepared statement" error
        await sql`CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user'
        );`;
        
        await sql`CREATE TABLE IF NOT EXISTS projects (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_by INTEGER NOT NULL REFERENCES users(id),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`;
        
        await sql`CREATE TABLE IF NOT EXISTS project_users (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          user_id INTEGER NOT NULL REFERENCES users(id),
          role TEXT NOT NULL DEFAULT 'member',
          UNIQUE (project_id, user_id)
        );`;
        
        await sql`CREATE TABLE IF NOT EXISTS ideas (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          description TEXT,
          category TEXT NOT NULL,
          position_x TEXT DEFAULT '0',
          position_y TEXT DEFAULT '0',
          created_by INTEGER NOT NULL REFERENCES users(id),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`;
        
        await sql`CREATE TABLE IF NOT EXISTS relationships (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          from_idea_id INTEGER NOT NULL REFERENCES ideas(id),
          to_idea_id INTEGER NOT NULL REFERENCES ideas(id),
          created_by INTEGER NOT NULL REFERENCES users(id)
        );`;
        
        await sql`CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          name TEXT NOT NULL,
          description TEXT,
          color TEXT NOT NULL DEFAULT '#2196F3',
          created_by INTEGER NOT NULL REFERENCES users(id),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`;
        
        await sql`CREATE TABLE IF NOT EXISTS invitations (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          email TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member',
          token TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          used BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`;
        console.log('Database schema created successfully');
        
        // Create demo user
        const demoUserExists = await sql`SELECT * FROM users WHERE username = 'demo' LIMIT 1`;
        if (demoUserExists.length === 0) {
          console.log('Creating demo user...');
          await sql`
            INSERT INTO users (username, email, password, role)
            VALUES ('demo', 'demo@example.com', 'demo-password', 'admin')
          `;
          console.log('Demo user created successfully');
        }
      }
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }
  
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      console.error('Error getting user by username:', error);
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      console.error('Error getting user by email:', error);
      throw error;
    }
  }

  async createUser(userData: InsertUser): Promise<User> {
    try {
      const result = await db.insert(users).values(userData).returning();
      return result[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }
  
  async updateUserRole(userId: number, role: string): Promise<User | undefined> {
    try {
      // Validar que el rol sea válido
      const validRole = role === 'admin' || role === 'user' ? role : 'user';
      
      // Actualizar el rol del usuario en la base de datos
      const result = await db.update(users)
        .set({ role: validRole })
        .where(eq(users.id, userId))
        .returning();
      
      if (result.length === 0) {
        console.error(`No user found with ID ${userId}`);
        return undefined;
      }
      
      console.log(`User ${userId} role updated to ${validRole}`);
      return result[0];
    } catch (error) {
      console.error('Error updating user role:', error);
      throw error;
    }
  }
  
  async deleteUser(userId: number): Promise<boolean> {
    try {
      // Primero obtener datos del usuario para saber si es admin
      const userResult = await db.select({
        id: users.id,
        role: users.role
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
      
      if (userResult.length === 0) {
        return false;
      }
      
      const isAdmin = userResult[0].role === 'admin';
      
      // Si es un administrador, debemos:
      // 1. Eliminar todos los usuarios que creó
      // 2. Eliminar todos sus proyectos y datos relacionados
      if (isAdmin) {
        console.log(`Eliminando un administrador (ID: ${userId}), limpiando todos sus datos`);
        
        // 1. Identificar y eliminar todos los usuarios creados por este admin
        const createdUserIds = await db.select({ id: users.id })
          .from(users)
          .where(eq(users.createdBy, userId));
        
        // Para cada usuario creado, eliminarlo (limpiará sus propios project_users)
        for (const userObj of createdUserIds) {
          await this.deleteUser(userObj.id);
        }
        
        // 2. Identificar todos los proyectos creados por este admin
        const projectIds = await db.select({ id: projects.id })
          .from(projects)
          .where(eq(projects.createdBy, userId));
        
        // Para cada proyecto, eliminar todas sus dependencias
        for (const project of projectIds) {
          const projectId = project.id;
          
          // Eliminar relaciones
          await sql`DELETE FROM relationships WHERE project_id = ${projectId}`;
          
          // Eliminar ideas
          await sql`DELETE FROM ideas WHERE project_id = ${projectId}`;
          
          // Eliminar categorías
          await sql`DELETE FROM categories WHERE project_id = ${projectId}`;
          
          // Eliminar invitaciones
          await sql`DELETE FROM invitations WHERE project_id = ${projectId}`;
          
          // Eliminar project_users
          await sql`DELETE FROM project_users WHERE project_id = ${projectId}`;
          
          // Eliminar el proyecto
          await sql`DELETE FROM projects WHERE id = ${projectId}`;
        }
      } else {
        // Si es un usuario normal, solo eliminar sus project_users
        await sql`DELETE FROM project_users WHERE user_id = ${userId}`;
      }
      
      // Finalmente eliminar el usuario
      const result = await db.delete(users)
        .where(eq(users.id, userId))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  async getUserProjects(userId: number): Promise<Project[]> {
    try {
      // Find user's projects through the project_users join table
      const joinResult = await sql`
        SELECT p.* FROM projects p
        JOIN project_users pu ON p.id = pu.project_id
        WHERE pu.user_id = ${userId}
      `;
      
      return joinResult.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        createdBy: row.created_by,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('Error getting user projects:', error);
      throw error;
    }
  }

  // Project operations
  async getProject(id: number): Promise<Project | undefined> {
    try {
      const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      console.error('Error getting project:', error);
      throw error;
    }
  }

  async getProjectUsers(projectId: number): Promise<(ProjectUser & { user: User })[]> {
    try {
      const result = await sql`
        SELECT pu.*, u.* FROM project_users pu
        JOIN users u ON pu.user_id = u.id
        WHERE pu.project_id = ${projectId}
      `;
      
      return result.map(row => ({
        id: row.id,
        projectId: row.project_id,
        userId: row.user_id,
        role: row.role,
        user: {
          id: row.id,
          username: row.username,
          email: row.email,
          password: row.password,
          role: row.role
        }
      }));
    } catch (error) {
      console.error('Error getting project users:', error);
      throw error;
    }
  }

  async createProject(projectData: InsertProject): Promise<Project> {
    try {
      // Map createdBy to created_by for SQL insert
      const sqlInsert = await sql`
        INSERT INTO projects (name, description, created_by) 
        VALUES (${projectData.name}, ${projectData.description || null}, ${projectData.createdBy})
        RETURNING *
      `;
      
      const result = sqlInsert[0];
      const project = {
        id: result.id,
        name: result.name,
        description: result.description,
        createdBy: result.created_by,
        createdAt: result.created_at
      };
      
      // Also add the creator as a project admin
      await this.addUserToProject({
        projectId: project.id,
        userId: projectData.createdBy,
        role: "admin"
      });
      
      return project;
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  }

  async addUserToProject(projectUserData: InsertProjectUser): Promise<ProjectUser> {
    try {
      // Map projectId and userId to project_id and user_id for SQL insert
      const sqlInsert = await sql`
        INSERT INTO project_users (project_id, user_id, role)
        VALUES (${projectUserData.projectId}, ${projectUserData.userId}, ${projectUserData.role})
        RETURNING *
      `;
      
      const result = sqlInsert[0];
      return {
        id: result.id,
        projectId: result.project_id,
        userId: result.user_id,
        role: result.role
      };
    } catch (error) {
      console.error('Error adding user to project:', error);
      throw error;
    }
  }

  async getUserProjectRole(userId: number, projectId: number): Promise<string | undefined> {
    try {
      const result = await sql`
        SELECT role FROM project_users
        WHERE user_id = ${userId} AND project_id = ${projectId}
        LIMIT 1
      `;
      
      return result.length > 0 ? result[0].role : undefined;
    } catch (error) {
      console.error('Error getting user project role:', error);
      throw error;
    }
  }

  // Category operations
  async getProjectCategories(projectId: number): Promise<Category[]> {
    try {
      const result = await db.select()
        .from(categories)
        .where(eq(categories.projectId, projectId));
      return result;
    } catch (error) {
      console.error('Error getting project categories:', error);
      throw error;
    }
  }

  async getCategory(id: number): Promise<Category | undefined> {
    try {
      const result = await db.select()
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);
      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      console.error('Error getting category:', error);
      throw error;
    }
  }

  async createCategory(categoryData: InsertCategory): Promise<Category> {
    try {
      const result = await db.insert(categories)
        .values(categoryData)
        .returning();
      return result[0];
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }

  async updateCategory(id: number, categoryUpdate: Partial<InsertCategory>): Promise<Category | undefined> {
    try {
      const result = await db.update(categories)
        .set(categoryUpdate)
        .where(eq(categories.id, id))
        .returning();
      
      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }

  async deleteCategory(id: number): Promise<boolean> {
    try {
      console.log(`Intentando eliminar categoría con ID: ${id}`);
      
      // Eliminar la categoría directamente sin verificar las ideas que la usan
      // Esto es seguro porque categoryId es una referencia opcional en las ideas
      const result = await db.delete(categories)
        .where(eq(categories.id, id))
        .returning();
      
      const deleted = result.length > 0;
      console.log(`Resultado de la eliminación de categoría: ${deleted ? 'Exitoso' : 'Fallido'}`);
      
      return deleted;
    } catch (error) {
      console.error('Error eliminando categoría:', error);
      throw error;
    }
  }

  // Idea operations - implementations will follow the same pattern
  async getProjectIdeas(projectId: number): Promise<Idea[]> {
    try {
      const result = await sql`
        SELECT * FROM ideas
        WHERE project_id = ${projectId}
      `;
      
      return result.map(row => ({
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        description: row.description,
        clarification: row.clarification,
        category: row.category,
        positionX: row.position_x,
        positionY: row.position_y,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('Error getting project ideas:', error);
      throw error;
    }
  }

  async getIdea(id: number): Promise<Idea | undefined> {
    try {
      const result = await sql`
        SELECT * FROM ideas
        WHERE id = ${id}
        LIMIT 1
      `;
      
      if (result.length === 0) return undefined;
      
      const row = result[0];
      return {
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        description: row.description,
        clarification: row.clarification,
        category: row.category,
        positionX: row.position_x,
        positionY: row.position_y,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Error getting idea:', error);
      throw error;
    }
  }
  
  // Implementation of remaining methods
  async createIdea(ideaData: InsertIdea): Promise<Idea> {
    try {
      const sqlInsert = await sql`
        INSERT INTO ideas (project_id, title, description, clarification, category, created_by, position_x, position_y)
        VALUES (
          ${ideaData.projectId}, 
          ${ideaData.title}, 
          ${ideaData.description || null}, 
          ${ideaData.clarification || null},
          ${ideaData.category},
          ${ideaData.createdBy},
          ${ideaData.positionX || '0'}, 
          ${ideaData.positionY || '0'}
        )
        RETURNING *
      `;
      
      const result = sqlInsert[0];
      return {
        id: result.id,
        projectId: result.project_id,
        title: result.title,
        description: result.description,
        clarification: result.clarification,
        category: result.category,
        createdBy: result.created_by,
        positionX: result.position_x,
        positionY: result.position_y,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };
    } catch (error) {
      console.error('Error creating idea:', error);
      throw error;
    }
  }
  
  async updateIdea(id: number, ideaUpdate: Partial<InsertIdea>): Promise<Idea | undefined> {
    try {
      // Create a dynamic SET clause based on provided fields
      let setClauses = [];
      let params = [];
      
      if (ideaUpdate.title !== undefined) {
        setClauses.push('title = $' + (params.length + 1));
        params.push(ideaUpdate.title);
      }
      
      if (ideaUpdate.description !== undefined) {
        setClauses.push('description = $' + (params.length + 1));
        params.push(ideaUpdate.description);
      }
      
      if (ideaUpdate.clarification !== undefined) {
        setClauses.push('clarification = $' + (params.length + 1));
        params.push(ideaUpdate.clarification);
      }
      
      if (ideaUpdate.category !== undefined) {
        setClauses.push('category = $' + (params.length + 1));
        params.push(ideaUpdate.category);
      }
      
      // Add updated_at timestamp
      setClauses.push('updated_at = CURRENT_TIMESTAMP');
      
      if (setClauses.length === 0) {
        return this.getIdea(id); // Nothing to update
      }
      
      // Execute the update
      const query = `
        UPDATE ideas 
        SET ${setClauses.join(', ')} 
        WHERE id = $${params.length + 1}
        RETURNING *
      `;
      
      params.push(id);
      const result = await sql.unsafe(query, params);
      
      if (result.length === 0) {
        return undefined;
      }
      
      const updatedIdea = result[0];
      return {
        id: updatedIdea.id,
        projectId: updatedIdea.project_id,
        title: updatedIdea.title,
        description: updatedIdea.description,
        clarification: updatedIdea.clarification,
        category: updatedIdea.category,
        createdBy: updatedIdea.created_by,
        positionX: updatedIdea.position_x,
        positionY: updatedIdea.position_y,
        createdAt: updatedIdea.created_at,
        updatedAt: updatedIdea.updated_at
      };
    } catch (error) {
      console.error('Error updating idea:', error);
      throw error;
    }
  }
  
  async updateIdeaPosition(id: number, positionX: string, positionY: string): Promise<Idea | undefined> {
    try {
      const result = await sql`
        UPDATE ideas
        SET position_x = ${positionX}, position_y = ${positionY}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `;
      
      if (result.length === 0) {
        return undefined;
      }
      
      const updatedIdea = result[0];
      return {
        id: updatedIdea.id,
        projectId: updatedIdea.project_id,
        title: updatedIdea.title,
        description: updatedIdea.description,
        clarification: updatedIdea.clarification,
        category: updatedIdea.category,
        createdBy: updatedIdea.created_by,
        positionX: updatedIdea.position_x,
        positionY: updatedIdea.position_y,
        createdAt: updatedIdea.created_at,
        updatedAt: updatedIdea.updated_at
      };
    } catch (error) {
      console.error('Error updating idea position:', error);
      throw error;
    }
  }
  
  async deleteIdea(id: number): Promise<boolean> {
    try {
      // Verificar primero que la idea existe
      const idea = await this.getIdea(id);
      if (!idea) {
        console.log(`Idea con ID ${id} no encontrada para eliminar`);
        return false;
      }
      
      console.log(`Eliminando idea con ID ${id}`);
      
      // Primero eliminar cualquier relación asociada a esta idea
      // Esto es para mantener la integridad referencial
      await sql`
        DELETE FROM relationships
        WHERE from_idea_id = ${id} OR to_idea_id = ${id}
      `;
      
      // Luego eliminar la idea
      const result = await sql`
        DELETE FROM ideas
        WHERE id = ${id}
        RETURNING id
      `;
      
      const success = result.length > 0;
      console.log(`Resultado de eliminar idea: ${success ? 'Exitoso' : 'Fallido'}`);
      return success;
    } catch (error) {
      console.error('Error eliminando idea:', error);
      throw error;
    }
  }
  
  async getProjectRelationships(projectId: number): Promise<Relationship[]> {
    try {
      const result = await sql`
        SELECT * FROM relationships
        WHERE project_id = ${projectId}
      `;
      
      return result.map(row => ({
        id: row.id,
        projectId: row.project_id,
        fromIdeaId: row.from_idea_id,
        toIdeaId: row.to_idea_id,
        createdBy: row.created_by
      }));
    } catch (error) {
      console.error('Error getting project relationships:', error);
      throw error;
    }
  }
  
  async createRelationship(relationshipData: InsertRelationship): Promise<Relationship> {
    try {
      const result = await sql`
        INSERT INTO relationships (project_id, from_idea_id, to_idea_id, created_by)
        VALUES (
          ${relationshipData.projectId}, 
          ${relationshipData.fromIdeaId}, 
          ${relationshipData.toIdeaId}, 
          ${relationshipData.createdBy}
        )
        RETURNING *
      `;
      
      const newRelationship = result[0];
      return {
        id: newRelationship.id,
        projectId: newRelationship.project_id,
        fromIdeaId: newRelationship.from_idea_id,
        toIdeaId: newRelationship.to_idea_id,
        createdBy: newRelationship.created_by
      };
    } catch (error) {
      console.error('Error creating relationship:', error);
      throw error;
    }
  }
  
  async deleteRelationship(id: number): Promise<boolean> {
    try {
      const result = await sql`
        DELETE FROM relationships
        WHERE id = ${id}
        RETURNING id
      `;
      
      return result.length > 0;
    } catch (error) {
      console.error('Error deleting relationship:', error);
      throw error;
    }
  }
  
  async createInvitation(invitationData: InsertInvitation): Promise<Invitation> {
    try {
      const result = await sql`
        INSERT INTO invitations (project_id, email, role, token, expires_at, used)
        VALUES (
          ${invitationData.projectId}, 
          ${invitationData.email}, 
          ${invitationData.role}, 
          ${invitationData.token},
          ${invitationData.expiresAt},
          false
        )
        RETURNING *
      `;
      
      const newInvitation = result[0];
      return {
        id: newInvitation.id,
        projectId: newInvitation.project_id,
        email: newInvitation.email,
        role: newInvitation.role,
        token: newInvitation.token,
        expiresAt: newInvitation.expires_at,
        used: newInvitation.used,
        createdAt: newInvitation.created_at
      };
    } catch (error) {
      console.error('Error creating invitation:', error);
      throw error;
    }
  }
  
  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    try {
      const result = await sql`
        SELECT * FROM invitations
        WHERE token = ${token}
        LIMIT 1
      `;
      
      if (result.length === 0) {
        return undefined;
      }
      
      const invitation = result[0];
      return {
        id: invitation.id,
        projectId: invitation.project_id,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        expiresAt: invitation.expires_at,
        used: invitation.used,
        createdAt: invitation.created_at
      };
    } catch (error) {
      console.error('Error getting invitation by token:', error);
      throw error;
    }
  }
  
  async markInvitationAsUsed(id: number): Promise<Invitation | undefined> {
    try {
      const result = await sql`
        UPDATE invitations
        SET used = true
        WHERE id = ${id}
        RETURNING *
      `;
      
      if (result.length === 0) {
        return undefined;
      }
      
      const updatedInvitation = result[0];
      return {
        id: updatedInvitation.id,
        projectId: updatedInvitation.project_id,
        email: updatedInvitation.email,
        role: updatedInvitation.role,
        token: updatedInvitation.token,
        expiresAt: updatedInvitation.expires_at,
        used: updatedInvitation.used,
        createdAt: updatedInvitation.created_at
      };
    } catch (error) {
      console.error('Error marking invitation as used:', error);
      throw error;
    }
  }
  
  // Implementación de updateProject para DatabaseStorage
  async updateProject(id: number, projectUpdate: Partial<InsertProject>): Promise<Project | undefined> {
    try {
      const result = await db.update(projects)
        .set(projectUpdate)
        .where(eq(projects.id, id))
        .returning();
      
      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      console.error('Error updating project settings:', error);
      throw error;
    }
  }
  
  // Idea vote operations
  async getProjectIdeaVotes(projectId: number): Promise<(IdeaVote & { user: User })[]> {
    try {
      // Realizar consulta SQL para obtener votos junto con datos de usuario
      const result = await sql`
        SELECT iv.*, u.* FROM idea_votes iv
        JOIN ideas i ON iv.idea_id = i.id
        JOIN users u ON iv.user_id = u.id
        WHERE i.project_id = ${projectId}
      `;
      
      // Mapear los resultados a la estructura esperada
      return result.map(row => ({
        userId: row.user_id,
        ideaId: row.idea_id,
        createdAt: row.created_at,
        user: {
          id: row.id,
          username: row.username,
          email: row.email,
          password: row.password,
          role: row.role
        }
      }));
    } catch (error) {
      console.error('Error getting project idea votes:', error);
      throw error;
    }
  }

  async getIdeaVotes(ideaId: number): Promise<IdeaVote[]> {
    try {
      const result = await db.select()
        .from(ideaVotes)
        .where(eq(ideaVotes.ideaId, ideaId));
      
      return result;
    } catch (error) {
      console.error('Error getting idea votes:', error);
      throw error;
    }
  }

  async getUserVotes(userId: number, projectId: number): Promise<IdeaVote[]> {
    try {
      // Realizar consulta SQL para obtener los votos del usuario en ideas del proyecto
      const result = await sql`
        SELECT iv.* FROM idea_votes iv
        JOIN ideas i ON iv.idea_id = i.id
        WHERE iv.user_id = ${userId} AND i.project_id = ${projectId}
      `;
      
      // Mapear los resultados a la estructura esperada
      return result.map(row => ({
        userId: row.user_id,
        ideaId: row.idea_id,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('Error getting user votes:', error);
      throw error;
    }
  }

  async toggleIdeaVote(voteData: InsertIdeaVote): Promise<IdeaVote | undefined> {
    try {
      // Verificar si el voto ya existe
      const existingVote = await db.select()
        .from(ideaVotes)
        .where(and(
          eq(ideaVotes.userId, voteData.userId),
          eq(ideaVotes.ideaId, voteData.ideaId)
        ))
        .limit(1);
      
      if (existingVote.length > 0) {
        // Si el voto ya existe, eliminarlo
        await db.delete(ideaVotes)
          .where(and(
            eq(ideaVotes.userId, voteData.userId),
            eq(ideaVotes.ideaId, voteData.ideaId)
          ));
        
        return undefined;
      } else {
        // Si el voto no existe, crearlo
        const result = await db.insert(ideaVotes)
          .values(voteData)
          .returning();
        
        return result[0];
      }
    } catch (error) {
      console.error('Error toggling idea vote:', error);
      throw error;
    }
  }

  async countIdeaVotes(ideaId: number): Promise<number> {
    try {
      const countResult = await db.select({ count: sql`COUNT(*)` })
        .from(ideaVotes)
        .where(eq(ideaVotes.ideaId, ideaId));
      
      return Number(countResult[0].count);
    } catch (error) {
      console.error('Error counting idea votes:', error);
      throw error;
    }
  }

  async getVotingLimitForProject(projectId: number): Promise<number> {
    try {
      // Contar la cantidad de ideas en el proyecto
      const countResult = await db.select({ count: sql`COUNT(*)` })
        .from(ideas)
        .where(eq(ideas.projectId, projectId));
      
      const ideaCount = Number(countResult[0].count);
      
      // La regla es "1/3 + 1" del total de ideas
      const votingLimit = Math.floor(ideaCount / 3) + 1;
      
      return votingLimit;
    } catch (error) {
      console.error('Error getting voting limit for project:', error);
      throw error;
    }
  }
  
  // Selected ideas for connection process
  async getProjectSelectedIdeas(projectId: number): Promise<SelectedIdea[]> {
    try {
      const result = await db.select()
        .from(selectedIdeas)
        .where(eq(selectedIdeas.projectId, projectId));
      return result;
    } catch (error) {
      console.error('Error getting project selected ideas:', error);
      throw error;
    }
  }
  
  async getSelectedIdea(ideaId: number, projectId: number): Promise<SelectedIdea | undefined> {
    try {
      const result = await db.select()
        .from(selectedIdeas)
        .where(and(
          eq(selectedIdeas.ideaId, ideaId),
          eq(selectedIdeas.projectId, projectId)
        ))
        .limit(1);
      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      console.error('Error getting selected idea:', error);
      throw error;
    }
  }
  
  async toggleSelectedIdea(selectedIdeaData: InsertSelectedIdea): Promise<SelectedIdea | undefined> {
    try {
      // Verificar si la idea ya está seleccionada
      const existingSelected = await this.getSelectedIdea(
        selectedIdeaData.ideaId,
        selectedIdeaData.projectId
      );
      
      if (existingSelected) {
        // Si la idea ya está seleccionada, la eliminamos
        await db.delete(selectedIdeas)
          .where(and(
            eq(selectedIdeas.ideaId, selectedIdeaData.ideaId),
            eq(selectedIdeas.projectId, selectedIdeaData.projectId)
          ));
        return undefined;
      } else {
        // Si la idea no está seleccionada, la agregamos
        const result = await db.insert(selectedIdeas)
          .values({
            ...selectedIdeaData,
            createdAt: new Date()
          })
          .returning();
        return result[0];
      }
    } catch (error) {
      console.error('Error toggling selected idea:', error);
      throw error;
    }
  }
  
  async clearProjectSelectedIdeas(projectId: number): Promise<boolean> {
    try {
      await db.delete(selectedIdeas)
        .where(eq(selectedIdeas.projectId, projectId));
      return true;
    } catch (error) {
      console.error('Error clearing project selected ideas:', error);
      throw error;
    }
  }
}

// Choose between implementations based on environment variables
let storage: IStorage;

try {
  if (process.env.DATABASE_URL) {
    console.log('Using PostgreSQL database storage');
    storage = new DatabaseStorage();
  } else {
    console.log('Using in-memory storage');
    storage = new MemStorage();
  }
} catch (error) {
  console.error('Error initializing database storage, falling back to in-memory storage:', error);
  storage = new MemStorage();
}

export { storage };
