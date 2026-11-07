import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';

const DB_PATH = path.resolve(process.cwd(), 'smartlab.db');
export const db = new DatabaseSync(DB_PATH);

// Helper for hashing password with salt
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, actualSalt, 1000, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return checkHash === hash;
}

// Generate synthetic normalized 128-D face embedding vector for seeded students
function generateSyntheticFaceVector(seed: number): number[] {
  const vec: number[] = [];
  let sumSq = 0;
  for (let i = 0; i < 128; i++) {
    // Deterministic pseudo-random based on seed
    const val = Math.sin(seed * 1000 + i * 37) * 0.5 + Math.cos(seed * 200 + i * 19) * 0.5;
    vec.push(val);
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map(v => Number((v / norm).toFixed(6)));
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      email TEXT NOT NULL,
      branch TEXT,
      semester INTEGER,
      faculty_id TEXT UNIQUE,
      usn TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS face_templates (
      id TEXT PRIMARY KEY,
      usn TEXT UNIQUE NOT NULL,
      template_data TEXT NOT NULL,
      quality_score REAL NOT NULL,
      registered_at TEXT NOT NULL,
      last_verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      faculty_id TEXT NOT NULL,
      faculty_name TEXT NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      lab_number INTEGER NOT NULL,
      problem_statement TEXT NOT NULL,
      instructions TEXT,
      permitted_languages TEXT NOT NULL,
      max_marks INTEGER NOT NULL,
      assigned_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      branch TEXT NOT NULL,
      semester INTEGER NOT NULL,
      allocation_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignment_allocations (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      student_usn TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      student_usn TEXT NOT NULL,
      student_name TEXT NOT NULL,
      code TEXT NOT NULL,
      language TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Submitted',
      marks_obtained REAL,
      feedback TEXT,
      evaluated_at TEXT,
      evaluated_by TEXT,
      compilation_count INTEGER DEFAULT 0,
      execution_result TEXT
    );

    CREATE TABLE IF NOT EXISTS code_executions (
      id TEXT PRIMARY KEY,
      student_usn TEXT NOT NULL,
      assignment_id TEXT,
      language TEXT NOT NULL,
      code TEXT NOT NULL,
      status TEXT NOT NULL,
      output TEXT,
      error TEXT,
      execution_time_ms REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      faculty_id TEXT NOT NULL,
      faculty_name TEXT NOT NULL,
      title TEXT NOT NULL,
      instructions TEXT,
      branch TEXT NOT NULL,
      semester INTEGER NOT NULL,
      allocation_type TEXT NOT NULL,
      total_marks INTEGER NOT NULL,
      marks_per_question INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      start_time TEXT,
      end_time TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      marks INTEGER NOT NULL,
      order_num INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_allocations (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      student_usn TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      student_usn TEXT NOT NULL,
      student_name TEXT NOT NULL,
      answers TEXT NOT NULL,
      score INTEGER NOT NULL,
      total_marks INTEGER NOT NULL,
      submitted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_sessions (
      id TEXT PRIMARY KEY,
      student_usn TEXT NOT NULL,
      student_name TEXT NOT NULL,
      login_time TEXT NOT NULL,
      logout_time TEXT,
      last_heartbeat TEXT NOT NULL,
      active_seconds INTEGER DEFAULT 0,
      idle_seconds INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active'
    );

    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      student_usn TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS paste_events (
      id TEXT PRIMARY KEY,
      student_usn TEXT NOT NULL,
      assignment_id TEXT,
      character_count INTEGER NOT NULL,
      pasted_snippet TEXT NOT NULL,
      flagged_suspicious INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed default admin and sample data if not already present
  seedData();
}

function seedData() {
  const checkFaculty = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('faculty') as { count: number };
  if (checkFaculty && checkFaculty.count > 0) {
    return; // Already seeded
  }

  const now = new Date().toISOString();

  // 1. Seed Faculty: Dr. Bhavesh S S
  const facultyCreds = hashPassword('Faculty@123', 'faculty_salt_2026');
  db.prepare(`
    INSERT INTO users (id, role, name, username, password_hash, salt, email, branch, faculty_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'fac_bhavesh',
    'faculty',
    'Dr. Bhavesh S S',
    'bhavesh_ise',
    facultyCreds.hash,
    facultyCreds.salt,
    'dr.bhavesh@smartlab.edu',
    'ISE',
    'FAC-ISE-001',
    'active',
    now
  );

  // 2. Seed 4 Sample Students in ISE, Semester 5
  const sampleStudents = [
    { name: 'Kavana', usn: '1MS22IS025', username: 'kavana_ise', compilations: 18, seed: 101 },
    { name: 'Devika', usn: '1MS22IS018', username: 'devika_ise', compilations: 12, seed: 102 },
    { name: 'Kanika', usn: '1MS22IS022', username: 'kanika_ise', compilations: 25, seed: 103 },
    { name: 'Chaitanya', usn: '1MS22IS015', username: 'chaitanya_ise', compilations: 9, seed: 104 },
  ];

  for (const st of sampleStudents) {
    const creds = hashPassword('Student@123', `student_salt_${st.usn}`);
    db.prepare(`
      INSERT INTO users (id, role, name, username, password_hash, salt, email, branch, semester, usn, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `usr_${st.usn.toLowerCase()}`,
      'student',
      st.name,
      st.username,
      creds.hash,
      creds.salt,
      `${st.name.toLowerCase()}@smartlab.edu`,
      'ISE',
      5,
      st.usn,
      'active',
      now
    );

    // Seed 128-D face biometric template
    const vector = generateSyntheticFaceVector(st.seed);
    db.prepare(`
      INSERT INTO face_templates (id, usn, template_data, quality_score, registered_at, last_verified_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `face_${st.usn}`,
      st.usn,
      JSON.stringify(vector),
      98.5,
      now,
      now
    );

    // Seed simulated compilation counts in code_executions
    for (let c = 0; c < st.compilations; c++) {
      db.prepare(`
        INSERT INTO code_executions (id, student_usn, assignment_id, language, code, status, output, error, execution_time_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `exec_${st.usn}_${c + 1}`,
        st.usn,
        'assign_lab_1',
        'Java',
        'public class PrimeCheck { public static void main(String[] args) { System.out.println("Test run ' + (c + 1) + '"); } }',
        c % 4 === 0 ? 'compilation_error' : 'success',
        c % 4 === 0 ? null : 'Prime Number',
        c % 4 === 0 ? 'Main.java:3: error: cannot find symbol' : null,
        140 + (c * 12),
        new Date(Date.now() - (1000 * 60 * (300 - c * 10))).toISOString()
      );
    }
  }

  // 3. Seed Sample Assignment: Lab 1 – Check Whether a Number Is Prime
  const assignId = 'assign_lab_1';
  db.prepare(`
    INSERT INTO assignments (id, faculty_id, faculty_name, title, subject, lab_number, problem_statement, instructions, permitted_languages, max_marks, assigned_date, due_date, branch, semester, allocation_type, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    assignId,
    'fac_bhavesh',
    'Dr. Bhavesh S S',
    'Lab 1 – Check Whether a Number Is Prime',
    'Java Programming Laboratory',
    1,
    'Write a Java program to check whether a given number is prime. Read an integer and display \'Prime Number\' if it is prime; otherwise display \'Not a Prime Number\'.',
    '1. Use Scanner to read input from System.in.\n2. Handle edge cases such as numbers <= 1.\n3. Output exact string: "Prime Number" or "Not a Prime Number".\n4. Follow standard Java naming conventions and clean modular structure.',
    JSON.stringify(['Java']),
    20,
    new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
    new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
    'ISE',
    5,
    'all',
    'published',
    now
  );

  // Allocate Lab 1 to all 4 sample students
  for (const st of sampleStudents) {
    db.prepare(`
      INSERT INTO assignment_allocations (id, assignment_id, student_usn)
      VALUES (?, ?, ?)
    `).run(`alloc_${assignId}_${st.usn}`, assignId, st.usn);
  }

  // Seed two existing submissions
  // Kanika: Submitted and Evaluated
  db.prepare(`
    INSERT INTO submissions (id, assignment_id, student_usn, student_name, code, language, submitted_at, status, marks_obtained, feedback, evaluated_at, evaluated_by, compilation_count, execution_result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'sub_kanika_lab1',
    assignId,
    '1MS22IS022',
    'Kanika',
    `import java.util.Scanner;

public class PrimeCheck {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        if (isPrime(n)) {
            System.out.println("Prime Number");
        } else {
            System.out.println("Not a Prime Number");
        }
    }

    public static boolean isPrime(int n) {
        if (n <= 1) return false;
        if (n <= 3) return true;
        if (n % 2 == 0 || n % 3 == 0) return false;
        for (int i = 5; i * i <= n; i += 6) {
            if (n % i == 0 || n % (i + 2) == 0) return false;
        }
        return true;
    }
}`,
    'Java',
    new Date(Date.now() - 86400000).toISOString(),
    'Evaluated',
    19.0,
    'Excellent logic with O(sqrt(n)) optimization and proper edge case handling.',
    new Date(Date.now() - 3600000 * 12).toISOString(),
    'Dr. Bhavesh S S',
    25,
    'All test cases passed. Output: Prime Number'
  );

  // Chaitanya: Submitted (Pending evaluation)
  db.prepare(`
    INSERT INTO submissions (id, assignment_id, student_usn, student_name, code, language, submitted_at, status, marks_obtained, feedback, evaluated_at, evaluated_by, compilation_count, execution_result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'sub_chaitanya_lab1',
    assignId,
    '1MS22IS015',
    'Chaitanya',
    `import java.util.Scanner;

public class PrimeNumber {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int num = in.nextInt();
        boolean prime = true;
        if (num <= 1) {
            prime = false;
        } else {
            for (int i = 2; i <= num / 2; i++) {
                if (num % i == 0) {
                    prime = false;
                    break;
                }
            }
        }
        if (prime) {
            System.out.println("Prime Number");
        } else {
            System.out.println("Not a Prime Number");
        }
    }
}`,
    'Java',
    new Date(Date.now() - 3600000 * 4).toISOString(),
    'Submitted',
    null,
    null,
    null,
    null,
    9,
    'Test case passed. Output: Prime Number'
  );

  // 4. Seed Sample Quiz: "Java Programming Basics" (Section 14)
  const quizId = 'quiz_java_basics';
  db.prepare(`
    INSERT INTO quizzes (id, faculty_id, faculty_name, title, instructions, branch, semester, allocation_type, total_marks, marks_per_question, duration_minutes, start_time, end_time, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    quizId,
    'fac_bhavesh',
    'Dr. Bhavesh S S',
    'Java Programming Basics',
    'Answer all 5 multiple choice questions. Each question carries 3 marks. Duration is 20 minutes. Negative marking is not applicable.',
    'ISE',
    5,
    'all',
    15,
    3,
    20,
    new Date(Date.now() - 86400000).toISOString(),
    new Date(Date.now() + 86400000 * 5).toISOString(),
    'published',
    now
  );

  // Allocate Quiz to sample students
  for (const st of sampleStudents) {
    db.prepare(`
      INSERT INTO quiz_allocations (id, quiz_id, student_usn)
      VALUES (?, ?, ?)
    `).run(`qalloc_${quizId}_${st.usn}`, quizId, st.usn);
  }

  // 5 Quiz Questions exactly as in prompt Section 14
  const questions = [
    {
      q: 'Which keyword is used to create a class in Java?',
      opts: ['function', 'class', 'define', 'object'],
      ans: 'class'
    },
    {
      q: 'Which is the starting method of a Java program?',
      opts: ['start()', 'run()', 'main()', 'execute()'],
      ans: 'main()'
    },
    {
      q: 'Which data type is used to store whole numbers in Java?',
      opts: ['int', 'String', 'boolean', 'char'],
      ans: 'int'
    },
    {
      q: 'Which symbol is used to end a Java statement?',
      opts: ['colon', 'comma', 'full stop', 'semicolon'],
      ans: 'semicolon'
    },
    {
      q: 'Which keyword is used to create an object in Java?',
      opts: ['class', 'new', 'this', 'static'],
      ans: 'new'
    }
  ];

  questions.forEach((q, idx) => {
    db.prepare(`
      INSERT INTO quiz_questions (id, quiz_id, question_text, options, correct_answer, marks, order_num)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `q_${quizId}_${idx + 1}`,
      quizId,
      q.q,
      JSON.stringify(q.opts),
      q.ans,
      3,
      idx + 1
    );
  });

  // Seed quiz attempts for Kanika and Chaitanya
  db.prepare(`
    INSERT INTO quiz_attempts (id, quiz_id, student_usn, student_name, answers, score, total_marks, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'att_kanika_quiz1',
    quizId,
    '1MS22IS022',
    'Kanika',
    JSON.stringify({
      [`q_${quizId}_1`]: 'class',
      [`q_${quizId}_2`]: 'main()',
      [`q_${quizId}_3`]: 'int',
      [`q_${quizId}_4`]: 'semicolon',
      [`q_${quizId}_5`]: 'new'
    }),
    15,
    15,
    new Date(Date.now() - 3600000 * 20).toISOString()
  );

  db.prepare(`
    INSERT INTO quiz_attempts (id, quiz_id, student_usn, student_name, answers, score, total_marks, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'att_chaitanya_quiz1',
    quizId,
    '1MS22IS015',
    'Chaitanya',
    JSON.stringify({
      [`q_${quizId}_1`]: 'class',
      [`q_${quizId}_2`]: 'main()',
      [`q_${quizId}_3`]: 'int',
      [`q_${quizId}_4`]: 'colon', // incorrect
      [`q_${quizId}_5`]: 'new'
    }),
    12,
    15,
    new Date(Date.now() - 3600000 * 16).toISOString()
  );

  // 5. Seed Activity & Paste Events for demonstration
  db.prepare(`
    INSERT INTO activity_sessions (id, student_usn, student_name, login_time, logout_time, last_heartbeat, active_seconds, idle_seconds, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'sess_devika_1',
    '1MS22IS018',
    'Devika',
    new Date(Date.now() - 3600000 * 2).toISOString(),
    null,
    new Date(Date.now() - 60000).toISOString(),
    3420,
    180,
    'Active'
  );

  db.prepare(`
    INSERT INTO paste_events (id, student_usn, assignment_id, character_count, pasted_snippet, flagged_suspicious, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'paste_1',
    '1MS22IS022',
    assignId,
    128,
    'for (int i = 5; i * i <= n; i += 6) { if (n % i == 0 || n % (i + 2) == 0) return false; }',
    0,
    new Date(Date.now() - 86400000 + 120000).toISOString()
  );

  // Save Judge0 configuration default
  db.prepare(`
    INSERT OR REPLACE INTO system_config (key, value)
    VALUES (?, ?)
  `).run('judge0_config', JSON.stringify({
    endpoint: 'https://judge0-ce.p.rapidapi.com',
    apiKey: '',
    useBuiltinFallback: true
  }));
}

initDatabase();
