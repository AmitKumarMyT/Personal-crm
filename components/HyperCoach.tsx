'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User as UserIcon, Loader2, Dumbbell, History, LineChart, LogOut, Play, ChevronRight, CheckCircle2, Settings, Youtube, X } from 'lucide-react';
import { useAuth } from '@/lib/firebase-provider';
import { useStore } from '@/lib/store';
import { interpretChat, generateWorkout } from '@/lib/ai';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Image from 'next/image';

const GlassCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`glass p-6 ${className}`}>
    {children}
  </div>
);

export default function HyperCoach() {
  const { user, login, logout, loading: authLoading } = useAuth();
  const { profile, currentWorkout, history, isLoading } = useStore();
  const [activeTab, setActiveTab] = useState<'home' | 'chat' | 'history' | 'progress' | 'settings'>('home');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('HYPER_AI_GEMINI_KEY') || '';
    }
    return '';
  });
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const saveApiKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem('HYPER_AI_GEMINI_KEY', key);
  };

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, 'users', user.uid, 'chats'), 
        orderBy('timestamp', 'asc')
      );
      const unsubscribe = onSnapshot(q, 
        (snap) => {
          setMessages(snap.docs.map(d => d.data()));
        },
        (error) => {
          // Ignore benign gRPC cancellations and common idle timeouts
          if (error.code === 'cancelled' || error.code === 'unavailable') {
            return;
          }
          console.error("Chat messages subscription error", error);
        }
      );
      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendChat = async () => {
    if (!chatInput.trim() || !user) return;
    const msg = chatInput;
    setChatInput('');
    setIsAiTyping(true);

    try {
      await addDoc(collection(db, 'users', user.uid, 'chats'), {
        text: msg,
        role: 'user',
        userId: user.uid,
        timestamp: serverTimestamp()
      });

      const responseText = await interpretChat(user.uid, msg, messages, customApiKey);
      
      await addDoc(collection(db, 'users', user.uid, 'chats'), {
        text: responseText,
        role: 'model',
        userId: user.uid,
        timestamp: serverTimestamp()
      });

      if (msg.toLowerCase().includes('workout') || msg.toLowerCase().includes('generate') || msg.toLowerCase().includes('plan')) {
        const workout = await generateWorkout(user.uid, [...messages, { role: 'user', text: msg }], profile, customApiKey);
        console.log("Workout generated!", workout);
        setActiveTab('home');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiTyping(false);
    }
  };

  const renderHome = () => (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-heading font-bold tracking-tight">Hello, {user?.displayName?.split(' ')[0]}</h2>
          <p className="text-gray-400 text-sm mt-1">You&apos;re on day {profile?.stats.streak || 0} of your hypertrophy streak.</p>
        </div>
        <div className="phase-tag inline-block self-start sm:self-auto px-4 py-1.5 bg-[rgba(255,45,85,0.15)] text-[#FF2D55] border border-[#FF2D55] rounded-full text-[11px] font-bold uppercase tracking-[1px]">
          {profile?.priority_phase} Intensity
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <GlassCard className="lg:col-span-8 border-white/5">
          <div className="card-title">
            <span>Today&apos;s Protocol</span>
            <span>35 MINS</span>
          </div>
          
          {currentWorkout ? (
            <div className="space-y-4">
              {currentWorkout.exercises.map((ex: any, i: number) => (
                <div key={i} className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-2xl border border-white/[0.05] group hover:border-[#FF2D55]/30 transition-all">
                   <div className="w-12 h-12 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-xl font-bold border border-white/5 group-hover:bg-[#FF2D55]/10 group-hover:text-[#FF2D55] transition-colors">
                     {['💪', '🪑', '💎', '🔥', '⚡', '🏋️'][i % 6]}
                   </div>
                   <div className="flex-1">
                      <h4 className="font-bold text-[15px] leading-tight">{ex.name}</h4>
                      <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">{ex.sets} Sets × {ex.reps} • {ex.rest_seconds}s Rest</p>
                    </div>
                    {ex.youtube_search_query && (
                      <button 
                         onClick={() => setSelectedVideo(ex.youtube_search_query)}
                         className="p-2 bg-white/[0.03] border border-white/5 rounded-xl text-[#FF2D55] hover:bg-[#FF2D55]/10 transition-colors"
                         title="Watch Technique"
                      >
                         <Youtube className="w-4 h-4" />
                      </button>
                    )}
                    <div className="w-6 h-6 border-2 border-[#FF2D55] rounded-full flex items-center justify-center">
                     {i === 0 && <div className="w-3 h-3 bg-[#FF2D55] rounded-full shadow-[0_0_8px_rgba(255,45,85,0.6)]"></div>}
                   </div>
                </div>
              ))}
              <button className="w-full btn-primary mt-4 flex items-center justify-center gap-2">
                Start Session
              </button>
            </div>
          ) : (
            <div className="text-center py-12 space-y-5">
              <div className="w-16 h-16 bg-white/[0.03] rounded-full flex items-center justify-center mx-auto border border-white/10">
                <Dumbbell className="text-gray-600 w-8 h-8" />
              </div>
              <p className="text-gray-400 text-sm italic">No active workout protocol detected.<br />Ask your coach to generate a new session.</p>
              <button onClick={() => setActiveTab('chat')} className="btn-primary py-3 px-8 text-xs">
                Open Coach Interface
              </button>
            </div>
          )}
        </GlassCard>

        <div className="lg:col-span-4 space-y-6">
          <footer className="grid grid-cols-1 gap-6">
            <GlassCard className="text-center py-6">
              <div className="text-[#FF2D55] text-3xl font-extrabold tracking-tight">{(profile?.stats.totalVolume || 0).toLocaleString()}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest mt-2">KG Total Volume</div>
            </GlassCard>
            <GlassCard className="text-center py-6">
              <div className="text-[#FF2D55] text-3xl font-extrabold tracking-tight">{profile?.stats.streak || 0}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest mt-2">Day Streak</div>
            </GlassCard>
            <GlassCard className="text-center py-6 relative">
              <div className="text-[#FF2D55] text-3xl font-extrabold tracking-tight">24%</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest mt-2 font-medium">Muscle Growth Est.</div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
                <div className="h-full bg-[#FF2D55] shadow-[0_0_10px_rgba(255,45,85,0.4)]" style={{ width: '24%' }}></div>
              </div>
            </GlassCard>
          </footer>
        </div>
      </div>
    </div>
  );

  const renderChat = () => (
    <div className="flex flex-col h-[calc(100vh-200px)] animate-fade-in relative z-10 lg:px-4">
      <div className="card-title hidden md:flex">
        <span>Gemini Coach Flash</span>
        <span className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#FF2D55] rounded-full animate-pulse shadow-[0_0_8px_rgba(255,45,85,0.8)]"></div>
          Online
        </span>
      </div>
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-4 pb-4 pr-2 custom-scrollbar"
      >
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <div className="w-20 h-20 bg-[#FF2D55]/10 rounded-3xl flex items-center justify-center mx-auto border border-[#FF2D55]/20 rotate-3">
              <Bot className="text-[#FF2D55] w-10 h-10 -rotate-3" />
            </div>
            <h3 className="text-2xl font-bold font-heading tracking-tight">Tactical AI Coach</h3>
            <p className="text-gray-400 text-sm max-w-[260px] mx-auto leading-relaxed">
              Feed me your logs, soreness levels, or equipment changes. I calibrate for growth.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`bubble ${m.role === 'user' ? 'user' : 'ai'}`}>
              <p className="text-[14px] leading-relaxed">{m.text}</p>
            </div>
          </div>
        ))}
        {isAiTyping && (
           <div className="flex justify-start">
             <div className="bubble ai flex items-center gap-2 py-4">
               <span className="w-1.5 h-1.5 bg-[#FF2D55] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
               <span className="w-1.5 h-1.5 bg-[#FF2D55] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
               <span className="w-1.5 h-1.5 bg-[#FF2D55] rounded-full animate-bounce"></span>
             </div>
           </div>
        )}
      </div>

      <div className="mt-4 flex gap-3 pb-2">
        <div className="flex-1 relative">
          <input 
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
            placeholder="Message your coach..."
            className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-[#FF2D55]/50 transition-all text-sm pr-16"
          />
          <button 
            onClick={handleSendChat} 
            disabled={isAiTyping} 
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#FF2D55] font-bold text-xs uppercase tracking-widest disabled:opacity-30 hover:scale-105 transition-transform"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="animate-fade-in space-y-8 max-w-2xl">
      <header>
        <h2 className="text-3xl font-heading font-bold tracking-tight">System Settings</h2>
        <p className="text-gray-400 text-sm mt-1">Configure your AI coaching parameters and integration keys.</p>
      </header>

      <div className="space-y-6">
        <GlassCard className="border-white/5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#FF2D55] mb-6">Gemini AI Configuration</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Override Gemini API Key</label>
              <div className="relative">
                <input 
                  type="password"
                  value={customApiKey}
                  onChange={(e) => saveApiKey(e.target.value)}
                  placeholder="Paste your API key here..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-3.5 focus:outline-none focus:border-[#FF2D55]/50 transition-all text-sm pr-12 text-white"
                />
                <button 
                  onClick={() => saveApiKey('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-[10px] font-black uppercase tracking-tighter"
                >
                  Clear
                </button>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed italic px-1">
              Note: If left blank, the application will use the pre-configured system key. Providing your own key ensures consistent performance and personalized limits.
            </p>
          </div>
        </GlassCard>

        <GlassCard className="border-white/5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#FF2D55] mb-6">User Session</h3>
          <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border border-white/5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10">
                {user?.photoURL ? (
                  <Image src={user.photoURL} alt="Avatar" width={40} height={40} referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-gray-400" />
                  </div>
                )}
              </div>
              <div>
                <div className="text-sm font-bold">{user?.displayName}</div>
                <div className="text-[10px] text-gray-500 font-mono tracking-tight">{user?.email}</div>
              </div>
            </div>
            <button onClick={logout} className="p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  );

  const navigation = [
    { id: 'home', icon: Dumbbell, label: 'Workout Dashboard' },
    { id: 'chat', icon: Bot, label: 'AI Coach Interface' },
    { id: 'history', icon: History, label: 'Training History' },
    { id: 'progress', icon: LineChart, label: 'Body Metrics' },
    { id: 'settings', icon: Settings, label: 'System Settings' },
  ] as const;

  if (authLoading) return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="animate-spin text-[#FF2D55] w-12 h-12" />
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#050505]">
      {/* Module Navigation Header */}
      <header className="sticky top-0 z-50 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between py-4">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#FF2D55]/10 flex items-center justify-center border border-[#FF2D55]/20">
                 <Dumbbell className="w-4 h-4 text-[#FF2D55]" />
              </div>
              <h1 className="text-sm font-black uppercase tracking-[2px]">Hyper Coach</h1>
           </div>

           <nav className="flex gap-1 bg-white/[0.02] p-1 rounded-xl border border-white/5">
              {navigation.map((nav) => (
                <button 
                  key={nav.id} 
                  onClick={() => setActiveTab(nav.id)} 
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === nav.id ? 'bg-[#FF2D55] text-white shadow-[0_4px_10px_rgba(255,45,85,0.3)]' : 'text-gray-500 hover:text-white'}`}
                >
                  <nav.icon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{nav.label}</span>
                </button>
              ))}
           </nav>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto p-6 md:p-10 mb-20 md:mb-0">
          {activeTab === 'home' && renderHome()}
          {activeTab === 'chat' && renderChat()}
          {activeTab === 'settings' && renderSettings()}
          {activeTab === 'history' && (
            <div className="animate-fade-in space-y-6">
              <h2 className="text-3xl font-heading font-bold tracking-tight">Training History</h2>
              <div className="space-y-4">
                {history.map((h, i) => (
                  <GlassCard key={i} className="group hover:border-[#FF2D55]/30 transition-all cursor-pointer">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#FF2D55]">{h.session.phase} Protocol</span>
                        <h4 className="text-lg font-bold">{h.summary?.what_was_done || 'Workout Session'}</h4>
                      </div>
                      <span className="text-xs text-gray-500 font-mono bg-white/[0.03] px-3 py-1 rounded-full">{new Date(h.createdAt?.toDate?.() || 0).toLocaleDateString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="bg-white/[0.03] p-3 rounded-xl">
                          <div className="text-[9px] text-gray-500 uppercase tracking-[1px] mb-1">Duration</div>
                          <div className="text-sm font-bold">{h.session.duration_minutes} MINS</div>
                       </div>
                       <div className="bg-white/[0.03] p-3 rounded-xl">
                          <div className="text-[9px] text-gray-500 uppercase tracking-[1px] mb-1">Volume</div>
                          <div className="text-sm font-bold">{(h.summary?.total_volume || 0).toLocaleString()} KG</div>
                       </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'progress' && (
            <div className="animate-fade-in space-y-8">
               <h2 className="text-3xl font-heading font-bold tracking-tight">Body Metrics</h2>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <GlassCard className="h-64 flex flex-col items-center justify-center border-dashed border-white/10 group cursor-help">
                    <LineChart className="w-16 h-16 text-gray-700 mb-4 group-hover:text-[#FF2D55]/40 transition-colors" />
                    <p className="text-sm text-gray-500 font-medium">Accumulate 3 sessions to unlock charts.</p>
                 </GlassCard>
                 <div className="space-y-4">
                   <GlassCard className="py-8">
                     <div className="text-center">
                       <div className="text-[#FF2D55] text-5xl font-black neon-text">65%</div>
                       <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-4">Growth Consistency</div>
                     </div>
                   </GlassCard>
                   <GlassCard className="py-6">
                     <h3 className="text-[10px] text-gray-500 uppercase tracking-widest mb-4">Top Targets</h3>
                     <div className="space-y-5">
                       {[
                         { label: 'Upper Body', color: '#FF2D55', width: '85%' },
                         { label: 'Lower Body', color: '#6366f1', width: '40%' },
                         { label: 'Core / Back', color: '#10b981', width: '25%' }
                       ].map((target, idx) => (
                         <div key={idx} className="space-y-2">
                           <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider">
                             <span>{target.label}</span>
                             <span>{target.width}</span>
                           </div>
                           <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                             <div className="h-full rounded-full" style={{ width: target.width, backgroundColor: target.color }}></div>
                           </div>
                         </div>
                       ))}
                     </div>
                   </GlassCard>
                 </div>
               </div>
            </div>
          )}
        </div>
      </main>

      {/* Video Overlay */}
      <AnimatePresence>
        {selectedVideo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-4xl glass overflow-hidden border-white/10"
            >
               <div className="p-4 border-b border-white/10 flex justify-between items-center">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-[#FF2D55]">Technique Protocol: {selectedVideo}</h3>
                 <button onClick={() => setSelectedVideo(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                   <X className="w-5 h-5 text-gray-400" />
                 </button>
               </div>
               <div className="aspect-video w-full bg-black">
                  <iframe 
                    src={`https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(selectedVideo)}`}
                    className="w-full h-full border-none"
                    allowFullScreen
                  ></iframe>
               </div>
               <div className="p-4 bg-white/[0.02]">
                 <p className="text-[10px] text-gray-500 leading-tight uppercase tracking-wide italic">Technique check provided by search. High-intensity form is mandatory for the protocol.</p>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
