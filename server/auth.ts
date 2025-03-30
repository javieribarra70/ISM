import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  // Special case for demo user
  if (stored === "demo-password" && supplied === "demo123") {
    return true;
  }
  
  // Regular password comparison for all other users
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "ism-platform-session-secret-key",
    resave: true, // Changed to true to ensure session is saved on every request
    saveUninitialized: true, // Changed to true to create session even without login
    store: storage.sessionStore,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days (increased from 7 days)
      httpOnly: true,
      sameSite: 'lax'
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // API para registrarse directamente (todos son administradores por defecto)
  app.post("/api/register", async (req, res, next) => {
    try {
      const { username, password, email } = req.body;
      
      // Validaciones básicas
      if (!username || !password || !email) {
        return res.status(400).json({ message: "Username, password, and email are required" });
      }
      
      // Por defecto, todos los usuarios que se registran son administradores
      // Esto permite que cada administrador cree sus propios usuarios regulares
      const validRole = 'admin';
      
      // Check if username or email already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        email,
        role: validRole,
        // No createdBy para usuarios que se registran por sí mismos
        createdBy: null
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;
      
      console.log(`New user registered: ${username} with role: ${validRole}`);

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      console.error("Registration error:", error);
      next(error);
    }
  });
  
  // API para que los administradores creen usuarios
  app.post("/api/users", async (req, res, next) => {
    try {
      // Verificar que el usuario está autenticado y es admin
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden - Admin access required" });
      }
      
      const { username, password, email, role } = req.body;
      
      // Validaciones básicas
      if (!username || !password || !email) {
        return res.status(400).json({ message: "Username, password, and email are required" });
      }
      
      // Validar que el rol sea válido (solo permitir 'user')
      // Los administradores solo pueden crear usuarios regulares
      const validRole = 'user';
      
      // Check if username or email already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        email,
        role: validRole,
        createdBy: req.user.id // El administrador que está creando este usuario
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;
      
      console.log(`New user created by admin ${req.user.username}: ${username} with role: ${validRole}`);

      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("User creation error:", error);
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Authentication failed" });
      }
      
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        
        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;
        return res.status(200).json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    // Remove password from response
    const { password: _, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });
}
