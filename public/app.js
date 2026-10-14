const $ = (selector) => document.querySelector(selector);
const state = { books: [], students: [], transactions: [] };

function showMessage(message, type = "success") {
  const box = $("#message");
  box.textContent = message;
  box.className = `message ${type}`;
  box.hidden = false;
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => { box.hidden = true; }, 4500);
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !url.endsWith("/login")) showLogin();
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}
function showLogin() {
  $("#appShell").hidden = true;
  $("#loginScreen").hidden = false;
}
function showApp() {
  $("#loginScreen").hidden = true;
  $("#appShell").hidden = false;
  loadDashboard();
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function date(value) {
  return value ? new Date(value).toLocaleDateString() : "—";
}
function activatePage(page) {
  document.querySelectorAll(".page").forEach(el => el.hidden = el.id !== `page-${page}`);
  document.querySelectorAll("[data-page]").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  const titles = { dashboard: "Dashboard", books: "Book inventory", students: "Students", circulation: "Issue & return", history: "Issue/return history" };
  $("#pageTitle").textContent = titles[page] || "Library";
  if (page === "books") loadBooks();
  if (page === "students") loadStudents();
  if (page === "circulation") loadCirculation();
  if (page === "history") loadHistory();
}
async function loadDashboard() {
  try {
    const stats = await api("/api/stats");
    $("#statTitles").textContent = stats.totalTitles;
    $("#statCopies").textContent = stats.availableCopies;
    $("#statStudents").textContent = stats.students;
    $("#statIssued").textContent = stats.issuedBooks;
    const [books, transactions] = await Promise.all([api("/api/books"), api("/api/transactions")]);
    $("#recentTransactions").innerHTML = transactions.slice(0, 5).map(t => `<tr><td>${esc(t.bookTitle)}</td><td>${esc(t.studentName)}</td><td>${esc(t.status)}</td><td>${date(t.issueDate)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No transactions yet.</td></tr>`;
    $("#lowStock").innerHTML = books.filter(b => b.availableCopies <= 1).slice(0, 5).map(b => `<div class="stock-item"><span>${esc(b.title)}<small>${esc(b.author)}</small></span><span class="pill ${b.availableCopies ? "warning" : "danger"}">${b.availableCopies} available</span></div>`).join("") || `<p class="muted">All books have healthy availability.</p>`;
  } catch (e) { showMessage(e.message, "error"); }
}
async function loadBooks() {
  try {
    const q = encodeURIComponent($("#bookSearch").value || "");
    const availability = encodeURIComponent($("#availabilityFilter").value || "all");
    state.books = await api(`/api/books?q=${q}&availability=${availability}`);
    $("#booksTable").innerHTML = state.books.map(b => `<tr>
      <td><strong>${esc(b.title)}</strong><small>${esc(b.isbn || "No ISBN")}</small></td><td>${esc(b.author)}</td><td>${esc(b.category)}</td>
      <td>${b.availableCopies} / ${b.totalCopies}</td>
      <td><span class="pill ${b.availableCopies ? "success" : "danger"}">${b.availableCopies ? "Available" : "Out of stock"}</span></td>
      <td class="actions"><button class="btn btn-small btn-light" data-edit-book="${b.id}">Edit</button><button class="btn btn-small btn-danger" data-delete-book="${b.id}">Delete</button></td>
    </tr>`).join("") || `<tr><td colspan="6" class="empty">No matching books found.</td></tr>`;
  } catch (e) { showMessage(e.message, "error"); }
}
async function loadStudents() {
  try {
    const q = encodeURIComponent($("#studentSearch").value || "");
    state.students = await api(`/api/students?q=${q}`);
    $("#studentsTable").innerHTML = state.students.map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.studentId)}</td><td>${esc(s.email)}</td><td>${esc(s.course)}</td><td>${date(s.createdAt)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No students found.</td></tr>`;
  } catch (e) { showMessage(e.message, "error"); }
}
async function loadCirculation() {
  try {
    const [books, students, transactions] = await Promise.all([api("/api/books"), api("/api/students"), api("/api/transactions")]);
    state.books = books; state.students = students; state.transactions = transactions;
    $("#issueBook").innerHTML = books.filter(b => b.availableCopies > 0).map(b => `<option value="${b.id}">${esc(b.title)} (${b.availableCopies} available)</option>`).join("");
    $("#issueStudent").innerHTML = students.map(s => `<option value="${s.id}">${esc(s.name)} — ${esc(s.studentId)}</option>`).join("");
    $("#activeLoans").innerHTML = transactions.filter(t => t.status === "Issued").map(t => `<tr><td>${esc(t.bookTitle)}</td><td>${esc(t.studentName)}</td><td>${date(t.issueDate)}</td><td>${date(t.dueDate)}</td><td><button class="btn btn-small btn-primary" data-return="${t.id}">Return book</button></td></tr>`).join("") || `<tr><td colspan="5" class="empty">No active loans.</td></tr>`;
  } catch (e) { showMessage(e.message, "error"); }
}
async function loadHistory() {
  try {
    const q = encodeURIComponent($("#historySearch").value || "");
    state.transactions = await api(`/api/transactions?q=${q}`);
    $("#historyTable").innerHTML = state.transactions.map(t => `<tr><td>#${t.id}</td><td>${esc(t.bookTitle)}</td><td>${esc(t.studentName)} <small>${esc(t.studentCode)}</small></td><td>${date(t.issueDate)}</td><td>${date(t.dueDate)}</td><td>${date(t.returnDate)}</td><td><span class="pill ${t.status === "Issued" ? "warning" : "success"}">${esc(t.status)}</span></td></tr>`).join("") || `<tr><td colspan="7" class="empty">No history records yet.</td></tr>`;
  } catch (e) { showMessage(e.message, "error"); }
}

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("/api/login", { method: "POST", body: JSON.stringify({ username: $("#username").value, password: $("#password").value }) });
    $("#password").value = "";
    showApp();
  } catch (error) { showMessage(error.message, "error"); }
});
$("#logoutBtn").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST", body: "{}" }); showLogin(); }
  catch (e) { showMessage(e.message, "error"); }
});
document.querySelectorAll("[data-page]").forEach(btn => btn.addEventListener("click", () => activatePage(btn.dataset.page)));
document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => activatePage(btn.dataset.go)));
$("#bookSearch").addEventListener("input", loadBooks);
$("#availabilityFilter").addEventListener("change", loadBooks);
$("#studentSearch").addEventListener("input", loadStudents);
$("#historySearch").addEventListener("input", loadHistory);

$("#bookForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("#bookId").value;
  const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
  payload.totalCopies = Number(payload.totalCopies);
  try {
    await api(id ? `/api/books/${id}` : "/api/books", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
    e.currentTarget.reset(); $("#bookId").value = ""; $("#bookFormTitle").textContent = "Add a book"; $("#cancelBookEdit").hidden = true;
    showMessage(id ? "Book updated." : "Book added.");
    loadBooks(); loadDashboard();
  } catch (error) { showMessage(error.message, "error"); }
});
$("#cancelBookEdit").addEventListener("click", () => { $("#bookForm").reset(); $("#bookId").value = ""; $("#bookFormTitle").textContent = "Add a book"; $("#cancelBookEdit").hidden = true; });
$("#studentForm").addEventListener("submit", async e => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
  try {
    await api("/api/students", { method: "POST", body: JSON.stringify(payload) });
    e.currentTarget.reset(); showMessage("Student registered."); loadStudents(); loadDashboard();
  } catch (error) { showMessage(error.message, "error"); }
});
$("#issueForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("/api/transactions/issue", { method: "POST", body: JSON.stringify({ bookId: Number($("#issueBook").value), studentId: Number($("#issueStudent").value) }) });
    showMessage("Book issued. The due date is 14 days from today."); loadCirculation(); loadDashboard();
  } catch (error) { showMessage(error.message, "error"); }
});
document.body.addEventListener("click", async e => {
  const edit = e.target.closest("[data-edit-book]");
  const del = e.target.closest("[data-delete-book]");
  const ret = e.target.closest("[data-return]");
  if (edit) {
    const book = state.books.find(b => b.id === Number(edit.dataset.editBook));
    if (!book) return;
    $("#bookId").value = book.id; $("#bookTitle").value = book.title; $("#bookAuthor").value = book.author;
    $("#bookCategory").value = book.category; $("#bookIsbn").value = book.isbn || ""; $("#bookCopies").value = book.totalCopies;
    $("#bookFormTitle").textContent = "Edit book"; $("#cancelBookEdit").hidden = false;
    $("#bookForm").scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (del) {
    if (!confirm("Delete this book? This cannot be undone.")) return;
    try { await api(`/api/books/${del.dataset.deleteBook}`, { method: "DELETE" }); showMessage("Book deleted."); loadBooks(); loadDashboard(); }
    catch (error) { showMessage(error.message, "error"); }
  } else if (ret) {
    if (!confirm("Confirm that this book is being returned?")) return;
    try { await api(`/api/transactions/${ret.dataset.return}/return`, { method: "POST", body: "{}" }); showMessage("Book returned."); loadCirculation(); loadDashboard(); }
    catch (error) { showMessage(error.message, "error"); }
  }
});

(async function init() {
  try {
    const me = await api("/api/me");
    if (me.authenticated) showApp(); else showLogin();
  } catch (_) { showLogin(); }
})();