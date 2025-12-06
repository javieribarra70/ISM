# Collaborative ISM Platform

## Overview

This is a collaborative Interpretive Structural Modeling (ISM) platform that enables teams to collectively analyze complex problems through idea generation, relationship mapping, and structural visualization. The platform implements the VAXO methodology for systematic relationship analysis and uses graph theory to generate hierarchical ISM diagrams.

The application supports multi-user collaboration with role-based access control, real-time idea management, and advanced features like anonymous mode, idea clustering, and automated structural analysis using transitive reduction and level partitioning algorithms.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **React** with TypeScript for type-safe component development
- **Vite** as the build tool and development server
- **Wouter** for client-side routing (lightweight alternative to React Router)
- **TanStack Query** (React Query) for server state management and caching
- **Tailwind CSS** with shadcn/ui component library for styling
- **Cytoscape.js** for graph visualization and ISM diagram rendering

**Key Design Patterns:**
- Context API for global state management (Auth, Projects, Users)
- Custom hooks for business logic encapsulation (`useAuth`, `useProjects`, `useUsers`)
- Protected routes with automatic authentication checking
- Modal-based workflows for CRUD operations
- Tab-based navigation with session persistence

**Component Structure:**
- `/components` - Reusable UI components (cards, modals, workspace)
- `/pages` - Route-level page components
- `/hooks` - Custom React hooks for state and API management
- `/lib` - Utility functions including matrix operations for ISM analysis

### Backend Architecture

**Technology Stack:**
- **Express.js** server with TypeScript
- **Passport.js** with local strategy for authentication
- **Session-based authentication** with PostgreSQL session store
- **Drizzle ORM** for database interactions
- **Neon PostgreSQL** as the database provider

**Key Design Decisions:**
- RESTful API design with clear resource endpoints
- Middleware-based authentication and authorization
- Role-based access control (admin vs. user, project-level roles)
- Session persistence across server restarts using database-backed sessions

**Authentication Strategy:**
- Scrypt password hashing with random salts
- HTTP-only cookies for session management
- Special handling for demo user with hardcoded credentials
- Session timeout of 30 days with automatic renewal

**API Structure:**
- `/api/auth/*` - Authentication endpoints (login, logout, register)
- `/api/projects/*` - Project CRUD and member management
- `/api/projects/:id/ideas` - Idea management within projects
- `/api/projects/:id/relationships` - Relationship VAXO data
- `/api/projects/:id/categories` - Category management
- `/api/users/*` - User administration (admin only)

### Data Storage Solutions

**Database Schema (PostgreSQL via Drizzle ORM):**

**Core Tables:**
- `users` - User accounts with role-based permissions
- `projects` - ISM project containers with context information
- `project_users` - Many-to-many relationship with project-level roles
- `ideas` - Individual ideas with positioning and category data
- `categories` - Project-specific categorization system
- `relationships` - VAXO relationship mappings between ideas
- `idea_votes` - Voting system for idea selection
- `selected_ideas` - Ideas chosen for ISM analysis
- `invitations` - Token-based project invitation system
- `session` - Server-side session storage (via connect-pg-simple)

**Key Schema Features:**
- Cascading deletes for project cleanup
- Optional foreign keys for flexible categorization
- Position tracking (x, y coordinates) for workspace layout
- Timestamp tracking for all entities
- Anonymous mode flag at project level

**Migration Strategy:**
- Drizzle Kit for schema migrations
- Version-controlled migration files in `/migrations`
- `db:push` command for development schema updates

### ISM Analysis Engine

**Algorithm Implementation:**
- **VAXO System**: Captures relationships (V=influences, A=influenced by, X=mutual, O=none)
- **SSIM Matrix**: Structural Self-Interaction Matrix construction
- **Reachability Matrix**: Binary matrix representing all paths between ideas
- **Transitive Closure**: Floyd-Warshall algorithm for complete reachability
- **Transitive Reduction**: Removes redundant edges while preserving reachability
- **Level Partitioning**: Tarjan's algorithm for strongly connected components and hierarchical leveling
- **Graph Layout**: Dagre algorithm for hierarchical diagram positioning

**Matrix Utilities** (`/lib/matrix-utils.ts`):
- Strongly connected component detection
- Transitive closure and reduction
- Level-based node partitioning
- Cycle detection and handling

### External Dependencies

**Third-Party Services:**
- **Neon Database** - Serverless PostgreSQL hosting
  - Connection via `@neondatabase/serverless` package
  - WebSocket support for persistent connections
  - SSL required for security

- **OpenAI API** (Optional) - AI-powered idea merging
  - Used in clustering mode to intelligently merge similar ideas
  - Requires `OPENAI_API_KEY` environment variable
  - Fallback to simple concatenation if API unavailable

**Key NPM Packages:**
- **Authentication**: `passport`, `passport-local`, `express-session`, `connect-pg-simple`
- **Database**: `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `postgres`
- **Frontend**: `react`, `react-dom`, `wouter`, `@tanstack/react-query`
- **UI Components**: `@radix-ui/*` (comprehensive component library), `tailwindcss`
- **Graph Visualization**: `cytoscape`, `cytoscape-dagre`, `cytoscape-svg`
- **Utilities**: `zod` (validation), `react-hook-form`, `date-fns`, `nanoid`

**Environment Variables Required:**
- `DATABASE_URL` - PostgreSQL connection string (required)
- `SESSION_SECRET` - Secret key for session encryption (defaults to static key)
- `OPENAI_API_KEY` - OpenAI API key for idea merging (optional)
- `NODE_ENV` - Environment indicator (development/production)

**Build & Deployment:**
- Development: `npm run dev` (tsx for server, Vite for client)
- Build: `npm run build` (Vite + esbuild bundling)
- Production: `npm start` (runs bundled server)
- Type checking: `npm run check` (TypeScript validation)

**Special Features:**
- Replit-specific plugins for theme management and error overlay
- Runtime error modal in development
- Cartographer integration for Replit environment
- Cookie-based session persistence with configurable timeouts