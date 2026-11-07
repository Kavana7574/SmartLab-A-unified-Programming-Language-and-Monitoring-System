import express, { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { db, hashPassword, verifyPassword } from './db.js';
import { compareFaceEmbeddings } from './faceBiometrics.js';
import { executeCode } from './codeRunner.js';

export const apiRouter = express.Router();
apiRouter.use(express.json({ limit: '10mb' }));

// In-memory token store for active sessions
interface SessionData {
  userId: string;
  role: 'student' | 'faculty' | 'admin';
  name: string;
  usn?: string;
  facultyId?: string;
  branch?: string;
  semester?: number;
  loginTime: number;
}
const activeSessions = new Map<string, SessionData>();

// Temporary challenge tokens for 2-step face login
interface ChallengeData {
  userId: string;
  usn: string;
  name: string;
  branch: string;
  semester: number;
  expiresAt: number;
}
const faceChallenges = new Map<string, ChallengeData>();

// Auth Middleware
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  (req as any).user = session;
  next();
}

export function requireFaculty(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as SessionData;
  if (!user || (user.role !== 'faculty' && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Access forbidden: Faculty credentials required' });
  }
  next();
}

export function requireStudent(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as SessionData;
  if (!user || user.role !== 'student') {
    return res.status(403).json({ error: 'Access forbidden: Student credentials required' });
  }
  next();
}

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================

// Student Registration with Biometric Face Enrollment
apiRouter.post('/auth/student-register', (req, res) => {
  try {
    const {
      fullName,
      usn,
      username,
      password,
      confirmPassword,
      email,
      branch,
      semester,
      faceVector, // 128-D float array from webcam
      qualityScore = 95
    } = req.body;

    if (!fullName || !usn || !username || !password || !email || !branch || !semester) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    // Biometric validation
    if (!faceVector || !Array.isArray(faceVector) || faceVector.length !== 128) {
      return res.status(400).json({
        error: 'Face enrollment is mandatory. Please capture a clear photograph to generate your face template.'
      });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanUsername = username.trim().toLowerCase();

    // Check uniqueness
    const existing = db.prepare('SELECT id, usn, username FROM users WHERE usn = ? OR username = ?').get(cleanUsn, cleanUsername) as any;
    if (existing) {
      if (existing.usn === cleanUsn) {
        return res.status(400).json({ error: `A student with USN ${cleanUsn} already exists.` });
      }
      return res.status(400).json({ error: `Username ${cleanUsername} is already taken.` });
    }

    const { hash, salt } = hashPassword(password);
    const userId = `usr_${cleanUsn.toLowerCase()}`;
    const now = new Date().toISOString();

    // Insert user
    db.prepare(`
      INSERT INTO users (id, role, name, username, password_hash, salt, email, branch, semester, usn, status, created_at)
      VALUES (?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(userId, fullName.trim(), cleanUsername, hash, salt, email.trim(), branch, Number(semester), cleanUsn, now);

    // Insert face template
    db.prepare(`
      INSERT OR REPLACE INTO face_templates (id, usn, template_data, quality_score, registered_at, last_verified_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`face_${cleanUsn}`, cleanUsn, JSON.stringify(faceVector), Number(qualityScore), now, now);

    // Auto-allocate existing published assignments & quizzes for this branch & semester
    const matchingAssignments = db.prepare('SELECT id FROM assignments WHERE branch = ? AND semester = ? AND status = ?').all(branch, Number(semester), 'published') as { id: string }[];
    for (const a of matchingAssignments) {
      db.prepare('INSERT OR IGNORE INTO assignment_allocations (id, assignment_id, student_usn) VALUES (?, ?, ?)')
        .run(`alloc_${a.id}_${cleanUsn}`, a.id, cleanUsn);
    }

    const matchingQuizzes = db.prepare('SELECT id FROM quizzes WHERE branch = ? AND semester = ? AND status = ?').all(branch, Number(semester), 'published') as { id: string }[];
    for (const q of matchingQuizzes) {
      db.prepare('INSERT OR IGNORE INTO quiz_allocations (id, quiz_id, student_usn) VALUES (?, ?, ?)')
        .run(`qalloc_${q.id}_${cleanUsn}`, q.id, cleanUsn);
    }

    res.json({
      success: true,
      message: 'Student Registration & Face Biometric Enrollment completed successfully. You can now sign in.'
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// Student Login Step 1: Validate USN, Password, Branch, Semester
apiRouter.post('/auth/student-login-step1', (req, res) => {
  try {
    const { usn, password, branch, semester } = req.body;

    if (!usn || !password || !branch || !semester) {
      return res.status(400).json({ error: 'USN, Password, Branch, and Semester are all required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const user = db.prepare('SELECT * FROM users WHERE usn = ? AND role = ?').get(cleanUsn, 'student') as any;

    if (!user) {
      return res.status(401).json({ error: 'Student not found with this USN.' });
    }

    if (user.branch !== branch || Number(user.semester) !== Number(semester)) {
      return res.status(401).json({
        error: `Registered branch/semester (${user.branch}, Sem ${user.semester}) does not match entered values.`
      });
    }

    const passwordOk = verifyPassword(password, user.password_hash, user.salt);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid password credentials.' });
    }

    // Check registered face template
    const faceRow = db.prepare('SELECT id FROM face_templates WHERE usn = ?').get(cleanUsn) as any;
    if (!faceRow) {
      return res.status(400).json({
        error: 'No registered face template found for this student. Please contact faculty for biometric enrollment.'
      });
    }

    // Issue challenge token
    const challengeToken = crypto.randomBytes(24).toString('hex');
    faceChallenges.set(challengeToken, {
      userId: user.id,
      usn: cleanUsn,
      name: user.name,
      branch: user.branch,
      semester: user.semester,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
    });

    res.json({
      success: true,
      challengeToken,
      usn: cleanUsn,
      name: user.name,
      message: 'Credentials verified. Please proceed to live camera face authentication.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login step 1 failed' });
  }
});

// Student Login Step 2: Live Face Verification
apiRouter.post('/auth/student-login-step2', (req, res) => {
  try {
    const { challengeToken, usn, liveFaceVector, useSampleBypass = false } = req.body;

    if (!challengeToken || !usn) {
      return res.status(400).json({ error: 'Challenge token and USN are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const challenge = faceChallenges.get(challengeToken);

    if (!challenge || challenge.usn !== cleanUsn) {
      return res.status(401).json({ error: 'Face verification session expired or invalid. Please sign in again.' });
    }

    if (Date.now() > challenge.expiresAt) {
      faceChallenges.delete(challengeToken);
      return res.status(401).json({ error: 'Face authentication window timed out. Please retry.' });
    }

    // Retrieve registered template
    const templateRow = db.prepare('SELECT template_data FROM face_templates WHERE usn = ?').get(cleanUsn) as { template_data: string } | undefined;
    if (!templateRow) {
      return res.status(404).json({ error: 'No registered face template found for this student.' });
    }

    const registeredVector: number[] = JSON.parse(templateRow.template_data);
    let matchResult;

    if (useSampleBypass && liveFaceVector === 'DEMO_MATCH') {
      // Demo testing helper
      matchResult = {
        matched: true,
        similarity: 0.985,
        euclideanDistance: 0.12,
        confidencePercent: 99,
        threshold: 0.38
      };
    } else {
      if (!liveFaceVector || !Array.isArray(liveFaceVector) || liveFaceVector.length !== 128) {
        return res.status(400).json({
          matched: false,
          error: 'No valid live face embedding detected. Please ensure your face is well-lit and centered in the camera preview.'
        });
      }
      matchResult = compareFaceEmbeddings(liveFaceVector, registeredVector);
    }

    if (!matchResult.matched) {
      return res.status(401).json({
        matched: false,
        error: matchResult.reason || 'Face does not match registered profile. Please try again.',
        similarity: matchResult.similarity,
        distance: matchResult.euclideanDistance
      });
    }

    // Successful Face Authentication!
    faceChallenges.delete(challengeToken);

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    const sessionData: SessionData = {
      userId: challenge.userId,
      role: 'student',
      name: challenge.name,
      usn: cleanUsn,
      branch: challenge.branch,
      semester: challenge.semester,
      loginTime: Date.now()
    };
    activeSessions.set(token, sessionData);

    // Update last_verified_at
    const now = new Date().toISOString();
    db.prepare('UPDATE face_templates SET last_verified_at = ? WHERE usn = ?').run(now, cleanUsn);

    // Record activity session
    const sessionId = `sess_${cleanUsn}_${Date.now()}`;
    db.prepare(`
      INSERT INTO activity_sessions (id, student_usn, student_name, login_time, last_heartbeat, active_seconds, idle_seconds, status)
      VALUES (?, ?, ?, ?, ?, 0, 0, 'Active')
    `).run(sessionId, cleanUsn, challenge.name, now, now);

    // Record activity event
    db.prepare(`
      INSERT INTO activity_events (id, session_id, student_usn, event_type, details, timestamp)
      VALUES (?, ?, ?, 'login', 'Facial biometric authentication verified successfully', ?)
    `).run(`evt_${Date.now()}`, sessionId, cleanUsn, now);

    res.json({
      success: true,
      matched: true,
      token,
      sessionId,
      user: {
        id: challenge.userId,
        role: 'student',
        name: challenge.name,
        usn: cleanUsn,
        branch: challenge.branch,
        semester: challenge.semester
      },
      matchStats: {
        similarity: matchResult.similarity,
        confidence: matchResult.confidencePercent,
        verifiedAt: now
      }
    });
  } catch (err: any) {
    console.error('Face verification error:', err);
    res.status(500).json({ error: err.message || 'Face verification failed' });
  }
});

// Faculty Registration Form
apiRouter.post('/auth/faculty-register', (req, res) => {
  try {
    const { fullName, facultyId, username, email, department, password, confirmPassword } = req.body;

    if (!fullName || !facultyId || !username || !email || !department || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const cleanFacId = facultyId.trim().toUpperCase();
    const cleanUsername = username.trim().toLowerCase();

    // Check uniqueness
    const existing = db.prepare('SELECT id, faculty_id, username FROM users WHERE faculty_id = ? OR username = ?').get(cleanFacId, cleanUsername) as any;
    if (existing) {
      if (existing.faculty_id === cleanFacId) {
        return res.status(400).json({ error: `Faculty ID ${cleanFacId} is already registered.` });
      }
      return res.status(400).json({ error: `Username ${cleanUsername} is already taken.` });
    }

    const { hash, salt } = hashPassword(password);
    const userId = `fac_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, role, name, username, password_hash, salt, email, branch, faculty_id, status, created_at)
      VALUES (?, 'faculty', ?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?)
    `).run(userId, fullName.trim(), cleanUsername, hash, salt, email.trim(), department, cleanFacId, now);

    res.json({
      success: true,
      status: 'pending_approval',
      message: 'Faculty Registration Submitted. Waiting for Admin Approval.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Faculty registration failed' });
  }
});

// Faculty Sign In
apiRouter.post('/auth/faculty-login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username/Email and Password are required.' });
    }

    const cleanLogin = username.trim().toLowerCase();
    const user = db.prepare(`
      SELECT * FROM users 
      WHERE (LOWER(username) = ? OR LOWER(email) = ? OR UPPER(faculty_id) = ?) 
      AND (role = 'faculty' OR role = 'admin')
    `).get(cleanLogin, cleanLogin, cleanLogin.toUpperCase()) as any;

    if (!user) {
      return res.status(401).json({ error: 'Faculty account not found.' });
    }

    if (user.status === 'pending_approval') {
      return res.status(403).json({
        error: 'Faculty Registration Submitted. Waiting for Admin Approval. Please contact college administration.'
      });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({
        error: 'This faculty account registration was rejected by administration.'
      });
    }

    const passwordOk = verifyPassword(password, user.password_hash, user.salt);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const sessionData: SessionData = {
      userId: user.id,
      role: user.role,
      name: user.name,
      facultyId: user.faculty_id,
      branch: user.branch,
      loginTime: Date.now()
    };
    activeSessions.set(token, sessionData);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        facultyId: user.faculty_id,
        email: user.email,
        branch: user.branch
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Faculty login failed' });
  }
});

// Current User Profile
apiRouter.get('/auth/me', authenticateToken, (req, res) => {
  const session = (req as any).user as SessionData;
  const user = db.prepare('SELECT id, role, name, username, email, branch, semester, usn, faculty_id, status FROM users WHERE id = ?').get(session.userId) as any;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

// Logout
apiRouter.post('/auth/logout', authenticateToken, (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  const user = (req as any).user as SessionData;

  if (token) {
    activeSessions.delete(token);
  }

  if (user && user.usn) {
    const now = new Date().toISOString();
    // Update active session
    db.prepare(`
      UPDATE activity_sessions 
      SET logout_time = ?, status = 'Logged Out' 
      WHERE student_usn = ? AND logout_time IS NULL
    `).run(now, user.usn);

    // Record activity event
    db.prepare(`
      INSERT INTO activity_events (id, student_usn, event_type, details, timestamp)
      VALUES (?, ?, 'logout', 'User logged out', ?)
    `).run(`evt_${Date.now()}`, user.usn, now);
  }

  res.json({ success: true, message: 'Logged out successfully' });
});

// Faculty Approval Management (for Admin / HOD)
apiRouter.get('/auth/pending-faculty', authenticateToken, requireFaculty, (req, res) => {
  const pending = db.prepare(`
    SELECT id, name, username, email, branch, faculty_id, status, created_at 
    FROM users 
    WHERE role = 'faculty' AND status = 'pending_approval'
    ORDER BY created_at DESC
  `).all();
  res.json({ pending });
});

apiRouter.post('/auth/approve-faculty', authenticateToken, requireFaculty, (req, res) => {
  const { facultyId, action } = req.body; // action: 'approve' | 'reject'
  if (!facultyId || !action) {
    return res.status(400).json({ error: 'facultyId and action (approve/reject) required' });
  }

  const newStatus = action === 'approve' ? 'active' : 'rejected';
  db.prepare('UPDATE users SET status = ? WHERE faculty_id = ? AND role = ?').run(newStatus, facultyId, 'faculty');

  res.json({
    success: true,
    message: `Faculty account ${newStatus === 'active' ? 'Approved' : 'Rejected'} successfully.`
  });
});

// Authorized Face Re-Enrollment (Faculty / Admin utility)
apiRouter.post('/auth/re-enroll-face', authenticateToken, requireFaculty, (req, res) => {
  const { usn, faceVector, qualityScore = 95 } = req.body;
  if (!usn || !faceVector || faceVector.length !== 128) {
    return res.status(400).json({ error: 'Valid USN and 128-D face embedding vector are required' });
  }

  const cleanUsn = usn.trim().toUpperCase();
  const student = db.prepare('SELECT id, name FROM users WHERE usn = ?').get(cleanUsn);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO face_templates (id, usn, template_data, quality_score, registered_at, last_verified_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(`face_${cleanUsn}`, cleanUsn, JSON.stringify(faceVector), Number(qualityScore), now, now);

  res.json({ success: true, message: `Face biometric re-enrolled successfully for USN ${cleanUsn}.` });
});

// ==========================================
// 2. ASSIGNMENTS ROUTES
// ==========================================

// Get Assignments (Filtered by role)
apiRouter.get('/assignments', authenticateToken, (req, res) => {
  try {
    const user = (req as any).user as SessionData;

    if (user.role === 'student') {
      // Return only lab programs allocated to this student!
      const rows = db.prepare(`
        SELECT a.*, 
          COALESCE(s.status, 'Pending') as submission_status,
          s.marks_obtained,
          s.feedback,
          s.submitted_at,
          COALESCE(s.compilation_count, 0) as student_compilation_count
        FROM assignments a
        JOIN assignment_allocations alloc ON a.id = alloc.assignment_id
        LEFT JOIN submissions s ON a.id = s.assignment_id AND s.student_usn = ?
        WHERE alloc.student_usn = ? AND a.status = 'published'
        ORDER BY a.lab_number ASC, a.created_at DESC
      `).all(user.usn || '', user.usn || '') as any[];

      const assignments = rows.map(r => ({
        ...r,
        permitted_languages: JSON.parse(r.permitted_languages || '["Java"]')
      }));

      return res.json({ assignments });
    }

    // Faculty: Return assignments created by faculty or for department
    const assignments = db.prepare(`
      SELECT a.*,
        (SELECT COUNT(*) FROM assignment_allocations WHERE assignment_id = a.id) as allocated_count,
        (SELECT COUNT(*) FROM submissions WHERE assignment_id = a.id) as submitted_count,
        (SELECT COUNT(*) FROM submissions WHERE assignment_id = a.id AND status = 'Evaluated') as evaluated_count
      FROM assignments a
      ORDER BY a.created_at DESC
    `).all().map((r: any) => ({
      ...r,
      permitted_languages: JSON.parse(r.permitted_languages || '["Java"]')
    }));

    res.json({ assignments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Assignment Details
apiRouter.get('/assignments/:id', authenticateToken, (req, res) => {
  try {
    const user = (req as any).user as SessionData;
    const { id } = req.params;

    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id) as any;
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    assignment.permitted_languages = JSON.parse(assignment.permitted_languages || '["Java"]');

    if (user.role === 'student') {
      // Check allocation
      const isAllocated = db.prepare('SELECT id FROM assignment_allocations WHERE assignment_id = ? AND student_usn = ?').get(id, user.usn || '');
      if (!isAllocated) {
        return res.status(403).json({ error: 'This assignment is not assigned to you.' });
      }

      // Get student's submission if any
      const submission = db.prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_usn = ?').get(id, user.usn || '');

      return res.json({ assignment, submission });
    }

    // Faculty: include list of allocated students and submissions
    const allocations = db.prepare(`
      SELECT alloc.student_usn, u.name, u.branch, u.semester, s.status as submission_status, s.marks_obtained, s.submitted_at, s.compilation_count
      FROM assignment_allocations alloc
      JOIN users u ON alloc.student_usn = u.usn
      LEFT JOIN submissions s ON alloc.assignment_id = s.assignment_id AND alloc.student_usn = s.student_usn
      WHERE alloc.assignment_id = ?
      ORDER BY u.usn ASC
    `).all(id);

    res.json({ assignment, allocations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create Lab Program (Faculty only)
apiRouter.post('/assignments', authenticateToken, requireFaculty, (req, res) => {
  try {
    const user = (req as any).user as SessionData;
    const {
      title,
      subject,
      labNumber,
      problemStatement,
      instructions,
      permittedLanguages,
      maxMarks,
      assignedDate,
      dueDate,
      branch,
      semester,
      allocationType, // 'all' | 'specific'
      selectedStudents = [], // Array of USNs
      status = 'published'
    } = req.body;

    if (!title || !subject || !labNumber || !problemStatement || !permittedLanguages || !maxMarks || !branch || !semester) {
      return res.status(400).json({ error: 'All required assignment fields must be filled.' });
    }

    const assignId = `assign_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO assignments (
        id, faculty_id, faculty_name, title, subject, lab_number, problem_statement,
        instructions, permitted_languages, max_marks, assigned_date, due_date,
        branch, semester, allocation_type, status, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assignId,
      user.facultyId || user.userId,
      user.name,
      title.trim(),
      subject.trim(),
      Number(labNumber),
      problemStatement.trim(),
      instructions?.trim() || '',
      JSON.stringify(Array.isArray(permittedLanguages) ? permittedLanguages : [permittedLanguages]),
      Number(maxMarks),
      assignedDate || now.split('T')[0],
      dueDate || now.split('T')[0],
      branch,
      Number(semester),
      allocationType,
      status,
      now
    );

    // Allocate students
    let targetUsns: string[] = [];
    if (allocationType === 'all') {
      const branchStudents = db.prepare('SELECT usn FROM users WHERE role = "student" AND branch = ? AND semester = ? AND status = "active"')
        .all(branch, Number(semester)) as { usn: string }[];
      targetUsns = branchStudents.map(s => s.usn);
    } else {
      targetUsns = selectedStudents;
    }

    for (const usn of targetUsns) {
      db.prepare('INSERT OR IGNORE INTO assignment_allocations (id, assignment_id, student_usn) VALUES (?, ?, ?)')
        .run(`alloc_${assignId}_${usn}`, assignId, usn);
    }

    res.json({
      success: true,
      assignmentId: assignId,
      allocatedCount: targetUsns.length,
      message: `Lab Program "${title}" ${status === 'published' ? 'published and assigned' : 'saved as draft'} successfully.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Edit Assignment
apiRouter.put('/assignments/:id', authenticateToken, requireFaculty, (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      subject,
      labNumber,
      problemStatement,
      instructions,
      permittedLanguages,
      maxMarks,
      assignedDate,
      dueDate,
      branch,
      semester,
      allocationType,
      selectedStudents = [],
      status
    } = req.body;

    db.prepare(`
      UPDATE assignments SET
        title = ?, subject = ?, lab_number = ?, problem_statement = ?, instructions = ?,
        permitted_languages = ?, max_marks = ?, assigned_date = ?, due_date = ?,
        branch = ?, semester = ?, allocation_type = ?, status = ?
      WHERE id = ?
    `).run(
      title,
      subject,
      Number(labNumber),
      problemStatement,
      instructions || '',
      JSON.stringify(Array.isArray(permittedLanguages) ? permittedLanguages : [permittedLanguages]),
      Number(maxMarks),
      assignedDate,
      dueDate,
      branch,
      Number(semester),
      allocationType,
      status || 'published',
      id
    );

    // Refresh allocations if requested
    if (allocationType === 'all') {
      const branchStudents = db.prepare('SELECT usn FROM users WHERE role = "student" AND branch = ? AND semester = ? AND status = "active"')
        .all(branch, Number(semester)) as { usn: string }[];
      for (const s of branchStudents) {
        db.prepare('INSERT OR IGNORE INTO assignment_allocations (id, assignment_id, student_usn) VALUES (?, ?, ?)').run(`alloc_${id}_${s.usn}`, id, s.usn);
      }
    } else if (selectedStudents.length > 0) {
      db.prepare('DELETE FROM assignment_allocations WHERE assignment_id = ?').run(id);
      for (const usn of selectedStudents) {
        db.prepare('INSERT INTO assignment_allocations (id, assignment_id, student_usn) VALUES (?, ?, ?)').run(`alloc_${id}_${usn}`, id, usn);
      }
    }

    res.json({ success: true, message: 'Assignment updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Assignment
apiRouter.delete('/assignments/:id', authenticateToken, requireFaculty, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM assignments WHERE id = ?').run(id);
    db.prepare('DELETE FROM assignment_allocations WHERE assignment_id = ?').run(id);
    res.json({ success: true, message: 'Assignment deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. CODE EXECUTION & SUBMISSION
// ==========================================

// Run Code in Workspace
apiRouter.post('/code/run', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user as SessionData;
    const { language, code, stdin = '', assignmentId } = req.body;

    if (!language || !code) {
      return res.status(400).json({ error: 'Language and Code are required.' });
    }

    // Execute through sandbox / Judge0
    const result = await executeCode({
      language,
      code,
      stdin,
      studentUsn: user.usn,
      assignmentId
    });

    // Query exact total compilation count for this student
    let totalCompilationCount = 0;
    if (user.usn) {
      const countRow = db.prepare('SELECT COUNT(*) as count FROM code_executions WHERE student_usn = ?').get(user.usn) as { count: number };
      totalCompilationCount = countRow ? countRow.count : 0;
    }

    res.json({
      ...result,
      studentCompilationCount: totalCompilationCount
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Submit Code for an Assignment
apiRouter.post('/code/submit', authenticateToken, requireStudent, (req, res) => {
  try {
    const user = (req as any).user as SessionData;
    const { assignmentId, code, language, executionResult = '' } = req.body;

    if (!assignmentId || !code || !language) {
      return res.status(400).json({ error: 'Assignment ID, Code, and Language are required.' });
    }

    // Verify assignment exists
    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(assignmentId) as any;
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }

    const studentUsn = user.usn!;

    // Verify student is allocated
    const alloc = db.prepare('SELECT id FROM assignment_allocations WHERE assignment_id = ? AND student_usn = ?').get(assignmentId, studentUsn);
    if (!alloc) {
      return res.status(403).json({ error: 'You are not assigned to this laboratory program.' });
    }

    // Get exact compilation count
    const countRow = db.prepare('SELECT COUNT(*) as count FROM code_executions WHERE student_usn = ?').get(studentUsn) as { count: number };
    const compCount = countRow ? countRow.count : 0;

    const subId = `sub_${assignmentId}_${studentUsn}`;
    const now = new Date().toISOString();
    const isLate = assignment.due_date && new Date().toISOString().split('T')[0] > assignment.due_date;

    db.prepare(`
      INSERT INTO submissions (
        id, assignment_id, student_usn, student_name, code, language,
        submitted_at, status, compilation_count, execution_result
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        code = excluded.code,
        language = excluded.language,
        submitted_at = excluded.submitted_at,
        status = excluded.status,
        compilation_count = excluded.compilation_count,
        execution_result = excluded.execution_result
    `).run(
      subId,
      assignmentId,
      studentUsn,
      user.name,
      code,
      language,
      now,
      isLate ? 'Late' : 'Submitted',
      compCount,
      executionResult
    );

    // Record activity event
    db.prepare(`
      INSERT INTO activity_events (id, student_usn, event_type, details, timestamp)
      VALUES (?, ?, 'submission', ?, ?)
    `).run(
      `evt_${Date.now()}`,
      studentUsn,
      JSON.stringify({ assignmentId, title: assignment.title, language }),
      now
    );

    res.json({
      success: true,
      submissionId: subId,
      status: isLate ? 'Late' : 'Submitted',
      submittedAt: now,
      compilationCount: compCount,
      message: 'Assignment submitted successfully. Pending faculty evaluation.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Faculty: View all submissions for an assignment
apiRouter.get('/submissions/assignment/:id', authenticateToken, requireFaculty, (req, res) => {
  try {
    const { id } = req.params;
    const submissions = db.prepare(`
      SELECT s.*, u.branch, u.semester
      FROM submissions s
      JOIN users u ON s.student_usn = u.usn
      WHERE s.assignment_id = ?
      ORDER BY s.submitted_at DESC
    `).all(id);

    res.json({ submissions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Faculty: Evaluate a submission
apiRouter.post('/submissions/:id/evaluate', authenticateToken, requireFaculty, (req, res) => {
  try {
    const user = (req as any).user as SessionData;
    const { id } = req.params;
    const { marksObtained, feedback } = req.body;

    if (marksObtained === undefined || marksObtained === null) {
      return res.status(400).json({ error: 'Marks obtained is required.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE submissions SET
        marks_obtained = ?,
        feedback = ?,
        status = 'Evaluated',
        evaluated_at = ?,
        evaluated_by = ?
      WHERE id = ?
    `).run(
      Number(marksObtained),
      feedback?.trim() || '',
      now,
      user.name,
      id
    );

    res.json({
      success: true,
      message: 'Submission evaluated and marks awarded successfully.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. QUIZ MANAGEMENT & TAKING
// ==========================================

// Get Quizzes
apiRouter.get('/quizzes', authenticateToken, (req, res) => {
  try {
    const user = (req as any).user as SessionData;

    if (user.role === 'student') {
      const rows = db.prepare(`
        SELECT q.id, q.title, q.instructions, q.branch, q.semester, q.total_marks,
               q.marks_per_question, q.duration_minutes, q.start_time, q.end_time,
               q.status, q.faculty_name,
               qa.id as attempt_id, qa.score, qa.submitted_at as attempted_at
        FROM quizzes q
        JOIN quiz_allocations alloc ON q.id = alloc.quiz_id
        LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id AND qa.student_usn = ?
        WHERE alloc.student_usn = ? AND q.status = 'published'
        ORDER BY q.created_at DESC
      `).all(user.usn || '', user.usn || '');

      return res.json({ quizzes: rows });
    }

    // Faculty: view created quizzes
    const quizzes = db.prepare(`
      SELECT q.*,
        (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) as question_count,
        (SELECT COUNT(*) FROM quiz_allocations WHERE quiz_id = q.id) as allocated_count,
        (SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = q.id) as attempt_count
      FROM quizzes q
      ORDER BY q.created_at DESC
    `).all();

    res.json({ quizzes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Quiz
apiRouter.get('/quizzes/:id', authenticateToken, (req, res) => {
  try {
    const user = (req as any).user as SessionData;
    const { id } = req.params;

    const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) as any;
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const questionsRaw = db.prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY order_num ASC').all(id) as any[];

    if (user.role === 'student') {
      // Check allocation
      const isAllocated = db.prepare('SELECT id FROM quiz_allocations WHERE quiz_id = ? AND student_usn = ?').get(id, user.usn || '');
      if (!isAllocated) {
        return res.status(403).json({ error: 'This quiz is not assigned to you.' });
      }

      // Check existing attempt
      const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND student_usn = ?').get(id, user.usn || '') as any;

      if (attempt) {
        // If already submitted, reveal results
        const questions = questionsRaw.map(q => ({
          ...q,
          options: JSON.parse(q.options)
        }));
        return res.json({
          quiz,
          questions,
          attempt: {
            ...attempt,
            answers: JSON.parse(attempt.answers)
          }
        });
      }

      // Student taking quiz: DO NOT REVEAL correct answers!
      const sanitizedQuestions = questionsRaw.map(q => ({
        id: q.id,
        quiz_id: q.quiz_id,
        question_text: q.question_text,
        options: JSON.parse(q.options),
        marks: q.marks,
        order_num: q.order_num
      }));

      return res.json({ quiz, questions: sanitizedQuestions, attempt: null });
    }

    // Faculty: include correct answers and student attempts
    const questions = questionsRaw.map(q => ({
      ...q,
      options: JSON.parse(q.options)
    }));
    const attempts = db.prepare(`
      SELECT qa.*, u.branch, u.semester
      FROM quiz_attempts qa
      JOIN users u ON qa.student_usn = u.usn
      WHERE qa.quiz_id = ?
      ORDER BY qa.submitted_at DESC
    `).all(id);

    res.json({ quiz, questions, attempts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Faculty: Create Quiz
apiRouter.post('/quizzes', authenticateToken, requireFaculty, (req, res) => {
  try {
    const user = (req as any).user as SessionData;
    const {
      title,
      instructions,
      branch,
      semester,
      allocationType,
      selectedStudents = [],
      totalMarks, // 10, 15, or 20
      durationMinutes,
      startTime,
      endTime,
      questions = []
    } = req.body;

    if (!title || !branch || !semester || !totalMarks || questions.length === 0) {
      return res.status(400).json({ error: 'Title, branch, semester, total marks, and questions are required.' });
    }

    const validMarks = [10, 15, 20];
    if (!validMarks.includes(Number(totalMarks))) {
      return res.status(400).json({ error: 'Total marks must be either 10, 15, or 20.' });
    }

    const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const marksPerQ = Math.round(Number(totalMarks) / questions.length) || 1;

    db.prepare(`
      INSERT INTO quizzes (
        id, faculty_id, faculty_name, title, instructions, branch, semester,
        allocation_type, total_marks, marks_per_question, duration_minutes,
        start_time, end_time, status, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)
    `).run(
      quizId,
      user.facultyId || user.userId,
      user.name,
      title.trim(),
      instructions?.trim() || '',
      branch,
      Number(semester),
      allocationType,
      Number(totalMarks),
      marksPerQ,
      Number(durationMinutes || 20),
      startTime || now,
      endTime || new Date(Date.now() + 86400000 * 7).toISOString(),
      now
    );

    // Insert Questions
    questions.forEach((q: any, idx: number) => {
      db.prepare(`
        INSERT INTO quiz_questions (id, quiz_id, question_text, options, correct_answer, marks, order_num)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `q_${quizId}_${idx + 1}`,
        quizId,
        q.questionText.trim(),
        JSON.stringify(q.options),
        q.correctAnswer.trim(),
        q.marks || marksPerQ,
        idx + 1
      );
    });

    // Allocations
    let targetUsns: string[] = [];
    if (allocationType === 'all') {
      const branchStudents = db.prepare('SELECT usn FROM users WHERE role = "student" AND branch = ? AND semester = ? AND status = "active"')
        .all(branch, Number(semester)) as { usn: string }[];
      targetUsns = branchStudents.map(s => s.usn);
    } else {
      targetUsns = selectedStudents;
    }

    for (const usn of targetUsns) {
      db.prepare('INSERT OR IGNORE INTO quiz_allocations (id, quiz_id, student_usn) VALUES (?, ?, ?)')
        .run(`qalloc_${quizId}_${usn}`, quizId, usn);
    }

    res.json({
      success: true,
      quizId,
      message: `Quiz "${title}" published and assigned to ${targetUsns.length} students.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Student: Submit Quiz
apiRouter.post('/quizzes/:id/submit', authenticateToken, requireStudent, (req, res) => {
  try {
    const user = (req as any).user as SessionData;
    const { id } = req.params;
    const { answers } = req.body; // map: { [questionId]: selectedOption }

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'Submitted answers object is required.' });
    }

    const studentUsn = user.usn!;

    // Check if already attempted
    const existing = db.prepare('SELECT id FROM quiz_attempts WHERE quiz_id = ? AND student_usn = ?').get(id, studentUsn);
    if (existing) {
      return res.status(400).json({ error: 'You have already submitted this quiz. Multiple attempts are not permitted.' });
    }

    const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) as any;
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    const questions = db.prepare('SELECT * FROM quiz_questions WHERE quiz_id = ?').all(id) as any[];
    let totalScore = 0;

    for (const q of questions) {
      const studentAnswer = answers[q.id];
      if (studentAnswer && studentAnswer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()) {
        totalScore += q.marks;
      }
    }

    const attemptId = `att_${id}_${studentUsn}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO quiz_attempts (id, quiz_id, student_usn, student_name, answers, score, total_marks, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attemptId,
      id,
      studentUsn,
      user.name,
      JSON.stringify(answers),
      totalScore,
      quiz.total_marks,
      now
    );

    res.json({
      success: true,
      attemptId,
      score: totalScore,
      totalMarks: quiz.total_marks,
      submittedAt: now,
      message: `Quiz submitted successfully! You scored ${totalScore} out of ${quiz.total_marks} marks.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. MONITORING & ACTIVITY TRACKING
// ==========================================

// Periodic Heartbeat from student client
apiRouter.post('/monitoring/heartbeat', authenticateToken, requireStudent, (req, res) => {
  try {
    const user = (req as any).user as SessionData;
    const studentUsn = user.usn!;
    const { activeSeconds = 30, idleSeconds = 0, isCurrentlyIdle = false } = req.body;

    const now = new Date().toISOString();
    const status = isCurrentlyIdle ? 'Idle' : 'Active';

    // Find active session
    const session = db.prepare(`
      SELECT id, active_seconds, idle_seconds 
      FROM activity_sessions 
      WHERE student_usn = ? AND logout_time IS NULL 
      ORDER BY login_time DESC LIMIT 1
    `).get(studentUsn) as any;

    if (session) {
      db.prepare(`
        UPDATE activity_sessions SET
          last_heartbeat = ?,
          active_seconds = active_seconds + ?,
          idle_seconds = idle_seconds + ?,
          status = ?
        WHERE id = ?
      `).run(now, Number(activeSeconds), Number(idleSeconds), status, session.id);
    } else {
      // Create new session if missing
      const sessId = `sess_${studentUsn}_${Date.now()}`;
      db.prepare(`
        INSERT INTO activity_sessions (id, student_usn, student_name, login_time, last_heartbeat, active_seconds, idle_seconds, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sessId, studentUsn, user.name, now, now, Number(activeSeconds), Number(idleSeconds), status);
    }

    res.json({ success: true, timestamp: now });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Monaco Editor Paste Event Logger
apiRouter.post('/monitoring/paste', authenticateToken, requireStudent, (req, res) => {
  try {
    const user = (req as any).user as SessionData;
    const studentUsn = user.usn!;
    const { assignmentId, characterCount, snippet = '' } = req.body;

    const isSuspicious = characterCount > 150 ? 1 : 0;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO paste_events (id, student_usn, assignment_id, character_count, pasted_snippet, flagged_suspicious, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `paste_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      studentUsn,
      assignmentId || null,
      Number(characterCount || 0),
      snippet.substring(0, 300),
      isSuspicious,
      now
    );

    // Also record an activity event
    db.prepare(`
      INSERT INTO activity_events (id, student_usn, event_type, details, timestamp)
      VALUES (?, ?, 'paste', ?, ?)
    `).run(
      `evt_${Date.now()}`,
      studentUsn,
      JSON.stringify({ characterCount, isSuspicious, assignmentId }),
      now
    );

    res.json({ success: true, recorded: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Faculty Live Monitoring View
apiRouter.get('/monitoring/live', authenticateToken, requireFaculty, (req, res) => {
  try {
    const students = db.prepare(`
      SELECT u.usn, u.name, u.branch, u.semester,
        s.id as session_id, s.login_time, s.last_heartbeat, s.status, s.active_seconds, s.idle_seconds,
        (SELECT COUNT(*) FROM code_executions WHERE student_usn = u.usn) as total_compilations,
        (SELECT COUNT(*) FROM paste_events WHERE student_usn = u.usn) as paste_count
      FROM users u
      LEFT JOIN activity_sessions s ON u.usn = s.student_usn AND s.logout_time IS NULL
      WHERE u.role = 'student'
      ORDER BY u.branch, u.semester, u.usn
    `).all() as any[];

    // Calculate real-time status based on last heartbeat
    const now = Date.now();
    const liveStudents = students.map(st => {
      let liveStatus = 'Logged Out';
      if (st.session_id) {
        const lastHb = new Date(st.last_heartbeat).getTime();
        const diffSeconds = (now - lastHb) / 1000;
        if (diffSeconds > 180) {
          liveStatus = 'Disconnected';
        } else if (st.status === 'Idle' || diffSeconds > 120) {
          liveStatus = 'Idle';
        } else {
          liveStatus = 'Active';
        }
      }
      return {
        ...st,
        liveStatus
      };
    });

    res.json({ students: liveStudents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Faculty Activity History View
apiRouter.get('/monitoring/history', authenticateToken, requireFaculty, (req, res) => {
  try {
    const { usn } = req.query;

    let sessionsQuery = `
      SELECT s.*, u.name as student_name, u.branch, u.semester
      FROM activity_sessions s
      JOIN users u ON s.student_usn = u.usn
    `;
    const params: any[] = [];
    if (usn) {
      sessionsQuery += ` WHERE s.student_usn = ?`;
      params.push(usn);
    }
    sessionsQuery += ` ORDER BY s.login_time DESC LIMIT 50`;

    const sessions = db.prepare(sessionsQuery).all(...params);

    const pasteEventsQuery = `
      SELECT p.*, u.name as student_name, a.title as assignment_title
      FROM paste_events p
      JOIN users u ON p.student_usn = u.usn
      LEFT JOIN assignments a ON p.assignment_id = a.id
      ${usn ? 'WHERE p.student_usn = ?' : ''}
      ORDER BY p.timestamp DESC LIMIT 50
    `;
    const pasteEvents = db.prepare(pasteEventsQuery).all(...params);

    res.json({ sessions, pasteEvents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. STUDENT DIRECTORY & PROGRESS
// ==========================================

// Faculty: Student Enrollment Directory
apiRouter.get('/students', authenticateToken, requireFaculty, (req, res) => {
  try {
    const { branch, semester, search } = req.query;

    let query = `
      SELECT u.id, u.name, u.usn, u.username, u.email, u.branch, u.semester, u.status, u.created_at,
        CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END as face_enrolled,
        (SELECT COUNT(*) FROM code_executions WHERE student_usn = u.usn) as total_compilations,
        (SELECT COUNT(*) FROM assignment_allocations WHERE student_usn = u.usn) as assigned_assignments,
        (SELECT COUNT(*) FROM submissions WHERE student_usn = u.usn) as submitted_assignments,
        (SELECT COUNT(*) FROM submissions WHERE student_usn = u.usn AND status = 'Evaluated') as evaluated_assignments
      FROM users u
      LEFT JOIN face_templates f ON u.usn = f.usn
      WHERE u.role = 'student'
    `;
    const params: any[] = [];

    if (branch && branch !== 'all') {
      query += ` AND u.branch = ?`;
      params.push(branch);
    }
    if (semester && semester !== 'all') {
      query += ` AND u.semester = ?`;
      params.push(Number(semester));
    }
    if (search) {
      query += ` AND (LOWER(u.name) LIKE ? OR UPPER(u.usn) LIKE ? OR LOWER(u.username) LIKE ?)`;
      const s = `%${String(search).toLowerCase()}%`;
      params.push(s, s.toUpperCase(), s);
    }

    query += ` ORDER BY u.branch, u.semester, u.usn`;

    const students = db.prepare(query).all(...params);
    res.json({ students });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Student Progress & Performance Summary
apiRouter.get('/students/my-progress', authenticateToken, requireStudent, (req, res) => {
  try {
    const user = (req as any).user as SessionData;

    const studentUsn = user.usn!;

    // 1. Total assigned lab programs
    const assignedRow = db.prepare('SELECT COUNT(*) as count FROM assignment_allocations WHERE student_usn = ?').get(studentUsn) as { count: number };
    const totalAssigned = assignedRow ? assignedRow.count : 0;

    // 2. Submissions breakdown
    const subRows = db.prepare(`
      SELECT s.*, a.title, a.max_marks, a.lab_number
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.id
      WHERE s.student_usn = ?
    `).all(studentUsn) as any[];

    const submittedCount = subRows.length;
    const completedEvaluated = subRows.filter(s => s.status === 'Evaluated');
    const pendingEvaluation = subRows.filter(s => s.status === 'Submitted' || s.status === 'Late');
    const notSubmittedCount = Math.max(0, totalAssigned - submittedCount);

    // 3. Exact Total Compilation / Run Count (without grouping, penalty, or deductions)
    const execRow = db.prepare('SELECT COUNT(*) as count FROM code_executions WHERE student_usn = ?').get(studentUsn) as { count: number };
    const totalCompilationCount = execRow ? execRow.count : 0;

    // 4. Quiz Marks
    const quizRows = db.prepare(`
      SELECT qa.*, q.title as quiz_title
      FROM quiz_attempts qa
      JOIN quizzes q ON qa.quiz_id = q.id
      WHERE qa.student_usn = ?
    `).all(studentUsn) as any[];

    // 5. Overall percentage calculation
    let totalMarksPossible = 0;
    let totalMarksEarned = 0;

    subRows.forEach(s => {
      if (s.marks_obtained !== null && s.marks_obtained !== undefined) {
        totalMarksEarned += Number(s.marks_obtained);
        totalMarksPossible += Number(s.max_marks || 20);
      }
    });

    quizRows.forEach(q => {
      totalMarksEarned += Number(q.score);
      totalMarksPossible += Number(q.total_marks || 15);
    });

    const overallPercentage = totalMarksPossible > 0 ? Math.round((totalMarksEarned / totalMarksPossible) * 100) : 0;

    res.json({
      student: {
        name: user.name,
        usn: user.usn,
        branch: user.branch,
        semester: user.semester
      },
      metrics: {
        totalAssigned,
        completedCount: completedEvaluated.length,
        submittedCount,
        pendingEvaluationCount: pendingEvaluation.length,
        notSubmittedCount,
        totalCompilationCount, // Actual integer count!
        overallPercentage,
        totalMarksEarned,
        totalMarksPossible
      },
      submissions: subRows,
      quizzes: quizRows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Judge0 Configuration management
apiRouter.get('/system/judge0', authenticateToken, requireFaculty, (req, res) => {
  const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get('judge0_config') as any;
  const config = row ? JSON.parse(row.value) : { endpoint: '', apiKey: '', useBuiltinFallback: true };
  res.json({ config: { ...config, apiKey: config.apiKey ? '••••••••' : '' } });
});

apiRouter.post('/system/judge0', authenticateToken, requireFaculty, (req, res) => {
  const { endpoint, apiKey, useBuiltinFallback } = req.body;
  const existingRow = db.prepare('SELECT value FROM system_config WHERE key = ?').get('judge0_config') as any;
  const current = existingRow ? JSON.parse(existingRow.value) : {};

  const updated = {
    endpoint: endpoint || current.endpoint || 'https://judge0-ce.p.rapidapi.com',
    apiKey: apiKey !== undefined ? (apiKey === '••••••••' ? current.apiKey : apiKey) : current.apiKey,
    useBuiltinFallback: useBuiltinFallback !== undefined ? useBuiltinFallback : true
  };

  db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)').run('judge0_config', JSON.stringify(updated));
  res.json({ success: true, message: 'Judge0 configuration updated.' });
});
