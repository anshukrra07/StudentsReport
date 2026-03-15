# Project Structure and Responsibilities

This document explains what each part of the `deoreports` project does.

The application is a full-stack academic reporting system:
- `frontend/` is a React app for login, dashboard, chatbot-driven reporting, report pages, and schedule management.
- `backend/` is an Express API that handles authentication, student/report queries, scheduling data, and PDF export.
- MongoDB stores users, students, and saved schedules.

## High-Level Flow

1. The user opens the React frontend.
2. The login page sends credentials to `POST /api/auth/login`.
3. The backend validates the user from MongoDB and returns a JWT.
4. The frontend stores the token in local storage and sends it on later API calls.
5. Dashboard, chatbot, and report screens call backend endpoints under `/api/reports` and `/api/students`.
6. The backend reads student data from MongoDB, applies role-based access filters, and returns derived report data.

## Repository Tree

```text
deoreports/
├── README.md
├── PROJECT_STRUCTURE.md
├── backend/
│   ├── .env
│   ├── package.json
│   ├── server.js
│   ├── middleware/
│   │   └── auth.js
│   ├── models/
│   │   ├── Student.js
│   │   └── User.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── reports.js
│   │   └── students.js
│   └── seed/
│       └── seedData.js
└── frontend/
    ├── .env
    ├── package.json
    ├── public/
    │   ├── index.html
    │   └── campus/
    │       ├── all.jpg
    │       ├── chairman.jpg
    │       ├── h_block.jpg
    │       ├── h_block_new.jpg
    │       ├── n_block.jpg
    │       ├── u_block.jpg
    │       └── u_block_new.jpg
    └── src/
        ├── App.js
        ├── index.js
        ├── components/
        │   ├── ReportPage.js
        │   └── Sidebar.js
        ├── context/
        │   └── AuthContext.js
        ├── pages/
        │   ├── Chatbot.js
        │   ├── Dashboard.js
        │   ├── LoginPage.js
        │   └── SchedulePage.js
        └── utils/
            └── exportUtils.js
```

## Root Files

### `README.md`
- Project overview, stack, setup steps, demo login credentials, API list, and report types.
- Serves as the main onboarding document.

### `PROJECT_STRUCTURE.md`
- This document.
- Intended to explain the purpose of the repository layout and major files.

## Backend

The backend is an Express server that connects to MongoDB through Mongoose.

### `backend/.env`
- Runtime configuration for the API.
- Defines values such as:
  - `MONGO_URI` for MongoDB connection
  - `JWT_SECRET` for token signing
  - `PORT` for backend port
  - optionally `FRONTEND_URL` for CORS origin

### `backend/package.json`
- Backend dependency manifest.
- Defines scripts such as:
  - `npm start` to run the API
  - `npm run dev` to start with `nodemon`
  - `npm run seed` to populate MongoDB with sample data
- Includes core libraries such as `express`, `mongoose`, `jsonwebtoken`, `bcryptjs`, `cors`, `pdfkit`, `exceljs`, and `node-cron`.

### `backend/server.js`
- Main backend entrypoint.
- Loads environment variables with `dotenv`.
- Creates the Express app.
- Configures CORS and JSON parsing.
- Connects to MongoDB.
- Mounts route groups:
  - `/api/auth`
  - `/api/reports`
  - `/api/students`
- Exposes a simple health check at `/api/health`.
- Starts the server on the configured port.

### `backend/middleware/auth.js`
- Authentication and authorization middleware.
- Responsibilities:
  - reads the JWT from the `Authorization` header
  - verifies the token with `JWT_SECRET`
  - loads the current user from MongoDB
  - rejects missing, invalid, or inactive users
- Exports:
  - `authenticate` for protected routes
  - `authorize(...roles)` for role-based access checks
  - `JWT_SECRET` for token signing/verification consistency

### `backend/models/User.js`
- Mongoose schema for application users.
- Stores:
  - `username`
  - `password`
  - `name`
  - `role`
  - `department`
  - `email`
  - `isActive`
- Important behavior:
  - hashes passwords with bcrypt in a `pre('save')` hook
  - exposes `comparePassword()` for login validation
- Backed by the MongoDB `users` collection.

### `backend/models/Student.js`
- Mongoose schema for academic data.
- This is the central data model that powers nearly all reports.
- Stores:
  - basic identity fields like roll number, name, department, section, batch
  - semester records and subject marks
  - attendance by subject and semester
  - CGPA and backlog details
- Nested schemas:
  - `subjectMarkSchema`
  - `semesterSchema`
  - `attendanceSchema`
- Backed by the MongoDB `students` collection.

### `backend/routes/auth.js`
- Authentication API routes.
- Main responsibilities:
  - `POST /api/auth/login`
    - validates `username` and `password`
    - compares password using bcrypt
    - returns a JWT and basic user profile
  - `GET /api/auth/me`
    - returns the currently authenticated user
  - `GET /api/auth/users`
    - admin-only listing of users without passwords
- This file is the entrypoint for sign-in and session restoration.

### `backend/routes/students.js`
- Student data listing and filter metadata endpoints.
- All routes are protected by `authenticate`.
- Main responsibilities:
  - `GET /api/students`
    - returns students filtered by department, batch, section, and semester
    - applies department restrictions for non-admin users
  - `GET /api/students/meta`
    - returns distinct departments, batches, and sections for dropdown filters
- Used heavily by the report pages to populate filter controls.

### `backend/routes/reports.js`
- Main reporting module.
- All routes are protected by `authenticate`.
- Contains report generation logic built on top of `Student` data.
- Major endpoints:
  - `GET /api/reports/attendance`
    - section-wise attendance
    - subject-wise attendance
    - department-wise attendance
    - low attendance reports
  - `GET /api/reports/marks`
    - internal marks
    - external marks
    - semester summaries
    - subject performance
  - `GET /api/reports/backlogs`
    - backlog lists
    - repeated-failure analysis
    - pending credits
  - `GET /api/reports/cgpa`
    - rankings
    - toppers
    - CGPA distribution
  - `GET /api/reports/risk`
    - identifies at-risk students based on CGPA, backlog count, and attendance
  - `GET /api/reports/top-performers`
    - top N students by CGPA
  - `GET /api/reports/summary`
    - dashboard cards and summary metrics
  - `POST /api/reports/schedule`
    - saves a schedule configuration in MongoDB
  - `GET /api/reports/schedules`
    - lists saved schedules
  - `DELETE /api/reports/schedule/:id`
    - removes a saved schedule
  - `GET /api/reports/export-pdf`
    - generates a PDF file for a report using `pdfkit`
- Also defines:
  - access-controlled filter helpers
  - a Mongoose `Schedule` model inline for saved schedules
  - date logic for next scheduled run

### `backend/seed/seedData.js`
- Development seed script for populating the database.
- Responsibilities:
  - connects to MongoDB
  - clears old `users` and `students`
  - inserts demo users for roles like `admin`, `deo`, `hod`, and `faculty`
  - generates large realistic student datasets by department, batch, section, semester, marks, attendance, and backlogs
- Useful for creating a demo environment quickly.
- Important detail:
  - users are created through the `User` model so the password hashing hook runs correctly

## Frontend

The frontend is a React app that uses a simple page-state approach rather than React Router.

### `frontend/.env`
- Frontend runtime configuration.
- Usually contains:
  - `REACT_APP_API_URL=http://localhost:5000/api`
- Controls which backend the React app talks to.

### `frontend/package.json`
- Frontend dependency manifest.
- Contains React app dependencies and scripts for local development/building.
- Supports the UI layer, charts, HTTP requests, and export features.

## Frontend Public Assets

### `frontend/public/index.html`
- HTML shell loaded by the browser.
- Defines:
  - page title
  - imported Google fonts
  - global CSS variables
  - base animation keyframes and scrollbar styles
- This file provides the visual foundation before React mounts.

### `frontend/public/campus/`
- Static image assets used across the UI.
- Purpose by file:
  - `all.jpg`: wide campus image used in dashboard/report banners
  - `chairman.jpg`: chairman portrait used on dashboard/login screen
  - `h_block.jpg`, `h_block_new.jpg`: building images used for report page heroes
  - `n_block.jpg`: login/dashboard/report visual
  - `u_block.jpg`, `u_block_new.jpg`: scheduling/report visual

## Frontend Source

### `frontend/src/index.js`
- React bootstrap file.
- Creates the root and renders `<App />` inside `React.StrictMode`.

### `frontend/src/App.js`
- Main frontend composition file.
- Responsibilities:
  - wraps the app with `AuthProvider`
  - waits for auth restoration to complete
  - shows `LoginPage` if there is no authenticated user
  - shows the main application shell after login
  - keeps current page state such as:
    - `dashboard`
    - `chatbot`
    - `attendance`
    - `marks`
    - `backlogs`
    - `cgpa`
    - `risk`
    - `toppers`
    - `schedule`
  - defines the configuration objects for reusable report pages:
    - titles
    - icons
    - filters
    - column definitions
    - per-report table variants
- This file is effectively the frontend controller for navigation and report-page configuration.

### `frontend/src/context/AuthContext.js`
- Central auth state manager for the frontend.
- Responsibilities:
  - stores the JWT in local storage under `deo_token`
  - injects the token into Axios headers
  - restores the logged-in user on refresh using `/auth/me`
  - provides `login()` and `logout()` helpers
  - exposes `API`, `user`, `token`, and loading state to components
- This is the bridge between the React UI and backend auth API.

## Frontend Components

### `frontend/src/components/Sidebar.js`
- Left navigation panel for authenticated users.
- Responsibilities:
  - shows app branding
  - shows current user name, role, and department
  - renders navigation buttons for dashboard, chatbot, reports, and schedule page
  - triggers logout
- Uses role-based styling for user badges and active menu states.

### `frontend/src/components/ReportPage.js`
- Reusable report screen used for several report types.
- This is one of the most important frontend files.
- Responsibilities:
  - fetches metadata for dropdown filters from `/students/meta`
  - builds report-specific API URLs
  - loads report data from the backend
  - supports filters like department, batch, section, semester, type, threshold, and limit
  - renders a common results table with dynamic columns
  - performs client-side search within fetched results
  - exports results to Excel, CSV, or backend-generated PDF
- Handles these report families through props from `App.js`:
  - attendance
  - marks
  - backlogs
  - cgpa
  - risk
  - toppers

## Frontend Pages

### `frontend/src/pages/LoginPage.js`
- Public login screen.
- Responsibilities:
  - collects username and password
  - calls `login()` from `AuthContext`
  - shows errors for invalid credentials
  - exposes demo credential shortcuts for quick access
  - supports speech recognition for filling the username field
- Also contains the most elaborate login-specific UI styling and campus branding.

### `frontend/src/pages/Dashboard.js`
- Landing page after login.
- Responsibilities:
  - fetches summary metrics from `/reports/summary`
  - fetches CGPA distribution from `/reports/cgpa?type=distribution`
  - renders stat cards, a bar chart, and a pie chart
  - shows user-specific greeting and department context
  - uses campus images and chairman message for branding
- This page provides the quick overview of student health/performance data.

### `frontend/src/pages/Chatbot.js`
- Natural-language report query page.
- Responsibilities:
  - provides a conversational UI for report requests
  - parses plain-English prompts into:
    - report type
    - department
    - section
    - semester
    - batch
    - threshold
    - limit
  - converts parsed intent into report API calls
  - displays returned data in a compact table
  - allows export of chatbot-generated results
  - supports speech recognition for voice input
- This file acts as a lightweight rule-based NLP layer on the client side.

### `frontend/src/pages/SchedulePage.js`
- UI for creating and listing saved report schedules.
- Responsibilities:
  - loads schedules from `/reports/schedules`
  - creates schedules using `POST /reports/schedule`
  - deletes schedules using `DELETE /reports/schedule/:id`
  - lets the user choose report type, frequency, label, and destination email
- Important note:
  - this currently stores scheduling metadata in MongoDB
  - it does not itself execute email delivery jobs

## Frontend Utilities

### `frontend/src/utils/exportUtils.js`
- Shared export helpers used by the chatbot and reusable report page.
- Responsibilities:
  - `exportToExcel()` using `xlsx`
  - `exportToCSV()` using browser `Blob` download
  - `exportToPDF()` using dynamic import of `jspdf` and `jspdf-autotable`
  - `flattenForExport()` to convert nested API data into export-friendly rows
- Keeps export logic out of the page components.

## Data Model Summary

### MongoDB collections used by the project
- `users`
  - login accounts and roles
- `students`
  - academic, attendance, semester, and backlog data
- `schedules`
  - saved report schedule definitions

## Practical Ownership Map

If you want to change a specific behavior, these are the main files:

- Login/auth problems:
  - `backend/routes/auth.js`
  - `backend/middleware/auth.js`
  - `backend/models/User.js`
  - `frontend/src/context/AuthContext.js`
  - `frontend/src/pages/LoginPage.js`

- Student filtering or department access:
  - `backend/routes/students.js`
  - `backend/routes/reports.js`

- Report calculations:
  - `backend/routes/reports.js`
  - `backend/models/Student.js`

- Report UI/table/export behavior:
  - `frontend/src/App.js`
  - `frontend/src/components/ReportPage.js`
  - `frontend/src/utils/exportUtils.js`

- Dashboard cards/charts:
  - `frontend/src/pages/Dashboard.js`
  - `backend/routes/reports.js` under `/summary` and `/cgpa`

- Chatbot prompt handling:
  - `frontend/src/pages/Chatbot.js`

- Schedule creation/listing:
  - `frontend/src/pages/SchedulePage.js`
  - `backend/routes/reports.js` schedule endpoints

## Notes

- This structure reflects the checked-in project files and excludes dependency/build folders such as `node_modules`.
- The frontend uses page state in `App.js` instead of route-based navigation.
- The backend currently computes most reports on demand from the `students` collection rather than storing report snapshots separately.
