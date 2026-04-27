'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, TrendingDown, DollarSign, Calendar, 
  BarChart3, PieChart as PieChartIcon, ArrowLeft, ArrowRight,
  Target, AlertCircle
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import { useAuth } from '@/lib/firebase-provider';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { format, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { calculateDailyBudget } from '@/lib/finance';
import Link from 'next/link';

const COLORS = ['#FF2D55', '#AF52DE', '#5856D6', '#007AFF', '#34C759', '#FF9500'];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<any[]>([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const expensesQuery = query(
      collection(db, 'users', user.uid, 'expenses'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(500)
    );

    const unsubscribe = onSnapshot(expensesQuery, (snap) => {
      setExpenses(snap.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        date: d.data().timestamp?.toDate ? d.data().timestamp.toDate() : new Date()
      })));
      setLoading(false);
    });

    // Also get recurring payments to estimate fixed expenses
    const recurringQuery = query(collection(db, 'users', user.uid, 'recurring_payments'));
    const unsubscribeRecurring = onSnapshot(recurringQuery, (snap) => {
      setFixedExpenses(snap.docs.map(d => d.data()));
    });

    return () => {
      unsubscribe();
      unsubscribeRecurring();
    };
  }, [user]);

  // Calculations for last 3 months
  const now = new Date();
  const last3Months = Array.from({ length: 3 }).map((_, i) => subMonths(now, i)).reverse();
  
  const monthlyData = last3Months.map(month => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const monthExpenses = expenses.filter(e => e.date >= start && e.date <= end);
    const total = monthExpenses.reduce((sum, e) => sum + (e.myShare || 0), 0);
    return {
      name: format(month, 'MMM'),
      total
    };
  });

  // Category breakdown for current month
  const currentMonthStart = startOfMonth(now);
  const currentMonthExpenses = expenses.filter(e => e.date >= currentMonthStart);
  
  const categories = currentMonthExpenses.reduce((acc: any, e) => {
    const cat = e.category || 'General';
    acc[cat] = (acc[cat] || 0) + (e.myShare || 0);
    return acc;
  }, {});

  const pieData = Object.entries(categories).map(([name, value]) => ({ name, value: Number(value) }));

  // Daily budget projection
  const daysInMonth = 30; // Approximation
  const daysPassed = now.getDate();
  const daysLeft = daysInMonth - daysPassed;
  const totalFixed = fixedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  // Using a hypothetical balance or deriving from expenses if not set
  const balance = 50000; // Placeholder for bank balance system
  const dailyBudget = calculateDailyBudget(balance, totalFixed, daysLeft || 1);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-10">
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <Link href="/" className="text-[10px] uppercase font-black tracking-widest text-gray-500 hover:text-[#FF2D55] transition-colors flex items-center gap-2 mb-4">
              <ArrowLeft className="w-3 h-3" /> Back to Dashboard
            </Link>
            <h1 className="text-4xl font-black tracking-tighter">Finance Intelligence</h1>
            <p className="text-gray-500 text-sm font-medium">Predictive analytics and protocol health logs.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass p-8 rounded-[2rem] border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-gray-500 font-bold uppercase text-[10px] tracking-widest">
              <Target className="w-3 h-3" /> Daily Budget
            </div>
            <div className="text-4xl font-black tracking-tighter">₹{dailyBudget.toFixed(0)}</div>
            <div className="text-[9px] uppercase font-black text-gray-600 tracking-wider">Remaining after obligations</div>
          </div>
          
          <div className="glass p-8 rounded-[2rem] border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-gray-500 font-bold uppercase text-[10px] tracking-widest">
              <BarChart3 className="w-3 h-3" /> Monthly Spend
            </div>
            <div className="text-4xl font-black tracking-tighter">₹{monthlyData[monthlyData.length-1].total.toFixed(0)}</div>
            <div className="text-[9px] uppercase font-black text-[#FF2D55] tracking-wider">Current Period Audit</div>
          </div>

          <div className="glass p-8 rounded-[2rem] border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-gray-500 font-bold uppercase text-[10px] tracking-widest">
              <AlertCircle className="w-3 h-3" /> Avg Daily Spend
            </div>
            <div className="text-4xl font-black tracking-tighter">
              ₹{(monthlyData[monthlyData.length-1].total / (now.getDate() || 1)).toFixed(0)}
            </div>
            <div className="text-[9px] uppercase font-black text-gray-600 tracking-wider">Historical average</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="glass p-8 rounded-[2.5rem] border-white/5 space-y-6">
            <h3 className="text-lg font-bold tracking-tight uppercase text-[10px] tracking-widest text-[#FF2D55]">Spending Trend</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis stroke="#ffffff40" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,45,85,0.2)', borderRadius: '12px' }}
                    itemStyle={{ color: '#FF2D55', fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Line type="monotone" dataKey="total" stroke="#FF2D55" strokeWidth={3} dot={{ r: 4, fill: '#FF2D55' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass p-8 rounded-[2.5rem] border-white/5 space-y-6">
            <h3 className="text-lg font-bold tracking-tight uppercase text-[10px] tracking-widest text-[#AF52DE]">Category Distribution</h3>
            <div className="h-[300px] w-full flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: '12px' }}
                    itemStyle={{ fontSize: '10px' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '1px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
