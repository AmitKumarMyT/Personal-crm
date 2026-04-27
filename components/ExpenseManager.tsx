'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, Bot, Users, Receipt, TrendingUp, TrendingDown, 
  ChevronRight, Plus, X, Search, History, Calendar,
  Trash2, Edit3, AlertTriangle, ShieldCheck, Wallet, ArrowUpRight, ArrowDownLeft, CheckCircle2, UserPlus, Loader2, Download, Import, LayoutGrid
} from 'lucide-react';
import { useAuth } from '@/lib/firebase-provider';
import { interpretExpense } from '@/lib/ai';
import { 
  collection, addDoc, serverTimestamp, query, 
  orderBy, onSnapshot, where, getDocs, doc, updateDoc, 
  increment, writeBatch, limit, getDoc, Timestamp, deleteDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import FinancialIntel from './FinancialIntel';
import { checkAffordability, calculateDailyBudget } from '@/lib/finance';
import { downloadJson, parseJsonFile } from '@/lib/data-utils';

const GlassCard = ({ children, className = "", onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => (
  <div onClick={onClick} className={`glass p-6 ${className} ${onClick ? 'cursor-pointer hover:bg-white/[0.04] transition-all' : ''}`}>
    {children}
  </div>
);

export default function ExpenseManager() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'summary' | 'chat' | 'people' | 'history' | 'afford' | 'intel'>('summary');
  const [contacts, setContacts] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [bankBalance, setBankBalance] = useState<number>(0);
  const [expenseMessages, setExpenseMessages] = useState<any[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentDesc, setAdjustmentDesc] = useState('');
  const [pendingTx, setPendingTx] = useState<any | null>(null);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [affordPrice, setAffordPrice] = useState('');
  const [affordResult, setAffordResult] = useState<any | null>(null);
  const [processingStatus, setProcessingStatus] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const customApiKey = typeof window !== 'undefined' ? localStorage.getItem('HYPER_AI_GEMINI_KEY') || '' : '';

  useEffect(() => {
    if (!user) return;

    const contactsQuery = query(
      collection(db, 'users', user.uid, 'contacts'), 
      orderBy('name', 'asc')
    );
    const unsubscribeContacts = onSnapshot(contactsQuery, 
      (snap) => {
        setContacts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        if (err.code === 'cancelled' || err.code === 'unavailable') return;
        console.error("Contacts subscription error", err);
      }
    );

    const expensesQuery = query(
      collection(db, 'users', user.uid, 'expenses'), 
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    const unsubscribeExpenses = onSnapshot(expensesQuery, 
      (snap) => {
        setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        if (err.code === 'cancelled' || err.code === 'unavailable') return;
        console.error("Expenses subscription error", err);
      }
    );

    const chatQuery = query(
      collection(db, 'users', user.uid, 'expense_chats'),
      orderBy('timestamp', 'asc'),
      limit(50)
    );
    const unsubscribeChats = onSnapshot(chatQuery, 
      (snap) => {
        setExpenseMessages(snap.docs.map(d => d.data()));
      },
      (err) => {
        if (err.code === 'cancelled' || err.code === 'unavailable') return;
        console.error("Chat subscription error", err);
      }
    );

    const bankQuery = query(collection(db, 'users', user.uid, 'bank_balances'), limit(1));
    const unsubscribeBank = onSnapshot(bankQuery, (snap) => {
      if (!snap.empty) {
        setBankBalance(snap.docs[0].data().amount || 0);
      }
    });

    return () => {
      unsubscribeContacts();
      unsubscribeExpenses();
      unsubscribeChats();
      unsubscribeBank();
    };
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [expenseMessages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setChatInput(val);

    const lastAtPos = val.lastIndexOf('@');
    if (lastAtPos !== -1) {
      const search = val.slice(lastAtPos + 1);
      // Only show suggestions if we're currently typing a handle (no space after @)
      if (!search.includes(' ')) {
        const filtered = contacts.filter(c => 
          c.name.toLowerCase().includes(search.toLowerCase()) || 
          c.handle.toLowerCase().includes(search.toLowerCase())
        );
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        return;
      }
    }
    setShowSuggestions(false);
  };

  const applySuggestion = (contact: any) => {
    const lastAtPos = chatInput.lastIndexOf('@');
    const newVal = chatInput.slice(0, lastAtPos) + contact.handle + ' ';
    setChatInput(newVal);
    setShowSuggestions(false);
  };

  const addExpenseMessage = async (text: string, role: 'user' | 'ai') => {
    if (!user) return;
    await addDoc(collection(db, 'users', user.uid, 'expense_chats'), {
      userId: user.uid,
      text,
      role,
      timestamp: serverTimestamp()
    });
  };

  const handleAddPerson = async () => {
    if (!newPersonName.trim() || !user) return;
    const name = newPersonName.trim();
    const handle = `@${name.toLowerCase().replace(/\s/g, '')}`;
    
    await addDoc(collection(db, 'users', user.uid, 'contacts'), {
      userId: user.uid,
      name,
      handle,
      balance: 0,
      createdAt: serverTimestamp()
    });
    
    setNewPersonName('');
    setShowAddPerson(false);
  };

  const renderSummary = () => {
    const totalOwedMe = contacts.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
    const totalIOwe = contacts.reduce((sum, c) => sum + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
    const netExternal = totalOwedMe - totalIOwe;

    return (
      <div className="space-y-10 animate-fade-in relative z-10 pb-20">
        {/* Hero Matrix */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassCard className="md:col-span-2 bg-gradient-to-br from-[#FF2D55]/10 via-transparent to-transparent border-[#FF2D55]/20 p-10 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[4px] text-gray-500">Liquid Ecosystem Value</div>
              <div className="text-6xl font-black tracking-tighter text-white">
                ₹{(bankBalance + totalOwedMe - totalIOwe).toLocaleString()}
              </div>
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2 flex items-center gap-2">
                 <ShieldCheck className="w-3 h-3 text-[#FF2D55]" />
                 Includes ₹{bankBalance.toLocaleString()} Liquid Capital
              </div>
            </div>
            <div className="flex items-center gap-4 mt-8">
              <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-green-400" />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">₹{totalOwedMe.toLocaleString()} Receivables</span>
              </div>
              <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl flex items-center gap-2">
                <TrendingDown className="w-3 h-3 text-[#FF2D55]" />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">₹{totalIOwe.toLocaleString()} Payables</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="flex flex-col justify-between border-white/10">
             <div className="space-y-4">
               <div className="text-[10px] font-black uppercase tracking-[2px] text-gray-500">Core Engine Status</div>
               <div className="flex items-center gap-2">
                 <ShieldCheck className="w-5 h-5 text-green-400" />
                 <span className="text-sm font-bold text-white tracking-tight">Active Surveillance</span>
               </div>
               <div className="h-px bg-white/5 w-full" />
               <div className="flex items-center justify-between">
                 <span className="text-[10px] font-black text-gray-500 uppercase">Nodes</span>
                 <span className="text-xs font-black text-white">{contacts.length}</span>
               </div>
               <div className="flex items-center justify-between">
                 <span className="text-[10px] font-black text-gray-500 uppercase">Records</span>
                 <span className="text-xs font-black text-white">{expenses.length}</span>
               </div>
             </div>
             <button 
               onClick={() => setActiveTab('afford')}
               className="w-full py-4 mt-6 bg-white/5 border border-white/10 hover:bg-[#FF2D55]/10 hover:border-[#FF2D55]/30 rounded-2xl flex items-center justify-center gap-2 transition-all transition-colors"
             >
               <span className="text-[10px] font-black uppercase tracking-widest">Run Budget Audit</span>
             </button>
          </GlassCard>
        </section>

        {/* Dynamic Nodes Grid */}
        <section className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <motion.h3 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[12px] font-black uppercase tracking-[4px] text-gray-500"
            >
              High Impact Nodes
            </motion.h3>
            <button onClick={() => setActiveTab('people')} className="text-[10px] font-black uppercase tracking-widest text-[#FF2D55] hover:underline">View All Identities</button>
          </div>
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={{
              show: { transition: { staggerChildren: 0.1 } }
            }}
            initial="hidden"
            animate="show"
          >
            {contacts.filter(c => c.balance !== 0).slice(0, 3).map(contact => (
              <motion.div
                key={contact.id}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  show: { opacity: 1, y: 0 }
                }}
              >
                <GlassCard 
                  onClick={() => setSelectedPerson(contact)}
                  className={`group border-l-4 ${contact.balance > 0 ? 'border-l-green-500/50' : 'border-l-[#FF2D55]/50'}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-black tracking-tight group-hover:text-[#FF2D55] transition-colors">{contact.name}</div>
                      <div className="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-0.5">{contact.handle}</div>
                    </div>
                    <div className={`text-lg font-black tracking-tighter ${contact.balance > 0 ? 'text-green-400' : 'text-[#FF2D55]'}`}>
                      ₹{Math.abs(contact.balance).toLocaleString()}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Global Feed Preview */}
        <section className="space-y-6">
           <div className="flex items-center justify-between px-2">
              <motion.h3 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[12px] font-black uppercase tracking-[4px] text-gray-500"
              >
                Recent Stream
              </motion.h3>
              <button onClick={() => setActiveTab('history')} className="text-[10px] font-black uppercase tracking-widest text-[#FF2D55] hover:underline">Full Logbook</button>
           </div>
           <motion.div 
             className="space-y-4"
             variants={{
               show: { transition: { staggerChildren: 0.1, delayChildren: 0.3 } }
             }}
             initial="hidden"
             animate="show"
           >
              {expenses.slice(0, 5).map(ex => (
                <motion.div
                  key={ex.id}
                  variants={{
                    hidden: { opacity: 0, x: -20 },
                    show: { opacity: 1, x: 0 }
                  }}
                  className="glass p-6 rounded-3xl border-white/5 flex items-center justify-between hover:bg-white/[0.03] transition-all cursor-pointer" 
                  onClick={() => setEditingExpense(ex)}
                >
                   <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-xl ${ex.type === 'owed' ? 'bg-green-500/10 text-green-400' : 'bg-[#FF2D55]/10 text-[#FF2D55]'}`}>
                         {ex.type === 'owed' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                      </div>
                      <div>
                         <div className="text-sm font-bold tracking-tight">{ex.description}</div>
                         <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest">{new Date(ex.timestamp?.toDate?.() || 0).toLocaleDateString()}</div>
                      </div>
                   </div>
                   <div className={`text-sm font-black ${ex.type === 'owed' ? 'text-green-400' : 'text-[#FF2D55]'}`}>
                     {ex.type === 'owed' ? '+' : '-'}{ex.myShare.toLocaleString()}
                   </div>
                </motion.div>
              ))}
           </motion.div>
        </section>
      </div>
    );
  };


  const processTransaction = async (txData: any, newContactHandles: string[] = []) => {
    if (!user) return;
    setIsAiProcessing(true);
    setProcessingStatus('Calibrating Split Ledger...');
    
    try {
      const batch = writeBatch(db);
      const total = txData.totalAmount;
      const isMePayer = txData.payer === 'me';

      // Update bank balance if 'me' paid
      if (isMePayer) {
        const bQuery = query(collection(db, 'users', user.uid, 'bank_balances'), limit(1));
        const bSnap = await getDocs(bQuery);
        if (!bSnap.empty) {
          const bRef = doc(db, 'users', user.uid, 'bank_balances', bSnap.docs[0].id);
          batch.update(bRef, {
            amount: increment(-total),
            updatedAt: serverTimestamp()
          });
        }
      }
      
      // Calculate shares based on weights if provided, otherwise equal split
      const getShareFor = (handle: string) => {
        const handles = txData.involvedMembers || [];
        if (handles.length === 0) return 0;

        if (txData.splitWeights) {
          const weights = txData.splitWeights;
          const totalWeight = handles.reduce((acc: number, h: string) => acc + (Number(weights[h]) || 1), 0);
          const myWeight = Number(weights[handle]) || 1;
          return totalWeight > 0 ? (total * myWeight) / totalWeight : 0;
        }
        return total / handles.length;
      };
      
      let updatedCount = 0;
      
      // First, handle any new contacts that need to be created
      const newbornContacts: Record<string, string> = {};
      for (const handle of newContactHandles) {
        setProcessingStatus(`Initializing identity protocol: ${handle}`);
        const contactRef = doc(collection(db, 'users', user.uid, 'contacts'));
        const name = handle.replace('@', '');
        batch.set(contactRef, {
          userId: user.uid,
          name: name.charAt(0).toUpperCase() + name.slice(1),
          handle: handle.toLowerCase(),
          balance: 0,
          createdAt: serverTimestamp()
        });
        newbornContacts[handle.toLowerCase()] = contactRef.id;
      }

      // Now process splits
      for (const handle of txData.involvedMembers) {
        setProcessingStatus(`Stabilizing balances for node: ${handle}`);
        if (handle.toLowerCase() === 'me') continue;
        
        let contactId = '';
        let contactHandle = '';
        const existing = contacts.find(c => c.handle?.toLowerCase() === handle.toLowerCase());
        
        if (existing) {
          contactId = existing.id;
          contactHandle = existing.handle;
        } else if (newbornContacts[handle.toLowerCase()]) {
          contactId = newbornContacts[handle.toLowerCase()];
          contactHandle = handle.toLowerCase();
        }

        if (!contactId) continue;

        let myShare = 0;
        let txType: 'owe' | 'owed' = 'owe';

        if (isMePayer) {
          myShare = getShareFor(handle);
          txType = 'owed';
        } else if (txData.payer.toLowerCase() === contactHandle.toLowerCase()) {
          const isMeInvolved = txData.involvedMembers.some((h: string) => h.toLowerCase() === 'me');
          if (isMeInvolved) {
            myShare = getShareFor('me');
            txType = 'owe';
          } else {
            continue; 
          }
        } else {
          continue; 
        }

        const expenseRef = doc(collection(db, 'users', user.uid, 'expenses'));
        batch.set(expenseRef, {
          userId: user.uid,
          description: txData.description || 'Split Expense',
          amount: total,
          payer: txData.payer,
          involved: txData.involvedMembers,
          personId: contactId,
          myShare: myShare,
          type: txType,
          timestamp: serverTimestamp()
        });

        const contactRef = doc(db, 'users', user.uid, 'contacts', contactId);
        batch.update(contactRef, {
          balance: increment(txType === 'owed' ? myShare : -myShare)
        });
        updatedCount++;
      }

      setProcessingStatus('Syncing with distributed cloud ledger...');
      await batch.commit();
      await addExpenseMessage(`${txData.description} recorded for ${updatedCount} contacts.`, 'ai');
    } catch (err) {
      console.error("Transaction Error:", err);
      await addExpenseMessage("Protocol failure during ledger sync. Check connectivity.", 'ai');
    } finally {
      setPendingTx(null);
      setIsAiProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !user) return;
    const msg = chatInput;
    setChatInput('');
    setIsAiProcessing(true);
    setProcessingStatus('Consulting AI Core for interpretation...');
    await addExpenseMessage(msg, 'user');

    try {
      const result = await interpretExpense(user.uid, msg, contacts, customApiKey);
      setProcessingStatus('Auditing transaction intent...');
      
      if (result.intent === 'transaction') {
        // Check for unknown handles
        const unknownHandles = result.involvedMembers.filter((h: string) => {
          if (h.toLowerCase() === 'me') return false;
          return !contacts.some(c => c.handle?.toLowerCase() === h.toLowerCase());
        });

        if (unknownHandles.length > 0) {
          setPendingTx({ ...result, unknownHandles });
          await addExpenseMessage(`I detected unfamiliar identities: ${unknownHandles.join(', ')}. Should I create them and record this expense?`, 'ai');
        } else {
          await processTransaction(result);
        }
      } else if (result.intent === 'matrix_update' && result.matrixData) {
        setProcessingStatus('Syncing liquid matrix with core database...');
        if (result.matrixData.type === 'bank_balance' && result.matrixData.amount !== undefined) {
          const bQuery = query(collection(db, 'users', user.uid, 'bank_balances'), limit(1));
          const snap = await getDocs(bQuery);
          
          if (snap.empty) {
            await addDoc(collection(db, 'users', user.uid, 'bank_balances'), {
              amount: result.matrixData.amount,
              userId: user.uid,
              updatedAt: serverTimestamp()
            });
          } else {
            await updateDoc(doc(db, 'users', user.uid, 'bank_balances', snap.docs[0].id), {
              amount: result.matrixData.amount,
              updatedAt: serverTimestamp()
            });
          }
          await addExpenseMessage(`Liquid Capital Matrix recalibrated to ₹${result.matrixData.amount.toLocaleString()}.`, 'ai');
        } else {
           await addExpenseMessage("I detected a matrix update intent but the data node was incomplete.", 'ai');
        }
      } else {
        await addExpenseMessage("I couldn't quite understand if that was a transaction or matrix update. Use @mentions for clarity.", 'ai');
      }
    } catch (err) {
      console.error(err);
      await addExpenseMessage("Protocol error during interpretation.", 'ai');
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleDeleteExpense = async (expense: any) => {
    if (!user || !expense.id) return;
    if (!confirm('Are you sure you want to delete this recorded transaction? Balances will be adjusted.')) return;

    try {
      const batch = writeBatch(db);
      
      // Reverse balance
      if (expense.personId) {
        const contactRef = doc(db, 'users', user.uid, 'contacts', expense.personId);
        batch.update(contactRef, {
          balance: increment(expense.type === 'owed' ? -expense.myShare : expense.myShare)
        });
      }

      // Delete the expense
      const expenseRef = doc(db, 'users', user.uid, 'expenses', expense.id);
      batch.delete(expenseRef);

      await batch.commit();
      await addExpenseMessage(`Transaction "${expense.description}" deleted and balances adjusted.`, 'ai');
    } catch (err) {
      console.error("Error deleting expense:", err);
      alert("Failed to delete transaction.");
    }
  };

  const handleUpdateExpense = async () => {
    if (!user || !editingExpense) return;
    
    try {
      const batch = writeBatch(db);
      const expenseRef = doc(db, 'users', user.uid, 'expenses', editingExpense.id);
      
      const originalExpense = expenses.find(e => e.id === editingExpense.id);
      if (!originalExpense) throw new Error("Original record not found");

      batch.update(expenseRef, {
        description: editingExpense.description,
        myShare: Number(editingExpense.myShare),
        updatedAt: serverTimestamp()
      });

      if (originalExpense.myShare !== Number(editingExpense.myShare)) {
        const personRef = doc(db, 'users', user.uid, 'contacts', editingExpense.personId);
        const diff = Number(editingExpense.myShare) - originalExpense.myShare;
        const balanceChange = editingExpense.type === 'owed' ? diff : -diff;
        
        batch.update(personRef, {
          balance: increment(balanceChange)
        });
      }

      await batch.commit();
      setEditingExpense(null);
      await addExpenseMessage(`Protocol updated. Transaction recalibrated to ₹${editingExpense.myShare}.`, 'ai');
    } catch (err) {
      console.error("Error updating expense:", err);
      alert("Failed to patch data.");
    }
  };

  const handleManualAction = async (amount: number, type: 'owe' | 'owed', desc: string, isSettlement: boolean = false) => {
    if (!user || !selectedPerson) return;
    
    const batch = writeBatch(db);
    const expenseRef = doc(collection(db, 'users', user.uid, 'expenses'));
    batch.set(expenseRef, {
      userId: user.uid,
      description: isSettlement ? `Settlement: ${desc}` : desc,
      amount: amount,
      payer: type === 'owed' ? 'me' : selectedPerson.handle,
      involved: ['me', selectedPerson.handle],
      personId: selectedPerson.id,
      myShare: amount,
      type: type,
      timestamp: serverTimestamp(),
      isSettlement
    });

    const contactRef = doc(db, 'users', user.uid, 'contacts', selectedPerson.id);
    batch.update(contactRef, {
      balance: increment(type === 'owed' ? amount : -amount)
    });

    // Update bank balance: 
    // If I Owe Him (type === 'owe'), and I'm paying him, bank balance decreases.
    // If He Owes Me (type === 'owed'), and he's paying me, bank balance increases.
    // Assuming manual adjustments are usually settlements/direct payments.
    const bQuery = query(collection(db, 'users', user.uid, 'bank_balances'), limit(1));
    const bSnap = await getDocs(bQuery);
    if (!bSnap.empty) {
      const bRef = doc(db, 'users', user.uid, 'bank_balances', bSnap.docs[0].id);
      batch.update(bRef, {
        amount: increment(type === 'owe' ? -amount : amount),
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
    setAdjustmentAmount('');
    setAdjustmentDesc('');
    setSelectedPerson(null); // Return to ledger
  };

  const settleAll = async () => {
    if (!selectedPerson) return;
    const balance = selectedPerson.balance;
    if (balance === 0) return;
    
    const amount = Math.abs(balance);
    const type = balance > 0 ? 'owe' : 'owed'; // If he owes me (bal > 0), payment received is 'owe' from my perspective (he paid me)
    // Wait, let's be careful:
    // If balance > 0, he owes me. Settlement: I received money. It acts as if HE paid ME.
    // In my expenses, if HE paid ME, my share is $(amount), type is 'owe' (decreases original 'owed' balance).
    
    const txType = balance > 0 ? 'owe' : 'owed';
    await handleManualAction(amount, txType, "Settled full balance", true);
  };

  const renderPeople = () => {
    const totalOwedMe = contacts.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
    const totalIOwe = contacts.reduce((sum, c) => sum + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
    
    const filteredContacts = contacts.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.handle.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="space-y-8 relative z-10 pb-20">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch"
        >
          <GlassCard className="flex-1 border-green-500/20 bg-green-500/[0.02] flex items-center justify-between p-8 rounded-[2.5rem]">
            <div>
              <div className="text-[10px] uppercase font-black tracking-widest text-green-400/60 mb-1">Receivables</div>
              <div className="text-3xl font-black tracking-tighter text-green-400">₹{totalOwedMe.toLocaleString()}</div>
            </div>
            <div className="p-4 bg-green-500/10 rounded-2xl">
              <TrendingUp className="w-8 h-8 text-green-400" />
            </div>
          </GlassCard>
          <GlassCard className="flex-1 border-[#FF2D55]/20 bg-[#FF2D55]/0.02 flex items-center justify-between p-8 rounded-[2.5rem]">
            <div>
              <div className="text-[10px] uppercase font-black tracking-widest text-[#FF2D55]/60 mb-1">Payables</div>
              <div className="text-3xl font-black tracking-tighter text-[#FF2D55]">₹{totalIOwe.toLocaleString()}</div>
            </div>
            <div className="p-4 bg-[#FF2D55]/10 rounded-2xl">
              <TrendingDown className="w-8 h-8 text-[#FF2D55]" />
            </div>
          </GlassCard>
        </motion.div>

        <div className="sticky top-0 md:relative z-20 py-2 bg-[#050505]/80 backdrop-blur-md rounded-2xl">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-[#FF2D55] transition-colors" />
              <input 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search protocol or handle..."
                className="w-full bg-white/5 border border-white/5 rounded-2xl pl-14 pr-6 py-5 text-sm focus:outline-none focus:border-[#FF2D55]/30 transition-all font-bold placeholder:text-gray-700"
              />
            </div>
            <button 
              onClick={() => setShowAddPerson(true)}
              className="w-full md:w-auto px-8 py-5 bg-[#FF2D55] text-white rounded-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest shadow-[0_4px_30px_rgba(255,45,85,0.3)]"
            >
              <UserPlus className="w-4 h-4" /> Initialize Entry
            </button>
          </div>
        </div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={{
            show: { transition: { staggerChildren: 0.05 } }
          }}
          initial="hidden"
          animate="show"
        >
          <AnimatePresence mode="popLayout">
            {filteredContacts.map((contact) => (
              <motion.div
                layout
                key={contact.id}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  show: { opacity: 1, y: 0 }
                }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <GlassCard 
                  onClick={() => setSelectedPerson(contact)} 
                  className={`flex flex-col gap-4 group hover:border-[#FF2D55]/30 transition-all cursor-pointer ${contact.balance !== 0 ? 'bg-white/[0.04]' : 'opacity-40'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl border transition-all ${contact.balance > 0 ? 'bg-green-500/10 border-green-500/20 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : contact.balance < 0 ? 'bg-[#FF2D55]/10 border-[#FF2D55]/20 text-[#FF2D55] shadow-[0_0_15px_rgba(255,45,85,0.1)]' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                        {contact.name[0]}
                      </div>
                      <div>
                        <div className="font-bold text-[15px] group-hover:text-white transition-colors">{contact.name}</div>
                        <div className="text-[9px] text-gray-500 uppercase tracking-widest font-black">{contact.handle}</div>
                      </div>
                    </div>
                    <div className={`text-right ${contact.balance > 0 ? 'text-green-400' : contact.balance < 0 ? 'text-[#FF2D55]' : 'text-gray-500'}`}>
                      <div className="text-xl font-black tracking-tighter leading-none">
                        ₹{Math.abs(contact.balance).toFixed(0)}
                      </div>
                      <div className="text-[8px] uppercase tracking-widest font-black opacity-60">
                        {contact.balance > 0 ? 'RECEIVABLE' : contact.balance < 0 ? 'PAYABLE' : 'CLEAR'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="flex gap-1.5 items-center">
                      <div className={`w-1.5 h-1.5 rounded-full ${contact.balance !== 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-700'}`} />
                      <span className="text-[8px] font-black uppercase tracking-widest text-gray-600">Active Node</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-[#FF2D55] group-hover:translate-x-1 transition-all" />
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  };

  const renderProfile = () => {
    const personExpenses = expenses.filter(e => e.personId === selectedPerson?.id);
    
    const totalOut = personExpenses.filter(e => e.type === 'owed').reduce((s, e) => s + e.myShare, 0);
    const totalIn = personExpenses.filter(e => e.type === 'owe' && !e.isSettlement).reduce((s, e) => s + e.myShare, 0);

    const grouped = personExpenses.reduce((acc: any, ex: any) => {
      const date = new Date(ex.timestamp?.toDate?.() || 0).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(ex);
      return acc;
    }, {});

    return (
      <div className="animate-fade-in space-y-12 lg:px-12 pb-40 pt-6">
        <div className="flex items-center justify-between px-4">
          <button onClick={() => setSelectedPerson(null)} className="text-[10px] text-gray-500 hover:text-[#FF2D55] flex items-center gap-2 uppercase tracking-widest font-black group px-6 py-3 bg-white/5 rounded-2xl transition-all border border-transparent hover:border-[#FF2D55]/30">
            <ArrowDownLeft className="w-3 h-3 rotate-45" /> Back to Protocol
          </button>
          <div className="text-[10px] uppercase font-black tracking-widest text-[#FF2D55] animate-pulse">Live Status: {selectedPerson.balance === 0 ? 'Synchronized' : 'Desynced'}</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="flex flex-col items-center text-center p-8 glass rounded-[2.5rem] border-[#FF2D55]/10 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-[#FF2D55]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center text-4xl font-black border-2 transition-all relative z-10 shadow-[0_10px_30px_rgba(0,0,0,0.5)] ${selectedPerson.balance > 0 ? 'bg-green-500/10 border-green-500/30 text-green-400' : selectedPerson.balance < 0 ? 'bg-[#FF2D55]/10 border-[#FF2D55]/30 text-[#FF2D55]' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                {selectedPerson.name[0]}
              </div>
              <div className="mt-6 space-y-1 relative z-10">
                <h2 className="text-3xl font-heading font-black tracking-tighter leading-tight">{selectedPerson.name}</h2>
                <div className="px-3 py-1 bg-white/5 rounded-full inline-block border border-white/5 text-[#FF2D55] font-mono text-[10px] font-black uppercase tracking-widest">
                  {selectedPerson.handle}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <GlassCard className={`text-center py-8 relative overflow-hidden ${selectedPerson.balance > 0 ? 'border-green-500/30 bg-green-500/5' : selectedPerson.balance < 0 ? 'border-[#FF2D55]/30 bg-[#FF2D55]/5' : 'border-white/10'}`}>
                 <div className="text-[10px] text-gray-500 uppercase tracking-[3px] mb-2 font-black relative z-10">Net Balance</div>
                 <div className={`text-4xl font-black tracking-tighter relative z-10 ${selectedPerson.balance > 0 ? 'text-green-400' : selectedPerson.balance < 0 ? 'text-[#FF2D55]' : 'text-gray-400'}`}>
                   ₹{Math.abs(selectedPerson.balance).toFixed(0)}
                 </div>
                 <div className="text-[10px] uppercase font-black tracking-widest opacity-60 mt-2 relative z-10">
                   {selectedPerson.balance > 0 ? 'He owes you' : selectedPerson.balance < 0 ? 'You owe him' : 'Protocol Safe'}
                 </div>
              </GlassCard>

              {selectedPerson.balance !== 0 && (
                <button 
                  onClick={settleAll}
                  className="w-full py-4 bg-[#FF2D55] hover:scale-[1.02] active:scale-95 text-white border border-[#FF2D55]/20 rounded-2xl text-[10px] font-black uppercase tracking-[3px] flex items-center justify-center gap-2 transition-all shadow-[0_4px_20px_rgba(255,45,85,0.4)]"
                >
                  <CheckCircle2 className="w-4 h-4" /> Full Settlement
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
               <div className="glass p-4 rounded-3xl border-white/5 text-center">
                 <div className="text-[8px] uppercase font-black tracking-widest text-gray-500 mb-1">Inflow</div>
                 <div className="text-white text-lg font-black tracking-tighter">₹{totalIn.toFixed(0)}</div>
               </div>
               <div className="glass p-4 rounded-3xl border-white/5 text-center">
                 <div className="text-[8px] uppercase font-black tracking-widest text-gray-500 mb-1">Outflow</div>
                 <div className="text-white text-lg font-black tracking-tighter">₹{totalOut.toFixed(0)}</div>
               </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-[10px] font-black uppercase tracking-[3px] text-[#FF2D55]">Transaction Stream</h3>
                  <div className="p-1 px-3 bg-white/5 border border-white/5 rounded-full text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                    {personExpenses.length} Records
                  </div>
                </div>
                
                <motion.div 
                  className="space-y-10 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar"
                  variants={{
                    show: { transition: { staggerChildren: 0.1 } }
                  }}
                  initial="hidden"
                  animate="show"
                >
                  {Object.keys(grouped).length > 0 ? Object.keys(grouped).map(date => (
                    <motion.div 
                      key={date} 
                      className="relative"
                      variants={{
                        hidden: { opacity: 0, x: -10 },
                        show: { opacity: 1, x: 0 }
                      }}
                    >
                      <div className="sticky top-0 z-10 py-3 bg-[#0a0a0a]/80 backdrop-blur-sm mb-6">
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] text-[#FF2D55] bg-[#FF2D55]/10 px-4 py-1.5 rounded-full uppercase tracking-widest font-black leading-none">{date}</span>
                          <div className="h-px flex-1 bg-gradient-to-r from-[#FF2D55]/30 to-transparent"></div>
                        </div>
                      </div>
                      <div className="space-y-5 pl-6 border-l border-white/5 ml-3">
                        {grouped[date].map((ex: any) => (
                          <div 
                            key={ex.id} 
                            onClick={() => setEditingExpense(ex)}
                            className={`flex items-center justify-between p-6 bg-white/[0.03] border-l-2 rounded-r-[2rem] transition-all hover:bg-white/[0.06] cursor-pointer group/stream ${ex.isSettlement ? 'border-white/40' : ex.type === 'owed' ? 'border-green-500/40' : 'border-[#FF2D55]/40'}`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover/stream:scale-105 ${ex.type === 'owed' ? 'bg-green-500/10 text-green-400' : 'bg-[#FF2D55]/10 text-[#FF2D55]'}`}>
                                {ex.type === 'owed' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                              </div>
                              <div>
                                <div className="text-[15px] font-bold tracking-tight group-hover/stream:text-white transition-colors">{ex.description}</div>
                                <div className="text-[8px] text-gray-500 uppercase tracking-widest font-black opacity-60">
                                  {ex.isSettlement ? 'Audit Signal' : `Splits • ${ex.payer === 'me' ? 'Handled by you' : 'Handled by '+ex.payer}`}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-6">
                               <div className={`text-lg font-black tracking-tighter ${ex.type === 'owed' ? 'text-green-400' : 'text-[#FF2D55]'}`}>
                                 {ex.type === 'owed' ? '+' : '-'}{ex.myShare.toFixed(0)}
                               </div>
                               <button 
                                 onClick={(e) => { e.stopPropagation(); handleDeleteExpense(ex); }}
                                 className="opacity-0 group-hover/stream:opacity-100 p-2 hover:bg-red-500/10 rounded-xl text-gray-500 hover:text-[#FF2D55] transition-all"
                               >
                                 <Trash2 className="w-4 h-4" />
                               </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )) : (
                    <div className="text-center py-20 glass rounded-[3rem] border-dashed border-white/10 opacity-30 italic text-[10px] uppercase font-black tracking-widest">
                      Ledger is Empty
                    </div>
                  )}
                </motion.div>
              </div>

              <div className="space-y-6 lg:sticky lg:top-8">
                 <h3 className="text-[10px] font-black uppercase tracking-[3px] text-[#FF2D55] px-2">Manual Override</h3>
                 <GlassCard className="border-[#FF2D55]/10 bg-white/[0.02] p-8 rounded-[3rem]">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[9px] uppercase font-black tracking-widest text-[#FF2D55] ml-1">Quantum (₹)</label>
                        <div className="relative">
                          <input 
                            type="number"
                            value={adjustmentAmount}
                            onChange={(e) => setAdjustmentAmount(e.target.value)}
                            placeholder="0"
                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-2xl font-black text-white focus:outline-none focus:border-[#FF2D55]/50 transition-all placeholder:text-gray-800"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] uppercase font-black tracking-widest text-gray-500 ml-1">Purpose / Note</label>
                        <input 
                          value={adjustmentDesc}
                          onChange={(e) => setAdjustmentDesc(e.target.value)}
                          placeholder="e.g. UPI, Pizza, Correction"
                          className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-sm font-medium focus:outline-none focus:border-[#FF2D55]/50 transition-all placeholder:text-gray-700"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <button 
                          onClick={() => handleManualAction(Number(adjustmentAmount), 'owed', adjustmentDesc)}
                          className="py-5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-green-500/25 transition-all shadow-lg active:scale-95"
                        >
                          He Owes Me
                        </button>
                        <button 
                          onClick={() => handleManualAction(Number(adjustmentAmount), 'owe', adjustmentDesc)}
                          className="py-5 bg-[#FF2D55]/10 text-[#FF2D55] border border-[#FF2D55]/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#FF2D55]/25 transition-all shadow-lg active:scale-95"
                        >
                          I Owe Him
                        </button>
                      </div>

                      <div className="flex gap-2 justify-center pt-2">
                        {[100, 500, 1000].map(val => (
                          <button 
                            key={val}
                            onClick={() => setAdjustmentAmount(val.toString())}
                            className="px-4 py-2 bg-white/5 hover:bg-white/20 rounded-xl text-[10px] font-black text-gray-400 transition-all border border-white/5 hover:text-[#FF2D55] hover:border-[#FF2D55]/30"
                          >
                            +₹{val}
                          </button>
                        ))}
                      </div>
                    </div>
                 </GlassCard>

                 <div className="p-8 bg-[#FF2D55]/5 border border-dashed border-[#FF2D55]/20 rounded-[3rem] space-y-4 shadow-xl">
                   <div className="flex items-center gap-3 text-[#FF2D55]">
                     <div className="w-8 h-8 rounded-full bg-[#FF2D55]/10 flex items-center justify-center animate-pulse">
                        <Bot className="w-4 h-4" />
                     </div>
                     <span className="text-[10px] font-black uppercase tracking-widest">Protocol Guard</span>
                   </div>
                   <p className="text-[10px] text-gray-500 leading-relaxed font-bold italic opacity-80">
                     &quot;Manual overrides bypass the NLP processing layer. Use this for instant adjustments or UPI confirmations.&quot;
                   </p>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleCheckAffordability = () => {
    const price = Number(affordPrice);
    if (!price) return;
    setAffordResult(checkAffordability(price, 1500));
  };

  const menuItems = [
    { id: 'chat', label: 'Matrix', icon: Bot },
    { id: 'people', label: 'People', icon: Users },
    { id: 'history', label: 'Logbook', icon: History },
    { id: 'afford', label: 'Affordability', icon: ShieldCheck }
  ];

  const renderAffordability = () => (
    <div className="h-full flex items-center justify-center animate-fade-in px-4">
      <div className="glass p-12 rounded-[3rem] border-white/5 w-full max-w-lg space-y-8 text-center bg-gradient-to-br from-[#FF2D55]/5 to-transparent shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-[#FF2D55]/10 flex items-center justify-center mx-auto text-[#FF2D55] border border-[#FF2D55]/20">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tighter italic uppercase">Affordability Audit</h2>
          <p className="text-gray-500 text-sm font-medium">Verify financial impact before asset allocation.</p>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-black">₹</span>
            <input 
              type="number"
              placeholder="Asset Valuation"
              value={affordPrice}
              onChange={e => setAffordPrice(e.target.value)}
              className="w-full bg-black/40 border border-white/10 p-5 pl-10 rounded-2xl text-2xl font-black outline-none focus:border-[#FF2D55]/50 transition-all"
            />
          </div>
          <button 
            onClick={handleCheckAffordability}
            className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase text-[12px] tracking-[4px] shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
          >
            Run Audit Logic
          </button>
        </div>

        {affordResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`p-8 rounded-[2rem] border-2 space-y-2 mt-4 text-left ${
              affordResult.decision === 'Critical' ? 'bg-red-500/10 border-red-500/30' :
              affordResult.decision === 'High Impact' ? 'bg-orange-500/10 border-orange-500/30' :
              'bg-green-500/10 border-green-500/30'
            }`}
          >
            <div className="text-[10px] font-black uppercase tracking-[3px] text-gray-500">Protocol Decision</div>
            <div className="text-2xl font-black tracking-tight">{affordResult.decision}</div>
            <p className="text-sm text-gray-400 mt-2 font-medium leading-relaxed">{affordResult.advice}</p>
          </motion.div>
        )}
      </div>
    </div>
  );

  const renderChat = () => (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-200px)] relative z-10 lg:px-4">
       <div className="flex-1 overflow-y-auto space-y-6 pb-20 pr-2 custom-scrollbar flex flex-col pt-4 scroll-smooth">
          {expenseMessages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-60">
              <div className="w-24 h-24 bg-white/[0.03] rounded-[40px] flex items-center justify-center border border-white/5 rotate-12 mb-6">
                <Wallet className="w-10 h-10 text-[#FF2D55] -rotate-12" />
              </div>
              <div className="space-y-3 max-w-sm">
                <h3 className="text-2xl font-heading font-black tracking-tighter uppercase">Expense Engine</h3>
                <p className="text-sm text-gray-500 italic">
                  &quot;I paid 1200 for @deepak @ankur&quot;<br/>
                  &quot;@deepak paid for me&quot;
                </p>
              </div>
            </div>
          ) : (
            expenseMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-4 rounded-2xl max-w-[80%] text-sm font-medium ${m.role === 'user' ? 'bg-[#FF2D55] text-white shadow-[0_4px_15px_rgba(255,45,85,0.3)]' : 'bg-white/[0.05] border border-white/5 text-gray-300'}`}>
                  {m.text}
                  
                  {/* Pending Transaction Confirmation UI */}
                  {i === expenseMessages.length - 1 && m.role === 'ai' && pendingTx && (
                    <div className="mt-4 flex gap-2">
                      <button 
                        onClick={() => processTransaction(pendingTx, pendingTx.unknownHandles)}
                        className="px-4 py-2 bg-[#FF2D55] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(255,45,85,0.4)]"
                      >
                        Yes, Proceed
                      </button>
                      <button 
                        onClick={() => {
                          setPendingTx(null);
                          addExpenseMessage("Transaction aborted.", 'ai');
                        }}
                        className="px-4 py-2 bg-white/5 text-gray-400 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={scrollRef} />
       </div>

       <div className="mt-4 flex flex-col gap-4 relative">
         <AnimatePresence>
           {showSuggestions && (
             <motion.div 
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 10 }}
               className="absolute bottom-full left-0 right-0 mb-4 bg-[#0a0a0a] border border-[#FF2D55]/30 rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_20px_rgba(255,45,85,0.1)] z-[100] backdrop-blur-xl"
             >
                <div className="p-3 text-[10px] uppercase font-black tracking-widest text-[#FF2D55] border-b border-white/5 bg-white/[0.02]">
                  <span>Suggestions Protocol</span>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {suggestions.map(c => (
                    <button 
                      key={c.id} 
                      onClick={() => applySuggestion(c)}
                      className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-all border-b border-white/[0.02] last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-bold text-xs">{c.name[0]}</div>
                        <span className="font-bold text-sm tracking-tight">{c.name}</span>
                      </div>
                      <span className="text-[#FF2D55] font-mono text-[10px]">{c.handle}</span>
                    </button>
                  ))}
                </div>
             </motion.div>
           )}
         </AnimatePresence>

         <AnimatePresence>
           {isAiProcessing && (
             <motion.div 
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 10 }}
               className="flex items-center justify-center gap-2 text-[10px] text-[#FF2D55] font-black uppercase tracking-[2px]"
             >
               <Loader2 className="w-3 h-3 animate-spin" /> {processingStatus || 'Calibrating Split Ledger'}
             </motion.div>
           )}
         </AnimatePresence>

         <div className="relative">
            <input 
              value={chatInput}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !showSuggestions) handleSendChat();
                if (e.key === 'Escape') setShowSuggestions(false);
              }}
              placeholder="Deploy transaction command... (use @)"
              className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-5 focus:outline-none focus:border-[#FF2D55]/50 transition-all text-sm font-medium pr-16"
            />
            <button 
              onClick={handleSendChat}
              disabled={isAiProcessing}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:scale-110 transition-transform text-[#FF2D55] disabled:opacity-30"
            >
              <ArrowUpRight className="w-6 h-6" />
            </button>
         </div>
       </div>
    </div>
  );

  const handleExportData = () => {
    downloadJson({
      version: "1.0",
      expenses,
      contacts
    }, `hyper-finance-export-${new Date().toISOString().split('T')[0]}.json`);
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !user) return;
    try {
      const data = await parseJsonFile(e.target.files[0]);
      if (data.version !== "1.0") throw new Error("Unsupported version");
      
      const batch = writeBatch(db);
      for (const ex of (data.expenses || [])) {
        const ref = doc(collection(db, 'users', user.uid, 'expenses'));
        batch.set(ref, { 
          ...ex, 
          userId: user.uid, 
          timestamp: serverTimestamp(), 
          id: undefined,
          date: undefined // Remove client-side date helper if present
        });
      }
      await batch.commit();
      alert("Import Protocol Complete");
    } catch (err: any) {
      alert(`Import Failed: ${err.message}`);
    }
  };

  const navigation = [
    { id: 'summary', icon: LayoutGrid, label: 'Summary' },
    { id: 'chat', label: 'Matrix', icon: Bot },
    { id: 'people', icon: Users, label: 'People' },
    { id: 'history', icon: History, label: 'History' },
    { id: 'intel', icon: TrendingUp, label: 'Intel' },
    { id: 'afford', icon: ShieldCheck, label: 'Afford' }
  ] as const;

  return (
    <div className="flex flex-col h-screen bg-[#050505] overflow-hidden">
      {/* Module Navigation Header */}
      {!selectedPerson && (
        <header className="sticky top-0 z-50 bg-[#050505]/80 backdrop-blur-md border-b border-white/5 px-4 md:px-6">
          <div className="max-w-5xl mx-auto flex items-center justify-between py-3 md:py-4">
             <div className="flex items-center gap-2 md:gap-3 shrink-0">
                <div className="w-8 h-8 rounded-xl bg-[#FF2D55]/10 flex items-center justify-center border border-[#FF2D55]/20">
                   <Receipt className="w-4 h-4 text-[#FF2D55]" />
                </div>
                <h1 className="text-[10px] md:text-sm font-black uppercase tracking-[2px] hidden min-[400px]:block">Expense Engine</h1>
             </div>

             <nav className="flex gap-1 bg-white/[0.02] p-1 rounded-xl border border-white/5 overflow-x-auto no-scrollbar ml-4">
                {navigation.map((nav) => (
                  <button 
                    key={nav.id} 
                    onClick={() => setActiveTab(nav.id as any)} 
                    className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === nav.id ? 'bg-[#FF2D55] text-white shadow-[0_4px_10px_rgba(255,45,85,0.3)]' : 'text-gray-500 hover:text-white'}`}
                  >
                    <nav.icon className="w-3 md:w-3.5 h-3 md:h-3.5" />
                    <span>{nav.label}</span>
                  </button>
                ))}
             </nav>
          </div>
        </header>
      )}

      {/* Mobile Back Button (Top Left) when profile is selected */}
      {selectedPerson && (
        <div className="md:hidden fixed top-4 left-4 z-50">
          <button onClick={() => setSelectedPerson(null)} className="p-3 bg-white/10 backdrop-blur-md rounded-xl text-white">
            <ArrowDownLeft className="w-5 h-5 rotate-45" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar no-scrollbar relative">
        <AnimatePresence mode="wait">
          {selectedPerson ? (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full"
            >
              {renderProfile()}
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.2 }}
              className="max-w-5xl mx-auto py-4 md:py-8 px-4 md:px-8 pb-12"
            >
              {activeTab === 'summary' && renderSummary()}
              {activeTab === 'chat' && renderChat()}
              {activeTab === 'people' && renderPeople()}
              {activeTab === 'history' && (
                 <div className="space-y-6">
                 <h2 className="text-3xl font-heading font-bold tracking-tight">System Feed</h2>
                 <div className="flex gap-4">
                    <button onClick={handleExportData} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-all">
                      <Download className="w-3.5 h-3.5" /> Export DB
                    </button>
                    <label className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-all cursor-pointer text-center">
                      <Import className="w-3.5 h-3.5" /> Import DB
                      <input type="file" className="hidden" onChange={handleImportData} accept=".json" />
                    </label>
                 </div>
                 <div className="space-y-4">
                   {expenses.map((ex, i) => (
                     <GlassCard 
                       key={ex.id} 
                       onClick={() => setEditingExpense(ex)}
                       className="flex items-center justify-between"
                     >
                        <div className="flex items-center gap-4">
                           <Calendar className="w-8 h-8 text-gray-700" />
                           <div>
                             <div className="text-sm font-bold uppercase tracking-tight">{ex.description}</div>
                             <div className="text-[10px] text-gray-500 font-mono italic">
                               {new Date(ex.timestamp?.toDate?.() || 0).toLocaleString()}
                             </div>
                           </div>
                        </div>
                        <div className="flex items-center gap-6">
                           <div className={`text-sm font-black ${ex.type === 'owed' ? 'text-green-400' : 'text-[#FF2D55]'}`}>
                             {ex.type === 'owed' ? 'OWED' : 'OWE'} {ex.myShare.toFixed(2)}
                           </div>
                           <div className="flex gap-2">
                             <button 
                               onClick={(e) => { e.stopPropagation(); setEditingExpense(ex); }}
                               className="p-1 px-2 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-all text-[9px] font-black uppercase border border-white/5"
                             >
                               Edit
                             </button>
                             <button 
                               onClick={(e) => { e.stopPropagation(); handleDeleteExpense(ex); }}
                               className="p-1 px-2 hover:bg-red-500/10 rounded text-gray-500 hover:text-[#FF2D55] transition-all text-[9px] font-black uppercase border border-white/5"
                             >
                               Trash
                             </button>
                           </div>
                        </div>
                     </GlassCard>
                   ))}
                 </div>
               </div>
            )}
            {activeTab === 'afford' && renderAffordability()}
            {activeTab === 'intel' && (
              <div className="animate-fade-in py-6">
                <FinancialIntel />
              </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Add Person Modal */}
      <AnimatePresence>
        {showAddPerson && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md glass p-8 border-white/10"
            >
               <h3 className="text-2xl font-heading font-black tracking-tighter uppercase mb-6 text-[#FF2D55]">Enlist Contact</h3>
               <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Full Identity</label>
                    <input 
                      autoFocus
                      value={newPersonName}
                      onChange={(e) => setNewPersonName(e.target.value)}
                      placeholder="e.g. Deepak Kumar"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 focus:outline-none focus:border-[#FF2D55]/50 transition-all text-white font-medium"
                    />
                  </div>
                  <div className="flex gap-4 pt-4">
                     <button onClick={() => setShowAddPerson(false)} className="flex-1 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 border border-white/5 rounded-2xl hover:bg-white/5 transition-all">
                       Cancel
                     </button>
                     <button onClick={handleAddPerson} className="flex-1 py-4 text-xs font-bold uppercase tracking-widest bg-[#FF2D55] text-white rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(255,45,85,0.4)]">
                       Register
                     </button>
                  </div>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Expense Modal */}
      <AnimatePresence>
        {editingExpense && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md glass p-8 border-white/10"
            >
               <h3 className="text-2xl font-heading font-black tracking-tighter uppercase mb-6 text-[#FF2D55]">Edit Document</h3>
               <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Meta Description</label>
                    <input 
                      autoFocus
                      value={editingExpense.description}
                      onChange={(e) => setEditingExpense({...editingExpense, description: e.target.value})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 focus:outline-none focus:border-[#FF2D55]/50 transition-all text-white font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Quantum Value (₹)</label>
                    <input 
                      type="number"
                      value={editingExpense.myShare}
                      onChange={(e) => setEditingExpense({...editingExpense, myShare: Number(e.target.value)})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 focus:outline-none focus:border-[#FF2D55]/50 transition-all text-white font-black text-xl"
                    />
                  </div>
                  
                  <div className="p-4 bg-[#FF2D55]/5 border border-[#FF2D55]/20 rounded-2xl flex gap-3">
                     <ShieldCheck className="w-5 h-5 text-[#FF2D55] flex-shrink-0" />
                     <p className="text-[9px] text-[#FF2D55]/80 uppercase font-bold leading-tight">
                        Warning: Modifying the quantum value will instantly recalibrate the contact&apos;s net balance across the protocol.
                     </p>
                  </div>

                  <div className="flex gap-4 pt-4">
                     <button onClick={() => setEditingExpense(null)} className="flex-1 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 border border-white/5 rounded-2xl hover:bg-white/5 transition-all">
                       Discard
                     </button>
                     <button onClick={handleUpdateExpense} className="flex-1 py-4 text-xs font-bold uppercase tracking-widest bg-[#FF2D55] text-white rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(255,45,85,0.4)]">
                       Patch Data
                     </button>
                  </div>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
