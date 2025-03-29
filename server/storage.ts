import {
  users, ideas, projects, projectUsers, relationships, invitations,
  type User, type Idea, type Project, type ProjectUser, type Relationship, type Invitation,
  type InsertUser, type InsertIdea, type InsertProject, type InsertProjectUser, type InsertRelationship, type InsertInvitation
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import { randomBytes } from "crypto";

// Create memory store for sessions
const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUserProjects(userId: number): Promise<Project[]>;

  // Project operations
  getProject(id: number): Promise<Project | undefined>;
  getProjectUsers(projectId: number): Promise<(ProjectUser & { user: User })[]>;
  createProject(project: InsertProject): Promise<Project>;
  addUserToProject(projectUser: InsertProjectUser): Promise<ProjectUser>;
  getUserProjectRole(userId: number, projectId: number): Promise<string | undefined>;

  // Idea operations
  getProjectIdeas(projectId: number): Promise<Idea[]>;
  getIdea(id: number): Promise<Idea | undefined>;
  createIdea(idea: InsertIdea): Promise<Idea>;
  updateIdea(id: number, idea: Partial<InsertIdea>): Promise<Idea | undefined>;
  updateIdeaPosition(id: number, positionX: string, positionY: string): Promise<Idea | undefined>;

  // Relationship operations
  getProjectRelationships(projectId: number): Promise<Relationship[]>;
  createRelationship(relationship: InsertRelationship): Promise<Relationship>;
  deleteRelationship(id: number): Promise<boolean>;

  // Invitation operations
  createInvitation(invitation: InsertInvitation): Promise<Invitation>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  markInvitationAsUsed(id: number): Promise<Invitation | undefined>;

  // Session store
  sessionStore: session.SessionStore;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private projects: Map<number, Project>;
  private projectUsers: Map<number, ProjectUser>;
  private ideas: Map<number, Idea>;
  private relationships: Map<number, Relationship>;
  private invitations: Map<number, Invitation>;
  
  sessionStore: session.SessionStore;
  
  private currentUserId: number;
  private currentProjectId: number;
  private currentProjectUserId: number;
  private currentIdeaId: number;
  private currentRelationshipId: number;
  private currentInvitationId: number;

  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.projectUsers = new Map();
    this.ideas = new Map();
    this.relationships = new Map();
    this.invitations = new Map();
    
    this.currentUserId = 1;
    this.currentProjectId = 1;
    this.currentProjectUserId = 1;
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
    // Hash using the same algorithm as in auth.ts but precalculated
    // This is the hash for password "demo123"
    const hashedPassword = "8a1ea5669137134d30cf8a14e85329aadbf3f907748e25c877db83c927dfcb359ed97e0967151e40b076088396ba72145b9a6a153aeb26160e6fdad240fbaf0a.5bfbf79a8bfa1cdf";
    
    const demoUser = {
      id: 1,
      username: "demo",
      password: hashedPassword,
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
}

export const storage = new MemStorage();
