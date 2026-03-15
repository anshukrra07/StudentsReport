# DEO Reports — University Department Data Management System

A full-stack chatbot-based report generation system for university DEOs and administrators.

---

## 🏗️ Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Frontend   | React 18, Recharts, Axios, XLSX   |
| Backend    | Node.js, Express.js               |
| Database   | MongoDB + Mongoose                |
| Auth       | JWT + bcrypt, Role-Based Access   |
| Export     | Excel (XLSX), CSV, PDF (jsPDF)    |

---

## 📁 Project Structure

```
deoreports/
├── backend/
│   ├── models/
│   │   ├── User.js          # User model with bcrypt hashing
│   │   └── Student.js       # Student with attendance, marks, backlogs
│   ├── routes/
│   │   ├── auth.js          # Login, /me, user management
│   │   ├── reports.js       # All report endpoints
│   │   └── students.js      # Student listing + metadata
│   ├── middleware/
│   │   └── auth.js          # JWT + role-based guard
│   ├── seed/
│   │   └── seedData.js      # Auto-generates realistic data
│   ├── server.js
│   ├── .env
│   └── package.json
│
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── context/
    │   │   └── AuthContext.js     # Auth state + axios token injection
    │   ├── pages/
    │   │   ├── LoginPage.js       # Styled login with demo credentials
    │   │   ├── Dashboard.js       # Summary stats + charts
    │   │   └── Chatbot.js         # NL query → API → table + export
    │   ├── components/
    │   │   ├── Sidebar.js         # Navigation + user card
    │   │   └── ReportPage.js      # Reusable filter + table + export UI
    │   ├── utils/
    │   │   └── exportUtils.js     # Excel, CSV, PDF export helpers
    │   ├── App.js
    │   └── index.js
    ├── .env
    └── package.json
```

---

## 🚀 Setup & Run Instructions

### Prerequisites
- Node.js v16+
- MongoDB (local or MongoDB Atlas)
- npm or yarn

---

### Step 1 — Backend Setup

```bash
cd deoreports/backend
npm install
```

Edit `.env` if needed:
```
MONGO_URI=mongodb://localhost:27017/deoreports
JWT_SECRET=deoreports_super_secret_key_2024
PORT=5000
```

Seed the database with sample data:
```bash
node seed/seedData.js
```

Start the backend:
```bash
npm start
# or for development with auto-reload:
npm run dev
```

Backend runs at: `http://localhost:5000`

---

### Step 2 — Frontend Setup

```bash
cd deoreports/frontend
npm install
npm start
```

Frontend runs at: `http://localhost:3000`

---

## 🔑 Login Credentials

| Role       | Username     | Password    | Access Level              |
|------------|--------------|-------------|---------------------------|
| Admin      | `admin`      | `admin123`  | All departments           |
| DEO (CSE)  | `deo_cse`    | `deo123`    | CSE department only       |
| DEO (ECE)  | `deo_ece`    | `deo123`    | ECE department only       |
| HOD (CSE)  | `hod_cse`    | `hod123`    | CSE department only       |
| Faculty    | `faculty_cse`| `faculty123`| CSE department only       |

---

## 📊 Report Types

### Via Chatbot (Natural Language)
Type queries like:
- `"Show low attendance for CSE below 65%"`
- `"List students with backlogs in batch 2022-2026"`
- `"Top 10 performers by CGPA"`
- `"CGPA distribution for ECE"`
- `"At-risk students in CSE section A"`
- `"Internal marks report for semester 2"`

### Via Report Pages (Filter UI)
All pages support filters by: Department, Batch, Section, Semester

| Page            | Reports Available                                      |
|-----------------|--------------------------------------------------------|
| Attendance      | Section-wise, Subject-wise, Low Attendance             |
| Marks & Results | Internal, External, Subject Performance               |
| Backlogs        | Students with arrears, repeat subjects                |
| CGPA Reports    | Full ranking, Toppers, Distribution                   |
| At-Risk         | Low CGPA + backlogs + attendance combined             |
| Top Performers  | Configurable top-N list                               |

---

## 📤 Export Options

Every report can be exported as:
- **Excel (.xlsx)** — formatted spreadsheet
- **CSV (.csv)** — comma-separated for any tool
- **PDF (.pdf)** — via chatbot export button

---

## 🔒 Role-Based Access

| Role    | Department Filter | Can See All Depts |
|---------|-------------------|-------------------|
| admin   | None (global)     | ✅                |
| deo     | Own dept only     | ❌                |
| hod     | Own dept only     | ❌                |
| faculty | Own dept only     | ❌                |

---

## 🗄️ API Endpoints

```
POST   /api/auth/login              Login
GET    /api/auth/me                 Current user
GET    /api/students                List students (with filters)
GET    /api/students/meta           Distinct depts, batches, sections
GET    /api/reports/summary         Dashboard stats
GET    /api/reports/attendance      Attendance reports
GET    /api/reports/marks           Marks/results reports
GET    /api/reports/backlogs        Backlog reports
GET    /api/reports/cgpa            CGPA reports
GET    /api/reports/risk            At-risk students
GET    /api/reports/top-performers  Top performers
```

All report endpoints accept query params: `department`, `batch`, `section`, `semester`, `type`, `threshold`, `limit`
