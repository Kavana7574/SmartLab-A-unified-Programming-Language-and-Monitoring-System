import React, { useEffect, useState } from 'react';
import { api } from '../../services/api.ts';
import { 
  TrendingUp, 
  Cpu, 
  CheckCircle2, 
  Clock, 
  Award, 
  HelpCircle, 
  AlertCircle,
  FileCode2,
  Sparkles,
  Info
} from 'lucide-react';

export const MyProgressTab: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const res = await api.getMyProgress();
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Failed to load progress details');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
        <span>Loading academic progress data...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
        <p className="text-xs text-rose-300">{error || 'Could not load progress'}</p>
      </div>
    );
  }

  const { metrics, submissions, quizzes } = data;

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          Academic Progress & Performance
        </h2>
        <p className="text-xs text-slate-400">
          Real-time record of your assigned laboratory programs, submissions, compilations, and quiz assessments.
        </p>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Assigned */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Assigned Labs</span>
            <FileCode2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {metrics.totalAssigned}
          </div>
          <div className="text-[11px] text-slate-400">
            {metrics.completedCount} Completed • {metrics.pendingEvaluationCount} Pending Eval
          </div>
        </div>

        {/* Submitted & Evaluated */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Evaluated Submissions</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-300 font-mono">
            {metrics.completedCount}
          </div>
          <div className="text-[11px] text-slate-400">
            {metrics.notSubmittedCount} Labs Not Yet Submitted
          </div>
        </div>

        {/* COMPILATION COUNT (CRITICAL - Explicitly required in prompt Section 17) */}
        <div className="bg-slate-900 border border-blue-500/30 rounded-2xl p-4 space-y-2 relative overflow-hidden shadow-lg shadow-blue-500/5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="text-blue-300 font-semibold">Total Code Runs / Compiles</span>
            <Cpu className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-blue-400 font-mono">
            {metrics.totalCompilationCount}
          </div>
          <div className="text-[10px] text-slate-400">
            Actual server execution count (Zero marks deduction policy)
          </div>
        </div>

        {/* Overall Score */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Overall Score</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-300 font-mono">
            {metrics.overallPercentage}%
          </div>
          <div className="text-[11px] text-slate-400">
            {metrics.totalMarksEarned} / {metrics.totalMarksPossible} Total Marks
          </div>
        </div>

      </div>

      {/* Zero Deduction Policy Banner */}
      <div className="flex items-start gap-2.5 p-3.5 bg-blue-950/20 border border-blue-500/20 rounded-xl text-xs text-slate-300">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white">SmartLab Compilation Count Policy:</strong> Code runs and compilation attempts are tracked purely for faculty activity monitoring and programming iteration analysis. Academic marks are awarded strictly by faculty evaluation criteria and quiz scores, with zero penalties or formula reductions for compilation count.
        </div>
      </div>

      {/* Submissions & Marks Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-blue-400" />
            Laboratory Submissions & Faculty Feedback
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {submissions.length} Record{submissions.length === 1 ? '' : 's'}
          </span>
        </div>

        {submissions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No lab assignments have been submitted yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 font-mono border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Lab #</th>
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4">Language</th>
                  <th className="py-3 px-4">Submitted On</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Marks Awarded</th>
                  <th className="py-3 px-4">Faculty Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {submissions.map((sub: any) => (
                  <tr key={sub.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-bold text-blue-400">
                      Lab {sub.lab_number}
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {sub.title}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {sub.language}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(sub.submitted_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        sub.status === 'Evaluated'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : sub.status === 'Submitted'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold">
                      {sub.marks_obtained !== null && sub.marks_obtained !== undefined ? (
                        <span className="text-emerald-300">{sub.marks_obtained} / {sub.max_marks}</span>
                      ) : (
                        <span className="text-slate-500 italic">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300 italic max-w-xs truncate">
                      {sub.feedback || <span className="text-slate-500 not-italic">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quiz Results Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-purple-400" />
            Quiz Performance
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {quizzes.length} Attempt{quizzes.length === 1 ? '' : 's'}
          </span>
        </div>

        {quizzes.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No quizzes completed yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 font-mono border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Quiz Title</th>
                  <th className="py-3 px-4">Completed On</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {quizzes.map((q: any) => {
                  const pct = Math.round((q.score / q.total_marks) * 100);
                  return (
                    <tr key={q.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-semibold text-white">
                        {q.quiz_title}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(q.submitted_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-300">
                        {q.score} / {q.total_marks}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
