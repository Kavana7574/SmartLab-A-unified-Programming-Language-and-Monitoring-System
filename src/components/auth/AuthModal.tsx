import React, { useState } from 'react';
import { 
  User as UserIcon, 
  GraduationCap, 
  KeyRound, 
  Mail, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles,
  Camera,
  Layers,
  ArrowRight,
  UserPlus,
  LogIn,
  IdCard,
  Building2,
  Calendar,
  X
} from 'lucide-react';
import { ALL_BRANCHES, ALL_SEMESTERS, Branch, User } from '../../types.ts';
import { api } from '../../services/api.ts';
import { FaceCaptureModal } from './FaceCaptureModal.tsx';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: User) => void;
}

type AuthTab = 'student_login' | 'student_register' | 'faculty_login' | 'faculty_register';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess }) => {
  const [activeTab, setActiveTab] = useState<AuthTab>('student_login');

  // Student Login State
  const [studentLoginUsn, setStudentLoginUsn] = useState('');
  const [studentLoginPassword, setStudentLoginPassword] = useState('');
  const [studentLoginBranch, setStudentLoginBranch] = useState<Branch>('ISE');
  const [studentLoginSemester, setStudentLoginSemester] = useState<number>(5);

  // Student Register State
  const [regFullName, setRegFullName] = useState('');
  const [regUsn, setRegUsn] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regBranch, setRegBranch] = useState<Branch>('ISE');
  const [regSemester, setRegSemester] = useState<number>(5);
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Faculty Login State
  const [facLoginUser, setFacLoginUser] = useState('');
  const [facLoginPass, setFacLoginPass] = useState('');

  // Faculty Register State
  const [facRegFullName, setFacRegFullName] = useState('');
  const [facRegId, setFacRegId] = useState('');
  const [facRegUsername, setFacRegUsername] = useState('');
  const [facRegEmail, setFacRegEmail] = useState('');
  const [facRegDept, setFacRegDept] = useState<Branch>('ISE');
  const [facRegPass, setFacRegPass] = useState('');
  const [facRegConfirmPass, setFacRegConfirmPass] = useState('');

  // Status & Feedback
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Face Capture Modal State
  const [showFaceModal, setShowFaceModal] = useState<boolean>(false);
  const [faceModalMode, setFaceModalMode] = useState<'register' | 'login'>('login');
  const [pendingChallengeToken, setPendingChallengeToken] = useState<string | null>(null);
  const [targetUsn, setTargetUsn] = useState<string>('');

  if (!isOpen) return null;

  // Handle Quick Demo Account Selection
  const handleQuickDemo = (type: 'faculty' | 'kavana' | 'devika' | 'kanika' | 'chaitanya') => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (type === 'faculty') {
      setActiveTab('faculty_login');
      setFacLoginUser('bhavesh_ise');
      setFacLoginPass('Faculty@123');
    } else {
      setActiveTab('student_login');
      setStudentLoginBranch('ISE');
      setStudentLoginSemester(5);
      setStudentLoginPassword('Student@123');

      if (type === 'kavana') setStudentLoginUsn('1MS22IS025');
      if (type === 'devika') setStudentLoginUsn('1MS22IS018');
      if (type === 'kanika') setStudentLoginUsn('1MS22IS022');
      if (type === 'chaitanya') setStudentLoginUsn('1MS22IS015');
    }
  };

  // 1. Submit Student Login (Step 1 -> Triggers Face Authentication)
  const handleStudentLoginStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const res = await api.studentLoginStep1({
        usn: studentLoginUsn.trim().toUpperCase(),
        password: studentLoginPassword,
        branch: studentLoginBranch,
        semester: studentLoginSemester
      });

      setPendingChallengeToken(res.challengeToken);
      setTargetUsn(studentLoginUsn.trim().toUpperCase());
      setFaceModalMode('login');
      setShowFaceModal(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Student login step 1 failed');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Submit Student Register (Step 1 -> Triggers Face Enrollment)
  const handleStudentRegisterStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setTargetUsn(regUsn.trim().toUpperCase());
    setFaceModalMode('register');
    setShowFaceModal(true);
  };

  // 3. Complete Face Authentication / Enrollment
  const handleFaceComplete = async (faceVector: number[], qualityScore: number) => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      if (faceModalMode === 'register') {
        const res = await api.studentRegister({
          fullName: regFullName,
          usn: regUsn.trim().toUpperCase(),
          username: regUsername.trim().toLowerCase(),
          password: regPassword,
          confirmPassword: regConfirmPassword,
          email: regEmail,
          branch: regBranch,
          semester: regSemester,
          faceVector,
          qualityScore
        });

        setShowFaceModal(false);
        setSuccessMsg(res.message || 'Registration and Biometric Face Enrollment successful! Please sign in.');
        setActiveTab('student_login');
        setStudentLoginUsn(regUsn.trim().toUpperCase());
        setStudentLoginBranch(regBranch);
        setStudentLoginSemester(regSemester);
        setStudentLoginPassword(regPassword);
      } else {
        // Student Login Step 2: Verify Face
        const res = await api.studentLoginStep2({
          challengeToken: pendingChallengeToken!,
          usn: targetUsn,
          liveFaceVector: faceVector
        });

        setShowFaceModal(false);
        onAuthSuccess(res.user);
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Face verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Bypass demo helper for camera-less testing
  const handleDemoBypass = async () => {
    if (faceModalMode === 'login' && pendingChallengeToken) {
      setIsLoading(true);
      try {
        const res = await api.studentLoginStep2({
          challengeToken: pendingChallengeToken,
          usn: targetUsn,
          useSampleBypass: true,
          liveFaceVector: 'DEMO_MATCH'
        });
        setShowFaceModal(false);
        onAuthSuccess(res.user);
        onClose();
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // 4. Submit Faculty Login
  const handleFacultyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const res = await api.facultyLogin({
        username: facLoginUser.trim(),
        password: facLoginPass
      });
      onAuthSuccess(res.user);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Faculty login failed');
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Submit Faculty Register
  const handleFacultyRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (facRegPass !== facRegConfirmPass) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.facultyRegister({
        fullName: facRegFullName,
        facultyId: facRegId.trim().toUpperCase(),
        username: facRegUsername.trim().toLowerCase(),
        email: facRegEmail.trim(),
        department: facRegDept,
        password: facRegPass,
        confirmPassword: facRegConfirmPass
      });

      setSuccessMsg(res.message || 'Faculty Registration Submitted. Waiting for Admin Approval.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Faculty registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[94vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <IdCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                SmartLab Authentication Portal
              </h2>
              <p className="text-xs text-slate-400">
                Multi-Branch Academic Laboratory & Faculty Monitoring System
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Main Role Navigation Tabs (Section 3 Requirement) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 bg-slate-950 border-b border-slate-800 text-xs font-semibold">
          <button
            onClick={() => { setActiveTab('student_login'); setErrorMsg(null); setSuccessMsg(null); }}
            className={`py-3 px-2 text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'student_login'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>1. Student Sign In</span>
          </button>

          <button
            onClick={() => { setActiveTab('student_register'); setErrorMsg(null); setSuccessMsg(null); }}
            className={`py-3 px-2 text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'student_register'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>2. Student Register</span>
          </button>

          <button
            onClick={() => { setActiveTab('faculty_login'); setErrorMsg(null); setSuccessMsg(null); }}
            className={`py-3 px-2 text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'faculty_login'
                ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>3. Faculty Sign In</span>
          </button>

          <button
            onClick={() => { setActiveTab('faculty_register'); setErrorMsg(null); setSuccessMsg(null); }}
            className={`py-3 px-2 text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'faculty_register'
                ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>4. Faculty Register</span>
          </button>
        </div>

        {/* Quick Demo Preload Strip */}
        <div className="bg-slate-950/80 px-4 py-2 border-b border-slate-800 text-[11px] flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Quick Demo Select:
          </span>
          <button
            onClick={() => handleQuickDemo('faculty')}
            className="px-2 py-0.5 rounded bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 border border-purple-500/40 cursor-pointer font-medium"
          >
            Dr. Bhavesh S S (Faculty)
          </button>
          <button
            onClick={() => handleQuickDemo('kavana')}
            className="px-2 py-0.5 rounded bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-500/40 cursor-pointer font-medium"
          >
            Kavana (ISE Sem 5)
          </button>
          <button
            onClick={() => handleQuickDemo('devika')}
            className="px-2 py-0.5 rounded bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-500/40 cursor-pointer font-medium"
          >
            Devika (ISE Sem 5)
          </button>
          <button
            onClick={() => handleQuickDemo('kanika')}
            className="px-2 py-0.5 rounded bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-500/40 cursor-pointer font-medium"
          >
            Kanika (ISE Sem 5)
          </button>
          <button
            onClick={() => handleQuickDemo('chaitanya')}
            className="px-2 py-0.5 rounded bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-500/40 cursor-pointer font-medium"
          >
            Chaitanya (ISE Sem 5)
          </button>
        </div>

        {/* Content Form Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* Alerts */}
          {errorMsg && (
            <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: STUDENT SIGN IN */}
          {activeTab === 'student_login' && (
            <form onSubmit={handleStudentLoginStep1} className="space-y-4">
              <div className="bg-blue-950/20 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  <strong>Two-Factor Biometric Login:</strong> Step 1 verifies USN and credentials; Step 2 performs real live facial recognition.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    USN / Student ID <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <IdCard className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={studentLoginUsn}
                      onChange={(e) => setStudentLoginUsn(e.target.value)}
                      placeholder="e.g. 1MS22IS025"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Password <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      value={studentLoginPassword}
                      onChange={(e) => setStudentLoginPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Branch / Department <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={studentLoginBranch}
                    onChange={(e) => setStudentLoginBranch(e.target.value as Branch)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {ALL_BRANCHES.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Semester <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={studentLoginSemester}
                    onChange={(e) => setStudentLoginSemester(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {ALL_SEMESTERS.map((s) => (
                      <option key={s} value={s}>Semester {s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs tracking-wider transition cursor-pointer shadow-lg shadow-blue-600/30"
              >
                <Camera className="w-4 h-4" />
                <span>Verify Credentials & Open Face Authentication</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* TAB 2: STUDENT REGISTRATION */}
          {activeTab === 'student_register' && (
            <form onSubmit={handleStudentRegisterStep1} className="space-y-4">
              <div className="bg-blue-950/20 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  Fill in your details below, then click &quot;Proceed to Face Registration&quot; to capture your live biometric face template.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="e.g. Kavana N"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">USN / Student ID *</label>
                  <input
                    type="text"
                    required
                    value={regUsn}
                    onChange={(e) => setRegUsn(e.target.value)}
                    placeholder="e.g. 1MS22IS099"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="e.g. kavana_22"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="e.g. student@college.edu"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Branch *</label>
                  <select
                    value={regBranch}
                    onChange={(e) => setRegBranch(e.target.value as Branch)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {ALL_BRANCHES.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Semester *</label>
                  <select
                    value={regSemester}
                    onChange={(e) => setRegSemester(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {ALL_SEMESTERS.map((s) => (
                      <option key={s} value={s}>Semester {s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm Password *</label>
                  <input
                    type="password"
                    required
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs tracking-wider transition cursor-pointer shadow-lg shadow-blue-600/30"
              >
                <Camera className="w-4 h-4" />
                <span>Proceed to Biometric Face Registration</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* TAB 3: FACULTY SIGN IN */}
          {activeTab === 'faculty_login' && (
            <form onSubmit={handleFacultyLogin} className="space-y-4">
              <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-3 text-xs text-purple-300 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-purple-400 shrink-0" />
                <span>
                  Faculty access requires an approved college faculty profile. Sign in with your registered credentials.
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Username / Faculty ID / Email <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={facLoginUser}
                      onChange={(e) => setFacLoginUser(e.target.value)}
                      placeholder="e.g. bhavesh_ise or FAC-ISE-001"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Password <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      value={facLoginPass}
                      onChange={(e) => setFacLoginPass(e.target.value)}
                      placeholder="Enter faculty password"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs tracking-wider transition cursor-pointer shadow-lg shadow-purple-600/30"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In to Faculty Dashboard</span>
              </button>
            </form>
          )}

          {/* TAB 4: FACULTY REGISTRATION */}
          {activeTab === 'faculty_register' && (
            <form onSubmit={handleFacultyRegister} className="space-y-4">
              <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-3 text-xs text-purple-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-purple-400 shrink-0" />
                <span>
                  <strong>Approval Notice:</strong> Faculty registrations require administrative verification before dashboard access is unlocked.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name (with Prefix) *</label>
                  <input
                    type="text"
                    required
                    value={facRegFullName}
                    onChange={(e) => setFacRegFullName(e.target.value)}
                    placeholder="e.g. Dr. Ramesh Rao"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Faculty ID *</label>
                  <input
                    type="text"
                    required
                    value={facRegId}
                    onChange={(e) => setFacRegId(e.target.value)}
                    placeholder="e.g. FAC-CSE-005"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={facRegUsername}
                    onChange={(e) => setFacRegUsername(e.target.value)}
                    placeholder="e.g. ramesh_cse"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Official College Email *</label>
                  <input
                    type="email"
                    required
                    value={facRegEmail}
                    onChange={(e) => setFacRegEmail(e.target.value)}
                    placeholder="e.g. ramesh@college.edu"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Department / Branch *</label>
                  <select
                    value={facRegDept}
                    onChange={(e) => setFacRegDept(e.target.value as Branch)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    {ALL_BRANCHES.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    value={facRegPass}
                    onChange={(e) => setFacRegPass(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm Password *</label>
                  <input
                    type="password"
                    required
                    value={facRegConfirmPass}
                    onChange={(e) => setFacRegConfirmPass(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs tracking-wider transition cursor-pointer shadow-lg shadow-purple-600/30"
              >
                <UserPlus className="w-4 h-4" />
                <span>Submit Faculty Registration for Admin Approval</span>
              </button>
            </form>
          )}

        </div>

      </div>

      {/* Face Capture / Biometric Authentication Modal */}
      {showFaceModal && (
        <FaceCaptureModal
          mode={faceModalMode}
          usn={targetUsn}
          onConfirm={handleFaceComplete}
          onBypassDemo={handleDemoBypass}
          onCancel={() => setShowFaceModal(false)}
        />
      )}
    </div>
  );
};
