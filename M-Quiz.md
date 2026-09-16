Act as an expert full-stack web developer and modern UI/UX designer. Create a stylish, responsive, and professional quiz competition website for conducting online quiz competitions.

Use SQLite as the database and Socket.io for real-time leaderboard updates.

Website goal:
The website should allow organizers to create and manage quizzes, and participants to join quiz competitions using a quiz code or link. It should look modern, attractive, smooth, competitive, and suitable for college events, coding competitions, GK quizzes, and tech fests.

Tech stack:
- Frontend: React.js or HTML/CSS/JavaScript with EJS
- Backend: Node.js with Express.js
- Database: SQLite
- SQLite library: better-sqlite3 or Sequelize with SQLite
- Real-time communication: Socket.io
- Styling: Tailwind CSS or modern custom CSS
- Authentication: JWT or session-based authentication
- Password security: bcrypt

Main features required:

1. Home Page
- Stylish hero section with title like “Quiz Arena” or “Ultimate Quiz Competition”
- Buttons: “Create Quiz”, “Join Quiz”, “View Leaderboard”
- Modern cards, gradients, animations, and glassmorphism design
- Fully responsive for mobile, tablet, and desktop

2. User Authentication
- Login and signup for participants and admin/organizer
- Roles: admin, participant
- Store users in SQLite database
- Secure password hashing using bcrypt
- Optional guest participation for quick quizzes
- Show proper success and error messages

3. Admin Quiz Creation Panel
Admin should be able to:
- Create quiz title, description, subject, and duration
- Add multiple-choice questions
- Add 4 options for each question
- Set correct answer
- Assign marks for each question
- Set optional negative marking
- Generate unique quiz code
- Publish/unpublish quiz
- Edit/delete quiz
- View participants and results
- Start/end quiz manually
- Export results as CSV
- Announce winners

4. Participant Quiz Interface
Participant should be able to:
- Join quiz using quiz code
- See quiz instructions before starting
- Start quiz with countdown timer
- View one question at a time
- Select answers and change answers before final submission
- See remaining time live
- Auto-submit when time ends
- Submit quiz manually
- See score after submission if allowed by admin

5. Real-Time Leaderboard
The website must include a real-time leaderboard using Socket.io.

Leaderboard requirements:
- When a participant submits a quiz, the backend should calculate the score and save it into the SQLite database.
- After saving the score, the server should update the leaderboard and emit a Socket.io event to all connected clients.
- The client should listen for the leaderboard update event and automatically update the leaderboard without page refresh.
- The leaderboard should be ranked using:
  1. Highest score first
  2. If scores are equal, lower time taken should rank higher
- Show live update indicator on leaderboard page.
- Add fallback polling every 5 seconds if Socket.io connection fails.
- Prevent duplicate submissions using SQLite transactions and database constraints.
- Show participant name, score, time taken, and rank.

Socket.io events:

Client to server:
- "joinQuizRoom" with quizId
- "submitQuiz" with quizId, userId, answers, timeTaken

Server to client:
- "leaderboardUpdated" with updated leaderboard data
- "quizSubmitted" with result confirmation
- "error" with error message

6. Admin Dashboard
- Show total quizzes, total users, active quizzes, and results
- Manage questions easily
- View live leaderboard for each quiz
- Start/end quiz manually
- Export results as CSV
- Announce winners

7. UI/UX Style
Design style should be:
- Modern, bold, and attractive
- Dark mode by default with optional light mode
- Smooth hover effects, transitions, and micro-animations
- Card-based layout
- Gradient buttons
- Rounded corners
- Clean typography
- Loading spinners and success/error toasts
- Empty state messages with clean design
- Responsive design for mobile, tablet, and desktop

8. SQLite Database Requirements
Create a SQLite database file named `quiz.db`.

Create these tables:

users:
- id INTEGER PRIMARY KEY AUTOINCREMENT
- name TEXT NOT NULL
- email TEXT UNIQUE NOT NULL
- password TEXT NOT NULL
- role TEXT DEFAULT 'participant'
- created_at DATETIME DEFAULT CURRENT_TIMESTAMP

quizzes:
- id INTEGER PRIMARY KEY AUTOINCREMENT
- title TEXT NOT NULL
- description TEXT
- subject TEXT
- quiz_code TEXT UNIQUE NOT NULL
- duration_minutes INTEGER NOT NULL
- total_marks INTEGER DEFAULT 0
- negative_marking INTEGER DEFAULT 0
- is_active INTEGER DEFAULT 1
- created_by INTEGER
- start_time DATETIME
- end_time DATETIME
- created_at DATETIME DEFAULT CURRENT_TIMESTAMP
- FOREIGN KEY (created_by) REFERENCES users(id)

questions:
- id INTEGER PRIMARY KEY AUTOINCREMENT
- quiz_id INTEGER NOT NULL
- question_text TEXT NOT NULL
- option_a TEXT NOT NULL
- option_b TEXT NOT NULL
- option_c TEXT NOT NULL
- option_d TEXT NOT NULL
- correct_option TEXT NOT NULL
- marks INTEGER DEFAULT 1
- created_at DATETIME DEFAULT CURRENT_TIMESTAMP
- FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE

attempts:
- id INTEGER PRIMARY KEY AUTOINCREMENT
- user_id INTEGER NOT NULL
- quiz_id INTEGER NOT NULL
- score INTEGER DEFAULT 0
- time_taken_seconds INTEGER DEFAULT 0
- submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
- UNIQUE(user_id, quiz_id)
- FOREIGN KEY (user_id) REFERENCES users(id)
- FOREIGN KEY (quiz_id) REFERENCES quizzes(id)

answers:
- id INTEGER PRIMARY KEY AUTOINCREMENT
- attempt_id INTEGER NOT NULL
- question_id INTEGER NOT NULL
- selected_option TEXT
- is_correct INTEGER DEFAULT 0
- marks_obtained INTEGER DEFAULT 0
- FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
- FOREIGN KEY (question_id) REFERENCES questions(id)

leaderboard:
- id INTEGER PRIMARY KEY AUTOINCREMENT
- quiz_id INTEGER NOT NULL
- user_id INTEGER NOT NULL
- score INTEGER NOT NULL
- time_taken_seconds INTEGER NOT NULL
- rank INTEGER
- updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
- UNIQUE(quiz_id, user_id)
- FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
- FOREIGN KEY (user_id) REFERENCES users(id)

9. Backend API Routes
Create REST API endpoints:

Auth:
- POST /api/auth/signup
- POST /api/auth/login
- GET /api/auth/me

Quiz:
- POST /api/quizzes
- GET /api/quizzes
- GET /api/quizzes/:id
- PUT /api/quizzes/:id
- DELETE /api/quizzes/:id
- POST /api/quizzes/:id/questions
- GET /api/quizzes/code/:code

Attempt:
- POST /api/attempts/start
- POST /api/attempts/submit
- GET /api/attempts/result/:attemptId

Leaderboard:
- GET /api/leaderboard/:quizId

Admin:
- GET /api/admin/dashboard
- GET /api/admin/quizzes
- GET /api/admin/results/:quizId
- GET /api/admin/export-results/:quizId

10. Pages Required
Create these pages:
- Home page
- Login page
- Signup page
- Admin dashboard
- Create quiz page
- Manage questions page
- Join quiz page
- Live quiz page
- Result page
- Real-time leaderboard page
- Profile page
- 404 page

11. Extra Requirements
- Write clean and well-commented code
- Provide folder structure
- Provide reusable components
- Include form validation
- Show proper error messages
- Make the code beginner-friendly but professional
- Explain how to run the project locally
- Include SQLite database initialization script
- Include Socket.io setup code
- Provide sample dummy quiz data
- Make the design suitable for college events, coding competitions, GK quizzes, and tech fests

12. Output format
First give the complete project structure.
Then provide:
1. SQLite database setup code
2. Backend API code
3. Socket.io real-time leaderboard code
4. Frontend pages/code
5. Sample dummy data
6. Instructions to run the project locally

If the code is too long, divide it into parts but keep everything complete and functional.
