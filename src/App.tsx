/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, ALL_BRANCHES } from './types.ts';
import { api, getStoredToken } from './services/api.ts';
import { Header } from './components/Header.tsx';
import { AuthModal } from './components/auth/AuthModal.tsx';
import { StudentDashboard } from './components/student/StudentDashboard.tsx';
import { FacultyDashboard } from './components/faculty/FacultyDashboard.tsx';
import { 
  Code2, 
  Terminal, 
  ShieldCheck, 
  Activity, 
  GraduationCap, 
  UserPlus, 
  LogIn, 
  Sparkles, 
  CheckCircle2, 
  ArrowRight,
  Cpu,
  Layers,
  HelpCircle,
  Copy,
  BookOpen
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);

  // Check existing session token on startup
  useEffect(() => {
    async function checkAuth() {
      const token = getStoredToken();
      if (!token) {
        setIsLoadingAuth(false);
        return;
      }

      try {
        const res = await api.getCurrentUser();
        if (res.user) {
          setCurrentUser(res.user);
        }
      } catch (e) {
        // Token expired or invalid
      } finally {
        setIsLoadingAuth(false);
      }
    }

    checkAuth();
  }, []);

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
  };

  const handleQuickDemo = async (type: 'faculty' | 'kavana' | 'devika' | 'kanika' | 'chaitanya') => {
    try {
      if (type === 'faculty') {
        const res = await api.facultyLogin({
          username: 'bhavesh_ise',
          password: 'Faculty@123'
        });
        setCurrentUser(res.user);
      } else {
        const usnMap: Record<string, string> = {
          kavana: '1MS22IS025',
          devika: '1MS22IS018',
          kanika: '1MS22IS022',
          chaitanya: '1MS22IS015'
        };

        const targetUsn = usnMap[type];
        // Step 1
        const step1 = await api.studentLoginStep1({
          usn: targetUsn,
          password: 'Student@123',
          branch: 'ISE',
          semester: 5
        });

        // Step 2 Face Verification via demo bypass
        const step2 = await api.studentLoginStep2({
          challengeToken: step1.challengeToken,
          usn: targetUsn,
          useSampleBypass: true,
          liveFaceVector: 'DEMO_MATCH'
        });

        setCurrentUser(step2.user);
      }
    } catch (err: any) {
      alert(`Demo login notice: ${err.message}`);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
        <span>Initializing SmartLab Academic Gateway...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      
      {/* Universal Top Header */}
      <Header
        user={currentUser}
        onLogout={handleLogout}
        onOpenAuth={() => setIsAuthOpen(true)}
      />

      {/* Main Body */}
      <main className="flex-1">
        {currentUser ? (
          currentUser.role === 'student' ? (
            <StudentDashboard user={currentUser} />
          ) : (
            <FacultyDashboard user={currentUser} />
          )
        ) : (
          /* Landing Screen (When not signed in) */
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
            
            {/* Hero Section */}
            <div className="text-center space-y-4 max-w-3xl mx-auto pt-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold tracking-wide uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                Engineering College Laboratory Automation
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
                SMART<span className="text-blue-500">LAB</span>
              </h1>
              <p className="text-sm sm:text-base font-semibold text-slate-300">
                A Unified Multi-Branch Coding Platform & Faculty Monitoring System
              </p>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Empowering engineering students and faculty across Computer Science, Information Science, AI & ML, AI & DS, ECE, EEE, and Mechanical Engineering with facial biometric authentication, Monaco code editor, sandboxed execution, MCQ quizzes, and real-time proctoring.
              </p>

              {/* 1-Click Demo Evaluation Launcher */}
              <div className="pt-2">
                <div className="inline-flex flex-wrap items-center justify-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl text-xs">
                  <span className="font-bold text-slate-400 px-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Quick Demo Evaluation:
                  </span>
                  
                  <button
                    onClick={() => handleQuickDemo('faculty')}
                    className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/60 text-purple-200 border border-purple-500/40 font-semibold transition cursor-pointer"
                  >
                    Dr. Bhavesh S S (Faculty)
                  </button>

                  <button
                    onClick={() => handleQuickDemo('kavana')}
                    className="px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/60 text-blue-200 border border-blue-500/40 font-semibold transition cursor-pointer"
                  >
                    Kavana (ISE Sem 5 • 18 Runs)
                  </button>

                  <button
                    onClick={() => handleQuickDemo('kanika')}
                    className="px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/60 text-blue-200 border border-blue-500/40 font-semibold transition cursor-pointer"
                  >
                    Kanika (ISE Sem 5 • 25 Runs)
                  </button>

                  <button
                    onClick={() => handleQuickDemo('chaitanya')}
                    className="px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/60 text-blue-200 border border-blue-500/40 font-semibold transition cursor-pointer"
                  >
                    Chaitanya (ISE Sem 5 • 9 Runs)
                  </button>
                </div>
              </div>
            </div>

            {/* 4 Main Role Navigation Options (Section 3 Requirement) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Option 1: Student Sign In */}
              <div 
                onClick={() => setIsAuthOpen(true)}
                className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-6 shadow-lg flex flex-col justify-between space-y-4 cursor-pointer group transition duration-200 hover:-translate-y-1"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center group-hover:scale-105 transition">
                    <LogIn className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white group-hover:text-blue-300">
                    1. Student Sign In
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Access your assigned laboratory works, Monaco coding editor, and quizzes with 2-step facial biometric verification.
                  </p>
                </div>
                <div className="flex items-center text-xs font-bold text-blue-400 gap-1 pt-2">
                  <span>Sign In as Student</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
                </div>
              </div>

              {/* Option 2: Student Registration */}
              <div 
                onClick={() => setIsAuthOpen(true)}
                className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-6 shadow-lg flex flex-col justify-between space-y-4 cursor-pointer group transition duration-200 hover:-translate-y-1"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center group-hover:scale-105 transition">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white group-hover:text-blue-300">
                    2. Student Register
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Enroll your student profile with branch selection, semester assignment, and live webcam face template registration.
                  </p>
                </div>
                <div className="flex items-center text-xs font-bold text-blue-400 gap-1 pt-2">
                  <span>Register & Enroll Face</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
                </div>
              </div>

              {/* Option 3: Faculty Sign In */}
              <div 
                onClick={() => setIsAuthOpen(true)}
                className="bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-6 shadow-lg flex flex-col justify-between space-y-4 cursor-pointer group transition duration-200 hover:-translate-y-1"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 flex items-center justify-center group-hover:scale-105 transition">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white group-hover:text-purple-300">
                    3. Faculty Sign In
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Access approved faculty dashboard to assign programming tasks, evaluate submissions, create quizzes, and monitor activity.
                  </p>
                </div>
                <div className="flex items-center text-xs font-bold text-purple-400 gap-1 pt-2">
                  <span>Faculty Console</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
                </div>
              </div>

              {/* Option 4: Faculty Registration */}
              <div 
                onClick={() => setIsAuthOpen(true)}
                className="bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-6 shadow-lg flex flex-col justify-between space-y-4 cursor-pointer group transition duration-200 hover:-translate-y-1"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 flex items-center justify-center group-hover:scale-105 transition">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white group-hover:text-purple-300">
                    4. Faculty Register
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Register a new faculty account under your department with administrative approval protection and role verification.
                  </p>
                </div>
                <div className="flex items-center text-xs font-bold text-purple-400 gap-1 pt-2">
                  <span>Submit for Approval</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
                </div>
              </div>

            </div>

            {/* Supported Branches Showcase */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                Supported Engineering Disciplines (Semesters 1 through 8)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 text-center text-xs">
                {ALL_BRANCHES.map(b => (
                  <div key={b.id} className="bg-slate-950 border border-slate-800/80 p-3 rounded-xl">
                    <span className="font-mono font-bold text-blue-400 block">{b.id}</span>
                    <span className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{b.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Architecture Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-bold text-white">128-D Biometric Authentication</h4>
                <p className="text-slate-400 leading-relaxed">
                  Real WebRTC camera feed with lighting, sharpness, and spatial gradient feature analysis computing deterministic 128-D embedding vectors matched server-side.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
                <Cpu className="w-5 h-5 text-blue-400" />
                <h4 className="text-sm font-bold text-white">Judge0 & Sandboxed Execution</h4>
                <p className="text-slate-400 leading-relaxed">
                  Support for C, C++, Java, Python, and SQL with sandboxed execution, memory isolation, time limits, and non-penalized compilation tracking.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
                <Activity className="w-5 h-5 text-purple-400" />
                <h4 className="text-sm font-bold text-white">Faculty Proctoring & Quiz Engine</h4>
                <p className="text-slate-400 leading-relaxed">
                  Real-time student status tracking (Active, Idle, Disconnected), Monaco paste event recording, lexical similarity comparison, and MCQ quiz grading.
                </p>
              </div>
            </div>

          </div>
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(user) => setCurrentUser(user)}
      />

    </div>
  );
}
