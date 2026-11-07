export type Role = 'student' | 'faculty' | 'admin';

export type Branch = 
  | 'CSE'
  | 'ISE'
  | 'AI & ML'
  | 'AI & DS'
  | 'ECE'
  | 'EEE'
  | 'ME';

export const ALL_BRANCHES: { id: Branch; name: string }[] = [
  { id: 'CSE', name: 'Computer Science and Engineering (CSE)' },
  { id: 'ISE', name: 'Information Science and Engineering (ISE)' },
  { id: 'AI & ML', name: 'Artificial Intelligence and Machine Learning (AI & ML)' },
  { id: 'AI & DS', name: 'Artificial Intelligence and Data Science (AI & DS)' },
  { id: 'ECE', name: 'Electronics and Communication Engineering (ECE)' },
  { id: 'EEE', name: 'Electrical and Electronics Engineering (EEE)' },
  { id: 'ME', name: 'Mechanical Engineering (ME)' }
];

export const ALL_SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

export type ProgrammingLanguage = 'C' | 'C++' | 'Java' | 'Python' | 'SQL';
export const ALL_LANGUAGES: ProgrammingLanguage[] = ['C', 'C++', 'Java', 'Python', 'SQL'];

export interface User {
  id: string;
  role: Role;
  name: string;
  username: string;
  email: string;
  branch?: Branch;
  semester?: number;
  usn?: string;
  facultyId?: string;
  status: 'active' | 'pending_approval' | 'rejected';
  created_at?: string;
}

export interface Assignment {
  id: string;
  faculty_id: string;
  faculty_name: string;
  title: string;
  subject: string;
  lab_number: number;
  problem_statement: string;
  instructions?: string;
  permitted_languages: ProgrammingLanguage[];
  max_marks: number;
  assigned_date: string;
  due_date: string;
  branch: Branch;
  semester: number;
  allocation_type: 'all' | 'specific';
  status: 'draft' | 'published';
  created_at: string;
  // Dynamic student fields
  submission_status?: 'Pending' | 'In Progress' | 'Submitted' | 'Evaluated' | 'Late';
  marks_obtained?: number | null;
  feedback?: string | null;
  student_compilation_count?: number;
  submitted_at?: string | null;
  allocated_count?: number;
  submitted_count?: number;
  evaluated_count?: number;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_usn: string;
  student_name: string;
  code: string;
  language: ProgrammingLanguage;
  submitted_at: string;
  status: 'Submitted' | 'Evaluated' | 'Late';
  marks_obtained?: number | null;
  feedback?: string | null;
  evaluated_at?: string | null;
  evaluated_by?: string | null;
  compilation_count: number;
  execution_result?: string;
  branch?: string;
  semester?: number;
}

export interface QuizQuestion {
  id: string;
  quiz_id?: string;
  question_text: string;
  options: string[];
  correct_answer?: string; // Hidden from student until evaluation
  marks: number;
  order_num: number;
}

export interface Quiz {
  id: string;
  faculty_id: string;
  faculty_name: string;
  title: string;
  instructions: string;
  branch: Branch;
  semester: number;
  allocation_type: 'all' | 'specific';
  total_marks: 10 | 15 | 20;
  marks_per_question: number;
  duration_minutes: number;
  start_time: string;
  end_time: string;
  status: 'draft' | 'published';
  created_at: string;
  attempt_id?: string | null;
  score?: number | null;
  attempted_at?: string | null;
  question_count?: number;
  allocated_count?: number;
  attempt_count?: number;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  student_usn: string;
  student_name: string;
  answers: Record<string, string>;
  score: number;
  total_marks: number;
  submitted_at: string;
  branch?: string;
  semester?: number;
}

export interface LiveStudentStatus {
  usn: string;
  name: string;
  branch: Branch;
  semester: number;
  session_id?: string;
  login_time?: string;
  last_heartbeat?: string;
  liveStatus: 'Active' | 'Idle' | 'Logged Out' | 'Disconnected';
  active_seconds?: number;
  idle_seconds?: number;
  total_compilations?: number;
  paste_count?: number;
}

export interface PasteEvent {
  id: string;
  student_usn: string;
  student_name?: string;
  assignment_id?: string;
  assignment_title?: string;
  character_count: number;
  pasted_snippet: string;
  flagged_suspicious: number;
  timestamp: string;
}

export interface ActivitySession {
  id: string;
  student_usn: string;
  student_name: string;
  login_time: string;
  logout_time?: string;
  last_heartbeat: string;
  active_seconds: number;
  idle_seconds: number;
  status: string;
  branch?: string;
  semester?: number;
}

export interface ExecutionResponse {
  status: 'success' | 'compilation_error' | 'runtime_error' | 'timeout';
  output: string;
  error?: string;
  executionTimeMs: number;
  memoryKb?: number;
  engine: string;
  studentCompilationCount?: number;
}
