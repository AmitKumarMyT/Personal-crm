'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Code2, Brain, TrendingUp, History, Target, 
  ExternalLink, CheckCircle2, XCircle, Clock,
  ChevronRight, Sparkles, Database, Plus, Search,
  Import, Download, LayoutTemplate, Briefcase, Loader2
} from 'lucide-react';
import { useAuth } from '@/lib/firebase-provider';
import { db } from '@/lib/firebase';
import { 
  collection, addDoc, query, where, orderBy, onSnapshot, 
  serverTimestamp, limit, writeBatch, doc, getDocs 
} from 'firebase/firestore';
import { getRecommendedDifficulty, calculatePerformanceScore } from '@/lib/learning';
import { downloadJson, parseJsonFile } from '@/lib/data-utils';

const DIFFICULTY_COLORS = {
  easy: 'text-green-400 border-green-500/30 bg-green-500/5',
  medium: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5',
  hard: 'text-[#FF2D55] border-[#FF2D55]/30 bg-[#FF2D55]/5'
};

export default function LearningEngine() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'practice' | 'dashboard' | 'paths'>('practice');
  const [questions, setQuestions] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState({
    title: '', topic: '', difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    link: '', source: 'custom', tags: ''
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [roadmapQuery, setRoadmapQuery] = useState('');
  const [generatedRoadmap, setGeneratedRoadmap] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const qQuery = query(collection(db, 'users', user.uid, 'learning_questions'), orderBy('createdAt', 'desc'));
    const unsubscribeQ = onSnapshot(qQuery, (snap) => {
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    const aQuery = query(collection(db, 'users', user.uid, 'learning_attempts'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribeA = onSnapshot(aQuery, (snap) => {
      setAttempts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubscribeQ();
      unsubscribeA();
    };
  }, [user]);

  const handleAddQuestion = async () => {
    if (!user || !newQuestion.title) return;
    await addDoc(collection(db, 'users', user.uid, 'learning_questions'), {
      ...newQuestion,
      userId: user.uid,
      tags: newQuestion.tags.split(',').map(t => t.trim()),
      createdAt: serverTimestamp()
    });
    setNewQuestion({ title: '', topic: '', difficulty: 'medium', link: '', source: 'custom', tags: '' });
    setShowAddQuestion(false);
  };

  const handleAttempt = async (questionId: string, solved: boolean, timeTaken: number, difficultyFelt: number) => {
    if (!user) return;
    await addDoc(collection(db, 'users', user.uid, 'learning_attempts'), {
      userId: user.uid,
      questionId,
      solved,
      timeTaken,
      difficultyFelt,
      timestamp: serverTimestamp(),
      date: new Date().toISOString().split('T')[0]
    });
  };

  const handleAiHelp = async (question: any) => {
    setAiLoading(true);
    setAiResponse(null);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, mode: 'dsa-help' })
      });
      const data = await res.json();
      setAiResponse(data.text);
    } catch (err) {
      alert("AI Protocol Failure");
    } finally {
      setAiLoading(false);
    }
  };

  const generateRoadmap = async () => {
    if (!roadmapQuery) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: roadmapQuery, mode: 'career-roadmap' })
      });
      const data = await res.json();
      setGeneratedRoadmap(data.text);
    } catch (err) {
      alert("Roadmap Encryption Error");
    } finally {
      setAiLoading(false);
    }
  };

  // Adaptive Logic
  const averagePerformance = attempts.length > 0 
    ? attempts.slice(0, 10).reduce((acc, a) => acc + calculatePerformanceScore(a), 0) / Math.min(attempts.length, 10)
    : 0.5;

  const targetDifficulty = getRecommendedDifficulty(averagePerformance);

  const handleExportData = () => {
    downloadJson({
      version: "1.0",
      questions,
      attempts
    }, `learning-engine-export-${new Date().toISOString().split('T')[0]}.json`);
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !user) return;
    try {
      const data = await parseJsonFile(e.target.files[0]);
      if (data.version !== "1.0") throw new Error("Unsupported version");
      
      const batch = writeBatch(db);
      for (const q of (data.questions || [])) {
        const ref = doc(collection(db, 'users', user.uid, 'learning_questions'));
        batch.set(ref, { ...q, userId: user.uid, createdAt: serverTimestamp(), id: undefined });
      }
      await batch.commit();
      alert("Learning DB Merged Successfully");
    } catch (err: any) {
      alert(`Import Failed: ${err.message}`);
    }
  };

  const recommendedQuestions = questions.filter(q => q.difficulty === targetDifficulty).slice(0, 3);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 lg:p-12 space-y-10">
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#AF52DE] to-[#5856D6] flex items-center justify-center">
                <Code2 className="w-5 h-5 text-white" />
             </div>
             <h1 className="text-3xl font-black tracking-tighter">Learning Engine</h1>
          </div>
          <p className="text-gray-500 font-medium ml-13">Adaptive career growth and DSA protocol.</p>
        </div>

        <nav className="flex p-1.5 bg-white/5 rounded-2xl border border-white/5 self-start">
          {[
            { id: 'practice', label: 'Practice', icon: Brain },
            { id: 'dashboard', label: 'Analytics', icon: TrendingUp },
            { id: 'paths', label: 'Roadmap', icon: Briefcase }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                activeTab === tab.id ? 'bg-[#AF52DE] text-white shadow-[0_4px_20px_rgba(175,82,222,0.3)]' : 'text-gray-500 hover:text-white'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button onClick={handleExportData} className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all" title="Export Data">
            <Download className="w-5 h-5 text-gray-400" />
          </button>
          <label className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all cursor-pointer" title="Import Data">
            <Import className="w-5 h-5 text-gray-400" />
            <input type="file" className="hidden" onChange={handleImportData} accept=".json" />
          </label>
          <button 
            onClick={() => setShowAddQuestion(true)}
            className="flex items-center gap-2 bg-[#FF2D55] hover:bg-[#D42245] px-6 py-3 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(255,45,85,0.3)]"
          >
            <Plus className="w-4 h-4" /> Add Problem
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'practice' && (
            <motion.div 
              key="practice"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              <section className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-3 space-y-8">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[12px] uppercase font-black tracking-[4px] text-gray-500">Adaptive Recommendations</h2>
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-[#AF52DE]/10 rounded-full border border-[#AF52DE]/20">
                      <Sparkles className="w-3 h-3 text-[#AF52DE]" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#AF52DE]">Target: {targetDifficulty}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {recommendedQuestions.map(q => (
                      <div key={q.id} className="glass p-8 rounded-[2.5rem] border-white/5 hover:border-[#AF52DE]/30 transition-all group cursor-pointer relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-100 transition-opacity">
                           <ExternalLink className="w-5 h-5" />
                        </div>
                        <div className={`text-[10px] uppercase font-black tracking-widest mb-4 inline-block px-3 py-1 rounded-full border ${DIFFICULTY_COLORS[q.difficulty as 'easy' | 'medium' | 'hard']}`}>
                           {q.difficulty}
                        </div>
                        <h3 className="text-xl font-bold tracking-tight mb-2 group-hover:text-[#AF52DE] transition-colors">{q.title}</h3>
                        <div className="flex flex-wrap gap-2 mt-4">
                           {q.tags?.map((t: string) => (
                             <span key={t} className="text-[9px] px-2 py-0.5 bg-white/5 rounded-md text-gray-400 font-bold uppercase tracking-wider">{t}</span>
                           ))}
                        </div>
                        <div className="mt-8 flex items-center justify-between">
                           <span className="text-[10px] text-gray-500 font-mono">{q.topic} • {q.source}</span>
                           <div className="flex gap-2">
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 handleAiHelp(q);
                               }}
                               className="text-[10px] font-black uppercase text-gray-400 hover:text-[#AF52DE] flex items-center gap-1 transition-colors"
                             >
                               AI Strategy <Sparkles className="w-3 h-3" />
                             </button>
                             <button className="text-[10px] font-black uppercase text-[#AF52DE] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                               Solve Now <ChevronRight className="w-3 h-3" />
                             </button>
                           </div>
                        </div>
                      </div>
                    ))}
                    {recommendedQuestions.length === 0 && (
                      <div className="md:col-span-2 p-12 bg-white/5 border border-dashed border-white/10 rounded-[3rem] text-center space-y-4">
                         <div className="text-gray-500 uppercase tracking-widest font-black text-xs">No targeted protocols found.</div>
                         <button onClick={() => setShowAddQuestion(true)} className="px-8 py-3 bg-[#AF52DE] rounded-2xl text-[10px] font-black uppercase tracking-widest">Load Question Matrix</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-8">
                  <h2 className="text-[12px] uppercase font-black tracking-[4px] text-gray-500">Solve Stats</h2>
                  <div className="glass p-8 rounded-[2.5rem] border-white/5 space-y-6">
                    <div className="flex items-center justify-between text-center">
                       <div>
                         <div className="text-3xl font-black">{attempts.filter(a => a.solved).length}</div>
                         <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Solved</div>
                       </div>
                       <div className="w-px h-8 bg-white/10" />
                       <div>
                         <div className="text-3xl font-black tracking-tighter">
                           {attempts.length > 0 ? Math.round((attempts.filter(a => a.solved).length / attempts.length) * 100) : 0}%
                         </div>
                         <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Accuracy</div>
                       </div>
                    </div>
                  </div>

                  <div className="glass p-6 rounded-[2rem] border-white/5">
                     <h4 className="text-[10px] font-black uppercase tracking-widest text-[#AF52DE] mb-4">Topic Mastery</h4>
                     <div className="space-y-4">
                        {['Recursion', 'Graphs', 'DP', 'Trees'].map((topic, i) => (
                          <div key={topic} className="space-y-1.5">
                             <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-gray-400">
                               <span>{topic}</span>
                               <span>{45 + (i * 12)}%</span>
                             </div>
                             <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                               <div className="h-full bg-gradient-to-r from-[#AF52DE] to-[#5856D6]" style={{ width: `${45 + (i * 12)}%` }}></div>
                             </div>
                          </div>
                        ))}
                     </div>
                  </div>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'dashboard' && (
            <motion.div 
               key="dashboard"
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               className="p-20 bg-white/5 border border-dashed border-white/10 rounded-[3rem] text-center"
            >
               <TrendingUp className="w-12 h-12 text-[#AF52DE] mx-auto mb-6 opacity-50" />
               <h2 className="text-2xl font-black tracking-tighter">Analytics Core Offline</h2>
               <p className="text-gray-500 mt-2">Continue practicing to generate detailed performance matrices.</p>
            </motion.div>
          )}

          {activeTab === 'paths' && (
             <motion.div
               key="paths"
               initial={{ opacity: 0, scale: 0.98 }}
               animate={{ opacity: 1, scale: 1 }}
               className="space-y-12 max-w-4xl mx-auto"
             >
               <div className="text-center space-y-4 pt-12">
                  <h2 className="text-5xl font-black tracking-tighter uppercase italic">Career Matrix</h2>
                  <p className="text-gray-500 font-medium tracking-widest uppercase text-[10px]">Generate adaptive learning roadmaps</p>
               </div>

               <div className="relative">
                  <input 
                    value={roadmapQuery}
                    onChange={e => setRoadmapQuery(e.target.value)}
                    placeholder="Enter target role (e.g., Fullstack AI Engineer, Quantitative Dev)..."
                    className="w-full bg-black/40 border border-white/10 rounded-[2.5rem] p-8 text-xl font-medium outline-none focus:border-[#AF52DE]/50 transition-all shadow-2xl"
                  />
                  <button 
                    onClick={generateRoadmap}
                    disabled={aiLoading}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-[#AF52DE] text-white px-8 py-4 rounded-3xl font-black uppercase tracking-widest shadow-xl hover:scale-[1.05] active:scale-95 transition-all disabled:opacity-50"
                  >
                    {aiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Map Path'}
                  </button>
               </div>

               {generatedRoadmap && (
                 <motion.div 
                   initial={{ opacity: 0, y: 20 }} 
                   animate={{ opacity: 1, y: 0 }} 
                   className="glass p-12 rounded-[3.5rem] border-white/10 prose prose-invert max-w-none shadow-[0_30px_60px_rgba(0,0,0,0.4)]"
                 >
                    <div className="flex items-center gap-3 mb-10 text-[#AF52DE]">
                       <Sparkles className="w-6 h-6 animate-pulse" />
                       <span className="text-[10px] uppercase font-black tracking-[4px]">Verified Strategy</span>
                    </div>
                    <div className="whitespace-pre-wrap text-gray-300 leading-relaxed font-medium text-lg">
                       {generatedRoadmap}
                    </div>
                 </motion.div>
               )}
             </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Add Question Modal */}
      <AnimatePresence>
        {showAddQuestion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#0a0a0a]/90 backdrop-blur-xl">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass p-10 rounded-[3rem] border-white/10 w-full max-w-xl space-y-8"
            >
              <div className="flex items-center justify-between">
                 <h2 className="text-2xl font-black tracking-tighter uppercase">Add Matrix Entry</h2>
                 <button onClick={() => setShowAddQuestion(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><XCircle className="w-6 h-6 text-gray-500" /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <input placeholder="Title" value={newQuestion.title} onChange={e => setNewQuestion({...newQuestion, title: e.target.value})} className="bg-white/5 border-white/10 p-4 rounded-2xl outline-none focus:border-[#AF52DE] text-sm font-medium" />
                 <input placeholder="Topic" value={newQuestion.topic} onChange={e => setNewQuestion({...newQuestion, topic: e.target.value})} className="bg-white/5 border-white/10 p-4 rounded-2xl outline-none focus:border-[#AF52DE] text-sm font-medium" />
                 <select value={newQuestion.difficulty} onChange={e => setNewQuestion({...newQuestion, difficulty: e.target.value as any})} className="bg-[#1a1a1a] border border-white/10 p-4 rounded-2xl outline-none focus:border-[#AF52DE] text-sm font-medium">
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                 </select>
                 <input placeholder="Source (Blind75, etc)" value={newQuestion.source} onChange={e => setNewQuestion({...newQuestion, source: e.target.value})} className="bg-white/5 border-white/10 p-4 rounded-2xl outline-none focus:border-[#AF52DE] text-sm font-medium" />
                 <input placeholder="URL Link" value={newQuestion.link} onChange={e => setNewQuestion({...newQuestion, link: e.target.value})} className="bg-white/5 border-white/10 p-4 rounded-2xl outline-none focus:border-[#AF52DE] text-sm font-medium md:col-span-2" />
                 <input placeholder="Tags (comma separated)" value={newQuestion.tags} onChange={e => setNewQuestion({...newQuestion, tags: e.target.value})} className="bg-white/5 border-white/10 p-4 rounded-2xl outline-none focus:border-[#AF52DE] text-sm font-medium md:col-span-2" />
              </div>
              <button 
                onClick={handleAddQuestion}
                className="w-full py-5 bg-[#AF52DE] text-white rounded-[2rem] font-black uppercase text-[12px] tracking-[4px] shadow-[0_10px_30px_rgba(175,82,222,0.4)]"
              >
                Incorporate Matrix
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* AI Help Modal */}
      <AnimatePresence>
        {(aiLoading || aiResponse) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl">
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="glass p-12 rounded-[3.5rem] border-white/10 w-full max-w-2xl space-y-8 relative overflow-hidden"
             >
                <button 
                  onClick={() => { setAiResponse(null); setAiLoading(false); }} 
                  className="absolute top-8 right-8 p-3 hover:bg-white/10 rounded-full transition-colors"
                >
                  <XCircle className="w-6 h-6 text-gray-500" />
                </button>

                <div className="flex items-center gap-4 text-[#AF52DE]">
                   <Brain className={`w-8 h-8 ${aiLoading ? 'animate-pulse' : ''}`} />
                   <h2 className="text-2xl font-black tracking-tighter uppercase italic">AI Tactical Analysis</h2>
                </div>

                {aiLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-4">
                     <Loader2 className="w-12 h-12 text-[#AF52DE] animate-spin" />
                     <p className="text-[10px] uppercase font-black tracking-[4px] text-gray-500">Decrypting Logic Patterns...</p>
                  </div>
                ) : (
                  <div className="prose prose-invert max-w-none prose-headings:font-black prose-headings:uppercase prose-headings:tracking-tighter h-[50vh] overflow-y-auto custom-scrollbar pr-4">
                     <div className="text-gray-300 whitespace-pre-wrap font-medium leading-relaxed">
                        {aiResponse}
                     </div>
                  </div>
                )}
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
