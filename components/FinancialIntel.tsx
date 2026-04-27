'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CreditCard, Calendar, Repeat, ArrowRight, 
  Plus, Trash2, PieChart, Info, AlertTriangle,
  Zap, Clock, ShieldCheck, TrendingUp, TrendingDown
} from 'lucide-react';
import { useAuth } from '@/lib/firebase-provider';
import { db } from '@/lib/firebase';
import { 
  collection, addDoc, query, where, orderBy, onSnapshot, 
  serverTimestamp, updateDoc, doc, deleteDoc, increment, writeBatch,
  limit, getDocs
} from 'firebase/firestore';
import { calculateEMI, shouldGenerateRecurring } from '@/lib/finance';

export default function FinancialIntel() {
  const { user } = useAuth();
  const [recurring, setRecurring] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [bankBalance, setBankBalance] = useState<number>(0);
  const [isUpdatingBalance, setIsUpdatingBalance] = useState(false);
  const [externalMetrics, setExternalMetrics] = useState({ receivables: 0, payables: 0 });
  
  const [newRecurring, setNewRecurring] = useState({
    title: '', amount: 0, frequency: 'monthly' as 'monthly' | 'weekly',
    type: 'subscription' as 'subscription' | 'emi'
  });

  const [newLoan, setNewLoan] = useState({
    title: '', principal: 0, interestRate: 0, tenureMonths: 12
  });

  useEffect(() => {
    if (!user) return;

    const rQuery = query(collection(db, 'users', user.uid, 'recurring_payments'));
    const unsubscribeR = onSnapshot(rQuery, (snap) => {
      setRecurring(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const lQuery = query(collection(db, 'users', user.uid, 'loans'));
    const unsubscribeL = onSnapshot(lQuery, (snap) => {
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const bQuery = query(collection(db, 'users', user.uid, 'bank_balances'), limit(1));
    const unsubscribeB = onSnapshot(bQuery, (snap) => {
      if (!snap.empty) {
        setBankBalance(snap.docs[0].data().amount);
      }
    });

    const cQuery = query(collection(db, 'users', user.uid, 'contacts'));
    const unsubscribeC = onSnapshot(cQuery, (snap) => {
      let r = 0, p = 0;
      snap.docs.forEach(d => {
        const bal = d.data().balance || 0;
        if (bal > 0) r += bal;
        else if (bal < 0) p += Math.abs(bal);
      });
      setExternalMetrics({ receivables: r, payables: p });
    });

    return () => {
      unsubscribeR();
      unsubscribeL();
      unsubscribeB();
      unsubscribeC();
    };
  }, [user]);

  // Recurring Payments Engine Effect
  useEffect(() => {
    if (!user || recurring.length === 0) return;

    const runEngine = async () => {
      const batch = writeBatch(db);
      let generatedCount = 0;

      for (const pay of recurring) {
        const lastGenerated = pay.lastGenerated?.toDate ? pay.lastGenerated.toDate() : null;
        if (shouldGenerateRecurring(lastGenerated, pay.frequency)) {
          const expenseRef = doc(collection(db, 'users', user.uid, 'expenses'));
          batch.set(expenseRef, {
            userId: user.uid,
            description: `[AUTO] ${pay.title}`,
            amount: pay.amount,
            myShare: pay.amount,
            payer: 'me',
            involved: ['me'],
            type: 'owe',
            timestamp: serverTimestamp(),
            recurringId: pay.id
          });

          const payRef = doc(db, 'users', user.uid, 'recurring_payments', pay.id);
          batch.update(payRef, { lastGenerated: serverTimestamp() });
          
          // Deduct from bank balance
          const bQuery = query(collection(db, 'users', user.uid, 'bank_balances'), limit(1));
          const bSnap = await getDocs(bQuery);
          if (!bSnap.empty) {
            const bRef = doc(db, 'users', user.uid, 'bank_balances', bSnap.docs[0].id);
            batch.update(bRef, {
              amount: increment(-pay.amount),
              updatedAt: serverTimestamp()
            });
          }
          
          generatedCount++;
        }
      }

      if (generatedCount > 0) {
        await batch.commit();
        console.log(`Finance Engine: Generated ${generatedCount} recurring transactions.`);
      }
    };

    runEngine();
  }, [user, recurring]);

  const handleAddRecurring = async () => {
    if (!user || !newRecurring.title) return;
    await addDoc(collection(db, 'users', user.uid, 'recurring_payments'), {
      ...newRecurring,
      userId: user.uid,
      startDate: new Date().toISOString().split('T')[0],
      createdAt: serverTimestamp()
    });
    setNewRecurring({ title: '', amount: 0, frequency: 'monthly', type: 'subscription' });
    setShowAddRecurring(false);
  };

  const handleAddLoan = async () => {
    if (!user || !newLoan.title) return;
    const emi = calculateEMI(newLoan.principal, newLoan.interestRate, newLoan.tenureMonths);
    await addDoc(collection(db, 'users', user.uid, 'loans'), {
      ...newLoan,
      userId: user.uid,
      emi,
      remainingAmount: newLoan.principal,
      startDate: new Date().toISOString().split('T')[0],
      createdAt: serverTimestamp()
    });
    setNewLoan({ title: '', principal: 0, interestRate: 0, tenureMonths: 12 });
    setShowAddLoan(false);
  };

  const updateBankBalance = async (newVal: number) => {
    if (!user) return;
    setIsUpdatingBalance(true);
    try {
      const bQuery = query(collection(db, 'users', user.uid, 'bank_balances'), limit(1));
      const snap = await getDocs(bQuery);
      
      if (snap.empty) {
        await addDoc(collection(db, 'users', user.uid, 'bank_balances'), {
          amount: newVal,
          userId: user.uid,
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, 'users', user.uid, 'bank_balances', snap.docs[0].id), {
          amount: newVal,
          updatedAt: serverTimestamp()
        });
      }
    } finally {
      setIsUpdatingBalance(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-12">
      {/* Global Liquidity Matrix */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="md:col-span-2 glass p-10 rounded-[3rem] border-white/5 bg-gradient-to-br from-[#AF52DE]/10 to-transparent flex items-center justify-between overflow-hidden relative">
            <div className="absolute top-0 right-0 p-10 opacity-10">
               <PieChart className="w-40 h-40" />
            </div>
            <div className="relative z-10 space-y-2">
               <div className="flex items-center gap-2 text-[#AF52DE]">
                  <Zap className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-[4px]">Liquid Capital Matrix</span>
               </div>
               <div className="text-6xl font-black tracking-tighter">₹{bankBalance.toLocaleString()}</div>
               <p className="text-gray-500 font-medium text-sm">System-wide verified balance.</p>
            </div>
            <div className="relative z-10 flex flex-col gap-2">
               <button 
                 onClick={() => {
                   const val = prompt("Enter new ledger balance:", bankBalance.toString());
                   if (val) updateBankBalance(Number(val));
                 }}
                 disabled={isUpdatingBalance}
                 className="px-8 py-4 bg-white text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-transform shadow-xl"
               >
                 Update Liquid
               </button>
            </div>
         </div>

         <div className="glass p-10 rounded-[3rem] border-white/5 flex flex-col justify-center gap-4">
            <div className="text-[10px] font-black uppercase tracking-[4px] text-gray-500">Active Liabilities</div>
            <div className="text-4xl font-black text-[#FF2D55]">₹{loans.reduce((acc, l) => acc + l.principal, 0).toLocaleString()}</div>
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium">
               <AlertTriangle className="w-3 h-3 text-[#FF2D55]" />
               Across {loans.length} active nodes
            </div>
         </div>
      </section>

      {/* Secondary Matrix: External Ledger */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="glass p-8 rounded-[2.5rem] border-white/5 flex items-center justify-between">
            <div className="space-y-1">
               <div className="text-[10px] font-black uppercase tracking-[3px] text-green-400/60">External Receivables</div>
               <div className="text-3xl font-black text-green-400 tracking-tighter">₹{externalMetrics.receivables.toLocaleString()}</div>
            </div>
            <TrendingUp className="w-8 h-8 text-green-400 opacity-20" />
         </div>
         <div className="glass p-8 rounded-[2.5rem] border-white/5 flex items-center justify-between">
            <div className="space-y-1">
               <div className="text-[10px] font-black uppercase tracking-[3px] text-[#FF2D55]/60">External Payables</div>
               <div className="text-3xl font-black text-[#FF2D55] tracking-tighter">₹{externalMetrics.payables.toLocaleString()}</div>
            </div>
            <TrendingDown className="w-8 h-8 text-[#FF2D55] opacity-20" />
         </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
           <h2 className="text-[12px] uppercase font-black tracking-[4px] text-gray-500">Recurring Commitments</h2>
           <button onClick={() => setShowAddRecurring(true)} className="p-3 bg-[#FF2D55]/10 rounded-xl text-[#FF2D55] hover:bg-[#FF2D55] hover:text-white transition-all"><Plus className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {recurring.map(pay => (
             <div key={pay.id} className="glass p-8 rounded-[2.5rem] border-white/5 space-y-4">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-[#FF2D55]/10 flex items-center justify-center text-[#FF2D55]"><Repeat className="w-5 h-5" /></div>
                   <div>
                      <h4 className="font-bold tracking-tight">{pay.title}</h4>
                      <p className="text-[9px] uppercase font-black text-gray-500 tracking-widest">{pay.frequency} • {pay.type}</p>
                   </div>
                </div>
                <div className="text-3xl font-black tracking-tighter">₹{pay.amount.toFixed(0)}</div>
             </div>
           ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
           <h2 className="text-[12px] uppercase font-black tracking-[4px] text-gray-500">Loan & Debt Protocols</h2>
           <button onClick={() => setShowAddLoan(true)} className="p-3 bg-white/5 rounded-xl text-white hover:bg-white/10 transition-all"><Plus className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           {loans.map(loan => (
             <div key={loan.id} className="glass p-10 rounded-[3rem] border-white/5 relative overflow-hidden group">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                   <div className="space-y-1">
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter">{loan.title}</h3>
                      <div className="flex items-center gap-4 text-[10px] uppercase font-black tracking-widest text-gray-500">
                         <span>Rate: {loan.interestRate}%</span>
                         <span>Term: {loan.tenureMonths}mo</span>
                      </div>
                   </div>
                   <div className="text-right">
                      <div className="text-sm text-gray-500 uppercase font-bold tracking-widest mb-1">Monthly EMI</div>
                      <div className="text-4xl font-black text-[#FF2D55] tracking-tighter">₹{loan.emi.toFixed(0)}</div>
                   </div>
                </div>
                
                <div className="mt-8 space-y-2 relative z-10">
                   <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2">
                      <span className="text-gray-500">Repayment Progress</span>
                      <span className="text-white">₹{loan.remainingAmount.toFixed(0)} Left</span>
                   </div>
                   <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-[#FF2D55]" style={{ width: `${((loan.principal - loan.remainingAmount) / loan.principal) * 100}%` }}></div>
                   </div>
                </div>
             </div>
           ))}
        </div>
      </section>

      {/* Modals for adding Loan and Recurring... */}
      <AnimatePresence>
        {showAddRecurring && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
             <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="glass p-10 rounded-[3rem] border-white/10 w-full max-w-md space-y-6">
                <h3 className="text-xl font-black uppercase tracking-tighter">Schedule Commitment</h3>
                <div className="space-y-4">
                  <input placeholder="Title" value={newRecurring.title} onChange={e => setNewRecurring({...newRecurring, title: e.target.value})} className="w-full bg-white/5 border-white/10 p-4 rounded-xl outline-none" />
                  <input type="number" placeholder="Amount" value={newRecurring.amount} onChange={e => setNewRecurring({...newRecurring, amount: Number(e.target.value)})} className="w-full bg-white/5 border-white/10 p-4 rounded-xl outline-none" />
                  <select value={newRecurring.frequency} onChange={e => setNewRecurring({...newRecurring, frequency: e.target.value as any})} className="w-full bg-[#1a1a1a] border border-white/10 p-4 rounded-xl outline-none">
                     <option value="weekly">Weekly</option>
                     <option value="monthly">Monthly</option>
                  </select>
                  <select value={newRecurring.type} onChange={e => setNewRecurring({...newRecurring, type: e.target.value as any})} className="w-full bg-[#1a1a1a] border border-white/10 p-4 rounded-xl outline-none">
                     <option value="subscription">Subscription</option>
                     <option value="emi">EMI</option>
                  </select>
                </div>
                <div className="flex gap-4">
                   <button onClick={() => setShowAddRecurring(false)} className="flex-1 py-4 bg-white/5 rounded-xl font-bold uppercase text-[10px]">Cancel</button>
                   <button onClick={handleAddRecurring} className="flex-1 py-4 bg-[#FF2D55] text-white rounded-xl font-black uppercase text-[10px]">Initialize</button>
                </div>
             </motion.div>
           </div>
        )}

        {showAddLoan && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
             <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="glass p-10 rounded-[3rem] border-white/10 w-full max-w-md space-y-6">
                <h3 className="text-xl font-black uppercase tracking-tighter">Register Debt Matrix</h3>
                <div className="space-y-4">
                  <input placeholder="Loan Title" value={newLoan.title} onChange={e => setNewLoan({...newLoan, title: e.target.value})} className="w-full bg-white/5 border-white/10 p-4 rounded-xl outline-none" />
                  <input type="number" placeholder="Principal (₹)" value={newLoan.principal} onChange={e => setNewLoan({...newLoan, principal: Number(e.target.value)})} className="w-full bg-white/5 border-white/10 p-4 rounded-xl outline-none" />
                  <input type="number" placeholder="Interest Rate (%)" value={newLoan.interestRate} onChange={e => setNewLoan({...newLoan, interestRate: Number(e.target.value)})} className="w-full bg-white/5 border-white/10 p-4 rounded-xl outline-none" />
                  <input type="number" placeholder="Tenure (Months)" value={newLoan.tenureMonths} onChange={e => setNewLoan({...newLoan, tenureMonths: Number(e.target.value)})} className="w-full bg-white/5 border-white/10 p-4 rounded-xl outline-none" />
                </div>
                <div className="flex gap-4">
                   <button onClick={() => setShowAddLoan(false)} className="flex-1 py-4 bg-white/5 rounded-xl font-bold uppercase text-[10px]">Dismiss</button>
                   <button onClick={handleAddLoan} className="flex-1 py-4 bg-white text-black rounded-xl font-black uppercase text-[10px]">Deploy Protocol</button>
                </div>
             </motion.div>
           </div>
        )}
      </AnimatePresence>
    </div>
  );
}
