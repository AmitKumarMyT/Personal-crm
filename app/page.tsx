'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dumbbell, Wallet, LayoutGrid, Loader2, ChevronRight, Terminal, BookOpen, BarChart3, Binary, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/firebase-provider';
import HyperCoach from '@/components/HyperCoach';
import ExpenseManager from '@/components/ExpenseManager';
import LearningEngine from '@/components/LearningEngine';
import FinancialIntel from '@/components/FinancialIntel';

export default function Home() {
  const { user, login, loading: authLoading } = useAuth();
  const [appMode, setAppMode] = useState<'launcher' | 'hyper' | 'expense' | 'learning'>('launcher');

  if (authLoading) return (
    <div className="h-screen flex items-center justify-center bg-black">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="w-12 h-12 border-4 border-[#FF2D55]/20 border-t-[#FF2D55] rounded-full"
      />
    </div>
  );

  if (!user) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-8 bg-[#050505]">
      <div className="relative w-32 h-32 mb-4">
        <LayoutGrid className="w-full h-full text-[#FF2D55] animate-pulse relative z-10" />
        <div className="absolute inset-0 bg-[#FF2D55] blur-[40px] opacity-30"></div>
      </div>
      <h1 className="text-5xl font-extrabold tracking-tighter sm:text-7xl font-heading uppercase italic">
        HYPER<span className="neon-text"> CENTER</span>
      </h1>
      <p className="max-w-md text-gray-400 text-lg">
        Unified Finance Intelligence & Adaptive Learning.<br/>
        Initialize system protocols.
      </p>
      <button onClick={login} className="btn-primary flex items-center gap-3 text-lg px-8 py-4">
        Authenticate Session <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white overflow-hidden">
      {/* Viewport */}
      <main className="flex-1 relative overflow-hidden pb-24 md:pb-28">
        <AnimatePresence mode="wait">
          {appMode === 'launcher' ? (
            <motion.div 
              key="launcher"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-full overflow-y-auto custom-scrollbar px-6 flex flex-col items-center justify-start md:justify-center py-20 gap-12"
            >
               <div className="text-center space-y-4">
                 <h2 className="text-6xl font-heading font-black tracking-tighter uppercase italic">Control Center</h2>
                 <p className="text-gray-500 font-medium tracking-widest uppercase text-[10px]">Select active infrastructure module</p>
               </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl">
                  <button 
                    onClick={() => setAppMode('hyper')}
                    className="group relative overflow-hidden glass p-8 rounded-[40px] border-white/5 hover:border-[#FF2D55]/30 transition-all text-left"
                  >
                     <div className="relative z-10 space-y-6">
                       <Dumbbell className="w-10 h-10 text-[#FF2D55] group-hover:scale-110 transition-transform" />
                       <div>
                         <h3 className="text-xl font-black uppercase tracking-tighter">Hyper Coach</h3>
                         <p className="text-gray-500 text-xs mt-2 font-medium">Biological growth protocols.</p>
                       </div>
                     </div>
                     <div className="absolute inset-0 bg-[#FF2D55]/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </button>

                  <button 
                    onClick={() => setAppMode('expense')}
                    className="group relative overflow-hidden glass p-8 rounded-[40px] border-white/5 hover:border-[#FF2D55]/30 transition-all text-left"
                  >
                     <div className="relative z-10 space-y-6">
                       <Wallet className="w-10 h-10 text-[#FF2D55] group-hover:scale-110 transition-transform" />
                       <div>
                         <h3 className="text-xl font-black uppercase tracking-tighter">Expense Engine</h3>
                         <p className="text-gray-500 text-xs mt-2 font-medium">NLP ledger & multi-node splits.</p>
                       </div>
                     </div>
                     <div className="absolute inset-0 bg-[#FF2D55]/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </button>

                  <button 
                    onClick={() => setAppMode('learning')}
                    className="group relative overflow-hidden glass p-8 rounded-[40px] border-white/5 hover:border-[#5856D6]/30 transition-all text-left"
                  >
                     <div className="relative z-10 space-y-6">
                       <Binary className="w-10 h-10 text-[#5856D6] group-hover:scale-110 transition-transform" />
                       <div>
                         <h3 className="text-xl font-black uppercase tracking-tighter">Learning Engine</h3>
                         <p className="text-gray-500 text-xs mt-2 font-medium">Adaptive DSA & Career Roadmaps.</p>
                       </div>
                     </div>
                     <div className="absolute inset-0 bg-[#5856D6]/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </button>
               </div>
            </motion.div>
          ) : (
            <motion.div
              key={appMode}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.2 }}
              className="h-full overflow-y-auto custom-scrollbar"
            >
              {appMode === 'hyper' && <HyperCoach />}
              {appMode === 'expense' && <ExpenseManager />}
              {appMode === 'learning' && <LearningEngine />}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Bottom Navigator */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-auto max-w-full px-4">
        <div className="glass px-2 py-2 rounded-[32px] border border-white/10 flex items-center gap-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {[
            { id: 'launcher', icon: LayoutGrid, label: 'Systems', color: 'text-gray-400' },
            { id: 'hyper', icon: Dumbbell, label: 'Coach', color: 'text-[#FF2D55]' },
            { id: 'expense', icon: Wallet, label: 'Engine', color: 'text-[#FF2D55]' },
            { id: 'learning', icon: Binary, label: 'Learning', color: 'text-[#5856D6]' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setAppMode(item.id as any)}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl transition-all relative group ${appMode === item.id ? 'bg-[#FF2D55] text-white shadow-[0_0_15px_rgba(255,45,85,0.4)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
            >
               <item.icon className={`w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110 ${appMode === item.id ? 'text-white' : item.color}`} />
               <span className={`text-[10px] font-black uppercase tracking-widest ${appMode === item.id ? 'block' : 'hidden lg:block'}`}>
                 {item.label}
               </span>
            </button>
          ))}
          
          <div className="w-px h-6 bg-white/10 mx-2 hidden md:block" />
          
          <button className="hidden md:flex items-center gap-2 pl-2 pr-4 group/user">
             <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center bg-[#FF2D55]/5 text-[#FF2D55] font-black text-[10px] relative">
                {user?.displayName ? user.displayName[0] : 'U'}
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[#000] shadow-[0_0_8px_#22c55e]" />
             </div>
          </button>
        </div>
      </nav>
    </div>
  );
}
