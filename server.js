require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

function initialDatabase() {
  return {
    books: [
      { id: 1, title: "The Alchemist", author: "Paulo Coelho", category: "Fiction", isbn: "9780061122415", totalCopies: 5 },
      { id: 2, title: "Wings of Fire", author: "A. P. J. Abdul Kalam", category: "Biography", isbn: "9788173711466", totalCopies: 4 },
      { id: 3, title: "Clean Code", author: "Robert C. Martin", category: "Technology", isbn: "9780132350884", totalCopies: 3 }
    ],
    students: [
      { id: 1, name: "Demo Student", studentId: "STU001", email: "student@example.com", course: "Computer Science", createdAt: new Date().toISOString() }
    ],
    transactions: [],
    nextIds: { book: 4, student: 2, transaction: 1 }
  };
}

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify(initialDatabase(), null, 2));
}

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (error) {
    console.error("Could not read data/db.json:", error.message);
    throw new Error("Database file is invalid. Back it up and restore valid JSON.");
  }
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
const adminPasswordHash = bcrypt.hashSync(adminPassword, 10);

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: "library.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.HTTPS_ENABLED === "true",
    maxAge: 1000 * 60 * 60 * 4
  }
}));
app.use(express.static(path.join(__dirname, "public")));

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Please log in as admin first." });
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredString(value, label) {
  const result = cleanString(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function availableCopies(db, bookId) {
  const book = db.books.find(item => item.id === Number(bookId));
  if (!book) return 0;
  const activeLoans = db.transactions.filter(t => t.bookId === book.id && t.status === "Issued").length;
  return Math.max(0, book.totalCopies - activeLoans);
}

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.post("/api/login", (req, res) => {
  const username = cleanString(req.body.username);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (username !== adminUsername || !bcrypt.compareSync(password, adminPasswordHash)) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start session." });
    req.session.isAdmin = true;
    req.session.username = adminUsername;
    res.json({ message: "Login successful.", username: adminUsername });
  });
});

app.post("/api/logout", (req, res) => {
  if (!req.session) return res.json({ message: "Logged out." });
  req.session.destroy(() => {
    res.clearCookie("library.sid");
    res.json({ message: "Logged out." });
  });
});

app.get("/api/me", (req, res) => {
  res.json({ authenticated: Boolean(req.session && req.session.isAdmin), username: req.session?.username || null });
});

app.get("/api/stats", requireAdmin, (req, res) => {
  const db = readDb();
  const activeLoans = db.transactions.filter(t => t.status === "Issued").length;
  const totalCopies = db.books.reduce((sum, b) => sum + b.totalCopies, 0);
  const available = db.books.reduce((sum, b) => sum + availableCopies(db, b.id), 0);
  res.json({
    totalTitles: db.books.length,
    totalCopies,
    availableCopies: available,
    issuedBooks: activeLoans,
    students: db.students.length
  });
});

app.get("/api/books", requireAdmin, (req, res) => {
  const db = readDb();
  const query = cleanString(req.query.q).toLowerCase();
  const filter = cleanString(req.query.availability).toLowerCase();
  const books = db.books.map(book => ({ ...book, availableCopies: availableCopies(db, book.id) }))
    .filter(book => {
      const matchesQuery = !query || [book.title, book.author, book.category, book.isbn].some(v => String(v || "").toLowerCase().includes(query));
      const matchesFilter = filter === "available" ? book.availableCopies > 0 : filter === "unavailable" ? book.availableCopies === 0 : true;
      return matchesQuery && matchesFilter;
    });
  res.json(books);
});

app.post("/api/books", requireAdmin, (req, res) => {
  try {
    const title = requiredString(req.body.title, "Title");
    const author = requiredString(req.body.author, "Author");
    const category = requiredString(req.body.category, "Category");
    const isbn = cleanString(req.body.isbn);
    const totalCopies = Number(req.body.totalCopies);
    if (!Number.isInteger(totalCopies) || totalCopies < 1 || totalCopies > 100000) {
      return res.status(400).json({ error: "Total copies must be a whole number greater than zero." });
    }
    const db = readDb();
    const book = { id: db.nextIds.book++, title, author, category, isbn, totalCopies };
    db.books.push(book);
    writeDb(db);
    res.status(201).json({ ...book, availableCopies: totalCopies });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/books/:id", requireAdmin, (req, res) => {
  const db = readDb();
  const book = db.books.find(b => b.id === Number(req.params.id));
  if (!book) return res.status(404).json({ error: "Book not found." });
  try {
    const title = requiredString(req.body.title, "Title");
    const author = requiredString(req.body.author, "Author");
    const category = requiredString(req.body.category, "Category");
    const totalCopies = Number(req.body.totalCopies);
    if (!Number.isInteger(totalCopies) || totalCopies < 1) return res.status(400).json({ error: "Total copies must be at least 1." });
    const currentlyIssued = db.transactions.filter(t => t.bookId === book.id && t.status === "Issued").length;
    if (totalCopies < currentlyIssued) return res.status(400).json({ error: `There are ${currentlyIssued} copies currently issued; stock cannot be lower than that.` });
    Object.assign(book, { title, author, category, isbn: cleanString(req.body.isbn), totalCopies });
    writeDb(db);
    res.json({ ...book, availableCopies: availableCopies(db, book.id) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/books/:id", requireAdmin, (req, res) => {
  const db = readDb();
  const id = Number(req.params.id);
  if (db.transactions.some(t => t.bookId === id && t.status === "Issued")) {
    return res.status(400).json({ error: "Return this book before deleting it." });
  }
  const index = db.books.findIndex(b => b.id === id);
  if (index < 0) return res.status(404).json({ error: "Book not found." });
  db.books.splice(index, 1);
  writeDb(db);
  res.json({ message: "Book deleted." });
});

app.get("/api/students", requireAdmin, (req, res) => {
  const db = readDb();
  const query = cleanString(req.query.q).toLowerCase();
  res.json(db.students.filter(s => !query || [s.name, s.studentId, s.email, s.course].some(v => String(v || "").toLowerCase().includes(query))));
});

app.post("/api/students", requireAdmin, (req, res) => {
  try {
    const name = requiredString(req.body.name, "Name");
    const studentId = requiredString(req.body.studentId, "Student ID");
    const email = requiredString(req.body.email, "Email");
    const course = requiredString(req.body.course, "Course");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    const db = readDb();
    if (db.students.some(s => s.studentId.toLowerCase() === studentId.toLowerCase())) return res.status(409).json({ error: "That Student ID is already registered." });
    if (db.students.some(s => s.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: "That email is already registered." });
    const student = { id: db.nextIds.student++, name, studentId, email, course, createdAt: new Date().toISOString() };
    db.students.push(student);
    writeDb(db);
    res.status(201).json(student);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/transactions", requireAdmin, (req, res) => {
  const db = readDb();
  const query = cleanString(req.query.q).toLowerCase();
  const transactions = db.transactions.map(t => ({
    ...t,
    bookTitle: db.books.find(b => b.id === t.bookId)?.title || "Deleted book",
    studentName: db.students.find(s => s.id === t.studentId)?.name || "Deleted student",
    studentCode: db.students.find(s => s.id === t.studentId)?.studentId || ""
  })).filter(t => !query || [t.bookTitle, t.studentName, t.studentCode, t.status].some(v => String(v || "").toLowerCase().includes(query)))
    .sort((a, b) => b.id - a.id);
  res.json(transactions);
});

app.post("/api/transactions/issue", requireAdmin, (req, res) => {
  const bookId = Number(req.body.bookId);
  const studentId = Number(req.body.studentId);
  const db = readDb();
  const book = db.books.find(b => b.id === bookId);
  const student = db.students.find(s => s.id === studentId);
  if (!book) return res.status(404).json({ error: "Select a valid book." });
  if (!student) return res.status(404).json({ error: "Select a registered student." });
  if (availableCopies(db, bookId) < 1) return res.status(400).json({ error: "No copies of this book are currently available." });
  const alreadyHasBook = db.transactions.some(t => t.bookId === bookId && t.studentId === studentId && t.status === "Issued");
  if (alreadyHasBook) return res.status(400).json({ error: "This student already has an active loan for this book." });
  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 14);
  const transaction = {
    id: db.nextIds.transaction++,
    bookId, studentId,
    issueDate: now.toISOString(),
    dueDate: dueDate.toISOString(),
    returnDate: null,
    status: "Issued"
  };
  db.transactions.push(transaction);
  writeDb(db);
  res.status(201).json(transaction);
});

app.post("/api/transactions/:id/return", requireAdmin, (req, res) => {
  const db = readDb();
  const transaction = db.transactions.find(t => t.id === Number(req.params.id));
  if (!transaction) return res.status(404).json({ error: "Loan record not found." });
  if (transaction.status === "Returned") return res.status(400).json({ error: "This book has already been returned." });
  transaction.status = "Returned";
  transaction.returnDate = new Date().toISOString();
  writeDb(db);
  res.json(transaction);
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Library Management System running on http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) console.warn("Using demo admin password. Set ADMIN_PASSWORD in .env before sharing/deploying.");
});