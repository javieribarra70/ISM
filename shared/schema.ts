import { pgTable, text, serial, integer, boolean, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Mantenemos las categorías predefinidas como referencia inicial
// pero serán reemplazadas por las categorías en la base de datos
export const AVAILABLE_CATEGORIES = [
  "Primary Goal",
  "Policy",
  "Strategy",
  "Implementation",
  "Problemas Técnicos",
  "Mejoras UX",
  "Optimización"
];

// User model
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("user"), // "admin" or "user"
  createdBy: integer("created_by").references(() => users.id), // El administrador que creó a este usuario (null para usuarios autodesplegables)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Project model
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  context: text("context"), // Contexto del proyecto, permite hasta 400+ caracteres
  triggeringQuestion: text("triggering_question"), // Pregunta desencadenante, permite hasta 400+ caracteres
  relation: text("relation"), // Relación, permite hasta 400+ caracteres
  restriction: text("restriction"), // Restricción, permite hasta 400+ caracteres
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  anonymousMode: boolean("anonymous_mode").default(false).notNull(),
});

// ProjectUser relation (many-to-many)
export const projectUsers = pgTable("project_users", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("user"), // "admin" or "user"
});

// Categories model
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#E2E8F0"), // Color para mostrar en la UI
  projectId: integer("project_id").notNull().references(() => projects.id), // Categoría asociada a un proyecto
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Ideas model
export const ideas = pgTable("ideas", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  clarification: text("clarification"), // Agregando el campo clarificación
  categoryId: integer("category_id").references(() => categories.id), // Relación con la tabla de categorías
  category: text("category"), // Mantenemos este campo para compatibilidad (se eliminará en el futuro)
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
  relationType: text("relation_type"), // For storing VAXO relationship type: "V", "A", "X", "O"
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

// Idea votes model (for selector tab)
export const ideaVotes = pgTable("idea_votes", {
  userId: integer("user_id").notNull().references(() => users.id),
  ideaId: integer("idea_id").notNull().references(() => ideas.id),
  projectId: integer("project_id").notNull().references(() => projects.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.userId, table.ideaId] }),
  };
});

// Selected ideas for connection process
export const selectedIdeas = pgTable("selected_ideas", {
  id: serial("id").primaryKey(),
  ideaId: integer("idea_id").notNull().references(() => ideas.id),
  projectId: integer("project_id").notNull().references(() => projects.id),
  selectedBy: integer("selected_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true,
    email: true,
  })
  .extend({
    role: z.string().default("user"),
    createdBy: z.number().optional(),
  });

export const insertProjectSchema = createInsertSchema(projects)
  .pick({
    name: true,
    createdBy: true,
  })
  .extend({
    description: z.string().optional(),
    context: z.string().optional(),
    triggeringQuestion: z.string().optional(),
    relation: z.string().optional(),
    restriction: z.string().optional(),
    anonymousMode: z.boolean().default(false),
  });

export const insertProjectUserSchema = createInsertSchema(projectUsers)
  .pick({
    projectId: true,
    userId: true,
  })
  .extend({
    role: z.string().default("user"),
  });

export const insertCategorySchema = createInsertSchema(categories)
  .pick({
    name: true,
    projectId: true,
    createdBy: true,
  })
  .extend({
    description: z.string().optional(),
    color: z.string().default("#E2E8F0"),
  });

export const insertIdeaSchema = createInsertSchema(ideas)
  .pick({
    title: true,
    projectId: true,
    createdBy: true,
  })
  .extend({
    description: z.string().optional(),
    clarification: z.string().optional(),
    categoryId: z.number().optional(), // Usamos el ID de categoría en el futuro
    category: z.string().optional(),   // Mantenemos para compatibilidad
    positionX: z.string().default("0"),
    positionY: z.string().default("0"),
  });

export const insertRelationshipSchema = createInsertSchema(relationships)
  .pick({
    fromIdeaId: true,
    toIdeaId: true,
    projectId: true,
    createdBy: true,
  })
  .extend({
    relationType: z.string().optional(), // "V", "A", "X", "O"
  });

export const insertInvitationSchema = createInsertSchema(invitations)
  .pick({
    projectId: true,
    token: true,
    email: true,
  })
  .extend({
    role: z.string().default("user"),
    expiresAt: z.date().optional(),
  });

export const insertIdeaVoteSchema = createInsertSchema(ideaVotes)
  .pick({
    userId: true,
    ideaId: true,
    projectId: true,
  });

export const insertSelectedIdeaSchema = createInsertSchema(selectedIdeas)
  .pick({
    ideaId: true,
    projectId: true,
    selectedBy: true,
  });

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export type InsertProjectUser = z.infer<typeof insertProjectUserSchema>;
export type ProjectUser = typeof projectUsers.$inferSelect;

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

export type InsertIdea = z.infer<typeof insertIdeaSchema>;
export type Idea = typeof ideas.$inferSelect;

export type InsertRelationship = z.infer<typeof insertRelationshipSchema>;
export type Relationship = typeof relationships.$inferSelect;

export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitations.$inferSelect;

export type InsertIdeaVote = z.infer<typeof insertIdeaVoteSchema>;
export type IdeaVote = typeof ideaVotes.$inferSelect;

export type InsertSelectedIdea = z.infer<typeof insertSelectedIdeaSchema>;
export type SelectedIdea = typeof selectedIdeas.$inferSelect;
