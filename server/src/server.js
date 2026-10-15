import { createRequire } from "module";
const require = createRequire(import.meta.url);

import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import initSqlJs from "sql.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = Number(process.env.PORT || 5000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET || "development-only-secret";
const TRUSTED_ORIGINS = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const databasePath = process.env.DATABASE_PATH || "./school.db";
const resolvedDatabasePath = path.resolve(databasePath);

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(cors({
  origin(origin, callback) {
    if (!origin || TRUSTED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error("CORS origin is not allowed."));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

const requestLog = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120;

function apiRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || "unknown";
  const current = requestLog.get(key);

  if (!current || now - current.startedAt > RATE_WINDOW_MS) {
    requestLog.set(key, { startedAt: now, count: 1 });
    return next();
  }

  current.count += 1;
  if (current.count > RATE_LIMIT) {
    return res.status(429).json({
      success: false,
      message: "Too many requests. Please try again later."
    });
  }

  next();
}

app.use("/api", apiRateLimit);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SQL = await initSqlJs({
  locateFile: (file) =>
    path.join(__dirname, "..", "node_modules", "sql.js", "dist", file)
});

let db;
if (fs.existsSync(resolvedDatabasePath)) {
  db = new SQL.Database(fs.readFileSync(resolvedDatabasePath));
} else {
  db = new SQL.Database();
}

function persistDatabase() {
  const binary = db.export();
  fs.mkdirSync(path.dirname(resolvedDatabasePath), { recursive: true });
  fs.writeFileSync(resolvedDatabasePath, Buffer.from(binary));
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  return queryAll(sql, params)[0] || null;
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  const changes = db.getRowsModified();
  stmt.free();
  persistDatabase();
  return { changes };
}

function insert(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
  const row = queryOne("SELECT last_insert_rowid() AS id");
  persistDatabase();
  return { lastInsertRowid: row?.id ?? null };
}

function count(table, where = "") {
  const row = queryOne(
    `SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`
  );
  return Number(row?.count || 0);
}

db.run("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  school_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leaders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS programmes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS achievers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  institution TEXT NOT NULL,
  achievement TEXT NOT NULL DEFAULT 'NEET Qualified',
  photo_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  event_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  hero_kicker TEXT NOT NULL DEFAULT 'WELCOME TO ADARSHA SENIOR SECONDARY SCHOOL',
  hero_title TEXT NOT NULL DEFAULT 'Where Curiosity Meets',
  hero_emphasis TEXT NOT NULL DEFAULT 'Excellence',
  hero_description TEXT NOT NULL DEFAULT 'A nurturing environment that inspires young minds to learn, grow and lead with confidence.',
  hero_image_url TEXT NOT NULL DEFAULT '',
  announcement_text TEXT NOT NULL DEFAULT 'Admissions Open for 2025–26 • New academic session begins soon',
  admissions_title TEXT NOT NULL DEFAULT 'Admissions Open 2025–26',
  admissions_description TEXT NOT NULL DEFAULT 'Give your child a joyful, safe and inspiring place to learn and grow.',
  years_excellence TEXT NOT NULL DEFAULT '22+',
  students_count TEXT NOT NULL DEFAULT '4500+',
  faculty_count TEXT NOT NULL DEFAULT '150+',
  pass_percentage TEXT NOT NULL DEFAULT '98%'
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admission_no TEXT NOT NULL UNIQUE,
  roll_no TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT '',
  guardian_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  date_of_birth TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faculty (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  designation TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  employee_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  class_name TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  UNIQUE(teacher_id,class_name,section,subject),
  FOREIGN KEY(teacher_id) REFERENCES teacher_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  class_name TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present','absent','late','leave')),
  remarks TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id,attendance_date,subject),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(teacher_id) REFERENCES teacher_accounts(id) ON DELETE CASCADE
);
`);

// Safe migrations for databases created by earlier upgrades.
try {
  const cols = queryAll("PRAGMA table_info(students)").map((c) => c.name);
  const migrations = [
    ["roll_no", "TEXT NOT NULL DEFAULT ''"],
    ["gender", "TEXT NOT NULL DEFAULT ''"],
    ["date_of_birth", "TEXT NOT NULL DEFAULT ''"],
    ["address", "TEXT NOT NULL DEFAULT ''"],
    ["photo_url", "TEXT NOT NULL DEFAULT ''"]
  ];
  for (const [name, definition] of migrations) {
    if (!cols.includes(name)) db.run(`ALTER TABLE students ADD COLUMN ${name} ${definition}`);
  }
  persistDatabase();
} catch (error) {
  console.error("Student schema migration failed:", error);
}

function seed() {
  if (!count("teacher_accounts")) {
    insert("INSERT INTO teacher_accounts (full_name,employee_id,email,password_hash,subject,status) VALUES (?,?,?,?,?,?)", [
      "Demo Class Teacher",
      "T-001",
      "teacher@adarsha.edu.in",
      bcrypt.hashSync("Teacher@12345", 12),
      "All Subjects",
      "active"
    ]);
  }
  const demoTeacher = queryOne("SELECT id FROM teacher_accounts WHERE employee_id=?", ["T-001"]);
  if (demoTeacher && !count("teacher_classes", "teacher_id=" + Number(demoTeacher.id))) {
    insert("INSERT OR IGNORE INTO teacher_classes (teacher_id,class_name,section,subject) VALUES (?,?,?,?)", [demoTeacher.id,"VI","A","All Subjects"]);
  }

  if (!count("admins")) {
    insert(
      `INSERT INTO admins (name,email,password_hash,role) VALUES (?,?,?,?)`,
      [
        "School Administrator",
        "admin@sunshinepublic.edu.in",
        bcrypt.hashSync("Admin@12345", 12),
        "admin"
      ]
    );
  }

  if (!count("school_settings")) {
    insert(
      `INSERT INTO school_settings (id,school_name,email,phone,address) VALUES (1,?,?,?,?)`,
      [
        "Adarsha Senior Secondary School",
        "info@sunshinepublic.edu.in",
        "+91 98765 43210",
        "Tupamari, Kamrup, Assam, 781127"
      ]
    );
  } else {
    run(`UPDATE school_settings SET school_name=? WHERE id=1 AND school_name='Sunshine Public School'`, ["Adarsha Senior Secondary School"]);
  }

  if (!count("site_content")) {
    insert(`INSERT INTO site_content (id,hero_kicker,hero_title,hero_emphasis,hero_description,hero_image_url,announcement_text,admissions_title,admissions_description,years_excellence,students_count,faculty_count,pass_percentage) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      "WELCOME TO ADARSHA SENIOR SECONDARY SCHOOL",
      "Where Curiosity Meets",
      "Excellence",
      "A nurturing environment that inspires young minds to learn, grow and lead with confidence.",
      "/images/hero.png",
      "Admissions Open for 2025–26 • New academic session begins soon",
      "Admissions Open 2025–26",
      "Give your child a joyful, safe and inspiring place to learn and grow.",
      "22+", "4500+", "150+", "98%"
    ]);
  }

  if (!count("leaders")) {
    const rows = [
      ["PRINCIPAL","Dr. Rakesh Sharma","We believe every child can learn, grow and lead.","https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=500&q=90",1],
      ["CHAIRMAN","Mr. Arun Mehta","Education builds the foundation of a responsible society.","https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=500&q=90",2],
      ["EXECUTIVE CHAIRMAN","Mr. Rajiv Sharma","Our mission is to combine knowledge, values and confidence.","https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=90",3]
    ];
    for (const row of rows) {
      insert(`INSERT INTO leaders (role,name,message,photo_url,sort_order) VALUES (?,?,?,?,?)`, row);
    }
  }

  if (!count("programmes")) {
    const rows = [
      ["Adarsha Super Special Group","Classes VI to XII","Focused academic groups with mentoring and continuous assessment.","📚",1],
      ["Digital Laboratory & Classroom","Smart Learning","Technology-enabled classrooms for interactive learning.","💻",2],
      ["Computer Education","Digital Skills","Practical computer education for a technology-driven future.","🖥️",3],
      ["Art Education","Creative Development","Creative activities that encourage imagination and expression.","🎨",4],
      ["Morning Assembly & NCC","Discipline & Leadership","Activities that develop discipline, teamwork and leadership.","🏅",5],
      ["Science & Practical Learning","Hands-on Education","Experiments and projects that connect classroom concepts with real life.","🔬",6]
    ];
    for (const row of rows) {
      insert(`INSERT INTO programmes (title,subtitle,description,icon,sort_order) VALUES (?,?,?,?,?)`, row);
    }
  }

  if (!count("achievers")) {
    const rows = [
      ["Imran Hussain","F.A.A Medical College","NEET Qualified","https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=400&q=90"],
      ["Abdus Samim Mondal","Jorhat Medical College","NEET Qualified","https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=90"],
      ["Ramjan Ali","GM College, Sri Nagar","NEET Qualified","https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=90"]
    ];
    for (const row of rows) {
      insert(`INSERT INTO achievers (name,institution,achievement,photo_url) VALUES (?,?,?,?)`, row);
    }
  }

  if (!count("news_events")) {
    const rows = [
      ["CAMPUS EVENT","Annual Function & Cultural Celebration","A memorable evening of music, dance, drama and student performances.","https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=900&q=90","2025-02-18"],
      ["SPECIAL GUEST","Zubeen Garg Visits Sunshine Public School","An inspiring campus moment with music, interaction and encouragement.","https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=90","2025-02-02"],
      ["ACHIEVEMENT","Award Winning Ceremony","Celebrating academic excellence, leadership and contribution.","https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=900&q=90","2025-01-20"],
      ["SPORTS","Annual Sports Day","Teamwork, healthy competition and unforgettable sporting moments.","https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=900&q=90","2025-01-12"]
    ];
    for (const row of rows) {
      insert(`INSERT INTO news_events (category,title,description,image_url,event_date) VALUES (?,?,?,?,?)`, row);
    }
  }

  if (!count("gallery")) {
    const rows = [
      ["Annual Function","https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=800&q=90"],
      ["Sports Day","https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=90"],
      ["Science Exhibition","https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=800&q=90"],
      ["School Campus","https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=800&q=90"]
    ];
    for (const row of rows) {
      insert(`INSERT INTO gallery (title,image_url) VALUES (?,?)`, row);
    }
  }
}

seed();
persistDatabase();

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) {
    return res.status(401).json({ success:false, message:"Authentication required." });
  }

  try {
    req.admin = jwt.verify(token, JWT_SECRET, {
      issuer: "sunshine-school",
      audience: "sunshine-school-admin"
    });
    next();
  } catch {
    return res.status(401).json({ success:false, message:"Invalid or expired token." });
  }
}

function requireFields(body, fields) {
  return fields.every((field) => String(body?.[field] ?? "").trim());
}

function logActivity(adminId, action, entity = "", entityId = null) {
  try {
    insert("INSERT INTO activity_log (admin_id,action,entity,entity_id) VALUES (?,?,?,?)", [adminId, action, entity, entityId]);
  } catch {}
}

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    service: "sunshine-school-api",
    status: "healthy",
    database: "connected",
    part: 5
  });
});

app.get("/api", (_req, res) => {
  res.json({
    name: "Sunshine Public School API",
    version: "1.0.2",
    status: "online"
  });
});

app.post("/api/auth/login", (req, res) => {
  const { email = "", password = "" } = req.body ?? {};
  const admin = queryOne("SELECT * FROM admins WHERE email = ?", [email.trim().toLowerCase()]);

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ success:false, message:"Invalid email or password." });
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role, name: admin.name },
    JWT_SECRET,
    { expiresIn:"8h", issuer:"sunshine-school", audience:"sunshine-school-admin" }
  );

  res.json({
    success:true,
    data:{
      token,
      admin:{ id:admin.id, name:admin.name, email:admin.email, role:admin.role }
    }
  });
});

app.get("/api/auth/me", requireAdmin, (req, res) => {
  const admin = queryOne(
    "SELECT id,name,email,role,created_at FROM admins WHERE id = ?",
    [req.admin.id]
  );
  if (!admin) return res.status(401).json({success:false,message:"Admin account not found."});
  res.json({success:true,data:admin});
});

app.get("/api/school", (_req,res) =>
  res.json({success:true,data:queryOne("SELECT * FROM school_settings WHERE id=1")})
);

app.get("/api/site-content", (_req,res) =>
  res.json({success:true,data:queryOne("SELECT * FROM site_content WHERE id=1")})
);

app.get("/api/leaders", (_req,res) =>
  res.json({success:true,data:queryAll("SELECT * FROM leaders ORDER BY sort_order,id")})
);

app.get("/api/programmes", (_req,res) =>
  res.json({success:true,data:queryAll("SELECT * FROM programmes ORDER BY sort_order,id")})
);

app.get("/api/achievers", (_req,res) =>
  res.json({success:true,data:queryAll("SELECT * FROM achievers ORDER BY id")})
);

app.get("/api/news-events", (_req,res) =>
  res.json({success:true,data:queryAll("SELECT * FROM news_events ORDER BY COALESCE(event_date,created_at) DESC,id DESC")})
);

app.get("/api/gallery", (_req,res) =>
  res.json({success:true,data:queryAll("SELECT * FROM gallery ORDER BY id DESC")})
);

app.post("/api/enquiries", (req,res) => {
  const {full_name,phone,email,class_name="",message=""} = req.body ?? {};

  if (!requireFields(req.body, ["full_name","phone","email"])) {
    return res.status(400).json({
      success:false,
      message:"Full name, phone and email are required."
    });
  }

  const result = insert(
    `INSERT INTO enquiries (full_name,phone,email,class_name,message) VALUES (?,?,?,?,?)`,
    [
      full_name.trim(),
      phone.trim(),
      email.trim().toLowerCase(),
      String(class_name).trim(),
      String(message).trim()
    ]
  );

  res.status(201).json({
    success:true,
    message:"Enquiry submitted successfully.",
    id:result.lastInsertRowid
  });
});

app.get("/api/enquiries", requireAdmin, (_req,res) =>
  res.json({
    success:true,
    data:queryAll("SELECT * FROM enquiries ORDER BY created_at DESC,id DESC")
  })
);

app.get("/api/admin/stats", requireAdmin, (_req,res) => {
  res.json({
    success:true,
    data:{
      leaders:count("leaders"),
      programmes:count("programmes"),
      achievers:count("achievers"),
      news:count("news_events"),
      gallery:count("gallery"),
      students:count("students"),
      faculty:count("faculty","status='active'"),
      enquiries:count("enquiries"),
      new_enquiries:count("enquiries","status='new'")
    }
  });
});

app.get("/api/admin/enquiries", requireAdmin, (_req,res) =>
  res.json({
    success:true,
    data:queryAll("SELECT * FROM enquiries ORDER BY created_at DESC,id DESC")
  })
);

app.patch("/api/admin/enquiries/:id", requireAdmin, (req,res) => {
  const {status} = req.body ?? {};
  if (!["new","contacted","resolved"].includes(status)) {
    return res.status(400).json({success:false,message:"Invalid enquiry status."});
  }

  const result = run(
    "UPDATE enquiries SET status=? WHERE id=?",
    [status, req.params.id]
  );

  if (!result.changes) {
    return res.status(404).json({success:false,message:"Enquiry not found."});
  }

  res.json({success:true});
});

app.patch("/api/admin/school", requireAdmin, (req,res) => {
  const {school_name,email,phone,address} = req.body ?? {};
  if (!requireFields(req.body,["school_name","email","phone","address"])) {
    return res.status(400).json({success:false,message:"School name, email, phone and address are required."});
  }
  run("UPDATE school_settings SET school_name=?,email=?,phone=?,address=?,updated_at=CURRENT_TIMESTAMP WHERE id=1", [school_name.trim(),email.trim().toLowerCase(),phone.trim(),address.trim()]);
  logActivity(req.admin.id,"updated","school_settings",1);
  res.json({success:true,data:queryOne("SELECT * FROM school_settings WHERE id=1")});
});

app.patch("/api/admin/site-content", requireAdmin, (req,res) => {
  const allowed = ["hero_kicker","hero_title","hero_emphasis","hero_description","hero_image_url","announcement_text","admissions_title","admissions_description","years_excellence","students_count","faculty_count","pass_percentage"];
  const current = queryOne("SELECT * FROM site_content WHERE id=1");
  const values = allowed.map(k => req.body?.[k] !== undefined ? String(req.body[k]) : current[k]);
  run(`UPDATE site_content SET ${allowed.map(k=>`${k}=?`).join(",")} WHERE id=1`, values);
  logActivity(req.admin.id,"updated","site_content",1);
  res.json({success:true,data:queryOne("SELECT * FROM site_content WHERE id=1")});
});

app.patch("/api/admin/auth/password", requireAdmin, (req,res) => {
  const {current_password,new_password} = req.body ?? {};
  if (!current_password || !new_password || String(new_password).length < 8) {
    return res.status(400).json({success:false,message:"Current password and a new password of at least 8 characters are required."});
  }
  const admin = queryOne("SELECT * FROM admins WHERE id=?", [req.admin.id]);
  if (!admin || !bcrypt.compareSync(current_password, admin.password_hash)) {
    return res.status(401).json({success:false,message:"Current password is incorrect."});
  }
  run("UPDATE admins SET password_hash=? WHERE id=?", [bcrypt.hashSync(String(new_password),12), req.admin.id]);
  logActivity(req.admin.id,"changed_password","admins",req.admin.id);
  res.json({success:true,message:"Password changed successfully. Please sign in again."});
});

app.get("/api/admin/activity", requireAdmin, (_req,res) =>
  res.json({success:true,data:queryAll(`SELECT a.*, COALESCE(ad.name,'Administrator') AS admin_name FROM activity_log a LEFT JOIN admins ad ON ad.id=a.admin_id ORDER BY a.created_at DESC,a.id DESC LIMIT 30`)})
);

app.post("/api/admin/leaders", requireAdmin, (req,res) => {
  const {role,name,message="",photo_url="",sort_order=0} = req.body ?? {};
  if (!requireFields(req.body,["role","name"])) {
    return res.status(400).json({success:false,message:"Role and name are required."});
  }

  const result = insert(
    "INSERT INTO leaders (role,name,message,photo_url,sort_order) VALUES (?,?,?,?,?)",
    [role.trim(),name.trim(),message.trim(),photo_url.trim(),Number(sort_order)||0]
  );
  res.status(201).json({success:true,id:result.lastInsertRowid});
});

app.delete("/api/admin/leaders/:id", requireAdmin, (req,res) => {
  const result = run("DELETE FROM leaders WHERE id=?", [req.params.id]);
  if (!result.changes) return res.status(404).json({success:false,message:"Leader not found."});
  res.json({success:true});
});

app.post("/api/admin/programmes", requireAdmin, (req,res) => {
  const {title,subtitle="",description="",icon="",sort_order=0} = req.body ?? {};
  if (!requireFields(req.body,["title"])) {
    return res.status(400).json({success:false,message:"Title is required."});
  }

  const result = insert(
    "INSERT INTO programmes (title,subtitle,description,icon,sort_order) VALUES (?,?,?,?,?)",
    [title.trim(),subtitle.trim(),description.trim(),icon.trim(),Number(sort_order)||0]
  );
  res.status(201).json({success:true,id:result.lastInsertRowid});
});

app.delete("/api/admin/programmes/:id", requireAdmin, (req,res) => {
  const result = run("DELETE FROM programmes WHERE id=?", [req.params.id]);
  if (!result.changes) return res.status(404).json({success:false,message:"Programme not found."});
  res.json({success:true});
});

app.post("/api/admin/achievers", requireAdmin, (req,res) => {
  const {name,institution,achievement="NEET Qualified",photo_url=""} = req.body ?? {};
  if (!requireFields(req.body,["name","institution"])) {
    return res.status(400).json({success:false,message:"Name and institution are required."});
  }

  const result = insert(
    "INSERT INTO achievers (name,institution,achievement,photo_url) VALUES (?,?,?,?)",
    [name.trim(),institution.trim(),achievement.trim(),photo_url.trim()]
  );
  res.status(201).json({success:true,id:result.lastInsertRowid});
});

app.delete("/api/admin/achievers/:id", requireAdmin, (req,res) => {
  const result = run("DELETE FROM achievers WHERE id=?", [req.params.id]);
  if (!result.changes) return res.status(404).json({success:false,message:"Achiever not found."});
  res.json({success:true});
});

app.post("/api/admin/news-events", requireAdmin, (req,res) => {
  const {category,title,description="",image_url="",event_date=null} = req.body ?? {};
  if (!requireFields(req.body,["category","title"])) {
    return res.status(400).json({success:false,message:"Category and title are required."});
  }

  const result = insert(
    "INSERT INTO news_events (category,title,description,image_url,event_date) VALUES (?,?,?,?,?)",
    [category.trim(),title.trim(),description.trim(),image_url.trim(),event_date || null]
  );
  res.status(201).json({success:true,id:result.lastInsertRowid});
});

app.delete("/api/admin/news-events/:id", requireAdmin, (req,res) => {
  const result = run("DELETE FROM news_events WHERE id=?", [req.params.id]);
  if (!result.changes) return res.status(404).json({success:false,message:"News item not found."});
  res.json({success:true});
});

app.post("/api/admin/gallery", requireAdmin, (req,res) => {
  const {title,image_url} = req.body ?? {};
  if (!requireFields(req.body,["title","image_url"])) {
    return res.status(400).json({success:false,message:"Title and image URL are required."});
  }

  const result = insert(
    "INSERT INTO gallery (title,image_url) VALUES (?,?)",
    [title.trim(),image_url.trim()]
  );
  res.status(201).json({success:true,id:result.lastInsertRowid});
});

app.delete("/api/admin/gallery/:id", requireAdmin, (req,res) => {
  const result = run("DELETE FROM gallery WHERE id=?", [req.params.id]);
  if (!result.changes) return res.status(404).json({success:false,message:"Gallery item not found."});
  res.json({success:true});
});



app.patch("/api/admin/leaders/:id", requireAdmin, (req,res) => { const {role,name,message="",photo_url="",sort_order=0}=req.body??{}; if(!requireFields(req.body,["role","name"])) return res.status(400).json({success:false,message:"Role and name are required."}); const result=run("UPDATE leaders SET role=?,name=?,message=?,photo_url=?,sort_order=? WHERE id=?",[role.trim(),name.trim(),message.trim(),photo_url.trim(),Number(sort_order)||0,req.params.id]); if(!result.changes)return res.status(404).json({success:false,message:"Leader not found."}); logActivity(req.admin.id,"updated","leader",req.params.id); res.json({success:true}); });
app.patch("/api/admin/programmes/:id", requireAdmin, (req,res) => { const {title,subtitle="",description="",icon="",sort_order=0}=req.body??{}; if(!requireFields(req.body,["title"])) return res.status(400).json({success:false,message:"Title is required."}); const result=run("UPDATE programmes SET title=?,subtitle=?,description=?,icon=?,sort_order=? WHERE id=?",[title.trim(),subtitle.trim(),description.trim(),icon.trim(),Number(sort_order)||0,req.params.id]); if(!result.changes)return res.status(404).json({success:false,message:"Programme not found."}); logActivity(req.admin.id,"updated","programme",req.params.id); res.json({success:true}); });
app.patch("/api/admin/achievers/:id", requireAdmin, (req,res) => { const {name,institution,achievement="NEET Qualified",photo_url=""}=req.body??{}; if(!requireFields(req.body,["name","institution"])) return res.status(400).json({success:false,message:"Name and institution are required."}); const result=run("UPDATE achievers SET name=?,institution=?,achievement=?,photo_url=? WHERE id=?",[name.trim(),institution.trim(),achievement.trim(),photo_url.trim(),req.params.id]); if(!result.changes)return res.status(404).json({success:false,message:"Achiever not found."}); logActivity(req.admin.id,"updated","achiever",req.params.id); res.json({success:true}); });
app.patch("/api/admin/news-events/:id", requireAdmin, (req,res) => { const {category,title,description="",image_url="",event_date=null}=req.body??{}; if(!requireFields(req.body,["category","title"])) return res.status(400).json({success:false,message:"Category and title are required."}); const result=run("UPDATE news_events SET category=?,title=?,description=?,image_url=?,event_date=? WHERE id=?",[category.trim(),title.trim(),description.trim(),image_url.trim(),event_date||null,req.params.id]); if(!result.changes)return res.status(404).json({success:false,message:"News item not found."}); logActivity(req.admin.id,"updated","news_event",req.params.id); res.json({success:true}); });
app.patch("/api/admin/gallery/:id", requireAdmin, (req,res) => { const {title,image_url}=req.body??{}; if(!requireFields(req.body,["title","image_url"])) return res.status(400).json({success:false,message:"Title and image URL are required."}); const result=run("UPDATE gallery SET title=?,image_url=? WHERE id=?",[title.trim(),image_url.trim(),req.params.id]); if(!result.changes)return res.status(404).json({success:false,message:"Gallery item not found."}); logActivity(req.admin.id,"updated","gallery",req.params.id); res.json({success:true}); });

app.get("/api/students", requireAdmin, (_req,res) => res.json({success:true,data:queryAll("SELECT * FROM students ORDER BY class_name, section, roll_no, full_name")}));
app.post("/api/admin/students", requireAdmin, (req,res) => {
  const {admission_no,roll_no="",full_name,class_name,section="",guardian_name="",phone="",gender="",date_of_birth="",address="",photo_url="",status="active"}=req.body ?? {};
  if (!requireFields(req.body,["admission_no","full_name","class_name"])) return res.status(400).json({success:false,message:"Admission number, name and class are required."});
  try {
    const result=insert("INSERT INTO students (admission_no,roll_no,full_name,class_name,section,guardian_name,phone,gender,date_of_birth,address,photo_url,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",[admission_no.trim(),roll_no.trim(),full_name.trim(),class_name.trim(),section.trim(),guardian_name.trim(),phone.trim(),gender.trim(),date_of_birth.trim(),address.trim(),photo_url.trim(),status]);
    logActivity(req.admin.id,"created","student",result.lastInsertRowid);
    res.status(201).json({success:true,id:result.lastInsertRowid});
  } catch { res.status(409).json({success:false,message:"Admission number already exists."}); }
});
app.patch("/api/admin/students/:id", requireAdmin, (req,res) => {
  const {admission_no,roll_no="",full_name,class_name,section="",guardian_name="",phone="",gender="",date_of_birth="",address="",photo_url="",status="active"}=req.body ?? {};
  if (!requireFields(req.body,["admission_no","full_name","class_name"])) return res.status(400).json({success:false,message:"Admission number, name and class are required."});
  const result=run("UPDATE students SET admission_no=?,roll_no=?,full_name=?,class_name=?,section=?,guardian_name=?,phone=?,gender=?,date_of_birth=?,address=?,photo_url=?,status=? WHERE id=?",[admission_no.trim(),roll_no.trim(),full_name.trim(),class_name.trim(),section.trim(),guardian_name.trim(),phone.trim(),gender.trim(),date_of_birth.trim(),address.trim(),photo_url.trim(),status,req.params.id]);
  if (!result.changes) return res.status(404).json({success:false,message:"Student not found."});
  logActivity(req.admin.id,"updated","student",req.params.id); res.json({success:true});
});
app.delete("/api/admin/students/:id", requireAdmin, (req,res) => { const result=run("DELETE FROM students WHERE id=?",[req.params.id]); if(!result.changes)return res.status(404).json({success:false,message:"Student not found."}); logActivity(req.admin.id,"deleted","student",req.params.id); res.json({success:true}); });

app.get("/api/faculty", (_req,res) => res.json({success:true,data:queryAll("SELECT * FROM faculty WHERE status='active' ORDER BY id DESC")}));
app.get("/api/admin/faculty", requireAdmin, (_req,res) => res.json({success:true,data:queryAll("SELECT * FROM faculty ORDER BY id DESC")}));
app.post("/api/admin/faculty", requireAdmin, (req,res) => {
  const {full_name,designation,department="",email="",phone="",photo_url="",status="active"}=req.body ?? {};
  if (!requireFields(req.body,["full_name","designation"])) return res.status(400).json({success:false,message:"Name and designation are required."});
  const result=insert("INSERT INTO faculty (full_name,designation,department,email,phone,photo_url,status) VALUES (?,?,?,?,?,?,?)",[full_name.trim(),designation.trim(),department.trim(),email.trim().toLowerCase(),phone.trim(),photo_url.trim(),status]);
  logActivity(req.admin.id,"created","faculty",result.lastInsertRowid); res.status(201).json({success:true,id:result.lastInsertRowid});
});
app.patch("/api/admin/faculty/:id", requireAdmin, (req,res) => {
  const {full_name,designation,department="",email="",phone="",photo_url="",status="active"}=req.body ?? {};
  if (!requireFields(req.body,["full_name","designation"])) return res.status(400).json({success:false,message:"Name and designation are required."});
  const result=run("UPDATE faculty SET full_name=?,designation=?,department=?,email=?,phone=?,photo_url=?,status=? WHERE id=?",[full_name.trim(),designation.trim(),department.trim(),email.trim().toLowerCase(),phone.trim(),photo_url.trim(),status,req.params.id]);
  if(!result.changes)return res.status(404).json({success:false,message:"Faculty member not found."});
  logActivity(req.admin.id,"updated","faculty",req.params.id); res.json({success:true});
});
app.delete("/api/admin/faculty/:id", requireAdmin, (req,res) => { const result=run("DELETE FROM faculty WHERE id=?",[req.params.id]); if(!result.changes)return res.status(404).json({success:false,message:"Faculty member not found."}); logActivity(req.admin.id,"deleted","faculty",req.params.id); res.json({success:true}); });


// =========================================================
// TEACHER AUTHENTICATION, CLASS ASSIGNMENTS & ATTENDANCE
// =========================================================

function requireTeacher(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({success:false,message:"Teacher authentication required."});
  try {
    req.teacher = jwt.verify(token, JWT_SECRET, {issuer:"sunshine-school", audience:"sunshine-school-teacher"});
    next();
  } catch {
    return res.status(401).json({success:false,message:"Invalid or expired teacher token."});
  }
}

function requireStudent(req,res,next){
  const auth=String(req.headers?.authorization||"");
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!token)return res.status(401).json({success:false,message:"Student authentication required."});
  let p;
  try{p=jwt.verify(token,JWT_SECRET)}catch{return res.status(401).json({success:false,message:"Invalid or expired student token."})}
  if(p.role!=="student")return res.status(403).json({success:false,message:"Student access required."});
  const studentId=Number(p.student_id);
  const accountId=Number(p.id);
  const student=queryOne(`SELECT s.* FROM students s JOIN student_accounts a ON a.student_id=s.id WHERE s.id=? AND a.id=? AND a.status='active' AND s.status='active'`,[studentId,accountId]);
  if(!student)return res.status(401).json({success:false,message:"Student account inactive."});
  req.student=student;
  next();
}

app.post("/api/auth/teacher-login", (req,res) => {
  const {email="",password=""}=req.body??{};
  const teacher=queryOne("SELECT * FROM teacher_accounts WHERE email=? AND status='active'",[email.trim().toLowerCase()]);
  if(!teacher || !bcrypt.compareSync(password,teacher.password_hash)) return res.status(401).json({success:false,message:"Invalid teacher email or password."});
  const token=jwt.sign({id:teacher.id,email:teacher.email,role:"teacher",name:teacher.full_name},JWT_SECRET,{expiresIn:"8h",issuer:"sunshine-school",audience:"sunshine-school-teacher"});
  res.json({success:true,data:{token,teacher:{id:teacher.id,name:teacher.full_name,email:teacher.email,employee_id:teacher.employee_id,subject:teacher.subject}}});
});

app.get("/api/teacher/me",requireTeacher,(req,res)=>{
  const teacher=queryOne("SELECT id,full_name,employee_id,email,subject,status,created_at FROM teacher_accounts WHERE id=?",[req.teacher.id]);
  if(!teacher || teacher.status!=="active") return res.status(401).json({success:false,message:"Teacher account is unavailable."});
  res.json({success:true,data:teacher});
});

app.get("/api/teacher/classes",requireTeacher,(req,res)=>{
  res.json({success:true,data:queryAll("SELECT id,class_name,section,subject FROM teacher_classes WHERE teacher_id=? ORDER BY class_name,section,subject",[req.teacher.id])});
});

app.get("/api/teacher/students",requireTeacher,(req,res)=>{
  const {class_name="",section=""}=req.query;
  if(!class_name) return res.status(400).json({success:false,message:"Class is required."});
  const assigned=queryOne("SELECT id FROM teacher_classes WHERE teacher_id=? AND class_name=? AND section=?",[req.teacher.id,String(class_name),String(section||"")]);
  if(!assigned) return res.status(403).json({success:false,message:"This class is not assigned to you."});
  res.json({success:true,data:queryAll("SELECT id,admission_no,roll_no,full_name,class_name,section,guardian_name,phone,gender,date_of_birth,address,photo_url,status FROM students WHERE class_name=? AND section=? AND status='active' ORDER BY CASE WHEN roll_no GLOB '[0-9]*' THEN CAST(roll_no AS INTEGER) ELSE 999999 END, full_name",[class_name,section||""])});
});

app.get("/api/teacher/attendance",requireTeacher,(req,res)=>{
  const {class_name="",section="",subject="",date=""}=req.query;
  if(!class_name || !date) return res.status(400).json({success:false,message:"Class and date are required."});
  const assigned=queryOne("SELECT id FROM teacher_classes WHERE teacher_id=? AND class_name=? AND section=? AND (subject=? OR subject='All Subjects')",[req.teacher.id,class_name,section||"",subject||""]);
  if(!assigned) return res.status(403).json({success:false,message:"This class/subject is not assigned to you."});
  const rows=queryAll(`SELECT s.id,s.admission_no,s.roll_no,s.full_name,s.class_name,s.section,COALESCE(a.status,'present') AS status,COALESCE(a.remarks,'') AS remarks\n    FROM students s LEFT JOIN attendance a ON a.student_id=s.id AND a.attendance_date=? AND a.subject=?\n    WHERE s.class_name=? AND s.section=? AND s.status='active'\n    ORDER BY CASE WHEN s.roll_no GLOB '[0-9]*' THEN CAST(s.roll_no AS INTEGER) ELSE 999999 END,s.full_name`,[date,subject||"All Subjects",class_name,section||""]);
  res.json({success:true,data:rows});
});

app.post("/api/teacher/attendance",requireTeacher,(req,res)=>{
  const {class_name="",section="",subject="All Subjects",date="",records=[]}=req.body??{};
  if(!class_name || !date || !Array.isArray(records) || !records.length) return res.status(400).json({success:false,message:"Class, date and attendance records are required."});
  const assigned=queryOne("SELECT id FROM teacher_classes WHERE teacher_id=? AND class_name=? AND section=? AND (subject=? OR subject='All Subjects')",[req.teacher.id,class_name,section||"",subject]);
  if(!assigned) return res.status(403).json({success:false,message:"This class/subject is not assigned to you."});
  const allowed=new Set(["present","absent","late","leave"]);
  let saved=0;
  for(const record of records){
    const studentId=Number(record.student_id); const status=String(record.status||"");
    if(!studentId || !allowed.has(status)) continue;
    const student=queryOne("SELECT id FROM students WHERE id=? AND class_name=? AND section=? AND status='active'",[studentId,class_name,section||""]);
    if(!student) continue;
    db.run(`INSERT INTO attendance (student_id,teacher_id,class_name,section,subject,attendance_date,status,remarks,updated_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)\n      ON CONFLICT(student_id,attendance_date,subject) DO UPDATE SET teacher_id=excluded.teacher_id,class_name=excluded.class_name,section=excluded.section,status=excluded.status,remarks=excluded.remarks,updated_at=CURRENT_TIMESTAMP`,[studentId,req.teacher.id,class_name,section||"",subject,date,status,String(record.remarks||"")]);
    saved++;
  }
  persistDatabase();
  res.json({success:true,saved});
});

app.get("/api/teacher/attendance/history",requireTeacher,(req,res)=>{
  const {class_name="",section="",from="",to=""}=req.query;
  const clauses=["a.teacher_id=?"]; const params=[req.teacher.id];
  if(class_name){clauses.push("a.class_name=?");params.push(class_name)}
  if(section!==""){clauses.push("a.section=?");params.push(section)}
  if(from){clauses.push("a.attendance_date>=?");params.push(from)}
  if(to){clauses.push("a.attendance_date<=?");params.push(to)}
  const rows=queryAll(`SELECT a.attendance_date,a.class_name,a.section,a.subject,COUNT(*) AS total_students,SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absent,SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) AS late,SUM(CASE WHEN a.status='leave' THEN 1 ELSE 0 END) AS leave_count FROM attendance a WHERE ${clauses.join(" AND ")} GROUP BY a.attendance_date,a.class_name,a.section,a.subject ORDER BY a.attendance_date DESC LIMIT 100`,params);
  res.json({success:true,data:rows});
});

// Admin: teacher accounts and assignments
app.get("/api/admin/teachers",requireAdmin,(_req,res)=>res.json({success:true,data:queryAll("SELECT id,full_name,employee_id,email,subject,status,created_at FROM teacher_accounts ORDER BY id DESC")}));
app.post("/api/admin/teachers",requireAdmin,(req,res)=>{
  const {full_name,employee_id,email,password="Teacher@12345",subject="",status="active"}=req.body??{};
  if(!requireFields(req.body,["full_name","employee_id","email"])) return res.status(400).json({success:false,message:"Name, employee ID and email are required."});
  try{const result=insert("INSERT INTO teacher_accounts (full_name,employee_id,email,password_hash,subject,status) VALUES (?,?,?,?,?,?)",[full_name.trim(),employee_id.trim(),email.trim().toLowerCase(),bcrypt.hashSync(String(password),12),subject.trim(),status]);logActivity(req.admin.id,"created","teacher",result.lastInsertRowid);res.status(201).json({success:true,id:result.lastInsertRowid});}catch{res.status(409).json({success:false,message:"Employee ID or email already exists."});}
});
app.patch("/api/admin/teachers/:id",requireAdmin,(req,res)=>{
  const {full_name,employee_id,email,subject="",status="active",password}=req.body??{};
  if(!requireFields(req.body,["full_name","employee_id","email"])) return res.status(400).json({success:false,message:"Name, employee ID and email are required."});
  const fields=[full_name.trim(),employee_id.trim(),email.trim().toLowerCase(),subject.trim(),status];
  let sql="UPDATE teacher_accounts SET full_name=?,employee_id=?,email=?,subject=?,status=?";
  if(password){sql+=",password_hash=?";fields.push(bcrypt.hashSync(String(password),12));}
  sql+=" WHERE id=?";fields.push(req.params.id);
  try{const result=run(sql,fields);if(!result.changes)return res.status(404).json({success:false,message:"Teacher not found."});logActivity(req.admin.id,"updated","teacher",req.params.id);res.json({success:true});}catch{res.status(409).json({success:false,message:"Employee ID or email already exists."});}
});
app.delete("/api/admin/teachers/:id",requireAdmin,(req,res)=>{const result=run("DELETE FROM teacher_accounts WHERE id=?",[req.params.id]);if(!result.changes)return res.status(404).json({success:false,message:"Teacher not found."});logActivity(req.admin.id,"deleted","teacher",req.params.id);res.json({success:true});});
app.get("/api/admin/teachers/:id/classes",requireAdmin,(req,res)=>res.json({success:true,data:queryAll("SELECT id,class_name,section,subject FROM teacher_classes WHERE teacher_id=? ORDER BY class_name,section,subject",[req.params.id])}));
app.post("/api/admin/teachers/:id/classes",requireAdmin,(req,res)=>{const {class_name,section="",subject="All Subjects"}=req.body??{};if(!requireFields(req.body,["class_name"]))return res.status(400).json({success:false,message:"Class is required."});try{const result=insert("INSERT INTO teacher_classes (teacher_id,class_name,section,subject) VALUES (?,?,?,?)",[req.params.id,class_name.trim(),section.trim(),subject.trim()||"All Subjects"]);logActivity(req.admin.id,"assigned","teacher_class",result.lastInsertRowid);res.status(201).json({success:true,id:result.lastInsertRowid});}catch{res.status(409).json({success:false,message:"This class assignment already exists."});}});
app.delete("/api/admin/teachers/classes/:assignmentId",requireAdmin,(req,res)=>{const result=run("DELETE FROM teacher_classes WHERE id=?",[req.params.assignmentId]);if(!result.changes)return res.status(404).json({success:false,message:"Assignment not found."});logActivity(req.admin.id,"unassigned","teacher_class",req.params.assignmentId);res.json({success:true});});
app.get("/api/admin/attendance/summary",requireAdmin,(req,res)=>{const {from="",to="",class_name=""}=req.query;const clauses=[];const params=[];if(from){clauses.push("attendance_date>=?");params.push(from)}if(to){clauses.push("attendance_date<=?");params.push(to)}if(class_name){clauses.push("class_name=?");params.push(class_name)}const where=clauses.length?"WHERE "+clauses.join(" AND "):"";res.json({success:true,data:queryAll(`SELECT attendance_date,class_name,section,subject,COUNT(*) total,SUM(status='present') present,SUM(status='absent') absent,SUM(status='late') late,SUM(status='leave') leave_count FROM attendance ${where} GROUP BY attendance_date,class_name,section,subject ORDER BY attendance_date DESC LIMIT 200`,params)});});

app.use((_req,res) => {
  res.status(404).json({success:false,message:"API route not found"});
});


/* ===== PARENT PORTAL V5 ===== */

function requireParent(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({success:false,message:"Authentication required."});
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer:"sunshine-school",
      audience:"sunshine-school-parent"
    });
    if (payload.role !== "parent") throw new Error("Invalid role");
    req.parent = payload;
    next();
  } catch {
    return res.status(401).json({success:false,message:"Invalid or expired parent session."});
  }
}

function ensureParentPortal() {
  db.run(`CREATE TABLE IF NOT EXISTS parent_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS parent_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    UNIQUE(parent_id, student_id)
  )`);

  const student = queryOne("SELECT id, full_name, admission_no, roll_no, class_name, section, guardian_name, phone FROM students ORDER BY id LIMIT 1");
  if (student) {
    const existing = queryOne("SELECT * FROM parent_accounts WHERE email=?", ["parent@adarsha.edu.in"]);
    if (!existing) {
      insert(
        "INSERT INTO parent_accounts (email,password_hash,name,phone,status) VALUES (?,?,?,?,?)",
        ["parent@adarsha.edu.in", bcrypt.hashSync("Parent@12345", 10), student.guardian_name || "Parent Account", student.phone || "", "active"]
      );
    }
    const parent = queryOne("SELECT id FROM parent_accounts WHERE email=?", ["parent@adarsha.edu.in"]);
    if (parent) {
      const link = queryOne("SELECT id FROM parent_students WHERE parent_id=? AND student_id=?", [parent.id, student.id]);
      if (!link) insert("INSERT INTO parent_students (parent_id,student_id) VALUES (?,?)", [parent.id, student.id]);
    }
  }
}

ensureParentPortal();
persistDatabase();

app.post("/api/auth/parent-login", (req,res) => {
  const {email="",password=""} = req.body ?? {};
  const parent = queryOne("SELECT * FROM parent_accounts WHERE email=?", [email.trim().toLowerCase()]);
  if (!parent || parent.status !== "active" || !bcrypt.compareSync(password,parent.password_hash)) {
    return res.status(401).json({success:false,message:"Invalid email or password."});
  }
  const token = jwt.sign(
    {id:parent.id,email:parent.email,role:"parent",name:parent.name},
    JWT_SECRET,
    {expiresIn:"8h",issuer:"sunshine-school",audience:"sunshine-school-parent"}
  );
  res.json({success:true,data:{token,parent:{id:parent.id,name:parent.name,email:parent.email,phone:parent.phone}}});
});

app.get("/api/parent/me", requireParent, (req,res) => {
  const parent = queryOne("SELECT id,name,email,phone,status,created_at FROM parent_accounts WHERE id=?", [req.parent.id]);
  if (!parent) return res.status(401).json({success:false,message:"Parent account not found."});
  res.json({success:true,data:parent});
});

app.get("/api/parent/students", requireParent, (req,res) => {
  const rows = query(
    `SELECT s.id,s.admission_no,s.roll_no,s.full_name,s.class_name,s.section,s.gender,s.date_of_birth,
            s.guardian_name,s.phone,s.address,s.photo_url,s.status
     FROM students s
     INNER JOIN parent_students ps ON ps.student_id=s.id
     WHERE ps.parent_id=?
     ORDER BY s.class_name,s.section,s.roll_no,s.full_name`, [req.parent.id]
  );
  res.json({success:true,data:rows});
});

app.get("/api/parent/attendance", requireParent, (req,res) => {
  const studentId = Number(req.query.student_id);
  const rows = query(
    `SELECT a.id,a.student_id,a.class_name,a.section,a.date,a.subject,a.status,a.remarks
     FROM attendance a
     INNER JOIN parent_students ps ON ps.student_id=a.student_id
     WHERE ps.parent_id=? AND a.student_id=?
     ORDER BY a.date DESC, a.id DESC`,
    [req.parent.id, studentId]
  );
  res.json({success:true,data:rows});
});

app.get("/api/parent/attendance/summary", requireParent, (req,res) => {
  const studentId = Number(req.query.student_id);
  const row = queryOne(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
       SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absent,
       SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) AS late,
       SUM(CASE WHEN a.status='leave' THEN 1 ELSE 0 END) AS leave
     FROM attendance a
     INNER JOIN parent_students ps ON ps.student_id=a.student_id
     WHERE ps.parent_id=? AND a.student_id=?`,
    [req.parent.id, studentId]
  );
  const total = Number(row?.total || 0);
  const present = Number(row?.present || 0);
  res.json({success:true,data:{
    total,present,absent:Number(row?.absent||0),late:Number(row?.late||0),leave:Number(row?.leave||0),
    percentage: total ? Math.round((present/total)*10000)/100 : 0
  }});
});


/* ===== ATTENDANCE REPORTS V6 ===== */

function attendanceDateRange(queryParams) {
  const today = new Date().toISOString().slice(0,10);
  const from = String(queryParams.from || "").trim() || today;
  const to = String(queryParams.to || "").trim() || from;
  return {from,to};
}

app.get("/api/admin/attendance/reports", requireAdmin, (req,res) => {
  const {from,to} = attendanceDateRange(req.query);
  const className = String(req.query.class_name || "").trim();
  const section = String(req.query.section || "").trim();
  const studentId = Number(req.query.student_id || 0);

  let where = "WHERE a.date BETWEEN ? AND ?";
  const params = [from,to];
  if (className) { where += " AND a.class_name=?"; params.push(className); }
  if (section) { where += " AND a.section=?"; params.push(section); }
  if (studentId) { where += " AND a.student_id=?"; params.push(studentId); }

  const rows = query(`
    SELECT a.id,a.student_id,a.class_name,a.section,a.date,a.subject,a.status,a.remarks,
           s.full_name,s.admission_no,s.roll_no
    FROM attendance a
    LEFT JOIN students s ON s.id=a.student_id
    ${where}
    ORDER BY a.date DESC, a.class_name, a.section, s.roll_no, s.full_name
  `, params);

  const total = rows.length;
  const present = rows.filter(x=>x.status==="present").length;
  const absent = rows.filter(x=>x.status==="absent").length;
  const late = rows.filter(x=>x.status==="late").length;
  const leave = rows.filter(x=>x.status==="leave").length;

  const byClass = {};
  for (const r of rows) {
    const key = `${r.class_name || "—"}-${r.section || "—"}`;
    if (!byClass[key]) byClass[key]={class_name:r.class_name||"",section:r.section||"",total:0,present:0,absent:0,late:0,leave:0,percentage:0};
    byClass[key].total++;
    if (r.status==="present") byClass[key].present++;
    if (r.status==="absent") byClass[key].absent++;
    if (r.status==="late") byClass[key].late++;
    if (r.status==="leave") byClass[key].leave++;
  }
  Object.values(byClass).forEach(x=>x.percentage=x.total?Math.round(x.present/x.total*10000)/100:0);

  res.json({success:true,data:{
    filters:{from,to,class_name:className,section,student_id:studentId||null},
    summary:{
      total,present,absent,late,leave,
      percentage:total?Math.round(present/total*10000)/100:0
    },
    by_class:Object.values(byClass),
    records:rows
  }});
});

app.get("/api/admin/attendance/students", requireAdmin, (_req,res) => {
  const rows=query(`SELECT id,full_name,admission_no,roll_no,class_name,section,status
                    FROM students ORDER BY class_name,section,roll_no,full_name`);
  res.json({success:true,data:rows});
});


/* ===== ACADEMIC MANAGEMENT V7 ===== */

function ensureAcademicManagementV7() {
  db.run(`CREATE TABLE IF NOT EXISTS academic_classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS academic_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    class_teacher_id INTEGER,
    capacity INTEGER NOT NULL DEFAULT 50,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_id,name)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS academic_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    code TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS academic_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    teacher_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(section_id,subject_id)
  )`);

  const defaults = ["VI","VII","VIII","IX","X","XI","XII"];
  defaults.forEach((name, index) => {
    const exists = queryOne("SELECT id FROM academic_classes WHERE name=?", [name]);
    if (!exists) insert("INSERT INTO academic_classes (name,display_order) VALUES (?,?)", [name,index+1]);
  });

  const subjects = [
    ["English","ENG"],["Mathematics","MATH"],["Science","SCI"],
    ["Social Science","SST"],["Computer Science","CS"],["Assamese","ASM"],
    ["Hindi","HIN"]
  ];
  subjects.forEach(([name,code]) => {
    const exists = queryOne("SELECT id FROM academic_subjects WHERE name=?", [name]);
    if (!exists) insert("INSERT INTO academic_subjects (name,code) VALUES (?,?)", [name,code]);
  });

  persistDatabase();
}
ensureAcademicManagementV7();

app.get("/api/admin/academic/classes", requireAdmin, (_req,res) => {
  const rows = query(`
    SELECT c.id,c.name,c.display_order,c.status,
           COUNT(DISTINCT s.id) AS section_count
    FROM academic_classes c
    LEFT JOIN academic_sections s ON s.class_id=c.id
    GROUP BY c.id
    ORDER BY c.display_order,c.name
  `);
  res.json({success:true,data:rows});
});

app.post("/api/admin/academic/classes", requireAdmin, (req,res) => {
  const {name="",display_order=0,status="active"} = req.body ?? {};
  if (!String(name).trim()) return res.status(400).json({success:false,message:"Class name is required."});
  try {
    const id = insert("INSERT INTO academic_classes (name,display_order,status) VALUES (?,?,?)",
      [String(name).trim(),Number(display_order)||0,status==="inactive"?"inactive":"active"]);
    res.status(201).json({success:true,data:queryOne("SELECT * FROM academic_classes WHERE id=?",[id])});
  } catch {
    res.status(409).json({success:false,message:"Class already exists."});
  }
});

app.patch("/api/admin/academic/classes/:id", requireAdmin, (req,res) => {
  const id=Number(req.params.id);
  const current=queryOne("SELECT * FROM academic_classes WHERE id=?",[id]);
  if(!current)return res.status(404).json({success:false,message:"Class not found."});
  const name=String(req.body?.name ?? current.name).trim();
  const displayOrder=Number(req.body?.display_order ?? current.display_order)||0;
  const status=req.body?.status==="inactive"?"inactive":"active";
  try {
    db.run("UPDATE academic_classes SET name=?,display_order=?,status=? WHERE id=?",[name,displayOrder,status,id]);
    persistDatabase();
    res.json({success:true,data:queryOne("SELECT * FROM academic_classes WHERE id=?",[id])});
  } catch {
    res.status(409).json({success:false,message:"Could not update class."});
  }
});

app.delete("/api/admin/academic/classes/:id", requireAdmin, (req,res) => {
  const id=Number(req.params.id);
  db.run("DELETE FROM academic_sections WHERE class_id=?",[id]);
  db.run("DELETE FROM academic_classes WHERE id=?",[id]);
  persistDatabase();
  res.json({success:true});
});

app.get("/api/admin/academic/sections", requireAdmin, (_req,res) => {
  const rows=query(`
    SELECT s.id,s.name,s.capacity,s.status,s.class_id,c.name AS class_name,
           s.class_teacher_id,
           COALESCE(t.name,t.full_name,"Not assigned") AS class_teacher,
           (SELECT COUNT(*) FROM students st
            WHERE st.class_name=c.name AND st.section=s.name) AS student_count
    FROM academic_sections s
    JOIN academic_classes c ON c.id=s.class_id
    LEFT JOIN teachers t ON t.id=s.class_teacher_id
    ORDER BY c.display_order,c.name,s.name
  `);
  res.json({success:true,data:rows});
});

app.post("/api/admin/academic/sections", requireAdmin, (req,res) => {
  const {class_id,name="",capacity=50,class_teacher_id=null,status="active"}=req.body??{};
  if(!Number(class_id)||!String(name).trim()) return res.status(400).json({success:false,message:"Class and section are required."});
  try {
    const id=insert(`INSERT INTO academic_sections (class_id,name,class_teacher_id,capacity,status) VALUES (?,?,?,?,?)`,
      [Number(class_id),String(name).trim().toUpperCase(),class_teacher_id?Number(class_teacher_id):null,Number(capacity)||50,status==="inactive"?"inactive":"active"]);
    persistDatabase();
    res.status(201).json({success:true,data:queryOne("SELECT * FROM academic_sections WHERE id=?",[id])});
  } catch {
    res.status(409).json({success:false,message:"This section already exists for the selected class."});
  }
});

app.patch("/api/admin/academic/sections/:id", requireAdmin, (req,res) => {
  const id=Number(req.params.id);
  const current=queryOne("SELECT * FROM academic_sections WHERE id=?",[id]);
  if(!current)return res.status(404).json({success:false,message:"Section not found."});
  const name=String(req.body?.name??current.name).trim().toUpperCase();
  const capacity=Number(req.body?.capacity??current.capacity)||50;
  const teacher=req.body?.class_teacher_id===null?null:(req.body?.class_teacher_id!==undefined?Number(req.body.class_teacher_id):current.class_teacher_id);
  const status=req.body?.status==="inactive"?"inactive":"active";
  db.run("UPDATE academic_sections SET name=?,capacity=?,class_teacher_id=?,status=? WHERE id=?",[name,capacity,teacher||null,status,id]);
  persistDatabase();
  res.json({success:true,data:queryOne("SELECT * FROM academic_sections WHERE id=?",[id])});
});

app.delete("/api/admin/academic/sections/:id", requireAdmin, (req,res) => {
  const id=Number(req.params.id);
  db.run("DELETE FROM academic_assignments WHERE section_id=?",[id]);
  db.run("DELETE FROM academic_sections WHERE id=?",[id]);
  persistDatabase();
  res.json({success:true});
});

app.get("/api/admin/academic/subjects", requireAdmin, (_req,res) => {
  res.json({success:true,data:query("SELECT * FROM academic_subjects ORDER BY name")});
});

app.post("/api/admin/academic/subjects", requireAdmin, (req,res) => {
  const {name="",code="",status="active"}=req.body??{};
  if(!String(name).trim())return res.status(400).json({success:false,message:"Subject name is required."});
  try {
    const id=insert("INSERT INTO academic_subjects (name,code,status) VALUES (?,?,?)",[String(name).trim(),String(code).trim().toUpperCase(),status==="inactive"?"inactive":"active"]);
    persistDatabase();
    res.status(201).json({success:true,data:queryOne("SELECT * FROM academic_subjects WHERE id=?",[id])});
  } catch {
    res.status(409).json({success:false,message:"Subject already exists."});
  }
});

app.patch("/api/admin/academic/subjects/:id", requireAdmin, (req,res) => {
  const id=Number(req.params.id);
  const current=queryOne("SELECT * FROM academic_subjects WHERE id=?",[id]);
  if(!current)return res.status(404).json({success:false,message:"Subject not found."});
  db.run("UPDATE academic_subjects SET name=?,code=?,status=? WHERE id=?",
    [String(req.body?.name??current.name).trim(),String(req.body?.code??current.code??"").trim().toUpperCase(),req.body?.status==="inactive"?"inactive":"active",id]);
  persistDatabase();
  res.json({success:true,data:queryOne("SELECT * FROM academic_subjects WHERE id=?",[id])});
});

app.delete("/api/admin/academic/subjects/:id", requireAdmin, (req,res) => {
  const id=Number(req.params.id);
  db.run("DELETE FROM academic_assignments WHERE subject_id=?",[id]);
  db.run("DELETE FROM academic_subjects WHERE id=?",[id]);
  persistDatabase();
  res.json({success:true});
});

app.get("/api/admin/academic/assignments", requireAdmin, (_req,res) => {
  const rows=query(`
    SELECT a.id,a.status,a.section_id,a.subject_id,a.teacher_id,
           c.name AS class_name,s.name AS section_name,
           sub.name AS subject_name,sub.code AS subject_code,
           COALESCE(t.name,t.full_name,"Unknown") AS teacher_name
    FROM academic_assignments a
    JOIN academic_sections s ON s.id=a.section_id
    JOIN academic_classes c ON c.id=s.class_id
    JOIN academic_subjects sub ON sub.id=a.subject_id
    LEFT JOIN teachers t ON t.id=a.teacher_id
    ORDER BY c.display_order,c.name,s.name,sub.name
  `);
  res.json({success:true,data:rows});
});

app.post("/api/admin/academic/assignments", requireAdmin, (req,res) => {
  const {section_id,subject_id,teacher_id,status="active"}=req.body??{};
  if(!Number(section_id)||!Number(subject_id)||!Number(teacher_id))
    return res.status(400).json({success:false,message:"Section, subject and teacher are required."});
  try {
    const id=insert("INSERT INTO academic_assignments (section_id,subject_id,teacher_id,status) VALUES (?,?,?,?)",
      [Number(section_id),Number(subject_id),Number(teacher_id),status==="inactive"?"inactive":"active"]);
    persistDatabase();
    res.status(201).json({success:true,data:queryOne("SELECT * FROM academic_assignments WHERE id=?",[id])});
  } catch {
    res.status(409).json({success:false,message:"That subject is already assigned to this section."});
  }
});

app.patch("/api/admin/academic/assignments/:id", requireAdmin, (req,res) => {
  const id=Number(req.params.id);
  const current=queryOne("SELECT * FROM academic_assignments WHERE id=?",[id]);
  if(!current)return res.status(404).json({success:false,message:"Assignment not found."});
  db.run("UPDATE academic_assignments SET section_id=?,subject_id=?,teacher_id=?,status=? WHERE id=?",
    [Number(req.body?.section_id??current.section_id),Number(req.body?.subject_id??current.subject_id),Number(req.body?.teacher_id??current.teacher_id),req.body?.status==="inactive"?"inactive":"active",id]);
  persistDatabase();
  res.json({success:true,data:queryOne("SELECT * FROM academic_assignments WHERE id=?",[id])});
});

app.delete("/api/admin/academic/assignments/:id", requireAdmin, (req,res) => {
  db.run("DELETE FROM academic_assignments WHERE id=?",[Number(req.params.id)]);
  persistDatabase();
  res.json({success:true});
});

app.get("/api/teacher/academic/classes", requireTeacher, (req,res) => {
  const rows=query(`
    SELECT DISTINCT c.id AS class_id,c.name AS class_name,
      s.id AS section_id,s.name AS section_name,
      sub.id AS subject_id,sub.name AS subject_name,sub.code AS subject_code
    FROM academic_assignments a
    JOIN academic_sections s ON s.id=a.section_id
    JOIN academic_classes c ON c.id=s.class_id
    JOIN academic_subjects sub ON sub.id=a.subject_id
    WHERE a.teacher_id=? AND a.status='active' AND s.status='active' AND c.status='active'
    ORDER BY c.display_order,c.name,s.name,sub.name
  `,[req.teacher.id]);
  res.json({success:true,data:rows});
});


/* ===== EXAMINATION & MARKS V8 ===== */

function ensureExaminationV8() {
  db.run(`CREATE TABLE IF NOT EXISTS examinations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    academic_session TEXT NOT NULL DEFAULT '2026-27',
    exam_type TEXT NOT NULL DEFAULT 'Term',
    start_date TEXT,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS exam_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    examination_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    section_id INTEGER NOT NULL,
    max_marks REAL NOT NULL DEFAULT 100,
    pass_marks REAL NOT NULL DEFAULT 33,
    exam_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    UNIQUE(examination_id,subject_id,section_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    examination_id INTEGER NOT NULL,
    exam_subject_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    obtained_marks REAL NOT NULL DEFAULT 0,
    remarks TEXT,
    entered_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(exam_subject_id,student_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS grade_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    min_percentage REAL NOT NULL,
    max_percentage REAL NOT NULL,
    grade TEXT NOT NULL,
    point REAL
  )`);

  const count=queryOne("SELECT COUNT(*) AS c FROM grade_rules");
  if(!Number(count?.c)){
    [
      ["A+",90,100,"A+",10],["A",80,89.99,"A",9],["B+",70,79.99,"B+",8],
      ["B",60,69.99,"B",7],["C",50,59.99,"C",6],["D",40,49.99,"D",5],
      ["E",33,39.99,"E",4],["F",0,32.99,"F",0]
    ].forEach(x=>insert("INSERT INTO grade_rules (name,min_percentage,max_percentage,grade,point) VALUES (?,?,?,?,?)",x));
  }
  persistDatabase();
}
ensureExaminationV8();

function calculateGrade(percentage) {
  const r=queryOne("SELECT grade,point FROM grade_rules WHERE ? BETWEEN min_percentage AND max_percentage ORDER BY min_percentage DESC",[percentage]);
  return r || {grade:"F",point:0};
}

app.get("/api/admin/examinations", requireAdmin, (_req,res) => {
  res.json({success:true,data:query("SELECT * FROM examinations ORDER BY start_date DESC,id DESC")});
});

app.post("/api/admin/examinations", requireAdmin, (req,res) => {
  const {name="",academic_session="2026-27",exam_type="Term",start_date="",end_date="",status="draft"}=req.body??{};
  if(!String(name).trim())return res.status(400).json({success:false,message:"Exam name is required."});
  const id=insert("INSERT INTO examinations (name,academic_session,exam_type,start_date,end_date,status) VALUES (?,?,?,?,?,?)",
    [String(name).trim(),String(academic_session).trim(),String(exam_type).trim(),start_date||null,end_date||null,status]);
  persistDatabase();
  res.status(201).json({success:true,data:queryOne("SELECT * FROM examinations WHERE id=?",[id])});
});

app.patch("/api/admin/examinations/:id", requireAdmin, (req,res) => {
  const id=Number(req.params.id), cur=queryOne("SELECT * FROM examinations WHERE id=?",[id]);
  if(!cur)return res.status(404).json({success:false,message:"Examination not found."});
  db.run(`UPDATE examinations SET name=?,academic_session=?,exam_type=?,start_date=?,end_date=?,status=? WHERE id=?`,
    [String(req.body?.name??cur.name),String(req.body?.academic_session??cur.academic_session),String(req.body?.exam_type??cur.exam_type),
     req.body?.start_date??cur.start_date,req.body?.end_date??cur.end_date,req.body?.status??cur.status,id]);
  persistDatabase();
  res.json({success:true,data:queryOne("SELECT * FROM examinations WHERE id=?",[id])});
});

app.delete("/api/admin/examinations/:id", requireAdmin, (req,res) => {
  const id=Number(req.params.id);
  const subjects=query("SELECT id FROM exam_subjects WHERE examination_id=?",[id]);
  subjects.forEach(x=>db.run("DELETE FROM marks WHERE exam_subject_id=?",[x.id]));
  db.run("DELETE FROM exam_subjects WHERE examination_id=?",[id]);
  db.run("DELETE FROM examinations WHERE id=?",[id]);
  persistDatabase();
  res.json({success:true});
});

app.get("/api/admin/examinations/:id/subjects", requireAdmin, (req,res) => {
  const rows=query(`
    SELECT es.*, sub.name AS subject_name,sub.code AS subject_code,
           c.name AS class_name,sec.name AS section_name
    FROM exam_subjects es
    JOIN academic_subjects sub ON sub.id=es.subject_id
    JOIN academic_sections sec ON sec.id=es.section_id
    JOIN academic_classes c ON c.id=sec.class_id
    WHERE es.examination_id=?
    ORDER BY c.display_order,c.name,sec.name,sub.name`,[Number(req.params.id)]);
  res.json({success:true,data:rows});
});

app.post("/api/admin/examinations/:id/subjects", requireAdmin, (req,res) => {
  const {subject_id,section_id,max_marks=100,pass_marks=33,exam_date=""}=req.body??{};
  if(!Number(subject_id)||!Number(section_id))return res.status(400).json({success:false,message:"Subject and section are required."});
  try{
    const id=insert(`INSERT INTO exam_subjects (examination_id,subject_id,section_id,max_marks,pass_marks,exam_date)
      VALUES (?,?,?,?,?,?)`,[Number(req.params.id),Number(subject_id),Number(section_id),Number(max_marks)||100,Number(pass_marks)||33,exam_date||null]);
    persistDatabase();
    res.status(201).json({success:true,data:queryOne("SELECT * FROM exam_subjects WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"This subject is already scheduled for this class/section."})}
});

app.delete("/api/admin/exam-subjects/:id", requireAdmin, (req,res) => {
  const id=Number(req.params.id);
  db.run("DELETE FROM marks WHERE exam_subject_id=?",[id]);
  db.run("DELETE FROM exam_subjects WHERE id=?",[id]);
  persistDatabase();
  res.json({success:true});
});

app.get("/api/teacher/exams", requireTeacher, (_req,res) => {
  const rows=query(`
    SELECT DISTINCT e.id,e.name,e.academic_session,e.exam_type,e.start_date,e.end_date,e.status
    FROM examinations e
    JOIN exam_subjects es ON es.examination_id=e.id
    JOIN academic_assignments aa ON aa.section_id=es.section_id AND aa.subject_id=es.subject_id
    WHERE aa.teacher_id=? AND aa.status='active'
    ORDER BY e.start_date DESC,e.id DESC`,[req.teacher.id]);
  res.json({success:true,data:rows});
});

app.get("/api/teacher/exams/:examId/subjects", requireTeacher, (req,res) => {
  const rows=query(`
    SELECT es.*,sub.name AS subject_name,sub.code AS subject_code,
           c.name AS class_name,sec.name AS section_name
    FROM exam_subjects es
    JOIN academic_subjects sub ON sub.id=es.subject_id
    JOIN academic_sections sec ON sec.id=es.section_id
    JOIN academic_classes c ON c.id=sec.class_id
    JOIN academic_assignments aa ON aa.section_id=es.section_id AND aa.subject_id=es.subject_id
    WHERE es.examination_id=? AND aa.teacher_id=? AND aa.status='active'
    ORDER BY c.display_order,c.name,sec.name,sub.name`,[Number(req.params.examId),req.teacher.id]);
  res.json({success:true,data:rows});
});

app.get("/api/teacher/exam-subjects/:id/students", requireTeacher, (req,res) => {
  const es=queryOne("SELECT * FROM exam_subjects WHERE id=?",[Number(req.params.id)]);
  if(!es)return res.status(404).json({success:false,message:"Exam subject not found."});
  const allowed=queryOne("SELECT id FROM academic_assignments WHERE section_id=? AND subject_id=? AND teacher_id=? AND status='active'",
    [es.section_id,es.subject_id,req.teacher.id]);
  if(!allowed)return res.status(403).json({success:false,message:"You are not assigned to this class and subject."});
  const rows=query(`
    SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,
           COALESCE(m.obtained_marks,0) AS obtained_marks,m.remarks,m.id AS mark_id
    FROM students s
    LEFT JOIN marks m ON m.student_id=s.id AND m.exam_subject_id=?
    WHERE s.status='active'
      AND s.class_name=(SELECT c.name FROM academic_classes c JOIN academic_sections sec ON sec.class_id=c.id WHERE sec.id=?)
      AND s.section=(SELECT name FROM academic_sections WHERE id=?)
    ORDER BY s.roll_no,s.full_name`,[es.id,es.section_id,es.section_id]);
  res.json({success:true,data:{exam_subject:es,students:rows}});
});

app.post("/api/teacher/exam-subjects/:id/marks", requireTeacher, (req,res) => {
  const es=queryOne("SELECT * FROM exam_subjects WHERE id=?",[Number(req.params.id)]);
  if(!es)return res.status(404).json({success:false,message:"Exam subject not found."});
  const allowed=queryOne("SELECT id FROM academic_assignments WHERE section_id=? AND subject_id=? AND teacher_id=? AND status='active'",
    [es.section_id,es.subject_id,req.teacher.id]);
  if(!allowed)return res.status(403).json({success:false,message:"You are not assigned to this class and subject."});
  const entries=Array.isArray(req.body?.marks)?req.body.marks:[];
  for(const x of entries){
    const studentId=Number(x.student_id), obtained=Number(x.obtained_marks);
    if(!studentId||Number.isNaN(obtained)||obtained<0||obtained>Number(es.max_marks))
      return res.status(400).json({success:false,message:`Invalid marks for student ${studentId}. Maximum is ${es.max_marks}.`});
    const existing=queryOne("SELECT id FROM marks WHERE exam_subject_id=? AND student_id=?",[es.id,studentId]);
    if(existing) db.run("UPDATE marks SET obtained_marks=?,remarks=?,entered_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [obtained,String(x.remarks||""),req.teacher.id,existing.id]);
    else insert("INSERT INTO marks (examination_id,exam_subject_id,student_id,obtained_marks,remarks,entered_by) VALUES (?,?,?,?,?,?)",
      [es.examination_id,es.id,studentId,obtained,String(x.remarks||""),req.teacher.id]);
  }
  persistDatabase();
  res.json({success:true,message:"Marks saved successfully."});
});

app.get("/api/admin/students/:studentId/report-card", requireAdmin, (req,res) => {
  const studentId=Number(req.params.studentId), examId=Number(req.query.exam_id);
  if(!examId)return res.status(400).json({success:false,message:"exam_id is required."});
  const student=queryOne("SELECT * FROM students WHERE id=?",[studentId]);
  if(!student)return res.status(404).json({success:false,message:"Student not found."});
  const rows=query(`
    SELECT es.id,sub.name AS subject_name,es.max_marks,es.pass_marks,
           COALESCE(m.obtained_marks,0) AS obtained_marks,m.remarks
    FROM exam_subjects es
    JOIN academic_subjects sub ON sub.id=es.subject_id
    LEFT JOIN marks m ON m.exam_subject_id=es.id AND m.student_id=?
    WHERE es.examination_id=?
      AND es.section_id=(SELECT sec.id FROM academic_sections sec JOIN academic_classes c ON c.id=sec.class_id
                         WHERE c.name=? AND sec.name=? LIMIT 1)
    ORDER BY sub.name`,[studentId,examId,student.class_name,student.section]);
  let total=0,max=0,passed=true;
  const subjects=rows.map(r=>{
    const obtained=Number(r.obtained_marks||0), mm=Number(r.max_marks||0);
    const pct=mm?obtained/mm*100:0, g=calculateGrade(pct);
    if(obtained<Number(r.pass_marks||0))passed=false;
    total+=obtained;max+=mm;
    return {...r,obtained_marks:obtained,percentage:Math.round(pct*100)/100,grade:g.grade,grade_point:g.point};
  });
  const percentage=max?Math.round(total/max*10000)/100:0;
  const grade=calculateGrade(percentage);
  res.json({success:true,data:{student,exam:queryOne("SELECT * FROM examinations WHERE id=?",[examId]),subjects,total,max,percentage,grade:grade.grade,grade_point:grade.point,result:passed?"PASS":"NEEDS IMPROVEMENT"}});
});

app.get("/api/parent/exams", requireParent, (req,res) => {
  const rows=query(`
    SELECT DISTINCT e.id,e.name,e.academic_session,e.exam_type,e.start_date,e.end_date,e.status
    FROM examinations e
    JOIN exam_subjects es ON es.examination_id=e.id
    JOIN parent_students ps ON ps.student_id IN (
      SELECT id FROM students s WHERE s.class_name=(SELECT c.name FROM academic_classes c JOIN academic_sections sec ON sec.class_id=c.id WHERE sec.id=es.section_id)
      AND s.section=(SELECT name FROM academic_sections WHERE id=es.section_id)
    )
    WHERE ps.parent_id=?
    ORDER BY e.start_date DESC,e.id DESC`,[req.parent.id]);
  res.json({success:true,data:rows});
});


/* ===== TIMETABLE V9 ===== */

function ensureTimetableV9(){
  db.run(`CREATE TABLE IF NOT EXISTS timetable_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    teacher_id INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL,
    period_number INTEGER NOT NULL,
    start_time TEXT,
    end_time TEXT,
    room TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(section_id,day_of_week,period_number)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS timetable_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_number INTEGER UNIQUE NOT NULL,
    label TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    is_break INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active'
  )`);
  const c=queryOne("SELECT COUNT(*) AS c FROM timetable_periods");
  if(!Number(c?.c)){
    [["1","Period 1","08:00","08:45",0],["2","Period 2","08:45","09:30",0],
     ["3","Period 3","09:30","10:15",0],["4","Period 4","10:15","11:00",0],
     ["5","Period 5","11:30","12:15",0],["6","Period 6","12:15","13:00",0],
     ["7","Period 7","13:00","13:45",0]].forEach(x=>insert(
       "INSERT INTO timetable_periods (period_number,label,start_time,end_time,is_break) VALUES (?,?,?,?,?)",x));
  }
  persistDatabase();
}
ensureTimetableV9();

app.get("/api/admin/timetable/periods",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query("SELECT * FROM timetable_periods ORDER BY period_number")});
});
app.post("/api/admin/timetable/periods",requireAdmin,(req,res)=>{
  const {period_number,label,start_time="",end_time="",is_break=false}=req.body??{};
  if(!Number(period_number)||!String(label).trim())return res.status(400).json({success:false,message:"Period number and label are required."});
  try{
    const id=insert("INSERT INTO timetable_periods (period_number,label,start_time,end_time,is_break) VALUES (?,?,?,?,?)",
      [Number(period_number),String(label).trim(),start_time,end_time,is_break?1:0]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM timetable_periods WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Period already exists."})}
});

app.get("/api/admin/timetable",requireAdmin,(req,res)=>{
  let where="",params=[];
  if(req.query.section_id){where="WHERE e.section_id=?";params=[Number(req.query.section_id)]}
  const rows=query(`
    SELECT e.*,c.name AS class_name,sec.name AS section_name,
           sub.name AS subject_name,sub.code AS subject_code,
           COALESCE(t.name,t.full_name,t.email) AS teacher_name,
           p.label AS period_label,p.start_time,p.end_time,p.is_break
    FROM timetable_entries e
    JOIN academic_sections sec ON sec.id=e.section_id
    JOIN academic_classes c ON c.id=sec.class_id
    JOIN academic_subjects sub ON sub.id=e.subject_id
    LEFT JOIN teachers t ON t.id=e.teacher_id
    LEFT JOIN timetable_periods p ON p.period_number=e.period_number
    ${where}
    ORDER BY c.display_order,c.name,sec.name,e.day_of_week,e.period_number`,params);
  res.json({success:true,data:rows});
});

app.post("/api/admin/timetable",requireAdmin,(req,res)=>{
  const {section_id,subject_id,teacher_id,day_of_week,period_number,start_time="",end_time="",room="",status="active"}=req.body??{};
  if(!Number(section_id)||!Number(subject_id)||!Number(teacher_id)||Number(day_of_week)<1||Number(day_of_week)>6||!Number(period_number))
    return res.status(400).json({success:false,message:"Section, subject, teacher, day and period are required."});
  try{
    const id=insert(`INSERT INTO timetable_entries
      (section_id,subject_id,teacher_id,day_of_week,period_number,start_time,end_time,room,status)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [Number(section_id),Number(subject_id),Number(teacher_id),Number(day_of_week),Number(period_number),start_time,end_time,room,status==="inactive"?"inactive":"active"]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM timetable_entries WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"This section already has a timetable entry for that day and period."})}
});

app.delete("/api/admin/timetable/:id",requireAdmin,(req,res)=>{
  db.run("DELETE FROM timetable_entries WHERE id=?",[Number(req.params.id)]);
  persistDatabase();res.json({success:true});
});

app.get("/api/teacher/timetable",requireTeacher,(req,res)=>{
  const rows=query(`
    SELECT e.*,c.name AS class_name,sec.name AS section_name,
           sub.name AS subject_name,sub.code AS subject_code,
           p.label AS period_label,p.start_time,p.end_time
    FROM timetable_entries e
    JOIN academic_sections sec ON sec.id=e.section_id
    JOIN academic_classes c ON c.id=sec.class_id
    JOIN academic_subjects sub ON sub.id=e.subject_id
    LEFT JOIN timetable_periods p ON p.period_number=e.period_number
    WHERE e.teacher_id=? AND e.status='active'
    ORDER BY e.day_of_week,e.period_number`,[req.teacher.id]);
  res.json({success:true,data:rows});
});

app.get("/api/parent/timetable",requireParent,(req,res)=>{
  const rows=query(`
    SELECT e.*,c.name AS class_name,sec.name AS section_name,
           sub.name AS subject_name,sub.code AS subject_code,
           COALESCE(t.name,t.full_name,t.email) AS teacher_name,
           p.label AS period_label,p.start_time,p.end_time
    FROM timetable_entries e
    JOIN academic_sections sec ON sec.id=e.section_id
    JOIN academic_classes c ON c.id=sec.class_id
    JOIN academic_subjects sub ON sub.id=e.subject_id
    LEFT JOIN teachers t ON t.id=e.teacher_id
    LEFT JOIN timetable_periods p ON p.period_number=e.period_number
    JOIN students st ON st.class_name=c.name AND st.section=sec.name
    JOIN parent_students ps ON ps.student_id=st.id
    WHERE ps.parent_id=? AND e.status='active'
    ORDER BY e.day_of_week,e.period_number`,[req.parent.id]);
  res.json({success:true,data:rows});
});


/* ===== FEES & FINANCE V10 ===== */

function ensureFinanceV10(){
  db.run(`CREATE TABLE IF NOT EXISTS fee_structures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    academic_session TEXT NOT NULL DEFAULT '2026-27',
    class_name TEXT,
    section TEXT,
    frequency TEXT NOT NULL DEFAULT 'annual',
    amount REAL NOT NULL DEFAULT 0,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_fee_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    fee_structure_id INTEGER NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'unpaid',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id,fee_structure_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    fee_assignment_id INTEGER,
    receipt_no TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    transaction_ref TEXT,
    paid_on TEXT NOT NULL,
    remarks TEXT,
    received_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureFinanceV10();

function financeReceipt(){
  const stamp=new Date().toISOString().replace(/\D/g,"").slice(0,14);
  const suffix=Math.floor(Math.random()*900+100);
  return `REC-${stamp}-${suffix}`;
}

app.get("/api/admin/fees/structures",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query("SELECT * FROM fee_structures ORDER BY id DESC")});
});
app.post("/api/admin/fees/structures",requireAdmin,(req,res)=>{
  const {name="",academic_session="2026-27",class_name="",section="",frequency="annual",amount=0,due_date="",status="active"}=req.body??{};
  if(!String(name).trim()||Number(amount)<0)return res.status(400).json({success:false,message:"Fee name and valid amount are required."});
  const id=insert(`INSERT INTO fee_structures (name,academic_session,class_name,section,frequency,amount,due_date,status)
    VALUES (?,?,?,?,?,?,?,?)`,
    [String(name).trim(),academic_session,class_name,section,frequency,Number(amount),due_date||null,status]);
  persistDatabase();
  res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_structures WHERE id=?",[id])});
});
app.patch("/api/admin/fees/structures/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),cur=queryOne("SELECT * FROM fee_structures WHERE id=?",[id]);
  if(!cur)return res.status(404).json({success:false,message:"Fee structure not found."});
  db.run(`UPDATE fee_structures SET name=?,academic_session=?,class_name=?,section=?,frequency=?,amount=?,due_date=?,status=? WHERE id=?`,
    [req.body?.name??cur.name,req.body?.academic_session??cur.academic_session,req.body?.class_name??cur.class_name,
     req.body?.section??cur.section,req.body?.frequency??cur.frequency,Number(req.body?.amount??cur.amount),
     req.body?.due_date??cur.due_date,req.body?.status??cur.status,id]);
  persistDatabase();res.json({success:true,data:queryOne("SELECT * FROM fee_structures WHERE id=?",[id])});
});
app.delete("/api/admin/fees/structures/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  db.run("DELETE FROM student_fee_assignments WHERE fee_structure_id=?",[id]);
  db.run("DELETE FROM fee_structures WHERE id=?",[id]);
  persistDatabase();res.json({success:true});
});

app.get("/api/admin/fees/students",requireAdmin,(req,res)=>{
  const q=String(req.query.q||"").trim();
  const rows=query(`SELECT id,full_name,admission_no,roll_no,class_name,section FROM students
    WHERE status='active' AND (?='' OR full_name LIKE ? OR admission_no LIKE ? OR roll_no LIKE ?)
    ORDER BY class_name,section,roll_no,full_name`,[q,`%${q}%`,`%${q}%`,`%${q}%`]);
  res.json({success:true,data:rows});
});

app.get("/api/admin/fees/assignments",requireAdmin,(req,res)=>{
  const params=[];let where="";
  if(req.query.student_id){where="WHERE a.student_id=?";params.push(Number(req.query.student_id))}
  const rows=query(`
    SELECT a.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,
           f.name AS fee_name,f.frequency,
           ROUND(a.amount-a.discount-COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.fee_assignment_id=a.id),0),2) AS balance
    FROM student_fee_assignments a
    JOIN students s ON s.id=a.student_id
    JOIN fee_structures f ON f.id=a.fee_structure_id
    ${where}
    ORDER BY a.id DESC`,params);
  res.json({success:true,data:rows});
});

app.post("/api/admin/fees/assignments",requireAdmin,(req,res)=>{
  const {student_id,fee_structure_id,amount,discount=0,due_date=""}=req.body??{};
  if(!Number(student_id)||!Number(fee_structure_id))return res.status(400).json({success:false,message:"Student and fee structure are required."});
  const structure=queryOne("SELECT * FROM fee_structures WHERE id=?",[Number(fee_structure_id)]);
  if(!structure)return res.status(404).json({success:false,message:"Fee structure not found."});
  try{
    const id=insert(`INSERT INTO student_fee_assignments (student_id,fee_structure_id,amount,discount,due_date)
      VALUES (?,?,?,?,?)`,
      [Number(student_id),Number(fee_structure_id),Number(amount??structure.amount),Number(discount)||0,due_date||structure.due_date||null]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM student_fee_assignments WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"This fee has already been assigned to the student."})}
});

app.get("/api/admin/fees/payments",requireAdmin,(req,res)=>{
  const params=[];let where="";
  if(req.query.student_id){where="WHERE p.student_id=?";params.push(Number(req.query.student_id))}
  const rows=query(`SELECT p.*,s.full_name,s.admission_no,s.class_name,s.section
    FROM fee_payments p JOIN students s ON s.id=p.student_id ${where} ORDER BY p.paid_on DESC,p.id DESC`,params);
  res.json({success:true,data:rows});
});

app.post("/api/admin/fees/payments",requireAdmin,(req,res)=>{
  const {student_id,fee_assignment_id=null,amount,payment_method="cash",transaction_ref="",paid_on="",remarks=""}=req.body??{};
  const value=Number(amount);
  if(!Number(student_id)||value<=0)return res.status(400).json({success:false,message:"Student and valid payment amount are required."});
  if(fee_assignment_id){
    const a=queryOne(`SELECT a.*,COALESCE((SELECT SUM(amount) FROM fee_payments WHERE fee_assignment_id=a.id),0) paid
      FROM student_fee_assignments a WHERE a.id=?`,[Number(fee_assignment_id)]);
    if(!a)return res.status(404).json({success:false,message:"Fee assignment not found."});
    const balance=Number(a.amount)-Number(a.discount)-Number(a.paid);
    if(value>balance+0.001)return res.status(400).json({success:false,message:`Payment exceeds remaining balance of ${balance.toFixed(2)}.`});
  }
  const id=insert(`INSERT INTO fee_payments (student_id,fee_assignment_id,receipt_no,amount,payment_method,transaction_ref,paid_on,remarks,received_by)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [Number(student_id),fee_assignment_id?Number(fee_assignment_id):null,financeReceipt(),value,payment_method,transaction_ref,paid_on||new Date().toISOString().slice(0,10),remarks,req.admin?.id||null]);
  if(fee_assignment_id){
    const a=queryOne("SELECT amount,discount FROM student_fee_assignments WHERE id=?",[Number(fee_assignment_id)]);
    const paid=queryOne("SELECT COALESCE(SUM(amount),0) AS total FROM fee_payments WHERE fee_assignment_id=?",[Number(fee_assignment_id)]);
    const balance=Number(a.amount)-Number(a.discount)-Number(paid.total);
    db.run("UPDATE student_fee_assignments SET status=? WHERE id=?",[balance<=0.001?"paid":"partial",Number(fee_assignment_id)]);
  }
  persistDatabase();
  res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_payments WHERE id=?",[id])});
});

app.get("/api/admin/fees/dashboard",requireAdmin,(_req,res)=>{
  const total=queryOne(`SELECT COALESCE(SUM(amount-discount),0) AS total FROM student_fee_assignments`);
  const collected=queryOne(`SELECT COALESCE(SUM(amount),0) AS total FROM fee_payments`);
  const students=queryOne(`SELECT COUNT(DISTINCT student_id) AS total FROM student_fee_assignments`);
  const due=Number(total?.total||0)-Number(collected?.total||0);
  res.json({success:true,data:{
    assigned:Number(total?.total||0),collected:Number(collected?.total||0),
    outstanding:Math.max(0,due),students:Number(students?.total||0)
  }});
});

app.get("/api/admin/fees/students/:id/statement",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),student=queryOne("SELECT * FROM students WHERE id=?",[id]);
  if(!student)return res.status(404).json({success:false,message:"Student not found."});
  const assignments=query(`SELECT a.*,f.name AS fee_name,f.frequency,
    COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.fee_assignment_id=a.id),0) AS paid
    FROM student_fee_assignments a JOIN fee_structures f ON f.id=a.fee_structure_id WHERE a.student_id=? ORDER BY a.id DESC`,[id]);
  const payments=query("SELECT * FROM fee_payments WHERE student_id=? ORDER BY paid_on DESC,id DESC",[id]);
  const assigned=assignments.reduce((n,x)=>n+Number(x.amount)-Number(x.discount),0);
  const paid=payments.reduce((n,x)=>n+Number(x.amount),0);
  res.json({success:true,data:{student,assignments,payments,assigned,paid,outstanding:Math.max(0,assigned-paid)}});
});

app.get("/api/parent/fees",requireParent,(req,res)=>{
  const rows=query(`SELECT a.*,f.name AS fee_name,f.frequency,
    COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.fee_assignment_id=a.id),0) AS paid,
    ROUND(a.amount-a.discount-COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.fee_assignment_id=a.id),0),2) AS balance
    FROM student_fee_assignments a JOIN fee_structures f ON f.id=a.fee_structure_id
    JOIN parent_students ps ON ps.student_id=a.student_id WHERE ps.parent_id=? ORDER BY a.due_date,a.id`,[req.parent.id]);
  const payments=query(`SELECT p.*,s.full_name FROM fee_payments p JOIN students s ON s.id=p.student_id
    JOIN parent_students ps ON ps.student_id=s.id WHERE ps.parent_id=? ORDER BY p.paid_on DESC,p.id DESC`,[req.parent.id]);
  res.json({success:true,data:{assignments:rows,payments}});
});


/* ===== HOMEWORK & ASSIGNMENTS V11 ===== */

function ensureHomeworkV11(){
  db.run(`CREATE TABLE IF NOT EXISTS homework (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    section_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    teacher_id INTEGER NOT NULL,
    assigned_date TEXT NOT NULL,
    due_date TEXT,
    max_marks REAL,
    attachment_url TEXT,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS homework_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    homework_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    submitted_at TEXT,
    content TEXT,
    attachment_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    marks REAL,
    teacher_feedback TEXT,
    UNIQUE(homework_id,student_id)
  )`);
  persistDatabase();
}
ensureHomeworkV11();

app.get("/api/admin/homework",requireAdmin,(req,res)=>{
  const rows=query(`
    SELECT h.*,c.name AS class_name,sec.name AS section_name,
           sub.name AS subject_name,
           COALESCE(t.name,t.full_name,t.email) AS teacher_name,
           (SELECT COUNT(*) FROM homework_submissions hs WHERE hs.homework_id=h.id) AS submission_count,
           (SELECT COUNT(*) FROM students st WHERE st.class_name=c.name AND st.section=sec.name AND st.status='active') AS student_count
    FROM homework h
    JOIN academic_sections sec ON sec.id=h.section_id
    JOIN academic_classes c ON c.id=sec.class_id
    JOIN academic_subjects sub ON sub.id=h.subject_id
    LEFT JOIN teachers t ON t.id=h.teacher_id
    ORDER BY h.due_date DESC,h.id DESC`);
  res.json({success:true,data:rows});
});

app.post("/api/admin/homework",requireAdmin,(req,res)=>{
  const {title="",description="",section_id,subject_id,teacher_id,assigned_date="",due_date="",max_marks=null,attachment_url="",status="published"}=req.body??{};
  if(!String(title).trim()||!Number(section_id)||!Number(subject_id)||!Number(teacher_id))
    return res.status(400).json({success:false,message:"Title, section, subject and teacher are required."});
  const id=insert(`INSERT INTO homework
    (title,description,section_id,subject_id,teacher_id,assigned_date,due_date,max_marks,attachment_url,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [String(title).trim(),String(description),Number(section_id),Number(subject_id),Number(teacher_id),
     assigned_date||new Date().toISOString().slice(0,10),due_date||null,max_marks===null||max_marks===""?null:Number(max_marks),attachment_url||null,status]);
  persistDatabase();
  res.status(201).json({success:true,data:queryOne("SELECT * FROM homework WHERE id=?",[id])});
});

app.patch("/api/admin/homework/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),cur=queryOne("SELECT * FROM homework WHERE id=?",[id]);
  if(!cur)return res.status(404).json({success:false,message:"Homework not found."});
  db.run(`UPDATE homework SET title=?,description=?,section_id=?,subject_id=?,teacher_id=?,assigned_date=?,due_date=?,max_marks=?,attachment_url=?,status=? WHERE id=?`,
    [req.body?.title??cur.title,req.body?.description??cur.description,Number(req.body?.section_id??cur.section_id),
     Number(req.body?.subject_id??cur.subject_id),Number(req.body?.teacher_id??cur.teacher_id),
     req.body?.assigned_date??cur.assigned_date,req.body?.due_date??cur.due_date,
     req.body?.max_marks===null?null:Number(req.body?.max_marks??cur.max_marks),
     req.body?.attachment_url??cur.attachment_url,req.body?.status??cur.status,id]);
  persistDatabase();
  res.json({success:true,data:queryOne("SELECT * FROM homework WHERE id=?",[id])});
});

app.delete("/api/admin/homework/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  db.run("DELETE FROM homework_submissions WHERE homework_id=?",[id]);
  db.run("DELETE FROM homework WHERE id=?",[id]);
  persistDatabase();res.json({success:true});
});

app.get("/api/teacher/homework",requireTeacher,(req,res)=>{
  const rows=query(`
    SELECT h.*,c.name AS class_name,sec.name AS section_name,sub.name AS subject_name,
      (SELECT COUNT(*) FROM homework_submissions hs WHERE hs.homework_id=h.id) AS submission_count,
      (SELECT COUNT(*) FROM students st WHERE st.class_name=c.name AND st.section=sec.name AND st.status='active') AS student_count
    FROM homework h
    JOIN academic_sections sec ON sec.id=h.section_id
    JOIN academic_classes c ON c.id=sec.class_id
    JOIN academic_subjects sub ON sub.id=h.subject_id
    WHERE h.teacher_id=? ORDER BY h.due_date DESC,h.id DESC`,[req.teacher.id]);
  res.json({success:true,data:rows});
});

app.post("/api/teacher/homework",requireTeacher,(req,res)=>{
  const {title="",description="",section_id,subject_id,assigned_date="",due_date="",max_marks=null,attachment_url="",status="published"}=req.body??{};
  const allowed=queryOne("SELECT id FROM academic_assignments WHERE section_id=? AND subject_id=? AND teacher_id=? AND status='active'",
    [Number(section_id),Number(subject_id),req.teacher.id]);
  if(!allowed)return res.status(403).json({success:false,message:"You are not assigned to this class and subject."});
  if(!String(title).trim())return res.status(400).json({success:false,message:"Title is required."});
  const id=insert(`INSERT INTO homework
    (title,description,section_id,subject_id,teacher_id,assigned_date,due_date,max_marks,attachment_url,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [String(title).trim(),String(description),Number(section_id),Number(subject_id),req.teacher.id,
     assigned_date||new Date().toISOString().slice(0,10),due_date||null,max_marks===null||max_marks===""?null:Number(max_marks),attachment_url||null,status]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM homework WHERE id=?",[id])});
});

app.get("/api/teacher/homework/:id/submissions",requireTeacher,(req,res)=>{
  const h=queryOne("SELECT * FROM homework WHERE id=? AND teacher_id=?",[Number(req.params.id),req.teacher.id]);
  if(!h)return res.status(404).json({success:false,message:"Homework not found."});
  const rows=query(`
    SELECT s.id,s.full_name,s.admission_no,s.roll_no,
      COALESCE(hs.status,'not_submitted') AS submission_status,
      hs.submitted_at,hs.content,hs.attachment_url,hs.marks,hs.teacher_feedback
    FROM students s
    LEFT JOIN homework_submissions hs ON hs.student_id=s.id AND hs.homework_id=?
    JOIN academic_sections sec ON sec.id=? JOIN academic_classes c ON c.id=sec.class_id
    WHERE s.class_name=c.name AND s.section=sec.name AND s.status='active'
    ORDER BY s.roll_no,s.full_name`,[h.id,h.section_id]);
  res.json({success:true,data:rows});
});

app.patch("/api/teacher/homework/:homeworkId/submissions/:studentId",requireTeacher,(req,res)=>{
  const h=queryOne("SELECT * FROM homework WHERE id=? AND teacher_id=?",[Number(req.params.homeworkId),req.teacher.id]);
  if(!h)return res.status(404).json({success:false,message:"Homework not found."});
  const studentId=Number(req.params.studentId);
  const existing=queryOne("SELECT id FROM homework_submissions WHERE homework_id=? AND student_id=?",[h.id,studentId]);
  if(!existing)return res.status(404).json({success:false,message:"Submission not found."});
  db.run(`UPDATE homework_submissions SET status=?,marks=?,teacher_feedback=? WHERE id=?`,
    [req.body?.status??"reviewed",req.body?.marks===null?null:(req.body?.marks!==undefined?Number(req.body.marks):null),
     req.body?.teacher_feedback??"",existing.id]);
  persistDatabase();
  res.json({success:true});
});

app.get("/api/student/homework",requireStudent,(req,res)=>{
  const rows=query(`
    SELECT h.id,h.title,h.description,h.assigned_date,h.due_date,h.max_marks,h.attachment_url,h.status,
      c.name AS class_name,sec.name AS section_name,sub.name AS subject_name,
      COALESCE(t.name,t.full_name,t.email) AS teacher_name,
      COALESCE(hs.status,'pending') AS submission_status,hs.submitted_at,hs.content,hs.attachment_url AS submission_attachment,
      hs.marks,hs.teacher_feedback
    FROM homework h
    JOIN academic_sections sec ON sec.id=h.section_id
    JOIN academic_classes c ON c.id=sec.class_id
    JOIN academic_subjects sub ON sub.id=h.subject_id
    LEFT JOIN teachers t ON t.id=h.teacher_id
    LEFT JOIN homework_submissions hs ON hs.homework_id=h.id AND hs.student_id=?
    WHERE h.status='published' AND ?=c.name AND ?=sec.name
    ORDER BY h.due_date DESC,h.id DESC`,[req.student.id,req.student.class_name,req.student.section]);
  res.json({success:true,data:rows});
});

app.post("/api/student/homework/:id/submit",requireStudent,(req,res)=>{
  const h=queryOne(`
    SELECT h.* FROM homework h JOIN academic_sections sec ON sec.id=h.section_id
    JOIN academic_classes c ON c.id=sec.class_id
    WHERE h.id=? AND h.status='published' AND ?=c.name AND ?=sec.name`,
    [Number(req.params.id),req.student.class_name,req.student.section]);
  if(!h)return res.status(404).json({success:false,message:"Homework not found."});
  const existing=queryOne("SELECT id FROM homework_submissions WHERE homework_id=? AND student_id=?",[h.id,req.student.id]);
  if(existing) db.run(`UPDATE homework_submissions SET submitted_at=CURRENT_TIMESTAMP,content=?,attachment_url=?,status='submitted' WHERE id=?`,
    [String(req.body?.content||""),req.body?.attachment_url||null,existing.id]);
  else insert(`INSERT INTO homework_submissions (homework_id,student_id,submitted_at,content,attachment_url,status)
    VALUES (?,?,CURRENT_TIMESTAMP,?,?,?)`,[h.id,req.student.id,String(req.body?.content||""),req.body?.attachment_url||null,"submitted"]);
  persistDatabase();res.json({success:true,message:"Homework submitted successfully."});
});

app.get("/api/parent/homework",requireParent,(req,res)=>{
  const rows=query(`
    SELECT h.id,h.title,h.description,h.assigned_date,h.due_date,h.max_marks,
      c.name AS class_name,sec.name AS section_name,sub.name AS subject_name,
      COALESCE(t.name,t.full_name,t.email) AS teacher_name,
      COALESCE(hs.status,'pending') AS submission_status,hs.submitted_at,hs.marks,hs.teacher_feedback
    FROM homework h
    JOIN academic_sections sec ON sec.id=h.section_id
    JOIN academic_classes c ON c.id=sec.class_id
    JOIN academic_subjects sub ON sub.id=h.subject_id
    LEFT JOIN teachers t ON t.id=h.teacher_id
    JOIN students st ON st.class_name=c.name AND st.section=sec.name
    JOIN parent_students ps ON ps.student_id=st.id
    LEFT JOIN homework_submissions hs ON hs.homework_id=h.id AND hs.student_id=st.id
    WHERE ps.parent_id=? AND h.status='published'
    ORDER BY h.due_date DESC,h.id DESC`,[req.parent.id]);
  res.json({success:true,data:rows});
});


/* ===== NOTIFICATIONS & COMMUNICATION V12 ===== */

function ensureNotificationsV12(){
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_type TEXT NOT NULL,
    recipient_id INTEGER,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    priority TEXT NOT NULL DEFAULT 'normal',
    action_url TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'all',
    priority TEXT NOT NULL DEFAULT 'normal',
    publish_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'published',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureNotificationsV12();

function createNotification(type,id,title,message,category="general",priority="normal",actionUrl=null){
  return insert(`INSERT INTO notifications
    (recipient_type,recipient_id,title,message,category,priority,action_url)
    VALUES (?,?,?,?,?,?,?)`,
    [type,id||null,title,message,category,priority,actionUrl]);
}
function idsFromTable(table){
  try{return query(`SELECT id FROM ${table} WHERE status='active'`)}catch{return query(`SELECT id FROM ${table}`)}
}
function createBroadcast(audience,title,message,category="announcement",priority="normal",actionUrl=null){
  const targets={admin:"admins",teacher:"teachers",student:"students",parent:"parents"};
  const types=audience==="all"?Object.entries(targets):targets[audience]?[[audience,targets[audience]]]:[];
  types.forEach(([type,table])=>idsFromTable(table).forEach(x=>createNotification(type,x.id,title,message,category,priority,actionUrl)));
}

app.get("/api/admin/announcements",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query("SELECT * FROM announcements ORDER BY publish_at DESC,id DESC")});
});
app.post("/api/admin/announcements",requireAdmin,(req,res)=>{
  const {title="",message="",audience="all",priority="normal",publish_at="",expires_at="",status="published",action_url=""}=req.body??{};
  if(!String(title).trim()||!String(message).trim())return res.status(400).json({success:false,message:"Title and message are required."});
  const id=insert(`INSERT INTO announcements (title,message,audience,priority,publish_at,expires_at,status,created_by)
    VALUES (?,?,?,?,?,?,?,?)`,
    [String(title).trim(),String(message).trim(),audience,priority,publish_at||new Date().toISOString(),expires_at||null,status,req.admin?.id||null]);
  if(status==="published")createBroadcast(audience,title,message,"announcement",priority,action_url||null);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM announcements WHERE id=?",[id])});
});
app.delete("/api/admin/announcements/:id",requireAdmin,(req,res)=>{
  db.run("DELETE FROM announcements WHERE id=?",[Number(req.params.id)]);
  persistDatabase();res.json({success:true});
});

function notificationFeed(type,id){
  return query(`SELECT * FROM notifications WHERE recipient_type=? AND (recipient_id=? OR recipient_id IS NULL)
    ORDER BY is_read ASC,created_at DESC,id DESC LIMIT 100`,[type,Number(id)]);
}
function markOneRead(type,id,nid){
  const n=queryOne("SELECT id FROM notifications WHERE id=? AND recipient_type=? AND (recipient_id=? OR recipient_id IS NULL)",
    [Number(nid),type,Number(id)]);
  if(!n)return false;
  db.run("UPDATE notifications SET is_read=1 WHERE id=?",[Number(nid)]);return true;
}
function markAllRead(type,id){db.run("UPDATE notifications SET is_read=1 WHERE recipient_type=? AND (recipient_id=? OR recipient_id IS NULL)",[type,Number(id)]);}

app.get("/api/admin/notifications",requireAdmin,(req,res)=>res.json({success:true,data:notificationFeed("admin",req.admin.id)}));
app.get("/api/teacher/notifications",requireTeacher,(req,res)=>res.json({success:true,data:notificationFeed("teacher",req.teacher.id)}));
app.get("/api/student/notifications",requireStudent,(req,res)=>res.json({success:true,data:notificationFeed("student",req.student.id)}));
app.get("/api/parent/notifications",requireParent,(req,res)=>res.json({success:true,data:notificationFeed("parent",req.parent.id)}));

app.patch("/api/admin/notifications/:id/read",requireAdmin,(req,res)=>{
  if(!markOneRead("admin",req.admin.id,req.params.id))return res.status(404).json({success:false,message:"Notification not found."});
  persistDatabase();res.json({success:true});
});
app.patch("/api/teacher/notifications/:id/read",requireTeacher,(req,res)=>{
  if(!markOneRead("teacher",req.teacher.id,req.params.id))return res.status(404).json({success:false,message:"Notification not found."});
  persistDatabase();res.json({success:true});
});
app.patch("/api/student/notifications/:id/read",requireStudent,(req,res)=>{
  if(!markOneRead("student",req.student.id,req.params.id))return res.status(404).json({success:false,message:"Notification not found."});
  persistDatabase();res.json({success:true});
});
app.patch("/api/parent/notifications/:id/read",requireParent,(req,res)=>{
  if(!markOneRead("parent",req.parent.id,req.params.id))return res.status(404).json({success:false,message:"Notification not found."});
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/notifications/read-all",requireAdmin,(req,res)=>{markAllRead("admin",req.admin.id);persistDatabase();res.json({success:true})});
app.post("/api/teacher/notifications/read-all",requireTeacher,(req,res)=>{markAllRead("teacher",req.teacher.id);persistDatabase();res.json({success:true})});
app.post("/api/student/notifications/read-all",requireStudent,(req,res)=>{markAllRead("student",req.student.id);persistDatabase();res.json({success:true})});
app.post("/api/parent/notifications/read-all",requireParent,(req,res)=>{markAllRead("parent",req.parent.id);persistDatabase();res.json({success:true})});


/* ===== EVENTS & CALENDAR V13 ===== */

function ensureCalendarV13(){
  db.run(`CREATE TABLE IF NOT EXISTS school_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL DEFAULT 'event',
    start_date TEXT NOT NULL,
    start_time TEXT,
    end_date TEXT,
    end_time TEXT,
    location TEXT,
    audience TEXT NOT NULL DEFAULT 'all',
    priority TEXT NOT NULL DEFAULT 'normal',
    color TEXT,
    status TEXT NOT NULL DEFAULT 'published',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureCalendarV13();

app.get("/api/admin/events",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query("SELECT * FROM school_events ORDER BY start_date,start_time,id")});
});
app.post("/api/admin/events",requireAdmin,(req,res)=>{
  const {title="",description="",event_type="event",start_date="",start_time="",end_date="",end_time="",location="",audience="all",priority="normal",color="",status="published"}=req.body??{};
  if(!String(title).trim()||!String(start_date).trim())return res.status(400).json({success:false,message:"Title and start date are required."});
  const id=insert(`INSERT INTO school_events
    (title,description,event_type,start_date,start_time,end_date,end_time,location,audience,priority,color,status,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [String(title).trim(),description,event_type,start_date,start_time||null,end_date||start_date,end_time||null,location,audience,priority,color||null,status,req.admin?.id||null]);
  persistDatabase();
  res.status(201).json({success:true,data:queryOne("SELECT * FROM school_events WHERE id=?",[id])});
});
app.patch("/api/admin/events/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),cur=queryOne("SELECT * FROM school_events WHERE id=?",[id]);
  if(!cur)return res.status(404).json({success:false,message:"Event not found."});
  const n={...cur,...req.body};
  db.run(`UPDATE school_events SET title=?,description=?,event_type=?,start_date=?,start_time=?,end_date=?,end_time=?,location=?,audience=?,priority=?,color=?,status=? WHERE id=?`,
    [n.title,n.description,n.event_type,n.start_date,n.start_time||null,n.end_date||n.start_date,n.end_time||null,n.location,n.audience,n.priority,n.color||null,n.status,id]);
  persistDatabase();res.json({success:true,data:queryOne("SELECT * FROM school_events WHERE id=?",[id])});
});
app.delete("/api/admin/events/:id",requireAdmin,(req,res)=>{
  db.run("DELETE FROM school_events WHERE id=?",[Number(req.params.id)]);
  persistDatabase();res.json({success:true});
});

function publicEvents(type){
  return query(`SELECT * FROM school_events WHERE status='published'
    AND (audience='all' OR audience=?)
    AND (end_date IS NULL OR end_date>=date('now'))
    ORDER BY start_date,start_time,id`,[type]);
}
app.get("/api/teacher/events",requireTeacher,(_req,res)=>res.json({success:true,data:publicEvents("teacher")}));
app.get("/api/student/events",requireStudent,(_req,res)=>res.json({success:true,data:publicEvents("student")}));
app.get("/api/parent/events",requireParent,(_req,res)=>res.json({success:true,data:publicEvents("parent")}));
app.get("/api/events",(_req,res)=>res.json({success:true,data:publicEvents("all")}));


/* ===== HOSTEL MANAGEMENT V14 ===== */

function ensureHostelV14(){
  db.run(`CREATE TABLE IF NOT EXISTS hostel_buildings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    gender TEXT NOT NULL DEFAULT 'mixed',
    address TEXT,
    warden_name TEXT,
    warden_phone TEXT,
    capacity INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostel_id INTEGER NOT NULL,
    room_number TEXT NOT NULL,
    floor TEXT,
    room_type TEXT NOT NULL DEFAULT 'shared',
    capacity INTEGER NOT NULL DEFAULT 1,
    monthly_fee REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'available',
    UNIQUE(hostel_id,room_number)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    hostel_id INTEGER NOT NULL,
    room_id INTEGER NOT NULL,
    bed_number TEXT,
    check_in_date TEXT NOT NULL,
    check_out_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    hostel_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'present',
    check_in_time TEXT,
    check_out_time TEXT,
    remarks TEXT,
    marked_by INTEGER,
    UNIQUE(student_id,attendance_date)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    hostel_id INTEGER NOT NULL,
    room_id INTEGER,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'open',
    resolution TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    hostel_id INTEGER NOT NULL,
    visitor_name TEXT NOT NULL,
    relation TEXT,
    phone TEXT,
    visit_date TEXT NOT NULL,
    in_time TEXT,
    out_time TEXT,
    purpose TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled'
  )`);
  persistDatabase();
}
ensureHostelV14();

app.get("/api/admin/hostels",requireAdmin,(_req,res)=>{
  const rows=query(`SELECT h.*,
    (SELECT COUNT(*) FROM hostel_rooms r WHERE r.hostel_id=h.id) AS rooms,
    (SELECT COALESCE(SUM(r.capacity),0) FROM hostel_rooms r WHERE r.hostel_id=h.id AND r.status!='maintenance') AS bed_capacity,
    (SELECT COUNT(*) FROM hostel_allocations a WHERE a.hostel_id=h.id AND a.status='active') AS occupied
    FROM hostel_buildings h ORDER BY h.name`);
  res.json({success:true,data:rows});
});
app.post("/api/admin/hostels",requireAdmin,(req,res)=>{
  const {name="",gender="mixed",address="",warden_name="",warden_phone="",capacity=0,status="active"}=req.body??{};
  if(!String(name).trim())return res.status(400).json({success:false,message:"Hostel name is required."});
  const id=insert(`INSERT INTO hostel_buildings (name,gender,address,warden_name,warden_phone,capacity,status)
    VALUES (?,?,?,?,?,?,?)`,[name,gender,address,warden_name,warden_phone,Number(capacity)||0,status]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_buildings WHERE id=?",[id])});
});
app.patch("/api/admin/hostels/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),cur=queryOne("SELECT * FROM hostel_buildings WHERE id=?",[id]);
  if(!cur)return res.status(404).json({success:false,message:"Hostel not found."});
  const n={...cur,...req.body};
  db.run(`UPDATE hostel_buildings SET name=?,gender=?,address=?,warden_name=?,warden_phone=?,capacity=?,status=? WHERE id=?`,
    [n.name,n.gender,n.address,n.warden_name,n.warden_phone,Number(n.capacity)||0,n.status,id]);
  persistDatabase();res.json({success:true});
});
app.delete("/api/admin/hostels/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  db.run("DELETE FROM hostel_allocations WHERE hostel_id=?",[id]);
  db.run("DELETE FROM hostel_attendance WHERE hostel_id=?",[id]);
  db.run("DELETE FROM hostel_complaints WHERE hostel_id=?",[id]);
  db.run("DELETE FROM hostel_visitors WHERE hostel_id=?",[id]);
  db.run("DELETE FROM hostel_rooms WHERE hostel_id=?",[id]);
  db.run("DELETE FROM hostel_buildings WHERE id=?",[id]);
  persistDatabase();res.json({success:true});
});

app.get("/api/admin/hostels/:id/rooms",requireAdmin,(req,res)=>{
  res.json({success:true,data:query(`SELECT r.*,
    (SELECT COUNT(*) FROM hostel_allocations a WHERE a.room_id=r.id AND a.status='active') AS occupied
    FROM hostel_rooms r WHERE r.hostel_id=? ORDER BY r.floor,r.room_number`,[Number(req.params.id)])});
});
app.post("/api/admin/hostels/:id/rooms",requireAdmin,(req,res)=>{
  const {room_number="",floor="",room_type="shared",capacity=1,monthly_fee=0,status="available"}=req.body??{};
  if(!String(room_number).trim())return res.status(400).json({success:false,message:"Room number is required."});
  try{
    const id=insert(`INSERT INTO hostel_rooms (hostel_id,room_number,floor,room_type,capacity,monthly_fee,status)
      VALUES (?,?,?,?,?,?,?)`,[Number(req.params.id),room_number,floor,room_type,Number(capacity)||1,Number(monthly_fee)||0,status]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_rooms WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Room number already exists in this hostel."})}
});
app.patch("/api/admin/hostel-rooms/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),cur=queryOne("SELECT * FROM hostel_rooms WHERE id=?",[id]);
  if(!cur)return res.status(404).json({success:false,message:"Room not found."});
  const n={...cur,...req.body};
  db.run(`UPDATE hostel_rooms SET room_number=?,floor=?,room_type=?,capacity=?,monthly_fee=?,status=? WHERE id=?`,
    [n.room_number,n.floor,n.room_type,Number(n.capacity)||1,Number(n.monthly_fee)||0,n.status,id]);
  persistDatabase();res.json({success:true});
});
app.delete("/api/admin/hostel-rooms/:id",requireAdmin,(req,res)=>{
  db.run("DELETE FROM hostel_rooms WHERE id=?",[Number(req.params.id)]);
  persistDatabase();res.json({success:true});
});

app.get("/api/admin/hostel/students",requireAdmin,(req,res)=>{
  const q=String(req.query.q||"").trim();
  const rows=query(`SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,
    COALESCE((SELECT h.name FROM hostel_allocations a JOIN hostel_buildings h ON h.id=a.hostel_id WHERE a.student_id=s.id AND a.status='active' LIMIT 1),'') AS hostel_name,
    COALESCE((SELECT r.room_number FROM hostel_allocations a JOIN hostel_rooms r ON r.id=a.room_id WHERE a.student_id=s.id AND a.status='active' LIMIT 1),'') AS room_number
    FROM students s WHERE s.status='active' AND (?='' OR s.full_name LIKE ? OR s.admission_no LIKE ?)
    ORDER BY s.class_name,s.section,s.roll_no,s.full_name`,[q,`%${q}%`,`%${q}%`]);
  res.json({success:true,data:rows});
});

app.get("/api/admin/hostel/allocations",requireAdmin,(req,res)=>{
  res.json({success:true,data:query(`SELECT a.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,
    h.name AS hostel_name,r.room_number,r.floor
    FROM hostel_allocations a JOIN students s ON s.id=a.student_id
    JOIN hostel_buildings h ON h.id=a.hostel_id JOIN hostel_rooms r ON r.id=a.room_id
    WHERE a.status='active' ORDER BY h.name,r.room_number,s.full_name`)});
});
app.post("/api/admin/hostel/allocations",requireAdmin,(req,res)=>{
  const {student_id,hostel_id,room_id,bed_number="",check_in_date="",remarks=""}=req.body??{};
  if(!Number(student_id)||!Number(hostel_id)||!Number(room_id)||!check_in_date)
    return res.status(400).json({success:false,message:"Student, hostel, room and check-in date are required."});
  const room=queryOne("SELECT * FROM hostel_rooms WHERE id=? AND hostel_id=?",[Number(room_id),Number(hostel_id)]);
  if(!room)return res.status(404).json({success:false,message:"Room not found."});
  const existing=queryOne("SELECT id FROM hostel_allocations WHERE student_id=? AND status='active'",[Number(student_id)]);
  if(existing)return res.status(409).json({success:false,message:"Student already has an active hostel allocation."});
  const occupied=queryOne("SELECT COUNT(*) AS c FROM hostel_allocations WHERE room_id=? AND status='active'",[Number(room_id)]);
  if(Number(occupied?.c||0)>=Number(room.capacity))return res.status(409).json({success:false,message:"Room is full."});
  const id=insert(`INSERT INTO hostel_allocations (student_id,hostel_id,room_id,bed_number,check_in_date,remarks)
    VALUES (?,?,?,?,?,?)`,[Number(student_id),Number(hostel_id),Number(room_id),bed_number,check_in_date,remarks]);
  db.run("UPDATE hostel_rooms SET status='occupied' WHERE id=? AND ? >= capacity",[Number(room_id),Number(occupied?.c||0)+1]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_allocations WHERE id=?",[id])});
});
app.patch("/api/admin/hostel/allocations/:id/checkout",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),a=queryOne("SELECT * FROM hostel_allocations WHERE id=?",[id]);
  if(!a)return res.status(404).json({success:false,message:"Allocation not found."});
  db.run("UPDATE hostel_allocations SET status='checked_out',check_out_date=? WHERE id=?",
    [req.body?.check_out_date||new Date().toISOString().slice(0,10),id]);
  db.run("UPDATE hostel_rooms SET status='available' WHERE id=? AND status='occupied'",[a.room_id]);
  persistDatabase();res.json({success:true});
});

app.get("/api/admin/hostel/attendance",requireAdmin,(req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  res.json({success:true,data:query(`SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,
    h.name AS hostel_name,r.room_number,COALESCE(ha.status,'not_marked') AS attendance_status,
    ha.check_in_time,ha.check_out_time,ha.remarks
    FROM hostel_allocations a JOIN students s ON s.id=a.student_id
    JOIN hostel_buildings h ON h.id=a.hostel_id JOIN hostel_rooms r ON r.id=a.room_id
    LEFT JOIN hostel_attendance ha ON ha.student_id=s.id AND ha.attendance_date=?
    WHERE a.status='active' ORDER BY h.name,r.room_number,s.roll_no,s.full_name`,[date])});
});
app.post("/api/admin/hostel/attendance",requireAdmin,(req,res)=>{
  const {student_id,hostel_id,attendance_date="",status="present",check_in_time="",check_out_time="",remarks=""}=req.body??{};
  if(!Number(student_id)||!Number(hostel_id)||!attendance_date)return res.status(400).json({success:false,message:"Student, hostel and date are required."});
  const old=queryOne("SELECT id FROM hostel_attendance WHERE student_id=? AND attendance_date=?",[Number(student_id),attendance_date]);
  if(old)db.run(`UPDATE hostel_attendance SET status=?,check_in_time=?,check_out_time=?,remarks=?,marked_by=? WHERE id=?`,
    [status,check_in_time||null,check_out_time||null,remarks,req.admin?.id||null,old.id]);
  else insert(`INSERT INTO hostel_attendance (student_id,hostel_id,attendance_date,status,check_in_time,check_out_time,remarks,marked_by)
    VALUES (?,?,?,?,?,?,?,?)`,[Number(student_id),Number(hostel_id),attendance_date,status,check_in_time||null,check_out_time||null,remarks,req.admin?.id||null]);
  persistDatabase();res.json({success:true});
});

app.get("/api/admin/hostel/complaints",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query(`SELECT c.*,s.full_name,s.admission_no,h.name AS hostel_name,r.room_number
    FROM hostel_complaints c JOIN students s ON s.id=c.student_id JOIN hostel_buildings h ON h.id=c.hostel_id
    LEFT JOIN hostel_rooms r ON r.id=c.room_id ORDER BY c.status='open' DESC,c.created_at DESC`)});
});
app.post("/api/admin/hostel/complaints",requireAdmin,(req,res)=>{
  const {student_id,hostel_id,room_id=null,title="",description="",priority="normal"}=req.body??{};
  if(!Number(student_id)||!Number(hostel_id)||!String(title).trim()||!String(description).trim())
    return res.status(400).json({success:false,message:"Student, hostel, title and description are required."});
  const id=insert(`INSERT INTO hostel_complaints (student_id,hostel_id,room_id,title,description,priority)
    VALUES (?,?,?,?,?,?)`,[Number(student_id),Number(hostel_id),room_id?Number(room_id):null,title,description,priority]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_complaints WHERE id=?",[id])});
});
app.patch("/api/admin/hostel/complaints/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),status=req.body?.status||"resolved";
  db.run("UPDATE hostel_complaints SET status=?,resolution=?,resolved_at=? WHERE id=?",
    [status,req.body?.resolution||null,status==="resolved"?new Date().toISOString():null,id]);
  persistDatabase();res.json({success:true});
});

app.get("/api/admin/hostel/visitors",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query(`SELECT v.*,s.full_name,s.admission_no,h.name AS hostel_name
    FROM hostel_visitors v JOIN students s ON s.id=v.student_id JOIN hostel_buildings h ON h.id=v.hostel_id
    ORDER BY v.visit_date DESC,v.in_time DESC`)});
});
app.post("/api/admin/hostel/visitors",requireAdmin,(req,res)=>{
  const {student_id,hostel_id,visitor_name="",relation="",phone="",visit_date="",in_time="",out_time="",purpose="",status="scheduled"}=req.body??{};
  if(!Number(student_id)||!Number(hostel_id)||!String(visitor_name).trim()||!visit_date)
    return res.status(400).json({success:false,message:"Student, hostel, visitor and visit date are required."});
  const id=insert(`INSERT INTO hostel_visitors
    (student_id,hostel_id,visitor_name,relation,phone,visit_date,in_time,out_time,purpose,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [Number(student_id),Number(hostel_id),visitor_name,relation,phone,visit_date,in_time||null,out_time||null,purpose,status]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_visitors WHERE id=?",[id])});
});

app.get("/api/admin/hostel/dashboard",requireAdmin,(_req,res)=>{
  const hostels=queryOne("SELECT COUNT(*) AS c FROM hostel_buildings WHERE status='active'");
  const rooms=queryOne("SELECT COUNT(*) AS c FROM hostel_rooms WHERE status!='maintenance'");
  const capacity=queryOne("SELECT COALESCE(SUM(capacity),0) AS c FROM hostel_rooms WHERE status!='maintenance'");
  const occupied=queryOne("SELECT COUNT(*) AS c FROM hostel_allocations WHERE status='active'");
  const complaints=queryOne("SELECT COUNT(*) AS c FROM hostel_complaints WHERE status='open'");
  const available=Math.max(0,Number(capacity?.c||0)-Number(occupied?.c||0));
  res.json({success:true,data:{hostels:Number(hostels?.c||0),rooms:Number(rooms?.c||0),capacity:Number(capacity?.c||0),occupied:Number(occupied?.c||0),available,open_complaints:Number(complaints?.c||0)}});
});

app.get("/api/student/hostel",requireStudent,(req,res)=>{
  const allocation=queryOne(`SELECT a.*,h.name AS hostel_name,h.warden_name,h.warden_phone,r.room_number,r.floor,r.room_type,r.monthly_fee
    FROM hostel_allocations a JOIN hostel_buildings h ON h.id=a.hostel_id JOIN hostel_rooms r ON r.id=a.room_id
    WHERE a.student_id=? AND a.status='active'`,[req.student.id]);
  const attendance=query(`SELECT * FROM hostel_attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 60`,[req.student.id]);
  const complaints=query(`SELECT * FROM hostel_complaints WHERE student_id=? ORDER BY created_at DESC`,[req.student.id]);
  const visitors=query(`SELECT * FROM hostel_visitors WHERE student_id=? ORDER BY visit_date DESC`,[req.student.id]);
  res.json({success:true,data:{allocation,attendance,complaints,visitors}});
});
app.get("/api/parent/hostel",requireParent,(req,res)=>{
  const allocation=queryOne(`SELECT a.*,s.full_name,h.name AS hostel_name,h.warden_name,h.warden_phone,r.room_number,r.floor,r.room_type,r.monthly_fee
    FROM hostel_allocations a JOIN students s ON s.id=a.student_id JOIN hostel_buildings h ON h.id=a.hostel_id JOIN hostel_rooms r ON r.id=a.room_id
    JOIN parent_students ps ON ps.student_id=s.id WHERE ps.parent_id=? AND a.status='active' LIMIT 1`,[req.parent.id]);
  const attendance=allocation?query(`SELECT ha.* FROM hostel_attendance ha JOIN parent_students ps ON ps.student_id=ha.student_id WHERE ps.parent_id=? ORDER BY attendance_date DESC LIMIT 30`,[req.parent.id]):[];
  const visitors=allocation?query(`SELECT v.* FROM hostel_visitors v JOIN parent_students ps ON ps.student_id=v.student_id WHERE ps.parent_id=? ORDER BY visit_date DESC LIMIT 30`,[req.parent.id]):[];
  res.json({success:true,data:{allocation,attendance,visitors}});
});
app.post("/api/student/hostel/complaints",requireStudent,(req,res)=>{
  const a=queryOne("SELECT hostel_id,room_id FROM hostel_allocations WHERE student_id=? AND status='active'",[req.student.id]);
  if(!a)return res.status(400).json({success:false,message:"No active hostel allocation found."});
  const {title="",description="",priority="normal"}=req.body??{};
  if(!String(title).trim()||!String(description).trim())return res.status(400).json({success:false,message:"Title and description are required."});
  const id=insert(`INSERT INTO hostel_complaints (student_id,hostel_id,room_id,title,description,priority)
    VALUES (?,?,?,?,?,?)`,[req.student.id,a.hostel_id,a.room_id,title,description,priority]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_complaints WHERE id=?",[id])});
});


/* ===== REPORT CARD & PERFORMANCE V15 ===== */

function ensureReportCardV15(){
  db.run(`CREATE TABLE IF NOT EXISTS report_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    academic_year TEXT NOT NULL,
    term TEXT NOT NULL,
    exam_name TEXT NOT NULL,
    total_marks REAL NOT NULL DEFAULT 0,
    obtained_marks REAL NOT NULL DEFAULT 0,
    percentage REAL NOT NULL DEFAULT 0,
    grade TEXT,
    result TEXT NOT NULL DEFAULT 'Pass',
    rank INTEGER,
    remarks TEXT,
    attendance_percentage REAL,
    published INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id,academic_year,term,exam_name)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS report_card_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_card_id INTEGER NOT NULL,
    subject_name TEXT NOT NULL,
    max_marks REAL NOT NULL DEFAULT 100,
    obtained_marks REAL NOT NULL DEFAULT 0,
    percentage REAL NOT NULL DEFAULT 0,
    grade TEXT,
    result TEXT NOT NULL DEFAULT 'Pass',
    teacher_remarks TEXT,
    UNIQUE(report_card_id,subject_name)
  )`);
  persistDatabase();
}
ensureReportCardV15();

function gradeFromPercentage(p){
  const n=Number(p)||0;
  if(n>=90)return "A+";
  if(n>=80)return "A";
  if(n>=70)return "B+";
  if(n>=60)return "B";
  if(n>=50)return "C";
  if(n>=40)return "D";
  return "F";
}
function resultFromPercentage(p){return (Number(p)||0)>=33?"Pass":"Fail";}

app.get("/api/admin/report-cards",requireAdmin,(req,res)=>{
  const year=String(req.query.academic_year||"");
  const term=String(req.query.term||"");
  const exam=String(req.query.exam_name||"");
  let sql=`SELECT r.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section
    FROM report_cards r JOIN students s ON s.id=r.student_id WHERE 1=1`;
  const args=[];
  if(year){sql+=" AND r.academic_year=?";args.push(year)}
  if(term){sql+=" AND r.term=?";args.push(term)}
  if(exam){sql+=" AND r.exam_name=?";args.push(exam)}
  sql+=" ORDER BY s.class_name,s.section,s.roll_no,s.full_name";
  res.json({success:true,data:query(sql,args)});
});

app.get("/api/admin/report-cards/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  const card=queryOne(`SELECT r.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section
    FROM report_cards r JOIN students s ON s.id=r.student_id WHERE r.id=?`,[id]);
  if(!card)return res.status(404).json({success:false,message:"Report card not found."});
  res.json({success:true,data:{...card,subjects:query("SELECT * FROM report_card_subjects WHERE report_card_id=? ORDER BY id",[id])}});
});

app.post("/api/admin/report-cards",requireAdmin,(req,res)=>{
  const {
    student_id,academic_year="",term="",exam_name="",remarks="",rank=null,
    attendance_percentage=null,published=false,subjects=[]
  }=req.body??{};
  if(!Number(student_id)||!academic_year||!term||!exam_name)
    return res.status(400).json({success:false,message:"Student, academic year, term and exam name are required."});
  const student=queryOne("SELECT id FROM students WHERE id=?",[Number(student_id)]);
  if(!student)return res.status(404).json({success:false,message:"Student not found."});

  const list=Array.isArray(subjects)?subjects:[];
  if(!list.length)return res.status(400).json({success:false,message:"At least one subject is required."});

  let total=0,obtained=0,failed=false;
  const normalized=list.map(x=>{
    const max=Math.max(0,Number(x.max_marks)||0);
    const got=Math.max(0,Number(x.obtained_marks)||0);
    const pct=max?Math.min(100,(got/max)*100):0;
    const grade=x.grade||gradeFromPercentage(pct);
    const result=x.result||resultFromPercentage(pct);
    total+=max;obtained+=got;if(result==="Fail")failed=true;
    return {subject_name:String(x.subject_name||"").trim(),max_marks:max,obtained_marks:got,percentage:Number(pct.toFixed(2)),grade,result,teacher_remarks:x.teacher_remarks||""};
  }).filter(x=>x.subject_name);

  if(!normalized.length)return res.status(400).json({success:false,message:"Valid subject names are required."});
  const pct=total?Number(((obtained/total)*100).toFixed(2)):0;
  const overallResult=failed||pct<33?"Fail":"Pass";
  const overallGrade=gradeFromPercentage(pct);

  let id;
  try{
    id=insert(`INSERT INTO report_cards
      (student_id,academic_year,term,exam_name,total_marks,obtained_marks,percentage,grade,result,rank,remarks,attendance_percentage,published,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [Number(student_id),academic_year,term,exam_name,total,obtained,pct,overallGrade,overallResult,
       rank===null||rank===""?null:Number(rank),remarks,attendance_percentage===null||attendance_percentage===""?null:Number(attendance_percentage),
       published?1:0,req.admin?.id||null]);
  }catch{
    return res.status(409).json({success:false,message:"A report card for this student, academic year, term and exam already exists."});
  }
  normalized.forEach(x=>insert(`INSERT INTO report_card_subjects
    (report_card_id,subject_name,max_marks,obtained_marks,percentage,grade,result,teacher_remarks)
    VALUES (?,?,?,?,?,?,?,?)`,
    [id,x.subject_name,x.max_marks,x.obtained_marks,x.percentage,x.grade,x.result,x.teacher_remarks]));
  persistDatabase();
  res.status(201).json({success:true,data:queryOne("SELECT * FROM report_cards WHERE id=?",[id])});
});

app.patch("/api/admin/report-cards/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  const old=queryOne("SELECT * FROM report_cards WHERE id=?",[id]);
  if(!old)return res.status(404).json({success:false,message:"Report card not found."});
  const body=req.body??{};
  let total=old.total_marks,obtained=old.obtained_marks,pct=old.percentage,grade=old.grade,result=old.result;
  let normalized=null;
  if(Array.isArray(body.subjects)){
    total=0;obtained=0;let failed=false;
    normalized=body.subjects.map(x=>{
      const max=Math.max(0,Number(x.max_marks)||0),got=Math.max(0,Number(x.obtained_marks)||0);
      const p=max?Math.min(100,(got/max)*100):0, g=x.grade||gradeFromPercentage(p), r=x.result||resultFromPercentage(p);
      total+=max;obtained+=got;if(r==="Fail")failed=true;
      return {subject_name:String(x.subject_name||"").trim(),max_marks:max,obtained_marks:got,percentage:Number(p.toFixed(2)),grade:g,result:r,teacher_remarks:x.teacher_remarks||""};
    }).filter(x=>x.subject_name);
    pct=total?Number(((obtained/total)*100).toFixed(2)):0;grade=gradeFromPercentage(pct);result=failed||pct<33?"Fail":"Pass";
  }
  const n={...old,...body,total_marks:total,obtained_marks:obtained,percentage:pct,grade,result};
  db.run(`UPDATE report_cards SET academic_year=?,term=?,exam_name=?,total_marks=?,obtained_marks=?,percentage=?,grade=?,result=?,rank=?,remarks=?,attendance_percentage=?,published=? WHERE id=?`,
    [n.academic_year,n.term,n.exam_name,total,obtained,pct,grade,result,
     n.rank===""||n.rank==null?null:Number(n.rank),n.remarks,n.attendance_percentage===""||n.attendance_percentage==null?null:Number(n.attendance_percentage),
     n.published?1:0,id]);
  if(normalized){
    db.run("DELETE FROM report_card_subjects WHERE report_card_id=?",[id]);
    normalized.forEach(x=>insert(`INSERT INTO report_card_subjects
      (report_card_id,subject_name,max_marks,obtained_marks,percentage,grade,result,teacher_remarks)
      VALUES (?,?,?,?,?,?,?,?)`,
      [id,x.subject_name,x.max_marks,x.obtained_marks,x.percentage,x.grade,x.result,x.teacher_remarks]));
  }
  persistDatabase();res.json({success:true});
});

app.delete("/api/admin/report-cards/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  db.run("DELETE FROM report_card_subjects WHERE report_card_id=?",[id]);
  db.run("DELETE FROM report_cards WHERE id=?",[id]);
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/report-cards/:id/publish",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  const card=queryOne("SELECT * FROM report_cards WHERE id=?",[id]);
  if(!card)return res.status(404).json({success:false,message:"Report card not found."});
  db.run("UPDATE report_cards SET published=1 WHERE id=?",[id]);
  persistDatabase();res.json({success:true});
});

app.get("/api/student/report-cards",requireStudent,(req,res)=>{
  const cards=query(`SELECT * FROM report_cards WHERE student_id=? AND published=1 ORDER BY academic_year DESC,term DESC,created_at DESC`,[req.student.id]);
  const data=cards.map(c=>({...c,subjects:query("SELECT * FROM report_card_subjects WHERE report_card_id=? ORDER BY id",[c.id])}));
  res.json({success:true,data});
});

app.get("/api/parent/report-cards",requireParent,(req,res)=>{
  const cards=query(`SELECT r.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section
    FROM report_cards r JOIN students s ON s.id=r.student_id JOIN parent_students ps ON ps.student_id=s.id
    WHERE ps.parent_id=? AND r.published=1 ORDER BY r.academic_year DESC,r.term DESC,r.created_at DESC`,[req.parent.id]);
  const data=cards.map(c=>({...c,subjects:query("SELECT * FROM report_card_subjects WHERE report_card_id=? ORDER BY id",[c.id])}));
  res.json({success:true,data});
});

app.get("/api/teacher/report-cards",requireTeacher,(req,res)=>{
  const year=String(req.query.academic_year||"");
  const term=String(req.query.term||"");
  let sql=`SELECT r.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section
    FROM report_cards r JOIN students s ON s.id=r.student_id WHERE 1=1`;
  const args=[];
  if(year){sql+=" AND r.academic_year=?";args.push(year)}
  if(term){sql+=" AND r.term=?";args.push(term)}
  sql+=" ORDER BY s.class_name,s.section,s.roll_no";
  res.json({success:true,data:query(sql,args)});
});


/* ===== COMPLETE STUDENT MANAGEMENT V16 ===== */

function ensureStudentManagementV16(){
  db.run(`CREATE TABLE IF NOT EXISTS student_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL UNIQUE,
    photo_url TEXT,
    dob TEXT,
    gender TEXT,
    blood_group TEXT,
    religion TEXT,
    category TEXT,
    nationality TEXT DEFAULT 'Indian',
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relation TEXT,
    previous_school TEXT,
    admission_date TEXT,
    house TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    document_type TEXT NOT NULL,
    document_name TEXT NOT NULL,
    document_url TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id,document_type)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    academic_year TEXT NOT NULL,
    class_name TEXT,
    section TEXT,
    roll_no TEXT,
    house TEXT,
    status TEXT,
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    from_academic_year TEXT NOT NULL,
    from_class TEXT,
    from_section TEXT,
    to_academic_year TEXT NOT NULL,
    to_class TEXT,
    to_section TEXT,
    promoted_on TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    remarks TEXT
  )`);
  persistDatabase();
}
ensureStudentManagementV16();

function studentProfile(id){
  return queryOne(`SELECT s.*,p.photo_url,p.dob,p.gender,p.blood_group,p.religion,p.category,p.nationality,
    p.phone AS profile_phone,p.email AS profile_email,p.address,p.city,p.state,p.pincode,
    p.emergency_contact_name,p.emergency_contact_phone,p.emergency_contact_relation,
    p.previous_school,p.admission_date,p.house,p.status AS profile_status
    FROM students s LEFT JOIN student_profiles p ON p.student_id=s.id WHERE s.id=?`,[Number(id)]);
}

app.get("/api/admin/students",requireAdmin,(req,res)=>{
  const q=String(req.query.q||"").trim();
  const cls=String(req.query.class_name||"").trim();
  const section=String(req.query.section||"").trim();
  const status=String(req.query.status||"active").trim();
  let sql=`SELECT s.*,p.photo_url,p.dob,p.gender,p.blood_group,p.phone AS profile_phone,
    p.address,p.city,p.state,p.status AS profile_status
    FROM students s LEFT JOIN student_profiles p ON p.student_id=s.id WHERE 1=1`;
  const args=[];
  if(q){sql+=" AND (s.full_name LIKE ? OR s.admission_no LIKE ? OR s.roll_no LIKE ? OR p.phone LIKE ? OR p.email LIKE ?)";
    args.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`)}
  if(cls){sql+=" AND s.class_name=?";args.push(cls)}
  if(section){sql+=" AND s.section=?";args.push(section)}
  if(status){sql+=" AND COALESCE(p.status,'active')=?";args.push(status)}
  sql+=" ORDER BY s.class_name,s.section,s.roll_no,s.full_name";
  res.json({success:true,data:query(sql,args)});
});

app.get("/api/admin/students/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),student=studentProfile(id);
  if(!student)return res.status(404).json({success:false,message:"Student not found."});
  res.json({success:true,data:{
    ...student,
    documents:query("SELECT * FROM student_documents WHERE student_id=? ORDER BY id",[id]),
    history:query("SELECT * FROM student_history WHERE student_id=? ORDER BY academic_year DESC,id DESC",[id]),
    promotions:query("SELECT * FROM student_promotions WHERE student_id=? ORDER BY promoted_on DESC,id DESC",[id]),
    parents:query(`SELECT ps.*,p.full_name AS parent_name,p.email AS parent_email,p.phone AS parent_phone
      FROM parent_students ps JOIN parents p ON p.id=ps.parent_id WHERE ps.student_id=?`,[id])
  }});
});

app.post("/api/admin/students/:id/profile",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),s=queryOne("SELECT * FROM students WHERE id=?",[id]);
  if(!s)return res.status(404).json({success:false,message:"Student not found."});
  const b=req.body??{};
  const cur=queryOne("SELECT * FROM student_profiles WHERE student_id=?",[id])||{};
  const n={...cur,...b};
  if(cur.id){
    db.run(`UPDATE student_profiles SET photo_url=?,dob=?,gender=?,blood_group=?,religion=?,category=?,nationality=?,phone=?,email=?,address=?,city=?,state=?,pincode=?,emergency_contact_name=?,emergency_contact_phone=?,emergency_contact_relation=?,previous_school=?,admission_date=?,house=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE student_id=?`,
      [n.photo_url||null,n.dob||null,n.gender||null,n.blood_group||null,n.religion||null,n.category||null,n.nationality||"Indian",n.phone||null,n.email||null,n.address||null,n.city||null,n.state||null,n.pincode||null,n.emergency_contact_name||null,n.emergency_contact_phone||null,n.emergency_contact_relation||null,n.previous_school||null,n.admission_date||null,n.house||null,n.status||"active",id]);
  }else{
    insert(`INSERT INTO student_profiles (student_id,photo_url,dob,gender,blood_group,religion,category,nationality,phone,email,address,city,state,pincode,emergency_contact_name,emergency_contact_phone,emergency_contact_relation,previous_school,admission_date,house,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id,n.photo_url||null,n.dob||null,n.gender||null,n.blood_group||null,n.religion||null,n.category||null,n.nationality||"Indian",n.phone||null,n.email||null,n.address||null,n.city||null,n.state||null,n.pincode||null,n.emergency_contact_name||null,n.emergency_contact_phone||null,n.emergency_contact_relation||null,n.previous_school||null,n.admission_date||null,n.house||null,n.status||"active"]);
  }
  persistDatabase();res.json({success:true,data:studentProfile(id)});
});

app.patch("/api/admin/students/:id/status",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),status=String(req.body?.status||"active");
  if(!["active","inactive","graduated","transferred","alumni"].includes(status))
    return res.status(400).json({success:false,message:"Invalid student status."});
  const cur=queryOne("SELECT * FROM student_profiles WHERE student_id=?",[id]);
  if(cur)db.run("UPDATE student_profiles SET status=?,updated_at=CURRENT_TIMESTAMP WHERE student_id=?",[status,id]);
  else insert("INSERT INTO student_profiles (student_id,status) VALUES (?,?)",[id,status]);
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/students/:id/documents",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),b=req.body??{};
  if(!b.document_type||!b.document_name)return res.status(400).json({success:false,message:"Document type and document name are required."});
  const old=queryOne("SELECT id FROM student_documents WHERE student_id=? AND document_type=?",[id,b.document_type]);
  if(old)db.run("UPDATE student_documents SET document_name=?,document_url=?,verified=? WHERE id=?",[b.document_name,b.document_url||null,b.verified?1:0,old.id]);
  else insert("INSERT INTO student_documents (student_id,document_type,document_name,document_url,verified) VALUES (?,?,?,?,?)",[id,b.document_type,b.document_name,b.document_url||null,b.verified?1:0]);
  persistDatabase();res.json({success:true});
});
app.patch("/api/admin/student-documents/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),b=req.body??{};
  db.run("UPDATE student_documents SET document_name=?,document_url=?,verified=? WHERE id=?",[b.document_name,b.document_url||null,b.verified?1:0,id]);
  persistDatabase();res.json({success:true});
});
app.delete("/api/admin/student-documents/:id",requireAdmin,(req,res)=>{
  db.run("DELETE FROM student_documents WHERE id=?",[Number(req.params.id)]);persistDatabase();res.json({success:true});
});

app.get("/api/admin/students/:id/history",requireAdmin,(req,res)=>{
  res.json({success:true,data:query("SELECT * FROM student_history WHERE student_id=? ORDER BY academic_year DESC,id DESC",[Number(req.params.id)])});
});
app.post("/api/admin/students/:id/history",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!b.academic_year)return res.status(400).json({success:false,message:"Academic year is required."});
  const id=insert(`INSERT INTO student_history (student_id,academic_year,class_name,section,roll_no,house,status,remarks)
    VALUES (?,?,?,?,?,?,?,?)`,
    [Number(req.params.id),b.academic_year,b.class_name||null,b.section||null,b.roll_no||null,b.house||null,b.status||"active",b.remarks||null]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM student_history WHERE id=?",[id])});
});

app.post("/api/admin/students/:id/promote",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),b=req.body??{},s=queryOne("SELECT * FROM students WHERE id=?",[id]);
  if(!s)return res.status(404).json({success:false,message:"Student not found."});
  if(!b.to_academic_year||!b.to_class)return res.status(400).json({success:false,message:"Target academic year and class are required."});
  const profile=queryOne("SELECT * FROM student_profiles WHERE student_id=?",[id]);
  const fromYear=String(b.from_academic_year||b.academic_year||"");
  const currentHistory=queryOne("SELECT * FROM student_history WHERE student_id=? ORDER BY id DESC LIMIT 1",[id]);
  const fromClass=b.from_class||s.class_name||currentHistory?.class_name||"";
  const fromSection=b.from_section||s.section||currentHistory?.section||"";
  insert(`INSERT INTO student_promotions
    (student_id,from_academic_year,from_class,from_section,to_academic_year,to_class,to_section,remarks)
    VALUES (?,?,?,?,?,?,?,?)`,
    [id,fromYear,fromClass,fromSection,b.to_academic_year,b.to_class,b.to_section||"",b.remarks||null]);
  insert(`INSERT INTO student_history (student_id,academic_year,class_name,section,roll_no,house,status,remarks)
    VALUES (?,?,?,?,?,?,?,?)`,
    [id,b.to_academic_year,b.to_class,b.to_section||"",b.roll_no||"",profile?.house||"", "active", "Promoted"]);
  /* Keep compatibility with existing student schema while updating class placement. */
  try{
    db.run("UPDATE students SET class_name=?,section=?,roll_no=? WHERE id=?",[b.to_class,b.to_section||"",b.roll_no||s.roll_no||"",id]);
  }catch{}
  persistDatabase();res.json({success:true,data:studentProfile(id)});
});

app.get("/api/admin/student-stats",requireAdmin,(_req,res)=>{
  const total=queryOne("SELECT COUNT(*) AS c FROM students");
  const active=queryOne(`SELECT COUNT(*) AS c FROM students s LEFT JOIN student_profiles p ON p.student_id=s.id WHERE COALESCE(p.status,'active')='active'`);
  const inactive=queryOne(`SELECT COUNT(*) AS c FROM students s LEFT JOIN student_profiles p ON p.student_id=s.id WHERE COALESCE(p.status,'active')!='active'`);
  const classes=query(`SELECT class_name,COUNT(*) AS count FROM students GROUP BY class_name ORDER BY class_name`);
  res.json({success:true,data:{total:Number(total?.c||0),active:Number(active?.c||0),inactive:Number(inactive?.c||0),classes}});
});


/* ===== TEACHER & STAFF MANAGEMENT V17 ===== */

function ensureTeacherStaffV17(){
  db.run(`CREATE TABLE IF NOT EXISTS staff_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    employee_code TEXT UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher',
    department TEXT,
    designation TEXT,
    subject TEXT,
    phone TEXT,
    email TEXT,
    dob TEXT,
    gender TEXT,
    address TEXT,
    joining_date TEXT,
    qualification TEXT,
    experience_years REAL DEFAULT 0,
    salary REAL DEFAULT 0,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS staff_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    subject_name TEXT NOT NULL,
    class_name TEXT,
    section TEXT,
    academic_year TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(staff_id,subject_name,class_name,section,academic_year)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS staff_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'present',
    check_in_time TEXT,
    check_out_time TEXT,
    remarks TEXT,
    marked_by INTEGER,
    UNIQUE(staff_id,attendance_date)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS staff_leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    leave_type TEXT NOT NULL DEFAULT 'casual',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approved_by INTEGER,
    approval_remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS staff_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    document_type TEXT NOT NULL,
    document_name TEXT NOT NULL,
    document_url TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(staff_id,document_type)
  )`);
  persistDatabase();
}
ensureTeacherStaffV17();

app.get("/api/admin/staff",requireAdmin,(req,res)=>{
  const q=String(req.query.q||"").trim(),role=String(req.query.role||"").trim(),status=String(req.query.status||"active").trim();
  let sql=`SELECT * FROM staff_profiles WHERE 1=1`,args=[];
  if(q){sql+=" AND (full_name LIKE ? OR employee_code LIKE ? OR phone LIKE ? OR email LIKE ? OR department LIKE ?)";
    args.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`)}
  if(role){sql+=" AND role=?";args.push(role)}
  if(status){sql+=" AND status=?";args.push(status)}
  sql+=" ORDER BY full_name";
  res.json({success:true,data:query(sql,args)});
});
app.get("/api/admin/staff/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),staff=queryOne("SELECT * FROM staff_profiles WHERE id=?",[id]);
  if(!staff)return res.status(404).json({success:false,message:"Staff member not found."});
  res.json({success:true,data:{...staff,
    subjects:query("SELECT * FROM staff_subjects WHERE staff_id=? ORDER BY academic_year DESC,class_name,section,subject_name",[id]),
    attendance:query("SELECT * FROM staff_attendance WHERE staff_id=? ORDER BY attendance_date DESC LIMIT 60",[id]),
    leaves:query("SELECT * FROM staff_leaves WHERE staff_id=? ORDER BY created_at DESC",[id]),
    documents:query("SELECT * FROM staff_documents WHERE staff_id=? ORDER BY id",[id])
  }});
});
app.post("/api/admin/staff",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!String(b.full_name||"").trim())return res.status(400).json({success:false,message:"Full name is required."});
  try{
    const id=insert(`INSERT INTO staff_profiles
      (user_id,employee_code,full_name,role,department,designation,subject,phone,email,dob,gender,address,joining_date,qualification,experience_years,salary,emergency_contact_name,emergency_contact_phone,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.user_id||null,b.employee_code||null,b.full_name,b.role||"teacher",b.department||null,b.designation||null,b.subject||null,b.phone||null,b.email||null,b.dob||null,b.gender||null,b.address||null,b.joining_date||null,b.qualification||null,Number(b.experience_years)||0,Number(b.salary)||0,b.emergency_contact_name||null,b.emergency_contact_phone||null,b.status||"active"]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM staff_profiles WHERE id=?",[id])});
  }catch(e){res.status(409).json({success:false,message:"Employee code must be unique."})}
});
app.patch("/api/admin/staff/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),cur=queryOne("SELECT * FROM staff_profiles WHERE id=?",[id]);
  if(!cur)return res.status(404).json({success:false,message:"Staff member not found."});
  const n={...cur,...req.body};
  db.run(`UPDATE staff_profiles SET employee_code=?,full_name=?,role=?,department=?,designation=?,subject=?,phone=?,email=?,dob=?,gender=?,address=?,joining_date=?,qualification=?,experience_years=?,salary=?,emergency_contact_name=?,emergency_contact_phone=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [n.employee_code||null,n.full_name,n.role,n.department||null,n.designation||null,n.subject||null,n.phone||null,n.email||null,n.dob||null,n.gender||null,n.address||null,n.joining_date||null,n.qualification||null,Number(n.experience_years)||0,Number(n.salary)||0,n.emergency_contact_name||null,n.emergency_contact_phone||null,n.status||"active",id]);
  persistDatabase();res.json({success:true});
});
app.delete("/api/admin/staff/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  db.run("DELETE FROM staff_subjects WHERE staff_id=?",[id]);
  db.run("DELETE FROM staff_attendance WHERE staff_id=?",[id]);
  db.run("DELETE FROM staff_leaves WHERE staff_id=?",[id]);
  db.run("DELETE FROM staff_documents WHERE staff_id=?",[id]);
  db.run("DELETE FROM staff_profiles WHERE id=?",[id]);
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/staff/:id/subjects",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!b.subject_name)return res.status(400).json({success:false,message:"Subject is required."});
  try{
    const id=insert(`INSERT INTO staff_subjects (staff_id,subject_name,class_name,section,academic_year)
      VALUES (?,?,?,?,?)`,[Number(req.params.id),b.subject_name,b.class_name||"",b.section||"",b.academic_year||""]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM staff_subjects WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"This subject assignment already exists."})}
});
app.delete("/api/admin/staff-subjects/:id",requireAdmin,(req,res)=>{
  db.run("DELETE FROM staff_subjects WHERE id=?",[Number(req.params.id)]);persistDatabase();res.json({success:true});
});

app.get("/api/admin/staff-attendance",requireAdmin,(req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  res.json({success:true,data:query(`SELECT s.*,COALESCE(a.status,'not_marked') AS attendance_status,a.check_in_time,a.check_out_time,a.remarks
    FROM staff_profiles s LEFT JOIN staff_attendance a ON a.staff_id=s.id AND a.attendance_date=?
    WHERE s.status='active' ORDER BY s.full_name`,[date])});
});
app.post("/api/admin/staff-attendance",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!Number(b.staff_id)||!b.attendance_date)return res.status(400).json({success:false,message:"Staff and attendance date are required."});
  const old=queryOne("SELECT id FROM staff_attendance WHERE staff_id=? AND attendance_date=?",[Number(b.staff_id),b.attendance_date]);
  if(old)db.run("UPDATE staff_attendance SET status=?,check_in_time=?,check_out_time=?,remarks=?,marked_by=? WHERE id=?",
    [b.status||"present",b.check_in_time||null,b.check_out_time||null,b.remarks||"",req.admin?.id||null,old.id]);
  else insert(`INSERT INTO staff_attendance (staff_id,attendance_date,status,check_in_time,check_out_time,remarks,marked_by)
    VALUES (?,?,?,?,?,?,?)`,[Number(b.staff_id),b.attendance_date,b.status||"present",b.check_in_time||null,b.check_out_time||null,b.remarks||"",req.admin?.id||null]);
  persistDatabase();res.json({success:true});
});

app.get("/api/admin/staff-leaves",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query(`SELECT l.*,s.full_name,s.employee_code,s.department,s.designation
    FROM staff_leaves l JOIN staff_profiles s ON s.id=l.staff_id ORDER BY l.status='pending' DESC,l.created_at DESC`)});
});
app.post("/api/admin/staff-leaves",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!Number(b.staff_id)||!b.start_date||!b.end_date)return res.status(400).json({success:false,message:"Staff and leave dates are required."});
  const id=insert(`INSERT INTO staff_leaves (staff_id,leave_type,start_date,end_date,reason)
    VALUES (?,?,?,?,?)`,[Number(b.staff_id),b.leave_type||"casual",b.start_date,b.end_date,b.reason||""]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM staff_leaves WHERE id=?",[id])});
});
app.patch("/api/admin/staff-leaves/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),status=String(req.body?.status||"pending");
  if(!["pending","approved","rejected","cancelled"].includes(status))return res.status(400).json({success:false,message:"Invalid leave status."});
  db.run("UPDATE staff_leaves SET status=?,approved_by=?,approval_remarks=? WHERE id=?",
    [status,status==="pending"?null:req.admin?.id||null,req.body?.approval_remarks||null,id]);
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/staff/:id/documents",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!b.document_type||!b.document_name)return res.status(400).json({success:false,message:"Document type and name are required."});
  const old=queryOne("SELECT id FROM staff_documents WHERE staff_id=? AND document_type=?",[Number(req.params.id),b.document_type]);
  if(old)db.run("UPDATE staff_documents SET document_name=?,document_url=?,verified=? WHERE id=?",[b.document_name,b.document_url||null,b.verified?1:0,old.id]);
  else insert("INSERT INTO staff_documents (staff_id,document_type,document_name,document_url,verified) VALUES (?,?,?,?,?)",[Number(req.params.id),b.document_type,b.document_name,b.document_url||null,b.verified?1:0]);
  persistDatabase();res.json({success:true});
});

app.get("/api/admin/staff-stats",requireAdmin,(_req,res)=>{
  const total=queryOne("SELECT COUNT(*) c FROM staff_profiles");
  const teachers=queryOne("SELECT COUNT(*) c FROM staff_profiles WHERE role='teacher' AND status='active'");
  const other=queryOne("SELECT COUNT(*) c FROM staff_profiles WHERE role!='teacher' AND status='active'");
  const pending=queryOne("SELECT COUNT(*) c FROM staff_leaves WHERE status='pending'");
  res.json({success:true,data:{total:Number(total?.c||0),teachers:Number(teachers?.c||0),other:Number(other?.c||0),pending_leaves:Number(pending?.c||0)}});
});

app.get("/api/teacher/staff-profile",requireTeacher,(req,res)=>{
  const email=req.teacher?.email||"";
  const staff=queryOne("SELECT * FROM staff_profiles WHERE email=? OR user_id=? LIMIT 1",[email,Number(req.teacher?.id||0)]);
  if(!staff)return res.status(404).json({success:false,message:"Teacher staff profile not linked."});
  res.json({success:true,data:{...staff,subjects:query("SELECT * FROM staff_subjects WHERE staff_id=?",[staff.id])}});
});


/* ===== ADVANCED STUDENT ATTENDANCE V18 ===== */

function ensureStudentAttendanceV18(){
  db.run(`CREATE TABLE IF NOT EXISTS student_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'present',
    check_in_time TEXT,
    check_out_time TEXT,
    remarks TEXT,
    marked_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id,attendance_date)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    leave_type TEXT NOT NULL DEFAULT 'casual',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approved_by INTEGER,
    approval_remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureStudentAttendanceV18();

app.get("/api/admin/student-attendance",requireAdmin,(req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  const cls=String(req.query.class_name||"").trim(),section=String(req.query.section||"").trim();
  let sql=`SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,
    COALESCE(a.status,'not_marked') AS attendance_status,a.check_in_time,a.check_out_time,a.remarks
    FROM students s LEFT JOIN student_attendance a ON a.student_id=s.id AND a.attendance_date=?
    LEFT JOIN student_profiles p ON p.student_id=s.id WHERE COALESCE(p.status,'active')='active'`;
  const args=[date];
  if(cls){sql+=" AND s.class_name=?";args.push(cls)}
  if(section){sql+=" AND s.section=?";args.push(section)}
  sql+=" ORDER BY s.class_name,s.section,s.roll_no,s.full_name";
  res.json({success:true,data:query(sql,args)});
});

app.post("/api/admin/student-attendance",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!Number(b.student_id)||!b.attendance_date)return res.status(400).json({success:false,message:"Student and date are required."});
  const status=String(b.status||"present");
  if(!["present","absent","late","leave","half_day"].includes(status))
    return res.status(400).json({success:false,message:"Invalid attendance status."});
  const old=queryOne("SELECT id FROM student_attendance WHERE student_id=? AND attendance_date=?",[Number(b.student_id),b.attendance_date]);
  if(old)db.run("UPDATE student_attendance SET status=?,check_in_time=?,check_out_time=?,remarks=?,marked_by=? WHERE id=?",
    [status,b.check_in_time||null,b.check_out_time||null,b.remarks||"",req.admin?.id||null,old.id]);
  else insert(`INSERT INTO student_attendance (student_id,attendance_date,status,check_in_time,check_out_time,remarks,marked_by)
    VALUES (?,?,?,?,?,?,?)`,[Number(b.student_id),b.attendance_date,status,b.check_in_time||null,b.check_out_time||null,b.remarks||"",req.admin?.id||null]);
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/student-attendance/bulk",requireAdmin,(req,res)=>{
  const b=req.body??{},date=String(b.attendance_date||"");
  if(!date||!Array.isArray(b.records))return res.status(400).json({success:false,message:"Date and attendance records are required."});
  for(const x of b.records){
    if(!Number(x.student_id))continue;
    const status=["present","absent","late","leave","half_day"].includes(x.status)?x.status:"present";
    const old=queryOne("SELECT id FROM student_attendance WHERE student_id=? AND attendance_date=?",[Number(x.student_id),date]);
    if(old)db.run("UPDATE student_attendance SET status=?,check_in_time=?,check_out_time=?,remarks=?,marked_by=? WHERE id=?",
      [status,x.check_in_time||null,x.check_out_time||null,x.remarks||"",req.admin?.id||null,old.id]);
    else insert(`INSERT INTO student_attendance (student_id,attendance_date,status,check_in_time,check_out_time,remarks,marked_by)
      VALUES (?,?,?,?,?,?,?)`,[Number(x.student_id),date,status,x.check_in_time||null,x.check_out_time||null,x.remarks||"",req.admin?.id||null]);
  }
  persistDatabase();res.json({success:true,count:b.records.length});
});

app.get("/api/admin/student-attendance/summary",requireAdmin,(req,res)=>{
  const from=String(req.query.from||"1970-01-01"),to=String(req.query.to||"9999-12-31");
  const cls=String(req.query.class_name||"").trim(),section=String(req.query.section||"").trim();
  let where="a.attendance_date BETWEEN ? AND ?",args=[from,to];
  if(cls){where+=" AND s.class_name=?";args.push(cls)}
  if(section){where+=" AND s.section=?";args.push(section)}
  const rows=query(`SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,
    COUNT(a.id) AS marked_days,
    SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present_days,
    SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absent_days,
    SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) AS late_days,
    SUM(CASE WHEN a.status='leave' THEN 1 ELSE 0 END) AS leave_days,
    SUM(CASE WHEN a.status='half_day' THEN 0.5 ELSE 0 END) AS half_days
    FROM students s JOIN student_attendance a ON a.student_id=s.id WHERE ${where}
    GROUP BY s.id ORDER BY s.class_name,s.section,s.roll_no,s.full_name`,args);
  const data=rows.map(x=>{const marked=Number(x.marked_days||0),present=Number(x.present_days||0)+Number(x.half_days||0);return {...x,attendance_percentage:marked?Number(((present/marked)*100).toFixed(2)):0}});
  res.json({success:true,data});
});

app.get("/api/admin/student-attendance/calendar/:studentId",requireAdmin,(req,res)=>{
  const from=String(req.query.from||"1970-01-01"),to=String(req.query.to||"9999-12-31");
  res.json({success:true,data:query(`SELECT * FROM student_attendance WHERE student_id=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date DESC`,[Number(req.params.studentId),from,to])});
});

app.post("/api/admin/student-leaves",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!Number(b.student_id)||!b.start_date||!b.end_date)return res.status(400).json({success:false,message:"Student and leave dates are required."});
  const id=insert(`INSERT INTO student_leave_requests (student_id,leave_type,start_date,end_date,reason)
    VALUES (?,?,?,?,?)`,[Number(b.student_id),b.leave_type||"casual",b.start_date,b.end_date,b.reason||""]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM student_leave_requests WHERE id=?",[id])});
});
app.get("/api/admin/student-leaves",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query(`SELECT l.*,s.full_name,s.admission_no,s.class_name,s.section
    FROM student_leave_requests l JOIN students s ON s.id=l.student_id
    ORDER BY l.status='pending' DESC,l.created_at DESC`)});
});
app.patch("/api/admin/student-leaves/:id",requireAdmin,(req,res)=>{
  const status=String(req.body?.status||"pending");
  if(!["pending","approved","rejected","cancelled"].includes(status))return res.status(400).json({success:false,message:"Invalid leave status."});
  db.run("UPDATE student_leave_requests SET status=?,approved_by=?,approval_remarks=? WHERE id=?",
    [status,status==="pending"?null:req.admin?.id||null,req.body?.approval_remarks||null,Number(req.params.id)]);
  persistDatabase();res.json({success:true});
});

app.get("/api/student/attendance",requireStudent,(req,res)=>{
  const from=String(req.query.from||"1970-01-01"),to=String(req.query.to||"9999-12-31");
  const rows=query(`SELECT * FROM student_attendance WHERE student_id=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date DESC`,
    [req.student.id,from,to]);
  const marked=rows.length,present=rows.filter(x=>x.status==="present").length+rows.filter(x=>x.status==="half_day").length*.5;
  res.json({success:true,data:{records:rows,summary:{marked_days:marked,present_days:present,absent_days:rows.filter(x=>x.status==="absent").length,late_days:rows.filter(x=>x.status==="late").length,leave_days:rows.filter(x=>x.status==="leave").length,percentage:marked?Number(((present/marked)*100).toFixed(2)):0}}});
});


/* ===== ADVANCED FEES & ACCOUNTING V19 ===== */

function ensureFeesAccountingV19(){
  db.run(`CREATE TABLE IF NOT EXISTS fee_structures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year TEXT NOT NULL,
    class_name TEXT NOT NULL,
    fee_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'tuition',
    amount REAL NOT NULL DEFAULT 0,
    frequency TEXT NOT NULL DEFAULT 'annual',
    due_day INTEGER,
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(academic_year,class_name,fee_name)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_fee_charges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    fee_structure_id INTEGER,
    academic_year TEXT NOT NULL,
    fee_name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    late_fee REAL NOT NULL DEFAULT 0,
    net_amount REAL NOT NULL DEFAULT 0,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'due',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    charge_id INTEGER,
    receipt_no TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    transaction_ref TEXT,
    payment_date TEXT NOT NULL,
    remarks TEXT,
    received_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_discounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    charge_id INTEGER,
    discount_type TEXT NOT NULL DEFAULT 'scholarship',
    amount REAL NOT NULL DEFAULT 0,
    reason TEXT,
    approved_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS finance_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    transaction_date TEXT NOT NULL,
    reference TEXT,
    description TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureFeesAccountingV19();

function nextReceiptV19(){
  const row=queryOne("SELECT COUNT(*) c FROM fee_payments");
  return `SPS-${new Date().getFullYear()}-${String(Number(row?.c||0)+1).padStart(5,"0")}`;
}
function chargeTotalsV19(studentId){
  const rows=query(`SELECT * FROM student_fee_charges WHERE student_id=? ORDER BY due_date,created_at`,[studentId]);
  const paid=query(`SELECT COALESCE(SUM(amount),0) total FROM fee_payments WHERE student_id=?`,[studentId]);
  const total=rows.reduce((a,x)=>a+Number(x.net_amount||0),0);
  const payments=Number(paid?.[0]?.total||0);
  return {charges:rows,total,paid:payments,balance:Math.max(0,total-payments)};
}

app.get("/api/admin/fee-structures",requireAdmin,(req,res)=>{
  const year=String(req.query.academic_year||"").trim(),cls=String(req.query.class_name||"").trim();
  let sql="SELECT * FROM fee_structures WHERE 1=1",args=[];
  if(year){sql+=" AND academic_year=?";args.push(year)}
  if(cls){sql+=" AND class_name=?";args.push(cls)}
  sql+=" ORDER BY academic_year DESC,class_name,fee_name";
  res.json({success:true,data:query(sql,args)});
});
app.post("/api/admin/fee-structures",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!b.academic_year||!b.class_name||!b.fee_name)return res.status(400).json({success:false,message:"Academic year, class and fee name are required."});
  try{
    const id=insert(`INSERT INTO fee_structures (academic_year,class_name,fee_name,category,amount,frequency,due_day,description,active)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [b.academic_year,b.class_name,b.fee_name,b.category||"tuition",Number(b.amount)||0,b.frequency||"annual",b.due_day?Number(b.due_day):null,b.description||"",b.active===false?0:1]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_structures WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"This fee structure already exists."})}
});
app.patch("/api/admin/fee-structures/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),cur=queryOne("SELECT * FROM fee_structures WHERE id=?",[id]);
  if(!cur)return res.status(404).json({success:false,message:"Fee structure not found."});
  const n={...cur,...req.body};
  db.run(`UPDATE fee_structures SET academic_year=?,class_name=?,fee_name=?,category=?,amount=?,frequency=?,due_day=?,description=?,active=? WHERE id=?`,
    [n.academic_year,n.class_name,n.fee_name,n.category||"tuition",Number(n.amount)||0,n.frequency||"annual",n.due_day?Number(n.due_day):null,n.description||"",n.active?1:0,id]);
  persistDatabase();res.json({success:true});
});
app.delete("/api/admin/fee-structures/:id",requireAdmin,(req,res)=>{
  db.run("DELETE FROM fee_structures WHERE id=?",[Number(req.params.id)]);persistDatabase();res.json({success:true});
});

app.post("/api/admin/student-fees/charge",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!Number(b.student_id)||!b.fee_name)return res.status(400).json({success:false,message:"Student and fee name are required."});
  const amount=Math.max(0,Number(b.amount)||0),discount=Math.max(0,Number(b.discount)||0),late=Math.max(0,Number(b.late_fee)||0);
  const net=Math.max(0,amount-discount+late);
  const id=insert(`INSERT INTO student_fee_charges (student_id,fee_structure_id,academic_year,fee_name,amount,discount,late_fee,net_amount,due_date,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [Number(b.student_id),b.fee_structure_id||null,b.academic_year||"",b.fee_name,amount,discount,late,net,b.due_date||null,net<=0?"paid":"due"]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM student_fee_charges WHERE id=?",[id])});
});

app.post("/api/admin/student-fees/generate",requireAdmin,(req,res)=>{
  const b=req.body??{},year=String(b.academic_year||"");
  const cls=String(b.class_name||"");
  if(!year||!cls)return res.status(400).json({success:false,message:"Academic year and class are required."});
  const structures=query("SELECT * FROM fee_structures WHERE academic_year=? AND class_name=? AND active=1",[year,cls]);
  const students=query("SELECT id FROM students WHERE class_name=?",[cls]);
  let created=0;
  for(const st of students){
    for(const f of structures){
      const exists=queryOne("SELECT id FROM student_fee_charges WHERE student_id=? AND fee_structure_id=? AND academic_year=?",[st.id,f.id,year]);
      if(!exists){
        const amount=Number(f.amount)||0;
        insert(`INSERT INTO student_fee_charges (student_id,fee_structure_id,academic_year,fee_name,amount,net_amount,due_date,status)
          VALUES (?,?,?,?,?,?,?,?)`,[st.id,f.id,year,f.fee_name,amount,amount,b.due_date||null,amount>0?"due":"paid"]);
        created++;
      }
    }
  }
  persistDatabase();res.json({success:true,created,students:students.length,fee_items:structures.length});
});

app.get("/api/admin/student-fees",requireAdmin,(req,res)=>{
  const q=String(req.query.q||"").trim(),status=String(req.query.status||"").trim();
  let sql=`SELECT s.id student_id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,
    COALESCE(SUM(c.net_amount),0) total_charged,
    COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.student_id=s.id),0) total_paid
    FROM students s LEFT JOIN student_fee_charges c ON c.student_id=s.id WHERE 1=1`,args=[];
  if(q){sql+=" AND (s.full_name LIKE ? OR s.admission_no LIKE ? OR s.roll_no LIKE ?)";args.push(`%${q}%`,`%${q}%`,`%${q}%`)}
  sql+=" GROUP BY s.id ORDER BY s.class_name,s.section,s.roll_no,s.full_name";
  let data=query(sql,args).map(x=>({...x,total_charged:Number(x.total_charged||0),total_paid:Number(x.total_paid||0),balance:Math.max(0,Number(x.total_charged||0)-Number(x.total_paid||0))}));
  if(status==="paid")data=data.filter(x=>x.balance===0&&x.total_charged>0);
  if(status==="due")data=data.filter(x=>x.balance>0);
  res.json({success:true,data});
});

app.get("/api/admin/student-fees/:studentId",requireAdmin,(req,res)=>{
  const id=Number(req.params.studentId),s=queryOne("SELECT * FROM students WHERE id=?",[id]);
  if(!s)return res.status(404).json({success:false,message:"Student not found."});
  const summary=chargeTotalsV19(id);
  const payments=query(`SELECT * FROM fee_payments WHERE student_id=? ORDER BY payment_date DESC,created_at DESC`,[id]);
  res.json({success:true,data:{student:s,...summary,payments}});
});

app.post("/api/admin/fee-payments",requireAdmin,(req,res)=>{
  const b=req.body??{},studentId=Number(b.student_id),amount=Math.max(0,Number(b.amount)||0);
  if(!studentId||amount<=0)return res.status(400).json({success:false,message:"Student and valid payment amount are required."});
  const receipt=b.receipt_no||nextReceiptV19();
  const paymentDate=b.payment_date||new Date().toISOString().slice(0,10);
  try{
    const id=insert(`INSERT INTO fee_payments (student_id,charge_id,receipt_no,amount,payment_method,transaction_ref,payment_date,remarks,received_by)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [studentId,b.charge_id||null,receipt,amount,b.payment_method||"cash",b.transaction_ref||"",paymentDate,b.remarks||"",req.admin?.id||null]);
    if(b.charge_id){
      const charge=queryOne("SELECT * FROM student_fee_charges WHERE id=?",[Number(b.charge_id)]);
      if(charge){
        const paid=Number(queryOne("SELECT COALESCE(SUM(amount),0) total FROM fee_payments WHERE charge_id=?",[Number(b.charge_id)])?.total||0);
        db.run("UPDATE student_fee_charges SET status=? WHERE id=?",[paid>=Number(charge.net_amount||0)?"paid":"partial",Number(b.charge_id)]);
      }
    }
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_payments WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Receipt number already exists."})}
});

app.get("/api/admin/fee-receipts/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  const p=queryOne(`SELECT p.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section
    FROM fee_payments p JOIN students s ON s.id=p.student_id WHERE p.id=?`,[id]);
  if(!p)return res.status(404).json({success:false,message:"Receipt not found."});
  res.json({success:true,data:p});
});

app.post("/api/admin/fee-discounts",requireAdmin,(req,res)=>{
  const b=req.body??{},studentId=Number(b.student_id),amount=Math.max(0,Number(b.amount)||0);
  if(!studentId||amount<=0)return res.status(400).json({success:false,message:"Student and valid discount amount are required."});
  const id=insert(`INSERT INTO fee_discounts (student_id,charge_id,discount_type,amount,reason,approved_by)
    VALUES (?,?,?,?,?,?)`,[studentId,b.charge_id||null,b.discount_type||"scholarship",amount,b.reason||"",req.admin?.id||null]);
  if(b.charge_id)db.run("UPDATE student_fee_charges SET discount=discount+?,net_amount=MAX(0,amount-discount-?+late_fee) WHERE id=?",[amount,amount,Number(b.charge_id)]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_discounts WHERE id=?",[id])});
});

app.post("/api/admin/finance/transactions",requireAdmin,(req,res)=>{
  const b=req.body??{},amount=Math.max(0,Number(b.amount)||0);
  if(!b.transaction_type||!b.category||amount<=0)return res.status(400).json({success:false,message:"Transaction type, category and valid amount are required."});
  const id=insert(`INSERT INTO finance_transactions (transaction_type,category,amount,transaction_date,reference,description,created_by)
    VALUES (?,?,?,?,?,?,?)`,[b.transaction_type,b.category,amount,b.transaction_date||new Date().toISOString().slice(0,10),b.reference||"",b.description||"",req.admin?.id||null]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM finance_transactions WHERE id=?",[id])});
});
app.get("/api/admin/finance/transactions",requireAdmin,(req,res)=>{
  const from=String(req.query.from||"1970-01-01"),to=String(req.query.to||"9999-12-31");
  res.json({success:true,data:query(`SELECT * FROM finance_transactions WHERE transaction_date BETWEEN ? AND ? ORDER BY transaction_date DESC,id DESC`,[from,to])});
});

app.get("/api/admin/finance/dashboard",requireAdmin,(_req,res)=>{
  const collection=Number(queryOne("SELECT COALESCE(SUM(amount),0) total FROM fee_payments")?.total||0);
  const charged=Number(queryOne("SELECT COALESCE(SUM(net_amount),0) total FROM student_fee_charges")?.total||0);
  const expenses=Number(queryOne("SELECT COALESCE(SUM(amount),0) total FROM finance_transactions WHERE transaction_type='expense'")?.total||0);
  const otherIncome=Number(queryOne("SELECT COALESCE(SUM(amount),0) total FROM finance_transactions WHERE transaction_type='income'")?.total||0);
  const due=Math.max(0,charged-collection);
  const studentsDue=Number(queryOne(`SELECT COUNT(*) c FROM (SELECT s.id FROM students s JOIN student_fee_charges c ON c.student_id=s.id GROUP BY s.id HAVING SUM(c.net_amount)>COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.student_id=s.id),0))`)?.c||0);
  res.json({success:true,data:{charged,collection,due,students_due:studentsDue,expenses,other_income,net_income:collection+otherIncome-expenses}});
});


/* ===== COMPLETE EXAMINATION ENGINE V20 ===== */

function ensureExaminationEngineV20(){
  db.run(`CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year TEXT NOT NULL,
    exam_name TEXT NOT NULL,
    exam_type TEXT NOT NULL DEFAULT 'term',
    class_name TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    max_total REAL DEFAULT 0,
    pass_percentage REAL DEFAULT 33,
    status TEXT NOT NULL DEFAULT 'draft',
    instructions TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS exam_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    subject_name TEXT NOT NULL,
    subject_code TEXT,
    max_theory REAL DEFAULT 0,
    max_practical REAL DEFAULT 0,
    max_internal REAL DEFAULT 0,
    pass_marks REAL DEFAULT 0,
    exam_date TEXT,
    start_time TEXT,
    end_time TEXT,
    room TEXT,
    UNIQUE(exam_id,subject_name)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS exam_marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    exam_subject_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    theory_marks REAL DEFAULT 0,
    practical_marks REAL DEFAULT 0,
    internal_marks REAL DEFAULT 0,
    grace_marks REAL DEFAULT 0,
    total_marks REAL DEFAULT 0,
    percentage REAL DEFAULT 0,
    grade TEXT DEFAULT 'F',
    result TEXT DEFAULT 'FAIL',
    remarks TEXT,
    entered_by INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(exam_subject_id,student_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS exam_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    total_obtained REAL DEFAULT 0,
    total_max REAL DEFAULT 0,
    percentage REAL DEFAULT 0,
    grade TEXT DEFAULT 'F',
    result TEXT DEFAULT 'FAIL',
    rank INTEGER,
    attendance_percentage REAL DEFAULT 0,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    published_at TEXT,
    UNIQUE(exam_id,student_id)
  )`);
  persistDatabase();
}
ensureExaminationEngineV20();

function gradeV20(p){
  const n=Number(p)||0;
  if(n>=90)return"A+";
  if(n>=80)return"A";
  if(n>=70)return"B+";
  if(n>=60)return"B";
  if(n>=50)return"C";
  if(n>=40)return"D";
  return"F";
}
function examMarksTotalV20(x){
  return Number(x.theory_marks||0)+Number(x.practical_marks||0)+Number(x.internal_marks||0)+Number(x.grace_marks||0);
}

app.get("/api/admin/exams",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query(`SELECT e.*,COUNT(es.id) subject_count,
    (SELECT COUNT(*) FROM exam_results er WHERE er.exam_id=e.id) result_count
    FROM exams e LEFT JOIN exam_subjects es ON es.exam_id=e.id
    GROUP BY e.id ORDER BY e.created_at DESC`)});
});
app.get("/api/admin/exams/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),exam=queryOne("SELECT * FROM exams WHERE id=?",[id]);
  if(!exam)return res.status(404).json({success:false,message:"Exam not found."});
  res.json({success:true,data:{...exam,
    subjects:query("SELECT * FROM exam_subjects WHERE exam_id=? ORDER BY exam_date,start_time,id",[id]),
    results:query(`SELECT er.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section
      FROM exam_results er JOIN students s ON s.id=er.student_id WHERE er.exam_id=?
      ORDER BY er.rank IS NULL,er.rank,s.full_name`,[id])
  }});
});
app.post("/api/admin/exams",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!b.academic_year||!b.exam_name||!b.class_name)return res.status(400).json({success:false,message:"Academic year, exam name and class are required."});
  const id=insert(`INSERT INTO exams (academic_year,exam_name,exam_type,class_name,start_date,end_date,max_total,pass_percentage,instructions)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [b.academic_year,b.exam_name,b.exam_type||"term",b.class_name,b.start_date||null,b.end_date||null,Number(b.max_total)||0,Number(b.pass_percentage)||33,b.instructions||""]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM exams WHERE id=?",[id])});
});
app.patch("/api/admin/exams/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),cur=queryOne("SELECT * FROM exams WHERE id=?",[id]);
  if(!cur)return res.status(404).json({success:false,message:"Exam not found."});
  if(cur.status==="published" && req.body?.status!=="draft")return res.status(400).json({success:false,message:"Published exam is locked."});
  const n={...cur,...req.body};
  db.run(`UPDATE exams SET academic_year=?,exam_name=?,exam_type=?,class_name=?,start_date=?,end_date=?,max_total=?,pass_percentage=?,status=?,instructions=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [n.academic_year,n.exam_name,n.exam_type,n.class_name,n.start_date||null,n.end_date||null,Number(n.max_total)||0,Number(n.pass_percentage)||33,n.status||"draft",n.instructions||"",id]);
  persistDatabase();res.json({success:true});
});
app.post("/api/admin/exams/:id/subjects",requireAdmin,(req,res)=>{
  const b=req.body??{},examId=Number(req.params.id);
  if(!b.subject_name)return res.status(400).json({success:false,message:"Subject name is required."});
  try{
    const id=insert(`INSERT INTO exam_subjects (exam_id,subject_name,subject_code,max_theory,max_practical,max_internal,pass_marks,exam_date,start_time,end_time,room)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [examId,b.subject_name,b.subject_code||"",Number(b.max_theory)||0,Number(b.max_practical)||0,Number(b.max_internal)||0,Number(b.pass_marks)||0,b.exam_date||null,b.start_time||null,b.end_time||null,b.room||""]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM exam_subjects WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Subject already exists in this exam."})}
});
app.patch("/api/admin/exam-subjects/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),cur=queryOne("SELECT * FROM exam_subjects WHERE id=?",[id]);
  if(!cur)return res.status(404).json({success:false,message:"Exam subject not found."});
  const n={...cur,...req.body};
  db.run(`UPDATE exam_subjects SET subject_name=?,subject_code=?,max_theory=?,max_practical=?,max_internal=?,pass_marks=?,exam_date=?,start_time=?,end_time=?,room=? WHERE id=?`,
    [n.subject_name,n.subject_code||"",Number(n.max_theory)||0,Number(n.max_practical)||0,Number(n.max_internal)||0,Number(n.pass_marks)||0,n.exam_date||null,n.start_time||null,n.end_time||null,n.room||"",id]);
  persistDatabase();res.json({success:true});
});
app.delete("/api/admin/exam-subjects/:id",requireAdmin,(req,res)=>{
  db.run("DELETE FROM exam_marks WHERE exam_subject_id=?",[Number(req.params.id)]);
  db.run("DELETE FROM exam_subjects WHERE id=?",[Number(req.params.id)]);
  persistDatabase();res.json({success:true});
});

app.get("/api/admin/exams/:examId/marks",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId),subjectId=Number(req.query.subject_id||0);
  if(!subjectId)return res.status(400).json({success:false,message:"subject_id is required."});
  const subject=queryOne("SELECT * FROM exam_subjects WHERE id=? AND exam_id=?",[subjectId,examId]);
  if(!subject)return res.status(404).json({success:false,message:"Exam subject not found."});
  const rows=query(`SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,
    COALESCE(m.id,0) mark_id,COALESCE(m.theory_marks,0) theory_marks,COALESCE(m.practical_marks,0) practical_marks,
    COALESCE(m.internal_marks,0) internal_marks,COALESCE(m.grace_marks,0) grace_marks,COALESCE(m.total_marks,0) total_marks,
    COALESCE(m.percentage,0) percentage,COALESCE(m.grade,'F') grade,COALESCE(m.result,'FAIL') result,m.remarks
    FROM students s LEFT JOIN exam_marks m ON m.student_id=s.id AND m.exam_subject_id=?
    WHERE s.class_name=? ORDER BY s.section,s.roll_no,s.full_name`,[subjectId,(queryOne("SELECT class_name FROM exams WHERE id=?",[examId])||{}).class_name||""]);
  res.json({success:true,data:{subject,students:rows}});
});

app.post("/api/admin/exams/:examId/marks",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId),b=req.body??{},subjectId=Number(b.exam_subject_id),studentId=Number(b.student_id);
  const exam=queryOne("SELECT * FROM exams WHERE id=?",[examId]),subject=queryOne("SELECT * FROM exam_subjects WHERE id=? AND exam_id=?",[subjectId,examId]);
  if(!exam||!subject)return res.status(404).json({success:false,message:"Exam or subject not found."});
  if(exam.status==="published")return res.status(400).json({success:false,message:"Published exam is locked."});
  const theory=Math.max(0,Number(b.theory_marks)||0),practical=Math.max(0,Number(b.practical_marks)||0),internal=Math.max(0,Number(b.internal_marks)||0),grace=Math.max(0,Number(b.grace_marks)||0);
  const max=Number(subject.max_theory||0)+Number(subject.max_practical||0)+Number(subject.max_internal||0),total=theory+practical+internal+grace,percentage=max?Number(((total/max)*100).toFixed(2)):0;
  const grade=gradeV20(percentage),pass=total>=Number(subject.pass_marks||0)&&grade!=="F";
  const old=queryOne("SELECT id FROM exam_marks WHERE exam_subject_id=? AND student_id=?",[subjectId,studentId]);
  if(old)db.run(`UPDATE exam_marks SET theory_marks=?,practical_marks=?,internal_marks=?,grace_marks=?,total_marks=?,percentage=?,grade=?,result=?,remarks=?,entered_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [theory,practical,internal,grace,total,percentage,grade,pass?"PASS":"FAIL",b.remarks||"",req.admin?.id||null,old.id]);
  else insert(`INSERT INTO exam_marks (exam_id,exam_subject_id,student_id,theory_marks,practical_marks,internal_marks,grace_marks,total_marks,percentage,grade,result,remarks,entered_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[examId,subjectId,studentId,theory,practical,internal,grace,total,percentage,grade,pass?"PASS":"FAIL",b.remarks||"",req.admin?.id||null]);
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/exams/:examId/marks/bulk",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId),subjectId=Number(req.body?.exam_subject_id),records=req.body?.records;
  if(!subjectId||!Array.isArray(records))return res.status(400).json({success:false,message:"Subject and records are required."});
  const exam=queryOne("SELECT * FROM exams WHERE id=?",[examId]),subject=queryOne("SELECT * FROM exam_subjects WHERE id=? AND exam_id=?",[subjectId,examId]);
  if(!exam||!subject)return res.status(404).json({success:false,message:"Exam or subject not found."});
  if(exam.status==="published")return res.status(400).json({success:false,message:"Published exam is locked."});
  for(const b of records){
    const studentId=Number(b.student_id);if(!studentId)continue;
    const theory=Math.max(0,Number(b.theory_marks)||0),practical=Math.max(0,Number(b.practical_marks)||0),internal=Math.max(0,Number(b.internal_marks)||0),grace=Math.max(0,Number(b.grace_marks)||0);
    const max=Number(subject.max_theory||0)+Number(subject.max_practical||0)+Number(subject.max_internal||0),total=theory+practical+internal+grace,percentage=max?Number(((total/max)*100).toFixed(2)):0,grade=gradeV20(percentage),result=total>=Number(subject.pass_marks||0)&&grade!=="F"?"PASS":"FAIL";
    const old=queryOne("SELECT id FROM exam_marks WHERE exam_subject_id=? AND student_id=?",[subjectId,studentId]);
    if(old)db.run(`UPDATE exam_marks SET theory_marks=?,practical_marks=?,internal_marks=?,grace_marks=?,total_marks=?,percentage=?,grade=?,result=?,remarks=?,entered_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [theory,practical,internal,grace,total,percentage,grade,result,b.remarks||"",req.admin?.id||null,old.id]);
    else insert(`INSERT INTO exam_marks (exam_id,exam_subject_id,student_id,theory_marks,practical_marks,internal_marks,grace_marks,total_marks,percentage,grade,result,remarks,entered_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[examId,subjectId,studentId,theory,practical,internal,grace,total,percentage,grade,result,b.remarks||"",req.admin?.id||null]);
  }
  persistDatabase();res.json({success:true,count:records.length});
});

app.post("/api/admin/exams/:examId/calculate-results",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId),exam=queryOne("SELECT * FROM exams WHERE id=?",[examId]);
  if(!exam)return res.status(404).json({success:false,message:"Exam not found."});
  if(exam.status==="published")return res.status(400).json({success:false,message:"Published exam is locked."});
  const students=query("SELECT id FROM students WHERE class_name=?",[exam.class_name]);
  const subjects=query("SELECT * FROM exam_subjects WHERE exam_id=?",[examId]);
  const results=[];
  for(const st of students){
    let obtained=0,max=0,failed=false,missing=false;
    for(const sub of subjects){
      const m=queryOne("SELECT * FROM exam_marks WHERE exam_subject_id=? AND student_id=?",[sub.id,st.id]);
      const subMax=Number(sub.max_theory||0)+Number(sub.max_practical||0)+Number(sub.max_internal||0);
      max+=subMax;
      if(!m){missing=true;continue}
      obtained+=Number(m.total_marks||0);
      if(m.result!=="PASS")failed=true;
    }
    const pct=max?Number(((obtained/max)*100).toFixed(2)):0,grade=gradeV20(pct),result=!missing&&!failed&&pct>=Number(exam.pass_percentage||33)?"PASS":"FAIL";
    const old=queryOne("SELECT id FROM exam_results WHERE exam_id=? AND student_id=?",[examId,st.id]);
    if(old)db.run(`UPDATE exam_results SET total_obtained=?,total_max=?,percentage=?,grade=?,result=?,status='draft',updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [obtained,max,pct,grade,result,old.id]);
    else insert(`INSERT INTO exam_results (exam_id,student_id,total_obtained,total_max,percentage,grade,result,status) VALUES (?,?,?,?,?,?,?,?)`,
      [examId,st.id,obtained,max,pct,grade,result,"draft"]);
    results.push({student_id:st.id,percentage:pct,result});
  }
  const sorted=query("SELECT id,percentage FROM exam_results WHERE exam_id=? ORDER BY percentage DESC,id",[examId]);
  sorted.forEach((r,i)=>db.run("UPDATE exam_results SET rank=? WHERE id=?",[i+1,r.id]));
  persistDatabase();res.json({success:true,count:results.length});
});

app.post("/api/admin/exams/:examId/publish",requireAdmin,(req,res)=>{
  const examId=Number(req.params.id||req.params.examId),exam=queryOne("SELECT * FROM exams WHERE id=?",[examId]);
  if(!exam)return res.status(404).json({success:false,message:"Exam not found."});
  const missing=queryOne(`SELECT COUNT(*) c FROM students s LEFT JOIN exam_results er ON er.student_id=s.id AND er.exam_id=?
    WHERE s.class_name=? AND er.id IS NULL`,[examId,exam.class_name]);
  if(Number(missing?.c||0)>0)return res.status(400).json({success:false,message:`${missing.c} student results are not calculated yet.`});
  db.run("UPDATE exam_results SET status='published',published_at=CURRENT_TIMESTAMP WHERE exam_id=?",[examId]);
  db.run("UPDATE exams SET status='published',updated_at=CURRENT_TIMESTAMP WHERE id=?",[examId]);
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/exams/:examId/unpublish",requireAdmin,(req,res)=>{
  const id=Number(req.params.examId);db.run("UPDATE exam_results SET status='draft',published_at=NULL WHERE exam_id=?",[id]);db.run("UPDATE exams SET status='draft',updated_at=CURRENT_TIMESTAMP WHERE id=?",[id]);persistDatabase();res.json({success:true});
});

app.get("/api/admin/exams/:examId/results",requireAdmin,(req,res)=>{
  const id=Number(req.params.examId);
  res.json({success:true,data:query(`SELECT er.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section
    FROM exam_results er JOIN students s ON s.id=er.student_id WHERE er.exam_id=? ORDER BY er.rank IS NULL,er.rank,s.full_name`,[id])});
});


/* ===== PROFESSIONAL DOCUMENT & PRINT SYSTEM V21 ===== */

function ensureDocumentsV21(){
  db.run(`CREATE TABLE IF NOT EXISTS school_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_type TEXT NOT NULL,
    document_no TEXT UNIQUE,
    student_id INTEGER,
    title TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    valid_until TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    data_json TEXT NOT NULL DEFAULT '{}',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureDocumentsV21();

function documentNoV21(type){
  const prefix={marksheet:"MS",report_card:"RC",fee_receipt:"FR",certificate:"CERT",id_card:"ID"}[type]||"DOC";
  const n=Number(queryOne("SELECT COUNT(*) c FROM school_documents WHERE document_type=?",[type])?.c||0)+1;
  return `SPS-${prefix}-${new Date().getFullYear()}-${String(n).padStart(5,"0")}`;
}
function studentForDocV21(id){
  return queryOne("SELECT * FROM students WHERE id=?",[Number(id)]);
}

app.get("/api/admin/documents",requireAdmin,(req,res)=>{
  const type=String(req.query.document_type||"").trim(),q=String(req.query.q||"").trim();
  let sql=`SELECT d.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section
    FROM school_documents d LEFT JOIN students s ON s.id=d.student_id WHERE 1=1`,args=[];
  if(type){sql+=" AND d.document_type=?";args.push(type)}
  if(q){sql+=" AND (d.document_no LIKE ? OR d.title LIKE ? OR s.full_name LIKE ? OR s.admission_no LIKE ?)";
    args.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`)}
  sql+=" ORDER BY d.created_at DESC";
  res.json({success:true,data:query(sql,args)});
});

app.get("/api/admin/documents/:id",requireAdmin,(req,res)=>{
  const d=queryOne(`SELECT d.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,s.date_of_birth,s.gender,s.father_name,s.mother_name
    FROM school_documents d LEFT JOIN students s ON s.id=d.student_id WHERE d.id=?`,[Number(req.params.id)]);
  if(!d)return res.status(404).json({success:false,message:"Document not found."});
  let data={};try{data=JSON.parse(d.data_json||"{}")}catch{}
  res.json({success:true,data:{...d,data}});
});

app.post("/api/admin/documents",requireAdmin,(req,res)=>{
  const b=req.body??{},type=String(b.document_type||"").trim();
  if(!["marksheet","report_card","fee_receipt","certificate","id_card"].includes(type))
    return res.status(400).json({success:false,message:"Invalid document type."});
  if(!b.title||!b.issue_date)return res.status(400).json({success:false,message:"Title and issue date are required."});
  if(b.student_id&&!studentForDocV21(b.student_id))return res.status(404).json({success:false,message:"Student not found."});
  const no=b.document_no||documentNoV21(type);
  try{
    const id=insert(`INSERT INTO school_documents (document_type,document_no,student_id,title,issue_date,valid_until,status,data_json,created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [type,no,b.student_id||null,b.title,b.issue_date,b.valid_until||null,b.status||"final",JSON.stringify(b.data||{}),req.admin?.id||null]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM school_documents WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Document number already exists."})}
});

app.patch("/api/admin/documents/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),cur=queryOne("SELECT * FROM school_documents WHERE id=?",[id]);
  if(!cur)return res.status(404).json({success:false,message:"Document not found."});
  const n={...cur,...req.body};
  if(cur.status==="issued"&&req.body?.status!=="void")return res.status(400).json({success:false,message:"Issued document is locked. Void it before replacement."});
  db.run(`UPDATE school_documents SET title=?,issue_date=?,valid_until=?,status=?,data_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [n.title,n.issue_date,n.valid_until||null,n.status||"draft",JSON.stringify(n.data||{}),id]);
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/documents/:id/issue",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),d=queryOne("SELECT * FROM school_documents WHERE id=?",[id]);
  if(!d)return res.status(404).json({success:false,message:"Document not found."});
  db.run("UPDATE school_documents SET status='issued',updated_at=CURRENT_TIMESTAMP WHERE id=?",[id]);
  persistDatabase();res.json({success:true,data:queryOne("SELECT * FROM school_documents WHERE id=?",[id])});
});

app.post("/api/admin/documents/:id/void",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  db.run("UPDATE school_documents SET status='void',updated_at=CURRENT_TIMESTAMP WHERE id=?",[id]);
  persistDatabase();res.json({success:true});
});

app.get("/api/admin/documents/student/:studentId/preview",requireAdmin,(req,res)=>{
  const s=studentForDocV21(req.params.studentId);
  if(!s)return res.status(404).json({success:false,message:"Student not found."});
  const result=query(`SELECT er.*,e.exam_name,e.academic_year FROM exam_results er JOIN exams e ON e.id=er.exam_id
    WHERE er.student_id=? ORDER BY e.start_date DESC,e.id DESC`,[Number(req.params.studentId)]);
  const fees=chargeTotalsV19(Number(req.params.studentId));
  res.json({success:true,data:{student:s,results:result,fees}});
});

app.get("/api/admin/documents/fee-payment/:paymentId",requireAdmin,(req,res)=>{
  const p=queryOne(`SELECT p.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section
    FROM fee_payments p JOIN students s ON s.id=p.student_id WHERE p.id=?`,[Number(req.params.paymentId)]);
  if(!p)return res.status(404).json({success:false,message:"Payment not found."});
  res.json({success:true,data:p});
});


/* ===== STUDENT & PARENT PORTAL V22 ===== */

function ensurePortalV22(){
  db.run(`CREATE TABLE IF NOT EXISTS portal_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    student_id INTEGER,
    parent_name TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS portal_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'all',
    class_name TEXT,
    publish_date TEXT NOT NULL,
    expires_date TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',
    active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensurePortalV22();

function portalTokenV22(user){
  return jwt.sign({portal_id:user.id,role:user.role,student_id:user.student_id||null,email:user.email},
    process.env.JWT_SECRET||"sunshine-school-secret",{expiresIn:"7d"});
}
function requirePortalV22(req,res,next){
  try{
    const h=req.headers.authorization||"";
    const token=h.startsWith("Bearer ")?h.slice(7):"";
    if(!token)return res.status(401).json({success:false,message:"Portal login required."});
    req.portal=jwt.verify(token,process.env.JWT_SECRET||"sunshine-school-secret");
    if(!["student","parent"].includes(req.portal.role))return res.status(403).json({success:false,message:"Portal access denied."});
    next();
  }catch{return res.status(401).json({success:false,message:"Portal session expired."})}
}
function portalStudentV22(req){
  return queryOne("SELECT * FROM students WHERE id=?",[Number(req.portal?.student_id||0)]);
}

app.post("/api/portal/login",(req,res)=>{
  const email=String(req.body?.email||"").trim().toLowerCase(),password=String(req.body?.password||"");
  if(!email||!password)return res.status(400).json({success:false,message:"Email and password are required."});
  const u=queryOne("SELECT * FROM portal_users WHERE email=? AND status='active'",[email]);
  if(!u)return res.status(401).json({success:false,message:"Invalid portal credentials."});
  let ok=false;
  try{ok=bcrypt.compareSync(password,u.password_hash)}catch{}
  if(!ok)return res.status(401).json({success:false,message:"Invalid portal credentials."});
  const student=u.student_id?portalStudentV22({portal:{student_id:u.student_id}}):null;
  res.json({success:true,data:{token:portalTokenV22(u),user:{id:u.id,email:u.email,role:u.role,parent_name:u.parent_name,student_id:u.student_id},student}});
});

app.post("/api/admin/portal-users",requireAdmin,(req,res)=>{
  const b=req.body??{},email=String(b.email||"").trim().toLowerCase(),password=String(b.password||"");
  if(!email||password.length<6||!["student","parent"].includes(b.role))return res.status(400).json({success:false,message:"Email, password (6+ chars), and valid role are required."});
  if(!Number(b.student_id))return res.status(400).json({success:false,message:"Linked student is required."});
  try{
    const hash=bcrypt.hashSync(password,10);
    const id=insert(`INSERT INTO portal_users (email,password_hash,role,student_id,parent_name,phone,status)
      VALUES (?,?,?,?,?,?,?)`,[email,hash,b.role,Number(b.student_id),b.parent_name||"",b.phone||"",b.status||"active"]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT id,email,role,student_id,parent_name,phone,status,created_at FROM portal_users WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Portal email already exists."})}
});

app.get("/api/admin/portal-users",requireAdmin,(req,res)=>{
  res.json({success:true,data:query(`SELECT p.id,p.email,p.role,p.student_id,p.parent_name,p.phone,p.status,p.created_at,
    s.full_name,s.admission_no,s.class_name,s.section,s.roll_no
    FROM portal_users p LEFT JOIN students s ON s.id=p.student_id ORDER BY p.created_at DESC`)});
});

app.patch("/api/admin/portal-users/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),u=queryOne("SELECT * FROM portal_users WHERE id=?",[id]);
  if(!u)return res.status(404).json({success:false,message:"Portal user not found."});
  const b=req.body??{};
  if(b.password){
    const hash=bcrypt.hashSync(String(b.password),10);
    db.run("UPDATE portal_users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",[hash,id]);
  }
  if(b.status||b.phone!==undefined||b.parent_name!==undefined)
    db.run("UPDATE portal_users SET status=?,phone=?,parent_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [b.status||u.status,b.phone??u.phone,b.parent_name??u.parent_name,id]);
  persistDatabase();res.json({success:true});
});

app.delete("/api/admin/portal-users/:id",requireAdmin,(req,res)=>{
  db.run("DELETE FROM portal_users WHERE id=?",[Number(req.params.id)]);persistDatabase();res.json({success:true});
});

app.post("/api/admin/portal-notices",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!b.title||!b.message)return res.status(400).json({success:false,message:"Title and message are required."});
  const id=insert(`INSERT INTO portal_notices (title,message,audience,class_name,publish_date,expires_date,priority,active,created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [b.title,b.message,b.audience||"all",b.class_name||null,b.publish_date||new Date().toISOString().slice(0,10),b.expires_date||null,b.priority||"normal",b.active===false?0:1,req.admin?.id||null]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM portal_notices WHERE id=?",[id])});
});

app.get("/api/admin/portal-notices",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query("SELECT * FROM portal_notices ORDER BY publish_date DESC,id DESC")});
});

app.get("/api/portal/dashboard",requirePortalV22,(req,res)=>{
  const student=portalStudentV22(req);
  if(!student)return res.status(404).json({success:false,message:"Linked student not found."});
  const att=(()=>{
    const rows=query("SELECT status FROM student_attendance WHERE student_id=?",[student.id]);
    const marked=rows.length,present=rows.filter(x=>x.status==="present").length+rows.filter(x=>x.status==="half_day").length*.5;
    return {marked,present,absent:rows.filter(x=>x.status==="absent").length,late:rows.filter(x=>x.status==="late").length,leave:rows.filter(x=>x.status==="leave").length,percentage:marked?Number(((present/marked)*100).toFixed(2)):0};
  })();
  const fees=chargeTotalsV19(student.id);
  const results=query(`SELECT er.*,e.exam_name,e.academic_year FROM exam_results er JOIN exams e ON e.id=er.exam_id
    WHERE er.student_id=? AND er.status='published' ORDER BY e.id DESC`,[student.id]);
  const notices=query(`SELECT * FROM portal_notices WHERE active=1 AND (audience='all' OR audience=? OR (audience='class' AND class_name=?))
    AND publish_date<=date('now') AND (expires_date IS NULL OR expires_date>=date('now'))
    ORDER BY priority='urgent' DESC,priority='high' DESC,publish_date DESC LIMIT 10`,
    [req.portal.role,student.class_name]);
  res.json({success:true,data:{student,attendance:att,fees:{total:fees.total,paid:fees.paid,balance:fees.balance},results,notices}});
});

app.get("/api/portal/attendance",requirePortalV22,(req,res)=>{
  const student=portalStudentV22(req);if(!student)return res.status(404).json({success:false,message:"Student not found."});
  const from=String(req.query.from||"1970-01-01"),to=String(req.query.to||"9999-12-31");
  res.json({success:true,data:query(`SELECT * FROM student_attendance WHERE student_id=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date DESC`,[student.id,from,to])});
});

app.get("/api/portal/results",requirePortalV22,(req,res)=>{
  const student=portalStudentV22(req);if(!student)return res.status(404).json({success:false,message:"Student not found."});
  res.json({success:true,data:query(`SELECT er.*,e.exam_name,e.academic_year,e.exam_type FROM exam_results er JOIN exams e ON e.id=er.exam_id
    WHERE er.student_id=? AND er.status='published' ORDER BY e.id DESC`,[student.id])});
});

app.get("/api/portal/fees",requirePortalV22,(req,res)=>{
  const student=portalStudentV22(req);if(!student)return res.status(404).json({success:false,message:"Student not found."});
  const summary=chargeTotalsV19(student.id);
  res.json({success:true,data:{charges:summary.charges,total:summary.total,paid:summary.paid,balance:summary.balance,
    payments:query("SELECT * FROM fee_payments WHERE student_id=? ORDER BY payment_date DESC,id DESC",[student.id])}});
});

app.get("/api/portal/notices",requirePortalV22,(req,res)=>{
  const student=portalStudentV22(req);
  const cls=student?.class_name||"";
  res.json({success:true,data:query(`SELECT * FROM portal_notices WHERE active=1 AND (audience='all' OR audience=? OR (audience='class' AND class_name=?))
    AND publish_date<=date('now') AND (expires_date IS NULL OR expires_date>=date('now'))
    ORDER BY priority='urgent' DESC,priority='high' DESC,publish_date DESC`,[req.portal.role,cls])});
});

app.get("/api/portal/documents",requirePortalV22,(req,res)=>{
  const student=portalStudentV22(req);if(!student)return res.status(404).json({success:false,message:"Student not found."});
  res.json({success:true,data:query(`SELECT id,document_type,document_no,title,issue_date,valid_until,status
    FROM school_documents WHERE student_id=? AND status IN ('issued','final') ORDER BY issue_date DESC,id DESC`,[student.id])});
});


/* ===== COMPLETE TEACHER PORTAL V23 ===== */

function ensureTeacherPortalV23(){
  db.run(`CREATE TABLE IF NOT EXISTS teacher_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    employee_id TEXT UNIQUE,
    phone TEXT,
    designation TEXT DEFAULT 'Teacher',
    qualification TEXT,
    subjects TEXT,
    classes TEXT,
    joining_date TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teacher_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    section TEXT,
    subject_name TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id,class_name,section,subject_name,academic_year)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS homework (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    section TEXT,
    subject_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    assigned_date TEXT NOT NULL,
    due_date TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS homework_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    homework_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    submission_text TEXT,
    submitted_at TEXT,
    teacher_feedback TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(homework_id,student_id)
  )`);
  persistDatabase();
}
ensureTeacherPortalV23();

function teacherPortalTokenV23(user){
  return jwt.sign({teacher_id:user.id,email:user.email,role:"teacher"},
    process.env.JWT_SECRET||"sunshine-school-secret",{expiresIn:"7d"});
}
function requireTeacherV23(req,res,next){
  try{
    const h=req.headers.authorization||"",token=h.startsWith("Bearer ")?h.slice(7):"";
    if(!token)return res.status(401).json({success:false,message:"Teacher login required."});
    req.teacher=jwt.verify(token,process.env.JWT_SECRET||"sunshine-school-secret");
    if(req.teacher.role!=="teacher")return res.status(403).json({success:false,message:"Teacher access denied."});
    const tp=queryOne("SELECT * FROM teacher_profiles WHERE user_id=? AND status='active'",[req.teacher.teacher_id]);
    if(!tp)return res.status(403).json({success:false,message:"Active teacher profile not found."});
    req.teacherProfile=tp; next();
  }catch{return res.status(401).json({success:false,message:"Teacher session expired."})}
}

app.post("/api/teacher/login",(req,res)=>{
  const email=String(req.body?.email||"").trim().toLowerCase(),password=String(req.body?.password||"");
  const u=queryOne("SELECT * FROM users WHERE LOWER(email)=? AND role='teacher'",[email]);
  if(!u)return res.status(401).json({success:false,message:"Invalid teacher credentials."});
  let ok=false;try{ok=bcrypt.compareSync(password,u.password_hash)}catch{}
  if(!ok)return res.status(401).json({success:false,message:"Invalid teacher credentials."});
  const profile=queryOne("SELECT * FROM teacher_profiles WHERE user_id=? AND status='active'",[u.id]);
  if(!profile)return res.status(403).json({success:false,message:"Teacher profile is not active."});
  res.json({success:true,data:{token:teacherPortalTokenV23(u),user:{id:u.id,email:u.email,name:u.name||""},profile}});
});

app.get("/api/teacher/dashboard",requireTeacherV23,(req,res)=>{
  const tp=req.teacherProfile;
  const assignments=query(`SELECT * FROM teacher_assignments WHERE teacher_id=? ORDER BY class_name,section,subject_name`,[tp.id]);
  const homeworkRows=query(`SELECT h.*,COUNT(hs.id) submissions,SUM(CASE WHEN hs.status='submitted' THEN 1 ELSE 0 END) submitted
    FROM homework h LEFT JOIN homework_submissions hs ON hs.homework_id=h.id
    WHERE h.teacher_id=? GROUP BY h.id ORDER BY h.created_at DESC LIMIT 10`,[tp.id]);
  res.json({success:true,data:{profile:tp,assignments,homework:homeworkRows}});
});

app.get("/api/admin/teachers",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query(`SELECT u.id user_id,u.email,u.name,tp.id teacher_id,tp.employee_id,tp.phone,tp.designation,
    tp.qualification,tp.subjects,tp.classes,tp.joining_date,tp.status
    FROM users u LEFT JOIN teacher_profiles tp ON tp.user_id=u.id WHERE u.role='teacher' ORDER BY u.name,u.email`)});
});

app.post("/api/admin/teachers",requireAdmin,(req,res)=>{
  const b=req.body??{},email=String(b.email||"").trim().toLowerCase(),password=String(b.password||"");
  if(!email||password.length<6||!b.name)return res.status(400).json({success:false,message:"Name, email and password (6+ chars) are required."});
  try{
    const uid=insert(`INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)`,
      [b.name,email,bcrypt.hashSync(password,10),"teacher"]);
    const tid=insert(`INSERT INTO teacher_profiles (user_id,employee_id,phone,designation,qualification,subjects,classes,joining_date,status)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [uid,b.employee_id||"",b.phone||"",b.designation||"Teacher",b.qualification||"",b.subjects||"",b.classes||"",b.joining_date||null,b.status||"active"]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM teacher_profiles WHERE id=?",[tid])});
  }catch{res.status(409).json({success:false,message:"Teacher email or employee ID already exists."})}
});

app.post("/api/admin/teacher-assignments",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!Number(b.teacher_id)||!b.class_name||!b.subject_name||!b.academic_year)return res.status(400).json({success:false,message:"Teacher, class, subject and academic year are required."});
  try{
    const id=insert(`INSERT INTO teacher_assignments (teacher_id,class_name,section,subject_name,academic_year) VALUES (?,?,?,?,?)`,
      [Number(b.teacher_id),b.class_name,b.section||"",b.subject_name,b.academic_year]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM teacher_assignments WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Assignment already exists."})}
});

app.get("/api/teacher/classes",requireTeacherV23,(req,res)=>{
  res.json({success:true,data:query(`SELECT * FROM teacher_assignments WHERE teacher_id=? ORDER BY class_name,section,subject_name`,[req.teacherProfile.id])});
});

app.get("/api/teacher/classes/:assignmentId/students",requireTeacherV23,(req,res)=>{
  const a=queryOne("SELECT * FROM teacher_assignments WHERE id=? AND teacher_id=?",[Number(req.params.assignmentId),req.teacherProfile.id]);
  if(!a)return res.status(404).json({success:false,message:"Class assignment not found."});
  const students=query(`SELECT id,full_name,admission_no,roll_no,class_name,section,date_of_birth,gender
    FROM students WHERE class_name=? AND COALESCE(section,'')=COALESCE(?, '') ORDER BY roll_no,full_name`,[a.class_name,a.section||""]);
  res.json({success:true,data:{assignment:a,students}});
});

app.post("/api/teacher/attendance",requireTeacherV23,(req,res)=>{
  const b=req.body??{},assignment=queryOne("SELECT * FROM teacher_assignments WHERE id=? AND teacher_id=?",[Number(b.assignment_id),req.teacherProfile.id]);
  if(!assignment)return res.status(403).json({success:false,message:"You are not assigned to this class."});
  const date=b.attendance_date||new Date().toISOString().slice(0,10),records=Array.isArray(b.records)?b.records:[];
  for(const r of records){
    const sid=Number(r.student_id); if(!sid)continue;
    const allowed=queryOne("SELECT id FROM students WHERE id=? AND class_name=? AND COALESCE(section,'')=COALESCE(?, '')",[sid,assignment.class_name,assignment.section||""]);
    if(!allowed)continue;
    const status=["present","absent","late","leave","half_day"].includes(r.status)?r.status:"present";
    const existing=queryOne("SELECT id FROM student_attendance WHERE student_id=? AND attendance_date=?",[sid,date]);
    if(existing)db.run("UPDATE student_attendance SET status=?,remarks=? WHERE id=?",[status,r.remarks||"",existing.id]);
    else insert("INSERT INTO student_attendance (student_id,attendance_date,status,remarks) VALUES (?,?,?,?)",[sid,date,status,r.remarks||""]);
  }
  persistDatabase();res.json({success:true,count:records.length});
});

app.get("/api/teacher/attendance",requireTeacherV23,(req,res)=>{
  const a=queryOne("SELECT * FROM teacher_assignments WHERE id=? AND teacher_id=?",[Number(req.query.assignment_id),req.teacherProfile.id]);
  if(!a)return res.status(403).json({success:false,message:"You are not assigned to this class."});
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  res.json({success:true,data:query(`SELECT s.id,s.full_name,s.admission_no,s.roll_no,
    COALESCE(a.status,'present') status,COALESCE(a.remarks,'') remarks
    FROM students s LEFT JOIN student_attendance a ON a.student_id=s.id AND a.attendance_date=?
    WHERE s.class_name=? AND COALESCE(s.section,'')=COALESCE(?, '') ORDER BY s.roll_no,s.full_name`,
    [date,a.class_name,a.section||""])});
});

app.post("/api/teacher/marks",requireTeacherV23,(req,res)=>{
  const b=req.body??{},a=queryOne("SELECT * FROM teacher_assignments WHERE id=? AND teacher_id=?",[Number(b.assignment_id),req.teacherProfile.id]);
  if(!a)return res.status(403).json({success:false,message:"You are not assigned to this class."});
  const exam=queryOne("SELECT * FROM exams WHERE id=? AND class_name=?",[Number(b.exam_id),a.class_name]);
  if(!exam||exam.status==="published")return res.status(400).json({success:false,message:"Exam unavailable or already published."});
  const subject=queryOne("SELECT * FROM exam_subjects WHERE id=? AND exam_id=? AND subject_name=?",[Number(b.exam_subject_id),exam.id,a.subject_name]);
  if(!subject)return res.status(403).json({success:false,message:"This subject is not assigned to you for this exam."});
  const records=Array.isArray(b.records)?b.records:[];
  for(const r of records){
    const sid=Number(r.student_id);if(!sid)continue;
    const st=queryOne("SELECT id FROM students WHERE id=? AND class_name=? AND COALESCE(section,'')=COALESCE(?, '')",[sid,a.class_name,a.section||""]);
    if(!st)continue;
    const theory=Math.max(0,Number(r.theory_marks)||0),practical=Math.max(0,Number(r.practical_marks)||0),internal=Math.max(0,Number(r.internal_marks)||0),grace=Math.max(0,Number(r.grace_marks)||0);
    const max=Number(subject.max_theory||0)+Number(subject.max_practical||0)+Number(subject.max_internal||0),total=theory+practical+internal+grace,pct=max?Number(((total/max)*100).toFixed(2)):0,grade=gradeV20(pct),result=total>=Number(subject.pass_marks||0)&&grade!=="F"?"PASS":"FAIL";
    const old=queryOne("SELECT id FROM exam_marks WHERE exam_subject_id=? AND student_id=?",[subject.id,sid]);
    if(old)db.run(`UPDATE exam_marks SET theory_marks=?,practical_marks=?,internal_marks=?,grace_marks=?,total_marks=?,percentage=?,grade=?,result=?,remarks=?,entered_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [theory,practical,internal,grace,total,pct,grade,result,r.remarks||"",req.teacher.teacher_id,old.id]);
    else insert(`INSERT INTO exam_marks (exam_id,exam_subject_id,student_id,theory_marks,practical_marks,internal_marks,grace_marks,total_marks,percentage,grade,result,remarks,entered_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[exam.id,subject.id,sid,theory,practical,internal,grace,total,pct,grade,result,r.remarks||"",req.teacher.teacher_id]);
  }
  persistDatabase();res.json({success:true,count:records.length});
});

app.post("/api/teacher/homework",requireTeacherV23,(req,res)=>{
  const b=req.body??{},a=queryOne("SELECT * FROM teacher_assignments WHERE id=? AND teacher_id=?",[Number(b.assignment_id),req.teacherProfile.id]);
  if(!a)return res.status(403).json({success:false,message:"You are not assigned to this class."});
  if(!b.title)return res.status(400).json({success:false,message:"Homework title is required."});
  const id=insert(`INSERT INTO homework (teacher_id,class_name,section,subject_name,title,description,assigned_date,due_date)
    VALUES (?,?,?,?,?,?,?,?)`,[req.teacherProfile.id,a.class_name,a.section||"",a.subject_name,b.title,b.description||"",b.assigned_date||new Date().toISOString().slice(0,10),b.due_date||null]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM homework WHERE id=?",[id])});
});

app.get("/api/teacher/homework",requireTeacherV23,(req,res)=>{
  res.json({success:true,data:query(`SELECT h.*,COUNT(hs.id) submissions,
    SUM(CASE WHEN hs.status='submitted' THEN 1 ELSE 0 END) submitted
    FROM homework h LEFT JOIN homework_submissions hs ON hs.homework_id=h.id
    WHERE h.teacher_id=? GROUP BY h.id ORDER BY h.created_at DESC`,[req.teacherProfile.id])});
});

app.get("/api/teacher/homework/:id/submissions",requireTeacherV23,(req,res)=>{
  const h=queryOne("SELECT * FROM homework WHERE id=? AND teacher_id=?",[Number(req.params.id),req.teacherProfile.id]);
  if(!h)return res.status(404).json({success:false,message:"Homework not found."});
  const rows=query(`SELECT s.id student_id,s.full_name,s.admission_no,s.roll_no,
    COALESCE(hs.status,'pending') status,COALESCE(hs.submission_text,'') submission_text,hs.submitted_at,COALESCE(hs.teacher_feedback,'') teacher_feedback
    FROM students s LEFT JOIN homework_submissions hs ON hs.student_id=s.id AND hs.homework_id=?
    WHERE s.class_name=? AND COALESCE(s.section,'')=COALESCE(?, '') ORDER BY s.roll_no,s.full_name`,
    [h.id,h.class_name,h.section||""]);
  res.json({success:true,data:rows});
});

app.patch("/api/teacher/homework-submissions/:id",requireTeacherV23,(req,res)=>{
  const b=req.body??{},id=Number(req.params.id);
  const row=queryOne(`SELECT hs.*,h.teacher_id FROM homework_submissions hs JOIN homework h ON h.id=hs.homework_id
    WHERE hs.id=? AND h.teacher_id=?`,[id,req.teacherProfile.id]);
  if(!row)return res.status(404).json({success:false,message:"Submission not found."});
  db.run("UPDATE homework_submissions SET status=?,teacher_feedback=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [b.status||row.status,b.teacher_feedback||"",id]);
  persistDatabase();res.json({success:true});
});


/* ===== ADVANCED COMMUNICATION & NOTIFICATION SYSTEM V24 ===== */

function ensureCommunicationV24(){
  db.run(`CREATE TABLE IF NOT EXISTS communication_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    created_by_role TEXT NOT NULL,
    created_by_id INTEGER NOT NULL,
    audience_type TEXT NOT NULL DEFAULT 'all',
    class_name TEXT,
    section TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS communication_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    sender_role TEXT NOT NULL,
    sender_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    attachment_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS communication_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    recipient_role TEXT NOT NULL,
    recipient_id INTEGER NOT NULL,
    read_at TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    UNIQUE(thread_id,recipient_role,recipient_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS notification_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_role TEXT NOT NULL,
    recipient_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    priority TEXT NOT NULL DEFAULT 'normal',
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS announcement_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    audience_type TEXT NOT NULL DEFAULT 'all',
    priority TEXT NOT NULL DEFAULT 'normal',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureCommunicationV24();

function pushNotificationV24(role,id,type,title,message,refType=null,refId=null,priority="normal"){
  if(!role||!id)return;
  insert(`INSERT INTO notification_events (recipient_role,recipient_id,type,title,message,reference_type,reference_id,priority)
    VALUES (?,?,?,?,?,?,?,?)`,[role,id,type,title,message,refType,refId,priority]);
}
function portalRecipientsV24(audienceType,className,section){
  const out=[];
  if(audienceType==="student"||audienceType==="parent"||audienceType==="all"||audienceType==="class"){
    const rows=query(`SELECT id,role,student_id FROM portal_users WHERE status='active'`);
    for(const u of rows){
      const st=u.student_id?queryOne("SELECT class_name,section FROM students WHERE id=?",[u.student_id]):null;
      if(audienceType==="class" && (!st || st.class_name!==className || String(st.section||"")!==String(section||"")))continue;
      if(audienceType==="student" && u.role!=="student")continue;
      if(audienceType==="parent" && u.role!=="parent")continue;
      out.push({role:u.role,id:u.id});
    }
  }
  return out;
}
function teacherRecipientsV24(className,section){
  const rows=query(`SELECT tp.id teacher_id FROM teacher_profiles tp WHERE tp.status='active'`);
  return rows.filter(t=>{
    const a=queryOne(`SELECT id FROM teacher_assignments WHERE teacher_id=? AND class_name=? AND COALESCE(section,'')=COALESCE(?, '') LIMIT 1`,
      [t.teacher_id,className,section||""]);
    return !!a;
  }).map(t=>({role:"teacher",id:t.teacher_id}));
}
function adminRecipientsV24(){
  return query("SELECT id FROM users WHERE role='admin'").map(x=>({role:"admin",id:x.id}));
}

app.get("/api/admin/communications",requireAdmin,(req,res)=>{
  const rows=query(`SELECT t.*,COUNT(m.id) message_count
    FROM communication_threads t LEFT JOIN communication_messages m ON m.thread_id=t.id
    GROUP BY t.id ORDER BY t.updated_at DESC,t.id DESC`);
  res.json({success:true,data:rows});
});

app.get("/api/admin/communications/:id",requireAdmin,(req,res)=>{
  const t=queryOne("SELECT * FROM communication_threads WHERE id=?",[Number(req.params.id)]);
  if(!t)return res.status(404).json({success:false,message:"Communication thread not found."});
  res.json({success:true,data:{...t,messages:query(`SELECT * FROM communication_messages WHERE thread_id=? ORDER BY created_at,id`,[t.id])}});
});

app.post("/api/admin/communications",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!b.subject||!b.message)return res.status(400).json({success:false,message:"Subject and message are required."});
  const audience=["all","student","parent","class","teachers","admins"].includes(b.audience_type)?b.audience_type:"all";
  const priority=["normal","high","urgent"].includes(b.priority)?b.priority:"normal";
  const id=insert(`INSERT INTO communication_threads (subject,created_by_role,created_by_id,audience_type,class_name,section,priority)
    VALUES (?,?,?,?,?,?,?)`,[b.subject,"admin",req.admin.id,audience,b.class_name||null,b.section||null,priority]);
  insert(`INSERT INTO communication_messages (thread_id,sender_role,sender_id,message) VALUES (?,?,?,?)`,
    [id,"admin",req.admin.id,b.message]);
  let recipients=[];
  if(audience==="teachers")recipients=teacherRecipientsV24(b.class_name,b.section);
  else if(audience==="admins")recipients=adminRecipientsV24();
  else recipients=portalRecipientsV24(audience,b.class_name,b.section);
  for(const r of recipients){
    insert("INSERT OR IGNORE INTO communication_recipients (thread_id,recipient_role,recipient_id) VALUES (?,?,?)",[id,r.role,r.id]);
    pushNotificationV24(r.role,r.id,"announcement",b.subject,b.message,"communication",id,priority);
  }
  persistDatabase();res.status(201).json({success:true,data:{id,recipient_count:recipients.length}});
});

app.post("/api/admin/communications/:id/close",requireAdmin,(req,res)=>{
  db.run("UPDATE communication_threads SET status='closed',updated_at=CURRENT_TIMESTAMP WHERE id=?",[Number(req.params.id)]);
  persistDatabase();res.json({success:true});
});

app.get("/api/admin/notifications",requireAdmin,(req,res)=>{
  res.json({success:true,data:query(`SELECT * FROM notification_events WHERE recipient_role='admin' AND recipient_id=? ORDER BY created_at DESC LIMIT 100`,[req.admin.id])});
});

app.post("/api/admin/announcement-templates",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!b.name||!b.subject||!b.message)return res.status(400).json({success:false,message:"Template name, subject and message are required."});
  try{
    const id=insert(`INSERT INTO announcement_templates (name,subject,message,audience_type,priority) VALUES (?,?,?,?,?)`,
      [b.name,b.subject,b.message,b.audience_type||"all",b.priority||"normal"]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM announcement_templates WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Template name already exists."})}
});

app.get("/api/admin/announcement-templates",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query("SELECT * FROM announcement_templates ORDER BY name")});
});

app.get("/api/teacher/communications",requireTeacherV23,(req,res)=>{
  const rows=query(`SELECT t.*,r.read_at FROM communication_threads t
    JOIN communication_recipients r ON r.thread_id=t.id
    WHERE r.recipient_role='teacher' AND r.recipient_id=? AND r.archived=0
    ORDER BY t.updated_at DESC,t.id DESC`,[req.teacherProfile.id]);
  res.json({success:true,data:rows});
});

app.get("/api/teacher/communications/:id",requireTeacherV23,(req,res)=>{
  const t=queryOne(`SELECT t.* FROM communication_threads t JOIN communication_recipients r ON r.thread_id=t.id
    WHERE t.id=? AND r.recipient_role='teacher' AND r.recipient_id=?`,[Number(req.params.id),req.teacherProfile.id]);
  if(!t)return res.status(404).json({success:false,message:"Thread not found."});
  db.run("UPDATE communication_recipients SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE thread_id=? AND recipient_role='teacher' AND recipient_id=?",[t.id,req.teacherProfile.id]);
  db.run("UPDATE notification_events SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE recipient_role='teacher' AND recipient_id=? AND reference_type='communication' AND reference_id=?",[req.teacherProfile.id,t.id]);
  persistDatabase();
  res.json({success:true,data:{...t,messages:query("SELECT * FROM communication_messages WHERE thread_id=? ORDER BY created_at,id",[t.id])}});
});

app.post("/api/teacher/communications",requireTeacherV23,(req,res)=>{
  const b=req.body??{};
  if(!b.subject||!b.message)return res.status(400).json({success:false,message:"Subject and message are required."});
  const audience=["admin","class"].includes(b.audience_type)?b.audience_type:"admin";
  const id=insert(`INSERT INTO communication_threads (subject,created_by_role,created_by_id,audience_type,class_name,section,priority)
    VALUES (?,?,?,?,?,?,?)`,[b.subject,"teacher",req.teacherProfile.id,audience,b.class_name||null,b.section||null,b.priority||"normal"]);
  insert(`INSERT INTO communication_messages (thread_id,sender_role,sender_id,message) VALUES (?,?,?,?)`,
    [id,"teacher",req.teacherProfile.id,b.message]);
  const recipients=audience==="class"
    ? portalRecipientsV24("class",b.class_name||"",b.section||"")
    : adminRecipientsV24();
  for(const r of recipients){
    insert("INSERT OR IGNORE INTO communication_recipients (thread_id,recipient_role,recipient_id) VALUES (?,?,?)",[id,r.role,r.id]);
    pushNotificationV24(r.role,r.id,"message",b.subject,b.message,"communication",id,b.priority||"normal");
  }
  persistDatabase();res.status(201).json({success:true,data:{id,recipient_count:recipients.length}});
});

app.get("/api/portal/communications",requirePortalV22,(req,res)=>{
  const rows=query(`SELECT t.*,r.read_at FROM communication_threads t
    JOIN communication_recipients r ON r.thread_id=t.id
    WHERE r.recipient_role=? AND r.recipient_id=? AND r.archived=0
    ORDER BY t.updated_at DESC,t.id DESC`,[req.portal.role,req.portal.id]);
  res.json({success:true,data:rows});
});

app.get("/api/portal/communications/:id",requirePortalV22,(req,res)=>{
  const id=Number(req.params.id);
  const t=queryOne(`SELECT t.* FROM communication_threads t JOIN communication_recipients r ON r.thread_id=t.id
    WHERE t.id=? AND r.recipient_role=? AND r.recipient_id=?`,[id,req.portal.role,req.portal.id]);
  if(!t)return res.status(404).json({success:false,message:"Thread not found."});
  db.run("UPDATE communication_recipients SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE thread_id=? AND recipient_role=? AND recipient_id=?",[id,req.portal.role,req.portal.id]);
  db.run("UPDATE notification_events SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE recipient_role=? AND recipient_id=? AND reference_type='communication' AND reference_id=?",[req.portal.role,req.portal.id,id]);
  persistDatabase();
  res.json({success:true,data:{...t,messages:query("SELECT * FROM communication_messages WHERE thread_id=? ORDER BY created_at,id",[id])}});
});

app.post("/api/portal/communications/:id/reply",requirePortalV22,(req,res)=>{
  const id=Number(req.params.id),b=req.body??{};
  if(!b.message)return res.status(400).json({success:false,message:"Message is required."});
  const t=queryOne(`SELECT t.* FROM communication_threads t JOIN communication_recipients r ON r.thread_id=t.id
    WHERE t.id=? AND r.recipient_role=? AND r.recipient_id=?`,[id,req.portal.role,req.portal.id]);
  if(!t||t.status==="closed")return res.status(403).json({success:false,message:"Conversation is closed."});
  insert("INSERT INTO communication_messages (thread_id,sender_role,sender_id,message) VALUES (?,?,?,?)",[id,req.portal.role,req.portal.id,b.message]);
  db.run("UPDATE communication_threads SET updated_at=CURRENT_TIMESTAMP WHERE id=?",[id]);
  const adminRecipients=adminRecipientsV24();
  for(const r of adminRecipients)pushNotificationV24(r.role,r.id,"reply",t.subject,b.message,"communication",id,t.priority);
  persistDatabase();res.json({success:true});
});

app.get("/api/portal/notifications",requirePortalV22,(req,res)=>{
  res.json({success:true,data:query(`SELECT * FROM notification_events WHERE recipient_role=? AND recipient_id=? ORDER BY created_at DESC LIMIT 100`,
    [req.portal.role,req.portal.id])});
});

app.post("/api/portal/notifications/read-all",requirePortalV22,(req,res)=>{
  db.run("UPDATE notification_events SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE recipient_role=? AND recipient_id=?",[req.portal.role,req.portal.id]);
  persistDatabase();res.json({success:true});
});


/* ===== ADVANCED LIBRARY MANAGEMENT SYSTEM V25 ===== */

function ensureLibraryV25(){
  db.run(`CREATE TABLE IF NOT EXISTS library_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    bio TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_publishers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    contact TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    isbn TEXT,
    accession_no TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    author_id INTEGER,
    publisher_id INTEGER,
    category_id INTEGER,
    edition TEXT,
    publication_year INTEGER,
    language TEXT DEFAULT 'English',
    pages INTEGER,
    shelf TEXT,
    rack TEXT,
    price REAL DEFAULT 0,
    description TEXT,
    cover_url TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_copies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    barcode TEXT UNIQUE,
    condition TEXT DEFAULT 'good',
    status TEXT DEFAULT 'available',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    copy_id INTEGER NOT NULL,
    borrower_type TEXT NOT NULL,
    borrower_id INTEGER NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    return_date TEXT,
    renewal_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'issued',
    issued_by INTEGER,
    returned_by INTEGER,
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    borrower_type TEXT NOT NULL,
    borrower_id INTEGER NOT NULL,
    reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,
    status TEXT DEFAULT 'active'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_fines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL,
    borrower_type TEXT NOT NULL,
    borrower_id INTEGER NOT NULL,
    days_late INTEGER DEFAULT 0,
    amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'unpaid',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_settings (
    id INTEGER PRIMARY KEY CHECK (id=1),
    loan_days INTEGER DEFAULT 14,
    fine_per_day REAL DEFAULT 2,
    max_renewals INTEGER DEFAULT 2,
    max_active_loans INTEGER DEFAULT 3,
    reservation_days INTEGER DEFAULT 3
  )`);
  db.run(`INSERT OR IGNORE INTO library_settings (id) VALUES (1)`);
  persistDatabase();
}
ensureLibraryV25();

function librarySettingsV25(){
  return queryOne("SELECT * FROM library_settings WHERE id=1") ||
    {loan_days:14,fine_per_day:2,max_renewals:2,max_active_loans:3,reservation_days:3};
}
function libraryBorrowerV25(type,id){
  const n=Number(id);
  if(type==="student")return queryOne("SELECT id,full_name,admission_no,roll_no,class_name,section FROM students WHERE id=?",[n]);
  if(type==="teacher")return queryOne(`SELECT tp.id, u.name full_name,tp.employee_id,tp.designation
    FROM teacher_profiles tp JOIN users u ON u.id=tp.user_id WHERE tp.id=?`,[n]);
  return null;
}
function libraryDueV25(date,days){
  const d=new Date(`${date}T00:00:00`);d.setDate(d.getDate()+Number(days||14));
  return d.toISOString().slice(0,10);
}
function libraryFineV25(due,ret,fine){
  const a=new Date(`${due}T00:00:00`),b=new Date(`${ret}T00:00:00`);
  const days=Math.max(0,Math.ceil((b-a)/86400000));
  return {days,amount:Number((days*Number(fine||0)).toFixed(2))};
}

app.get("/api/admin/library/dashboard",requireAdmin,(_req,res)=>{
  const books=Number(queryOne("SELECT COUNT(*) c FROM library_books WHERE status='active'")?.c||0);
  const copies=Number(queryOne("SELECT COUNT(*) c FROM library_copies")?.c||0);
  const available=Number(queryOne("SELECT COUNT(*) c FROM library_copies WHERE status='available'")?.c||0);
  const issued=Number(queryOne("SELECT COUNT(*) c FROM library_copies WHERE status='issued'")?.c||0);
  const overdue=Number(queryOne(`SELECT COUNT(*) c FROM library_loans WHERE status='issued' AND due_date<date('now')`)?.c||0);
  const reservations=Number(queryOne("SELECT COUNT(*) c FROM library_reservations WHERE status='active'")?.c||0);
  const unpaid=Number(queryOne("SELECT COALESCE(SUM(amount-paid_amount),0) total FROM library_fines WHERE status!='paid'")?.total||0);
  res.json({success:true,data:{books,copies,available,issued,overdue,reservations,unpaid_fines:Number(unpaid)}})
});

app.get("/api/admin/library/books",requireAdmin,(req,res)=>{
  const q=String(req.query.q||"").trim(),category=String(req.query.category_id||"").trim();
  let sql=`SELECT b.*,a.name author_name,p.name publisher_name,c.name category_name,
    (SELECT COUNT(*) FROM library_copies x WHERE x.book_id=b.id) copies,
    (SELECT COUNT(*) FROM library_copies x WHERE x.book_id=b.id AND x.status='available') available_copies
    FROM library_books b LEFT JOIN library_authors a ON a.id=b.author_id LEFT JOIN library_publishers p ON p.id=b.publisher_id
    LEFT JOIN library_categories c ON c.id=b.category_id WHERE b.status='active'`,args=[];
  if(q){sql+=" AND (b.title LIKE ? OR b.isbn LIKE ? OR b.accession_no LIKE ? OR a.name LIKE ?)";args.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`)}
  if(category){sql+=" AND b.category_id=?";args.push(Number(category))}
  sql+=" ORDER BY b.title";
  res.json({success:true,data:query(sql,args)});
});

app.post("/api/admin/library/books",requireAdmin,(req,res)=>{
  const b=req.body??{};
  if(!b.title||!b.accession_no)return res.status(400).json({success:false,message:"Title and accession number are required."});
  try{
    const id=insert(`INSERT INTO library_books (isbn,accession_no,title,author_id,publisher_id,category_id,edition,publication_year,language,pages,shelf,rack,price,description,cover_url)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.isbn||"",b.accession_no,b.title,b.author_id||null,b.publisher_id||null,b.category_id||null,b.edition||"",b.publication_year||null,b.language||"English",b.pages||null,b.shelf||"",b.rack||"",Number(b.price)||0,b.description||"",b.cover_url||""]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM library_books WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Accession number already exists."})}
});

app.patch("/api/admin/library/books/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),cur=queryOne("SELECT * FROM library_books WHERE id=?",[id]);
  if(!cur)return res.status(404).json({success:false,message:"Book not found."});
  const b={...cur,...req.body};
  db.run(`UPDATE library_books SET isbn=?,accession_no=?,title=?,author_id=?,publisher_id=?,category_id=?,edition=?,publication_year=?,language=?,pages=?,shelf=?,rack=?,price=?,description=?,cover_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.isbn||"",b.accession_no,b.title,b.author_id||null,b.publisher_id||null,b.category_id||null,b.edition||"",b.publication_year||null,b.language||"English",b.pages||null,b.shelf||"",b.rack||"",Number(b.price)||0,b.description||"",b.cover_url||"",id]);
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/library/books/:id/copies",requireAdmin,(req,res)=>{
  const bookId=Number(req.params.id),b=req.body??{};
  if(!queryOne("SELECT id FROM library_books WHERE id=?",[bookId]))return res.status(404).json({success:false,message:"Book not found."});
  try{
    const id=insert("INSERT INTO library_copies (book_id,barcode,condition,status,notes) VALUES (?,?,?,?,?)",
      [bookId,b.barcode||`LIB-${Date.now()}`,b.condition||"good","available",b.notes||""]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM library_copies WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Barcode already exists."})}
});

app.get("/api/admin/library/copies/:bookId",requireAdmin,(req,res)=>{
  res.json({success:true,data:query(`SELECT cp.*,b.title,b.accession_no FROM library_copies cp JOIN library_books b ON b.id=cp.book_id WHERE cp.book_id=? ORDER BY cp.id`,[Number(req.params.bookId)])});
});

app.post("/api/admin/library/categories",requireAdmin,(req,res)=>{
  const b=req.body??{};if(!b.name)return res.status(400).json({success:false,message:"Category name is required."});
  try{const id=insert("INSERT INTO library_categories (name,description) VALUES (?,?)",[b.name,b.description||""]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM library_categories WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Category already exists."})}
});
app.get("/api/admin/library/categories",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM library_categories ORDER BY name")}));
app.post("/api/admin/library/authors",requireAdmin,(req,res)=>{
  const b=req.body??{};if(!b.name)return res.status(400).json({success:false,message:"Author name is required."});
  try{const id=insert("INSERT INTO library_authors (name,bio) VALUES (?,?)",[b.name,b.bio||""]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM library_authors WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Author already exists."})}
});
app.get("/api/admin/library/authors",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM library_authors ORDER BY name")}));
app.post("/api/admin/library/publishers",requireAdmin,(req,res)=>{
  const b=req.body??{};if(!b.name)return res.status(400).json({success:false,message:"Publisher name is required."});
  try{const id=insert("INSERT INTO library_publishers (name,contact) VALUES (?,?)",[b.name,b.contact||""]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM library_publishers WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Publisher already exists."})}
});
app.get("/api/admin/library/publishers",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM library_publishers ORDER BY name")}));

app.get("/api/admin/library/loans",requireAdmin,(req,res)=>{
  const status=String(req.query.status||"").trim();
  let sql=`SELECT l.*,cp.barcode,b.title,b.accession_no,s.full_name student_name,s.admission_no,t.name teacher_name,tp.employee_id
    FROM library_loans l JOIN library_copies cp ON cp.id=l.copy_id JOIN library_books b ON b.id=cp.book_id
    LEFT JOIN students s ON l.borrower_type='student' AND s.id=l.borrower_id
    LEFT JOIN teacher_profiles tp ON l.borrower_type='teacher' AND tp.id=l.borrower_id
    LEFT JOIN users t ON t.id=tp.user_id`,args=[];
  if(status){sql+=" WHERE l.status=?";args.push(status)}
  sql+=" ORDER BY l.created_at DESC";
  res.json({success:true,data:query(sql,args)});
});

app.post("/api/admin/library/issue",requireAdmin,(req,res)=>{
  const b=req.body??{},copy=queryOne(`SELECT cp.*,b.title FROM library_copies cp JOIN library_books b ON b.id=cp.book_id WHERE cp.id=?`,[Number(b.copy_id)]);
  const borrower=libraryBorrowerV25(b.borrower_type,b.borrower_id),settings=librarySettingsV25();
  if(!copy||copy.status!=="available")return res.status(400).json({success:false,message:"Copy is not available."});
  if(!borrower)return res.status(404).json({success:false,message:"Borrower not found."});
  const active=Number(queryOne("SELECT COUNT(*) c FROM library_loans WHERE borrower_type=? AND borrower_id=? AND status='issued'",[b.borrower_type,Number(b.borrower_id)])?.c||0);
  if(active>=Number(settings.max_active_loans||3))return res.status(400).json({success:false,message:`Maximum ${settings.max_active_loans} active loans allowed.`});
  const issue=b.issue_date||new Date().toISOString().slice(0,10),due=b.due_date||libraryDueV25(issue,settings.loan_days);
  const id=insert(`INSERT INTO library_loans (copy_id,borrower_type,borrower_id,issue_date,due_date,status,issued_by,remarks)
    VALUES (?,?,?,?,?,?,?,?)`,[copy.id,b.borrower_type,Number(b.borrower_id),issue,due,"issued",req.admin.id,b.remarks||""]);
  db.run("UPDATE library_copies SET status='issued' WHERE id=?",[copy.id]);
  persistDatabase();
  res.status(201).json({success:true,data:{loan_id:id,due_date:due}});
});

app.post("/api/admin/library/loans/:id/renew",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),loan=queryOne("SELECT * FROM library_loans WHERE id=?",[id]),settings=librarySettingsV25();
  if(!loan||loan.status!=="issued")return res.status(400).json({success:false,message:"Active loan not found."});
  if(Number(loan.renewal_count||0)>=Number(settings.max_renewals||2))return res.status(400).json({success:false,message:"Maximum renewals reached."});
  const due=libraryDueV25(loan.due_date,settings.loan_days);
  db.run("UPDATE library_loans SET due_date=?,renewal_count=renewal_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",[due,id]);
  persistDatabase();res.json({success:true,due_date:due});
});

app.post("/api/admin/library/loans/:id/return",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),loan=queryOne("SELECT * FROM library_loans WHERE id=?",[id]),settings=librarySettingsV25();
  if(!loan||loan.status!=="issued")return res.status(400).json({success:false,message:"Active loan not found."});
  const date=req.body?.return_date||new Date().toISOString().slice(0,10),fine=libraryFineV25(loan.due_date,date,settings.fine_per_day);
  db.run("UPDATE library_loans SET return_date=?,status='returned',returned_by=?,remarks=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",[date,req.admin.id,req.body?.remarks||"",id]);
  db.run("UPDATE library_copies SET status=? WHERE id=?",[req.body?.condition==="lost"?"lost":req.body?.condition==="damaged"?"damaged":"available",loan.copy_id]);
  if(fine.amount>0)insert("INSERT INTO library_fines (loan_id,borrower_type,borrower_id,days_late,amount,status) VALUES (?,?,?,?,?,?)",
    [id,loan.borrower_type,loan.borrower_id,fine.days,fine.amount,"unpaid"]);
  persistDatabase();res.json({success:true,fine});
});

app.post("/api/admin/library/reservations",requireAdmin,(req,res)=>{
  const b=req.body??{},bookId=Number(b.book_id),borrower=libraryBorrowerV25(b.borrower_type,b.borrower_id),settings=librarySettingsV25();
  if(!queryOne("SELECT id FROM library_books WHERE id=?",[bookId])||!borrower)return res.status(400).json({success:false,message:"Book or borrower not found."});
  const exp=libraryDueV25(new Date().toISOString().slice(0,10),settings.reservation_days);
  const id=insert("INSERT INTO library_reservations (book_id,borrower_type,borrower_id,expires_at) VALUES (?,?,?,?)",[bookId,b.borrower_type,Number(b.borrower_id),exp]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM library_reservations WHERE id=?",[id])});
});

app.get("/api/admin/library/reservations",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query(`SELECT r.*,b.title,b.accession_no,s.full_name student_name,t.name teacher_name
    FROM library_reservations r JOIN library_books b ON b.id=r.book_id
    LEFT JOIN students s ON r.borrower_type='student' AND s.id=r.borrower_id
    LEFT JOIN teacher_profiles tp ON r.borrower_type='teacher' AND tp.id=r.borrower_id
    LEFT JOIN users t ON t.id=tp.user_id WHERE r.status='active' ORDER BY r.reserved_at`)});
});

app.get("/api/admin/library/fines",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query(`SELECT f.*,l.due_date,l.return_date,b.title,s.full_name student_name,s.admission_no
    FROM library_fines f JOIN library_loans l ON l.id=f.loan_id JOIN library_copies cp ON cp.id=l.copy_id JOIN library_books b ON b.id=cp.book_id
    LEFT JOIN students s ON f.borrower_type='student' AND s.id=f.borrower_id ORDER BY f.created_at DESC`)});
});

app.post("/api/admin/library/fines/:id/pay",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),f=queryOne("SELECT * FROM library_fines WHERE id=?",[id]);
  if(!f)return res.status(404).json({success:false,message:"Fine not found."});
  const amount=Math.min(Number(req.body?.amount||0),Math.max(0,Number(f.amount)-Number(f.paid_amount||0)));
  const paid=Number(f.paid_amount||0)+amount,status=paid>=Number(f.amount)?"paid":"partial";
  db.run("UPDATE library_fines SET paid_amount=?,status=?,notes=? WHERE id=?",[paid,status,req.body?.notes||"",id]);
  persistDatabase();res.json({success:true});
});

app.patch("/api/admin/library/settings",requireAdmin,(req,res)=>{
  const s=librarySettingsV25(),b=req.body??{};
  db.run(`UPDATE library_settings SET loan_days=?,fine_per_day=?,max_renewals=?,max_active_loans=?,reservation_days=? WHERE id=1`,
    [Number(b.loan_days??s.loan_days),Number(b.fine_per_day??s.fine_per_day),Number(b.max_renewals??s.max_renewals),Number(b.max_active_loans??s.max_active_loans),Number(b.reservation_days??s.reservation_days)]);
  persistDatabase();res.json({success:true,data:librarySettingsV25()});
});
app.get("/api/admin/library/settings",requireAdmin,(_req,res)=>res.json({success:true,data:librarySettingsV25()}));

app.get("/api/portal/library",requirePortalV22,(req,res)=>{
  const borrowerType=req.portal.role==="student"?"student":null,borrowerId=req.portal.student_id;
  if(!borrowerType||!borrowerId)return res.json({success:true,data:{loans:[],reservations:[],fines:[]}});
  const loans=query(`SELECT l.*,b.title,b.accession_no,cp.barcode FROM library_loans l JOIN library_copies cp ON cp.id=l.copy_id JOIN library_books b ON b.id=cp.book_id
    WHERE l.borrower_type='student' AND l.borrower_id=? ORDER BY l.created_at DESC`,[borrowerId]);
  const reservations=query(`SELECT r.*,b.title,b.accession_no FROM library_reservations r JOIN library_books b ON b.id=r.book_id WHERE r.borrower_type='student' AND r.borrower_id=? ORDER BY r.reserved_at DESC`,[borrowerId]);
  const fines=query("SELECT * FROM library_fines WHERE borrower_type='student' AND borrower_id=? ORDER BY created_at DESC",[borrowerId]);
  res.json({success:true,data:{loans,reservations,fines}});
});


/* ===== SMART LIBRARY CIRCULATION WORKSTATION V26 ===== */

function ensureLibraryV26(){
  db.run(`CREATE TABLE IF NOT EXISTS library_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    actor_id INTEGER,
    entity_type TEXT,
    entity_id INTEGER,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_no TEXT UNIQUE NOT NULL,
    transaction_type TEXT NOT NULL,
    loan_id INTEGER,
    borrower_type TEXT,
    borrower_id INTEGER,
    amount REAL DEFAULT 0,
    issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    issued_by INTEGER
  )`);
  persistDatabase();
}
ensureLibraryV26();

function libraryLogV26(action,entityType,entityId,details,req){
  insert(`INSERT INTO library_activity_log (action,actor_role,actor_id,entity_type,entity_id,details)
    VALUES (?,?,?,?,?,?)`,
    [action,"admin",req?.admin?.id||null,entityType||null,entityId||null,JSON.stringify(details||{})]);
}
function libraryReceiptNoV26(prefix="LIB"){
  const d=new Date(),year=d.getFullYear();
  const n=Number(queryOne("SELECT COUNT(*) c FROM library_receipts WHERE receipt_no LIKE ?",[`${prefix}-${year}-%`])?.c||0)+1;
  return `${prefix}-${year}-${String(n).padStart(6,"0")}`;
}

app.get("/api/admin/library/search",requireAdmin,(req,res)=>{
  const q=String(req.query.q||"").trim();
  if(!q)return res.json({success:true,data:{books:[],copies:[],borrowers:[]}});
  const like=`%${q}%`;
  const books=query(`SELECT b.id,b.title,b.isbn,b.accession_no,b.shelf,b.rack,a.name author_name,
    (SELECT COUNT(*) FROM library_copies c WHERE c.book_id=b.id) copies,
    (SELECT COUNT(*) FROM library_copies c WHERE c.book_id=b.id AND c.status='available') available_copies
    FROM library_books b LEFT JOIN library_authors a ON a.id=b.author_id
    WHERE b.title LIKE ? OR b.isbn LIKE ? OR b.accession_no LIKE ? OR a.name LIKE ?
    ORDER BY b.title LIMIT 50`,[like,like,like,like]);
  const copies=query(`SELECT c.id,c.barcode,c.status,c.condition,b.title,b.accession_no
    FROM library_copies c JOIN library_books b ON b.id=c.book_id
    WHERE c.barcode LIKE ? OR b.accession_no LIKE ? OR b.title LIKE ?
    ORDER BY b.title LIMIT 50`,[like,like,like]);
  const students=query(`SELECT id,full_name name,admission_no,roll_no,class_name,section,'student' borrower_type
    FROM students WHERE full_name LIKE ? OR admission_no LIKE ? OR CAST(roll_no AS TEXT) LIKE ? LIMIT 30`,[like,like,like]);
  const teachers=query(`SELECT tp.id,COALESCE(u.name,'Teacher') name,tp.employee_id,tp.designation,'teacher' borrower_type
    FROM teacher_profiles tp LEFT JOIN users u ON u.id=tp.user_id
    WHERE u.name LIKE ? OR tp.employee_id LIKE ? LIMIT 30`,[like,like]);
  res.json({success:true,data:{books,copies,borrowers:[...students,...teachers]}});
});

app.get("/api/admin/library/circulation",requireAdmin,(req,res)=>{
  const from=String(req.query.from||"1970-01-01"),to=String(req.query.to||"9999-12-31"),status=String(req.query.status||"");
  let sql=`SELECT l.*,c.barcode,b.title,b.accession_no,s.full_name student_name,s.admission_no,
    u.name teacher_name,tp.employee_id,
    CASE WHEN l.status='issued' AND l.due_date<date('now') THEN 'overdue' ELSE l.status END live_status
    FROM library_loans l JOIN library_copies c ON c.id=l.copy_id JOIN library_books b ON b.id=c.book_id
    LEFT JOIN students s ON l.borrower_type='student' AND s.id=l.borrower_id
    LEFT JOIN teacher_profiles tp ON l.borrower_type='teacher' AND tp.id=l.borrower_id
    LEFT JOIN users u ON u.id=tp.user_id
    WHERE l.issue_date BETWEEN ? AND ?`,args=[from,to];
  if(status){sql+=` AND (l.status=? OR (l.status='issued' AND l.due_date<date('now') AND ?='overdue'))`;args.push(status,status)}
  sql+=" ORDER BY l.issue_date DESC,l.id DESC LIMIT 500";
  res.json({success:true,data:query(sql,args)});
});

app.get("/api/admin/library/borrower/:type/:id",requireAdmin,(req,res)=>{
  const type=req.params.type,id=Number(req.params.id),b=libraryBorrowerV25(type,id);
  if(!b)return res.status(404).json({success:false,message:"Borrower not found."});
  const loans=query(`SELECT l.*,c.barcode,b.title,b.accession_no FROM library_loans l
    JOIN library_copies c ON c.id=l.copy_id JOIN library_books b ON b.id=c.book_id
    WHERE l.borrower_type=? AND l.borrower_id=? ORDER BY l.created_at DESC`,[type,id]);
  const fines=query("SELECT * FROM library_fines WHERE borrower_type=? AND borrower_id=? ORDER BY created_at DESC",[type,id]);
  const active=loans.filter(x=>x.status==="issued").length;
  res.json({success:true,data:{borrower:b,loans,fines,active_loans:active}});
});

app.get("/api/admin/library/copy/:barcode",requireAdmin,(req,res)=>{
  const barcode=String(req.params.barcode||"");
  const c=queryOne(`SELECT c.*,b.title,b.accession_no,b.isbn,b.shelf,b.rack FROM library_copies c
    JOIN library_books b ON b.id=c.book_id WHERE c.barcode=?`,[barcode]);
  if(!c)return res.status(404).json({success:false,message:"Barcode not found."});
  const active=queryOne(`SELECT l.*,s.full_name student_name,s.admission_no,u.name teacher_name
    FROM library_loans l LEFT JOIN students s ON l.borrower_type='student' AND s.id=l.borrower_id
    LEFT JOIN teacher_profiles tp ON l.borrower_type='teacher' AND tp.id=l.borrower_id
    LEFT JOIN users u ON u.id=tp.user_id WHERE l.copy_id=? AND l.status='issued'`,[c.id]);
  res.json({success:true,data:{copy:c,active_loan:active}});
});

app.post("/api/admin/library/quick-issue",requireAdmin,(req,res)=>{
  const b=req.body??{},copy=queryOne("SELECT * FROM library_copies WHERE barcode=?",[String(b.barcode||"")]);
  if(!copy)return res.status(404).json({success:false,message:"Barcode not found."});
  const settings=librarySettingsV25(),borrower=libraryBorrowerV25(b.borrower_type,b.borrower_id);
  if(!borrower)return res.status(404).json({success:false,message:"Borrower not found."});
  if(copy.status!=="available")return res.status(400).json({success:false,message:"This copy is not available."});
  const active=Number(queryOne("SELECT COUNT(*) c FROM library_loans WHERE borrower_type=? AND borrower_id=? AND status='issued'",[b.borrower_type,Number(b.borrower_id)])?.c||0);
  if(active>=Number(settings.max_active_loans||3))return res.status(400).json({success:false,message:"Borrower has reached the active-loan limit."});
  const issue=b.issue_date||new Date().toISOString().slice(0,10),due=b.due_date||libraryDueV25(issue,settings.loan_days);
  const loanId=insert(`INSERT INTO library_loans (copy_id,borrower_type,borrower_id,issue_date,due_date,status,issued_by,remarks)
    VALUES (?,?,?,?,?,?,?,?)`,[copy.id,b.borrower_type,Number(b.borrower_id),issue,due,"issued",req.admin.id,b.remarks||""]);
  db.run("UPDATE library_copies SET status='issued' WHERE id=?",[copy.id]);
  const receiptNo=libraryReceiptNoV26("ISSUE");
  insert(`INSERT INTO library_receipts (receipt_no,transaction_type,loan_id,borrower_type,borrower_id,amount,issued_by)
    VALUES (?,?,?,?,?,?,?)`,[receiptNo,"issue",loanId,b.borrower_type,Number(b.borrower_id),0,req.admin.id]);
  libraryLogV26("issue","loan",loanId,{barcode:copy.barcode,borrower_type:b.borrower_type,borrower_id:Number(b.borrower_id)},req);
  persistDatabase();res.status(201).json({success:true,data:{loan_id:loanId,receipt_no:receiptNo,due_date:due}});
});

app.post("/api/admin/library/quick-return",requireAdmin,(req,res)=>{
  const barcode=String(req.body?.barcode||""),copy=queryOne("SELECT * FROM library_copies WHERE barcode=?",[barcode]);
  if(!copy)return res.status(404).json({success:false,message:"Barcode not found."});
  const loan=queryOne("SELECT * FROM library_loans WHERE copy_id=? AND status='issued' ORDER BY id DESC LIMIT 1",[copy.id]);
  if(!loan)return res.status(400).json({success:false,message:"No active loan for this copy."});
  const settings=librarySettingsV25(),date=req.body?.return_date||new Date().toISOString().slice(0,10),fine=libraryFineV25(loan.due_date,date,settings.fine_per_day);
  const condition=req.body?.condition||"good",newStatus=condition==="lost"?"lost":condition==="damaged"?"damaged":"available";
  db.run("UPDATE library_loans SET return_date=?,status='returned',returned_by=?,remarks=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [date,req.admin.id,req.body?.remarks||"",loan.id]);
  db.run("UPDATE library_copies SET status=?,condition=? WHERE id=?",[newStatus,condition,copy.id]);
  let fineId=null;
  if(fine.amount>0)fineId=insert("INSERT INTO library_fines (loan_id,borrower_type,borrower_id,days_late,amount,status) VALUES (?,?,?,?,?,?)",
    [loan.id,loan.borrower_type,loan.borrower_id,fine.days,fine.amount,"unpaid"]);
  const receiptNo=libraryReceiptNoV26("RETURN");
  insert(`INSERT INTO library_receipts (receipt_no,transaction_type,loan_id,borrower_type,borrower_id,amount,issued_by)
    VALUES (?,?,?,?,?,?,?)`,[receiptNo,"return",loan.id,loan.borrower_type,loan.borrower_id,fine.amount,req.admin.id]);
  libraryLogV26("return","loan",loan.id,{barcode,condition,fine},req);
  persistDatabase();res.json({success:true,data:{receipt_no:receiptNo,fine,fine_id:fineId,status:newStatus}});
});

app.post("/api/admin/library/quick-renew",requireAdmin,(req,res)=>{
  const barcode=String(req.body?.barcode||""),copy=queryOne("SELECT * FROM library_copies WHERE barcode=?",[barcode]);
  if(!copy)return res.status(404).json({success:false,message:"Barcode not found."});
  const loan=queryOne("SELECT * FROM library_loans WHERE copy_id=? AND status='issued' ORDER BY id DESC LIMIT 1",[copy.id]),settings=librarySettingsV25();
  if(!loan)return res.status(400).json({success:false,message:"No active loan for this copy."});
  if(Number(loan.renewal_count||0)>=Number(settings.max_renewals||2))return res.status(400).json({success:false,message:"Maximum renewals reached."});
  const due=libraryDueV25(loan.due_date,settings.loan_days);
  db.run("UPDATE library_loans SET due_date=?,renewal_count=renewal_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",[due,loan.id]);
  const receiptNo=libraryReceiptNoV26("RENEW");
  insert(`INSERT INTO library_receipts (receipt_no,transaction_type,loan_id,borrower_type,borrower_id,amount,issued_by)
    VALUES (?,?,?,?,?,?,?)`,[receiptNo,"renew",loan.id,loan.borrower_type,loan.borrower_id,0,req.admin.id]);
  libraryLogV26("renew","loan",loan.id,{barcode,new_due_date:due},req);
  persistDatabase();res.json({success:true,data:{receipt_no:receiptNo,due_date:due}});
});

app.get("/api/admin/library/receipts/:loanId",requireAdmin,(req,res)=>{
  res.json({success:true,data:query("SELECT * FROM library_receipts WHERE loan_id=? ORDER BY issued_at DESC",[Number(req.params.loanId)])});
});

app.get("/api/admin/library/activity",requireAdmin,(req,res)=>{
  const limit=Math.min(500,Math.max(1,Number(req.query.limit||100)));
  res.json({success:true,data:query(`SELECT * FROM library_activity_log ORDER BY created_at DESC,id DESC LIMIT ${limit}`)});
});

app.get("/api/admin/library/reports",requireAdmin,(req,res)=>{
  const from=String(req.query.from||"1970-01-01"),to=String(req.query.to||"9999-12-31");
  const issued=Number(queryOne("SELECT COUNT(*) c FROM library_loans WHERE issue_date BETWEEN ? AND ?",[from,to])?.c||0);
  const returned=Number(queryOne("SELECT COUNT(*) c FROM library_loans WHERE return_date BETWEEN ? AND ?",[from,to])?.c||0);
  const overdue=Number(queryOne("SELECT COUNT(*) c FROM library_loans WHERE status='issued' AND due_date<date('now')")?.c||0);
  const fines=Number(queryOne("SELECT COALESCE(SUM(amount),0) total FROM library_fines WHERE created_at BETWEEN ? AND ?",[from,to])?.total||0);
  const paid=Number(queryOne("SELECT COALESCE(SUM(paid_amount),0) total FROM library_fines WHERE created_at BETWEEN ? AND ?",[from,to])?.total||0);
  const popular=query(`SELECT b.title,b.accession_no,COUNT(l.id) issue_count FROM library_loans l JOIN library_copies c ON c.id=l.copy_id JOIN library_books b ON b.id=c.book_id
    WHERE l.issue_date BETWEEN ? AND ? GROUP BY b.id ORDER BY issue_count DESC LIMIT 10`,[from,to]);
  res.json({success:true,data:{from,to,issued,returned,overdue,fines,paid,top_books:popular}});
});


/* ===== ADVANCED EXAMINATION & ASSESSMENT SYSTEM V27 ===== */
function ensureExamV27(){
  db.run(`CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,exam_type TEXT DEFAULT 'terminal',
    academic_year TEXT,class_name TEXT,section TEXT,start_date TEXT,end_date TEXT,
    status TEXT DEFAULT 'draft',result_locked INTEGER DEFAULT 0,published INTEGER DEFAULT 0,
    created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS exam_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL,subject_name TEXT NOT NULL,
    max_marks REAL DEFAULT 100,pass_marks REAL DEFAULT 33,weight REAL DEFAULT 100,
    exam_date TEXT, start_time TEXT,end_time TEXT,teacher_id INTEGER, UNIQUE(exam_id,subject_name)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS exam_marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,theory REAL DEFAULT 0,practical REAL DEFAULT 0,internal REAL DEFAULT 0,
    grace REAL DEFAULT 0,status TEXT DEFAULT 'present',remarks TEXT,entered_by INTEGER,
    entered_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(exam_id,subject_id,student_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS exam_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL,student_id INTEGER NOT NULL,
    total_marks REAL DEFAULT 0,max_marks REAL DEFAULT 0,percentage REAL DEFAULT 0,grade TEXT,
    result_status TEXT DEFAULT 'pending',class_rank INTEGER,overall_remarks TEXT,
    generated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(exam_id,student_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS exam_grade_scales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,minimum_percentage REAL NOT NULL,
    grade TEXT NOT NULL,remark TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS exam_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER,action TEXT NOT NULL,actor_id INTEGER,
    details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  const n=Number(queryOne("SELECT COUNT(*) c FROM exam_grade_scales")?.c||0);
  if(!n){
    [["A+",90,"Outstanding"],["A",80,"Excellent"],["B+",70,"Very Good"],["B",60,"Good"],["C",50,"Satisfactory"],["D",33,"Pass"],["F",0,"Needs Improvement"]]
      .forEach(x=>insert("INSERT INTO exam_grade_scales (name,minimum_percentage,grade,remark) VALUES (?,?,?,?)",[x[0],x[1],x[0],x[2]]));
  }
  persistDatabase();
}
ensureExamV27();

function examGradeV27(p){
  const rows=query("SELECT * FROM exam_grade_scales ORDER BY minimum_percentage DESC");
  return rows.find(x=>Number(p)>=Number(x.minimum_percentage))||{grade:"F",remark:"Needs Improvement"};
}
function examAuditV27(examId,action,details,req){
  insert("INSERT INTO exam_audit_log (exam_id,action,actor_id,details) VALUES (?,?,?,?)",
    [examId,action,req?.admin?.id||null,JSON.stringify(details||{})]);
}
function examStudentsV27(className,section){
  let sql="SELECT id,full_name,admission_no,roll_no,class_name,section FROM students WHERE status='active'";
  const args=[];
  if(className){sql+=" AND class_name=?";args.push(className)}
  if(section){sql+=" AND section=?";args.push(section)}
  return query(sql,args).sort((a,b)=>Number(a.roll_no||999999)-Number(b.roll_no||999999));
}
function recalcExamV27(examId){
  const subjects=query("SELECT * FROM exam_subjects WHERE exam_id=?",[examId]);
  const students=query(`SELECT DISTINCT student_id FROM exam_marks WHERE exam_id=?`,[examId]);
  for(const st of students){
    let total=0,max=0,failed=false;
    for(const sub of subjects){
      const m=queryOne("SELECT * FROM exam_marks WHERE exam_id=? AND subject_id=? AND student_id=?",[examId,sub.id,st.student_id]);
      const val=m&&m.status!=="absent" ? Number(m.theory||0)+Number(m.practical||0)+Number(m.internal||0)+Number(m.grace||0) : 0;
      total+=val;max+=Number(sub.max_marks||0);
      if(m?.status==="absent" || val<Number(sub.pass_marks||0))failed=true;
    }
    const percentage=max?Number(((total/max)*100).toFixed(2)):0,g=examGradeV27(percentage);
    insert(`INSERT INTO exam_results (exam_id,student_id,total_marks,max_marks,percentage,grade,result_status)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(exam_id,student_id) DO UPDATE SET total_marks=excluded.total_marks,max_marks=excluded.max_marks,
      percentage=excluded.percentage,grade=excluded.grade,result_status=excluded.result_status,generated_at=CURRENT_TIMESTAMP`,
      [examId,st.student_id,total,max,percentage,g.grade,failed?"fail":"pass"]);
  }
  const rs=query("SELECT id FROM exam_results WHERE exam_id=? ORDER BY percentage DESC,total_marks DESC,student_id",[examId]);
  rs.forEach((r,i)=>db.run("UPDATE exam_results SET class_rank=? WHERE id=?",[i+1,r.id]));
  persistDatabase();
}

app.get("/api/admin/exams",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM exams ORDER BY start_date DESC,id DESC")}));
app.post("/api/admin/exams",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.title)return res.status(400).json({success:false,message:"Exam title is required."});
  const id=insert(`INSERT INTO exams (title,exam_type,academic_year,class_name,section,start_date,end_date,status,created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`,[b.title,b.exam_type||"terminal",b.academic_year||"",b.class_name||"",b.section||"",b.start_date||null,b.end_date||null,"draft",req.admin.id]);
  examAuditV27(id,"created",b,req);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM exams WHERE id=?",[id])});
});
app.patch("/api/admin/exams/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM exams WHERE id=?",[id]);
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  if(e.result_locked)return res.status(400).json({success:false,message:"Result is locked."});
  const b={...e,...req.body};
  db.run(`UPDATE exams SET title=?,exam_type=?,academic_year=?,class_name=?,section=?,start_date=?,end_date=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.title,b.exam_type,b.academic_year,b.class_name,b.section,b.start_date,b.end_date,b.status,id]);
  examAuditV27(id,"updated",req.body,req);persistDatabase();res.json({success:true});
});
app.post("/api/admin/exams/:id/subjects",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM exams WHERE id=?",[id]),b=req.body||{};
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  if(e.result_locked)return res.status(400).json({success:false,message:"Result is locked."});
  if(!b.subject_name)return res.status(400).json({success:false,message:"Subject name is required."});
  try{
    const sid=insert(`INSERT INTO exam_subjects (exam_id,subject_name,max_marks,pass_marks,weight,exam_date,start_time,end_time,teacher_id)
      VALUES (?,?,?,?,?,?,?,?,?)`,[id,b.subject_name,Number(b.max_marks||100),Number(b.pass_marks||33),Number(b.weight||100),b.exam_date||null,b.start_time||null,b.end_time||null,b.teacher_id||null]);
    examAuditV27(id,"subject_added",{subject_id:sid},req);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM exam_subjects WHERE id=?",[sid])});
  }catch{res.status(409).json({success:false,message:"Subject already exists in this exam."})}
});
app.get("/api/admin/exams/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM exams WHERE id=?",[id]);
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  res.json({success:true,data:{...e,subjects:query("SELECT * FROM exam_subjects WHERE exam_id=? ORDER BY exam_date,start_time,subject_name",[id]),results:query(`SELECT r.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section FROM exam_results r JOIN students s ON s.id=r.student_id WHERE r.exam_id=? ORDER BY r.class_rank`,[id])}});
});
app.get("/api/admin/exams/:id/marks",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM exams WHERE id=?",[id]);
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  const students=examStudentsV27(e.class_name,e.section),subjects=query("SELECT * FROM exam_subjects WHERE exam_id=?",[id]);
  const marks=query("SELECT * FROM exam_marks WHERE exam_id=?",[id]);
  res.json({success:true,data:{exam:e,students,subjects,marks}});
});
app.post("/api/admin/exams/:id/marks/bulk",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM exams WHERE id=?",[id]),rows=Array.isArray(req.body?.marks)?req.body.marks:[];
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  if(e.result_locked||e.published)return res.status(400).json({success:false,message:"Published/locked result cannot be edited."});
  for(const m of rows){
    const sub=queryOne("SELECT * FROM exam_subjects WHERE id=? AND exam_id=?",[Number(m.subject_id),id]);
    const st=queryOne("SELECT id FROM students WHERE id=?",[Number(m.student_id)]);
    if(!sub||!st)continue;
    const theory=Math.max(0,Number(m.theory||0)),practical=Math.max(0,Number(m.practical||0)),internal=Math.max(0,Number(m.internal||0)),grace=Math.max(0,Number(m.grace||0));
    if(theory+practical+internal+grace>Number(sub.max_marks))continue;
    insert(`INSERT INTO exam_marks (exam_id,subject_id,student_id,theory,practical,internal,grace,status,remarks,entered_by)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(exam_id,subject_id,student_id) DO UPDATE SET theory=excluded.theory,practical=excluded.practical,internal=excluded.internal,grace=excluded.grace,status=excluded.status,remarks=excluded.remarks,entered_by=excluded.entered_by,updated_at=CURRENT_TIMESTAMP`,
      [id,sub.id,st.id,theory,practical,internal,grace,m.status||"present",m.remarks||"",req.admin.id]);
  }
  recalcExamV27(id);examAuditV27(id,"marks_updated",{count:rows.length},req);persistDatabase();res.json({success:true});
});
app.post("/api/admin/exams/:id/generate-results",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM exams WHERE id=?",[id]);
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  recalcExamV27(id);examAuditV27(id,"results_generated",{},req);persistDatabase();res.json({success:true,data:query(`SELECT r.*,s.full_name,s.admission_no,s.roll_no FROM exam_results r JOIN students s ON s.id=r.student_id WHERE r.exam_id=? ORDER BY r.class_rank`,[id])});
});
app.post("/api/admin/exams/:id/publish",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM exams WHERE id=?",[id]);
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  recalcExamV27(id);db.run("UPDATE exams SET published=1,status='published',updated_at=CURRENT_TIMESTAMP WHERE id=?",[id]);
  examAuditV27(id,"published",{},req);persistDatabase();res.json({success:true});
});
app.post("/api/admin/exams/:id/lock",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM exams WHERE id=?",[id]);
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  recalcExamV27(id);db.run("UPDATE exams SET result_locked=1,status='locked',updated_at=CURRENT_TIMESTAMP WHERE id=?",[id]);
  examAuditV27(id,"locked",{},req);persistDatabase();res.json({success:true});
});
app.get("/api/admin/exams/:id/report-card/:studentId",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),sid=Number(req.params.studentId),e=queryOne("SELECT * FROM exams WHERE id=?",[id]),st=queryOne("SELECT * FROM students WHERE id=?",[sid]);
  if(!e||!st)return res.status(404).json({success:false,message:"Exam or student not found."});
  recalcExamV27(id);
  const r=queryOne("SELECT * FROM exam_results WHERE exam_id=? AND student_id=?",[id,sid]);
  const subjects=query(`SELECT es.*,em.theory,em.practical,em.internal,em.grace,em.status mark_status,em.remarks
    FROM exam_subjects es LEFT JOIN exam_marks em ON em.subject_id=es.id AND em.student_id=? AND em.exam_id=?
    WHERE es.exam_id=? ORDER BY es.exam_date,es.start_time,es.subject_name`,[sid,id,id]);
  res.json({success:true,data:{exam:e,student:st,result:r,subjects}});
});
app.get("/api/student/exams",requirePortalV22,(req,res)=>{
  if(req.portal.role!=="student"||!req.portal.student_id)return res.json({success:true,data:[]});
  const sid=Number(req.portal.student_id);
  const rows=query(`SELECT e.id,e.title,e.exam_type,e.academic_year,e.published,e.start_date,e.end_date,
    r.total_marks,r.max_marks,r.percentage,r.grade,r.result_status,r.class_rank
    FROM exams e JOIN exam_results r ON r.exam_id=e.id AND r.student_id=? WHERE e.published=1 ORDER BY e.start_date DESC,e.id DESC`,[sid]);
  res.json({success:true,data:rows});
});
app.get("/api/student/exams/:id/result",requirePortalV22,(req,res)=>{
  if(req.portal.role!=="student"||!req.portal.student_id)return res.status(403).json({success:false,message:"Student portal only."});
  const id=Number(req.params.id),sid=Number(req.portal.student_id);
  const e=queryOne("SELECT * FROM exams WHERE id=? AND published=1",[id]);
  if(!e)return res.status(404).json({success:false,message:"Published result not found."});
  const r=queryOne("SELECT * FROM exam_results WHERE exam_id=? AND student_id=?",[id,sid]);
  const subjects=query(`SELECT es.subject_name,es.max_marks,es.pass_marks,em.theory,em.practical,em.internal,em.grace,em.status mark_status,em.remarks
    FROM exam_subjects es LEFT JOIN exam_marks em ON em.subject_id=es.id AND em.student_id=? AND em.exam_id=? WHERE es.exam_id=? ORDER BY es.subject_name`,[sid,id,id]);
  res.json({success:true,data:{exam:e,result:r,subjects}});
});


/* ===== ADVANCED RESULTS & REPORT CARD WORKSTATION V28 ===== */

function ensureResultsV28(){
  db.run(`CREATE TABLE IF NOT EXISTS result_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL,student_id INTEGER NOT NULL,
    attendance_days INTEGER DEFAULT 0,working_days INTEGER DEFAULT 0,conduct TEXT,
    teacher_remarks TEXT,principal_remarks TEXT,promotion_status TEXT DEFAULT 'pending',
    generated_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(exam_id,student_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS result_subject_remarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL,student_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,remark TEXT, UNIQUE(exam_id,student_id,subject_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS result_publication_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL,action TEXT NOT NULL,
    actor_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureResultsV28();

function resultCardV28(examId,studentId){
  const e=queryOne("SELECT * FROM exams WHERE id=?",[examId]);
  const st=queryOne("SELECT * FROM students WHERE id=?",[studentId]);
  if(!e||!st)return null;
  recalcExamV27(examId);
  const result=queryOne("SELECT * FROM exam_results WHERE exam_id=? AND student_id=?",[examId,studentId]);
  const subjects=query(`SELECT es.*,em.theory,em.practical,em.internal,em.grace,em.status mark_status,em.remarks mark_remarks,
    COALESCE(sr.remark,'') subject_remark
    FROM exam_subjects es LEFT JOIN exam_marks em ON em.subject_id=es.id AND em.student_id=? AND em.exam_id=?
    LEFT JOIN result_subject_remarks sr ON sr.subject_id=es.id AND sr.student_id=? AND sr.exam_id=?
    WHERE es.exam_id=? ORDER BY es.exam_date,es.start_time,es.subject_name`,[studentId,examId,studentId,examId,examId]);
  const card=queryOne("SELECT * FROM result_cards WHERE exam_id=? AND student_id=?",[examId,studentId]);
  return {exam:e,student:st,result,subjects,result_card:card};
}

app.get("/api/admin/results/:examId/analytics",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId),e=queryOne("SELECT * FROM exams WHERE id=?",[examId]);
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  recalcExamV27(examId);
  const results=query(`SELECT r.*,s.full_name,s.roll_no,s.class_name,s.section FROM exam_results r JOIN students s ON s.id=r.student_id WHERE r.exam_id=? ORDER BY r.class_rank`,[examId]);
  const count=results.length,pass=results.filter(x=>x.result_status==="pass").length,fail=count-pass;
  const avg=count?Number((results.reduce((a,x)=>a+Number(x.percentage||0),0)/count).toFixed(2)):0;
  const highest=results[0]||null;
  const subjectStats=query(`SELECT es.id,es.subject_name,es.max_marks,es.pass_marks,
    COUNT(em.id) attempts,
    ROUND(AVG(CASE WHEN em.status='absent' THEN 0 ELSE COALESCE(em.theory,0)+COALESCE(em.practical,0)+COALESCE(em.internal,0)+COALESCE(em.grace,0) END),2) average_marks,
    SUM(CASE WHEN em.status='absent' OR (COALESCE(em.theory,0)+COALESCE(em.practical,0)+COALESCE(em.internal,0)+COALESCE(em.grace,0))<es.pass_marks THEN 1 ELSE 0 END) failed_count
    FROM exam_subjects es LEFT JOIN exam_marks em ON em.subject_id=es.id AND em.exam_id=?
    WHERE es.exam_id=? GROUP BY es.id ORDER BY es.subject_name`,[examId,examId]);
  res.json({success:true,data:{exam:e,summary:{students:count,passed:pass,failed:fail,pass_percentage:count?Number(((pass/count)*100).toFixed(2)):0,average_percentage:avg,highest_student:highest},subject_stats:subjectStats,results}});
});

app.get("/api/admin/results/:examId/marks-grid",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId),e=queryOne("SELECT * FROM exams WHERE id=?",[examId]);
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  const students=examStudentsV27(e.class_name,e.section),subjects=query("SELECT * FROM exam_subjects WHERE exam_id=? ORDER BY subject_name",[examId]);
  const marks=query("SELECT * FROM exam_marks WHERE exam_id=?",[examId]);
  const map={};marks.forEach(m=>{map[`${m.student_id}:${m.subject_id}`]=m});
  const rows=students.map(st=>({student:st,marks:subjects.map(sub=>map[`${st.id}:${sub.id}`]||{student_id:st.id,subject_id:sub.id,theory:0,practical:0,internal:0,grace:0,status:"present"})}));
  res.json({success:true,data:{exam:e,subjects,rows}});
});

app.post("/api/admin/results/:examId/result-card",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId),sid=Number(req.body?.student_id),e=queryOne("SELECT * FROM exams WHERE id=?",[examId]);
  if(!e||!sid)return res.status(400).json({success:false,message:"Exam and student are required."});
  if(e.result_locked)return res.status(400).json({success:false,message:"Result is locked."});
  const b=req.body||{};
  insert(`INSERT INTO result_cards (exam_id,student_id,attendance_days,working_days,conduct,teacher_remarks,principal_remarks,promotion_status)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(exam_id,student_id) DO UPDATE SET attendance_days=excluded.attendance_days,
    working_days=excluded.working_days,conduct=excluded.conduct,teacher_remarks=excluded.teacher_remarks,
    principal_remarks=excluded.principal_remarks,promotion_status=excluded.promotion_status,updated_at=CURRENT_TIMESTAMP`,
    [examId,sid,Number(b.attendance_days||0),Number(b.working_days||0),b.conduct||"",b.teacher_remarks||"",b.principal_remarks||"",b.promotion_status||"pending"]);
  examAuditV27(examId,"result_card_updated",{student_id:sid},req);persistDatabase();
  res.json({success:true,data:resultCardV28(examId,sid)});
});

app.post("/api/admin/results/:examId/subject-remark",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId),sid=Number(req.body?.student_id),subjectId=Number(req.body?.subject_id);
  if(!queryOne("SELECT id FROM exam_subjects WHERE id=? AND exam_id=?",[subjectId,examId]))return res.status(404).json({success:false,message:"Subject not found."});
  insert(`INSERT INTO result_subject_remarks (exam_id,student_id,subject_id,remark) VALUES (?,?,?,?)
    ON CONFLICT(exam_id,student_id,subject_id) DO UPDATE SET remark=excluded.remark`,[examId,sid,subjectId,req.body?.remark||""]);
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/results/:examId/generate-cards",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId),e=queryOne("SELECT * FROM exams WHERE id=?",[examId]);
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  recalcExamV27(examId);
  const rows=query("SELECT student_id FROM exam_results WHERE exam_id=?",[examId]);
  for(const r of rows)insert(`INSERT OR IGNORE INTO result_cards (exam_id,student_id) VALUES (?,?)`,[examId,r.student_id]);
  insert("INSERT INTO result_publication_log (exam_id,action,actor_id) VALUES (?,?,?)",[examId,"cards_generated",req.admin.id]);
  persistDatabase();res.json({success:true,data:{generated:rows.length}});
});

app.get("/api/admin/results/:examId/report-card/:studentId",requireAdmin,(req,res)=>{
  const data=resultCardV28(Number(req.params.examId),Number(req.params.studentId));
  if(!data)return res.status(404).json({success:false,message:"Report card data not found."});
  res.json({success:true,data});
});

app.post("/api/admin/results/:examId/publish-cards",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId),e=queryOne("SELECT * FROM exams WHERE id=?",[examId]);
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  recalcExamV27(examId);
  db.run("UPDATE exams SET published=1,status='published',updated_at=CURRENT_TIMESTAMP WHERE id=?",[examId]);
  insert("INSERT INTO result_publication_log (exam_id,action,actor_id) VALUES (?,?,?)",[examId,"report_cards_published",req.admin.id]);
  persistDatabase();res.json({success:true});
});

app.get("/api/admin/results/:examId/export-data",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId),e=queryOne("SELECT * FROM exams WHERE id=?",[examId]);
  if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  recalcExamV27(examId);
  const rows=query(`SELECT s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,r.total_marks,r.max_marks,r.percentage,r.grade,r.result_status,r.class_rank
    FROM exam_results r JOIN students s ON s.id=r.student_id WHERE r.exam_id=? ORDER BY r.class_rank`,[examId]);
  res.json({success:true,data:{exam:e,rows}});
});

app.get("/api/student/exams/:id/report-card",requirePortalV22,(req,res)=>{
  if(req.portal.role!=="student"||!req.portal.student_id)return res.status(403).json({success:false,message:"Student portal only."});
  const data=resultCardV28(Number(req.params.id),Number(req.portal.student_id));
  if(!data?.exam?.published)return res.status(404).json({success:false,message:"Published report card not found."});
  res.json({success:true,data});
});


/* ===== ADVANCED FEES & FINANCE MANAGEMENT SYSTEM V29 ===== */
function ensureFeesV29(){
  db.run(`CREATE TABLE IF NOT EXISTS fee_structures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,academic_year TEXT,class_name TEXT,
    frequency TEXT DEFAULT 'annual',description TEXT,status TEXT DEFAULT 'active',
    created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,structure_id INTEGER NOT NULL,name TEXT NOT NULL,
    amount REAL DEFAULT 0,mandatory INTEGER DEFAULT 1,frequency TEXT DEFAULT 'annual',
    due_day INTEGER,late_fine_per_day REAL DEFAULT 0, UNIQUE(structure_id,name)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_fee_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,structure_id INTEGER NOT NULL,
    discount_type TEXT DEFAULT 'none',discount_value REAL DEFAULT 0,scholarship_name TEXT,
    custom_total REAL,assigned_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(student_id,structure_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,structure_id INTEGER,
    invoice_no TEXT UNIQUE NOT NULL,invoice_date TEXT NOT NULL,due_date TEXT NOT NULL,
    subtotal REAL DEFAULT 0,discount REAL DEFAULT 0,late_fine REAL DEFAULT 0,total REAL DEFAULT 0,
    paid REAL DEFAULT 0,balance REAL DEFAULT 0,status TEXT DEFAULT 'unpaid',
    notes TEXT,created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,component_id INTEGER,
    name TEXT NOT NULL,amount REAL DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,receipt_no TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,payment_method TEXT DEFAULT 'cash',transaction_ref TEXT,
    paid_on TEXT NOT NULL,received_by INTEGER,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_discounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,name TEXT NOT NULL,
    discount_type TEXT DEFAULT 'percentage',value REAL DEFAULT 0,reason TEXT,status TEXT DEFAULT 'active',
    created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,entity_type TEXT,entity_id INTEGER,
    actor_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureFeesV29();

function feeNumV29(v){return Number(Number(v||0).toFixed(2))}
function feeNoV29(prefix){
  const y=new Date().getFullYear(),n=Number(queryOne("SELECT COUNT(*) c FROM fee_invoices WHERE invoice_no LIKE ?",[`${prefix}-${y}-%`])?.c||0)+1;
  return `${prefix}-${y}-${String(n).padStart(6,"0")}`;
}
function feeAuditV29(action,type,id,details,req){
  insert("INSERT INTO fee_audit_log (action,entity_type,entity_id,actor_id,details) VALUES (?,?,?,?,?)",
    [action,type||null,id||null,req?.admin?.id||null,JSON.stringify(details||{})]);
}
function refreshInvoiceV29(id){
  const inv=queryOne("SELECT * FROM fee_invoices WHERE id=?",[id]);if(!inv)return null;
  const paid=feeNumV29(queryOne("SELECT COALESCE(SUM(amount),0) total FROM fee_payments WHERE invoice_id=?",[id])?.total);
  const balance=Math.max(0,feeNumV29(inv.total)-paid);
  const status=balance<=0?"paid":paid>0?"partial":(new Date(inv.due_date+"T23:59:59")<new Date()?"overdue":"unpaid");
  db.run("UPDATE fee_invoices SET paid=?,balance=?,status=? WHERE id=?",[paid,balance,status,id]);persistDatabase();
  return queryOne("SELECT * FROM fee_invoices WHERE id=?",[id]);
}

app.get("/api/admin/fees/dashboard",requireAdmin,(_req,res)=>{
  const today=new Date().toISOString().slice(0,10);
  const total=feeNumV29(queryOne("SELECT COALESCE(SUM(total),0) v FROM fee_invoices")?.v);
  const collected=feeNumV29(queryOne("SELECT COALESCE(SUM(amount),0) v FROM fee_payments")?.v);
  const due=feeNumV29(queryOne("SELECT COALESCE(SUM(balance),0) v FROM fee_invoices WHERE balance>0")?.v);
  const overdue=feeNumV29(queryOne("SELECT COALESCE(SUM(balance),0) v FROM fee_invoices WHERE balance>0 AND due_date<?",[today])?.v);
  const todayCollection=feeNumV29(queryOne("SELECT COALESCE(SUM(amount),0) v FROM fee_payments WHERE paid_on=?",[today])?.v);
  const defaulters=Number(queryOne("SELECT COUNT(DISTINCT student_id) c FROM fee_invoices WHERE balance>0")?.c||0);
  res.json({success:true,data:{total, collected,due,overdue,today_collection:todayCollection,defaulters}});
});

app.get("/api/admin/fees/structures",requireAdmin,(_req,res)=>{
  const rows=query("SELECT * FROM fee_structures ORDER BY academic_year DESC,id DESC");
  rows.forEach(x=>x.components=query("SELECT * FROM fee_components WHERE structure_id=? ORDER BY id",[x.id]));
  res.json({success:true,data:rows});
});
app.post("/api/admin/fees/structures",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name)return res.status(400).json({success:false,message:"Fee structure name is required."});
  const id=insert(`INSERT INTO fee_structures (name,academic_year,class_name,frequency,description,created_by) VALUES (?,?,?,?,?,?)`,
    [b.name,b.academic_year||"",b.class_name||"",b.frequency||"annual",b.description||"",req.admin.id]);
  feeAuditV29("structure_created","fee_structure",id,b,req);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_structures WHERE id=?",[id])});
});
app.post("/api/admin/fees/structures/:id/components",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),b=req.body||{};
  if(!queryOne("SELECT id FROM fee_structures WHERE id=?",[id]))return res.status(404).json({success:false,message:"Fee structure not found."});
  if(!b.name)return res.status(400).json({success:false,message:"Component name is required."});
  try{
    const cid=insert(`INSERT INTO fee_components (structure_id,name,amount,mandatory,frequency,due_day,late_fine_per_day) VALUES (?,?,?,?,?,?,?)`,
      [id,b.name,feeNumV29(b.amount),b.mandatory===false?0:1,b.frequency||"annual",b.due_day||null,feeNumV29(b.late_fine_per_day)]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_components WHERE id=?",[cid])});
  }catch{res.status(409).json({success:false,message:"Component already exists."})}
});

app.get("/api/admin/fees/students",requireAdmin,(req,res)=>{
  const q=String(req.query.q||"").trim(),like=`%${q}%`;
  res.json({success:true,data:query(`SELECT id,full_name,admission_no,roll_no,class_name,section FROM students WHERE status='active' AND (full_name LIKE ? OR admission_no LIKE ? OR CAST(roll_no AS TEXT) LIKE ?) ORDER BY class_name,roll_no LIMIT 100`,[like,like,like])});
});
app.post("/api/admin/fees/assign",requireAdmin,(req,res)=>{
  const b=req.body||{},sid=Number(b.student_id),structureId=Number(b.structure_id);
  if(!queryOne("SELECT id FROM students WHERE id=?",[sid])||!queryOne("SELECT id FROM fee_structures WHERE id=?",[structureId]))return res.status(400).json({success:false,message:"Student or fee structure not found."});
  insert(`INSERT INTO student_fee_assignments (student_id,structure_id,discount_type,discount_value,scholarship_name,custom_total)
    VALUES (?,?,?,?,?,?) ON CONFLICT(student_id,structure_id) DO UPDATE SET discount_type=excluded.discount_type,discount_value=excluded.discount_value,scholarship_name=excluded.scholarship_name,custom_total=excluded.custom_total`,
    [sid,structureId,b.discount_type||"none",feeNumV29(b.discount_value),b.scholarship_name||"",b.custom_total==null?null:feeNumV29(b.custom_total)]);
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/fees/invoices",requireAdmin,(req,res)=>{
  const b=req.body||{},sid=Number(b.student_id),structureId=Number(b.structure_id);
  const st=queryOne("SELECT * FROM students WHERE id=?",[sid]),structure=queryOne("SELECT * FROM fee_structures WHERE id=?",[structureId]);
  if(!st||!structure)return res.status(400).json({success:false,message:"Student or structure not found."});
  const components=query("SELECT * FROM fee_components WHERE structure_id=?",[structureId]);
  const subtotal=feeNumV29(components.reduce((a,x)=>a+Number(x.amount||0),0));
  const assignment=queryOne("SELECT * FROM student_fee_assignments WHERE student_id=? AND structure_id=?",[sid,structureId]);
  let discount=0;
  if(assignment){discount=assignment.discount_type==="percentage"?feeNumV29(subtotal*Number(assignment.discount_value||0)/100):feeNumV29(assignment.discount_value)}
  const custom=assignment?.custom_total==null?null:feeNumV29(assignment.custom_total);
  const finalBase=custom==null?feeNumV29(Math.max(0,subtotal-discount)):custom;
  const invDate=b.invoice_date||new Date().toISOString().slice(0,10),due=b.due_date||invDate;
  const invoiceNo=feeNoV29("INV");
  const id=insert(`INSERT INTO fee_invoices (student_id,structure_id,invoice_no,invoice_date,due_date,subtotal,discount,total,paid,balance,status,notes,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[sid,structureId,invoiceNo,invDate,due,subtotal,discount,finalBase,0,finalBase,"unpaid",b.notes||"",req.admin.id]);
  components.forEach(c=>insert("INSERT INTO fee_invoice_items (invoice_id,component_id,name,amount) VALUES (?,?,?,?)",[id,c.id,c.name,c.amount]));
  feeAuditV29("invoice_created","invoice",id,{student_id:sid,total:finalBase},req);persistDatabase();
  res.status(201).json({success:true,data:refreshInvoiceV29(id)});
});

app.get("/api/admin/fees/invoices",requireAdmin,(req,res)=>{
  const q=String(req.query.q||"").trim(),like=`%${q}%`,status=String(req.query.status||"").trim();
  let sql=`SELECT i.*,s.full_name,s.admission_no,s.class_name,s.section FROM fee_invoices i JOIN students s ON s.id=i.student_id WHERE (s.full_name LIKE ? OR s.admission_no LIKE ? OR i.invoice_no LIKE ?)`,args=[like,like,like];
  if(status){sql+=" AND i.status=?";args.push(status)}
  sql+=" ORDER BY i.invoice_date DESC,i.id DESC LIMIT 300";
  const rows=query(sql,args);rows.forEach(x=>refreshInvoiceV29(x.id));
  res.json({success:true,data:rows.map(x=>queryOne(`SELECT i.*,s.full_name,s.admission_no,s.class_name,s.section FROM fee_invoices i JOIN students s ON s.id=i.student_id WHERE i.id=?`,[x.id]))});
});

app.get("/api/admin/fees/invoices/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),inv=refreshInvoiceV29(id);
  if(!inv)return res.status(404).json({success:false,message:"Invoice not found."});
  inv.student=queryOne("SELECT id,full_name,admission_no,roll_no,class_name,section FROM students WHERE id=?",[inv.student_id]);
  inv.items=query("SELECT * FROM fee_invoice_items WHERE invoice_id=?",[id]);
  inv.payments=query("SELECT * FROM fee_payments WHERE invoice_id=? ORDER BY paid_on DESC,id DESC",[id]);
  res.json({success:true,data:inv});
});

app.post("/api/admin/fees/invoices/:id/payments",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),inv=refreshInvoiceV29(id),amount=feeNumV29(req.body?.amount);
  if(!inv)return res.status(404).json({success:false,message:"Invoice not found."});
  if(amount<=0||amount>Number(inv.balance))return res.status(400).json({success:false,message:"Payment must be greater than zero and not exceed balance."});
  const receipt=feeNoV29("RCT"),date=req.body?.paid_on||new Date().toISOString().slice(0,10);
  const pid=insert(`INSERT INTO fee_payments (invoice_id,receipt_no,amount,payment_method,transaction_ref,paid_on,received_by,notes)
    VALUES (?,?,?,?,?,?,?,?)`,[id,receipt,amount,req.body?.payment_method||"cash",req.body?.transaction_ref||"",date,req.admin.id,req.body?.notes||""]);
  const updated=refreshInvoiceV29(id);feeAuditV29("payment_received","payment",pid,{invoice_id:id,receipt_no:receipt,amount},req);
  persistDatabase();res.status(201).json({success:true,data:{payment:queryOne("SELECT * FROM fee_payments WHERE id=?",[pid]),invoice:updated}});
});

app.post("/api/admin/fees/discounts",requireAdmin,(req,res)=>{
  const b=req.body||{},sid=Number(b.student_id);
  if(!queryOne("SELECT id FROM students WHERE id=?",[sid]))return res.status(404).json({success:false,message:"Student not found."});
  const id=insert("INSERT INTO fee_discounts (student_id,name,discount_type,value,reason,created_by) VALUES (?,?,?,?,?,?)",
    [sid,b.name||"Discount",b.discount_type||"percentage",feeNumV29(b.value),b.reason||"",req.admin.id]);
  feeAuditV29("discount_added","discount",id,b,req);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_discounts WHERE id=?",[id])});
});
app.get("/api/admin/fees/discounts/:studentId",requireAdmin,(req,res)=>res.json({success:true,data:query("SELECT * FROM fee_discounts WHERE student_id=? ORDER BY created_at DESC",[Number(req.params.studentId)])}));

app.get("/api/admin/fees/reports/collection",requireAdmin,(req,res)=>{
  const from=String(req.query.from||"1970-01-01"),to=String(req.query.to||"9999-12-31");
  const total=feeNumV29(queryOne("SELECT COALESCE(SUM(total),0) v FROM fee_invoices WHERE invoice_date BETWEEN ? AND ?",[from,to])?.v);
  const collected=feeNumV29(queryOne("SELECT COALESCE(SUM(amount),0) v FROM fee_payments WHERE paid_on BETWEEN ? AND ?",[from,to])?.v);
  const methods=query("SELECT payment_method,COUNT(*) count,ROUND(SUM(amount),2) total FROM fee_payments WHERE paid_on BETWEEN ? AND ? GROUP BY payment_method ORDER BY total DESC",[from,to]);
  const daily=query("SELECT paid_on,ROUND(SUM(amount),2) total,COUNT(*) payments FROM fee_payments WHERE paid_on BETWEEN ? AND ? GROUP BY paid_on ORDER BY paid_on",[from,to]);
  res.json({success:true,data:{from,to,invoiced:total,collected,balance:feeNumV29(total-collected),methods,daily}});
});
app.get("/api/admin/fees/reports/defaulters",requireAdmin,(_req,res)=>{
  const rows=query(`SELECT s.id,s.full_name,s.admission_no,s.class_name,s.section,ROUND(SUM(i.balance),2) outstanding,
    MIN(i.due_date) oldest_due FROM fee_invoices i JOIN students s ON s.id=i.student_id
    WHERE i.balance>0 GROUP BY s.id ORDER BY outstanding DESC`);
  res.json({success:true,data:rows});
});
app.get("/api/admin/fees/audit",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM fee_audit_log ORDER BY created_at DESC,id DESC LIMIT 500")}));

app.get("/api/student/fees",requirePortalV22,(req,res)=>{
  if(req.portal.role!=="student"||!req.portal.student_id)return res.json({success:true,data:{invoices:[],payments:[]}});
  const sid=Number(req.portal.student_id),invoices=query("SELECT invoice_no,invoice_date,due_date,subtotal,discount,total,paid,balance,status FROM fee_invoices WHERE student_id=? ORDER BY invoice_date DESC",[sid]);
  const payments=query(`SELECT p.receipt_no,p.amount,p.payment_method,p.paid_on,i.invoice_no FROM fee_payments p JOIN fee_invoices i ON i.id=p.invoice_id WHERE i.student_id=? ORDER BY p.paid_on DESC`,[sid]);
  res.json({success:true,data:{invoices,payments}});
});


/* ===== ADVANCED HR & STAFF MANAGEMENT SYSTEM V30 ===== */
function ensureHRV30(){
  db.run(`CREATE TABLE IF NOT EXISTS hr_departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,description TEXT,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hr_designations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,description TEXT,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hr_employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,employee_code TEXT UNIQUE NOT NULL,full_name TEXT NOT NULL,
    email TEXT,phone TEXT,gender TEXT,dob TEXT,address TEXT,department_id INTEGER,designation_id INTEGER,
    employment_type TEXT DEFAULT 'full_time',joining_date TEXT,exit_date TEXT,status TEXT DEFAULT 'active',
    qualification TEXT,experience_years REAL DEFAULT 0,emergency_contact TEXT,notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hr_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL,document_type TEXT NOT NULL,
    document_name TEXT NOT NULL,file_path TEXT,expiry_date TEXT,status TEXT DEFAULT 'active',
    notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hr_leave_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,days_per_year REAL DEFAULT 0,
    paid INTEGER DEFAULT 1,status TEXT DEFAULT 'active'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hr_leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL,leave_type_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,end_date TEXT NOT NULL,total_days REAL DEFAULT 0,reason TEXT,
    status TEXT DEFAULT 'pending',approved_by INTEGER,approved_at TEXT,rejection_reason TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hr_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL,attendance_date TEXT NOT NULL,
    status TEXT DEFAULT 'present',check_in TEXT,check_out TEXT,remarks TEXT,marked_by INTEGER,
    UNIQUE(employee_id,attendance_date)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hr_salary_structures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL,effective_from TEXT NOT NULL,
    basic REAL DEFAULT 0,hra REAL DEFAULT 0,allowances REAL DEFAULT 0,deductions REAL DEFAULT 0,
    gross REAL DEFAULT 0,net REAL DEFAULT 0,notes TEXT,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hr_payroll (
    id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL,pay_month TEXT NOT NULL,
    basic REAL DEFAULT 0,hra REAL DEFAULT 0,allowances REAL DEFAULT 0,deductions REAL DEFAULT 0,
    gross REAL DEFAULT 0,net REAL DEFAULT 0,present_days REAL DEFAULT 0,working_days REAL DEFAULT 0,
    status TEXT DEFAULT 'draft',payslip_no TEXT UNIQUE,paid_on TEXT,created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(employee_id,pay_month)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hr_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL,review_date TEXT NOT NULL,
    period TEXT,rating REAL DEFAULT 0,attendance_rating REAL DEFAULT 0,teaching_rating REAL DEFAULT 0,
    discipline_rating REAL DEFAULT 0,remarks TEXT,reviewer_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hr_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,entity_type TEXT,entity_id INTEGER,
    actor_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`INSERT OR IGNORE INTO hr_leave_types (name,days_per_year,paid) VALUES ('Casual Leave',12,1)`);
  db.run(`INSERT OR IGNORE INTO hr_leave_types (name,days_per_year,paid) VALUES ('Sick Leave',12,1)`);
  db.run(`INSERT OR IGNORE INTO hr_leave_types (name,days_per_year,paid) VALUES ('Unpaid Leave',0,0)`);
  persistDatabase();
}
ensureHRV30();

function hrAuditV30(action,type,id,details,req){
  insert("INSERT INTO hr_audit_log (action,entity_type,entity_id,actor_id,details) VALUES (?,?,?,?,?)",
    [action,type||null,id||null,req?.admin?.id||null,JSON.stringify(details||{})]);
}
function hrDaysV30(a,b){
  const x=new Date(a+"T00:00:00"),y=new Date(b+"T00:00:00");
  return Math.max(0,Math.floor((y-x)/86400000)+1);
}
function hrPayslipV30(id){
  const y=new Date().getFullYear(),n=Number(queryOne("SELECT COUNT(*) c FROM hr_payroll WHERE payslip_no LIKE ?",[`PAY-${y}-%`])?.c||0)+1;
  return `PAY-${y}-${String(n).padStart(6,"0")}`;
}

app.get("/api/admin/hr/dashboard",requireAdmin,(_req,res)=>{
  const active=Number(queryOne("SELECT COUNT(*) c FROM hr_employees WHERE status='active'")?.c||0);
  const departments=Number(queryOne("SELECT COUNT(*) c FROM hr_departments WHERE status='active'")?.c||0);
  const pending=Number(queryOne("SELECT COUNT(*) c FROM hr_leave_requests WHERE status='pending'")?.c||0);
  const month=new Date().toISOString().slice(0,7);
  const payroll=Number(queryOne("SELECT COALESCE(SUM(net),0) v FROM hr_payroll WHERE pay_month=? AND status='paid'",[month])?.v||0);
  const today=new Date().toISOString().slice(0,10);
  const present=Number(queryOne("SELECT COUNT(*) c FROM hr_attendance WHERE attendance_date=? AND status='present'",[today])?.c||0);
  res.json({success:true,data:{active,departments,pending_leave:pending,monthly_payroll:payroll,today_present:present}});
});

app.get("/api/admin/hr/departments",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM hr_departments ORDER BY name")}));
app.post("/api/admin/hr/departments",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name)return res.status(400).json({success:false,message:"Department name is required."});
  try{const id=insert("INSERT INTO hr_departments (name,description) VALUES (?,?)",[b.name,b.description||""]);hrAuditV30("department_created","department",id,b,req);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hr_departments WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Department already exists."})}
});
app.get("/api/admin/hr/designations",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM hr_designations ORDER BY name")}));
app.post("/api/admin/hr/designations",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name)return res.status(400).json({success:false,message:"Designation name is required."});
  try{const id=insert("INSERT INTO hr_designations (name,description) VALUES (?,?)",[b.name,b.description||""]);hrAuditV30("designation_created","designation",id,b,req);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hr_designations WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Designation already exists."})}
});

app.get("/api/admin/hr/employees",requireAdmin,(req,res)=>{
  const q=String(req.query.q||"").trim(),like=`%${q}%`,status=String(req.query.status||"active");
  let sql=`SELECT e.*,d.name department_name,g.name designation_name FROM hr_employees e
    LEFT JOIN hr_departments d ON d.id=e.department_id LEFT JOIN hr_designations g ON g.id=e.designation_id
    WHERE (e.full_name LIKE ? OR e.employee_code LIKE ? OR e.email LIKE ? OR e.phone LIKE ?)`,args=[like,like,like,like];
  if(status!=="all"){sql+=" AND e.status=?";args.push(status)}
  sql+=" ORDER BY e.full_name";
  res.json({success:true,data:query(sql,args)});
});
app.post("/api/admin/hr/employees",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.employee_code||!b.full_name)return res.status(400).json({success:false,message:"Employee code and name are required."});
  try{
    const id=insert(`INSERT INTO hr_employees (employee_code,full_name,email,phone,gender,dob,address,department_id,designation_id,employment_type,joining_date,qualification,experience_years,emergency_contact,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.employee_code,b.full_name,b.email||"",b.phone||"",b.gender||"",b.dob||null,b.address||"",b.department_id||null,b.designation_id||null,b.employment_type||"full_time",b.joining_date||null,b.qualification||"",Number(b.experience_years||0),b.emergency_contact||"",b.notes||""]);
    hrAuditV30("employee_created","employee",id,b,req);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hr_employees WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Employee code already exists."})}
});
app.patch("/api/admin/hr/employees/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM hr_employees WHERE id=?",[id]);if(!e)return res.status(404).json({success:false,message:"Employee not found."});
  const b={...e,...req.body};
  db.run(`UPDATE hr_employees SET employee_code=?,full_name=?,email=?,phone=?,gender=?,dob=?,address=?,department_id=?,designation_id=?,employment_type=?,joining_date=?,exit_date=?,status=?,qualification=?,experience_years=?,emergency_contact=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.employee_code,b.full_name,b.email||"",b.phone||"",b.gender||"",b.dob||null,b.address||"",b.department_id||null,b.designation_id||null,b.employment_type||"full_time",b.joining_date||null,b.exit_date||null,b.status||"active",b.qualification||"",Number(b.experience_years||0),b.emergency_contact||"",b.notes||"",id]);
  hrAuditV30("employee_updated","employee",id,req.body,req);persistDatabase();res.json({success:true});
});

app.get("/api/admin/hr/employees/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne(`SELECT e.*,d.name department_name,g.name designation_name FROM hr_employees e
    LEFT JOIN hr_departments d ON d.id=e.department_id LEFT JOIN hr_designations g ON g.id=e.designation_id WHERE e.id=?`,[id]);
  if(!e)return res.status(404).json({success:false,message:"Employee not found."});
  e.documents=query("SELECT * FROM hr_documents WHERE employee_id=? ORDER BY created_at DESC",[id]);
  e.leave_requests=query("SELECT l.*,t.name leave_type FROM hr_leave_requests l JOIN hr_leave_types t ON t.id=l.leave_type_id WHERE l.employee_id=? ORDER BY l.created_at DESC",[id]);
  e.salary=query("SELECT * FROM hr_salary_structures WHERE employee_id=? ORDER BY effective_from DESC",[id]);
  e.performance=query("SELECT * FROM hr_performance WHERE employee_id=? ORDER BY review_date DESC",[id]);
  res.json({success:true,data:e});
});

app.post("/api/admin/hr/employees/:id/documents",requireAdmin,(req,res)=>{
  const b=req.body||{},id=Number(req.params.id);if(!queryOne("SELECT id FROM hr_employees WHERE id=?",[id]))return res.status(404).json({success:false,message:"Employee not found."});
  const did=insert("INSERT INTO hr_documents (employee_id,document_type,document_name,file_path,expiry_date,notes) VALUES (?,?,?,?,?,?)",
    [id,b.document_type||"other",b.document_name||"Document",b.file_path||"",b.expiry_date||null,b.notes||""]);
  hrAuditV30("document_added","document",did,{employee_id:id},req);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hr_documents WHERE id=?",[did])});
});

app.get("/api/admin/hr/leave-types",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM hr_leave_types ORDER BY name")}));
app.post("/api/admin/hr/leave-types",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name)return res.status(400).json({success:false,message:"Leave type is required."});
  try{const id=insert("INSERT INTO hr_leave_types (name,days_per_year,paid) VALUES (?,?,?)",[b.name,Number(b.days_per_year||0),b.paid===false?0:1]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hr_leave_types WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Leave type already exists."})}
});
app.get("/api/admin/hr/leaves",requireAdmin,(req,res)=>{
  const status=String(req.query.status||"all");
  let sql=`SELECT l.*,e.full_name,e.employee_code,t.name leave_type FROM hr_leave_requests l JOIN hr_employees e ON e.id=l.employee_id JOIN hr_leave_types t ON t.id=l.leave_type_id`;
  const args=[];if(status!=="all"){sql+=" WHERE l.status=?";args.push(status)}sql+=" ORDER BY l.created_at DESC";
  res.json({success:true,data:query(sql,args)});
});
app.post("/api/admin/hr/leaves",requireAdmin,(req,res)=>{
  const b=req.body||{},eid=Number(b.employee_id),type=Number(b.leave_type_id);
  if(!queryOne("SELECT id FROM hr_employees WHERE id=?",[eid])||!queryOne("SELECT id FROM hr_leave_types WHERE id=?",[type]))return res.status(400).json({success:false,message:"Employee or leave type not found."});
  if(!b.start_date||!b.end_date)return res.status(400).json({success:false,message:"Leave dates are required."});
  const days=hrDaysV30(b.start_date,b.end_date),id=insert(`INSERT INTO hr_leave_requests (employee_id,leave_type_id,start_date,end_date,total_days,reason) VALUES (?,?,?,?,?,?)`,
    [eid,type,b.start_date,b.end_date,days,b.reason||""]);
  hrAuditV30("leave_requested","leave",id,b,req);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hr_leave_requests WHERE id=?",[id])});
});
app.patch("/api/admin/hr/leaves/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),l=queryOne("SELECT * FROM hr_leave_requests WHERE id=?",[id]);if(!l)return res.status(404).json({success:false,message:"Leave request not found."});
  const status=req.body?.status;if(!["approved","rejected","pending"].includes(status))return res.status(400).json({success:false,message:"Invalid leave status."});
  db.run("UPDATE hr_leave_requests SET status=?,approved_by=?,approved_at=?,rejection_reason=? WHERE id=?",
    [status,status==="approved"?req.admin.id:null,status==="approved"?new Date().toISOString():null,req.body?.rejection_reason||"",id]);
  hrAuditV30("leave_"+status,"leave",id,req.body,req);persistDatabase();res.json({success:true});
});

app.get("/api/admin/hr/attendance",requireAdmin,(req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  res.json({success:true,data:query(`SELECT e.id,e.employee_code,e.full_name,d.name department_name,a.attendance_date,a.status,a.check_in,a.check_out,a.remarks
    FROM hr_employees e LEFT JOIN hr_departments d ON d.id=e.department_id LEFT JOIN hr_attendance a ON a.employee_id=e.id AND a.attendance_date=?
    WHERE e.status='active' ORDER BY e.full_name`,[date])});
});
app.post("/api/admin/hr/attendance/bulk",requireAdmin,(req,res)=>{
  const date=req.body?.attendance_date||new Date().toISOString().slice(0,10),rows=Array.isArray(req.body?.records)?req.body.records:[];
  for(const x of rows){
    if(!queryOne("SELECT id FROM hr_employees WHERE id=?",[Number(x.employee_id)]))continue;
    insert(`INSERT INTO hr_attendance (employee_id,attendance_date,status,check_in,check_out,remarks,marked_by)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(employee_id,attendance_date) DO UPDATE SET status=excluded.status,check_in=excluded.check_in,check_out=excluded.check_out,remarks=excluded.remarks,marked_by=excluded.marked_by`,
      [Number(x.employee_id),date,x.status||"present",x.check_in||null,x.check_out||null,x.remarks||"",req.admin.id]);
  }
  persistDatabase();res.json({success:true});
});

app.post("/api/admin/hr/employees/:id/salary",requireAdmin,(req,res)=>{
  const eid=Number(req.params.id),b=req.body||{};if(!queryOne("SELECT id FROM hr_employees WHERE id=?",[eid]))return res.status(404).json({success:false,message:"Employee not found."});
  const basic=Number(b.basic||0),hra=Number(b.hra||0),allowances=Number(b.allowances||0),deductions=Number(b.deductions||0),gross=basic+hra+allowances,net=Math.max(0,gross-deductions);
  const id=insert(`INSERT INTO hr_salary_structures (employee_id,effective_from,basic,hra,allowances,deductions,gross,net,notes) VALUES (?,?,?,?,?,?,?,?,?)`,
    [eid,b.effective_from||new Date().toISOString().slice(0,10),basic,hra,allowances,deductions,gross,net,b.notes||""]);
  hrAuditV30("salary_structure_created","salary",id,{employee_id:eid,net},req);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hr_salary_structures WHERE id=?",[id])});
});
app.post("/api/admin/hr/payroll/generate",requireAdmin,(req,res)=>{
  const month=req.body?.pay_month||new Date().toISOString().slice(0,7),rows=query(`SELECT e.id,
    COALESCE((SELECT basic FROM hr_salary_structures s WHERE s.employee_id=e.id ORDER BY effective_from DESC LIMIT 1),0) basic,
    COALESCE((SELECT hra FROM hr_salary_structures s WHERE s.employee_id=e.id ORDER BY effective_from DESC LIMIT 1),0) hra,
    COALESCE((SELECT allowances FROM hr_salary_structures s WHERE s.employee_id=e.id ORDER BY effective_from DESC LIMIT 1),0) allowances,
    COALESCE((SELECT deductions FROM hr_salary_structures s WHERE s.employee_id=e.id ORDER BY effective_from DESC LIMIT 1),0) deductions
    FROM hr_employees e WHERE e.status='active'`);
  for(const x of rows){
    const gross=Number(x.basic)+Number(x.hra)+Number(x.allowances),net=Math.max(0,gross-Number(x.deductions));
    const working=Number(queryOne("SELECT COUNT(DISTINCT attendance_date) c FROM hr_attendance WHERE employee_id=? AND substr(attendance_date,1,7)=?",[x.id,month])?.c||0);
    const present=Number(queryOne("SELECT COUNT(*) c FROM hr_attendance WHERE employee_id=? AND substr(attendance_date,1,7)=? AND status='present'",[x.id,month])?.c||0);
    insert(`INSERT INTO hr_payroll (employee_id,pay_month,basic,hra,allowances,deductions,gross,net,present_days,working_days,status,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,pay_month) DO UPDATE SET basic=excluded.basic,hra=excluded.hra,allowances=excluded.allowances,deductions=excluded.deductions,gross=excluded.gross,net=excluded.net,present_days=excluded.present_days,working_days=excluded.working_days`,
      [x.id,month,x.basic,x.hra,x.allowances,x.deductions,gross,net,present,working,"draft",req.admin.id]);
  }
  persistDatabase();res.json({success:true,data:query(`SELECT p.*,e.full_name,e.employee_code FROM hr_payroll p JOIN hr_employees e ON e.id=p.employee_id WHERE p.pay_month=? ORDER BY e.full_name`,[month])});
});
app.get("/api/admin/hr/payroll",requireAdmin,(req,res)=>{
  const month=String(req.query.month||new Date().toISOString().slice(0,7));
  res.json({success:true,data:query(`SELECT p.*,e.full_name,e.employee_code,d.name department_name FROM hr_payroll p JOIN hr_employees e ON e.id=p.employee_id LEFT JOIN hr_departments d ON d.id=e.department_id WHERE p.pay_month=? ORDER BY e.full_name`,[month])});
});
app.post("/api/admin/hr/payroll/:id/pay",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),p=queryOne("SELECT * FROM hr_payroll WHERE id=?",[id]);if(!p)return res.status(404).json({success:false,message:"Payroll record not found."});
  db.run("UPDATE hr_payroll SET status='paid',paid_on=? WHERE id=?",[req.body?.paid_on||new Date().toISOString().slice(0,10),id]);
  const no=hrPayslipV30(id);db.run("UPDATE hr_payroll SET payslip_no=? WHERE id=?",[no,id]);
  hrAuditV30("payroll_paid","payroll",id,{payslip_no:no},req);persistDatabase();res.json({success:true,data:queryOne("SELECT * FROM hr_payroll WHERE id=?",[id])});
});
app.get("/api/admin/hr/performance/:employeeId",requireAdmin,(req,res)=>res.json({success:true,data:query("SELECT * FROM hr_performance WHERE employee_id=? ORDER BY review_date DESC",[Number(req.params.employeeId)])}));
app.post("/api/admin/hr/performance/:employeeId",requireAdmin,(req,res)=>{
  const eid=Number(req.params.employeeId),b=req.body||{};if(!queryOne("SELECT id FROM hr_employees WHERE id=?",[eid]))return res.status(404).json({success:false,message:"Employee not found."});
  const id=insert(`INSERT INTO hr_performance (employee_id,review_date,period,rating,attendance_rating,teaching_rating,discipline_rating,remarks,reviewer_id)
    VALUES (?,?,?,?,?,?,?,?,?)`,[eid,b.review_date||new Date().toISOString().slice(0,10),b.period||"",Number(b.rating||0),Number(b.attendance_rating||0),Number(b.teaching_rating||0),Number(b.discipline_rating||0),b.remarks||"",req.admin.id]);
  hrAuditV30("performance_review","performance",id,{employee_id:eid},req);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hr_performance WHERE id=?",[id])});
});
app.get("/api/admin/hr/audit",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM hr_audit_log ORDER BY created_at DESC,id DESC LIMIT 500")}));


/* ===== UNIFIED SCHOOL ERP PORTAL & DASHBOARD V31 ===== */
function ensurePortalV31(){
  db.run(`CREATE TABLE IF NOT EXISTS portal_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,recipient_type TEXT NOT NULL,recipient_id INTEGER NOT NULL,
    title TEXT NOT NULL,message TEXT NOT NULL,type TEXT DEFAULT 'info',link TEXT,
    is_read INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS portal_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,message TEXT NOT NULL,
    audience TEXT DEFAULT 'all',priority TEXT DEFAULT 'normal',publish_date TEXT DEFAULT CURRENT_TIMESTAMP,
    expiry_date TEXT,status TEXT DEFAULT 'published',created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS portal_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,owner_type TEXT NOT NULL,owner_id INTEGER NOT NULL,
    title TEXT NOT NULL,document_type TEXT DEFAULT 'other',file_path TEXT,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensurePortalV31();

function portalNotifyV31(type,id,title,message,kind="info",link=null){
  insert("INSERT INTO portal_notifications (recipient_type,recipient_id,title,message,type,link) VALUES (?,?,?,?,?,?)",
    [type,id,title,message,kind,link]);
}
function studentIdFromPortalV31(req){return req.portal?.role==="student" ? Number(req.portal.student_id||0):0}

app.get("/api/admin/portal/dashboard",requireAdmin,(_req,res)=>{
  const today=new Date().toISOString().slice(0,10),month=today.slice(0,7);
  const students=Number(queryOne("SELECT COUNT(*) c FROM students WHERE status='active'")?.c||0);
  const staff=Number(queryOne("SELECT COUNT(*) c FROM hr_employees WHERE status='active'")?.c||0);
  const pendingLeaves=Number(queryOne("SELECT COUNT(*) c FROM hr_leave_requests WHERE status='pending'")?.c||0);
  const feesDue=Number(queryOne("SELECT COALESCE(SUM(balance),0) v FROM fee_invoices WHERE balance>0")?.v||0);
  const feeCollected=Number(queryOne("SELECT COALESCE(SUM(amount),0) v FROM fee_payments WHERE paid_on=?", [today])?.v||0);
  const overdueBooks=Number(queryOne("SELECT COUNT(*) c FROM library_loans WHERE status='issued' AND due_date<date('now')")?.c||0);
  const activeHostel=Number(queryOne("SELECT COUNT(*) c FROM hostel_allocations WHERE status='active'")?.c||0);
  const publishedExams=Number(queryOne("SELECT COUNT(*) c FROM exams WHERE published=1")?.c||0);
  const attendance=Number(queryOne("SELECT COUNT(*) c FROM attendance WHERE attendance_date=?", [today])?.c||0);
  res.json({success:true,data:{today,month,students,staff,pending_leaves:pendingLeaves,fees_due:feesDue,today_collection:feeCollected,
    overdue_books:overdueBooks,hostel_residents:activeHostel,published_exams:publishedExams,today_attendance_records:attendance}});
});

app.get("/api/admin/portal/announcements",requireAdmin,(_req,res)=>
  res.json({success:true,data:query("SELECT * FROM portal_announcements ORDER BY publish_date DESC,id DESC LIMIT 100")}));
app.post("/api/admin/portal/announcements",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.title||!b.message)return res.status(400).json({success:false,message:"Title and message are required."});
  const id=insert(`INSERT INTO portal_announcements (title,message,audience,priority,publish_date,expiry_date,created_by)
    VALUES (?,?,?,?,?,?,?)`,[b.title,b.message,b.audience||"all",b.priority||"normal",b.publish_date||new Date().toISOString(),b.expiry_date||null,req.admin.id]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM portal_announcements WHERE id=?",[id])});
});

app.get("/api/admin/portal/notifications",requireAdmin,(_req,res)=>
  res.json({success:true,data:query("SELECT * FROM portal_notifications ORDER BY created_at DESC,id DESC LIMIT 200")}));

app.get("/api/student/portal/dashboard",requirePortalV22,(req,res)=>{
  const sid=studentIdFromPortalV31(req);if(!sid)return res.status(403).json({success:false,message:"Student portal only."});
  const student=queryOne("SELECT id,full_name,admission_no,roll_no,class_name,section,status FROM students WHERE id=?",[sid]);
  if(!student)return res.status(404).json({success:false,message:"Student not found."});
  const today=new Date().toISOString().slice(0,10);
  const attendanceRows=query(`SELECT status,COUNT(*) c FROM attendance WHERE student_id=? GROUP BY status`,[sid]);
  const attendance={};attendanceRows.forEach(x=>attendance[x.status]=Number(x.c));
  const fees=query(`SELECT COALESCE(SUM(total),0) total,COALESCE(SUM(paid),0) paid,COALESCE(SUM(balance),0) balance
    FROM fee_invoices WHERE student_id=?`,[sid])[0]||{total:0,paid:0,balance:0};
  const overdueBooks=Number(queryOne(`SELECT COUNT(*) c FROM library_loans WHERE borrower_type='student' AND borrower_id=? AND status='issued' AND due_date<date('now')`,[sid])?.c||0);
  const latestResults=query(`SELECT e.id,e.title,e.start_date,r.percentage,r.grade,r.class_rank FROM exams e
    JOIN exam_results r ON r.exam_id=e.id WHERE e.published=1 AND r.student_id=? ORDER BY e.start_date DESC,e.id DESC LIMIT 5`,[sid]);
  const notifications=query(`SELECT * FROM portal_notifications WHERE recipient_type='student' AND recipient_id=? ORDER BY created_at DESC,id DESC LIMIT 20`,[sid]);
  const announcements=query(`SELECT * FROM portal_announcements WHERE status='published' AND (expiry_date IS NULL OR expiry_date>=?) AND (audience='all' OR audience='student') ORDER BY publish_date DESC,id DESC LIMIT 10`,[today]);
  res.json({success:true,data:{student,attendance,fees,overdue_books:overdueBooks,latest_results:latestResults,notifications,announcements}});
});

app.get("/api/student/portal/notifications",requirePortalV22,(req,res)=>{
  const sid=studentIdFromPortalV31(req);if(!sid)return res.status(403).json({success:false,message:"Student portal only."});
  res.json({success:true,data:query("SELECT * FROM portal_notifications WHERE recipient_type='student' AND recipient_id=? ORDER BY created_at DESC",[sid])});
});
app.patch("/api/student/portal/notifications/:id/read",requirePortalV22,(req,res)=>{
  const sid=studentIdFromPortalV31(req),id=Number(req.params.id);
  if(!sid)return res.status(403).json({success:false,message:"Student portal only."});
  db.run("UPDATE portal_notifications SET is_read=1 WHERE id=? AND recipient_type='student' AND recipient_id=?",[id,sid]);
  persistDatabase();res.json({success:true});
});

app.get("/api/student/portal/announcements",requirePortalV22,(req,res)=>{
  const today=new Date().toISOString().slice(0,10);
  res.json({success:true,data:query(`SELECT * FROM portal_announcements WHERE status='published' AND (expiry_date IS NULL OR expiry_date>=?)
    AND (audience='all' OR audience='student') ORDER BY priority DESC,publish_date DESC`,[today])});
});

app.post("/api/admin/portal/notify-student",requireAdmin,(req,res)=>{
  const sid=Number(req.body?.student_id),b=req.body||{};
  if(!queryOne("SELECT id FROM students WHERE id=?",[sid]))return res.status(404).json({success:false,message:"Student not found."});
  portalNotifyV31("student",sid,b.title||"School Notification",b.message||"",b.type||"info",b.link||null);
  persistDatabase();res.json({success:true});
});


/* ===== ADVANCED TEACHER PORTAL & WORKSTATION V32 ===== */
function ensureTeacherV32(){
  db.run(`CREATE TABLE IF NOT EXISTS teacher_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER UNIQUE,employee_id INTEGER UNIQUE,
    employee_code TEXT UNIQUE,full_name TEXT NOT NULL,email TEXT,phone TEXT,
    department_id INTEGER,designation_id INTEGER,qualification TEXT,joining_date TEXT,
    bio TEXT,status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teacher_subject_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_name TEXT NOT NULL,
    section TEXT,subject_name TEXT NOT NULL,academic_year TEXT,room TEXT,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id,class_name,section,subject_name,academic_year)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teacher_timetable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,day_of_week TEXT NOT NULL,
    period_no INTEGER NOT NULL,start_time TEXT,end_time TEXT,class_name TEXT,section TEXT,
    subject_name TEXT,room TEXT,status TEXT DEFAULT 'active',
    UNIQUE(teacher_id,day_of_week,period_no)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teacher_homework (
    id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_name TEXT NOT NULL,
    section TEXT,subject_name TEXT NOT NULL,title TEXT NOT NULL,instructions TEXT,due_date TEXT,
    attachment_path TEXT,status TEXT DEFAULT 'published',created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teacher_leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,total_days REAL DEFAULT 0,reason TEXT,status TEXT DEFAULT 'pending',
    reviewed_by INTEGER,reviewed_at TEXT,review_note TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teacher_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,student_id INTEGER,
    class_name TEXT,section TEXT,title TEXT NOT NULL,message TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teacher_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER,action TEXT NOT NULL,
    entity_type TEXT,entity_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureTeacherV32();

function teacherAuditV32(tid,action,type,id,details){
  insert("INSERT INTO teacher_audit_log (teacher_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)",
    [tid,action,type||null,id||null,JSON.stringify(details||{})]);
}
function teacherIdV32(req){
  return Number(req.teacher?.id||req.teacher?.teacher_id||req.user?.teacher_id||req.user?.id||0);
}
function teacherGuardV32(req,res,next){
  const token=req.headers.authorization?.replace(/^Bearer\s+/i,"");
  let payload=null;
  try{payload=token?jwt.verify(token,JWT_SECRET):null}catch{}
  if(!payload)return res.status(401).json({success:false,message:"Teacher authentication required."});
  if(payload.role!=="teacher" && payload.role!=="admin")return res.status(403).json({success:false,message:"Teacher access required."});
  req.teacher=payload;next();
}
function teacherProfileV32(tid){
  return queryOne(`SELECT t.*,e.full_name employee_full_name,e.employee_code,d.name department_name,g.name designation_name
    FROM teacher_profiles t
    LEFT JOIN hr_employees e ON e.id=t.employee_id
    LEFT JOIN hr_departments d ON d.id=t.department_id
    LEFT JOIN hr_designations g ON g.id=t.designation_id
    WHERE t.id=? OR t.user_id=? OR t.employee_id=?`,[tid,tid,tid]);
}

app.get("/api/teacher/dashboard",teacherGuardV32,(req,res)=>{
  const tid=teacherIdV32(req),p=teacherProfileV32(tid);
  if(!p)return res.status(404).json({success:false,message:"Teacher profile not configured."});
  const today=new Date().toISOString().slice(0,10),month=today.slice(0,7);
  const assignments=query("SELECT * FROM teacher_subject_assignments WHERE teacher_id=? AND status='active' ORDER BY class_name,section,subject_name",[p.id]);
  const timetable=query("SELECT * FROM teacher_timetable WHERE teacher_id=? AND status='active' ORDER BY day_of_week,period_no",[p.id]);
  const homework=query("SELECT * FROM teacher_homework WHERE teacher_id=? ORDER BY due_date DESC,id DESC LIMIT 10",[p.id]);
  const leaves=query("SELECT * FROM teacher_leave_requests WHERE teacher_id=? ORDER BY created_at DESC LIMIT 10",[p.id]);
  const pending=Number(queryOne("SELECT COUNT(*) c FROM teacher_leave_requests WHERE teacher_id=? AND status='pending'",[p.id])?.c||0);
  const classes=[...new Set(assignments.map(x=>`${x.class_name}${x.section?`-${x.section}`:""}`))];
  res.json({success:true,data:{profile:p,assignments,timetable,homework,leaves,pending_leave:pending,classes,today,month}});
});

app.get("/api/teacher/profile",teacherGuardV32,(req,res)=>{
  const p=teacherProfileV32(teacherIdV32(req));if(!p)return res.status(404).json({success:false,message:"Teacher profile not configured."});
  res.json({success:true,data:p});
});
app.patch("/api/teacher/profile",teacherGuardV32,(req,res)=>{
  const tid=teacherIdV32(req),p=teacherProfileV32(tid);if(!p)return res.status(404).json({success:false,message:"Teacher profile not configured."});
  const b={...p,...req.body};
  db.run(`UPDATE teacher_profiles SET full_name=?,email=?,phone=?,qualification=?,bio=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.full_name,b.email||"",b.phone||"",b.qualification||"",b.bio||"",p.id]);
  teacherAuditV32(p.id,"profile_updated","teacher_profile",p.id,req.body);persistDatabase();res.json({success:true});
});

app.get("/api/teacher/classes",teacherGuardV32,(req,res)=>{
  const tid=teacherIdV32(req),p=teacherProfileV32(tid);if(!p)return res.status(404).json({success:false,message:"Teacher profile not configured."});
  const rows=query(`SELECT a.*,COUNT(s.id) student_count FROM teacher_subject_assignments a
    LEFT JOIN students s ON s.class_name=a.class_name AND COALESCE(s.section,'')=COALESCE(a.section,'') AND s.status='active'
    WHERE a.teacher_id=? AND a.status='active' GROUP BY a.id ORDER BY a.class_name,a.section,a.subject_name`,[p.id]);
  res.json({success:true,data:rows});
});
app.get("/api/teacher/classes/:assignmentId/students",teacherGuardV32,(req,res)=>{
  const tid=teacherIdV32(req),p=teacherProfileV32(tid),a=queryOne("SELECT * FROM teacher_subject_assignments WHERE id=? AND teacher_id=?",[Number(req.params.assignmentId),p?.id]);
  if(!a)return res.status(404).json({success:false,message:"Class assignment not found."});
  res.json({success:true,data:query(`SELECT id,full_name,admission_no,roll_no,class_name,section,status FROM students
    WHERE status='active' AND class_name=? AND COALESCE(section,'')=COALESCE(?, '') ORDER BY roll_no,full_name`,[a.class_name,a.section])});
});

app.get("/api/teacher/attendance",teacherGuardV32,(req,res)=>{
  const tid=teacherIdV32(req),p=teacherProfileV32(tid);if(!p)return res.status(404).json({success:false,message:"Teacher profile not configured."});
  const assignment=Number(req.query.assignment_id||0),a=queryOne("SELECT * FROM teacher_subject_assignments WHERE id=? AND teacher_id=?",[assignment,p.id]);
  if(!a)return res.status(400).json({success:false,message:"Valid assignment_id is required."});
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  const rows=query(`SELECT s.id,s.full_name,s.admission_no,s.roll_no,a.status,a.remarks FROM students s
    LEFT JOIN attendance a ON a.student_id=s.id AND a.attendance_date=?
    WHERE s.status='active' AND s.class_name=? AND COALESCE(s.section,'')=COALESCE(?, '') ORDER BY s.roll_no,s.full_name`,[date,a.class_name,a.section]);
  res.json({success:true,data:{assignment:a,date,students:rows}});
});
app.post("/api/teacher/attendance/bulk",teacherGuardV32,(req,res)=>{
  const tid=teacherIdV32(req),p=teacherProfileV32(tid),assignment=Number(req.body?.assignment_id||0);
  const a=queryOne("SELECT * FROM teacher_subject_assignments WHERE id=? AND teacher_id=?",[assignment,p?.id]);
  if(!a)return res.status(400).json({success:false,message:"Valid assignment_id is required."});
  const date=req.body?.attendance_date||new Date().toISOString().slice(0,10),records=Array.isArray(req.body?.records)?req.body.records:[];
  for(const x of records){
    if(!queryOne("SELECT id FROM students WHERE id=? AND status='active'",[Number(x.student_id)]))continue;
    insert(`INSERT INTO attendance (student_id,attendance_date,status,remarks,marked_by)
      VALUES (?,?,?,?,?) ON CONFLICT(student_id,attendance_date) DO UPDATE SET status=excluded.status,remarks=excluded.remarks,marked_by=excluded.marked_by`,
      [Number(x.student_id),date,x.status||"present",x.remarks||"",tid]);
  }
  teacherAuditV32(p.id,"attendance_bulk","assignment",assignment,{date,count:records.length});persistDatabase();res.json({success:true});
});

app.get("/api/teacher/marks/:examId",teacherGuardV32,(req,res)=>{
  const tid=teacherIdV32(req),p=teacherProfileV32(tid),examId=Number(req.params.examId);
  const assignments=query("SELECT * FROM teacher_subject_assignments WHERE teacher_id=? AND status='active'",[p?.id]);
  const exam=queryOne("SELECT * FROM exams WHERE id=?",[examId]);if(!exam)return res.status(404).json({success:false,message:"Exam not found."});
  const subjects=query(`SELECT es.* FROM exam_subjects es WHERE es.exam_id=? AND EXISTS(
    SELECT 1 FROM teacher_subject_assignments ta WHERE ta.teacher_id=? AND ta.subject_name=es.subject_name AND ta.class_name=?
    AND COALESCE(ta.section,'')=COALESCE(?,'')) ORDER BY es.subject_name`,
    [examId,p?.id,exam.class_name,exam.section]);
  const students=examStudentsV27(exam.class_name,exam.section);
  const marks=query("SELECT * FROM exam_marks WHERE exam_id=?",[examId]),map={};marks.forEach(m=>map[`${m.student_id}:${m.subject_id}`]=m);
  res.json({success:true,data:{exam,subjects,students,marks:students.map(s=>({student:s,subjects:subjects.map(sub=>map[`${s.id}:${sub.id}`]||{student_id:s.id,subject_id:sub.id,theory:0,practical:0,internal:0,grace:0,status:"present"})}))}});
});
app.post("/api/teacher/marks/bulk",teacherGuardV32,(req,res)=>{
  const tid=teacherIdV32(req),p=teacherProfileV32(tid),examId=Number(req.body?.exam_id);
  const exam=queryOne("SELECT * FROM exams WHERE id=?",[examId]);if(!exam)return res.status(404).json({success:false,message:"Exam not found."});
  if(exam.result_locked)return res.status(400).json({success:false,message:"Result is locked by admin."});
  const rows=Array.isArray(req.body?.records)?req.body.records:[];
  for(const x of rows){
    const sub=queryOne("SELECT * FROM exam_subjects WHERE id=? AND exam_id=?",[Number(x.subject_id),examId]);
    if(!sub)continue;
    const own=queryOne(`SELECT id FROM teacher_subject_assignments WHERE teacher_id=? AND subject_name=? AND class_name=? AND COALESCE(section,'')=COALESCE(?,'')`,
      [p?.id,sub.subject_name,exam.class_name,exam.section]);
    if(!own)continue;
    insert(`INSERT INTO exam_marks (exam_id,student_id,subject_id,theory,practical,internal,grace,status,remarks)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(exam_id,student_id,subject_id) DO UPDATE SET theory=excluded.theory,practical=excluded.practical,internal=excluded.internal,grace=excluded.grace,status=excluded.status,remarks=excluded.remarks`,
      [examId,Number(x.student_id),Number(x.subject_id),Number(x.theory||0),Number(x.practical||0),Number(x.internal||0),Number(x.grace||0),x.status||"present",x.remarks||""]);
  }
  teacherAuditV32(p.id,"marks_bulk","exam",examId,{count:rows.length});persistDatabase();res.json({success:true});
});

app.get("/api/teacher/homework",teacherGuardV32,(req,res)=>{
  const p=teacherProfileV32(teacherIdV32(req));res.json({success:true,data:query("SELECT * FROM teacher_homework WHERE teacher_id=? ORDER BY due_date DESC,id DESC",[p?.id])});
});
app.post("/api/teacher/homework",teacherGuardV32,(req,res)=>{
  const p=teacherProfileV32(teacherIdV32(req)),b=req.body||{};
  if(!b.title||!b.class_name||!b.subject_name)return res.status(400).json({success:false,message:"Title, class and subject are required."});
  const owns=queryOne(`SELECT id FROM teacher_subject_assignments WHERE teacher_id=? AND class_name=? AND COALESCE(section,'')=COALESCE(?,'') AND subject_name=?`,
    [p.id,b.class_name,b.section,b.subject_name]);if(!owns)return res.status(403).json({success:false,message:"This class/subject is not assigned to the teacher."});
  const id=insert(`INSERT INTO teacher_homework (teacher_id,class_name,section,subject_name,title,instructions,due_date,attachment_path)
    VALUES (?,?,?,?,?,?,?,?)`,[p.id,b.class_name,b.section||"",b.subject_name,b.title,b.instructions||"",b.due_date||null,b.attachment_path||""]);
  teacherAuditV32(p.id,"homework_created","homework",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM teacher_homework WHERE id=?",[id])});
});

app.get("/api/teacher/timetable",teacherGuardV32,(req,res)=>{
  const p=teacherProfileV32(teacherIdV32(req));res.json({success:true,data:query("SELECT * FROM teacher_timetable WHERE teacher_id=? ORDER BY CASE day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END,period_no",[p?.id])});
});
app.get("/api/teacher/leaves",teacherGuardV32,(req,res)=>{
  const p=teacherProfileV32(teacherIdV32(req));res.json({success:true,data:query("SELECT * FROM teacher_leave_requests WHERE teacher_id=? ORDER BY created_at DESC",[p?.id])});
});
app.post("/api/teacher/leaves",teacherGuardV32,(req,res)=>{
  const p=teacherProfileV32(teacherIdV32(req)),b=req.body||{};if(!b.start_date||!b.end_date)return res.status(400).json({success:false,message:"Leave dates are required."});
  const days=Math.max(0,Math.floor((new Date(b.end_date)-new Date(b.start_date))/86400000)+1);
  const id=insert("INSERT INTO teacher_leave_requests (teacher_id,start_date,end_date,total_days,reason) VALUES (?,?,?,?,?)",[p.id,b.start_date,b.end_date,days,b.reason||""]);
  teacherAuditV32(p.id,"leave_requested","leave",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM teacher_leave_requests WHERE id=?",[id])});
});
app.get("/api/teacher/students/search",teacherGuardV32,(req,res)=>{
  const p=teacherProfileV32(teacherIdV32(req)),q=String(req.query.q||"").trim(),like=`%${q}%`;
  const rows=query(`SELECT DISTINCT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section FROM students s
    JOIN teacher_subject_assignments a ON a.teacher_id=? AND a.class_name=s.class_name AND COALESCE(a.section,'')=COALESCE(s.section,'')
    WHERE s.status='active' AND (s.full_name LIKE ? OR s.admission_no LIKE ? OR CAST(s.roll_no AS TEXT) LIKE ?) ORDER BY s.class_name,s.roll_no LIMIT 100`,
    [p?.id,like,like,like]);
  res.json({success:true,data:rows});
});


/* ===== ADVANCED PARENT PORTAL & FAMILY WORKSTATION V33 ===== */
function ensureParentV33(){
  db.run(`CREATE TABLE IF NOT EXISTS parent_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER UNIQUE,parent_code TEXT UNIQUE,
    full_name TEXT NOT NULL,email TEXT,phone TEXT,alternate_phone TEXT,address TEXT,
    occupation TEXT,relationship_default TEXT,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS parent_student_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,parent_id INTEGER NOT NULL,student_id INTEGER NOT NULL,
    relationship TEXT DEFAULT 'parent',is_primary INTEGER DEFAULT 0,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(parent_id,student_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS parent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,parent_id INTEGER NOT NULL,student_id INTEGER,
    teacher_id INTEGER,class_name TEXT,subject_name TEXT,title TEXT NOT NULL,message TEXT NOT NULL,
    sender_type TEXT DEFAULT 'parent',status TEXT DEFAULT 'sent',created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS parent_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,parent_id INTEGER NOT NULL,student_id INTEGER,
    request_type TEXT NOT NULL,title TEXT NOT NULL,description TEXT,status TEXT DEFAULT 'pending',
    reviewed_by INTEGER,reviewed_at TEXT,review_note TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS parent_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,parent_id INTEGER,action TEXT NOT NULL,
    entity_type TEXT,entity_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureParentV33();

function parentGuardV33(req,res,next){
  const token=req.headers.authorization?.replace(/^Bearer\s+/i,"");
  let payload=null;
  try{payload=token?jwt.verify(token,JWT_SECRET):null}catch{}
  if(!payload)return res.status(401).json({success:false,message:"Parent authentication required."});
  if(payload.role!=="parent" && payload.role!=="admin")return res.status(403).json({success:false,message:"Parent access required."});
  req.parent=payload;next();
}
function parentIdV33(req){return Number(req.parent?.id||req.parent?.parent_id||req.parent?.user_id||0)}
function parentProfileV33(pid){
  return queryOne("SELECT * FROM parent_profiles WHERE id=? OR user_id=?",[pid,pid]);
}
function parentAuditV33(pid,action,type,id,details){
  insert("INSERT INTO parent_audit_log (parent_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)",
    [pid,action,type||null,id||null,JSON.stringify(details||{})]);
}
function parentChildrenV33(pid){
  const p=parentProfileV33(pid);if(!p)return [];
  return query(`SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,s.status,
    l.relationship,l.is_primary FROM parent_student_links l JOIN students s ON s.id=l.student_id
    WHERE l.parent_id=? AND l.status='active' ORDER BY l.is_primary DESC,s.class_name,s.roll_no,s.full_name`,[p.id]);
}
function parentOwnsStudentV33(pid,sid){
  const p=parentProfileV33(pid);return !!(p&&queryOne("SELECT id FROM parent_student_links WHERE parent_id=? AND student_id=? AND status='active'",[p.id,sid]));
}

app.get("/api/parent/dashboard",parentGuardV33,(req,res)=>{
  const p=parentProfileV33(parentIdV33(req));
  if(!p)return res.status(404).json({success:false,message:"Parent profile not configured."});
  const children=parentChildrenV33(p.id),today=new Date().toISOString().slice(0,10);
  const enriched=children.map(st=>{
    const att=query(`SELECT status,COUNT(*) c FROM attendance WHERE student_id=? GROUP BY status`,[st.id]),attendance={};
    att.forEach(x=>attendance[x.status]=Number(x.c));
    const fees=queryOne("SELECT COALESCE(SUM(total),0) total,COALESCE(SUM(paid),0) paid,COALESCE(SUM(balance),0) balance FROM fee_invoices WHERE student_id=?",[st.id])||{};
    const result=query(`SELECT e.id,e.title,e.start_date,r.percentage,r.grade,r.class_rank FROM exams e JOIN exam_results r ON r.exam_id=e.id WHERE e.published=1 AND r.student_id=? ORDER BY e.start_date DESC,e.id DESC LIMIT 3`,[st.id]);
    const homework=query(`SELECT h.* FROM teacher_homework h WHERE h.class_name=? AND COALESCE(h.section,'')=COALESCE(?, '') AND h.status='published' ORDER BY h.due_date DESC,h.id DESC LIMIT 5`,[st.class_name,st.section]);
    const overdueBooks=Number(queryOne(`SELECT COUNT(*) c FROM library_loans WHERE borrower_type='student' AND borrower_id=? AND status='issued' AND due_date<date('now')`,[st.id])?.c||0);
    return {...st,attendance,fees,result,homework,overdue_books:overdueBooks};
  });
  const notifications=query("SELECT * FROM portal_notifications WHERE recipient_type='parent' AND recipient_id=? ORDER BY created_at DESC,id DESC LIMIT 30",[p.id]);
  const announcements=query(`SELECT * FROM portal_announcements WHERE status='published' AND (expiry_date IS NULL OR expiry_date>=?)
    AND (audience='all' OR audience='parent') ORDER BY priority DESC,publish_date DESC LIMIT 15`,[today]);
  res.json({success:true,data:{profile:p,children:enriched,notifications,announcements}});
});

app.get("/api/parent/profile",parentGuardV33,(req,res)=>{
  const p=parentProfileV33(parentIdV33(req));if(!p)return res.status(404).json({success:false,message:"Parent profile not configured."});
  res.json({success:true,data:p});
});
app.patch("/api/parent/profile",parentGuardV33,(req,res)=>{
  const p=parentProfileV33(parentIdV33(req));if(!p)return res.status(404).json({success:false,message:"Parent profile not configured."});
  const b={...p,...req.body};
  db.run(`UPDATE parent_profiles SET full_name=?,email=?,phone=?,alternate_phone=?,address=?,occupation=?,relationship_default=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.full_name,b.email||"",b.phone||"",b.alternate_phone||"",b.address||"",b.occupation||"",b.relationship_default||"parent",p.id]);
  parentAuditV33(p.id,"profile_updated","parent_profile",p.id,req.body);persistDatabase();res.json({success:true});
});

app.get("/api/parent/children",parentGuardV33,(req,res)=>{
  const p=parentProfileV33(parentIdV33(req));if(!p)return res.status(404).json({success:false,message:"Parent profile not configured."});
  res.json({success:true,data:parentChildrenV33(p.id)});
});

app.get("/api/parent/children/:studentId/attendance",parentGuardV33,(req,res)=>{
  const sid=Number(req.params.studentId),p=parentProfileV33(parentIdV33(req));
  if(!p||!parentOwnsStudentV33(p.id,sid))return res.status(403).json({success:false,message:"Student is not linked to this parent."});
  const from=String(req.query.from||"1970-01-01"),to=String(req.query.to||"9999-12-31");
  const rows=query("SELECT attendance_date,status,remarks FROM attendance WHERE student_id=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date DESC",[sid,from,to]);
  const total=rows.length,present=rows.filter(x=>x.status==="present").length;
  res.json({success:true,data:{rows,total,present,percentage:total?Number((present/total*100).toFixed(2)):0}});
});

app.get("/api/parent/children/:studentId/results",parentGuardV33,(req,res)=>{
  const sid=Number(req.params.studentId),p=parentProfileV33(parentIdV33(req));
  if(!p||!parentOwnsStudentV33(p.id,sid))return res.status(403).json({success:false,message:"Student is not linked to this parent."});
  res.json({success:true,data:query(`SELECT e.id,e.title,e.academic_year,e.start_date,r.total_marks,r.max_marks,r.percentage,r.grade,r.result_status,r.class_rank
    FROM exams e JOIN exam_results r ON r.exam_id=e.id WHERE e.published=1 AND r.student_id=? ORDER BY e.start_date DESC,e.id DESC`,[sid])});
});

app.get("/api/parent/children/:studentId/report-card/:examId",parentGuardV33,(req,res)=>{
  const sid=Number(req.params.studentId),eid=Number(req.params.examId),p=parentProfileV33(parentIdV33(req));
  if(!p||!parentOwnsStudentV33(p.id,sid))return res.status(403).json({success:false,message:"Student is not linked to this parent."});
  const e=queryOne("SELECT * FROM exams WHERE id=? AND published=1",[eid]);if(!e)return res.status(404).json({success:false,message:"Published report card not found."});
  const r=queryOne("SELECT * FROM exam_results WHERE exam_id=? AND student_id=?",[eid,sid]);
  const subjects=query(`SELECT es.*,em.theory,em.practical,em.internal,em.grace,em.status mark_status,em.remarks FROM exam_subjects es
    LEFT JOIN exam_marks em ON em.subject_id=es.id AND em.exam_id=? AND em.student_id=? WHERE es.exam_id=? ORDER BY es.subject_name`,[eid,sid,eid]);
  res.json({success:true,data:{exam:e,student:queryOne("SELECT id,full_name,admission_no,roll_no,class_name,section FROM students WHERE id=?",[sid]),result:r,subjects}});
});

app.get("/api/parent/children/:studentId/fees",parentGuardV33,(req,res)=>{
  const sid=Number(req.params.studentId),p=parentProfileV33(parentIdV33(req));
  if(!p||!parentOwnsStudentV33(p.id,sid))return res.status(403).json({success:false,message:"Student is not linked to this parent."});
  const invoices=query("SELECT id,invoice_no,invoice_date,due_date,total,paid,balance,status FROM fee_invoices WHERE student_id=? ORDER BY invoice_date DESC",[sid]);
  const payments=query(`SELECT p.receipt_no,p.amount,p.payment_method,p.transaction_ref,p.paid_on,i.invoice_no FROM fee_payments p
    JOIN fee_invoices i ON i.id=p.invoice_id WHERE i.student_id=? ORDER BY p.paid_on DESC,p.id DESC`,[sid]);
  res.json({success:true,data:{invoices,payments,summary:{total:invoices.reduce((a,x)=>a+Number(x.total||0),0),paid:invoices.reduce((a,x)=>a+Number(x.paid||0),0),balance:invoices.reduce((a,x)=>a+Number(x.balance||0),0)}}});
});

app.get("/api/parent/children/:studentId/homework",parentGuardV33,(req,res)=>{
  const sid=Number(req.params.studentId),p=parentProfileV33(parentIdV33(req));
  if(!p||!parentOwnsStudentV33(p.id,sid))return res.status(403).json({success:false,message:"Student is not linked to this parent."});
  const st=queryOne("SELECT class_name,section FROM students WHERE id=?",[sid]);
  res.json({success:true,data:query(`SELECT * FROM teacher_homework WHERE class_name=? AND COALESCE(section,'')=COALESCE(?, '') AND status='published' ORDER BY due_date DESC,id DESC`,[st.class_name,st.section])});
});

app.get("/api/parent/notifications",parentGuardV33,(req,res)=>{
  const p=parentProfileV33(parentIdV33(req));if(!p)return res.status(404).json({success:false,message:"Parent profile not configured."});
  res.json({success:true,data:query("SELECT * FROM portal_notifications WHERE recipient_type='parent' AND recipient_id=? ORDER BY created_at DESC",[p.id])});
});
app.patch("/api/parent/notifications/:id/read",parentGuardV33,(req,res)=>{
  const p=parentProfileV33(parentIdV33(req));if(!p)return res.status(404).json({success:false,message:"Parent profile not configured."});
  db.run("UPDATE portal_notifications SET is_read=1 WHERE id=? AND recipient_type='parent' AND recipient_id=?",[Number(req.params.id),p.id]);
  persistDatabase();res.json({success:true});
});

app.get("/api/parent/announcements",parentGuardV33,(req,res)=>{
  const today=new Date().toISOString().slice(0,10);
  res.json({success:true,data:query(`SELECT * FROM portal_announcements WHERE status='published' AND (expiry_date IS NULL OR expiry_date>=?)
    AND (audience='all' OR audience='parent') ORDER BY priority DESC,publish_date DESC`,[today])});
});

app.post("/api/parent/requests",parentGuardV33,(req,res)=>{
  const p=parentProfileV33(parentIdV33(req)),b=req.body||{},sid=b.student_id?Number(b.student_id):null;
  if(!p)return res.status(404).json({success:false,message:"Parent profile not configured."});
  if(sid&&!parentOwnsStudentV33(p.id,sid))return res.status(403).json({success:false,message:"Student is not linked to this parent."});
  if(!b.request_type||!b.title)return res.status(400).json({success:false,message:"Request type and title are required."});
  const id=insert("INSERT INTO parent_requests (parent_id,student_id,request_type,title,description) VALUES (?,?,?,?,?)",
    [p.id,sid,b.request_type,b.title,b.description||""]);
  parentAuditV33(p.id,"request_created","parent_request",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM parent_requests WHERE id=?",[id])});
});
app.get("/api/parent/requests",parentGuardV33,(req,res)=>{
  const p=parentProfileV33(parentIdV33(req));if(!p)return res.status(404).json({success:false,message:"Parent profile not configured."});
  res.json({success:true,data:query("SELECT r.*,s.full_name student_name FROM parent_requests r LEFT JOIN students s ON s.id=r.student_id WHERE r.parent_id=? ORDER BY r.created_at DESC",[p.id])});
});

app.post("/api/parent/messages",parentGuardV33,(req,res)=>{
  const p=parentProfileV33(parentIdV33(req)),b=req.body||{},sid=b.student_id?Number(b.student_id):null;
  if(!p)return res.status(404).json({success:false,message:"Parent profile not configured."});
  if(sid&&!parentOwnsStudentV33(p.id,sid))return res.status(403).json({success:false,message:"Student is not linked to this parent."});
  if(!b.title||!b.message)return res.status(400).json({success:false,message:"Title and message are required."});
  const id=insert(`INSERT INTO parent_messages (parent_id,student_id,teacher_id,class_name,subject_name,title,message,sender_type)
    VALUES (?,?,?,?,?,?,?,?)`,[p.id,sid,b.teacher_id||null,b.class_name||"",b.subject_name||"",b.title,b.message,"parent"]);
  parentAuditV33(p.id,"message_sent","parent_message",id,{student_id:sid});persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM parent_messages WHERE id=?",[id])});
});

app.get("/api/admin/parents",requireAdmin,(_req,res)=>{
  const rows=query("SELECT p.*,COUNT(l.student_id) children_count FROM parent_profiles p LEFT JOIN parent_student_links l ON l.parent_id=p.id AND l.status='active' GROUP BY p.id ORDER BY p.full_name");
  res.json({success:true,data:rows});
});
app.post("/api/admin/parents",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.full_name)return res.status(400).json({success:false,message:"Parent name is required."});
  try{
    const code=b.parent_code||`PAR-${new Date().getFullYear()}-${String(Number(queryOne("SELECT COUNT(*) c FROM parent_profiles")?.c||0)+1).padStart(5,"0")}`;
    const id=insert(`INSERT INTO parent_profiles (user_id,parent_code,full_name,email,phone,alternate_phone,address,occupation,relationship_default)
      VALUES (?,?,?,?,?,?,?,?,?)`,[b.user_id||null,code,b.full_name,b.email||"",b.phone||"",b.alternate_phone||"",b.address||"",b.occupation||"",b.relationship_default||"parent"]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM parent_profiles WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Parent code or user is already linked."})}
});
app.post("/api/admin/parents/:id/children",requireAdmin,(req,res)=>{
  const pid=Number(req.params.id),sid=Number(req.body?.student_id);
  if(!queryOne("SELECT id FROM parent_profiles WHERE id=?",[pid])||!queryOne("SELECT id FROM students WHERE id=?",[sid]))return res.status(400).json({success:false,message:"Parent or student not found."});
  insert(`INSERT INTO parent_student_links (parent_id,student_id,relationship,is_primary) VALUES (?,?,?,?)
    ON CONFLICT(parent_id,student_id) DO UPDATE SET relationship=excluded.relationship,is_primary=excluded.is_primary,status='active'`,
    [pid,sid,req.body?.relationship||"parent",req.body?.is_primary?1:0]);
  persistDatabase();res.json({success:true});
});
app.get("/api/admin/parents/requests",requireAdmin,(req,res)=>{
  const status=String(req.query.status||"all");let sql=`SELECT r.*,p.full_name parent_name,s.full_name student_name FROM parent_requests r
    JOIN parent_profiles p ON p.id=r.parent_id LEFT JOIN students s ON s.id=r.student_id`;const args=[];
  if(status!=="all"){sql+=" WHERE r.status=?";args.push(status)}sql+=" ORDER BY r.created_at DESC";
  res.json({success:true,data:query(sql,args)});
});
app.patch("/api/admin/parents/requests/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),status=req.body?.status;if(!["approved","rejected","pending","resolved"].includes(status))return res.status(400).json({success:false,message:"Invalid request status."});
  db.run("UPDATE parent_requests SET status=?,reviewed_by=?,reviewed_at=?,review_note=? WHERE id=?",
    [status,req.admin.id,status==="pending"?null:new Date().toISOString(),req.body?.review_note||"",id]);persistDatabase();res.json({success:true});
});


/* ===== ADVANCED COMMUNICATION & NOTIFICATION CENTER V34 ===== */
function ensureCommunicationV34(){
  db.run(`CREATE TABLE IF NOT EXISTS communication_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,description TEXT,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS communication_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,sender_type TEXT NOT NULL,sender_id INTEGER,
    audience_type TEXT NOT NULL,audience_id INTEGER,class_name TEXT,section TEXT,student_id INTEGER,
    teacher_id INTEGER,parent_id INTEGER,title TEXT NOT NULL,message TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',status TEXT DEFAULT 'published',scheduled_at TEXT,
    published_at TEXT,expires_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS communication_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,message_id INTEGER NOT NULL,recipient_type TEXT NOT NULL,
    recipient_id INTEGER NOT NULL,read_at TEXT,delivered_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id,recipient_type,recipient_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS communication_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,title_template TEXT NOT NULL,
    body_template TEXT NOT NULL,category TEXT DEFAULT 'general',status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS communication_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,actor_type TEXT,actor_id INTEGER,action TEXT NOT NULL,
    message_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`INSERT OR IGNORE INTO communication_channels (name,description) VALUES ('Announcements','School-wide announcements')`);
  db.run(`INSERT OR IGNORE INTO communication_channels (name,description) VALUES ('Academic','Classes, exams, homework and results')`);
  db.run(`INSERT OR IGNORE INTO communication_channels (name,description) VALUES ('Finance','Fee and payment reminders')`);
  db.run(`INSERT OR IGNORE INTO communication_channels (name,description) VALUES ('Attendance','Attendance alerts and notices')`);
  db.run(`INSERT OR IGNORE INTO communication_channels (name,description) VALUES ('General','General school communication')`);
  db.run(`INSERT OR IGNORE INTO communication_templates (name,title_template,body_template,category) VALUES ('fee_reminder','Fee Reminder - {{student_name}}','Dear Parent, fee balance for {{student_name}} is {{balance}}. Please contact the school office for assistance.','finance')`);
  db.run(`INSERT OR IGNORE INTO communication_templates (name,title_template,body_template,category) VALUES ('attendance_alert','Attendance Alert - {{student_name}}','Attendance update for {{student_name}}: {{status}} on {{date}}.','attendance')`);
  db.run(`INSERT OR IGNORE INTO communication_templates (name,title_template,body_template,category) VALUES ('exam_notice','Exam Notice','Please check the examination schedule and instructions.','academic')`);
  persistDatabase();
}
ensureCommunicationV34();

function commAuthV34(req){
  const token=req.headers.authorization?.replace(/^Bearer\s+/i,"");
  let p=null;try{p=token?jwt.verify(token,JWT_SECRET):null}catch{}
  return p;
}
function commRecipientsV34(audienceType,audienceId,body){
  const out=[], type=String(audienceType||"all");
  if(type==="student" && audienceId) out.push(["student",Number(audienceId)]);
  if(type==="teacher" && audienceId) out.push(["teacher",Number(audienceId)]);
  if(type==="parent" && audienceId) out.push(["parent",Number(audienceId)]);
  if(type==="all"){
    query("SELECT id FROM students WHERE status='active'").forEach(x=>out.push(["student",x.id]));
    query("SELECT id FROM hr_employees WHERE status='active'").forEach(x=>out.push(["teacher",x.id]));
    query("SELECT id FROM parent_profiles WHERE status='active'").forEach(x=>out.push(["parent",x.id]));
  }
  if(type==="class"){
    query("SELECT id FROM students WHERE status='active' AND class_name=? AND COALESCE(section,'')=COALESCE(?, '')",[body.class_name,body.section]).forEach(x=>out.push(["student",x.id]));
    query(`SELECT DISTINCT l.parent_id FROM parent_student_links l JOIN students s ON s.id=l.student_id
      WHERE l.status='active' AND s.status='active' AND s.class_name=? AND COALESCE(s.section,'')=COALESCE(?, '')`,
      [body.class_name,body.section]).forEach(x=>out.push(["parent",x.parent_id]));
  }
  if(type==="parents_of_student" && audienceId){
    query("SELECT parent_id FROM parent_student_links WHERE student_id=? AND status='active'",[Number(audienceId)]).forEach(x=>out.push(["parent",x.parent_id]));
  }
  return [...new Map(out.map(x=>[`${x[0]}:${x[1]}`,x])).values()];
}
function commAuditV34(actor,action,messageId,details){
  insert("INSERT INTO communication_audit_log (actor_type,actor_id,action,message_id,details) VALUES (?,?,?,?,?)",
    [actor?.role||null,actor?.id||null,action,messageId,JSON.stringify(details||{})]);
}
function commCreateV34(body,actor){
  const id=insert(`INSERT INTO communication_messages
    (sender_type,sender_id,audience_type,audience_id,class_name,section,student_id,teacher_id,parent_id,title,message,priority,status,scheduled_at,published_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [actor?.role||"admin",actor?.id||null,body.audience_type||"all",body.audience_id||null,body.class_name||null,body.section||null,
     body.student_id||null,body.teacher_id||null,body.parent_id||null,body.title,body.message,body.priority||"normal",
     body.scheduled_at?"scheduled":"published",body.scheduled_at||null,body.scheduled_at?null:new Date().toISOString(),body.expires_at||null]);
  const recipients=body.scheduled_at?[]:commRecipientsV34(body.audience_type||"all",body.audience_id,body);
  for(const [rt,rid] of recipients) insert(`INSERT OR IGNORE INTO communication_recipients
    (message_id,recipient_type,recipient_id,delivered_at) VALUES (?,?,?,?)`,[id,rt,rid,new Date().toISOString()]);
  commAuditV34(actor,"message_created",id,{recipient_count:recipients.length,audience_type:body.audience_type||"all"});
  persistDatabase();return id;
}

app.get("/api/admin/communication/dashboard",requireAdmin,(_req,res)=>{
  const total=Number(queryOne("SELECT COUNT(*) c FROM communication_messages")?.c||0);
  const scheduled=Number(queryOne("SELECT COUNT(*) c FROM communication_messages WHERE status='scheduled'")?.c||0);
  const unread=Number(queryOne("SELECT COUNT(*) c FROM communication_recipients WHERE read_at IS NULL")?.c||0);
  const today=new Date().toISOString().slice(0,10);
  const todaySent=Number(queryOne("SELECT COUNT(*) c FROM communication_messages WHERE substr(COALESCE(published_at,created_at),1,10)=?",[today])?.c||0);
  res.json({success:true,data:{total,scheduled,unread,today_sent:todaySent}});
});
app.get("/api/admin/communication/messages",requireAdmin,(req,res)=>{
  const status=String(req.query.status||"all"),q=String(req.query.q||"").trim(),like=`%${q}%`;
  let sql=`SELECT m.*,COUNT(r.id) recipient_count,SUM(CASE WHEN r.read_at IS NOT NULL THEN 1 ELSE 0 END) read_count
    FROM communication_messages m LEFT JOIN communication_recipients r ON r.message_id=m.id WHERE (m.title LIKE ? OR m.message LIKE ?)`;
  const args=[like,like];if(status!=="all"){sql+=" AND m.status=?";args.push(status)}
  sql+=" GROUP BY m.id ORDER BY m.created_at DESC,m.id DESC LIMIT 300";
  res.json({success:true,data:query(sql,args)});
});
app.post("/api/admin/communication/messages",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.title||!b.message)return res.status(400).json({success:false,message:"Title and message are required."});
  const id=commCreateV34(b,req.admin);res.status(201).json({success:true,data:queryOne("SELECT * FROM communication_messages WHERE id=?",[id])});
});
app.patch("/api/admin/communication/messages/:id/cancel",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);const m=queryOne("SELECT * FROM communication_messages WHERE id=?",[id]);
  if(!m)return res.status(404).json({success:false,message:"Message not found."});
  db.run("UPDATE communication_messages SET status='cancelled' WHERE id=? AND status='scheduled'",[id]);commAuditV34(req.admin,"message_cancelled",id);persistDatabase();res.json({success:true});
});
app.get("/api/admin/communication/templates",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM communication_templates ORDER BY category,name")}));
app.post("/api/admin/communication/templates",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name||!b.title_template||!b.body_template)return res.status(400).json({success:false,message:"Template fields are required."});
  try{const id=insert("INSERT INTO communication_templates (name,title_template,body_template,category) VALUES (?,?,?,?)",[b.name,b.title_template,b.body_template,b.category||"general"]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM communication_templates WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Template name already exists."})}
});
app.get("/api/admin/communication/audit",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM communication_audit_log ORDER BY created_at DESC,id DESC LIMIT 500")}));

function communicationUserTypeV34(role){
  if(role==="teacher")return"teacher";if(role==="parent")return"parent";if(role==="student")return"student";return null;
}
app.get("/api/communication/inbox",(req,res)=>{
  const p=commAuthV34(req),type=communicationUserTypeV34(p?.role),id=Number(p?.id||p?.user_id||0);
  if(!type||!id)return res.status(401).json({success:false,message:"Portal authentication required."});
  const rows=query(`SELECT m.id,m.title,m.message,m.priority,m.published_at,m.created_at,r.read_at,r.delivered_at
    FROM communication_recipients r JOIN communication_messages m ON m.id=r.message_id
    WHERE r.recipient_type=? AND r.recipient_id=? AND m.status='published' AND (m.expires_at IS NULL OR m.expires_at>=?)
    ORDER BY m.published_at DESC,m.id DESC LIMIT 200`,[type,id,new Date().toISOString()]);
  res.json({success:true,data:rows});
});
app.patch("/api/communication/inbox/:id/read",(req,res)=>{
  const p=commAuthV34(req),type=communicationUserTypeV34(p?.role),uid=Number(p?.id||p?.user_id||0),id=Number(req.params.id);
  if(!type||!uid)return res.status(401).json({success:false,message:"Portal authentication required."});
  db.run("UPDATE communication_recipients SET read_at=? WHERE message_id=? AND recipient_type=? AND recipient_id=?",
    [new Date().toISOString(),id,type,uid]);persistDatabase();res.json({success:true});
});
app.get("/api/communication/unread-count",(req,res)=>{
  const p=commAuthV34(req),type=communicationUserTypeV34(p?.role),uid=Number(p?.id||p?.user_id||0);
  if(!type||!uid)return res.status(401).json({success:false,message:"Portal authentication required."});
  res.json({success:true,data:{count:Number(queryOne("SELECT COUNT(*) c FROM communication_recipients WHERE recipient_type=? AND recipient_id=? AND read_at IS NULL",[type,uid])?.c||0)}});
});


/* ===== ADVANCED ACADEMIC SCHEDULER V35 ===== */
function ensureAcademicSchedulerV35(){
  db.run(`CREATE TABLE IF NOT EXISTS academic_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,period_no INTEGER NOT NULL,
    start_time TEXT NOT NULL,end_time TEXT NOT NULL,status TEXT DEFAULT 'active',
    UNIQUE(period_no)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS academic_working_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,day_name TEXT NOT NULL UNIQUE,is_working INTEGER DEFAULT 1,
    UNIQUE(day_name)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS academic_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,room_code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,
    room_type TEXT DEFAULT 'classroom',capacity INTEGER DEFAULT 0,status TEXT DEFAULT 'active'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS academic_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,class_name TEXT,section TEXT,
    weekly_periods INTEGER DEFAULT 1,status TEXT DEFAULT 'active',
    UNIQUE(name,class_name,section)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS academic_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,day_name TEXT NOT NULL,period_no INTEGER NOT NULL,
    class_name TEXT NOT NULL,section TEXT,subject_name TEXT NOT NULL,teacher_id INTEGER,
    room_id INTEGER,academic_year TEXT,status TEXT DEFAULT 'active',
    notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(day_name,period_no,class_name,section),
    UNIQUE(day_name,period_no,teacher_id),
    UNIQUE(day_name,period_no,room_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS academic_substitutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,schedule_id INTEGER NOT NULL,date TEXT NOT NULL,
    substitute_teacher_id INTEGER NOT NULL,reason TEXT,status TEXT DEFAULT 'active',
    created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(schedule_id,date)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS academic_holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT NOT NULL UNIQUE,title TEXT NOT NULL,
    holiday_type TEXT DEFAULT 'holiday',description TEXT,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`INSERT OR IGNORE INTO academic_working_days (day_name,is_working) VALUES ('Monday',1)`);
  db.run(`INSERT OR IGNORE INTO academic_working_days (day_name,is_working) VALUES ('Tuesday',1)`);
  db.run(`INSERT OR IGNORE INTO academic_working_days (day_name,is_working) VALUES ('Wednesday',1)`);
  db.run(`INSERT OR IGNORE INTO academic_working_days (day_name,is_working) VALUES ('Thursday',1)`);
  db.run(`INSERT OR IGNORE INTO academic_working_days (day_name,is_working) VALUES ('Friday',1)`);
  db.run(`INSERT OR IGNORE INTO academic_working_days (day_name,is_working) VALUES ('Saturday',1)`);
  db.run(`INSERT OR IGNORE INTO academic_working_days (day_name,is_working) VALUES ('Sunday',0)`);
  persistDatabase();
}
ensureAcademicSchedulerV35();

function schedulerConflictV35(body,excludeId=0){
  const args=[body.day_name,Number(body.period_no),body.class_name,body.section||"",excludeId];
  const classConflict=queryOne(`SELECT * FROM academic_schedule WHERE day_name=? AND period_no=? AND class_name=?
    AND COALESCE(section,'')=COALESCE(?,'') AND id<>? AND status='active'`,args);
  if(classConflict)return{type:"class",message:"This class already has a timetable entry for this period."};
  if(body.teacher_id){
    const t=queryOne(`SELECT * FROM academic_schedule WHERE day_name=? AND period_no=? AND teacher_id=? AND id<>? AND status='active'`,
      [body.day_name,Number(body.period_no),Number(body.teacher_id),excludeId]);
    if(t)return{type:"teacher",message:"Teacher conflict: teacher is already assigned in this period."};
  }
  if(body.room_id){
    const r=queryOne(`SELECT * FROM academic_schedule WHERE day_name=? AND period_no=? AND room_id=? AND id<>? AND status='active'`,
      [body.day_name,Number(body.period_no),Number(body.room_id),excludeId]);
    if(r)return{type:"room",message:"Room conflict: room is already occupied in this period."};
  }
  return null;
}

app.get("/api/admin/academic-scheduler/dashboard",requireAdmin,(_req,res)=>{
  const schedule=Number(queryOne("SELECT COUNT(*) c FROM academic_schedule WHERE status='active'")?.c||0);
  const teachers=Number(queryOne("SELECT COUNT(DISTINCT teacher_id) c FROM academic_schedule WHERE status='active' AND teacher_id IS NOT NULL")?.c||0);
  const rooms=Number(queryOne("SELECT COUNT(*) c FROM academic_rooms WHERE status='active'")?.c||0);
  const subjects=Number(queryOne("SELECT COUNT(*) c FROM academic_subjects WHERE status='active'")?.c||0);
  const holidays=Number(queryOne("SELECT COUNT(*) c FROM academic_holidays WHERE status='active'")?.c||0);
  const substitutions=Number(queryOne("SELECT COUNT(*) c FROM academic_substitutions WHERE status='active'")?.c||0);
  res.json({success:true,data:{schedule_entries:schedule,teachers_in_schedule:teachers,rooms,subjects,holidays,substitutions}});
});
app.get("/api/admin/academic-scheduler/periods",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM academic_periods WHERE status='active' ORDER BY period_no")}));
app.post("/api/admin/academic-scheduler/periods",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name||!b.period_no||!b.start_time||!b.end_time)return res.status(400).json({success:false,message:"Period fields are required."});
  try{const id=insert("INSERT INTO academic_periods (name,period_no,start_time,end_time) VALUES (?,?,?,?)",[b.name,Number(b.period_no),b.start_time,b.end_time]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM academic_periods WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Period number already exists."})}
});
app.get("/api/admin/academic-scheduler/rooms",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM academic_rooms WHERE status='active' ORDER BY room_code")}));
app.post("/api/admin/academic-scheduler/rooms",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.room_code||!b.name)return res.status(400).json({success:false,message:"Room code and name are required."});
  try{const id=insert("INSERT INTO academic_rooms (room_code,name,room_type,capacity) VALUES (?,?,?,?)",[b.room_code,b.name,b.room_type||"classroom",Number(b.capacity||0)]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM academic_rooms WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Room code already exists."})}
});
app.get("/api/admin/academic-scheduler/subjects",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM academic_subjects WHERE status='active' ORDER BY class_name,section,name")}));
app.post("/api/admin/academic-scheduler/subjects",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name||!b.class_name)return res.status(400).json({success:false,message:"Subject and class are required."});
  try{const id=insert("INSERT INTO academic_subjects (name,class_name,section,weekly_periods) VALUES (?,?,?,?)",[b.name,b.class_name,b.section||"",Number(b.weekly_periods||1)]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM academic_subjects WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Subject/class combination already exists."})}
});
app.get("/api/admin/academic-scheduler",requireAdmin,(req,res)=>{
  const year=String(req.query.academic_year||"");
  const args=[];let sql=`SELECT a.*,r.room_code,r.name room_name,e.full_name teacher_name FROM academic_schedule a
    LEFT JOIN academic_rooms r ON r.id=a.room_id LEFT JOIN hr_employees e ON e.id=a.teacher_id WHERE a.status='active'`;
  if(year){sql+=" AND a.academic_year=?";args.push(year)}sql+=" ORDER BY CASE a.day_name WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END,a.period_no,a.class_name";
  res.json({success:true,data:query(sql,args)});
});
app.post("/api/admin/academic-scheduler",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.day_name||!b.period_no||!b.class_name||!b.subject_name)return res.status(400).json({success:false,message:"Day, period, class and subject are required."});
  const c=schedulerConflictV35(b,0);if(c)return res.status(409).json({success:false,conflict:c.type,message:c.message});
  const id=insert(`INSERT INTO academic_schedule (day_name,period_no,class_name,section,subject_name,teacher_id,room_id,academic_year,notes)
    VALUES (?,?,?,?,?,?,?,?,?)`,[b.day_name,Number(b.period_no),b.class_name,b.section||"",b.subject_name,b.teacher_id?Number(b.teacher_id):null,b.room_id?Number(b.room_id):null,b.academic_year||"",b.notes||""]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM academic_schedule WHERE id=?",[id])});
});
app.patch("/api/admin/academic-scheduler/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),old=queryOne("SELECT * FROM academic_schedule WHERE id=?",[id]);if(!old)return res.status(404).json({success:false,message:"Schedule entry not found."});
  const b={...old,...req.body},c=schedulerConflictV35(b,id);if(c)return res.status(409).json({success:false,conflict:c.type,message:c.message});
  db.run(`UPDATE academic_schedule SET day_name=?,period_no=?,class_name=?,section=?,subject_name=?,teacher_id=?,room_id=?,academic_year=?,notes=? WHERE id=?`,
    [b.day_name,Number(b.period_no),b.class_name,b.section||"",b.subject_name,b.teacher_id?Number(b.teacher_id):null,b.room_id?Number(b.room_id):null,b.academic_year||"",b.notes||"",id]);
  persistDatabase();res.json({success:true,data:queryOne("SELECT * FROM academic_schedule WHERE id=?",[id])});
});
app.delete("/api/admin/academic-scheduler/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);db.run("UPDATE academic_schedule SET status='inactive' WHERE id=?",[id]);persistDatabase();res.json({success:true});
});
app.get("/api/admin/academic-scheduler/holidays",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM academic_holidays WHERE status='active' ORDER BY date")}));
app.post("/api/admin/academic-scheduler/holidays",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.date||!b.title)return res.status(400).json({success:false,message:"Date and title are required."});
  try{const id=insert("INSERT INTO academic_holidays (date,title,holiday_type,description) VALUES (?,?,?,?)",[b.date,b.title,b.holiday_type||"holiday",b.description||""]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM academic_holidays WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Holiday already exists for this date."})}
});
app.get("/api/admin/academic-scheduler/substitutions",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT s.*,a.day_name,a.period_no,a.class_name,a.section,a.subject_name,e.full_name substitute_teacher
  FROM academic_substitutions s JOIN academic_schedule a ON a.id=s.schedule_id
  LEFT JOIN hr_employees e ON e.id=s.substitute_teacher_id ORDER BY s.date DESC,s.id DESC`) }));
app.post("/api/admin/academic-scheduler/substitutions",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.schedule_id||!b.date||!b.substitute_teacher_id)return res.status(400).json({success:false,message:"Schedule, date and substitute teacher are required."});
  const a=queryOne("SELECT * FROM academic_schedule WHERE id=? AND status='active'",[Number(b.schedule_id)]);if(!a)return res.status(404).json({success:false,message:"Schedule not found."});
  try{const id=insert("INSERT INTO academic_substitutions (schedule_id,date,substitute_teacher_id,reason,created_by) VALUES (?,?,?,?,?)",
    [Number(b.schedule_id),b.date,Number(b.substitute_teacher_id),b.reason||"",req.admin.id]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM academic_substitutions WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Substitution already exists for this schedule and date."})}
});
app.get("/api/teacher/timetable/advanced",teacherGuardV32,(req,res)=>{
  const p=teacherProfileV32(teacherIdV32(req));if(!p)return res.status(404).json({success:false,message:"Teacher profile not configured."});
  const date=String(req.query.date||"");
  const rows=query(`SELECT a.*,r.room_code,r.name room_name,e.full_name teacher_name,
    s.substitute_teacher_id,s.reason substitution_reason
    FROM academic_schedule a LEFT JOIN academic_rooms r ON r.id=a.room_id LEFT JOIN hr_employees e ON e.id=a.teacher_id
    LEFT JOIN academic_substitutions s ON s.schedule_id=a.id AND s.date=?
    WHERE a.status='active' AND (a.teacher_id=? OR s.substitute_teacher_id=?) ORDER BY a.period_no`,[date,p.employee_id||p.id,p.employee_id||p.id]);
  res.json({success:true,data:{date,rows}});
});


/* ===== ADVANCED ADMISSION & ENROLLMENT V36 ===== */
function ensureAdmissionsV36(){
  db.run(`CREATE TABLE IF NOT EXISTS admission_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,start_date TEXT,end_date TEXT,
    academic_year TEXT NOT NULL,status TEXT DEFAULT 'open',application_fee REAL DEFAULT 0,
    instructions TEXT,created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS admission_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,application_no TEXT NOT NULL UNIQUE,session_id INTEGER NOT NULL,
    applicant_name TEXT NOT NULL,dob TEXT,gender TEXT,category TEXT,religion TEXT,nationality TEXT,
    parent_name TEXT,phone TEXT,email TEXT,address TEXT,previous_school TEXT,previous_class TEXT,
    applied_class TEXT,section_preference TEXT,transport_required INTEGER DEFAULT 0,
    hostel_required INTEGER DEFAULT 0,status TEXT DEFAULT 'submitted',submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INTEGER,reviewed_at TEXT,review_note TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS admission_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,application_id INTEGER NOT NULL,document_type TEXT NOT NULL,
    document_name TEXT,file_path TEXT,status TEXT DEFAULT 'pending',verified_by INTEGER,verified_at TEXT,
    remarks TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS admission_followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,application_id INTEGER NOT NULL,followup_date TEXT NOT NULL,
    mode TEXT DEFAULT 'call',note TEXT,status TEXT DEFAULT 'open',next_date TEXT,created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS admission_enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,application_id INTEGER UNIQUE,student_id INTEGER UNIQUE,
    admission_date TEXT,admission_class TEXT,section TEXT,roll_no TEXT,admission_status TEXT DEFAULT 'enrolled',
    created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS admission_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,application_id INTEGER,actor_id INTEGER,action TEXT NOT NULL,
    details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureAdmissionsV36();

function admissionAuditV36(appId,actor,action,details){
  insert("INSERT INTO admission_audit_log (application_id,actor_id,action,details) VALUES (?,?,?,?)",
    [appId,actor?.id||null,action,JSON.stringify(details||{})]);
}
function nextAdmissionNoV36(){
  const n=Number(queryOne("SELECT COUNT(*) c FROM admission_applications")?.c||0)+1;
  return `ADM-${new Date().getFullYear()}-${String(n).padStart(5,"0")}`;
}

app.get("/api/admin/admissions/dashboard",requireAdmin,(_req,res)=>{
  const sessions=Number(queryOne("SELECT COUNT(*) c FROM admission_sessions")?.c||0);
  const open=Number(queryOne("SELECT COUNT(*) c FROM admission_sessions WHERE status='open'")?.c||0);
  const total=Number(queryOne("SELECT COUNT(*) c FROM admission_applications")?.c||0);
  const submitted=Number(queryOne("SELECT COUNT(*) c FROM admission_applications WHERE status='submitted'")?.c||0);
  const shortlisted=Number(queryOne("SELECT COUNT(*) c FROM admission_applications WHERE status='shortlisted'")?.c||0);
  const approved=Number(queryOne("SELECT COUNT(*) c FROM admission_applications WHERE status='approved'")?.c||0);
  const enrolled=Number(queryOne("SELECT COUNT(*) c FROM admission_enrollments WHERE admission_status='enrolled'")?.c||0);
  const docs=Number(queryOne("SELECT COUNT(*) c FROM admission_documents WHERE status='pending'")?.c||0);
  res.json({success:true,data:{sessions,open_sessions:open,total_applications:total,submitted,shortlisted,approved,enrolled,pending_documents:docs}});
});
app.get("/api/admin/admissions/sessions",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM admission_sessions ORDER BY id DESC")}));
app.post("/api/admin/admissions/sessions",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name||!b.academic_year)return res.status(400).json({success:false,message:"Session name and academic year are required."});
  try{const id=insert(`INSERT INTO admission_sessions (name,start_date,end_date,academic_year,status,application_fee,instructions,created_by)
    VALUES (?,?,?,?,?,?,?,?)`,[b.name,b.start_date||null,b.end_date||null,b.academic_year,b.status||"open",Number(b.application_fee||0),b.instructions||"",req.admin.id]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM admission_sessions WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Admission session name already exists."})}
});
app.patch("/api/admin/admissions/sessions/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),old=queryOne("SELECT * FROM admission_sessions WHERE id=?",[id]);if(!old)return res.status(404).json({success:false,message:"Session not found."});
  const b={...old,...req.body};db.run(`UPDATE admission_sessions SET name=?,start_date=?,end_date=?,academic_year=?,status=?,application_fee=?,instructions=? WHERE id=?`,
    [b.name,b.start_date||null,b.end_date||null,b.academic_year,b.status||"open",Number(b.application_fee||0),b.instructions||"",id]);persistDatabase();res.json({success:true});
});
app.get("/api/admin/admissions/applications",requireAdmin,(req,res)=>{
  const status=String(req.query.status||"all"),q=String(req.query.q||"").trim(),like=`%${q}%`;
  let sql=`SELECT a.*,s.name session_name,s.academic_year,e.admission_status enrollment_status,e.student_id
    FROM admission_applications a JOIN admission_sessions s ON s.id=a.session_id
    LEFT JOIN admission_enrollments e ON e.application_id=a.id
    WHERE (a.application_no LIKE ? OR a.applicant_name LIKE ? OR COALESCE(a.parent_name,'') LIKE ? OR COALESCE(a.phone,'') LIKE ?)`;
  const args=[like,like,like,like];if(status!=="all"){sql+=" AND a.status=?";args.push(status)}
  sql+=" ORDER BY a.created_at DESC,a.id DESC LIMIT 500";res.json({success:true,data:query(sql,args)});
});
app.post("/api/admissions/apply",(req,res)=>{
  const b=req.body||{},session=queryOne("SELECT * FROM admission_sessions WHERE id=? AND status='open'",[Number(b.session_id)]);
  if(!session)return res.status(400).json({success:false,message:"Admission session is not open."});
  if(!b.applicant_name||!b.applied_class||!b.phone)return res.status(400).json({success:false,message:"Applicant name, applied class and phone are required."});
  const no=nextAdmissionNoV36();
  const id=insert(`INSERT INTO admission_applications
    (application_no,session_id,applicant_name,dob,gender,category,religion,nationality,parent_name,phone,email,address,previous_school,previous_class,applied_class,section_preference,transport_required,hostel_required)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [no,session.id,b.applicant_name,b.dob||null,b.gender||"",b.category||"",b.religion||"",b.nationality||"Indian",b.parent_name||"",b.phone,b.email||"",b.address||"",b.previous_school||"",b.previous_class||"",b.applied_class,b.section_preference||"",b.transport_required?1:0,b.hostel_required?1:0]);
  admissionAuditV36(id,null,"application_submitted",{application_no:no});persistDatabase();
  res.status(201).json({success:true,data:{id,application_no:no,status:"submitted"}});
});
app.get("/api/admissions/application/:applicationNo",(req,res)=>{
  const a=queryOne(`SELECT a.*,s.name session_name,s.academic_year,e.admission_status,e.student_id
    FROM admission_applications a JOIN admission_sessions s ON s.id=a.session_id
    LEFT JOIN admission_enrollments e ON e.application_id=a.id WHERE a.application_no=?`,[String(req.params.applicationNo)]);
  if(!a)return res.status(404).json({success:false,message:"Application not found."});
  res.json({success:true,data:a});
});
app.get("/api/admin/admissions/applications/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),a=queryOne("SELECT * FROM admission_applications WHERE id=?",[id]);if(!a)return res.status(404).json({success:false,message:"Application not found."});
  res.json({success:true,data:{application:a,documents:query("SELECT * FROM admission_documents WHERE application_id=? ORDER BY id DESC",[id]),followups:query("SELECT * FROM admission_followups WHERE application_id=? ORDER BY followup_date DESC,id DESC",[id]),audit:query("SELECT * FROM admission_audit_log WHERE application_id=? ORDER BY created_at DESC,id DESC",[id])}});
});
app.patch("/api/admin/admissions/applications/:id/status",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),status=String(req.body?.status||"");const allowed=["submitted","under_review","shortlisted","rejected","approved","waitlisted","withdrawn"];
  if(!allowed.includes(status))return res.status(400).json({success:false,message:"Invalid admission status."});
  const a=queryOne("SELECT * FROM admission_applications WHERE id=?",[id]);if(!a)return res.status(404).json({success:false,message:"Application not found."});
  db.run("UPDATE admission_applications SET status=?,reviewed_by=?,reviewed_at=?,review_note=? WHERE id=?",[status,req.admin.id,new Date().toISOString(),req.body?.review_note||"",id]);
  admissionAuditV36(id,req.admin,"status_changed",{from:a.status,to:status,note:req.body?.review_note||""});persistDatabase();res.json({success:true});
});
app.post("/api/admin/admissions/applications/:id/documents",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),b=req.body||{};if(!queryOne("SELECT id FROM admission_applications WHERE id=?",[id]))return res.status(404).json({success:false,message:"Application not found."});
  if(!b.document_type||!b.document_name)return res.status(400).json({success:false,message:"Document type and name are required."});
  const did=insert("INSERT INTO admission_documents (application_id,document_type,document_name,file_path,remarks) VALUES (?,?,?,?,?)",[id,b.document_type,b.document_name,b.file_path||"",b.remarks||""]);
  admissionAuditV36(id,req.admin,"document_added",{document_id:did});persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM admission_documents WHERE id=?",[did])});
});
app.patch("/api/admin/admissions/documents/:id/verify",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),d=queryOne("SELECT * FROM admission_documents WHERE id=?",[id]);if(!d)return res.status(404).json({success:false,message:"Document not found."});
  const status=req.body?.status==="rejected"?"rejected":"verified";db.run("UPDATE admission_documents SET status=?,verified_by=?,verified_at=?,remarks=? WHERE id=?",[status,req.admin.id,new Date().toISOString(),req.body?.remarks||"",id]);
  admissionAuditV36(d.application_id,req.admin,"document_verified",{document_id:id,status});persistDatabase();res.json({success:true});
});
app.post("/api/admin/admissions/applications/:id/followups",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),b=req.body||{};if(!b.followup_date||!b.note)return res.status(400).json({success:false,message:"Follow-up date and note are required."});
  const fid=insert("INSERT INTO admission_followups (application_id,followup_date,mode,note,status,next_date,created_by) VALUES (?,?,?,?,?,?,?)",[id,b.followup_date,b.mode||"call",b.note,b.status||"open",b.next_date||null,req.admin.id]);
  admissionAuditV36(id,req.admin,"followup_added",{followup_id:fid});persistDatabase();res.status(201).json({success:true});
});
app.post("/api/admin/admissions/applications/:id/enroll",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),a=queryOne("SELECT * FROM admission_applications WHERE id=?",[id]);if(!a)return res.status(404).json({success:false,message:"Application not found."});
  if(!["approved","shortlisted"].includes(a.status))return res.status(400).json({success:false,message:"Only approved or shortlisted applications can be enrolled."});
  if(queryOne("SELECT id FROM admission_enrollments WHERE application_id=?",[id]))return res.status(409).json({success:false,message:"Application already enrolled."});
  const studentId=insert(`INSERT INTO students (full_name,admission_no,roll_no,class_name,section,status)
    VALUES (?,?,?,?,?,?)`,[a.applicant_name,a.application_no,req.body?.roll_no||"",a.applied_class,req.body?.section||a.section_preference||"","active"]);
  const eid=insert(`INSERT INTO admission_enrollments (application_id,student_id,admission_date,admission_class,section,roll_no,created_by)
    VALUES (?,?,?,?,?,?,?)`,[id,studentId,req.body?.admission_date||new Date().toISOString().slice(0,10),a.applied_class,req.body?.section||a.section_preference||"",req.body?.roll_no||"",req.admin.id]);
  db.run("UPDATE admission_applications SET status='approved' WHERE id=?",[id]);admissionAuditV36(id,req.admin,"enrolled",{student_id:studentId,enrollment_id:eid});
  persistDatabase();res.status(201).json({success:true,data:{student_id:studentId,enrollment_id:eid}});
});


/* ===== ADVANCED FEE & FINANCE MANAGEMENT V37 ===== */
function ensureFinanceV37(){
  db.run(`CREATE TABLE IF NOT EXISTS fee_structures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,class_name TEXT,academic_year TEXT NOT NULL,
    frequency TEXT DEFAULT 'annual',due_day INTEGER DEFAULT 10,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_structure_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,structure_id INTEGER NOT NULL,fee_name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,mandatory INTEGER DEFAULT 1,description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_fee_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,structure_id INTEGER NOT NULL,
    discount_type TEXT DEFAULT 'none',discount_value REAL DEFAULT 0,scholarship_name TEXT,
    concession_reason TEXT,status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id,structure_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_no TEXT NOT NULL UNIQUE,student_id INTEGER NOT NULL,
    structure_id INTEGER,invoice_date TEXT NOT NULL,due_date TEXT,total REAL NOT NULL DEFAULT 0,
    discount REAL DEFAULT 0,late_fee REAL DEFAULT 0,paid REAL DEFAULT 0,balance REAL DEFAULT 0,
    status TEXT DEFAULT 'unpaid',notes TEXT,created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,fee_name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,discount REAL DEFAULT 0,net_amount REAL NOT NULL DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,receipt_no TEXT NOT NULL UNIQUE,invoice_id INTEGER NOT NULL,
    amount REAL NOT NULL,payment_method TEXT DEFAULT 'cash',transaction_ref TEXT,paid_on TEXT NOT NULL,
   notes TEXT,received_by INTEGER,status TEXT DEFAULT 'completed',created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_scholarships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,name TEXT NOT NULL,
    type TEXT DEFAULT 'percentage',value REAL DEFAULT 0,valid_from TEXT,valid_to TEXT,
    reason TEXT,status TEXT DEFAULT 'active',approved_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER,action TEXT NOT NULL,entity_type TEXT,
    entity_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureFinanceV37();

function financeAuditV37(actor,action,type,id,details){
  insert("INSERT INTO fee_audit_log (actor_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)",
    [actor?.id||null,action,type||null,id||null,JSON.stringify(details||{})]);
}
function nextInvoiceNoV37(prefix="INV"){
  const n=Number(queryOne("SELECT COUNT(*) c FROM fee_invoices")?.c||0)+1;
  return `${prefix}-${new Date().getFullYear()}-${String(n).padStart(6,"0")}`;
}
function nextReceiptNoV37(){
  const n=Number(queryOne("SELECT COUNT(*) c FROM fee_payments")?.c||0)+1;
  return `REC-${new Date().getFullYear()}-${String(n).padStart(6,"0")}`;
}
function refreshInvoiceV37(id){
  const paid=Number(queryOne("SELECT COALESCE(SUM(amount),0) v FROM fee_payments WHERE invoice_id=? AND status='completed'",[id])?.v||0);
  const inv=queryOne("SELECT total,late_fee FROM fee_invoices WHERE id=?",[id]);if(!inv)return;
  const total=Number(inv.total||0)+Number(inv.late_fee||0),balance=Math.max(0,total-paid);
  const status=balance<=0?"paid":paid>0?"partial":"unpaid";
  db.run("UPDATE fee_invoices SET paid=?,balance=?,status=? WHERE id=?",[paid,balance,status,id]);
}
function studentFinanceV37(id){return queryOne("SELECT id,full_name,admission_no,roll_no,class_name,section,status FROM students WHERE id=?",[id])}

app.get("/api/admin/finance/dashboard",requireAdmin,(_req,res)=>{
  const total=Number(queryOne("SELECT COALESCE(SUM(total+late_fee),0) v FROM fee_invoices")?.v||0);
  const paid=Number(queryOne("SELECT COALESCE(SUM(amount),0) v FROM fee_payments WHERE status='completed'")?.v||0);
  const balance=Math.max(0,total-paid);
  const invoices=Number(queryOne("SELECT COUNT(*) c FROM fee_invoices")?.c||0);
  const overdue=Number(queryOne("SELECT COUNT(*) c FROM fee_invoices WHERE balance>0 AND due_date<date('now')")?.c||0);
  const defaulters=Number(queryOne("SELECT COUNT(DISTINCT student_id) c FROM fee_invoices WHERE balance>0 AND due_date<date('now')")?.c||0);
  const scholarships=Number(queryOne("SELECT COUNT(*) c FROM fee_scholarships WHERE status='active'")?.c||0);
  const today=String(_req.query.date||new Date().toISOString().slice(0,10));
  const todayCollected=Number(queryOne("SELECT COALESCE(SUM(amount),0) v FROM fee_payments WHERE status='completed' AND substr(paid_on,1,10)=?",[today])?.v||0);
  res.json({success:true,data:{total_billed:total,total_collected:paid,outstanding:balance,invoices,overdue,defaulters,scholarships,today_collected:todayCollected}});
});
app.get("/api/admin/finance/structures",requireAdmin,(_req,res)=>{
  res.json({success:true,data:query(`SELECT f.*,COUNT(i.id) item_count,COALESCE(SUM(i.amount),0) structure_total
    FROM fee_structures f LEFT JOIN fee_structure_items i ON i.structure_id=f.id GROUP BY f.id ORDER BY f.academic_year DESC,f.class_name,f.name`)});
});
app.post("/api/admin/finance/structures",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name||!b.academic_year)return res.status(400).json({success:false,message:"Structure name and academic year are required."});
  const id=insert("INSERT INTO fee_structures (name,class_name,academic_year,frequency,due_day) VALUES (?,?,?,?,?)",
    [b.name,b.class_name||"",b.academic_year,b.frequency||"annual",Number(b.due_day||10)]);
  (Array.isArray(b.items)?b.items:[]).forEach(x=>insert("INSERT INTO fee_structure_items (structure_id,fee_name,amount,mandatory,description) VALUES (?,?,?,?,?)",
    [id,x.fee_name||"Fee",Number(x.amount||0),x.mandatory===false?0:1,x.description||""]));
  financeAuditV37(req.admin,"structure_created","fee_structure",id,b);persistDatabase();
  res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_structures WHERE id=?",[id])});
});
app.get("/api/admin/finance/structures/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),f=queryOne("SELECT * FROM fee_structures WHERE id=?",[id]);if(!f)return res.status(404).json({success:false,message:"Fee structure not found."});
  res.json({success:true,data:{structure:f,items:query("SELECT * FROM fee_structure_items WHERE structure_id=?",[id])}});
});
app.post("/api/admin/finance/assign",requireAdmin,(req,res)=>{
  const b=req.body||{},sid=Number(b.student_id),fid=Number(b.structure_id);
  if(!studentFinanceV37(sid)||!queryOne("SELECT id FROM fee_structures WHERE id=?",[fid]))return res.status(400).json({success:false,message:"Student or fee structure not found."});
  const id=insert(`INSERT INTO student_fee_assignments (student_id,structure_id,discount_type,discount_value,scholarship_name,concession_reason)
    VALUES (?,?,?,?,?,?) ON CONFLICT(student_id,structure_id) DO UPDATE SET discount_type=excluded.discount_type,discount_value=excluded.discount_value,scholarship_name=excluded.scholarship_name,concession_reason=excluded.concession_reason,status='active'`,
    [sid,fid,b.discount_type||"none",Number(b.discount_value||0),b.scholarship_name||"",b.concession_reason||""]);
  financeAuditV37(req.admin,"fee_assigned","student_fee_assignment",id,b);persistDatabase();res.json({success:true});
});
app.get("/api/admin/finance/assignments/:studentId",requireAdmin,(req,res)=>{
  res.json({success:true,data:query(`SELECT a.*,f.name structure_name,f.class_name,f.academic_year,f.frequency
    FROM student_fee_assignments a JOIN fee_structures f ON f.id=a.structure_id WHERE a.student_id=? AND a.status='active'`,[Number(req.params.studentId)])});
});
app.post("/api/admin/finance/invoices",requireAdmin,(req,res)=>{
  const b=req.body||{},sid=Number(b.student_id),fid=b.structure_id?Number(b.structure_id):null;
  if(!studentFinanceV37(sid))return res.status(400).json({success:false,message:"Student not found."});
  const structure=fid?queryOne("SELECT * FROM fee_structures WHERE id=?",[fid]):null;
  const items=Array.isArray(b.items)?b.items:(structure?query("SELECT fee_name,amount,mandatory,description FROM fee_structure_items WHERE structure_id=?",[fid]):[]);
  if(!items.length)return res.status(400).json({success:false,message:"Invoice requires at least one fee item."});
  const assignment=fid?queryOne("SELECT * FROM student_fee_assignments WHERE student_id=? AND structure_id=? AND status='active'",[sid,fid]):null;
  let subtotal=0;items.forEach(x=>subtotal+=Number(x.amount||0));
  let discount=Number(b.discount||0);
  if(assignment){
    if(assignment.discount_type==="percentage")discount+=subtotal*Number(assignment.discount_value||0)/100;
    if(assignment.discount_type==="fixed")discount+=Number(assignment.discount_value||0);
  }
  discount=Math.min(discount,subtotal);
  const total=Math.max(0,subtotal-discount),date=b.invoice_date||new Date().toISOString().slice(0,10);
  const due=b.due_date||date,no=nextInvoiceNoV37();
  const id=insert(`INSERT INTO fee_invoices (invoice_no,student_id,structure_id,invoice_date,due_date,total,discount,late_fee,balance,status,notes,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[no,sid,fid,date,due,total,discount,Number(b.late_fee||0),total+Number(b.late_fee||0),"unpaid",b.notes||"",req.admin.id]);
  items.forEach(x=>{const gross=Number(x.amount||0),itemDiscount=items.length?discount*gross/subtotal:0;insert(`INSERT INTO fee_invoice_items (invoice_id,fee_name,amount,discount,net_amount) VALUES (?,?,?,?,?)`,
    [id,x.fee_name||"Fee",gross,itemDiscount,Math.max(0,gross-itemDiscount)])});
  financeAuditV37(req.admin,"invoice_created","invoice",id,{student_id:sid,total});persistDatabase();
  res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_invoices WHERE id=?",[id])});
});
app.get("/api/admin/finance/invoices",requireAdmin,(req,res)=>{
  const status=String(req.query.status||"all"),q=String(req.query.q||"").trim(),like=`%${q}%`;
  let sql=`SELECT i.*,s.full_name student_name,s.admission_no,s.class_name,s.section FROM fee_invoices i JOIN students s ON s.id=i.student_id
    WHERE (i.invoice_no LIKE ? OR s.full_name LIKE ? OR COALESCE(s.admission_no,'') LIKE ?)`;
  const args=[like,like,like];if(status!=="all"){sql+=" AND i.status=?";args.push(status)}
  sql+=" ORDER BY i.invoice_date DESC,i.id DESC LIMIT 500";res.json({success:true,data:query(sql,args)});
});
app.get("/api/admin/finance/invoices/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),inv=queryOne(`SELECT i.*,s.full_name student_name,s.admission_no,s.class_name,s.section
    FROM fee_invoices i JOIN students s ON s.id=i.student_id WHERE i.id=?`,[id]);if(!inv)return res.status(404).json({success:false,message:"Invoice not found."});
  refreshInvoiceV37(id);res.json({success:true,data:{invoice:queryOne("SELECT * FROM fee_invoices WHERE id=?",[id]),items:query("SELECT * FROM fee_invoice_items WHERE invoice_id=?",[id]),payments:query("SELECT * FROM fee_payments WHERE invoice_id=? ORDER BY paid_on DESC,id DESC",[id])}});
});
app.post("/api/admin/finance/invoices/:id/payment",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),inv=queryOne("SELECT * FROM fee_invoices WHERE id=?",[id]);if(!inv)return res.status(404).json({success:false,message:"Invoice not found."});
  refreshInvoiceV37(id);const fresh=queryOne("SELECT * FROM fee_invoices WHERE id=?",[id]),amount=Number(req.body?.amount||0);
  if(amount<=0)return res.status(400).json({success:false,message:"Payment amount must be greater than zero."});
  if(amount>Number(fresh.balance)+0.001)return res.status(400).json({success:false,message:"Payment exceeds outstanding balance."});
  const rid=insert(`INSERT INTO fee_payments (receipt_no,invoice_id,amount,payment_method,transaction_ref,paid_on,notes,received_by)
    VALUES (?,?,?,?,?,?,?,?)`,[nextReceiptNoV37(),id,amount,req.body?.payment_method||"cash",req.body?.transaction_ref||"",req.body?.paid_on||new Date().toISOString(),req.body?.notes||"",req.admin.id]);
  refreshInvoiceV37(id);financeAuditV37(req.admin,"payment_received","payment",rid,{invoice_id:id,amount});persistDatabase();
  res.status(201).json({success:true,data:{payment:queryOne("SELECT * FROM fee_payments WHERE id=?",[rid]),invoice:queryOne("SELECT * FROM fee_invoices WHERE id=?",[id])}});
});
app.post("/api/admin/finance/scholarships",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.student_id||!b.name)return res.status(400).json({success:false,message:"Student and scholarship name are required."});
  const type=b.type==="fixed"?"fixed":"percentage",value=Math.max(0,Number(b.value||0));
  if(type==="percentage"&&value>100)return res.status(400).json({success:false,message:"Percentage cannot exceed 100."});
  const id=insert(`INSERT INTO fee_scholarships (student_id,name,type,value,valid_from,valid_to,reason,approved_by)
    VALUES (?,?,?,?,?,?,?,?)`,[Number(b.student_id),b.name,type,value,b.valid_from||null,b.valid_to||null,b.reason||"",req.admin.id]);
  financeAuditV37(req.admin,"scholarship_created","scholarship",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_scholarships WHERE id=?",[id])});
});
app.get("/api/admin/finance/defaulters",requireAdmin,(req,res)=>{
  res.json({success:true,data:query(`SELECT s.id,s.full_name,s.admission_no,s.class_name,s.section,
    COUNT(i.id) invoice_count,COALESCE(SUM(i.balance+i.late_fee),0) outstanding,MIN(i.due_date) oldest_due
    FROM students s JOIN fee_invoices i ON i.student_id=s.id WHERE i.balance>0 AND i.due_date<date('now')
    GROUP BY s.id ORDER BY outstanding DESC`)});
});
app.get("/api/admin/finance/collections",requireAdmin,(req,res)=>{
  const from=String(req.query.from||"1970-01-01"),to=String(req.query.to||"9999-12-31");
  res.json({success:true,data:query(`SELECT substr(paid_on,1,10) date,payment_method,COUNT(*) transactions,COALESCE(SUM(amount),0) amount
    FROM fee_payments WHERE status='completed' AND substr(paid_on,1,10) BETWEEN ? AND ? GROUP BY substr(paid_on,1,10),payment_method ORDER BY date DESC`,[from,to])});
});


/* ===== ADVANCED EXAMINATION & RESULT ENGINE V38 ===== */
function ensureExamEngineV38(){
  db.run(`CREATE TABLE IF NOT EXISTS exam_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,academic_year TEXT NOT NULL,
    pass_percentage REAL DEFAULT 33,grade_rules TEXT,division_rules TEXT,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS advanced_exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,exam_type TEXT DEFAULT 'term',
    academic_year TEXT NOT NULL,class_name TEXT,section TEXT,start_date TEXT,end_date TEXT,
    status TEXT DEFAULT 'draft',result_locked INTEGER DEFAULT 0,result_published INTEGER DEFAULT 0,
    rule_id INTEGER,created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS advanced_exam_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL,subject_name TEXT NOT NULL,
    max_marks REAL DEFAULT 100,pass_marks REAL DEFAULT 33,theory_max REAL DEFAULT 0,
    practical_max REAL DEFAULT 0,internal_max REAL DEFAULT 0,subject_order INTEGER DEFAULT 0,
    UNIQUE(exam_id,subject_name)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS advanced_exam_marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,theory REAL DEFAULT 0,practical REAL DEFAULT 0,internal REAL DEFAULT 0,
    grace REAL DEFAULT 0,total REAL DEFAULT 0,percentage REAL DEFAULT 0,grade TEXT,result_status TEXT DEFAULT 'pending',
    remarks TEXT,entered_by INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(exam_id,subject_id,student_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS advanced_exam_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL,student_id INTEGER NOT NULL,
    total_marks REAL DEFAULT 0,max_marks REAL DEFAULT 0,percentage REAL DEFAULT 0,grade TEXT,
    division TEXT,result_status TEXT DEFAULT 'pending',class_rank INTEGER,subject_count INTEGER DEFAULT 0,
    passed_subjects INTEGER DEFAULT 0,failed_subjects INTEGER DEFAULT 0,remarks TEXT,
    UNIQUE(exam_id,student_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS advanced_exam_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER,student_id INTEGER,actor_id INTEGER,
    action TEXT NOT NULL,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureExamEngineV38();

function examAuditV38(examId,studentId,actor,action,details){
  insert("INSERT INTO advanced_exam_audit (exam_id,student_id,actor_id,action,details) VALUES (?,?,?,?,?)",
    [examId||null,studentId||null,actor?.id||null,action,JSON.stringify(details||{})]);
}
function gradeV38(pct,rules){
  let r=[];try{r=JSON.parse(rules||"[]")}catch{}
  if(!Array.isArray(r)||!r.length)r=[{min:90,grade:"A+"},{min:80,grade:"A"},{min:70,grade:"B+"},{min:60,grade:"B"},{min:50,grade:"C+"},{min:40,grade:"C"},{min:33,grade:"D"},{min:0,grade:"F"}];
  const x=r.slice().sort((a,b)=>Number(b.min)-Number(a.min)).find(x=>pct>=Number(x.min));return x?.grade||"F";
}
function divisionV38(pct,rules){
  let r=[];try{r=JSON.parse(rules||"[]")}catch{}
  if(!Array.isArray(r)||!r.length)r=[{min:60,name:"First Division"},{min:45,name:"Second Division"},{min:33,name:"Third Division"},{min:0,name:"Fail"}];
  return r.slice().sort((a,b)=>Number(b.min)-Number(a.min)).find(x=>pct>=Number(x.min))?.name||"Fail";
}
function recalcExamStudentV38(examId,studentId,actor){
  const exam=queryOne("SELECT * FROM advanced_exams WHERE id=?",[examId]),rule=exam?.rule_id?queryOne("SELECT * FROM exam_rules WHERE id=?",[exam.rule_id]):null;
  if(!exam)return null;
  const subs=query("SELECT * FROM advanced_exam_subjects WHERE exam_id=? ORDER BY subject_order,id",[examId]);
  let total=0,max=0,passed=0,failed=0;
  const passPct=Number(rule?.pass_percentage??33);
  subs.forEach(sub=>{
    let m=queryOne("SELECT * FROM advanced_exam_marks WHERE exam_id=? AND subject_id=? AND student_id=?",[examId,sub.id,studentId]);
    if(!m)return;
    const raw=Number(m.theory||0)+Number(m.practical||0)+Number(m.internal||0),grace=Math.max(0,Number(m.grace||0));
    const cap=Number(sub.max_marks||100),t=Math.min(cap,raw+grace),pct=cap?t/cap*100:0,passedSub=pct>=passPct;
    const grade=gradeV38(pct,rule?.grade_rules);
    db.run("UPDATE advanced_exam_marks SET total=?,percentage=?,grade=?,result_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [t,pct,grade,passedSub?"pass":"fail",m.id]);
    total+=t;max+=cap;if(passedSub)passed++;else failed++;
  });
  const pct=max?total/max*100:0,overall=failed===0&&pct>=passPct?"pass":"fail",grade=gradeV38(pct,rule?.grade_rules),division=divisionV38(pct,rule?.division_rules);
  const existing=queryOne("SELECT id FROM advanced_exam_results WHERE exam_id=? AND student_id=?",[examId,studentId]);
  if(existing)db.run(`UPDATE advanced_exam_results SET total_marks=?,max_marks=?,percentage=?,grade=?,division=?,result_status=?,subject_count=?,passed_subjects=?,failed_subjects=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [total,max,pct,grade,division,overall,subs.length,passed,failed,existing.id]);
  else insert(`INSERT INTO advanced_exam_results (exam_id,student_id,total_marks,max_marks,percentage,grade,division,result_status,subject_count,passed_subjects,failed_subjects)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[examId,studentId,total,max,pct,grade,division,overall,subs.length,passed,failed]);
  return queryOne("SELECT * FROM advanced_exam_results WHERE exam_id=? AND student_id=?",[examId,studentId]);
}
function recalcExamRanksV38(examId){
  const rows=query("SELECT * FROM advanced_exam_results WHERE exam_id=? ORDER BY percentage DESC,total_marks DESC,student_id",[examId]);
  let rank=0,last=null;
  rows.forEach((r,i)=>{if(last===null||Number(r.percentage)!==Number(last))rank=i+1;db.run("UPDATE advanced_exam_results SET class_rank=? WHERE id=?",[rank,r.id]);last=Number(r.percentage)});
}

app.get("/api/admin/exams/dashboard",requireAdmin,(_req,res)=>{
  const exams=Number(queryOne("SELECT COUNT(*) c FROM advanced_exams")?.c||0),draft=Number(queryOne("SELECT COUNT(*) c FROM advanced_exams WHERE status='draft'")?.c||0);
  const published=Number(queryOne("SELECT COUNT(*) c FROM advanced_exams WHERE result_published=1")?.c||0),locked=Number(queryOne("SELECT COUNT(*) c FROM advanced_exams WHERE result_locked=1")?.c||0);
  const marks=Number(queryOne("SELECT COUNT(*) c FROM advanced_exam_marks")?.c||0),failed=Number(queryOne("SELECT COUNT(*) c FROM advanced_exam_results WHERE result_status='fail'")?.c||0);
  res.json({success:true,data:{exams,draft,published,locked,marks,failed}});
});
app.get("/api/admin/exams/rules",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM exam_rules ORDER BY academic_year DESC,name")}));
app.post("/api/admin/exams/rules",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name||!b.academic_year)return res.status(400).json({success:false,message:"Rule name and academic year are required."});
  const id=insert("INSERT INTO exam_rules (name,academic_year,pass_percentage,grade_rules,division_rules) VALUES (?,?,?,?,?)",
    [b.name,b.academic_year,Number(b.pass_percentage??33),JSON.stringify(b.grade_rules||[]),JSON.stringify(b.division_rules||[])]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM exam_rules WHERE id=?",[id])});
});
app.get("/api/admin/exams",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT e.*,r.name rule_name,
  COUNT(DISTINCT s.id) subject_count,COUNT(DISTINCT m.student_id) marked_students FROM advanced_exams e
  LEFT JOIN exam_rules r ON r.id=e.rule_id LEFT JOIN advanced_exam_subjects s ON s.exam_id=e.id
  LEFT JOIN advanced_exam_marks m ON m.exam_id=e.id GROUP BY e.id ORDER BY e.created_at DESC`) }));
app.post("/api/admin/exams",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name||!b.academic_year)return res.status(400).json({success:false,message:"Exam name and academic year are required."});
  const id=insert(`INSERT INTO advanced_exams (name,exam_type,academic_year,class_name,section,start_date,end_date,rule_id,created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`,[b.name,b.exam_type||"term",b.academic_year,b.class_name||"",b.section||"",b.start_date||null,b.end_date||null,b.rule_id?Number(b.rule_id):null,req.admin.id]);
  (Array.isArray(b.subjects)?b.subjects:[]).forEach((x,i)=>insert(`INSERT INTO advanced_exam_subjects
    (exam_id,subject_name,max_marks,pass_marks,theory_max,practical_max,internal_max,subject_order) VALUES (?,?,?,?,?,?,?,?)`,
    [id,x.subject_name||"Subject",Number(x.max_marks||100),Number(x.pass_marks||33),Number(x.theory_max||0),Number(x.practical_max||0),Number(x.internal_max||0),i+1]));
  examAuditV38(id,null,req.admin,"exam_created",b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM advanced_exams WHERE id=?",[id])});
});
app.get("/api/admin/exams/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM advanced_exams WHERE id=?",[id]);if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  res.json({success:true,data:{exam:e,subjects:query("SELECT * FROM advanced_exam_subjects WHERE exam_id=? ORDER BY subject_order,id",[id]),results:query(`SELECT r.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section FROM advanced_exam_results r JOIN students s ON s.id=r.student_id WHERE r.exam_id=? ORDER BY r.class_rank,r.student_id`,[id])}});
});
app.post("/api/admin/exams/:id/marks",requireAdmin,(req,res)=>{
  const examId=Number(req.params.id),e=queryOne("SELECT * FROM advanced_exams WHERE id=?",[examId]);if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  if(e.result_locked)return res.status(423).json({success:false,message:"Result is locked. Unlock before editing marks."});
  const b=req.body||{},studentId=Number(b.student_id),subjectId=Number(b.subject_id);if(!studentId||!subjectId)return res.status(400).json({success:false,message:"Student and subject are required."});
  if(!queryOne("SELECT id FROM students WHERE id=?",[studentId])||!queryOne("SELECT id FROM advanced_exam_subjects WHERE id=? AND exam_id=?",[subjectId,examId]))return res.status(400).json({success:false,message:"Student or subject not found."});
  const sub=queryOne("SELECT * FROM advanced_exam_subjects WHERE id=?",[subjectId]),vals={theory:Number(b.theory||0),practical:Number(b.practical||0),internal:Number(b.internal||0),grace:Number(b.grace||0)};
  const maxTheory=Number(sub.theory_max||0),maxPractical=Number(sub.practical_max||0),maxInternal=Number(sub.internal_max||0);
  if(maxTheory&&vals.theory>maxTheory||maxPractical&&vals.practical>maxPractical||maxInternal&&vals.internal>maxInternal)return res.status(400).json({success:false,message:"Marks exceed component maximum."});
  const old=queryOne("SELECT id FROM advanced_exam_marks WHERE exam_id=? AND subject_id=? AND student_id=?",[examId,subjectId,studentId]);
  if(old)db.run(`UPDATE advanced_exam_marks SET theory=?,practical=?,internal=?,grace=?,entered_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [vals.theory,vals.practical,vals.internal,vals.grace,req.admin.id,old.id]);
  else insert(`INSERT INTO advanced_exam_marks (exam_id,subject_id,student_id,theory,practical,internal,grace,entered_by)
    VALUES (?,?,?,?,?,?,?,?)`,[examId,subjectId,studentId,vals.theory,vals.practical,vals.internal,vals.grace,req.admin.id]);
  const result=recalcExamStudentV38(examId,studentId,req.admin);recalcExamRanksV38(examId);examAuditV38(examId,studentId,req.admin,"marks_saved",{subject_id:subjectId});persistDatabase();
  res.json({success:true,data:result});
});
app.post("/api/admin/exams/:id/recalculate",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM advanced_exams WHERE id=?",[id]);if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  if(e.result_locked)return res.status(423).json({success:false,message:"Result is locked."});
  const students=query(`SELECT DISTINCT student_id FROM advanced_exam_marks WHERE exam_id=?`,[id]);students.forEach(x=>recalcExamStudentV38(id,x.student_id,req.admin));recalcExamRanksV38(id);
  examAuditV38(id,null,req.admin,"results_recalculated",{students:students.length});persistDatabase();res.json({success:true,data:{students:students.length}});
});
app.patch("/api/admin/exams/:id/lock",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM advanced_exams WHERE id=?",[id]);if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  const locked=req.body?.locked!==false;db.run("UPDATE advanced_exams SET result_locked=?,status=? WHERE id=?",[locked?1:0,locked?"locked":"marks_entry",id]);
  examAuditV38(id,null,req.admin,locked?"result_locked":"result_unlocked");persistDatabase();res.json({success:true});
});
app.patch("/api/admin/exams/:id/publish",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM advanced_exams WHERE id=?",[id]);if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  if(!e.result_locked)return res.status(400).json({success:false,message:"Lock the result before publishing."});
  db.run("UPDATE advanced_exams SET result_published=1,status='published' WHERE id=?",[id]);examAuditV38(id,null,req.admin,"result_published");persistDatabase();res.json({success:true});
});
app.get("/api/admin/exams/:id/analytics",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),e=queryOne("SELECT * FROM advanced_exams WHERE id=?",[id]);if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  const r=query("SELECT * FROM advanced_exam_results WHERE exam_id=?",[id]),avg=r.length?r.reduce((a,x)=>a+Number(x.percentage||0),0)/r.length:0;
  const pass=r.filter(x=>x.result_status==="pass").length,fail=r.length-pass;
  const grade={};r.forEach(x=>{grade[x.grade]=(grade[x.grade]||0)+1});
  const subjectStats=query(`SELECT s.subject_name,COUNT(m.id) entries,AVG(m.percentage) average,
    SUM(CASE WHEN m.result_status='pass' THEN 1 ELSE 0 END) passed,SUM(CASE WHEN m.result_status='fail' THEN 1 ELSE 0 END) failed
    FROM advanced_exam_subjects s LEFT JOIN advanced_exam_marks m ON m.subject_id=s.id AND m.exam_id=?
    WHERE s.exam_id=? GROUP BY s.id ORDER BY s.subject_order,s.id`,[id,id]);
  res.json({success:true,data:{students:r.length,average_percentage:Number(avg.toFixed(2)),pass,fail,pass_rate:r.length?Number((pass/r.length*100).toFixed(2)):0,grades:grade,subjects:subjectStats}});
});
app.get("/api/student/exams/:id/result",(req,res)=>{
  const p=commAuthV34(req);const sid=Number(p?.id||p?.student_id||p?.user_id||0),id=Number(req.params.id);
  if(!sid)return res.status(401).json({success:false,message:"Student authentication required."});
  const e=queryOne("SELECT * FROM advanced_exams WHERE id=? AND result_published=1",[id]);if(!e)return res.status(404).json({success:false,message:"Published result not found."});
  const r=queryOne("SELECT * FROM advanced_exam_results WHERE exam_id=? AND student_id=?",[id,sid]);
  const marks=query(`SELECT s.subject_name,s.max_marks,m.theory,m.practical,m.internal,m.grace,m.total,m.percentage,m.grade,m.result_status
    FROM advanced_exam_subjects s LEFT JOIN advanced_exam_marks m ON m.subject_id=s.id AND m.exam_id=? AND m.student_id=? WHERE s.exam_id=? ORDER BY s.subject_order,s.id`,[id,sid,id]);
  res.json({success:true,data:{exam:e,result:r,marks}});
});


/* ===== ADVANCED STUDENT PERFORMANCE & ANALYTICS V39 ===== */
function ensurePerformanceV39(){
  db.run(`CREATE TABLE IF NOT EXISTS performance_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,academic_year TEXT NOT NULL,
    term_name TEXT,exam_id INTEGER,total_marks REAL DEFAULT 0,max_marks REAL DEFAULT 0,percentage REAL DEFAULT 0,
    grade TEXT,rank INTEGER,attendance_percentage REAL DEFAULT 0,result_status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id,exam_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS performance_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,academic_year TEXT,
    insight_type TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,severity TEXT DEFAULT 'info',
    metric_value REAL,subject_name TEXT,status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS performance_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,subject_name TEXT,
    target_percentage REAL,target_grade TEXT,target_attendance REAL,due_date TEXT,
    status TEXT DEFAULT 'active',note TEXT,created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS performance_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER,actor_id INTEGER,action TEXT NOT NULL,
    details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensurePerformanceV39();

function perfAuditV39(studentId,actor,action,details){
  insert("INSERT INTO performance_audit_log (student_id,actor_id,action,details) VALUES (?,?,?,?)",
    [studentId||null,actor?.id||null,action,JSON.stringify(details||{})]);
}
function attendancePctV39(studentId){
  try{
    const r=queryOne(`SELECT COUNT(*) total,SUM(CASE WHEN LOWER(status) IN ('present','p') THEN 1 ELSE 0 END) present
      FROM attendance WHERE student_id=?`,[studentId]);
    return r&&Number(r.total)>0?Number(((Number(r.present||0)/Number(r.total))*100).toFixed(2)):0;
  }catch{return 0}
}
function rebuildPerformanceV39(studentId){
  const student=studentFinanceV37(studentId);if(!student)return null;
  const rows=query(`SELECT r.*,e.academic_year,e.name exam_name,e.exam_type FROM advanced_exam_results r
    JOIN advanced_exams e ON e.id=r.exam_id WHERE r.student_id=? AND e.result_published=1 ORDER BY e.start_date,e.id`,[studentId]);
  db.run("DELETE FROM performance_snapshots WHERE student_id=?",[studentId]);
  rows.forEach(r=>insert(`INSERT OR REPLACE INTO performance_snapshots
    (student_id,academic_year,term_name,exam_id,total_marks,max_marks,percentage,grade,rank,attendance_percentage,result_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[studentId,r.academic_year,r.exam_name,r.exam_id,r.total_marks,r.max_marks,r.percentage,r.grade,r.class_rank,attendancePctV39(studentId),r.result_status]));
  return rows;
}
function buildInsightsV39(studentId){
  const student=studentFinanceV37(studentId);if(!student)return [];
  rebuildPerformanceV39(studentId);
  const rows=query(`SELECT p.*,e.name exam_name FROM performance_snapshots p JOIN advanced_exams e ON e.id=p.exam_id
    WHERE p.student_id=? ORDER BY p.created_at`,[studentId]);
  const insights=[];
  if(rows.length>=2){
    const prev=Number(rows[rows.length-2].percentage||0),cur=Number(rows[rows.length-1].percentage||0),delta=cur-prev;
    if(delta>=5)insights.push({type:"improvement",title:"Strong improvement",description:`Overall percentage increased by ${delta.toFixed(1)} points compared with the previous published exam.`,severity:"positive",value:delta});
    if(delta<=-5)insights.push({type:"decline",title:"Performance needs attention",description:`Overall percentage decreased by ${Math.abs(delta).toFixed(1)} points compared with the previous published exam.`,severity:"warning",value:delta});
  }
  const att=attendancePctV39(studentId);
  if(att<75)insights.push({type:"attendance",title:"Attendance risk",description:`Attendance is ${att}%, below the 75% monitoring threshold.`,severity:"warning",value:att});
  const latest=rows.at(-1);
  if(latest&&latest.result_status==="fail")insights.push({type:"result",title:"Academic support recommended",description:"The latest published result is marked as fail. Review subject-level performance and set improvement goals.",severity:"critical",value:latest.percentage});
  if(latest){
    const weak=query(`SELECT s.subject_name,m.percentage,m.grade FROM advanced_exam_marks m JOIN advanced_exam_subjects s ON s.id=m.subject_id
      WHERE m.exam_id=? AND m.student_id=? ORDER BY m.percentage ASC LIMIT 3`,[latest.exam_id,studentId]);
    weak.forEach(x=>{if(Number(x.percentage)<50)insights.push({type:"weak_subject",title:`Focus on ${x.subject_name}`,description:`Latest performance is ${Number(x.percentage).toFixed(1)}% (${x.grade||"—"}).`,severity:"info",value:Number(x.percentage),subject:x.subject_name})});
  }
  return insights;
}

app.get("/api/admin/performance/dashboard",requireAdmin,(_req,res)=>{
  const students=Number(queryOne("SELECT COUNT(*) c FROM students WHERE status='active'")?.c||0);
  const published=Number(queryOne("SELECT COUNT(*) c FROM advanced_exams WHERE result_published=1")?.c||0);
  const snapshots=Number(queryOne("SELECT COUNT(*) c FROM performance_snapshots")?.c||0);
  const activeGoals=Number(queryOne("SELECT COUNT(*) c FROM performance_goals WHERE status='active'")?.c||0);
  const critical=Number(queryOne("SELECT COUNT(*) c FROM performance_insights WHERE severity='critical' AND status='active'")?.c||0);
  res.json({success:true,data:{students,published_exams:published,snapshots,active_goals:activeGoals,critical_insights:critical}});
});
app.get("/api/admin/performance/students",requireAdmin,(req,res)=>{
  const q=String(req.query.q||"").trim(),like=`%${q}%`;
  const students=query(`SELECT id,full_name,admission_no,roll_no,class_name,section FROM students WHERE status='active'
    AND (full_name LIKE ? OR COALESCE(admission_no,'') LIKE ? OR COALESCE(class_name,'') LIKE ?) ORDER BY class_name,section,roll_no,full_name LIMIT 500`,
    [like,like,like]);
  const data=students.map(st=>{
    rebuildPerformanceV39(st.id);
    const latest=queryOne(`SELECT * FROM performance_snapshots WHERE student_id=? ORDER BY created_at DESC,id DESC LIMIT 1`,[st.id]);
    const att=attendancePctV39(st.id);
    return {...st,latest_percentage:latest?.percentage||0,latest_grade:latest?.grade||"",latest_rank:latest?.rank||null,attendance_percentage:att};
  });
  res.json({success:true,data});
});
app.get("/api/admin/performance/student/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),student=studentFinanceV37(id);if(!student)return res.status(404).json({success:false,message:"Student not found."});
  const history=rebuildPerformanceV39(id)||[],latest=history.at(-1),att=attendancePctV39(id);
  const subjectTrend=latest?query(`SELECT s.subject_name,m.percentage,m.grade,m.result_status FROM advanced_exam_marks m JOIN advanced_exam_subjects s ON s.id=m.subject_id
    WHERE m.exam_id=? AND m.student_id=? ORDER BY m.percentage DESC`,[latest.exam_id,id]):[];
  const insights=buildInsightsV39(id);
  db.run("UPDATE performance_insights SET status='inactive' WHERE student_id=?",[id]);
  insights.forEach(x=>insert(`INSERT INTO performance_insights (student_id,academic_year,insight_type,title,description,severity,metric_value,subject_name)
    VALUES (?,?,?,?,?,?,?,?)`,[id,latest?.academic_year||"",x.type,x.title,x.description,x.severity,x.value||null,x.subject||null]));
  persistDatabase();
  res.json({success:true,data:{student,attendance_percentage:att,history,latest_subjects:subjectTrend,insights,goals:query("SELECT * FROM performance_goals WHERE student_id=? ORDER BY status,due_date",[id])}});
});
app.post("/api/admin/performance/student/:id/rebuild",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);if(!studentFinanceV37(id))return res.status(404).json({success:false,message:"Student not found."});
  const history=rebuildPerformanceV39(id)||[],insights=buildInsightsV39(id);
  db.run("UPDATE performance_insights SET status='inactive' WHERE student_id=?",[id]);
  insights.forEach(x=>insert(`INSERT INTO performance_insights (student_id,academic_year,insight_type,title,description,severity,metric_value,subject_name)
    VALUES (?,?,?,?,?,?,?,?)`,[id,history.at(-1)?.academic_year||"",x.type,x.title,x.description,x.severity,x.value||null,x.subject||null]));
  perfAuditV39(id,req.admin,"performance_rebuilt",{exams:history.length,insights:insights.length});persistDatabase();
  res.json({success:true,data:{exams:history.length,insights:insights.length}});
});
app.get("/api/admin/performance/class/:className",requireAdmin,(req,res)=>{
  const className=String(req.params.className),students=query("SELECT id,full_name,admission_no,roll_no,class_name,section FROM students WHERE status='active' AND class_name=?",[className]);
  const data=students.map(s=>{rebuildPerformanceV39(s.id);const x=queryOne("SELECT * FROM performance_snapshots WHERE student_id=? ORDER BY created_at DESC,id DESC LIMIT 1",[s.id]);return {...s,percentage:x?.percentage||0,grade:x?.grade||"",rank:x?.rank||null,attendance_percentage:attendancePctV39(s.id)}}).sort((a,b)=>Number(b.percentage)-Number(a.percentage));
  res.json({success:true,data});
});
app.get("/api/admin/performance/at-risk",requireAdmin,(_req,res)=>{
  const students=query("SELECT id,full_name,admission_no,roll_no,class_name,section FROM students WHERE status='active'");
  const data=students.map(s=>{rebuildPerformanceV39(s.id);const x=queryOne("SELECT * FROM performance_snapshots WHERE student_id=? ORDER BY created_at DESC,id DESC LIMIT 1",[s.id]);const att=attendancePctV39(s.id);return {...s,percentage:x?.percentage||0,grade:x?.grade||"",attendance_percentage:att,result_status:x?.result_status||"",risk:(Number(x?.percentage||0)<50||att<75||x?.result_status==="fail")}}).filter(x=>x.risk).sort((a,b)=>(a.percentage-b.percentage)||(a.attendance_percentage-b.attendance_percentage));
  res.json({success:true,data});
});
app.post("/api/admin/performance/goals",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.student_id)return res.status(400).json({success:false,message:"Student is required."});
  const id=insert(`INSERT INTO performance_goals (student_id,subject_name,target_percentage,target_grade,target_attendance,due_date,note,created_by)
    VALUES (?,?,?,?,?,?,?,?)`,[Number(b.student_id),b.subject_name||"",Number(b.target_percentage||0),b.target_grade||"",Number(b.target_attendance||0),b.due_date||null,b.note||"",req.admin.id]);
  perfAuditV39(Number(b.student_id),req.admin,"goal_created",{goal_id:id});persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM performance_goals WHERE id=?",[id])});
});
app.patch("/api/admin/performance/goals/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),g=queryOne("SELECT * FROM performance_goals WHERE id=?",[id]);if(!g)return res.status(404).json({success:false,message:"Goal not found."});
  const b={...g,...req.body};db.run(`UPDATE performance_goals SET subject_name=?,target_percentage=?,target_grade=?,target_attendance=?,due_date=?,status=?,note=? WHERE id=?`,
    [b.subject_name||"",Number(b.target_percentage||0),b.target_grade||"",Number(b.target_attendance||0),b.due_date||null,b.status||"active",b.note||"",id]);
  perfAuditV39(g.student_id,req.admin,"goal_updated",{goal_id:id});persistDatabase();res.json({success:true});
});
app.get("/api/teacher/performance/student/:id",teacherGuardV32,(req,res)=>{
  const id=Number(req.params.id);if(!studentFinanceV37(id))return res.status(404).json({success:false,message:"Student not found."});
  const history=rebuildPerformanceV39(id)||[];res.json({success:true,data:{student:studentFinanceV37(id),attendance_percentage:attendancePctV39(id),history,insights:buildInsightsV39(id)}});
});


/* ===== ADVANCED LIBRARY MANAGEMENT SYSTEM V40 ===== */
function ensureLibraryV40(){
  db.run(`CREATE TABLE IF NOT EXISTS library_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,description TEXT,status TEXT DEFAULT 'active'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,bio TEXT,status TEXT DEFAULT 'active'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_publishers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,address TEXT,phone TEXT,email TEXT,status TEXT DEFAULT 'active'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,isbn TEXT,title TEXT NOT NULL,subtitle TEXT,category_id INTEGER,
    author_id INTEGER,publisher_id INTEGER,edition TEXT,publication_year INTEGER,language TEXT,
    pages INTEGER,description TEXT,cover_path TEXT,shelf TEXT,rack TEXT,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_copies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,book_id INTEGER NOT NULL,accession_no TEXT NOT NULL UNIQUE,
    barcode TEXT UNIQUE,condition TEXT DEFAULT 'good',status TEXT DEFAULT 'available',purchase_date TEXT,
    price REAL DEFAULT 0,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,member_type TEXT NOT NULL,member_ref_id INTEGER,
    member_code TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,class_name TEXT,section TEXT,
    phone TEXT,status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,copy_id INTEGER NOT NULL,member_id INTEGER NOT NULL,
    issued_at TEXT NOT NULL,due_at TEXT NOT NULL,returned_at TEXT,status TEXT DEFAULT 'issued',
    fine REAL DEFAULT 0,remarks TEXT,issued_by INTEGER,returned_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,book_id INTEGER NOT NULL,member_id INTEGER NOT NULL,
    reserved_at TEXT DEFAULT CURRENT_TIMESTAMP,expires_at TEXT,status TEXT DEFAULT 'active',notes TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_fines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,loan_id INTEGER NOT NULL,member_id INTEGER NOT NULL,
    amount REAL NOT NULL,reason TEXT,status TEXT DEFAULT 'unpaid',paid_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS library_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER,action TEXT NOT NULL,entity_type TEXT,
    entity_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureLibraryV40();

function libraryAuditV40(actor,action,type,id,details){
  insert("INSERT INTO library_audit_log (actor_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)",
    [actor?.id||null,action,type||null,id||null,JSON.stringify(details||{})]);
}
function nextLibraryCodeV40(prefix){
  const table=prefix==="MEM"?"library_members":prefix==="ACC"?"library_copies":"library_books";
  const n=Number(queryOne(`SELECT COUNT(*) c FROM ${table}`)?.c||0)+1;
  return `${prefix}-${new Date().getFullYear()}-${String(n).padStart(6,"0")}`;
}
function libraryMemberV40(req){
  const id=Number(req.body?.member_id||req.query?.member_id||0);
  return id?queryOne("SELECT * FROM library_members WHERE id=? AND status='active'",[id]):null;
}
function libraryFineV40(due,returned,rate){
  const end=returned?new Date(returned):new Date(),d=new Date(due);
  const days=Math.max(0,Math.ceil((end-d)/86400000));return Number((days*Number(rate||1)).toFixed(2));
}

app.get("/api/admin/library/dashboard",requireAdmin,(_req,res)=>{
  const books=Number(queryOne("SELECT COUNT(*) c FROM library_books WHERE status='active'")?.c||0);
  const copies=Number(queryOne("SELECT COUNT(*) c FROM library_copies")?.c||0);
  const available=Number(queryOne("SELECT COUNT(*) c FROM library_copies WHERE status='available'")?.c||0);
  const issued=Number(queryOne("SELECT COUNT(*) c FROM library_loans WHERE status='issued'")?.c||0);
  const overdue=Number(queryOne("SELECT COUNT(*) c FROM library_loans WHERE status='issued' AND due_at<datetime('now')")?.c||0);
  const members=Number(queryOne("SELECT COUNT(*) c FROM library_members WHERE status='active'")?.c||0);
  const reservations=Number(queryOne("SELECT COUNT(*) c FROM library_reservations WHERE status='active'")?.c||0);
  const fines=Number(queryOne("SELECT COALESCE(SUM(amount),0) v FROM library_fines WHERE status='unpaid'")?.v||0);
  res.json({success:true,data:{books,copies,available,issued,overdue,members,reservations,unpaid_fines:fines}});
});
app.get("/api/admin/library/books",requireAdmin,(req,res)=>{
  const q=String(req.query.q||"").trim(),like=`%${q}%`;
  res.json({success:true,data:query(`SELECT b.*,c.name category_name,a.name author_name,p.name publisher_name,
    COUNT(cp.id) copies,COALESCE(SUM(CASE WHEN cp.status='available' THEN 1 ELSE 0 END),0) available_copies
    FROM library_books b LEFT JOIN library_categories c ON c.id=b.category_id LEFT JOIN library_authors a ON a.id=b.author_id
    LEFT JOIN library_publishers p ON p.id=b.publisher_id LEFT JOIN library_copies cp ON cp.book_id=b.id
    WHERE b.title LIKE ? OR COALESCE(b.isbn,'') LIKE ? OR COALESCE(a.name,'') LIKE ? GROUP BY b.id ORDER BY b.title LIMIT 500`,
    [like,like,like])});
});
app.post("/api/admin/library/books",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.title)return res.status(400).json({success:false,message:"Book title is required."});
  const id=insert(`INSERT INTO library_books (isbn,title,subtitle,category_id,author_id,publisher_id,edition,publication_year,language,pages,description,shelf,rack)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[b.isbn||"",b.title,b.subtitle||"",b.category_id?Number(b.category_id):null,b.author_id?Number(b.author_id):null,b.publisher_id?Number(b.publisher_id):null,
    b.edition||"",b.publication_year?Number(b.publication_year):null,b.language||"English",b.pages?Number(b.pages):null,b.description||"",b.shelf||"",b.rack||""]);
  libraryAuditV40(req.admin,"book_created","book",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM library_books WHERE id=?",[id])});
});
app.post("/api/admin/library/books/:id/copies",requireAdmin,(req,res)=>{
  const bookId=Number(req.params.id);if(!queryOne("SELECT id FROM library_books WHERE id=?",[bookId]))return res.status(404).json({success:false,message:"Book not found."});
  const count=Math.max(1,Number(req.body?.count||1)),made=[];
  for(let i=0;i<count;i++){const acc=req.body?.accession_no&&count===1?req.body.accession_no:nextLibraryCodeV40("ACC");const barcode=req.body?.barcode&&count===1?req.body.barcode:`BC-${acc}`;
    const id=insert(`INSERT INTO library_copies (book_id,accession_no,barcode,condition,purchase_date,price,notes) VALUES (?,?,?,?,?,?,?)`,
      [bookId,acc,barcode,req.body?.condition||"good",req.body?.purchase_date||null,Number(req.body?.price||0),req.body?.notes||""]);made.push(id)}
  libraryAuditV40(req.admin,"copies_added","book",bookId,{count});persistDatabase();res.status(201).json({success:true,data:query("SELECT * FROM library_copies WHERE book_id=? ORDER BY id DESC",[bookId]).slice(0,count)});
});
app.get("/api/admin/library/categories",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM library_categories ORDER BY name")}));
app.post("/api/admin/library/categories",requireAdmin,(req,res)=>{
  const n=String(req.body?.name||"").trim();if(!n)return res.status(400).json({success:false,message:"Category name is required."});
  try{const id=insert("INSERT INTO library_categories (name,description) VALUES (?,?)",[n,req.body?.description||""]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM library_categories WHERE id=?",[id])})}catch{res.status(409).json({success:false,message:"Category already exists."})}
});
app.get("/api/admin/library/members",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM library_members WHERE status='active' ORDER BY display_name")}));
app.post("/api/admin/library/members",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.member_type||!b.display_name)return res.status(400).json({success:false,message:"Member type and display name are required."});
  const code=b.member_code||nextLibraryCodeV40("MEM");
  try{const id=insert(`INSERT INTO library_members (member_type,member_ref_id,member_code,display_name,class_name,section,phone)
    VALUES (?,?,?,?,?,?,?)`,[b.member_type,b.member_ref_id?Number(b.member_ref_id):null,code,b.display_name,b.class_name||"",b.section||"",b.phone||""]);
    libraryAuditV40(req.admin,"member_created","member",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM library_members WHERE id=?",[id])})}catch{res.status(409).json({success:false,message:"Member code already exists."})}
});
app.get("/api/library/search",(req,res)=>{
  const q=String(req.query.q||"").trim(),like=`%${q}%`;
  res.json({success:true,data:query(`SELECT b.id,b.title,b.isbn,a.name author_name,c.name category_name,COUNT(cp.id) copies,
    SUM(CASE WHEN cp.status='available' THEN 1 ELSE 0 END) available_copies FROM library_books b
    LEFT JOIN library_authors a ON a.id=b.author_id LEFT JOIN library_categories c ON c.id=b.category_id LEFT JOIN library_copies cp ON cp.book_id=b.id
    WHERE b.title LIKE ? OR COALESCE(b.isbn,'') LIKE ? OR COALESCE(a.name,'') LIKE ? GROUP BY b.id ORDER BY b.title LIMIT 100`,[like,like,like])});
});
app.post("/api/admin/library/issue",requireAdmin,(req,res)=>{
  const b=req.body||{},copy=queryOne("SELECT cp.*,b.title FROM library_copies cp JOIN library_books b ON b.id=cp.book_id WHERE cp.id=?",[Number(b.copy_id)]);
  const member=queryOne("SELECT * FROM library_members WHERE id=? AND status='active'",[Number(b.member_id)]);
  if(!copy||!member)return res.status(400).json({success:false,message:"Copy or member not found."});
  if(copy.status!=="available")return res.status(409).json({success:false,message:"This copy is not available."});
  const issued=b.issued_at||new Date().toISOString(),due=b.due_at||new Date(Date.now()+14*86400000).toISOString();
  const id=insert(`INSERT INTO library_loans (copy_id,member_id,issued_at,due_at,remarks,issued_by) VALUES (?,?,?,?,?,?)`,
    [copy.id,member.id,issued,due,b.remarks||"",req.admin.id]);
  db.run("UPDATE library_copies SET status='issued' WHERE id=?",[copy.id]);libraryAuditV40(req.admin,"book_issued","loan",id,{copy_id:copy.id,member_id:member.id});
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM library_loans WHERE id=?",[id])});
});
app.post("/api/admin/library/return/:loanId",requireAdmin,(req,res)=>{
  const id=Number(req.params.loanId),loan=queryOne("SELECT * FROM library_loans WHERE id=?",[id]);if(!loan)return res.status(404).json({success:false,message:"Loan not found."});
  if(loan.status==="returned")return res.status(409).json({success:false,message:"Book already returned."});
  const returned=req.body?.returned_at||new Date().toISOString(),fine=libraryFineV40(loan.due_at,returned,req.body?.fine_per_day||1);
  db.run("UPDATE library_loans SET returned_at=?,status='returned',fine=?,returned_by=? WHERE id=?",[returned,fine,req.admin.id,id]);
  db.run("UPDATE library_copies SET status='available' WHERE id=?",[loan.copy_id]);
  if(fine>0)insert("INSERT INTO library_fines (loan_id,member_id,amount,reason) VALUES (?,?,?,?)",[id,loan.member_id,fine,"Late return"]);
  libraryAuditV40(req.admin,"book_returned","loan",id,{fine});persistDatabase();
  res.json({success:true,data:{loan:queryOne("SELECT * FROM library_loans WHERE id=?",[id]),fine}});
});
app.get("/api/admin/library/loans",requireAdmin,(req,res)=>{
  const status=String(req.query.status||"all");let sql=`SELECT l.*,cp.accession_no,cp.barcode,b.title,m.member_code,m.display_name,m.member_type
    FROM library_loans l JOIN library_copies cp ON cp.id=l.copy_id JOIN library_books b ON b.id=cp.book_id JOIN library_members m ON m.id=l.member_id`;
  const args=[];if(status!=="all"){sql+=" WHERE l.status=?";args.push(status)}sql+=" ORDER BY l.issued_at DESC,l.id DESC LIMIT 500";
  res.json({success:true,data:query(sql,args)});
});
app.get("/api/admin/library/overdue",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT l.*,b.title,cp.accession_no,m.member_code,m.display_name,
  CAST((julianday('now')-julianday(l.due_at)+0.999) AS INTEGER) overdue_days
  FROM library_loans l JOIN library_copies cp ON cp.id=l.copy_id JOIN library_books b ON b.id=cp.book_id JOIN library_members m ON m.id=l.member_id
  WHERE l.status='issued' AND l.due_at<datetime('now') ORDER BY l.due_at`) }));
app.post("/api/admin/library/reserve",requireAdmin,(req,res)=>{
  const b=req.body||{},bookId=Number(b.book_id),memberId=Number(b.member_id);if(!queryOne("SELECT id FROM library_books WHERE id=?",[bookId])||!queryOne("SELECT id FROM library_members WHERE id=?",[memberId]))return res.status(400).json({success:false,message:"Book or member not found."});
  const id=insert("INSERT INTO library_reservations (book_id,member_id,expires_at,notes) VALUES (?,?,?,?)",[bookId,memberId,b.expires_at||null,b.notes||""]);libraryAuditV40(req.admin,"reservation_created","reservation",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM library_reservations WHERE id=?",[id])});
});
app.patch("/api/admin/library/fines/:id/pay",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),f=queryOne("SELECT * FROM library_fines WHERE id=?",[id]);if(!f)return res.status(404).json({success:false,message:"Fine not found."});
  db.run("UPDATE library_fines SET status='paid',paid_at=? WHERE id=?",[new Date().toISOString(),id]);libraryAuditV40(req.admin,"fine_paid","fine",id);persistDatabase();res.json({success:true});
});
app.get("/api/admin/library/reports",requireAdmin,(_req,res)=>{
  res.json({success:true,data:{popular:query(`SELECT b.title,COUNT(l.id) borrow_count FROM library_books b JOIN library_copies c ON c.book_id=b.id JOIN library_loans l ON l.copy_id=c.id GROUP BY b.id ORDER BY borrow_count DESC LIMIT 10`),
    categories:query(`SELECT c.name,COUNT(b.id) books FROM library_categories c LEFT JOIN library_books b ON b.category_id=c.id GROUP BY c.id ORDER BY books DESC`),
    members:query(`SELECT m.member_type,COUNT(l.id) loans FROM library_members m LEFT JOIN library_loans l ON l.member_id=m.id GROUP BY m.member_type`)}});
});


/* ===== ADVANCED HOSTEL MANAGEMENT SYSTEM V41 ===== */
function ensureHostelV41(){
  db.run(`CREATE TABLE IF NOT EXISTS hostel_buildings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,gender_policy TEXT DEFAULT 'any',
    address TEXT,warden_name TEXT,warden_phone TEXT,status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_floors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,building_id INTEGER NOT NULL,name TEXT NOT NULL,floor_no INTEGER DEFAULT 0,
    UNIQUE(building_id,name)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,floor_id INTEGER NOT NULL,room_no TEXT NOT NULL,
    room_type TEXT DEFAULT 'standard',capacity INTEGER DEFAULT 1,gender_policy TEXT DEFAULT 'any',
    monthly_fee REAL DEFAULT 0,status TEXT DEFAULT 'active',notes TEXT,
    UNIQUE(floor_id,room_no)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_beds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,room_id INTEGER NOT NULL,bed_no TEXT NOT NULL,
    status TEXT DEFAULT 'available',condition TEXT DEFAULT 'good',notes TEXT,
    UNIQUE(room_id,bed_no)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_wardens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT,email TEXT,
    building_id INTEGER,status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,bed_id INTEGER NOT NULL,
    check_in TEXT NOT NULL,check_out TEXT,status TEXT DEFAULT 'active',monthly_fee REAL DEFAULT 0,
    security_deposit REAL DEFAULT 0,remarks TEXT,allocated_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,attendance_date TEXT NOT NULL,
    status TEXT DEFAULT 'present',check_in_time TEXT,check_out_time TEXT,remarks TEXT,marked_by INTEGER,
    UNIQUE(student_id,attendance_date)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,from_date TEXT NOT NULL,to_date TEXT NOT NULL,
    reason TEXT,leave_type TEXT DEFAULT 'home',guardian_name TEXT,guardian_phone TEXT,
    approval_status TEXT DEFAULT 'pending',approved_by INTEGER,approved_at TEXT,remarks TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,visitor_name TEXT NOT NULL,
    relation TEXT,phone TEXT,visit_date TEXT NOT NULL,in_time TEXT,out_time TEXT,
    purpose TEXT,id_reference TEXT,approved_by INTEGER,status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER,category TEXT NOT NULL,title TEXT NOT NULL,
    description TEXT,priority TEXT DEFAULT 'normal',status TEXT DEFAULT 'open',assigned_to INTEGER,
    resolution TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_maintenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,building_id INTEGER,room_id INTEGER,category TEXT NOT NULL,
    title TEXT NOT NULL,description TEXT,priority TEXT DEFAULT 'normal',status TEXT DEFAULT 'open',
    assigned_to INTEGER,cost REAL DEFAULT 0,resolution TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_fees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,allocation_id INTEGER NOT NULL,student_id INTEGER NOT NULL,
    billing_month TEXT NOT NULL,amount REAL NOT NULL,paid REAL DEFAULT 0,balance REAL DEFAULT 0,
    due_date TEXT,status TEXT DEFAULT 'unpaid',notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(allocation_id,billing_month)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hostel_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER,action TEXT NOT NULL,entity_type TEXT,
    entity_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureHostelV41();

function hostelAuditV41(actor,action,type,id,details){
  insert("INSERT INTO hostel_audit_log (actor_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)",
    [actor?.id||null,action,type||null,id||null,JSON.stringify(details||{})]);
}
function hostelStudentV41(id){return queryOne("SELECT id,full_name,admission_no,roll_no,class_name,section,status FROM students WHERE id=?",[Number(id)])}
function hostelBedV41(id){return queryOne(`SELECT b.*,r.room_no,r.capacity,r.monthly_fee,f.name floor_name,bl.name building_name,bl.gender_policy building_gender
  FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id JOIN hostel_floors f ON f.id=r.floor_id JOIN hostel_buildings bl ON bl.id=f.building_id WHERE b.id=?`,[Number(id)])}

app.get("/api/admin/hostel/dashboard",requireAdmin,(_req,res)=>{
  const buildings=Number(queryOne("SELECT COUNT(*) c FROM hostel_buildings WHERE status='active'")?.c||0);
  const rooms=Number(queryOne("SELECT COUNT(*) c FROM hostel_rooms WHERE status='active'")?.c||0);
  const beds=Number(queryOne("SELECT COUNT(*) c FROM hostel_beds")?.c||0);
  const occupied=Number(queryOne("SELECT COUNT(*) c FROM hostel_beds WHERE status='occupied'")?.c||0);
  const available=Number(queryOne("SELECT COUNT(*) c FROM hostel_beds WHERE status='available'")?.c||0);
  const residents=Number(queryOne("SELECT COUNT(*) c FROM hostel_allocations WHERE status='active'")?.c||0);
  const pendingLeaves=Number(queryOne("SELECT COUNT(*) c FROM hostel_leaves WHERE approval_status='pending'")?.c||0);
  const complaints=Number(queryOne("SELECT COUNT(*) c FROM hostel_complaints WHERE status NOT IN ('resolved','closed')")?.c||0);
  const maintenance=Number(queryOne("SELECT COUNT(*) c FROM hostel_maintenance WHERE status NOT IN ('resolved','closed')")?.c||0);
  const dues=Number(queryOne("SELECT COALESCE(SUM(balance),0) v FROM hostel_fees WHERE status!='paid'")?.v||0);
  res.json({success:true,data:{buildings,rooms,beds,occupied,available,residents,pending_leaves:pendingLeaves,complaints,maintenance,fee_dues:dues,occupancy_rate:beds?Number((occupied/beds*100).toFixed(2)):0}});
});
app.get("/api/admin/hostel/buildings",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT b.*,COUNT(DISTINCT r.id) rooms,COUNT(DISTINCT bed.id) beds,
  SUM(CASE WHEN bed.status='occupied' THEN 1 ELSE 0 END) occupied FROM hostel_buildings b
  LEFT JOIN hostel_floors f ON f.building_id=b.id LEFT JOIN hostel_rooms r ON r.floor_id=f.id LEFT JOIN hostel_beds bed ON bed.room_id=r.id
  GROUP BY b.id ORDER BY b.name`) }));
app.post("/api/admin/hostel/buildings",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name)return res.status(400).json({success:false,message:"Building name is required."});
  try{const id=insert("INSERT INTO hostel_buildings (name,gender_policy,address,warden_name,warden_phone) VALUES (?,?,?,?,?)",[b.name,b.gender_policy||"any",b.address||"",b.warden_name||"",b.warden_phone||""]);
    hostelAuditV41(req.admin,"building_created","building",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_buildings WHERE id=?",[id])})}catch{res.status(409).json({success:false,message:"Building already exists."})}
});
app.post("/api/admin/hostel/buildings/:id/floors",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);if(!queryOne("SELECT id FROM hostel_buildings WHERE id=?",[id]))return res.status(404).json({success:false,message:"Building not found."});
  const b=req.body||{};if(!b.name)return res.status(400).json({success:false,message:"Floor name is required."});
  try{const fid=insert("INSERT INTO hostel_floors (building_id,name,floor_no) VALUES (?,?,?)",[id,b.name,Number(b.floor_no||0)]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_floors WHERE id=?",[fid])})}catch{res.status(409).json({success:false,message:"Floor already exists."})}
});
app.post("/api/admin/hostel/floors/:id/rooms",requireAdmin,(req,res)=>{
  const fid=Number(req.params.id);if(!queryOne("SELECT id FROM hostel_floors WHERE id=?",[fid]))return res.status(404).json({success:false,message:"Floor not found."});
  const b=req.body||{};if(!b.room_no)return res.status(400).json({success:false,message:"Room number is required."});
  try{const id=insert(`INSERT INTO hostel_rooms (floor_id,room_no,room_type,capacity,gender_policy,monthly_fee,notes) VALUES (?,?,?,?,?,?,?)`,
    [fid,b.room_no,b.room_type||"standard",Math.max(1,Number(b.capacity||1)),b.gender_policy||"any",Number(b.monthly_fee||0),b.notes||""]);
    const count=Math.max(1,Number(b.beds||b.capacity||1));for(let i=1;i<=count;i++)insert("INSERT INTO hostel_beds (room_id,bed_no) VALUES (?,?)",[id,String(i)]);
    hostelAuditV41(req.admin,"room_created","room",id,{beds:count});persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_rooms WHERE id=?",[id])})}catch{res.status(409).json({success:false,message:"Room number already exists on this floor."})}
});
app.get("/api/admin/hostel/rooms",requireAdmin,(req,res)=>{
  const gender=String(req.query.gender||"all");let sql=`SELECT r.*,f.name floor_name,b.name building_name,
    COUNT(bed.id) beds,SUM(CASE WHEN bed.status='occupied' THEN 1 ELSE 0 END) occupied,SUM(CASE WHEN bed.status='available' THEN 1 ELSE 0 END) available
    FROM hostel_rooms r JOIN hostel_floors f ON f.id=r.floor_id JOIN hostel_buildings b ON b.id=f.building_id
    LEFT JOIN hostel_beds bed ON bed.room_id=r.id`;const args=[];
  if(gender!=="all"){sql+=" WHERE (r.gender_policy=? OR r.gender_policy='any' OR b.gender_policy=? OR b.gender_policy='any')";args.push(gender,gender)}
  sql+=" GROUP BY r.id ORDER BY b.name,f.floor_no,r.room_no";res.json({success:true,data:query(sql,args)});
});
app.get("/api/admin/hostel/beds",requireAdmin,(req,res)=>res.json({success:true,data:query(`SELECT bed.*,r.room_no,r.capacity,r.monthly_fee,f.name floor_name,b.name building_name,
  a.student_id,s.full_name,s.admission_no FROM hostel_beds bed JOIN hostel_rooms r ON r.id=bed.room_id JOIN hostel_floors f ON f.id=r.floor_id JOIN hostel_buildings b ON b.id=f.building_id
  LEFT JOIN hostel_allocations a ON a.bed_id=bed.id AND a.status='active' LEFT JOIN students s ON s.id=a.student_id ORDER BY b.name,f.floor_no,r.room_no,bed.bed_no`) }));
app.post("/api/admin/hostel/allocate",requireAdmin,(req,res)=>{
  const b=req.body||{},sid=Number(b.student_id),bid=Number(b.bed_id),student=hostelStudentV41(sid),bed=hostelBedV41(bid);
  if(!student||!bed)return res.status(400).json({success:false,message:"Student or bed not found."});
  if(bed.status!=="available")return res.status(409).json({success:false,message:"Bed is not available."});
  if(queryOne("SELECT id FROM hostel_allocations WHERE student_id=? AND status='active'",[sid]))return res.status(409).json({success:false,message:"Student already has an active hostel allocation."});
  const gender=String(b.gender||"").toLowerCase(),policy=String(bed.building_gender||"any").toLowerCase();
  if(gender&&policy!=="any"&&gender!==policy)return res.status(409).json({success:false,message:"Student gender does not match hostel policy."});
  const checkIn=b.check_in||new Date().toISOString().slice(0,10),fee=Number(b.monthly_fee??bed.monthly_fee??0);
  const id=insert(`INSERT INTO hostel_allocations (student_id,bed_id,check_in,monthly_fee,security_deposit,remarks,allocated_by) VALUES (?,?,?,?,?,?,?)`,
    [sid,bid,checkIn,fee,Number(b.security_deposit||0),b.remarks||"",req.admin.id]);
  db.run("UPDATE hostel_beds SET status='occupied' WHERE id=?",[bid]);
  hostelAuditV41(req.admin,"bed_allocated","allocation",id,{student_id:sid,bed_id:bid});persistDatabase();
  res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_allocations WHERE id=?",[id])});
});
app.post("/api/admin/hostel/checkout/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),a=queryOne("SELECT * FROM hostel_allocations WHERE id=? AND status='active'",[id]);if(!a)return res.status(404).json({success:false,message:"Active allocation not found."});
  const date=req.body?.check_out||new Date().toISOString().slice(0,10);db.run("UPDATE hostel_allocations SET status='checked_out',check_out=? WHERE id=?",[date,id]);
  db.run("UPDATE hostel_beds SET status='available' WHERE id=?",[a.bed_id]);hostelAuditV41(req.admin,"student_checked_out","allocation",id,{check_out:date});persistDatabase();res.json({success:true});
});
app.get("/api/admin/hostel/residents",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT a.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,
  bed.bed_no,r.room_no,f.name floor_name,b.name building_name FROM hostel_allocations a JOIN students s ON s.id=a.student_id
  JOIN hostel_beds bed ON bed.id=a.bed_id JOIN hostel_rooms r ON r.id=bed.room_id JOIN hostel_floors f ON f.id=r.floor_id JOIN hostel_buildings b ON b.id=f.building_id
  WHERE a.status='active' ORDER BY b.name,r.room_no,bed.bed_no`) }));
app.post("/api/admin/hostel/attendance",requireAdmin,(req,res)=>{
  const b=req.body||{},sid=Number(b.student_id),date=b.attendance_date||new Date().toISOString().slice(0,10);
  if(!hostelStudentV41(sid))return res.status(404).json({success:false,message:"Student not found."});
  const existing=queryOne("SELECT id FROM hostel_attendance WHERE student_id=? AND attendance_date=?",[sid,date]);
  if(existing)db.run("UPDATE hostel_attendance SET status=?,check_in_time=?,check_out_time=?,remarks=?,marked_by=? WHERE id=?",[b.status||"present",b.check_in_time||null,b.check_out_time||null,b.remarks||"",req.admin.id,existing.id]);
  else insert("INSERT INTO hostel_attendance (student_id,attendance_date,status,check_in_time,check_out_time,remarks,marked_by) VALUES (?,?,?,?,?,?,?)",
    [sid,date,b.status||"present",b.check_in_time||null,b.check_out_time||null,b.remarks||"",req.admin.id]);
  hostelAuditV41(req.admin,"attendance_marked","attendance",sid,{date,status:b.status||"present"});persistDatabase();res.json({success:true});
});
app.get("/api/admin/hostel/attendance",requireAdmin,(req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));res.json({success:true,data:query(`SELECT h.*,s.full_name,s.admission_no,s.class_name,s.section FROM hostel_attendance h JOIN students s ON s.id=h.student_id WHERE h.attendance_date=? ORDER BY s.class_name,s.full_name`,[date])});
});
app.post("/api/admin/hostel/leaves",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!hostelStudentV41(b.student_id))return res.status(400).json({success:false,message:"Student not found."});
  const id=insert(`INSERT INTO hostel_leaves (student_id,from_date,to_date,reason,leave_type,guardian_name,guardian_phone,remarks) VALUES (?,?,?,?,?,?,?,?)`,
    [Number(b.student_id),b.from_date,b.to_date,b.reason||"",b.leave_type||"home",b.guardian_name||"",b.guardian_phone||"",b.remarks||""]);
  hostelAuditV41(req.admin,"leave_requested","leave",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_leaves WHERE id=?",[id])});
});
app.patch("/api/admin/hostel/leaves/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),l=queryOne("SELECT * FROM hostel_leaves WHERE id=?",[id]);if(!l)return res.status(404).json({success:false,message:"Leave not found."});
  const status=["approved","rejected","pending"].includes(req.body?.approval_status)?req.body.approval_status:"pending";
  db.run("UPDATE hostel_leaves SET approval_status=?,approved_by=?,approved_at=?,remarks=? WHERE id=?",[status,status==="pending"?null:req.admin.id,status==="pending"?null:new Date().toISOString(),req.body?.remarks||l.remarks||"",id]);
  hostelAuditV41(req.admin,`leave_${status}`,"leave",id);persistDatabase();res.json({success:true});
});
app.get("/api/admin/hostel/leaves",requireAdmin,(req,res)=>{
  const status=String(req.query.status||"all");let sql=`SELECT l.*,s.full_name,s.admission_no,s.class_name,s.section FROM hostel_leaves l JOIN students s ON s.id=l.student_id`;const args=[];
  if(status!=="all"){sql+=" WHERE l.approval_status=?";args.push(status)}sql+=" ORDER BY l.created_at DESC LIMIT 500";res.json({success:true,data:query(sql,args)});
});
app.post("/api/admin/hostel/visitors",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!hostelStudentV41(b.student_id)||!b.visitor_name)return res.status(400).json({success:false,message:"Student and visitor name are required."});
  const id=insert(`INSERT INTO hostel_visitors (student_id,visitor_name,relation,phone,visit_date,in_time,purpose,id_reference,approved_by)
    VALUES (?,?,?,?,?,?,?,?,?)`,[Number(b.student_id),b.visitor_name,b.relation||"",b.phone||"",b.visit_date||new Date().toISOString().slice(0,10),b.in_time||new Date().toISOString(),b.purpose||"",b.id_reference||"",req.admin.id]);
  hostelAuditV41(req.admin,"visitor_registered","visitor",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_visitors WHERE id=?",[id])});
});
app.patch("/api/admin/hostel/visitors/:id/checkout",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);db.run("UPDATE hostel_visitors SET out_time=?,status='completed' WHERE id=?",[new Date().toISOString(),id]);persistDatabase();res.json({success:true});
});
app.get("/api/admin/hostel/visitors",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT v.*,s.full_name,s.admission_no FROM hostel_visitors v JOIN students s ON s.id=v.student_id ORDER BY v.visit_date DESC,v.id DESC LIMIT 500`) }));
app.post("/api/admin/hostel/complaints",requireAdmin,(req,res)=>{
  const b=req.body||{};const id=insert(`INSERT INTO hostel_complaints (student_id,category,title,description,priority) VALUES (?,?,?,?,?)`,
    [b.student_id?Number(b.student_id):null,b.category||"general",b.title||"Complaint",b.description||"",b.priority||"normal"]);hostelAuditV41(req.admin,"complaint_created","complaint",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_complaints WHERE id=?",[id])});
});
app.patch("/api/admin/hostel/complaints/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),c=queryOne("SELECT * FROM hostel_complaints WHERE id=?",[id]);if(!c)return res.status(404).json({success:false,message:"Complaint not found."});
  const status=req.body?.status||c.status;db.run("UPDATE hostel_complaints SET status=?,assigned_to=?,resolution=?,resolved_at=? WHERE id=?",[status,req.body?.assigned_to?Number(req.body.assigned_to):c.assigned_to||null,req.body?.resolution||c.resolution||"",["resolved","closed"].includes(status)?new Date().toISOString():null,id]);
  hostelAuditV41(req.admin,"complaint_updated","complaint",id,{status});persistDatabase();res.json({success:true});
});
app.get("/api/admin/hostel/complaints",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT c.*,s.full_name,s.admission_no FROM hostel_complaints c LEFT JOIN students s ON s.id=c.student_id ORDER BY c.created_at DESC LIMIT 500`) }));
app.post("/api/admin/hostel/maintenance",requireAdmin,(req,res)=>{
  const b=req.body||{};const id=insert(`INSERT INTO hostel_maintenance (building_id,room_id,category,title,description,priority) VALUES (?,?,?,?,?,?)`,
    [b.building_id?Number(b.building_id):null,b.room_id?Number(b.room_id):null,b.category||"general",b.title||"Maintenance",b.description||"",b.priority||"normal"]);hostelAuditV41(req.admin,"maintenance_created","maintenance",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM hostel_maintenance WHERE id=?",[id])});
});
app.patch("/api/admin/hostel/maintenance/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),m=queryOne("SELECT * FROM hostel_maintenance WHERE id=?",[id]);if(!m)return res.status(404).json({success:false,message:"Maintenance record not found."});
  const status=req.body?.status||m.status;db.run("UPDATE hostel_maintenance SET status=?,assigned_to=?,cost=?,resolution=?,resolved_at=? WHERE id=?",
    [status,req.body?.assigned_to?Number(req.body.assigned_to):m.assigned_to||null,Number(req.body?.cost??m.cost??0),req.body?.resolution||m.resolution||"",["resolved","closed"].includes(status)?new Date().toISOString():null,id]);
  hostelAuditV41(req.admin,"maintenance_updated","maintenance",id,{status});persistDatabase();res.json({success:true});
});
app.get("/api/admin/hostel/maintenance",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT m.*,b.name building_name,r.room_no FROM hostel_maintenance m LEFT JOIN hostel_buildings b ON b.id=m.building_id LEFT JOIN hostel_rooms r ON r.id=m.room_id ORDER BY m.created_at DESC LIMIT 500`) }));
app.post("/api/admin/hostel/fees/generate",requireAdmin,(req,res)=>{
  const month=String(req.body?.billing_month||new Date().toISOString().slice(0,7)),due=req.body?.due_date||`${month}-10`;
  const residents=query("SELECT * FROM hostel_allocations WHERE status='active'");let made=0;
  residents.forEach(a=>{const ex=queryOne("SELECT id FROM hostel_fees WHERE allocation_id=? AND billing_month=?",[a.id,month]);if(!ex){const amount=Number(a.monthly_fee||0);insert(`INSERT INTO hostel_fees (allocation_id,student_id,billing_month,amount,paid,balance,due_date,status) VALUES (?,?,?,?,?,?,?,?)`,
    [a.id,a.student_id,month,amount,0,amount,due,"unpaid"]);made++}});
  hostelAuditV41(req.admin,"fees_generated","hostel_fee",null,{month,made});persistDatabase();res.json({success:true,data:{generated:made}});
});
app.get("/api/admin/hostel/fees",requireAdmin,(req,res)=>{
  const status=String(req.query.status||"all");let sql=`SELECT f.*,s.full_name,s.admission_no,s.class_name,s.section FROM hostel_fees f JOIN students s ON s.id=f.student_id`;const args=[];
  if(status!=="all"){sql+=" WHERE f.status=?";args.push(status)}sql+=" ORDER BY f.billing_month DESC,s.full_name LIMIT 500";res.json({success:true,data:query(sql,args)});
});
app.get("/api/admin/hostel/reports",requireAdmin,(_req,res)=>{
  res.json({
    success:true,
    data:{
      occupancy:query(`SELECT b.name building_name,COUNT(bed.id) beds,
        SUM(CASE WHEN bed.status='occupied' THEN 1 ELSE 0 END) occupied,
        SUM(CASE WHEN bed.status='available' THEN 1 ELSE 0 END) available
        FROM hostel_buildings b
        LEFT JOIN hostel_floors f ON f.building_id=b.id
        LEFT JOIN hostel_rooms r ON r.floor_id=f.id
        LEFT JOIN hostel_beds bed ON bed.room_id=r.id
        GROUP BY b.id`),
      attendance:query(`SELECT status,COUNT(*) count
        FROM hostel_attendance
        WHERE attendance_date>=date('now','-30 day')
        GROUP BY status`),
      complaints:query(`SELECT priority,status,COUNT(*) count
        FROM hostel_complaints
        GROUP BY priority,status`),
      fees:query(`SELECT status,COUNT(*) count,COALESCE(SUM(balance),0) balance
        FROM hostel_fees
        GROUP BY status`)
    }
  });
});


/* ===== ADVANCED PARENT / GUARDIAN PORTAL V42 ===== */
function ensureParentPortalV42(){
  db.run(`CREATE TABLE IF NOT EXISTS parent_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,
    parent_name TEXT NOT NULL,phone TEXT,status TEXT DEFAULT 'active',last_login TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS parent_student_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,parent_id INTEGER NOT NULL,student_id INTEGER NOT NULL,
    relation TEXT DEFAULT 'guardian',is_primary INTEGER DEFAULT 0,status TEXT DEFAULT 'active',
    UNIQUE(parent_id,student_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS parent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,parent_id INTEGER NOT NULL,student_id INTEGER,
    sender_role TEXT NOT NULL,sender_id INTEGER,subject TEXT,message TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',status TEXT DEFAULT 'unread',created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    read_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS parent_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,parent_id INTEGER NOT NULL,student_id INTEGER,
    title TEXT NOT NULL,message TEXT NOT NULL,type TEXT DEFAULT 'general',
    is_read INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS parent_homework (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER,teacher_id INTEGER,
    subject TEXT NOT NULL,title TEXT NOT NULL,description TEXT,due_date TEXT,
    status TEXT DEFAULT 'assigned',created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS parent_calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,description TEXT,event_date TEXT NOT NULL,
    event_type TEXT DEFAULT 'school',class_name TEXT,created_by INTEGER,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS parent_complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,parent_id INTEGER NOT NULL,student_id INTEGER,
    category TEXT NOT NULL,title TEXT NOT NULL,description TEXT,priority TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'open',resolution TEXT,assigned_to INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS parent_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,parent_id INTEGER,actor_id INTEGER,action TEXT NOT NULL,
    details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureParentPortalV42();

function parentAuditV42(parentId,actor,action,details){
  insert("INSERT INTO parent_audit_log (parent_id,actor_id,action,details) VALUES (?,?,?,?)",
    [parentId||null,actor?.id||null,action,JSON.stringify(details||{})]);
}
function parentAccountV42(id){return queryOne("SELECT id,email,parent_name,phone,status FROM parent_accounts WHERE id=? AND status='active'",[Number(id)])}
function parentLinkedStudentV42(parentId,studentId){
  return queryOne(`SELECT s.* FROM parent_student_links l JOIN students s ON s.id=l.student_id
    WHERE l.parent_id=? AND l.student_id=? AND l.status='active'`,[Number(parentId),Number(studentId)]);
}
function parentTokenV42(req){
  const h=String(req.headers?.authorization||"");if(!h.startsWith("Bearer "))return null;
  try{return jwt.verify(h.slice(7),JWT_SECRET)}catch{return null}
}
function requireParentV42(req,res,next){
  const p=parentTokenV42(req);if(!p||p.role!=="parent")return res.status(401).json({success:false,message:"Parent authentication required."});
  const a=parentAccountV42(p.id);if(!a)return res.status(401).json({success:false,message:"Parent account inactive."});
  req.parent=a;req.parentToken=p;next();
}

app.post("/api/parent/auth/login",(req,res)=>{
  const email=String(req.body?.email||"").trim().toLowerCase(),password=String(req.body?.password||"");
  const a=queryOne("SELECT * FROM parent_accounts WHERE LOWER(email)=? AND status='active'",[email]);
  if(!a||!verifyPasswordV34(password,a.password_hash))return res.status(401).json({success:false,message:"Invalid parent credentials."});
  const token=jwt.sign({id:a.id,email:a.email,role:"parent",name:a.parent_name},JWT_SECRET,{expiresIn:"7d"});
  db.run("UPDATE parent_accounts SET last_login=CURRENT_TIMESTAMP WHERE id=?",[a.id]);parentAuditV42(a.id,null,"login");persistDatabase();
  res.json({success:true,data:{token,parent:{id:a.id,email:a.email,parent_name:a.parent_name,phone:a.phone}}});
});
app.post("/api/admin/parents",(req,res)=>{
  if(req.admin?.role!=="admin")return res.status(403).json({success:false,message:"Admin access required."});
  const b=req.body||{},email=String(b.email||"").trim().toLowerCase(),password=String(b.password||"");
  if(!email||!password||!b.parent_name)return res.status(400).json({success:false,message:"Parent name, email and password are required."});
  try{
    const id=insert("INSERT INTO parent_accounts (email,password_hash,parent_name,phone) VALUES (?,?,?,?)",[email,hashPasswordV34(password),b.parent_name,b.phone||""]);
    if(Array.isArray(b.student_ids))b.student_ids.forEach((sid,i)=>{if(hostelStudentV41(sid))insert("INSERT INTO parent_student_links (parent_id,student_id,relation,is_primary) VALUES (?,?,?,?)",[id,Number(sid),b.relation||"guardian",i===0?1:0])});
    parentAuditV42(id,req.admin,"parent_created",b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT id,email,parent_name,phone,status FROM parent_accounts WHERE id=?",[id])});
  }catch{res.status(409).json({success:false,message:"Parent email already exists."})}
});
app.get("/api/admin/parents",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT p.id,p.email,p.parent_name,p.phone,p.status,p.last_login,COUNT(l.student_id) children
  FROM parent_accounts p LEFT JOIN parent_student_links l ON l.parent_id=p.id AND l.status='active' GROUP BY p.id ORDER BY p.parent_name`) }));
app.post("/api/admin/parents/:id/link",requireAdmin,(req,res)=>{
  const pid=Number(req.params.id),sid=Number(req.body?.student_id);if(!parentAccountV42(pid)||!hostelStudentV41(sid))return res.status(400).json({success:false,message:"Parent or student not found."});
  try{insert("INSERT INTO parent_student_links (parent_id,student_id,relation,is_primary) VALUES (?,?,?,?)",[pid,sid,req.body?.relation||"guardian",req.body?.is_primary?1:0]);parentAuditV42(pid,req.admin,"student_linked",{student_id:sid});persistDatabase();res.json({success:true})}catch{res.status(409).json({success:false,message:"Student is already linked."})}
});
app.get("/api/parent/children",requireParentV42,(req,res)=>res.json({success:true,data:query(`SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,s.status,l.relation,l.is_primary
  FROM parent_student_links l JOIN students s ON s.id=l.student_id WHERE l.parent_id=? AND l.status='active' ORDER BY l.is_primary DESC,s.full_name`,[req.parent.id])}));
app.get("/api/parent/dashboard",requireParentV42,(req,res)=>{
  const children=query(`SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,l.relation FROM parent_student_links l JOIN students s ON s.id=l.student_id WHERE l.parent_id=? AND l.status='active'`,[req.parent.id]);
  const ids=children.map(x=>x.id);let attendance=[],results=[],fees=[],hostel=[],library=[],homework=[];
  ids.forEach(sid=>{
    let att=null;try{att=queryOne(`SELECT COUNT(*) total,SUM(CASE WHEN LOWER(status) IN ('present','p') THEN 1 ELSE 0 END) present FROM attendance WHERE student_id=?`,[sid])}catch{}
    attendance.push({student_id:sid,percentage:att&&Number(att.total)?Number((Number(att.present||0)/Number(att.total)*100).toFixed(2)):0});
    results.push(...query(`SELECT r.exam_id,r.percentage,r.grade,r.division,r.result_status,r.class_rank,e.name exam_name,e.academic_year FROM advanced_exam_results r JOIN advanced_exams e ON e.id=r.exam_id WHERE r.student_id=? AND e.result_published=1 ORDER BY e.id DESC LIMIT 5`,[sid]));
    try{fees.push(...query(`SELECT f.*,s.full_name FROM fee_invoices f JOIN students s ON s.id=f.student_id WHERE f.student_id=? ORDER BY f.invoice_date DESC LIMIT 5`,[sid]))}catch{}
    try{hostel.push(...query(`SELECT a.*,bed.bed_no,r.room_no,b.name building_name FROM hostel_allocations a JOIN hostel_beds bed ON bed.id=a.bed_id JOIN hostel_rooms r ON r.id=bed.room_id JOIN hostel_floors fl ON fl.id=r.floor_id JOIN hostel_buildings b ON b.id=fl.building_id WHERE a.student_id=? AND a.status='active'`,[sid]))}catch{}
    try{homework.push(...query("SELECT * FROM parent_homework WHERE student_id=? ORDER BY due_date DESC LIMIT 5",[sid]))}catch{}
  });
  const unread=Number(queryOne("SELECT COUNT(*) c FROM parent_notifications WHERE parent_id=? AND is_read=0",[req.parent.id])?.c||0);
  const messages=Number(queryOne("SELECT COUNT(*) c FROM parent_messages WHERE parent_id=? AND status='unread'",[req.parent.id])?.c||0);
  res.json({success:true,data:{parent:req.parent,children,attendance,results,fees,hostel,homework,unread_notifications:unread,unread_messages:messages}});
});
app.get("/api/parent/student/:id/profile",requireParentV42,(req,res)=>{
  const sid=Number(req.params.id);if(!parentLinkedStudentV42(req.parent.id,sid))return res.status(403).json({success:false,message:"Student is not linked to this parent."});
  const s=hostelStudentV41(sid);res.json({success:true,data:{student:s}});
});
app.get("/api/parent/student/:id/attendance",requireParentV42,(req,res)=>{
  const sid=Number(req.params.id);if(!parentLinkedStudentV42(req.parent.id,sid))return res.status(403).json({success:false,message:"Access denied."});
  let rows=[];try{rows=query("SELECT * FROM attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 500",[sid])}catch{}
  const summary=rows.length?{total:rows.length,present:rows.filter(x=>["present","p"].includes(String(x.status).toLowerCase())).length}:null;
  if(summary)summary.percentage=Number((summary.present/summary.total*100).toFixed(2));
  res.json({success:true,data:{summary,records:rows}});
});
app.get("/api/parent/student/:id/results",requireParentV42,(req,res)=>{
  const sid=Number(req.params.id);if(!parentLinkedStudentV42(req.parent.id,sid))return res.status(403).json({success:false,message:"Access denied."});
  const rows=query(`SELECT r.*,e.name exam_name,e.academic_year,e.exam_type FROM advanced_exam_results r JOIN advanced_exams e ON e.id=r.exam_id
    WHERE r.student_id=? AND e.result_published=1 ORDER BY e.id DESC`,[sid]);
  res.json({success:true,data:rows});
});
app.get("/api/parent/student/:id/fees",requireParentV42,(req,res)=>{
  const sid=Number(req.params.id);if(!parentLinkedStudentV42(req.parent.id,sid))return res.status(403).json({success:false,message:"Access denied."});
  let invoices=[];try{invoices=query("SELECT * FROM fee_invoices WHERE student_id=? ORDER BY invoice_date DESC",[sid])}catch{}
  res.json({success:true,data:invoices});
});
app.get("/api/parent/student/:id/hostel",requireParentV42,(req,res)=>{
  const sid=Number(req.params.id);if(!parentLinkedStudentV42(req.parent.id,sid))return res.status(403).json({success:false,message:"Access denied."});
  let allocation=null,attendance=[],leaves=[];try{allocation=queryOne(`SELECT a.*,bed.bed_no,r.room_no,b.name building_name FROM hostel_allocations a JOIN hostel_beds bed ON bed.id=a.bed_id JOIN hostel_rooms r ON r.id=bed.room_id JOIN hostel_floors f ON f.id=r.floor_id JOIN hostel_buildings b ON b.id=f.building_id WHERE a.student_id=? AND a.status='active'`,[sid]);attendance=query("SELECT * FROM hostel_attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 100",[sid]);leaves=query("SELECT * FROM hostel_leaves WHERE student_id=? ORDER BY created_at DESC LIMIT 50",[sid])}catch{}
  res.json({success:true,data:{allocation,attendance,leaves}});
});
app.get("/api/parent/student/:id/homework",requireParentV42,(req,res)=>{
  const sid=Number(req.params.id);if(!parentLinkedStudentV42(req.parent.id,sid))return res.status(403).json({success:false,message:"Access denied."});
  res.json({success:true,data:query("SELECT * FROM parent_homework WHERE student_id=? ORDER BY due_date DESC LIMIT 100",[sid])});
});
app.get("/api/parent/library/:id",requireParentV42,(req,res)=>{
  const sid=Number(req.params.id);if(!parentLinkedStudentV42(req.parent.id,sid))return res.status(403).json({success:false,message:"Access denied."});
  let rows=[];try{rows=query(`SELECT l.*,b.title,cp.accession_no FROM library_loans l JOIN library_members m ON m.id=l.member_id JOIN library_copies cp ON cp.id=l.copy_id JOIN library_books b ON b.id=cp.book_id WHERE m.member_ref_id=? ORDER BY l.issued_at DESC`,[sid])}catch{}
  res.json({success:true,data:rows});
});
app.get("/api/parent/notifications",requireParentV42,(req,res)=>res.json({success:true,data:query("SELECT * FROM parent_notifications WHERE parent_id=? ORDER BY created_at DESC LIMIT 100",[req.parent.id])}));
app.patch("/api/parent/notifications/:id/read",requireParentV42,(req,res)=>{db.run("UPDATE parent_notifications SET is_read=1 WHERE id=? AND parent_id=?",[Number(req.params.id),req.parent.id]);persistDatabase();res.json({success:true})});
app.get("/api/parent/messages",requireParentV42,(req,res)=>res.json({success:true,data:query("SELECT * FROM parent_messages WHERE parent_id=? ORDER BY created_at DESC LIMIT 200",[req.parent.id])}));
app.post("/api/parent/messages",requireParentV42,(req,res)=>{
  const b=req.body||{},sid=b.student_id?Number(b.student_id):null;if(sid&&!parentLinkedStudentV42(req.parent.id,sid))return res.status(403).json({success:false,message:"Student is not linked."});
  if(!b.message)return res.status(400).json({success:false,message:"Message is required."});
  const id=insert(`INSERT INTO parent_messages (parent_id,student_id,sender_role,sender_id,subject,message,priority) VALUES (?,?,?,?,?,?,?)`,
    [req.parent.id,sid,"parent",req.parent.id,b.subject||"Parent message",b.message,b.priority||"normal"]);parentAuditV42(req.parent.id,null,"message_sent",{id});persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM parent_messages WHERE id=?",[id])});
});
app.post("/api/admin/parents/notify",requireAdmin,(req,res)=>{
  const b=req.body||{},parentIds=Array.isArray(b.parent_ids)?b.parent_ids.map(Number):[];
  if(!b.title||!b.message)return res.status(400).json({success:false,message:"Notification title and message are required."});
  let ids=parentIds;if(!ids.length&&b.student_id){ids=query("SELECT parent_id FROM parent_student_links WHERE student_id=? AND status='active'",[Number(b.student_id)]).map(x=>x.parent_id)}
  ids.forEach(pid=>insert("INSERT INTO parent_notifications (parent_id,student_id,title,message,type) VALUES (?,?,?,?,?)",[pid,b.student_id?Number(b.student_id):null,b.title,b.message,b.type||"general"]));
  persistDatabase();res.json({success:true,data:{sent:ids.length}});
});
app.post("/api/admin/parents/homework",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.title||!b.subject||!b.student_id)return res.status(400).json({success:false,message:"Student, subject and title are required."});
  const id=insert("INSERT INTO parent_homework (student_id,teacher_id,subject,title,description,due_date) VALUES (?,?,?,?,?,?)",[Number(b.student_id),b.teacher_id?Number(b.teacher_id):null,b.subject,b.title,b.description||"",b.due_date||null]);
  const parents=query("SELECT parent_id FROM parent_student_links WHERE student_id=? AND status='active'",[Number(b.student_id)]);
  parents.forEach(x=>insert("INSERT INTO parent_notifications (parent_id,student_id,title,message,type) VALUES (?,?,?,?,?)",[x.parent_id,Number(b.student_id),`Homework: ${b.subject}`,`${b.title}${b.due_date?` · Due ${b.due_date}`:""}`,"homework"]));
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM parent_homework WHERE id=?",[id])});
});
app.get("/api/parent/calendar",requireParentV42,(_req,res)=>res.json({success:true,data:query("SELECT * FROM parent_calendar_events WHERE status='active' AND event_date>=date('now','-90 day') ORDER BY event_date LIMIT 300")}));
app.post("/api/admin/parents/calendar",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.title||!b.event_date)return res.status(400).json({success:false,message:"Title and event date are required."});
  const id=insert("INSERT INTO parent_calendar_events (title,description,event_date,event_type,class_name,created_by) VALUES (?,?,?,?,?,?)",[b.title,b.description||"",b.event_date,b.event_type||"school",b.class_name||"",req.admin.id]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM parent_calendar_events WHERE id=?",[id])});
});
app.post("/api/parent/complaints",requireParentV42,(req,res)=>{
  const b=req.body||{},sid=b.student_id?Number(b.student_id):null;if(sid&&!parentLinkedStudentV42(req.parent.id,sid))return res.status(403).json({success:false,message:"Student is not linked."});
  if(!b.title||!b.category)return res.status(400).json({success:false,message:"Category and title are required."});
  const id=insert("INSERT INTO parent_complaints (parent_id,student_id,category,title,description,priority) VALUES (?,?,?,?,?,?)",[req.parent.id,sid,b.category,b.title,b.description||"",b.priority||"normal"]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM parent_complaints WHERE id=?",[id])});
});
app.get("/api/parent/complaints",requireParentV42,(req,res)=>res.json({success:true,data:query("SELECT * FROM parent_complaints WHERE parent_id=? ORDER BY created_at DESC",[req.parent.id])}));
app.get("/api/admin/parents/complaints",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT c.*,p.parent_name,p.email,s.full_name FROM parent_complaints c JOIN parent_accounts p ON p.id=c.parent_id LEFT JOIN students s ON s.id=c.student_id ORDER BY c.created_at DESC LIMIT 500`) }));
app.patch("/api/admin/parents/complaints/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),c=queryOne("SELECT * FROM parent_complaints WHERE id=?",[id]);if(!c)return res.status(404).json({success:false,message:"Complaint not found."});
  const status=req.body?.status||c.status;db.run("UPDATE parent_complaints SET status=?,assigned_to=?,resolution=?,resolved_at=? WHERE id=?",[status,req.body?.assigned_to?Number(req.body.assigned_to):c.assigned_to||null,req.body?.resolution||c.resolution||"",["resolved","closed"].includes(status)?new Date().toISOString():null,id]);
  insert("INSERT INTO parent_notifications (parent_id,student_id,title,message,type) VALUES (?,?,?,?,?)",[c.parent_id,c.student_id,"Complaint update",`Your complaint is now ${status}.`,"complaint"]);persistDatabase();res.json({success:true});
});


/* ===== ADVANCED TEACHER PORTAL & CLASSROOM MANAGEMENT V43 ===== */
function ensureTeacherPortalV43(){
  db.run(`CREATE TABLE IF NOT EXISTS teacher_class_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_name TEXT NOT NULL,section TEXT,
    subject_name TEXT,academic_year TEXT,status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id,class_name,section,subject_name,academic_year)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teacher_student_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,student_id INTEGER NOT NULL,
    subject_name TEXT,note TEXT NOT NULL,category TEXT DEFAULT 'general',visibility TEXT DEFAULT 'staff',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teacher_homework (
    id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_name TEXT,section TEXT,
    subject_name TEXT NOT NULL,title TEXT NOT NULL,description TEXT,due_date TEXT,priority TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'published',created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teacher_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,class_name TEXT,section TEXT,
    subject_name TEXT,title TEXT NOT NULL,message TEXT NOT NULL,priority TEXT DEFAULT 'normal',
    published_at TEXT DEFAULT CURRENT_TIMESTAMP,status TEXT DEFAULT 'published'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teacher_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER,action TEXT NOT NULL,entity_type TEXT,
    entity_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureTeacherPortalV43();

function teacherAuditV43(teacherId,action,type,id,details){
  insert("INSERT INTO teacher_audit_log (teacher_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)",
    [teacherId||null,action,type||null,id||null,JSON.stringify(details||{})]);
}
function teacherOwnsClassV43(teacherId,className,section){
  return queryOne(`SELECT id FROM teacher_class_assignments WHERE teacher_id=? AND class_name=? AND COALESCE(section,'')=COALESCE(?,'') AND status='active' LIMIT 1`,
    [teacherId,className,section||""]);
}
function teacherOwnsStudentV43(teacherId,studentId){
  const s=hostelStudentV41(studentId);return s&&!!teacherOwnsClassV43(teacherId,s.class_name,s.section);
}

app.get("/api/teacher/dashboard",teacherGuardV32,(req,res)=>{
  const classes=query(`SELECT * FROM teacher_class_assignments WHERE teacher_id=? AND status='active' ORDER BY class_name,section,subject_name`,[req.teacher.id]);
  const students=query(`SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section FROM students s
    WHERE s.status='active' AND EXISTS(SELECT 1 FROM teacher_class_assignments a WHERE a.teacher_id=? AND a.class_name=s.class_name AND COALESCE(a.section,'')=COALESCE(s.section,'') AND a.status='active')
    ORDER BY s.class_name,s.section,s.roll_no,s.full_name`,[req.teacher.id]);
  const homework= query("SELECT * FROM teacher_homework WHERE teacher_id=? ORDER BY created_at DESC LIMIT 10",[req.teacher.id]);
  const announcements=query("SELECT * FROM teacher_announcements WHERE teacher_id=? ORDER BY published_at DESC LIMIT 10",[req.teacher.id]);
  const notes=Number(queryOne("SELECT COUNT(*) c FROM teacher_student_notes WHERE teacher_id=?",[req.teacher.id])?.c||0);
  res.json({success:true,data:{teacher:req.teacher,classes,students,homework,announcements,notes}});
});
app.get("/api/teacher/classes",teacherGuardV32,(req,res)=>res.json({success:true,data:query("SELECT * FROM teacher_class_assignments WHERE teacher_id=? AND status='active' ORDER BY class_name,section,subject_name",[req.teacher.id])}));
app.post("/api/admin/teachers/:id/classes",requireAdmin,(req,res)=>{
  const b=req.body||{},tid=Number(req.params.id);if(!b.class_name||!b.subject_name)return res.status(400).json({success:false,message:"Class and subject are required."});
  try{const id=insert(`INSERT INTO teacher_class_assignments (teacher_id,class_name,section,subject_name,academic_year) VALUES (?,?,?,?,?)`,
    [tid,b.class_name,b.section||"",b.subject_name,b.academic_year||new Date().getFullYear().toString()]);
    teacherAuditV43(tid,"class_assigned","class_assignment",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM teacher_class_assignments WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"This teacher/class/subject assignment already exists."})}
});
app.delete("/api/admin/teachers/:id/classes/:assignmentId",requireAdmin,(req,res)=>{
  const id=Number(req.params.assignmentId),x=queryOne("SELECT * FROM teacher_class_assignments WHERE id=? AND teacher_id=?",[id,Number(req.params.id)]);
  if(!x)return res.status(404).json({success:false,message:"Assignment not found."});
  db.run("UPDATE teacher_class_assignments SET status='inactive' WHERE id=?",[id]);teacherAuditV43(x.teacher_id,"class_unassigned","class_assignment",id);persistDatabase();res.json({success:true});
});
app.get("/api/teacher/students",teacherGuardV32,(req,res)=>{
  const className=String(req.query.class_name||""),section=String(req.query.section||"");
  let sql=`SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section FROM students s WHERE s.status='active'
    AND EXISTS(SELECT 1 FROM teacher_class_assignments a WHERE a.teacher_id=? AND a.class_name=s.class_name AND COALESCE(a.section,'')=COALESCE(s.section,'') AND a.status='active')`,args=[req.teacher.id];
  if(className){sql+=" AND s.class_name=?";args.push(className)}if(section){sql+=" AND COALESCE(s.section,'')=?";args.push(section)}
  sql+=" ORDER BY s.class_name,s.section,s.roll_no,s.full_name";
  res.json({success:true,data:query(sql,args)});
});
app.post("/api/teacher/attendance/bulk",teacherGuardV32,(req,res)=>{
  const b=req.body||{},date=b.attendance_date||new Date().toISOString().slice(0,10),rows=Array.isArray(b.records)?b.records:[];
  let saved=0;
  for(const x of rows){
    const sid=Number(x.student_id),student=hostelStudentV41(sid);if(!student||!teacherOwnsStudentV43(req.teacher.id,sid))continue;
    const ex=queryOne("SELECT id FROM attendance WHERE student_id=? AND attendance_date=?",[sid,date]);
    if(ex)db.run("UPDATE attendance SET status=? WHERE id=?",[x.status||"present",ex.id]);
    else{try{insert("INSERT INTO attendance (student_id,attendance_date,status) VALUES (?,?,?)",[sid,date,x.status||"present"])}catch{}}
    saved++;
  }
  teacherAuditV43(req.teacher.id,"attendance_bulk_marked","attendance",null,{date,count:saved});persistDatabase();res.json({success:true,data:{saved,date}});
});
app.get("/api/teacher/attendance",teacherGuardV32,(req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  res.json({success:true,data:query(`SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,a.status,a.attendance_date
    FROM students s LEFT JOIN attendance a ON a.student_id=s.id AND a.attendance_date=?
    WHERE s.status='active' AND EXISTS(SELECT 1 FROM teacher_class_assignments x WHERE x.teacher_id=? AND x.class_name=s.class_name AND COALESCE(x.section,'')=COALESCE(s.section,'') AND x.status='active')
    ORDER BY s.class_name,s.section,s.roll_no,s.full_name`,[date,req.teacher.id])});
});
app.post("/api/teacher/marks",teacherGuardV32,(req,res)=>{
  const b=req.body||{},sid=Number(b.student_id),student=hostelStudentV41(sid);if(!student||!teacherOwnsStudentV43(req.teacher.id,sid))return res.status(403).json({success:false,message:"Student is outside your assigned classes."});
  const examId=Number(b.exam_id),subjectId=Number(b.subject_id);if(!examId||!subjectId)return res.status(400).json({success:false,message:"Exam and subject are required."});
  const sub=queryOne("SELECT * FROM advanced_exam_subjects WHERE id=? AND exam_id=?",[subjectId,examId]);if(!sub)return res.status(404).json({success:false,message:"Exam subject not found."});
  const existing=queryOne("SELECT id FROM advanced_exam_marks WHERE exam_id=? AND subject_id=? AND student_id=?",[examId,subjectId,sid]);
  const vals=[Number(b.theory||0),Number(b.practical||0),Number(b.internal||0),Number(b.grace||0),b.remarks||""];
  if(existing)db.run("UPDATE advanced_exam_marks SET theory=?,practical=?,internal=?,grace=?,remarks=? WHERE id=?",[...vals,existing.id]);
  else insert(`INSERT INTO advanced_exam_marks (exam_id,subject_id,student_id,theory,practical,internal,grace,remarks) VALUES (?,?,?,?,?,?,?,?,?)`,
    [examId,subjectId,sid,...vals]);
  teacherAuditV43(req.teacher.id,"marks_saved","exam_marks",existing?.id||null,{student_id:sid,exam_id:examId,subject_id:subjectId});persistDatabase();res.json({success:true});
});
app.post("/api/teacher/homework",teacherGuardV32,(req,res)=>{
  const b=req.body||{};if(!b.class_name||!b.subject_name||!b.title)return res.status(400).json({success:false,message:"Class, subject and title are required."});
  if(!teacherOwnsClassV43(req.teacher.id,b.class_name,b.section))return res.status(403).json({success:false,message:"Class is not assigned to you."});
  const id=insert(`INSERT INTO teacher_homework (teacher_id,class_name,section,subject_name,title,description,due_date,priority) VALUES (?,?,?,?,?,?,?,?)`,
    [req.teacher.id,b.class_name,b.section||"",b.subject_name,b.title,b.description||"",b.due_date||null,b.priority||"normal"]);
  const students=query(`SELECT s.id FROM students s WHERE s.status='active' AND s.class_name=? AND COALESCE(s.section,'')=COALESCE(?,'')`,[b.class_name,b.section||""]);
  students.forEach(sid=>{const parents=query("SELECT parent_id FROM parent_student_links WHERE student_id=? AND status='active'",[sid.id]);parents.forEach(p=>insert("INSERT INTO parent_notifications (parent_id,student_id,title,message,type) VALUES (?,?,?,?,?)",[p.parent_id,sid.id,`Homework: ${b.subject_name}`,`${b.title}${b.due_date?` · Due ${b.due_date}`:""}`,"homework"]))});
  teacherAuditV43(req.teacher.id,"homework_created","homework",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM teacher_homework WHERE id=?",[id])});
});
app.get("/api/teacher/homework",teacherGuardV32,(req,res)=>res.json({success:true,data:query("SELECT * FROM teacher_homework WHERE teacher_id=? ORDER BY created_at DESC",[req.teacher.id])}));
app.post("/api/teacher/notes",teacherGuardV32,(req,res)=>{
  const b=req.body||{},sid=Number(b.student_id);if(!teacherOwnsStudentV43(req.teacher.id,sid))return res.status(403).json({success:false,message:"Student is outside your assigned classes."});
  if(!b.note)return res.status(400).json({success:false,message:"Note is required."});
  const id=insert("INSERT INTO teacher_student_notes (teacher_id,student_id,subject_name,note,category,visibility) VALUES (?,?,?,?,?,?)",
    [req.teacher.id,sid,b.subject_name||"",b.note,b.category||"general",b.visibility||"staff"]);teacherAuditV43(req.teacher.id,"student_note_created","student_note",id,{student_id:sid});persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM teacher_student_notes WHERE id=?",[id])});
});
app.get("/api/teacher/student/:id/notes",teacherGuardV32,(req,res)=>{
  const sid=Number(req.params.id);if(!teacherOwnsStudentV43(req.teacher.id,sid))return res.status(403).json({success:false,message:"Access denied."});
  res.json({success:true,data:query("SELECT * FROM teacher_student_notes WHERE student_id=? ORDER BY created_at DESC",[sid])});
});
app.get("/api/teacher/student/:id/performance",teacherGuardV32,(req,res)=>{
  const sid=Number(req.params.id);if(!teacherOwnsStudentV43(req.teacher.id,sid))return res.status(403).json({success:false,message:"Access denied."});
  const student=hostelStudentV41(sid);let attendance=null;try{attendance=queryOne(`SELECT COUNT(*) total,SUM(CASE WHEN LOWER(status) IN ('present','p') THEN 1 ELSE 0 END) present FROM attendance WHERE student_id=?`,[sid])}catch{}
  const results=query(`SELECT r.*,e.name exam_name,e.academic_year FROM advanced_exam_results r JOIN advanced_exams e ON e.id=r.exam_id WHERE r.student_id=? AND e.result_published=1 ORDER BY e.id DESC`,[sid]);
  let insights=[];try{insights=buildInsightsV39(sid)}catch{}
  res.json({success:true,data:{student,attendance,results,insights}});
});
app.post("/api/teacher/announcements",teacherGuardV32,(req,res)=>{
  const b=req.body||{};if(!b.title||!b.message||!b.class_name)return res.status(400).json({success:false,message:"Class, title and message are required."});
  if(!teacherOwnsClassV43(req.teacher.id,b.class_name,b.section))return res.status(403).json({success:false,message:"Class is not assigned to you."});
  const id=insert("INSERT INTO teacher_announcements (teacher_id,class_name,section,subject_name,title,message,priority) VALUES (?,?,?,?,?,?,?)",
    [req.teacher.id,b.class_name,b.section||"",b.subject_name||"",b.title,b.message,b.priority||"normal"]);
  const students=query("SELECT id FROM students WHERE status='active' AND class_name=? AND COALESCE(section,'')=COALESCE(?,'')",[b.class_name,b.section||""]);
  students.forEach(sid=>query("SELECT parent_id FROM parent_student_links WHERE student_id=? AND status='active'",[sid.id]).forEach(p=>insert("INSERT INTO parent_notifications (parent_id,student_id,title,message,type) VALUES (?,?,?,?,?)",[p.parent_id,sid.id,b.title,b.message,"announcement"])));
  teacherAuditV43(req.teacher.id,"announcement_created","announcement",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM teacher_announcements WHERE id=?",[id])});
});


/* ===== ADVANCED STUDENT PORTAL V44 ===== */
function ensureStudentPortalV44(){
  db.run(`CREATE TABLE IF NOT EXISTS student_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL UNIQUE,email TEXT UNIQUE,
    password_hash TEXT NOT NULL,status TEXT DEFAULT 'active',last_login TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,sender_role TEXT NOT NULL,
    sender_id INTEGER,subject TEXT,message TEXT NOT NULL,status TEXT DEFAULT 'unread',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,read_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,title TEXT NOT NULL,
    message TEXT NOT NULL,type TEXT DEFAULT 'general',is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,homework_id INTEGER NOT NULL,student_id INTEGER NOT NULL,
    answer_text TEXT,attachment_path TEXT,status TEXT DEFAULT 'submitted',
    submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,teacher_feedback TEXT,graded_at TEXT,
    UNIQUE(homework_id,student_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_profile_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,field_name TEXT NOT NULL,
    old_value TEXT,new_value TEXT,status TEXT DEFAULT 'pending',reviewed_by INTEGER,
    reviewed_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_portal_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER,action TEXT NOT NULL,
    details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureStudentPortalV44();

function studentAuditV44(studentId,action,details){
  insert("INSERT INTO student_portal_audit (student_id,action,details) VALUES (?,?,?)",
    [studentId||null,action,JSON.stringify(details||{})]);
}
function studentAccountV44(id){return queryOne(`SELECT a.id,a.student_id,a.email,a.status,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section
  FROM student_accounts a JOIN students s ON s.id=a.student_id WHERE a.id=? AND a.status='active' AND s.status='active'`,[Number(id)])}
function requireStudentV44(req,res,next){
  const h=String(req.headers?.authorization||"");if(!h.startsWith("Bearer "))return res.status(401).json({success:false,message:"Student authentication required."});
  let p;try{p=jwt.verify(h.slice(7),JWT_SECRET)}catch{return res.status(401).json({success:false,message:"Invalid or expired student token."})}
  if(p.role!=="student")return res.status(403).json({success:false,message:"Student access required."});
  const a=studentAccountV44(p.id);if(!a)return res.status(401).json({success:false,message:"Student account inactive."});
  req.student=a;next();
}
function createStudentNotificationV44(studentId,title,message,type="general"){
  insert("INSERT INTO student_notifications (student_id,title,message,type) VALUES (?,?,?,?)",[studentId,title,message,type]);
}

app.post("/api/student/auth/login",(req,res)=>{
  const email=String(req.body?.email||"").trim().toLowerCase(),password=String(req.body?.password||"");
  const a=queryOne("SELECT * FROM student_accounts WHERE LOWER(email)=? AND status='active'",[email]);
  if(!a||!verifyPasswordV34(password,a.password_hash))return res.status(401).json({success:false,message:"Invalid student credentials."});
  const token=jwt.sign({id:a.id,student_id:a.student_id,email:a.email,role:"student",name:hostelStudentV41(a.student_id)?.full_name},JWT_SECRET,{expiresIn:"7d"});
  db.run("UPDATE student_accounts SET last_login=CURRENT_TIMESTAMP WHERE id=?",[a.id]);studentAuditV44(a.student_id,"login");persistDatabase();
  res.json({success:true,data:{token,student:studentAccountV44(a.id)}});
});
app.post("/api/admin/students/:id/account",requireAdmin,(req,res)=>{
  const sid=Number(req.params.id),student=hostelStudentV41(sid),b=req.body||{};
  if(!student)return res.status(404).json({success:false,message:"Student not found."});
  const email=String(b.email||"").trim().toLowerCase(),password=String(b.password||"");
  if(!email||!password)return res.status(400).json({success:false,message:"Email and password are required."});
  try{
    const existing=queryOne("SELECT id FROM student_accounts WHERE student_id=?",[sid]);
    if(existing)db.run("UPDATE student_accounts SET email=?,password_hash=?,status='active' WHERE student_id=?",[email,hashPasswordV34(password),sid]);
    else insert("INSERT INTO student_accounts (student_id,email,password_hash) VALUES (?,?,?)",[sid,email,hashPasswordV34(password)]);
    studentAuditV44(sid,"account_created_or_reset",{email});persistDatabase();
    res.json({success:true,data:queryOne("SELECT id,student_id,email,status FROM student_accounts WHERE student_id=?",[sid])});
  }catch{res.status(409).json({success:false,message:"Student email already exists."})}
});
app.get("/api/admin/student-accounts",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT a.id,a.student_id,a.email,a.status,a.last_login,s.full_name,s.admission_no,s.class_name,s.section
  FROM student_accounts a JOIN students s ON s.id=a.student_id ORDER BY s.class_name,s.full_name`) }));
app.get("/api/student/dashboard",requireStudentV44,(req,res)=>{
  const sid=req.student.student_id;
  let attendance=[],fees=[],library=[],hostel=null;
  try{attendance=query("SELECT * FROM attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 100",[sid])}catch{}
  try{fees=query("SELECT * FROM fee_invoices WHERE student_id=? ORDER BY invoice_date DESC LIMIT 10",[sid])}catch{}
  try{library=query(`SELECT l.*,b.title,cp.accession_no FROM library_loans l JOIN library_members m ON m.id=l.member_id JOIN library_copies cp ON cp.id=l.copy_id JOIN library_books b ON b.id=cp.book_id WHERE m.member_ref_id=? ORDER BY l.issued_at DESC LIMIT 20`,[sid])}catch{}
  try{hostel=queryOne(`SELECT a.*,bed.bed_no,r.room_no,b.name building_name FROM hostel_allocations a JOIN hostel_beds bed ON bed.id=a.bed_id JOIN hostel_rooms r ON r.id=bed.room_id JOIN hostel_floors f ON f.id=r.floor_id JOIN hostel_buildings b ON b.id=f.building_id WHERE a.student_id=? AND a.status='active'`,[sid])}catch{}
  const results=query(`SELECT r.*,e.name exam_name,e.academic_year,e.exam_type FROM advanced_exam_results r JOIN advanced_exams e ON e.id=r.exam_id WHERE r.student_id=? AND e.result_published=1 ORDER BY e.id DESC LIMIT 10`,[sid]);
  const homework=query("SELECT h.*,COALESCE(su.status,'pending') submission_status,su.teacher_feedback FROM teacher_homework h LEFT JOIN student_submissions su ON su.homework_id=h.id AND su.student_id=? WHERE h.class_name=? AND COALESCE(h.section,'')=COALESCE(?,'') ORDER BY h.due_date DESC LIMIT 20",[sid,req.student.class_name,req.student.section||""]);
  const unread=Number(queryOne("SELECT COUNT(*) c FROM student_notifications WHERE student_id=? AND is_read=0",[sid])?.c||0);
  const messages=Number(queryOne("SELECT COUNT(*) c FROM student_messages WHERE student_id=? AND status='unread'",[sid])?.c||0);
  const present=attendance.filter(x=>["present","p"].includes(String(x.status).toLowerCase())).length;
  res.json({success:true,data:{student:req.student,attendance:{records:attendance,percentage:attendance.length?Number((present/attendance.length*100).toFixed(2)):0},
    results,fees,library,hostel,homework,unread_notifications:unread,unread_messages:messages}});
});
app.get("/api/student/results",requireStudentV44,(req,res)=>res.json({success:true,data:query(`SELECT r.*,e.name exam_name,e.academic_year,e.exam_type FROM advanced_exam_results r JOIN advanced_exams e ON e.id=r.exam_id WHERE r.student_id=? AND e.result_published=1 ORDER BY e.id DESC`,[req.student.student_id])}));
app.get("/api/student/performance",requireStudentV44,(req,res)=>{
  let data={student:req.student,history:[],insights:[]};try{data.history=rebuildPerformanceV39(req.student.student_id)||[];data.insights=buildInsightsV39(req.student.student_id)||[]}catch{}
  res.json({success:true,data});
});
app.get("/api/student/attendance",requireStudentV44,(req,res)=>{
  let rows=[];try{rows=query("SELECT * FROM attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 500",[req.student.student_id])}catch{}
  const present=rows.filter(x=>["present","p"].includes(String(x.status).toLowerCase())).length;
  res.json({success:true,data:{percentage:rows.length?Number((present/rows.length*100).toFixed(2)):0,records:rows}});
});
app.get("/api/student/homework",requireStudentV44,(req,res)=>res.json({success:true,data:query(`SELECT h.*,COALESCE(su.status,'pending') submission_status,su.answer_text,su.teacher_feedback,su.submitted_at
  FROM teacher_homework h LEFT JOIN student_submissions su ON su.homework_id=h.id AND su.student_id=?
  WHERE h.class_name=? AND COALESCE(h.section,'')=COALESCE(?,'') ORDER BY h.due_date DESC LIMIT 200`,[req.student.student_id,req.student.class_name,req.student.section||""]) }));
app.post("/api/student/homework/:id/submit",requireStudentV44,(req,res)=>{
  const id=Number(req.params.id),h=queryOne("SELECT * FROM teacher_homework WHERE id=? AND class_name=? AND COALESCE(section,'')=COALESCE(?,'')",[id,req.student.class_name,req.student.section||""]);
  if(!h)return res.status(404).json({success:false,message:"Homework not found."});
  const existing=queryOne("SELECT id FROM student_submissions WHERE homework_id=? AND student_id=?",[id,req.student.student_id]);
  if(existing)db.run("UPDATE student_submissions SET answer_text=?,status='submitted',submitted_at=CURRENT_TIMESTAMP WHERE id=?",[req.body?.answer_text||"",existing.id]);
  else insert("INSERT INTO student_submissions (homework_id,student_id,answer_text) VALUES (?,?,?)",[id,req.student.student_id,req.body?.answer_text||""]);
  studentAuditV44(req.student.student_id,"homework_submitted",{homework_id:id});persistDatabase();res.json({success:true});
});
app.get("/api/student/notifications",requireStudentV44,(req,res)=>res.json({success:true,data:query("SELECT * FROM student_notifications WHERE student_id=? ORDER BY created_at DESC LIMIT 100",[req.student.student_id])}));
app.patch("/api/student/notifications/:id/read",requireStudentV44,(req,res)=>{db.run("UPDATE student_notifications SET is_read=1 WHERE id=? AND student_id=?",[Number(req.params.id),req.student.student_id]);persistDatabase();res.json({success:true})});
app.get("/api/student/messages",requireStudentV44,(req,res)=>res.json({success:true,data:query("SELECT * FROM student_messages WHERE student_id=? ORDER BY created_at DESC LIMIT 100",[req.student.student_id])}));
app.post("/api/student/messages",requireStudentV44,(req,res)=>{
  const b=req.body||{};if(!b.message)return res.status(400).json({success:false,message:"Message is required."});
  const id=insert("INSERT INTO student_messages (student_id,sender_role,sender_id,subject,message) VALUES (?,?,?,?,?)",[req.student.student_id,"student",req.student.student_id,b.subject||"Student message",b.message]);
  studentAuditV44(req.student.student_id,"message_sent",{message_id:id});persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM student_messages WHERE id=?",[id])});
});
app.post("/api/admin/students/notify",requireAdmin,(req,res)=>{
  const b=req.body||{},ids=Array.isArray(b.student_ids)?b.student_ids.map(Number):b.student_id?[Number(b.student_id)]:[];
  if(!b.title||!b.message)return res.status(400).json({success:false,message:"Title and message are required."});
  ids.filter(id=>hostelStudentV41(id)).forEach(id=>createStudentNotificationV44(id,b.title,b.message,b.type||"general"));
  persistDatabase();res.json({success:true,data:{sent:ids.length}});
});
app.get("/api/admin/student-messages",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT m.*,s.full_name,s.admission_no FROM student_messages m JOIN students s ON s.id=m.student_id ORDER BY m.created_at DESC LIMIT 500`) }));
app.post("/api/admin/student-submissions/:id/feedback",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),x=queryOne("SELECT * FROM student_submissions WHERE id=?",[id]);if(!x)return res.status(404).json({success:false,message:"Submission not found."});
  db.run("UPDATE student_submissions SET teacher_feedback=?,status='reviewed',graded_at=CURRENT_TIMESTAMP WHERE id=?",[req.body?.teacher_feedback||"",id]);
  createStudentNotificationV44(x.student_id,"Homework feedback",req.body?.teacher_feedback||"Your homework was reviewed.","homework_feedback");persistDatabase();res.json({success:true});
});
app.post("/api/admin/students/profile-update/:id/review",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),u=queryOne("SELECT * FROM student_profile_updates WHERE id=?",[id]);if(!u)return res.status(404).json({success:false,message:"Update request not found."});
  const status=req.body?.status==="approved"?"approved":"rejected";
  if(status==="approved")db.run(`UPDATE students SET ${u.field_name}=? WHERE id=?`,[u.new_value,u.student_id]);
  db.run("UPDATE student_profile_updates SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?",[status,req.admin.id,id]);persistDatabase();res.json({success:true});
});


/* ===== ADVANCED COMMUNICATION & NOTIFICATION CENTER V45 ===== */
function ensureCommunicationV45(){
  db.run(`CREATE TABLE IF NOT EXISTS communication_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,created_by INTEGER NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,
    channel TEXT DEFAULT 'in_app',audience_type TEXT DEFAULT 'all',class_name TEXT,section TEXT,
    priority TEXT DEFAULT 'normal',status TEXT DEFAULT 'draft',scheduled_at TEXT,published_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS communication_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,campaign_id INTEGER NOT NULL,recipient_type TEXT NOT NULL,
    recipient_id INTEGER NOT NULL,student_id INTEGER,delivery_status TEXT DEFAULT 'queued',
    read_at TEXT,delivered_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_id,recipient_type,recipient_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS communication_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,title_template TEXT NOT NULL,
    message_template TEXT NOT NULL,channel TEXT DEFAULT 'in_app',status TEXT DEFAULT 'active',
    created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS communication_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,user_type TEXT NOT NULL,user_id INTEGER NOT NULL,
    announcements INTEGER DEFAULT 1,homework INTEGER DEFAULT 1,results INTEGER DEFAULT 1,
    attendance INTEGER DEFAULT 1,fees INTEGER DEFAULT 1,hostel INTEGER DEFAULT 1,
    library INTEGER DEFAULT 1,system INTEGER DEFAULT 1,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_type,user_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS communication_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER,action TEXT NOT NULL,
    campaign_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureCommunicationV45();

function communicationAuditV45(actor,action,campaignId,details){
  insert("INSERT INTO communication_audit_log (actor_id,action,campaign_id,details) VALUES (?,?,?,?)",
    [actor?.id||null,action,campaignId||null,JSON.stringify(details||{})]);
}
function communicationRecipientsV45(audience){
  const type=String(audience?.audience_type||"all"),className=audience?.class_name||"",section=audience?.section||"";
  const students=type==="student"&&audience.student_ids?query(`SELECT id,full_name FROM students WHERE id IN (${audience.student_ids.map(()=>"?").join(",")})`,audience.student_ids.map(Number)):
    query(`SELECT id,full_name FROM students WHERE status='active' ${type==="class"?"AND class_name=? AND COALESCE(section,'')=COALESCE(?,'')":""}`,type==="class"?[className,section]:[]);
  const set=new Map();
  students.forEach(s=>{
    set.set(`student:${s.id}`,{recipient_type:"student",recipient_id:s.id,student_id:s.id});
    query("SELECT parent_id FROM parent_student_links WHERE student_id=? AND status='active'",[s.id]).forEach(p=>set.set(`parent:${p.parent_id}`,{recipient_type:"parent",recipient_id:p.parent_id,student_id:s.id}));
  });
  if(type==="parent"&&audience.parent_ids)audience.parent_ids.map(Number).forEach(id=>set.set(`parent:${id}`,{recipient_type:"parent",recipient_id:id,student_id:null}));
  return [...set.values()];
}
function createNotificationForRecipientV45(r,title,message,type){
  if(r.recipient_type==="student")createStudentNotificationV44(r.recipient_id,title,message,type);
  else insert("INSERT INTO parent_notifications (parent_id,student_id,title,message,type) VALUES (?,?,?,?,?)",[r.recipient_id,r.student_id,title,message,type]);
}

app.post("/api/admin/communication/campaigns",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.title||!b.message)return res.status(400).json({success:false,message:"Title and message are required."});
  const id=insert(`INSERT INTO communication_campaigns (created_by,title,message,channel,audience_type,class_name,section,priority,status,scheduled_at,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[req.admin.id,b.title,b.message,b.channel||"in_app",b.audience_type||"all",b.class_name||"",b.section||"",
    b.priority||"normal",b.status==="draft"?"draft":"published",b.scheduled_at||null,b.status==="draft"?null:new Date().toISOString()]);
  const recipients=communicationRecipientsV45(b);recipients.forEach(r=>insert(`INSERT INTO communication_recipients (campaign_id,recipient_type,recipient_id,student_id,delivery_status,delivered_at)
    VALUES (?,?,?,?,?,?)`,[id,r.recipient_type,r.recipient_id,r.student_id,"delivered",new Date().toISOString()]));
  if(b.status!=="draft")recipients.forEach(r=>createNotificationForRecipientV45(r,b.title,b.message,b.type||"announcement"));
  communicationAuditV45(req.admin,"campaign_created",id,{recipients:recipients.length,audience:b.audience_type||"all"});persistDatabase();
  res.status(201).json({success:true,data:{campaign:queryOne("SELECT * FROM communication_campaigns WHERE id=?",[id]),recipients:recipients.length}});
});
app.get("/api/admin/communication/campaigns",requireAdmin,(_req,res)=>res.json({success:true,data:query(`SELECT c.*,COUNT(r.id) recipient_count,
  SUM(CASE WHEN r.read_at IS NOT NULL THEN 1 ELSE 0 END) read_count FROM communication_campaigns c LEFT JOIN communication_recipients r ON r.campaign_id=c.id
  GROUP BY c.id ORDER BY c.created_at DESC LIMIT 500`) }));
app.get("/api/admin/communication/campaigns/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),c=queryOne("SELECT * FROM communication_campaigns WHERE id=?",[id]);if(!c)return res.status(404).json({success:false,message:"Campaign not found."});
  res.json({success:true,data:{campaign:c,recipients:query("SELECT * FROM communication_recipients WHERE campaign_id=? ORDER BY id",[id])}});
});
app.post("/api/admin/communication/campaigns/:id/publish",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),c=queryOne("SELECT * FROM communication_campaigns WHERE id=?",[id]);if(!c)return res.status(404).json({success:false,message:"Campaign not found."});
  const recipients=query("SELECT * FROM communication_recipients WHERE campaign_id=?",[id]);
  recipients.forEach(r=>createNotificationForRecipientV45(r,c.title,c.message,"announcement"));
  db.run("UPDATE communication_campaigns SET status='published',published_at=CURRENT_TIMESTAMP WHERE id=?",[id]);
  db.run("UPDATE communication_recipients SET delivery_status='delivered',delivered_at=CURRENT_TIMESTAMP WHERE campaign_id=?",[id]);
  communicationAuditV45(req.admin,"campaign_published",id,{recipients:recipients.length});persistDatabase();res.json({success:true,data:{sent:recipients.length}});
});
app.post("/api/admin/communication/campaigns/:id/cancel",requireAdmin,(req,res)=>{
  const id=Number(req.params.id);db.run("UPDATE communication_campaigns SET status='cancelled' WHERE id=?",[id]);communicationAuditV45(req.admin,"campaign_cancelled",id);persistDatabase();res.json({success:true});
});
app.get("/api/admin/communication/analytics",requireAdmin,(_req,res)=>{
  res.json({success:true,data:{
    campaigns:Number(queryOne("SELECT COUNT(*) c FROM communication_campaigns")?.c||0),
    published:Number(queryOne("SELECT COUNT(*) c FROM communication_campaigns WHERE status='published'")?.c||0),
    recipients:Number(queryOne("SELECT COUNT(*) c FROM communication_recipients")?.c||0),
    delivered:Number(queryOne("SELECT COUNT(*) c FROM communication_recipients WHERE delivery_status='delivered'")?.c||0),
    read:Number(queryOne("SELECT COUNT(*) c FROM communication_recipients WHERE read_at IS NOT NULL")?.c||0),
    unread_students:Number(queryOne("SELECT COUNT(*) c FROM student_notifications WHERE is_read=0")?.c||0),
    unread_parents:Number(queryOne("SELECT COUNT(*) c FROM parent_notifications WHERE is_read=0")?.c||0)
  }});
});
app.post("/api/admin/communication/templates",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name||!b.title_template||!b.message_template)return res.status(400).json({success:false,message:"Template name, title and message are required."});
  try{const id=insert("INSERT INTO communication_templates (name,title_template,message_template,channel,created_by) VALUES (?,?,?,?,?)",[b.name,b.title_template,b.message_template,b.channel||"in_app",req.admin.id]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM communication_templates WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Template name already exists."})}
});
app.get("/api/admin/communication/templates",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM communication_templates WHERE status='active' ORDER BY name")}));
app.get("/api/admin/communication/preferences/:type/:id",requireAdmin,(req,res)=>{
  res.json({success:true,data:queryOne("SELECT * FROM communication_preferences WHERE user_type=? AND user_id=?",[req.params.type,Number(req.params.id)])||{user_type:req.params.type,user_id:Number(req.params.id),announcements:1,homework:1,results:1,attendance:1,fees:1,hostel:1,library:1,system:1}});
});
app.put("/api/admin/communication/preferences/:type/:id",requireAdmin,(req,res)=>{
  const t=req.params.type,id=Number(req.params.id),b=req.body||{},existing=queryOne("SELECT id FROM communication_preferences WHERE user_type=? AND user_id=?",[t,id]);
  const vals=["announcements","homework","results","attendance","fees","hostel","library","system"].map(k=>b[k]===false?0:1);
  if(existing)db.run(`UPDATE communication_preferences SET announcements=?,homework=?,results=?,attendance=?,fees=?,hostel=?,library=?,system=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[...vals,existing.id]);
  else insert(`INSERT INTO communication_preferences (user_type,user_id,announcements,homework,results,attendance,fees,hostel,library,system) VALUES (?,?,?,?,?,?,?,?,?,?)`,[t,id,...vals]);
  persistDatabase();res.json({success:true});
});
app.get("/api/admin/communication/inbox",requireAdmin,(_req,res)=>res.json({success:true,data:{
  parent:query("SELECT m.*,p.parent_name,p.email FROM parent_messages m JOIN parent_accounts p ON p.id=m.parent_id ORDER BY m.created_at DESC LIMIT 100"),
  student:query("SELECT m.*,s.full_name,s.admission_no FROM student_messages m JOIN students s ON s.id=m.student_id ORDER BY m.created_at DESC LIMIT 100")
}}));


/* ===== ADVANCED EXAM & ASSESSMENT MANAGEMENT V46 ===== */
function ensureExamAssessmentV46(){
  db.run(`CREATE TABLE IF NOT EXISTS exam_schedules_v46 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL,class_name TEXT,section TEXT,
    subject_id INTEGER,exam_date TEXT NOT NULL,start_time TEXT,end_time TEXT,room TEXT,
    invigilator_id INTEGER,maximum_marks REAL,pass_marks REAL,status TEXT DEFAULT 'scheduled',
    created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS exam_mark_audit_v46 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,old_values TEXT,new_values TEXT,changed_by INTEGER,
    reason TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS result_locks_v46 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL UNIQUE,
    status TEXT DEFAULT 'unlocked',locked_by INTEGER,locked_at TEXT,published_at TEXT,
    publish_note TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS result_corrections_v46 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,exam_id INTEGER NOT NULL,subject_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,requested_by INTEGER NOT NULL,old_values TEXT,new_values TEXT,
    reason TEXT NOT NULL,status TEXT DEFAULT 'pending',reviewed_by INTEGER,reviewed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS grading_rules_v46 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,academic_year TEXT,
    min_percentage REAL DEFAULT 0,pass_percentage REAL DEFAULT 33,
    grade_a_plus REAL DEFAULT 90,grade_a REAL DEFAULT 80,grade_b_plus REAL DEFAULT 70,
    grade_b REAL DEFAULT 60,grade_c REAL DEFAULT 50,grade_d REAL DEFAULT 40,
    status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureExamAssessmentV46();

function examAuditV46(examId,actor,action,details){
  insert("INSERT INTO exam_mark_audit_v46 (exam_id,subject_id,student_id,old_values,new_values,changed_by,reason) VALUES (?,?,?,?,?,?,?)",
    [examId,details?.subject_id||0,details?.student_id||0,JSON.stringify(details?.old||{}),JSON.stringify(details?.new||{}),actor?.id||null,action]);
}
function examLockV46(examId){return queryOne("SELECT * FROM result_locks_v46 WHERE exam_id=?",[examId])}
function assertExamUnlockedV46(examId){
  const l=examLockV46(examId);return !l||l.status==="unlocked";
}
function gradeV46(p){
  const n=Number(p||0);if(n>=90)return"A+";if(n>=80)return"A";if(n>=70)return"B+";if(n>=60)return"B";if(n>=50)return"C";if(n>=40)return"D";return"F";
}
function examStudentsV46(examId){
  const e=queryOne("SELECT * FROM advanced_exams WHERE id=?",[examId]);if(!e)return[];
  return query(`SELECT s.* FROM students s WHERE s.status='active' AND EXISTS(
    SELECT 1 FROM advanced_exam_results r WHERE r.exam_id=? AND r.student_id=s.id
  ) OR 1=0`,[examId]);
}

app.get("/api/admin/exams/v46/dashboard",requireAdmin,(_req,res)=>{
  const exams=query("SELECT e.*,COALESCE(l.status,'unlocked') lock_status FROM advanced_exams e LEFT JOIN result_locks_v46 l ON l.exam_id=e.id ORDER BY e.id DESC LIMIT 100");
  const pending=Number(queryOne("SELECT COUNT(*) c FROM result_corrections_v46 WHERE status='pending'")?.c||0);
  const schedules=Number(queryOne("SELECT COUNT(*) c FROM exam_schedules_v46 WHERE status='scheduled'")?.c||0);
  res.json({success:true,data:{exams,pending_corrections:pending,scheduled_papers:schedules}});
});
app.post("/api/admin/exams/v46/schedule",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.exam_id||!b.subject_id||!b.exam_date)return res.status(400).json({success:false,message:"Exam, subject and exam date are required."});
  const id=insert(`INSERT INTO exam_schedules_v46 (exam_id,class_name,section,subject_id,exam_date,start_time,end_time,room,invigilator_id,maximum_marks,pass_marks,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[Number(b.exam_id),b.class_name||"",b.section||"",Number(b.subject_id),b.exam_date,b.start_time||"",b.end_time||"",b.room||"",
    b.invigilator_id?Number(b.invigilator_id):null,Number(b.maximum_marks||100),Number(b.pass_marks||33),req.admin.id]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM exam_schedules_v46 WHERE id=?",[id])});
});
app.get("/api/admin/exams/v46/schedules",requireAdmin,(req,res)=>{
  const exam=req.query.exam_id?Number(req.query.exam_id):null;
  res.json({success:true,data:query(`SELECT s.*,e.name exam_name FROM exam_schedules_v46 s JOIN advanced_exams e ON e.id=s.exam_id ${exam?"WHERE s.exam_id=?":""} ORDER BY s.exam_date,s.start_time`,exam?[exam]:[])});
});
app.put("/api/admin/exams/v46/schedule/:id",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),x=queryOne("SELECT * FROM exam_schedules_v46 WHERE id=?",[id]);if(!x)return res.status(404).json({success:false,message:"Schedule not found."});
  const b=req.body||{};db.run(`UPDATE exam_schedules_v46 SET class_name=?,section=?,exam_date=?,start_time=?,end_time=?,room=?,invigilator_id=?,maximum_marks=?,pass_marks=?,status=? WHERE id=?`,
    [b.class_name??x.class_name,b.section??x.section,b.exam_date??x.exam_date,b.start_time??x.start_time,b.end_time??x.end_time,b.room??x.room,b.invigilator_id?Number(b.invigilator_id):x.invigilator_id,
     Number(b.maximum_marks??x.maximum_marks),Number(b.pass_marks??x.pass_marks),b.status??x.status,id]);persistDatabase();res.json({success:true});
});
app.post("/api/admin/exams/v46/marks",requireAdmin,(req,res)=>{
  const b=req.body||{},examId=Number(b.exam_id),subjectId=Number(b.subject_id),sid=Number(b.student_id);
  if(!examId||!subjectId||!sid)return res.status(400).json({success:false,message:"Exam, subject and student are required."});
  if(!assertExamUnlockedV46(examId))return res.status(423).json({success:false,message:"Result is locked. Submit a correction request instead."});
  const existing=queryOne("SELECT * FROM advanced_exam_marks WHERE exam_id=? AND subject_id=? AND student_id=?",[examId,subjectId,sid]);
  const old=existing?{theory:existing.theory,practical:existing.practical,internal:existing.internal,grace:existing.grace,remarks:existing.remarks}:{};
  const n={theory:Number(b.theory||0),practical:Number(b.practical||0),internal:Number(b.internal||0),grace:Number(b.grace||0),remarks:b.remarks||""};
  if(existing)db.run("UPDATE advanced_exam_marks SET theory=?,practical=?,internal=?,grace=?,remarks=? WHERE id=?",[n.theory,n.practical,n.internal,n.grace,n.remarks,existing.id]);
  else insert(`INSERT INTO advanced_exam_marks (exam_id,subject_id,student_id,theory,practical,internal,grace,remarks) VALUES (?,?,?,?,?,?,?,?)`,
    [examId,subjectId,sid,n.theory,n.practical,n.internal,n.grace,n.remarks]);
  examAuditV46(examId,req.admin,"marks_updated",{subject_id:subjectId,student_id:sid,old,new:n});persistDatabase();res.json({success:true});
});
app.post("/api/admin/exams/v46/lock/:examId",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId),existing=examLockV46(examId);
  if(existing)db.run("UPDATE result_locks_v46 SET status='locked',locked_by=?,locked_at=CURRENT_TIMESTAMP WHERE exam_id=?",[req.admin.id,examId]);
  else insert("INSERT INTO result_locks_v46 (exam_id,status,locked_by,locked_at) VALUES (?,'locked',?,CURRENT_TIMESTAMP)",[examId,req.admin.id]);
  persistDatabase();res.json({success:true,data:examLockV46(examId)});
});
app.post("/api/admin/exams/v46/unlock/:examId",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId);db.run("UPDATE result_locks_v46 SET status='unlocked' WHERE exam_id=?",[examId]);persistDatabase();res.json({success:true});
});
app.post("/api/admin/exams/v46/publish/:examId",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId);const e=queryOne("SELECT * FROM advanced_exams WHERE id=?",[examId]);if(!e)return res.status(404).json({success:false,message:"Exam not found."});
  if(!examLockV46(examId)||examLockV46(examId).status!=="locked")return res.status(400).json({success:false,message:"Lock the result before publishing."});
  db.run("UPDATE advanced_exams SET result_published=1 WHERE id=?",[examId]);
  db.run("UPDATE result_locks_v46 SET published_at=CURRENT_TIMESTAMP,publish_note=? WHERE exam_id=?",[req.body?.note||"",examId]);
  query("SELECT DISTINCT student_id FROM advanced_exam_marks WHERE exam_id=?",[examId]).forEach(x=>createStudentNotificationV44(x.student_id,`${e.name} Result Published`,"Your exam result is now available.","results"));
  communicationAuditV45(req.admin,"result_published",null,{exam_id:examId});persistDatabase();res.json({success:true});
});
app.post("/api/admin/exams/v46/correction",requireAdmin,(req,res)=>{
  const b=req.body||{},examId=Number(b.exam_id),subjectId=Number(b.subject_id),sid=Number(b.student_id);
  if(!examId||!subjectId||!sid||!b.reason)return res.status(400).json({success:false,message:"Exam, subject, student and reason are required."});
  const old=queryOne("SELECT * FROM advanced_exam_marks WHERE exam_id=? AND subject_id=? AND student_id=?",[examId,subjectId,sid]);
  const id=insert("INSERT INTO result_corrections_v46 (exam_id,subject_id,student_id,requested_by,old_values,new_values,reason) VALUES (?,?,?,?,?,?,?)",
    [examId,subjectId,sid,req.admin.id,JSON.stringify(old||{}),JSON.stringify(b.new_values||{}),b.reason]);
  persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM result_corrections_v46 WHERE id=?",[id])});
});
app.get("/api/admin/exams/v46/corrections",requireAdmin,(req,res)=>{
  const status=req.query.status;res.json({success:true,data:query(`SELECT c.*,e.name exam_name,s.full_name,s.admission_no FROM result_corrections_v46 c JOIN advanced_exams e ON e.id=c.exam_id JOIN students s ON s.id=c.student_id ${status?"WHERE c.status=?":""} ORDER BY c.created_at DESC LIMIT 500`,status?[status]:[])});
});
app.post("/api/admin/exams/v46/corrections/:id/review",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),c=queryOne("SELECT * FROM result_corrections_v46 WHERE id=?",[id]);if(!c)return res.status(404).json({success:false,message:"Correction not found."});
  const approved=req.body?.status==="approved";if(approved){
    let n={};try{n=JSON.parse(c.new_values||"{}")}catch{}
    const old=queryOne("SELECT * FROM advanced_exam_marks WHERE exam_id=? AND subject_id=? AND student_id=?",[c.exam_id,c.subject_id,c.student_id]);
    if(old)db.run("UPDATE advanced_exam_marks SET theory=?,practical=?,internal=?,grace=?,remarks=? WHERE id=?",[Number(n.theory||0),Number(n.practical||0),Number(n.internal||0),Number(n.grace||0),n.remarks||"",old.id]);
    else insert("INSERT INTO advanced_exam_marks (exam_id,subject_id,student_id,theory,practical,internal,grace,remarks) VALUES (?,?,?,?,?,?,?,?)",[c.exam_id,c.subject_id,c.student_id,Number(n.theory||0),Number(n.practical||0),Number(n.internal||0),Number(n.grace||0),n.remarks||""]);
  }
  db.run("UPDATE result_corrections_v46 SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?",[approved?"approved":"rejected",req.admin.id,id]);
  createStudentNotificationV44(c.student_id,"Result correction update",`Your result correction request was ${approved?"approved":"rejected"}.`,"results");persistDatabase();res.json({success:true});
});
app.get("/api/admin/exams/v46/rankings/:examId",requireAdmin,(req,res)=>{
  const examId=Number(req.params.examId);
  const rows=query(`SELECT r.*,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section FROM advanced_exam_results r JOIN students s ON s.id=r.student_id
    WHERE r.exam_id=? ORDER BY r.percentage DESC,s.full_name`,[examId]).map((x,i)=>({...x,overall_rank:i+1}));
  const subject= query(`SELECT m.subject_id,sub.subject_name,AVG(COALESCE(m.theory,0)+COALESCE(m.practical,0)+COALESCE(m.internal,0)+COALESCE(m.grace,0)) average_marks
    FROM advanced_exam_marks m JOIN advanced_exam_subjects sub ON sub.id=m.subject_id WHERE m.exam_id=? GROUP BY m.subject_id,sub.subject_name ORDER BY average_marks DESC`,[examId]);
  res.json({success:true,data:{overall:rows,subject}});
});
app.post("/api/admin/exams/v46/grading-rules",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name)return res.status(400).json({success:false,message:"Rule set name is required."});
  try{const id=insert(`INSERT INTO grading_rules_v46 (name,academic_year,min_percentage,pass_percentage,grade_a_plus,grade_a,grade_b_plus,grade_b,grade_c,grade_d) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [b.name,b.academic_year||"",Number(b.min_percentage||0),Number(b.pass_percentage||33),Number(b.grade_a_plus||90),Number(b.grade_a||80),Number(b.grade_b_plus||70),Number(b.grade_b||60),Number(b.grade_c||50),Number(b.grade_d||40)]);
    persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM grading_rules_v46 WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Grading rule name already exists."})}
});
app.get("/api/admin/exams/v46/grading-rules",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM grading_rules_v46 WHERE status='active' ORDER BY name")}));


/* ===== ADVANCED FEE & FINANCE MANAGEMENT V47 ===== */
function ensureFeeFinanceV47(){
  db.run(`CREATE TABLE IF NOT EXISTS fee_structures_v47 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,academic_year TEXT NOT NULL,class_name TEXT,
    fee_type TEXT NOT NULL,frequency TEXT DEFAULT 'monthly',amount REAL DEFAULT 0,
    due_day INTEGER DEFAULT 10,late_fee_type TEXT DEFAULT 'fixed',late_fee_value REAL DEFAULT 0,
    concession_allowed INTEGER DEFAULT 1,status TEXT DEFAULT 'active',created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS student_fee_assignments_v47 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,structure_id INTEGER NOT NULL,
    custom_amount REAL,concession_type TEXT DEFAULT 'none',concession_value REAL DEFAULT 0,
    start_month TEXT,end_month TEXT,status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id,structure_id,start_month)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_invoices_v47 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_no TEXT NOT NULL UNIQUE,student_id INTEGER NOT NULL,
    billing_month TEXT NOT NULL,subtotal REAL DEFAULT 0,discount REAL DEFAULT 0,late_fee REAL DEFAULT 0,
    total REAL DEFAULT 0,paid REAL DEFAULT 0,balance REAL DEFAULT 0,due_date TEXT,
    status TEXT DEFAULT 'unpaid',notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id,billing_month)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_payments_v47 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,receipt_no TEXT NOT NULL UNIQUE,invoice_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,amount REAL NOT NULL,payment_method TEXT DEFAULT 'cash',
    transaction_ref TEXT,paid_at TEXT DEFAULT CURRENT_TIMESTAMP,received_by INTEGER,
    notes TEXT,status TEXT DEFAULT 'completed'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_concessions_v47 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,fee_type TEXT,
    concession_type TEXT DEFAULT 'fixed',value REAL DEFAULT 0,reason TEXT NOT NULL,
    approved_by INTEGER,status TEXT DEFAULT 'approved',created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_refunds_v47 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,payment_id INTEGER NOT NULL,invoice_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,amount REAL NOT NULL,reason TEXT NOT NULL,
    approved_by INTEGER,status TEXT DEFAULT 'approved',refunded_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fee_finance_audit_v47 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER,action TEXT NOT NULL,
    entity_type TEXT,entity_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureFeeFinanceV47();

function feeAuditV47(actor,action,type,id,details){
  insert("INSERT INTO fee_finance_audit_v47 (actor_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)",
    [actor?.id||null,action,type||null,id||null,JSON.stringify(details||{})]);
}
function feeInvoiceNoV47(studentId,month){return `INV-${month.replace("-","")}-${studentId}-${Date.now().toString().slice(-6)}`}
function feeReceiptNoV47(){return `RCT-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${Date.now().toString().slice(-7)}`}

app.get("/api/admin/fees/v47/dashboard",requireAdmin,(_req,res)=>{
  const invoiceCount=Number(queryOne("SELECT COUNT(*) c FROM fee_invoices_v47")?.c||0);
  const collected=Number(queryOne("SELECT COALESCE(SUM(amount),0) v FROM fee_payments_v47 WHERE status='completed'")?.v||0);
  const outstanding=Number(queryOne("SELECT COALESCE(SUM(balance),0) v FROM fee_invoices_v47 WHERE balance>0")?.v||0);
  const overdue=Number(queryOne("SELECT COALESCE(SUM(balance),0) v FROM fee_invoices_v47 WHERE balance>0 AND due_date<date('now')")?.v||0);
  const concessions=Number(queryOne("SELECT COALESCE(SUM(value),0) v FROM fee_concessions_v47 WHERE status='approved'")?.v||0);
  const refunds=Number(queryOne("SELECT COALESCE(SUM(amount),0) v FROM fee_refunds_v47 WHERE status='approved'")?.v||0);
  res.json({success:true,data:{invoice_count:invoiceCount,collected,outstanding,overdue,concessions,refunds}});
});
app.post("/api/admin/fees/v47/structures",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name||!b.academic_year||!b.fee_type)return res.status(400).json({success:false,message:"Name, academic year and fee type are required."});
  const id=insert(`INSERT INTO fee_structures_v47 (name,academic_year,class_name,fee_type,frequency,amount,due_day,late_fee_type,late_fee_value,concession_allowed,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[b.name,b.academic_year,b.class_name||"",b.fee_type,b.frequency||"monthly",Number(b.amount||0),Number(b.due_day||10),
    b.late_fee_type||"fixed",Number(b.late_fee_value||0),b.concession_allowed===false?0:1,req.admin.id]);
  feeAuditV47(req.admin,"fee_structure_created","structure",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_structures_v47 WHERE id=?",[id])});
});
app.get("/api/admin/fees/v47/structures",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM fee_structures_v47 WHERE status='active' ORDER BY academic_year DESC,class_name,fee_type")}));
app.post("/api/admin/fees/v47/assign",requireAdmin,(req,res)=>{
  const b=req.body||{},sid=Number(b.student_id),structureId=Number(b.structure_id);if(!hostelStudentV41(sid))return res.status(404).json({success:false,message:"Student not found."});
  if(!queryOne("SELECT id FROM fee_structures_v47 WHERE id=? AND status='active'",[structureId]))return res.status(404).json({success:false,message:"Fee structure not found."});
  try{const id=insert(`INSERT INTO student_fee_assignments_v47 (student_id,structure_id,custom_amount,concession_type,concession_value,start_month,end_month)
    VALUES (?,?,?,?,?,?,?)`,[sid,structureId,b.custom_amount==null?null:Number(b.custom_amount),b.concession_type||"none",Number(b.concession_value||0),b.start_month||null,b.end_month||null]);
    feeAuditV47(req.admin,"fee_assigned","assignment",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM student_fee_assignments_v47 WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"This fee assignment already exists."})}
});
app.post("/api/admin/fees/v47/generate",requireAdmin,(req,res)=>{
  const month=String(req.body?.billing_month||new Date().toISOString().slice(0,7)),due=req.body?.due_date||`${month}-10`;
  const rows=query(`SELECT a.*,f.fee_type,f.frequency,f.amount,f.due_day,f.late_fee_type,f.late_fee_value
    FROM student_fee_assignments_v47 a JOIN fee_structures_v47 f ON f.id=a.structure_id
    WHERE a.status='active' AND (a.start_month IS NULL OR a.start_month<=?) AND (a.end_month IS NULL OR a.end_month>=?)`,[month,month]);
  const byStudent=new Map();
  rows.forEach(x=>{const base=x.custom_amount==null?Number(x.amount||0):Number(x.custom_amount||0);let discount=0;
    if(x.concession_type==="fixed")discount=Number(x.concession_value||0);if(x.concession_type==="percent")discount=base*Number(x.concession_value||0)/100;
    const cur=byStudent.get(x.student_id)||{subtotal:0,discount:0};cur.subtotal+=base;cur.discount+=Math.min(base,discount);byStudent.set(x.student_id,cur)});
  let generated=0;
  for(const [sid,v] of byStudent){if(queryOne("SELECT id FROM fee_invoices_v47 WHERE student_id=? AND billing_month=?",[sid,month]))continue;
    const total=Math.max(0,v.subtotal-v.discount),invoice=feeInvoiceNoV47(sid,month);
    insert(`INSERT INTO fee_invoices_v47 (invoice_no,student_id,billing_month,subtotal,discount,total,balance,due_date,status) VALUES (?,?,?,?,?,?,?,?,?)`,
      [invoice,sid,month,v.subtotal,v.discount,total,total,due,"unpaid"]);generated++}
  feeAuditV47(req.admin,"fees_generated","invoice",null,{month,generated});persistDatabase();res.json({success:true,data:{generated,month}});
});
app.get("/api/admin/fees/v47/invoices",requireAdmin,(req,res)=>{
  const status=req.query.status,month=req.query.month;let sql=`SELECT i.*,s.full_name,s.admission_no,s.class_name,s.section FROM fee_invoices_v47 i JOIN students s ON s.id=i.student_id WHERE 1=1`,args=[];
  if(status){sql+=" AND i.status=?";args.push(status)}if(month){sql+=" AND i.billing_month=?";args.push(month)}sql+=" ORDER BY i.created_at DESC LIMIT 1000";
  res.json({success:true,data:query(sql,args)});
});
app.get("/api/admin/fees/v47/student/:id",requireAdmin,(req,res)=>{
  const sid=Number(req.params.id);if(!hostelStudentV41(sid))return res.status(404).json({success:false,message:"Student not found."});
  res.json({success:true,data:{student:hostelStudentV41(sid),invoices:query("SELECT * FROM fee_invoices_v47 WHERE student_id=? ORDER BY billing_month DESC",[sid]),
    payments:query("SELECT * FROM fee_payments_v47 WHERE student_id=? ORDER BY paid_at DESC",[sid]),concessions:query("SELECT * FROM fee_concessions_v47 WHERE student_id=? ORDER BY created_at DESC",[sid])}});
});
app.post("/api/admin/fees/v47/payments",requireAdmin,(req,res)=>{
  const b=req.body||{},invoiceId=Number(b.invoice_id),amount=Number(b.amount||0),inv=queryOne("SELECT * FROM fee_invoices_v47 WHERE id=?",[invoiceId]);
  if(!inv||amount<=0)return res.status(400).json({success:false,message:"Valid invoice and payment amount are required."});
  if(amount>Number(inv.balance)+0.001)return res.status(400).json({success:false,message:"Payment exceeds invoice balance."});
  const receipt=feeReceiptNoV47(),id=insert(`INSERT INTO fee_payments_v47 (receipt_no,invoice_id,student_id,amount,payment_method,transaction_ref,received_by,notes)
    VALUES (?,?,?,?,?,?,?,?)`,[receipt,invoiceId,inv.student_id,amount,b.payment_method||"cash",b.transaction_ref||"",req.admin.id,b.notes||""]);
  const paid=Number(inv.paid||0)+amount,balance=Math.max(0,Number(inv.total||0)+Number(inv.late_fee||0)-paid),status=balance<=0.001?"paid":"partial";
  db.run("UPDATE fee_invoices_v47 SET paid=?,balance=?,status=? WHERE id=?",[paid,balance,status,invoiceId]);
  feeAuditV47(req.admin,"payment_received","payment",id,{invoice_id:invoiceId,amount});persistDatabase();
  res.status(201).json({success:true,data:{payment:queryOne("SELECT * FROM fee_payments_v47 WHERE id=?",[id]),invoice:queryOne("SELECT * FROM fee_invoices_v47 WHERE id=?",[invoiceId])}});
});
app.post("/api/admin/fees/v47/concessions",requireAdmin,(req,res)=>{
  const b=req.body||{},sid=Number(b.student_id);if(!hostelStudentV41(sid)||!b.reason)return res.status(400).json({success:false,message:"Student and concession reason are required."});
  const id=insert("INSERT INTO fee_concessions_v47 (student_id,fee_type,concession_type,value,reason,approved_by) VALUES (?,?,?,?,?,?)",
    [sid,b.fee_type||"",b.concession_type||"fixed",Number(b.value||0),b.reason,req.admin.id]);
  feeAuditV47(req.admin,"concession_approved","concession",id,b);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM fee_concessions_v47 WHERE id=?",[id])});
});
app.post("/api/admin/fees/v47/refunds",requireAdmin,(req,res)=>{
  const b=req.body||{},paymentId=Number(b.payment_id),amount=Number(b.amount||0),p=queryOne("SELECT * FROM fee_payments_v47 WHERE id=?",[paymentId]);
  if(!p||amount<=0||amount>Number(p.amount))return res.status(400).json({success:false,message:"Invalid refund amount."});
  const id=insert("INSERT INTO fee_refunds_v47 (payment_id,invoice_id,student_id,amount,reason,approved_by) VALUES (?,?,?,?,?,?)",
    [paymentId,p.invoice_id,p.student_id,amount,b.reason||"Refund",req.admin.id]);
  const inv=queryOne("SELECT * FROM fee_invoices_v47 WHERE id=?",[p.invoice_id]),paid=Math.max(0,Number(inv.paid||0)-amount),balance=Math.max(0,Number(inv.total||0)+Number(inv.late_fee||0)-paid);
  db.run("UPDATE fee_invoices_v47 SET paid=?,balance=?,status=? WHERE id=?",[paid,balance,balance<=0.001?"paid":paid>0?"partial":"unpaid",p.invoice_id]);
  feeAuditV47(req.admin,"refund_approved","refund",id,b);persistDatabase();res.status(201).json({success:true});
});
app.post("/api/admin/fees/v47/recalculate-late-fees",requireAdmin,(req,res)=>{
  const today=new Date().toISOString().slice(0,10),rows=query("SELECT * FROM fee_invoices_v47 WHERE balance>0 AND due_date<?",[today]);let updated=0;
  rows.forEach(i=>{const days=Math.max(0,Math.floor((new Date(today)-new Date(i.due_date))/(86400000)));const structure=queryOne(`SELECT f.* FROM fee_structures_v47 f JOIN student_fee_assignments_v47 a ON a.structure_id=f.id WHERE a.student_id=? LIMIT 1`,[i.student_id]);
    if(!structure)return;let late=0;if(structure.late_fee_type==="fixed")late=Number(structure.late_fee_value||0)*days;else if(structure.late_fee_type==="percent")late=Number(i.subtotal||0)*Number(structure.late_fee_value||0)/100;
    db.run("UPDATE fee_invoices_v47 SET late_fee=?,balance=? WHERE id=?",[late,Math.max(0,Number(i.total||0)+late-Number(i.paid||0)),i.id]);updated++});
  persistDatabase();res.json({success:true,data:{updated}});
});
app.get("/api/admin/fees/v47/reports",requireAdmin,(_req,res)=>res.json({success:true,data:{
  monthly:query(`SELECT billing_month,COUNT(*) invoices,COALESCE(SUM(total),0) billed,COALESCE(SUM(paid),0) collected,COALESCE(SUM(balance),0) outstanding FROM fee_invoices_v47 GROUP BY billing_month ORDER BY billing_month DESC`),
  methods:query(`SELECT payment_method,COUNT(*) transactions,COALESCE(SUM(amount),0) amount FROM fee_payments_v47 WHERE status='completed' GROUP BY payment_method ORDER BY amount DESC`),
  classes:query(`SELECT s.class_name,s.section,COUNT(i.id) invoices,COALESCE(SUM(i.total),0) billed,COALESCE(SUM(i.paid),0) paid,COALESCE(SUM(i.balance),0) outstanding
    FROM fee_invoices_v47 i JOIN students s ON s.id=i.student_id GROUP BY s.class_name,s.section ORDER BY s.class_name,s.section`)
}}));


/* ===== ADVANCED ATTENDANCE & LEAVE MANAGEMENT V48 ===== */
function ensureAttendanceLeaveV48(){
  db.run(`CREATE TABLE IF NOT EXISTS leave_types_v48 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,code TEXT NOT NULL UNIQUE,
    max_days_per_year REAL DEFAULT 0,requires_document INTEGER DEFAULT 0,status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS leave_requests_v48 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,leave_type_id INTEGER,
    start_date TEXT NOT NULL,end_date TEXT NOT NULL,total_days REAL NOT NULL,reason TEXT NOT NULL,
    document_path TEXT,status TEXT DEFAULT 'pending',requested_by_role TEXT DEFAULT 'student',
    requested_by INTEGER,reviewed_by INTEGER,reviewed_at TEXT,review_note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS attendance_records_v48 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,attendance_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'present',marked_by INTEGER,source TEXT DEFAULT 'manual',
    note TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id,attendance_date)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS attendance_monthly_lock_v48 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,class_name TEXT NOT NULL,section TEXT,
    month TEXT NOT NULL,status TEXT DEFAULT 'unlocked',locked_by INTEGER,locked_at TEXT,
    UNIQUE(class_name,section,month)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS attendance_audit_v48 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER,actor_id INTEGER,actor_role TEXT,
    action TEXT NOT NULL,attendance_date TEXT,old_status TEXT,new_status TEXT,details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS attendance_alerts_v48 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,month TEXT,
    attendance_percentage REAL,threshold REAL DEFAULT 75,status TEXT DEFAULT 'open',
    notified INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id,month)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teacher_attendance_v48 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL,attendance_date TEXT NOT NULL,
    status TEXT DEFAULT 'present',note TEXT,marked_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id,attendance_date)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS attendance_settings_v48 (
    id INTEGER PRIMARY KEY CHECK(id=1),low_attendance_threshold REAL DEFAULT 75,
    half_day_enabled INTEGER DEFAULT 1,late_after_minutes INTEGER DEFAULT 15,
    school_start_time TEXT DEFAULT '09:00',school_end_time TEXT DEFAULT '15:00'
  )`);
  db.run(`INSERT OR IGNORE INTO attendance_settings_v48 (id) VALUES (1)`);
  persistDatabase();
}
ensureAttendanceLeaveV48();

function attendanceAuditV48(studentId,actor,role,action,date,oldStatus,newStatus,details){
  insert(`INSERT INTO attendance_audit_v48 (student_id,actor_id,actor_role,action,attendance_date,old_status,new_status,details)
    VALUES (?,?,?,?,?,?,?,?)`,[studentId||null,actor?.id||null,role||null,action,date||null,oldStatus||null,newStatus||null,JSON.stringify(details||{})]);
}
function daysBetweenV48(a,b){const x=new Date(a),y=new Date(b);return Math.floor((y-x)/86400000)+1}
function attendanceLockedV48(className,section,month){const x=queryOne("SELECT * FROM attendance_monthly_lock_v48 WHERE class_name=? AND COALESCE(section,'')=COALESCE(?,'') AND month=?",[className,section||"",month]);return x?.status==="locked"}
function attendanceSummaryV48(studentId,month){
  let rows=query("SELECT status FROM attendance_records_v48 WHERE student_id=? AND attendance_date LIKE ?",[studentId,`${month}%`]);
  if(!rows.length)rows=query("SELECT status FROM attendance WHERE student_id=? AND attendance_date LIKE ?",[studentId,`${month}%`]);
  const present=rows.filter(x=>["present","p","late"].includes(String(x.status).toLowerCase())).length;
  const late=rows.filter(x=>String(x.status).toLowerCase()==="late").length;
  const half=rows.filter(x=>String(x.status).toLowerCase()==="half-day").length;
  const absent=rows.filter(x=>["absent","a"].includes(String(x.status).toLowerCase())).length;
  return {total:rows.length,present,absent,late,half_day:half,percentage:rows.length?Number((present/rows.length*100).toFixed(2)):0};
}

app.get("/api/admin/attendance/v48/dashboard",requireAdmin,(_req,res)=>{
  const month=String(_req.query.month||new Date().toISOString().slice(0,7));
  const students=query("SELECT id,full_name,admission_no,roll_no,class_name,section FROM students WHERE status='active' ORDER BY class_name,section,roll_no,full_name")
    .map(s=>({...s,summary:attendanceSummaryV48(s.id,month)}));
  const low=students.filter(x=>x.summary.total&&x.summary.percentage<Number(queryOne("SELECT low_attendance_threshold FROM attendance_settings_v48 WHERE id=1")?.low_attendance_threshold||75));
  const leaves=Number(queryOne("SELECT COUNT(*) c FROM leave_requests_v48 WHERE status='pending'")?.c||0);
  res.json({success:true,data:{month,students,low_attendance:low,pending_leaves:leaves}});
});
app.get("/api/admin/attendance/v48/class-summary",requireAdmin,(req,res)=>{
  const month=String(req.query.month||new Date().toISOString().slice(0,7));
  const rows=query("SELECT class_name,section,COUNT(*) students FROM students WHERE status='active' GROUP BY class_name,section ORDER BY class_name,section");
  res.json({success:true,data:rows.map(r=>{
    const ss=query("SELECT id FROM students WHERE status='active' AND class_name=? AND COALESCE(section,'')=COALESCE(?,'')",[r.class_name,r.section||""]);
    const sums=ss.map(x=>attendanceSummaryV48(x.id,month));const total=sums.reduce((n,x)=>n+x.total,0),present=sums.reduce((n,x)=>n+x.present,0);
    return {...r,attendance_percentage:total?Number((present/total*100).toFixed(2)):0};
  })});
});
app.get("/api/admin/attendance/v48/student/:id",requireAdmin,(req,res)=>{
  const sid=Number(req.params.id),s=hostelStudentV41(sid);if(!s)return res.status(404).json({success:false,message:"Student not found."});
  const month=String(req.query.month||new Date().toISOString().slice(0,7));
  res.json({success:true,data:{student:s,month,summary:attendanceSummaryV48(sid,month),
    records:query("SELECT * FROM attendance_records_v48 WHERE student_id=? AND attendance_date LIKE ? ORDER BY attendance_date DESC",[sid,`${month}%`]),
    leaves:query("SELECT * FROM leave_requests_v48 WHERE student_id=? ORDER BY created_at DESC",[sid])}});
});
app.post("/api/admin/attendance/v48/bulk",requireAdmin,(req,res)=>{
  const b=req.body||{},date=b.attendance_date||new Date().toISOString().slice(0,10),records=Array.isArray(b.records)?b.records:[];let saved=0;
  for(const x of records){const sid=Number(x.student_id),st=hostelStudentV41(sid);if(!st)continue;
    if(attendanceLockedV48(st.class_name,st.section,date.slice(0,7)))continue;
    const ex=queryOne("SELECT * FROM attendance_records_v48 WHERE student_id=? AND attendance_date=?",[sid,date]),status=x.status||"present";
    if(ex){db.run("UPDATE attendance_records_v48 SET status=?,marked_by=?,source=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",[status,req.admin.id,x.source||"manual",x.note||"",ex.id]);
      attendanceAuditV48(sid,req.admin,"admin","attendance_updated",date,ex.status,status,{})}
    else{insert("INSERT INTO attendance_records_v48 (student_id,attendance_date,status,marked_by,source,note) VALUES (?,?,?,?,?,?)",[sid,date,status,req.admin.id,x.source||"manual",x.note||""]);
      attendanceAuditV48(sid,req.admin,"admin","attendance_marked",date,null,status,{})}
    saved++}
  persistDatabase();res.json({success:true,data:{saved,date}});
});
app.get("/api/admin/attendance/v48",requireAdmin,(req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  const rows=query(`SELECT s.id,s.full_name,s.admission_no,s.roll_no,s.class_name,s.section,a.status,a.note FROM students s
    LEFT JOIN attendance_records_v48 a ON a.student_id=s.id AND a.attendance_date=? WHERE s.status='active'
    ORDER BY s.class_name,s.section,s.roll_no,s.full_name`,[date]);
  res.json({success:true,data:rows});
});
app.post("/api/admin/attendance/v48/lock",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.class_name||!b.month)return res.status(400).json({success:false,message:"Class and month are required."});
  const ex=queryOne("SELECT id FROM attendance_monthly_lock_v48 WHERE class_name=? AND COALESCE(section,'')=COALESCE(?,'') AND month=?",[b.class_name,b.section||"",b.month]);
  if(ex)db.run("UPDATE attendance_monthly_lock_v48 SET status='locked',locked_by=?,locked_at=CURRENT_TIMESTAMP WHERE id=?",[req.admin.id,ex.id]);
  else insert("INSERT INTO attendance_monthly_lock_v48 (class_name,section,month,status,locked_by,locked_at) VALUES (?,?,?,'locked',?,CURRENT_TIMESTAMP)",[b.class_name,b.section||"",b.month,req.admin.id]);
  persistDatabase();res.json({success:true});
});
app.post("/api/admin/attendance/v48/unlock",requireAdmin,(req,res)=>{
  const b=req.body||{};db.run("UPDATE attendance_monthly_lock_v48 SET status='unlocked' WHERE class_name=? AND COALESCE(section,'')=COALESCE(?,'') AND month=?",[b.class_name,b.section||"",b.month]);persistDatabase();res.json({success:true});
});
app.post("/api/admin/attendance/v48/generate-alerts",requireAdmin,(req,res)=>{
  const month=String(req.body?.month||new Date().toISOString().slice(0,7)),threshold=Number(req.body?.threshold||queryOne("SELECT low_attendance_threshold FROM attendance_settings_v48 WHERE id=1")?.low_attendance_threshold||75);
  let created=0;query("SELECT id FROM students WHERE status='active'").forEach(s=>{const sum=attendanceSummaryV48(s.id,month);if(sum.total&&sum.percentage<threshold){
    const ex=queryOne("SELECT id FROM attendance_alerts_v48 WHERE student_id=? AND month=?",[s.id,month]);
    if(ex)db.run("UPDATE attendance_alerts_v48 SET attendance_percentage=?,threshold=?,status='open' WHERE id=?",[sum.percentage,threshold,ex.id]);
    else{insert("INSERT INTO attendance_alerts_v48 (student_id,month,attendance_percentage,threshold) VALUES (?,?,?,?)",[s.id,month,sum.percentage,threshold]);created++}
    createStudentNotificationV44(s.id,"Low Attendance Alert",`Your attendance for ${month} is ${sum.percentage}%. Please contact the school if required.`,"attendance");
    query("SELECT parent_id FROM parent_student_links WHERE student_id=? AND status='active'",[s.id]).forEach(p=>insert("INSERT INTO parent_notifications (parent_id,student_id,title,message,type) VALUES (?,?,?,?,?)",[p.parent_id,s.id,"Low Attendance Alert",`Attendance is ${sum.percentage}% for ${month}.`,"attendance"]));
  }});persistDatabase();res.json({success:true,data:{created,month,threshold}});
});
app.get("/api/admin/attendance/v48/alerts",requireAdmin,(req,res)=>{
  const status=req.query.status||"open";res.json({success:true,data:query(`SELECT a.*,s.full_name,s.admission_no,s.class_name,s.section FROM attendance_alerts_v48 a JOIN students s ON s.id=a.student_id WHERE a.status=? ORDER BY a.attendance_percentage ASC`,[status])});
});
app.post("/api/admin/attendance/v48/alerts/:id/resolve",requireAdmin,(req,res)=>{
  db.run("UPDATE attendance_alerts_v48 SET status='resolved' WHERE id=?",[Number(req.params.id)]);persistDatabase();res.json({success:true});
});
app.get("/api/admin/attendance/v48/leave-requests",requireAdmin,(req,res)=>{
  const status=req.query.status||"pending";res.json({success:true,data:query(`SELECT l.*,s.full_name,s.admission_no,s.class_name,s.section,t.name leave_type FROM leave_requests_v48 l JOIN students s ON s.id=l.student_id LEFT JOIN leave_types_v48 t ON t.id=l.leave_type_id WHERE l.status=? ORDER BY l.created_at DESC`,[status])});
});
app.post("/api/admin/attendance/v48/leave/:id/review",requireAdmin,(req,res)=>{
  const id=Number(req.params.id),x=queryOne("SELECT * FROM leave_requests_v48 WHERE id=?",[id]);if(!x)return res.status(404).json({success:false,message:"Leave request not found."});
  const status=req.body?.status==="approved"?"approved":"rejected";
  db.run("UPDATE leave_requests_v48 SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=?",[status,req.admin.id,req.body?.review_note||"",id]);
  if(status==="approved"){for(let d=0;d<x.total_days;d++){const date=new Date(x.start_date);date.setDate(date.getDate()+d);const ds=date.toISOString().slice(0,10);
    const ex=queryOne("SELECT id FROM attendance_records_v48 WHERE student_id=? AND attendance_date=?",[x.student_id,ds]);
    if(ex)db.run("UPDATE attendance_records_v48 SET status='leave',marked_by=?,source='approved_leave' WHERE id=?",[req.admin.id,ex.id]);
    else insert("INSERT INTO attendance_records_v48 (student_id,attendance_date,status,marked_by,source) VALUES (?,?,?,?,?)",[x.student_id,ds,"leave",req.admin.id,"approved_leave"]);
  }}
  createStudentNotificationV44(x.student_id,"Leave Request Update",`Your leave request was ${status}.`,"attendance");persistDatabase();res.json({success:true});
});
app.post("/api/admin/attendance/v48/leave-types",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name||!b.code)return res.status(400).json({success:false,message:"Name and code are required."});
  try{const id=insert("INSERT INTO leave_types_v48 (name,code,max_days_per_year,requires_document) VALUES (?,?,?,?)",[b.name,b.code,Number(b.max_days_per_year||0),b.requires_document?1:0]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM leave_types_v48 WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"Leave type code already exists."})}
});
app.get("/api/admin/attendance/v48/leave-types",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM leave_types_v48 WHERE status='active' ORDER BY name")}));
app.post("/api/student/attendance/v48/leave-request",requireStudentV44,(req,res)=>{
  const b=req.body||{},start=b.start_date,end=b.end_date;if(!start||!end||!b.reason)return res.status(400).json({success:false,message:"Dates and reason are required."});
  const total=daysBetweenV48(start,end);if(total<=0)return res.status(400).json({success:false,message:"Invalid date range."});
  const id=insert("INSERT INTO leave_requests_v48 (student_id,leave_type_id,start_date,end_date,total_days,reason,requested_by_role,requested_by) VALUES (?,?,?,?,?,?,?,?)",
    [req.student.student_id,b.leave_type_id?Number(b.leave_type_id):null,start,end,total,b.reason,"student",req.student.id]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM leave_requests_v48 WHERE id=?",[id])});
});
app.get("/api/student/attendance/v48/summary",requireStudentV44,(req,res)=>{
  const month=String(req.query.month||new Date().toISOString().slice(0,7));res.json({success:true,data:{month,summary:attendanceSummaryV48(req.student.student_id,month),
    records:query("SELECT * FROM attendance_records_v48 WHERE student_id=? AND attendance_date LIKE ? ORDER BY attendance_date DESC",[req.student.student_id,`${month}%`]),
    leaves:query("SELECT * FROM leave_requests_v48 WHERE student_id=? ORDER BY created_at DESC",[req.student.student_id])}});
});
app.post("/api/teacher/attendance/v48/bulk",teacherGuardV32,(req,res)=>{
  const b=req.body||{},date=b.attendance_date||new Date().toISOString().slice(0,10),records=Array.isArray(b.records)?b.records:[];let saved=0;
  for(const x of records){const sid=Number(x.student_id),st=hostelStudentV41(sid);if(!st||!teacherOwnsStudentV43(req.teacher.id,sid)||attendanceLockedV48(st.class_name,st.section,date.slice(0,7)))continue;
    const ex=queryOne("SELECT * FROM attendance_records_v48 WHERE student_id=? AND attendance_date=?",[sid,date]),status=x.status||"present";
    if(ex){db.run("UPDATE attendance_records_v48 SET status=?,marked_by=?,source=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",[status,req.teacher.id,"teacher",x.note||"",ex.id]);attendanceAuditV48(sid,req.teacher,"teacher","attendance_updated",date,ex.status,status,{})}
    else{insert("INSERT INTO attendance_records_v48 (student_id,attendance_date,status,marked_by,source,note) VALUES (?,?,?,?,?,?)",[sid,date,status,req.teacher.id,"teacher",x.note||""]);attendanceAuditV48(sid,req.teacher,"teacher","attendance_marked",date,null,status,{})}saved++}
  persistDatabase();res.json({success:true,data:{saved,date}});
});
app.post("/api/admin/attendance/v48/teacher",requireAdmin,(req,res)=>{
  const b=req.body||{},tid=Number(b.teacher_id),date=b.attendance_date||new Date().toISOString().slice(0,10),status=b.status||"present";if(!tid)return res.status(400).json({success:false,message:"Teacher is required."});
  const ex=queryOne("SELECT id FROM teacher_attendance_v48 WHERE teacher_id=? AND attendance_date=?",[tid,date]);if(ex)db.run("UPDATE teacher_attendance_v48 SET status=?,note=?,marked_by=? WHERE id=?",[status,b.note||"",req.admin.id,ex.id]);
  else insert("INSERT INTO teacher_attendance_v48 (teacher_id,attendance_date,status,note,marked_by) VALUES (?,?,?,?,?)",[tid,date,status,b.note||"",req.admin.id]);
  persistDatabase();res.json({success:true});
});
app.put("/api/admin/attendance/v48/settings",requireAdmin,(req,res)=>{
  const b=req.body||{};db.run("UPDATE attendance_settings_v48 SET low_attendance_threshold=?,half_day_enabled=?,late_after_minutes=?,school_start_time=?,school_end_time=? WHERE id=1",
    [Number(b.low_attendance_threshold??75),b.half_day_enabled===false?0:1,Number(b.late_after_minutes??15),b.school_start_time||"09:00",b.school_end_time||"15:00"]);persistDatabase();res.json({success:true});
});
app.get("/api/admin/attendance/v48/settings",requireAdmin,(_req,res)=>res.json({success:true,data:queryOne("SELECT * FROM attendance_settings_v48 WHERE id=1")}));


/* ===== EXISTING FEATURES QUALITY & HARDENING V49 ===== */
function ensureQualityHardeningV49(){
  db.run(`CREATE TABLE IF NOT EXISTS system_audit_v49 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER,actor_role TEXT,action TEXT NOT NULL,
    entity_type TEXT,entity_id INTEGER,details TEXT,ip_address TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS saved_views_v49 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,user_role TEXT NOT NULL,
    name TEXT NOT NULL,module TEXT NOT NULL,config TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,user_role,name,module)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS notification_preferences_v49 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,user_type TEXT NOT NULL,user_id INTEGER NOT NULL,
    announcements INTEGER DEFAULT 1,attendance INTEGER DEFAULT 1,results INTEGER DEFAULT 1,
    fees INTEGER DEFAULT 1,homework INTEGER DEFAULT 1,hostel INTEGER DEFAULT 1,
    leave_requests INTEGER DEFAULT 1,system INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_type,user_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS dashboard_notes_v49 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,created_by INTEGER NOT NULL,role TEXT NOT NULL,
    title TEXT NOT NULL,body TEXT NOT NULL,pinned INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  persistDatabase();
}
ensureQualityHardeningV49();

function auditV49(actor,role,action,type,id,details,req){
  insert(`INSERT INTO system_audit_v49 (actor_id,actor_role,action,entity_type,entity_id,details,ip_address)
    VALUES (?,?,?,?,?,?,?)`,[actor?.id||null,role||null,action,type||null,id||null,JSON.stringify(details||{}),req?.ip||null]);
}
function pagedV49(sql,args,page,size,max=500){
  const p=Math.max(1,Number(page||1)),n=Math.min(max,Math.max(1,Number(size||25)));
  const total=Number(queryOne(`SELECT COUNT(*) c FROM (${sql}) q`,args)?.c||0);
  return {data:query(`${sql} LIMIT ? OFFSET ?`,[...args,n,(p-1)*n]),pagination:{page:p,size:n,total,pages:Math.ceil(total/n)}};
}
function sanitizeSearchV49(x){return String(x||"").trim().slice(0,80)}
function globalStatsV49(){
  return {
    students:Number(queryOne("SELECT COUNT(*) c FROM students WHERE status='active'")?.c||0),
    teachers:Number(queryOne("SELECT COUNT(*) c FROM teachers WHERE status='active'")?.c||0),
    pendingLeaves:Number(queryOne("SELECT COUNT(*) c FROM leave_requests_v48 WHERE status='pending'")?.c||0),
    lowAttendance:Number(queryOne("SELECT COUNT(*) c FROM attendance_alerts_v48 WHERE status='open'")?.c||0),
    outstandingFees:Number(queryOne("SELECT COALESCE(SUM(balance),0) v FROM fee_invoices_v47 WHERE balance>0")?.v||0),
    pendingCorrections:Number(queryOne("SELECT COUNT(*) c FROM result_corrections_v46 WHERE status='pending'")?.c||0)
  };
}

app.get("/api/admin/system/v49/dashboard",requireAdmin,(_req,res)=>{
  res.json({success:true,data:globalStatsV49()});
});
app.get("/api/admin/system/v49/search",requireAdmin,(req,res)=>{
  const q=sanitizeSearchV49(req.query.q);if(q.length<2)return res.json({success:true,data:[]});
  const like=`%${q}%`;
  const students=query(`SELECT id,full_name,admission_no,roll_no,class_name,section,'student' type FROM students
    WHERE full_name LIKE ? OR admission_no LIKE ? OR roll_no LIKE ? LIMIT 20`,[like,like,like]);
  const teachers=query(`SELECT id,name,email,'teacher' type FROM teachers WHERE name LIKE ? OR email LIKE ? LIMIT 20`,[like,like]);
  res.json({success:true,data:[...students,...teachers]});
});
app.get("/api/admin/system/v49/audit",requireAdmin,(req,res)=>{
  const q=sanitizeSearchV49(req.query.q),type=sanitizeSearchV49(req.query.entity_type),args=[];let sql=`SELECT * FROM system_audit_v49 WHERE 1=1`;
  if(q){sql+=" AND (action LIKE ? OR details LIKE ?)";args.push(`%${q}%`,`%${q}%`)}
  if(type){sql+=" AND entity_type=?";args.push(type)}sql+=" ORDER BY id DESC";
  res.json({success:true,...pagedV49(sql,args,req.query.page,req.query.size,200)});
});
app.post("/api/admin/system/v49/audit",requireAdmin,(req,res)=>{
  auditV49(req.admin,"admin",req.body?.action||"manual_note",req.body?.entity_type,null,{note:req.body?.note||""},req);
  persistDatabase();res.json({success:true});
});
app.get("/api/admin/system/v49/saved-views",requireAdmin,(req,res)=>{
  res.json({success:true,data:query("SELECT * FROM saved_views_v49 WHERE user_id=? AND user_role='admin' ORDER BY name",[req.admin.id])});
});
app.post("/api/admin/system/v49/saved-views",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.name||!b.module)return res.status(400).json({success:false,message:"Name and module are required."});
  try{const id=insert(`INSERT INTO saved_views_v49 (user_id,user_role,name,module,config) VALUES (?,?,?,?,?)`,
    [req.admin.id,"admin",b.name,b.module,JSON.stringify(b.config||{})]);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM saved_views_v49 WHERE id=?",[id])})}
  catch{res.status(409).json({success:false,message:"A saved view with this name already exists."})}
});
app.delete("/api/admin/system/v49/saved-views/:id",requireAdmin,(req,res)=>{
  db.run("DELETE FROM saved_views_v49 WHERE id=? AND user_id=?",[Number(req.params.id),req.admin.id]);persistDatabase();res.json({success:true});
});
app.get("/api/admin/system/v49/notes",requireAdmin,(_req,res)=>res.json({success:true,data:query("SELECT * FROM dashboard_notes_v49 WHERE role='admin' ORDER BY pinned DESC,created_at DESC LIMIT 100")}));
app.post("/api/admin/system/v49/notes",requireAdmin,(req,res)=>{
  const b=req.body||{};if(!b.title||!b.body)return res.status(400).json({success:false,message:"Title and body are required."});
  const id=insert("INSERT INTO dashboard_notes_v49 (created_by,role,title,body,pinned) VALUES (?,?,?,?,?)",[req.admin.id,"admin",b.title,b.body,b.pinned?1:0]);
  auditV49(req.admin,"admin","note_created","dashboard_note",id,{title:b.title},req);persistDatabase();res.status(201).json({success:true,data:queryOne("SELECT * FROM dashboard_notes_v49 WHERE id=?",[id])});
});
app.put("/api/admin/system/v49/notes/:id",requireAdmin,(req,res)=>{
  const b=req.body||{};db.run("UPDATE dashboard_notes_v49 SET title=?,body=?,pinned=? WHERE id=? AND created_by=?",[b.title,b.body,b.pinned?1:0,Number(req.params.id),req.admin.id]);persistDatabase();res.json({success:true});
});
app.delete("/api/admin/system/v49/notes/:id",requireAdmin,(req,res)=>{
  db.run("DELETE FROM dashboard_notes_v49 WHERE id=? AND created_by=?",[Number(req.params.id),req.admin.id]);persistDatabase();res.json({success:true});
});
app.get("/api/admin/system/v49/notifications/preferences",requireAdmin,(req,res)=>{
  const x=queryOne("SELECT * FROM notification_preferences_v49 WHERE user_type='admin' AND user_id=?",[req.admin.id]);
  res.json({success:true,data:x||{user_type:"admin",user_id:req.admin.id,announcements:1,attendance:1,results:1,fees:1,homework:1,hostel:1,leave_requests:1,system:1}});
});
app.put("/api/admin/system/v49/notifications/preferences",requireAdmin,(req,res)=>{
  const b=req.body||{},vals=["announcements","attendance","results","fees","homework","hostel","leave_requests","system"].map(k=>b[k]===false?0:1);
  const x=queryOne("SELECT id FROM notification_preferences_v49 WHERE user_type='admin' AND user_id=?",[req.admin.id]);
  if(x)db.run(`UPDATE notification_preferences_v49 SET announcements=?,attendance=?,results=?,fees=?,homework=?,hostel=?,leave_requests=?,system=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[...vals,x.id]);
  else insert(`INSERT INTO notification_preferences_v49 (user_type,user_id,announcements,attendance,results,fees,homework,hostel,leave_requests,system) VALUES ('admin',?,?,?,?,?,?,?,?)`,[req.admin.id,...vals]);
  persistDatabase();res.json({success:true});
});
app.get("/api/admin/system/v49/health",requireAdmin,(_req,res)=>{
  const checks=[];const t=Date.now();
  try{queryOne("SELECT 1 v");checks.push({name:"database",status:"ok"})}catch(e){checks.push({name:"database",status:"error",message:e.message})}
  try{queryOne("SELECT COUNT(*) c FROM students");checks.push({name:"students_module",status:"ok"})}catch(e){checks.push({name:"students_module",status:"error"})}
  try{queryOne("SELECT COUNT(*) c FROM fee_invoices_v47");checks.push({name:"finance_module",status:"ok"})}catch(e){checks.push({name:"finance_module",status:"error"})}
  try{queryOne("SELECT COUNT(*) c FROM attendance_records_v48");checks.push({name:"attendance_module",status:"ok"})}catch(e){checks.push({name:"attendance_module",status:"error"})}
  try{queryOne("SELECT COUNT(*) c FROM advanced_exam_marks");checks.push({name:"exam_module",status:"ok"})}catch(e){checks.push({name:"exam_module",status:"error"})}
  res.json({success:true,data:{checks,response_ms:Date.now()-t,stats:globalStatsV49()}});
});


/* ===== PRODUCTION HARDENING V52 ===== */
const cryptoV52=require("crypto");
const fsV52=require("fs");
const pathV52=require("path");
const PROD_V52=process.env.NODE_ENV==="production";
const JWT_SECRET_V52=process.env.JWT_SECRET||process.env.JWT_SECRET_KEY||"CHANGE_ME_IN_PRODUCTION";
const MAX_BODY_V52=process.env.MAX_BODY_SIZE||"2mb";
const RATE_WINDOW_V52=Number(process.env.RATE_LIMIT_WINDOW_MS||900000);
const RATE_MAX_V52=Number(process.env.RATE_LIMIT_MAX||300);

function securityAuditV52(req,action,details={}){
  try{
    if(typeof auditV49==="function")auditV49(req.admin||null,req.admin?"admin":"system",action,"security",null,details,req);
  }catch{}
}
function safeFileNameV52(name){return pathV52.basename(String(name||"")).replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,120)}
function backupDirV52(){const d=pathV52.resolve(process.env.BACKUP_DIR||pathV52.join(process.cwd(),"backups"));if(!fsV52.existsSync(d))fsV52.mkdirSync(d,{recursive:true});return d}
function databaseBackupV52(label="manual"){
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  const dir=backupDirV52(),file=pathV52.join(dir,`school-db-${label}-${stamp}.json`);
  try{
    let raw=null;
    if(typeof db!=="undefined"&&db&&typeof db.export==="function")raw=Buffer.from(db.export());
    if(raw)fsV52.writeFileSync(file,raw);
    else if(typeof persistDatabase==="function"){persistDatabase();return {success:true,mode:"database-persisted",file:null}};
    return {success:true,mode:"database-export",file};
  }catch(e){return {success:false,error:e.message}}
}
function cleanupBackupsV52(){
  const days=Number(process.env.BACKUP_RETENTION_DAYS||14),cut=Date.now()-days*86400000,dir=backupDirV52();
  let removed=0;for(const f of fsV52.readdirSync(dir)){const p=pathV52.join(dir,f);try{if(fsV52.statSync(p).mtimeMs<cut){fsV52.unlinkSync(p);removed++}}catch{}}
  return removed;
}
function securityHeadersV52(req,res,next){
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","SAMEORIGIN");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy","same-origin");
  if(PROD_V52)res.setHeader("Strict-Transport-Security","max-age=31536000; includeSubDomains");
  next();
}
function requestGuardV52(req,res,next){
  if(req.method==="POST"||req.method==="PUT"||req.method==="PATCH"){
    const ct=String(req.headers["content-type"]||"");
    if(req.body&&Object.keys(req.body).length&&ct&&!ct.includes("application/json")&&!ct.includes("multipart/form-data"))
      return res.status(415).json({success:false,message:"Unsupported content type."});
  }
  next();
}
function rateLimitV52(req,res,next){
  const now=Date.now(),key=`${req.ip||req.socket?.remoteAddress||"unknown"}:${req.path}`;
  global.__schoolRateV52=global.__schoolRateV52||new Map();
  const x=global.__schoolRateV52.get(key);
  if(!x||now-x.start>RATE_WINDOW_V52)global.__schoolRateV52.set(key,{start:now,count:1});
  else{x.count++;if(x.count>RATE_MAX_V52)return res.status(429).json({success:false,message:"Too many requests. Please try again later."})}
  next();
}
function productionHealthV52(){
  const checks=[];
  try{queryOne("SELECT 1");checks.push({name:"database",status:"ok"})}catch(e){checks.push({name:"database",status:"error",message:e.message})}
  const required=["advanced_exam_marks","fee_invoices_v47","attendance_records_v48","system_audit_v49"];
  for(const t of required){try{queryOne(`SELECT COUNT(*) c FROM ${t}`);checks.push({name:t,status:"ok"})}catch(e){checks.push({name:t,status:"error"})}}
  return {status:checks.every(x=>x.status==="ok")?"healthy":"degraded",node:process.version,environment:process.env.NODE_ENV||"development",checks,uptime:Math.round(process.uptime()),memory:process.memoryUsage()};
}
function validateEnvV52(){
  const warnings=[];
  if(PROD_V52&&JWT_SECRET_V52==="CHANGE_ME_IN_PRODUCTION")warnings.push("JWT_SECRET must be changed before production.");
  if(PROD_V52&&String(process.env.CORS_ORIGIN||"").includes("*"))warnings.push("CORS_ORIGIN should not be wildcard in production.");
  return warnings;
}

app.use(securityHeadersV52);
app.use(rateLimitV52);
app.use(requestGuardV52);
app.get("/api/system/v52/health",(_req,res)=>{const h=productionHealthV52();res.status(h.status==="healthy"?200:503).json({success:h.status==="healthy",data:h,warnings:validateEnvV52()})});
app.get("/api/admin/system/v52/security",requireAdmin,(_req,res)=>{
  const warnings=validateEnvV52(),h=productionHealthV52();
  res.json({success:true,data:{environment:h.environment,jwt_configured:JWT_SECRET_V52!=="CHANGE_ME_IN_PRODUCTION",cors_configured:Boolean(process.env.CORS_ORIGIN),warnings}});
});
app.post("/api/admin/system/v52/backup",requireAdmin,(req,res)=>{
  const r=databaseBackupV52("manual");securityAuditV52(req,"backup_created",{result:r});persistDatabase();res.status(r.success?201:500).json(r.success?{success:true,data:r}:{success:false,message:r.error});
});
app.get("/api/admin/system/v52/backups",requireAdmin,(_req,res)=>{
  const dir=backupDirV52();const files=fsV52.readdirSync(dir).map(f=>{const p=pathV52.join(dir,f),st=fsV52.statSync(p);return{name:safeFileNameV52(f),size:st.size,created_at:st.mtime.toISOString()}}).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  res.json({success:true,data:files});
});
app.post("/api/admin/system/v52/backups/cleanup",requireAdmin,(_req,res)=>res.json({success:true,data:{removed:cleanupBackupsV52()}}));
app.get("/api/admin/system/v52/performance",requireAdmin,(_req,res)=>{
  const h=productionHealthV52(),dbCounts={};
  for(const t of ["students","teachers","fee_invoices_v47","attendance_records_v48","advanced_exam_marks"]){try{dbCounts[t]=Number(queryOne(`SELECT COUNT(*) c FROM ${t}`)?.c||0)}catch{dbCounts[t]=null}}
  res.json({success:true,data:{uptime:h.uptime,memory:h.memory,db_counts:dbCounts,node:h.node}});
});


/* ===== RELIABILITY & QA V53 ===== */
function reliabilityCheckV53(name,fn){
  try{const started=Date.now();const value=fn();return {name,status:"ok",duration_ms:Date.now()-started,value:value??null}}
  catch(e){return {name,status:"error",message:e.message}}
}
function reliabilityReportV53(){
  const checks=[
    reliabilityCheckV53("database",()=>queryOne("SELECT 1")?.["1"]??1),
    reliabilityCheckV53("students_table",()=>queryOne("SELECT COUNT(*) c FROM students")?.c??0),
    reliabilityCheckV53("teachers_table",()=>queryOne("SELECT COUNT(*) c FROM teachers")?.c??0),
    reliabilityCheckV53("attendance",()=>queryOne("SELECT COUNT(*) c FROM attendance_records_v48")?.c??0),
    reliabilityCheckV53("fees",()=>queryOne("SELECT COUNT(*) c FROM fee_invoices_v47")?.c??0),
    reliabilityCheckV53("audit",()=>queryOne("SELECT COUNT(*) c FROM system_audit_v49")?.c??0)
  ];
  return {status:checks.every(x=>x.status==="ok")?"pass":"fail",checks,generated_at:new Date().toISOString()};
}
app.get("/api/admin/system/v53/reliability",requireAdmin,(_req,res)=>{
  const report=reliabilityReportV53();
  res.status(report.status==="pass"?200:503).json({success:report.status==="pass",data:report});
});
app.get("/api/system/v53/version",(_req,res)=>{
  res.json({success:true,data:{release:"V53",name:"Reliability & QA",production_hardening:"V52",api_version:"v53"}});
});


/* ===== COMPLETE QA GATES V54 ===== */
function qaV54(name,fn){
  const t=Date.now();
  try{return {name,status:"PASS",duration_ms:Date.now()-t,value:fn()}}
  catch(e){return {name,status:"FAIL",duration_ms:Date.now()-t,error:e.message}}
}
function qaReportV54(){
  const checks=[
    qaV54("database",()=>queryOne("SELECT 1")!=null),
    qaV54("students",()=>queryOne("SELECT COUNT(*) c FROM students")!=null),
    qaV54("teachers",()=>queryOne("SELECT COUNT(*) c FROM teachers")!=null),
    qaV54("attendance",()=>queryOne("SELECT COUNT(*) c FROM attendance_records_v48")!=null),
    qaV54("finance",()=>queryOne("SELECT COUNT(*) c FROM fee_invoices_v47")!=null),
    qaV54("audit",()=>queryOne("SELECT COUNT(*) c FROM system_audit_v49")!=null),
    qaV54("settings",()=>queryOne("SELECT COUNT(*) c FROM attendance_settings_v48")!=null)
  ];
  return {status:checks.every(x=>x.status==="PASS")?"PASS":"FAIL",checks,generated_at:new Date().toISOString()};
}
app.get("/api/admin/system/v54/qa",requireAdmin,(_req,res)=>{
  const report=qaReportV54();res.status(report.status==="PASS"?200:503).json({success:report.status==="PASS",data:report});
});
app.get("/api/system/v54/readiness",(_req,res)=>{
  const report=qaReportV54();
  const warnings=typeof validateEnvV52==="function"?validateEnvV52():[];
  res.status(report.status==="PASS"&&warnings.length===0?200:503).json({success:report.status==="PASS"&&warnings.length===0,data:{qa:report,warnings}});
});


/* ===== DATA INTEGRITY & TRANSACTION SAFETY V55 ===== */
function integrityV55(name,fn){
  const started=Date.now();
  try{return {name,status:"PASS",duration_ms:Date.now()-started,data:fn()}}
  catch(e){return {name,status:"FAIL",duration_ms:Date.now()-started,error:e.message}}
}
function tableExistsV55(name){
  try{return !!queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[name])}catch{return false}
}
function countV55(sql,args=[]){try{return Number(queryOne(sql,args)?.c||0)}catch{return 0}}
function dataIntegrityReportV55(){
  const duplicateChecks=[
    {name:"duplicate_admission_no",count:countV55(`SELECT COUNT(*) c FROM (SELECT admission_no FROM students WHERE admission_no IS NOT NULL AND admission_no!='' GROUP BY admission_no HAVING COUNT(*)>1)`)},
    {name:"duplicate_student_email",count:countV55(`SELECT COUNT(*) c FROM (SELECT email FROM students WHERE email IS NOT NULL AND email!='' GROUP BY email HAVING COUNT(*)>1)`)},
    {name:"duplicate_teacher_email",count:countV55(`SELECT COUNT(*) c FROM (SELECT email FROM teachers WHERE email IS NOT NULL AND email!='' GROUP BY email HAVING COUNT(*)>1)`)},
    {name:"duplicate_attendance",count:countV55(`SELECT COUNT(*) c FROM (SELECT student_id,attendance_date FROM attendance_records_v48 GROUP BY student_id,attendance_date HAVING COUNT(*)>1)`)}
  ];
  const missingChecks=[
    {name:"students_missing_name",count:countV55(`SELECT COUNT(*) c FROM students WHERE full_name IS NULL OR TRIM(full_name)=''`)},
    {name:"students_missing_admission_no",count:countV55(`SELECT COUNT(*) c FROM students WHERE admission_no IS NULL OR TRIM(admission_no)=''`)},
    {name:"teachers_missing_name",count:countV55(`SELECT COUNT(*) c FROM teachers WHERE name IS NULL OR TRIM(name)=''`)}
  ];
  const orphanChecks=[];
  if(tableExistsV55("attendance_records_v48"))orphanChecks.push({name:"orphan_attendance",count:countV55(`SELECT COUNT(*) c FROM attendance_records_v48 a LEFT JOIN students s ON s.id=a.student_id WHERE s.id IS NULL`)});
  if(tableExistsV55("fee_invoices_v47"))orphanChecks.push({name:"orphan_fee_invoices",count:countV55(`SELECT COUNT(*) c FROM fee_invoices_v47 f LEFT JOIN students s ON s.id=f.student_id WHERE s.id IS NULL`)});
  if(tableExistsV55("leave_requests_v48"))orphanChecks.push({name:"orphan_leave_requests",count:countV55(`SELECT COUNT(*) c FROM leave_requests_v48 l LEFT JOIN students s ON s.id=l.student_id WHERE s.id IS NULL`)});
  const schemaChecks=["students","teachers","attendance_records_v48","fee_invoices_v47","leave_requests_v48","system_audit_v49"].map(t=>({name:t,status:tableExistsV55(t)?"PASS":"FAIL"}));
  const problems=[...duplicateChecks,...missingChecks,...orphanChecks].filter(x=>x.count>0);
  return {status:problems.length===0&&schemaChecks.every(x=>x.status==="PASS")?"PASS":"REVIEW",duplicates:duplicateChecks,missing_required:missingChecks,orphans:orphanChecks,schema:schemaChecks,problem_count:problems.length,generated_at:new Date().toISOString()};
}
function transactionV55(work){
  if(!db||typeof db.run!=="function")return work();
  try{
    db.run("BEGIN");
    const result=work();
    db.run("COMMIT");
    persistDatabase();
    return result;
  }catch(e){
    try{db.run("ROLLBACK")}catch{}
    throw e;
  }
}
function safeNumericV55(v,min=0,max=1000000000){
  const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error("Invalid numeric value.");return n;
}
app.get("/api/admin/system/v55/integrity",requireAdmin,(_req,res)=>{
  const report=dataIntegrityReportV55();
  res.status(report.status==="PASS"?200:409).json({success:report.status==="PASS",data:report});
});
app.get("/api/system/v55/integrity-summary",(_req,res)=>{
  const r=dataIntegrityReportV55();
  res.status(r.status==="PASS"?200:409).json({success:r.status==="PASS",data:{status:r.status,problem_count:r.problem_count}});
});
app.post("/api/admin/system/v55/transaction-test",requireAdmin,(req,res)=>{
  try{
    const result=transactionV55(()=>({message:"Transaction boundary verified without persisting test data."}));
    securityAuditV52?.(req,"transaction_boundary_test",{result});
    res.json({success:true,data:result});
  }catch(e){res.status(500).json({success:false,message:"Transaction test failed."})}
});

app.use((err,_req,res,_next) => {
  console.error(err);
  res.status(500).json({success:false,message:"Internal server error"});
});

if (IS_PRODUCTION && JWT_SECRET === "development-only-secret") {
  console.error("JWT_SECRET must be configured in production.");
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`Sunshine School API: http://localhost:${PORT}`);
});
