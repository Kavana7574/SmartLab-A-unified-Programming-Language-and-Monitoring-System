import React, { useState, useEffect, useRef } from 'react';
import { User, Assignment, Quiz } from '../../types.ts';
import { api } from '../../services/api.ts';
import { 
  FileCode2, 
  Terminal, 
  HelpCircle, 
  TrendingUp, 
  User as UserIcon,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { AssignedLabsTab } from './AssignedLabsTab.tsx';
import { CodingWorkspaceTab } from './CodingWorkspaceTab.tsx';
import { QuizzesTab } from './QuizzesTab.tsx';
import { MyProgressTab } from './MyProgressTab.tsx';
import { MyProfileTab } from './MyProfileTab.tsx';

interface StudentDashboardProps {
  user: User;
}

type StudentSection = 'labs' | 'workspace' | 'quizzes' | 'progress' | 'profile';

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ user }) => {
  const [activeSection, setActiveSection] = useState<StudentSection>('labs');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Background Heartbeat and Idle/Active Activity Tracker (Section 15)
  const lastActivityTimeRef = useRef<number>(Date.now());
  const activeSecondsAccumulator = useRef<number>(0);
  const idleSecondsAccumulator = useRef<number>(0);

  useEffect(() => {
    // Activity listener for keyboard and mouse
    const recordUserActivity = () => {
      lastActivityTimeRef.current = Date.now();
    };

    window.addEventListener('mousemove', recordUserActivity, { passive: true });
    window.addEventListener('keydown', recordUserActivity, { passive: true });
    window.addEventListener('mousedown', recordUserActivity, { passive: true });
    window.addEventListener('scroll', recordUserActivity, { passive: true });

    // Ticker every second to track active vs idle
    const ticker = setInterval(() => {
      const now = Date.now();
      const secondsSinceLastActivity = (now - lastActivityTimeRef.current) / 1000;
      // 2 minutes inactivity threshold (120 seconds) as specified in prompt Section 15
      if (secondsSinceLastActivity > 120) {
        idleSecondsAccumulator.current += 1;
      } else {
        activeSecondsAccumulator.current += 1;
      }
    }, 1000);

    // Periodic Heartbeat to server every 30 seconds
    const heartbeatTimer = setInterval(async () => {
      const active = activeSecondsAccumulator.current;
      const idle = idleSecondsAccumulator.current;
      activeSecondsAccumulator.current = 0;
      idleSecondsAccumulator.current = 0;

      const isCurrentlyIdle = (Date.now() - lastActivityTimeRef.current) / 1000 > 120;

      try {
        await api.sendHeartbeat({
          activeSeconds: active,
          idleSeconds: idle,
          isCurrentlyIdle
        });
      } catch (e) {
        // Silent background catch
      }
    }, 30000);

    return () => {
      window.removeEventListener('mousemove', recordUserActivity);
      window.removeEventListener('keydown', recordUserActivity);
      window.removeEventListener('mousedown', recordUserActivity);
      window.removeEventListener('scroll', recordUserActivity);
      clearInterval(ticker);
      clearInterval(heartbeatTimer);
    };
  }, []);

  // Fetch initial assignments and quizzes
  const loadData = async () => {
    try {
      setIsLoading(true);
      const [assignRes, quizRes] = await Promise.all([
        api.getAssignments(),
        api.getQuizzes()
      ]);
      setAssignments(assignRes.assignments || []);
      setQuizzes(quizRes.quizzes || []);

      // If no assignment selected yet and there are assignments, select the first one by default
      if (!currentAssignment && assignRes.assignments?.length > 0) {
        setCurrentAssignment(assignRes.assignments[0]);
      }
    } catch (err) {
      console.error('Failed to load student dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When student clicks "Start Assignment" from Section 1:
  const handleStartAssignment = (assignment: Assignment) => {
    setCurrentAssignment(assignment);
    setActiveSection('workspace'); // Automatically transitions to Monaco coding workspace with question loaded!
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* 5 Main Sections Navigation Bar (Strictly the 5 requested in prompt Section 7) */}
      <div className="bg-slate-900 border border-slate-800 p-1.5 rounded-2xl flex flex-wrap items-center gap-1.5 shadow-lg">
        
        <button
          onClick={() => setActiveSection('labs')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeSection === 'labs'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <FileCode2 className="w-4 h-4" />
          <span>1. Assigned Lab Works</span>
          {assignments.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-slate-950/60 text-[10px] font-mono">
              {assignments.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSection('workspace')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeSection === 'workspace'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>2. Coding Workspace</span>
          {currentAssignment && (
            <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-200 text-[10px] font-mono hidden sm:inline">
              Lab {currentAssignment.lab_number}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSection('quizzes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeSection === 'quizzes'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>3. Assigned Quizzes</span>
          {quizzes.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-slate-950/60 text-[10px] font-mono">
              {quizzes.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSection('progress')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeSection === 'progress'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>4. My Progress</span>
        </button>

        <button
          onClick={() => setActiveSection('profile')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeSection === 'profile'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <UserIcon className="w-4 h-4" />
          <span>5. My Profile</span>
        </button>

      </div>

      {/* Render Active Section Component */}
      <div>
        {activeSection === 'labs' && (
          <AssignedLabsTab
            assignments={assignments}
            onStartAssignment={handleStartAssignment}
            isLoading={isLoading}
          />
        )}

        {activeSection === 'workspace' && (
          <CodingWorkspaceTab
            currentAssignment={currentAssignment}
            onClearAssignment={() => setCurrentAssignment(null)}
            onSubmissionSuccess={loadData}
          />
        )}

        {activeSection === 'quizzes' && (
          <QuizzesTab
            quizzes={quizzes}
            onRefresh={loadData}
            isLoading={isLoading}
          />
        )}

        {activeSection === 'progress' && (
          <MyProgressTab />
        )}

        {activeSection === 'profile' && (
          <MyProfileTab user={user} />
        )}
      </div>

    </div>
  );
};
