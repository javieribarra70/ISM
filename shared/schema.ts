import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User model
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("user"), // "admin" or "user"
});

// Project model
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
});

// ProjectUser relation (many-to-many)
export const projectUsers = pgTable("project_users", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("user"), // "admin" or "user"
});

// Ideas model
export const ideas = pgTable("ideas", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  positionX: text("position_x").notNull().default("0"),
  positionY: text("position_y").notNull().default("0"),
});

// Relationships between ideas
export const relationships = pgTable("relationships", {
  id: serial("id").primaryKey(),
  fromIdeaId: integer("from_idea_id").notNull().references(() => ideas.id),
  toIdeaId: integer("to_idea_id").notNull().references(() => ideas.id),
  projectId: integer("project_id").notNull().references(() => projects.id),
  createdBy: integer("created_by").notNull().references(() => users.id),
});

// Invitations model
export const invitations = pgTable("invitations", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  token: text("token").notNull().unique(),
  email: text("email").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  used: boolean("used").notNull().default(false),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  role: true,
});

export const insertProjectSchema = createInsertSchema(projects).pick({
  name: true,
  description: true,
  createdBy: true,
});

export const insertProjectUserSchema = createInsertSchema(projectUsers).pick({
  projectId: true,
  userId: true,
  role: true,
});

export const insertIdeaSchema = createInsertSchema(ideas).pick({
  title: true,
  description: true,
  category: true,
  projectId: true,
  createdBy: true,
  positionX: true,
  positionY: true,
});

export const insertRelationshipSchema = createInsertSchema(relationships).pick({
  fromIdeaId: true,
  toIdeaId: true,
  projectId: true,
  createdBy: true,
});

export const insertInvitationSchema = createInsertSchema(invitations).pick({
  projectId: true,
  token: true,
  email: true,
  role: true,
  expiresAt: true,
});

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export type InsertProjectUser = z.infer<typeof insertProjectUserSchema>;
export type ProjectUser = typeof projectUsers.$inferSelect;

export type InsertIdea = z.infer<typeof insertIdeaSchema>;
export type Idea = typeof ideas.$inferSelect;

export type InsertRelationship = z.infer<typeof insertRelationshipSchema>;
export type Relationship = typeof relationships.$inferSelect;

export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitations.$inferSelect;
