import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Legend, 
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  CheckCircle2, 
  Circle, 
  Plus, 
  Trash2,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieChartIcon,
  LayoutList,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { logEvent } from '../services/eventService';
import { sendToInventorySync } from '../services/inventoryService';
import CheckmarkCelebration from './CheckmarkCelebration';
import { db, collection, query, where, onSnapshot, addDoc, deleteDoc, doc, handleFirestoreError, OperationType, serverTimestamp } from '../firebase';
import { TASK_FREQUENCIES, coerceTaskFrequency } from '../lib/firestoreEnums';
import { useFirebase } from '../contexts/FirebaseContext';
import { useActivePlot } from '../contexts/ActivePlotContext';
import { toast } from 'sonner';
import { Inhabitant, SpatialPlot, Expense } from '../types';
import { calculateCPY } from '../services/botanyService';
import { cn } from '@/src/lib/utils';
import { format, startOfWeek, endOfWeek, isWithinInterval, startOfDay, endOfDay } from 'date-fns';

const COLORS = ['#154212', '#F27D26', '#E4E3E0', '#8E9299', '#5A5A40'];

export default function Financials() {
  const { user } = useFirebase();
  const { activePlotId, activePlot } = useActivePlot();
  const [scope, setScope] = useState<'plot' | 'all'>('plot');
  const location = useLocation();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [newTask, setNewTask] = useState({ task: '', frequency: 'Daily', plantId: '', plotId: '' });
  const [newExpense, setNewExpense] = useState({ plotId: '', item: '', amount: '', category: 'Seeds', date: new Date().toISOString().split('T')[0] });
  const [inhabitants, setInhabitants] = useState<Inhabitant[]>([]);
  const [plots, setPlots] = useState<SpatialPlot[]>([]);
  const [activeTab, setActiveTab] = useState<'analytics' | 'tasks' | 'history'>('analytics');
  const [migratingTasks, setMigratingTasks] = useState<Set<string>>(new Set());
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (location.state?.completeTaskId && tasks.length > 0) {
      const task = tasks.find(t => t.id === location.state.completeTaskId);
      if (task && !task.completed) {
        setActiveTab('tasks');
        toggleTask(task);
        // Clear state
        window.history.replaceState({}, document.title);
      }
    }
  }, [location, tasks]);

  // Active-plot scope: expenses/tasks tagged 'General' or untagged are shared costs,
  // visible under every plot. The 'All plots' toggle lifts the filter entirely.
  const visibleExpenses = React.useMemo(() => {
    if (scope === 'all' || !activePlotId) return expenses;
    return expenses.filter(e => e.plotId === activePlotId || e.plotId === 'General' || !e.plotId);
  }, [expenses, scope, activePlotId]);
  const visibleTasks = React.useMemo(() => {
    if (scope === 'all' || !activePlotId) return tasks;
    return tasks.filter(t => !t.plotId || t.plotId === activePlotId);
  }, [tasks, scope, activePlotId]);

  useEffect(() => {
    if (!user) return;

    const expensesQuery = query(collection(db, 'expenses'), where('ownerUid', '==', user.uid));
    const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    });

    const tasksQuery = query(collection(db, 'tasks'), where('ownerUid', '==', user.uid));
    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const inhabitantsQuery = query(collection(db, 'inhabitants'), where('ownerUid', '==', user.uid));
    const unsubscribeInhabitants = onSnapshot(inhabitantsQuery, (snapshot) => {
      setInhabitants(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inhabitant)));
    });

    const plotsQuery = query(collection(db, 'spatial_plots'), where('ownerUid', '==', user.uid));
    const unsubscribePlots = onSnapshot(plotsQuery, (snapshot) => {
      setPlots(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SpatialPlot)));
    });

    return () => {
      unsubscribeExpenses();
      unsubscribeTasks();
      unsubscribeInhabitants();
      unsubscribePlots();
    };
  }, [user]);

  const expenseData = React.useMemo(() => {
    const categories: { [key: string]: number } = {};
    visibleExpenses.forEach(exp => {
      const cat = exp.category || 'Other';
      categories[cat] = (categories[cat] || 0) + (Number(exp.amount) || 0);
    });
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [visibleExpenses]);

  const totalExpenses = visibleExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

  const cpyData = React.useMemo(() => {
    return inhabitants
      .filter(inh => (inh.totalYield || 0) > 0)
      .map(inh => {
        const inhabitantExpenses = visibleExpenses.filter(exp => exp.plotId === inh.plotId); // Simplified attribution
        const cpy = calculateCPY(inh, inhabitantExpenses);
        return {
          name: inh.name,
          yield: inh.totalYield,
          cost: cpy.totalCost,
          cpy: cpy.cpy
        };
      })
      .sort((a, b) => a.cpy - b.cpy);
  }, [inhabitants, visibleExpenses]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTask.task) return;

    const selectedInhabitant = inhabitants.find(inh => inh.id === newTask.plantId);

    try {
      await addDoc(collection(db, 'tasks'), {
        ownerUid: user.uid,
        task: newTask.task,
        frequency: coerceTaskFrequency(newTask.frequency),
        plantId: newTask.plantId || null,
        plantName: selectedInhabitant?.name || null,
        plotId: newTask.plotId || null,
        completed: false,
        createdAt: serverTimestamp()
      });
      setNewTask({ task: '', frequency: 'Daily', plantId: '', plotId: '' });
      setIsAddTaskOpen(false);
      toast.success('Task added successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newExpense.item || !newExpense.amount) return;

    const selectedPlot = plots.find(p => p.id === newExpense.plotId);

    try {
      await addDoc(collection(db, 'expenses'), {
        ownerUid: user.uid,
        plotId: newExpense.plotId || 'General',
        plotName: selectedPlot?.name || 'General',
        item: newExpense.item,
        amount: Number(newExpense.amount),
        category: newExpense.category,
        date: newExpense.date,
        createdAt: serverTimestamp()
      });
      setNewExpense({ plotId: '', item: '', amount: '', category: 'Seeds', date: new Date().toISOString().split('T')[0] });
      setIsAddExpenseOpen(false);
      toast.success('Expense added successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'expenses');
    }
  };

  const deleteExpense = async (expenseId: string) => {
    try {
      await deleteDoc(doc(db, 'expenses', expenseId));
      toast.success('Expense removed');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `expenses/${expenseId}`);
    }
  };

  const toggleTask = async (task: any) => {
    if (!user || task.completed) return;

    // Start migration logic
    setMigratingTasks(prev => new Set(prev).add(task.id));

    try {
      await logEvent({
        ownerUid: user.uid,
        category: 'task_history',
        eventType: 'Task',
        data: {
          taskId: task.id,
          task: task.task,
          plotId: task.plotId || null,
          plantId: task.plantId || null,
          plantName: task.plantName || null,
          category: task.frequency,
          status: 'Archive',
          timestamp: new Date().toISOString()
        },
        calendarTitle: `COMPLETED: ${task.task}`,
        calendarDescription: `Task migration from Must-Dos. Frequency: ${task.frequency}`
      });

      // Historical Dual-Write: Sync with external inventory
      try {
        await sendToInventorySync({
          ownerUid: user.uid,
          plantId: task.plantId || null,
          session_date: format(new Date(), 'yyyy-MM-dd'),
          types: ['Task'],
          notes: `Completed task: ${task.task} (Frequency: ${task.frequency})`
        });
      } catch (syncError) {
        console.warn('Sync failed but Firestore write succeeded');
      }

      // Delete from source
      await deleteDoc(doc(db, 'tasks', task.id));

      setShowCelebration(true);
      toast.success('Task migrated to history and calendar');
    } catch (error) {
      setMigratingTasks(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
      console.error('Error migrating task:', error);
      toast.error('Failed to migrate task.');
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
      toast.success('Task removed');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${taskId}`);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter italic text-primary mb-2">Financials & Ops</h1>
          <p className="text-on-surface-variant font-medium">Track your garden's economy and daily rhythm.</p>
          {activePlot && (
            <div className="flex items-center gap-2 mt-3">
              <div className="flex bg-surface-variant/20 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setScope('plot')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg transition-all",
                    scope === 'plot' ? "bg-white text-primary shadow-sm" : "text-on-surface-variant hover:text-primary"
                  )}
                >
                  {activePlot.name}
                </button>
                <button
                  onClick={() => setScope('all')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg transition-all",
                    scope === 'all' ? "bg-white text-primary shadow-sm" : "text-on-surface-variant hover:text-primary"
                  )}
                >
                  All plots
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex bg-surface-variant/20 p-1 rounded-2xl backdrop-blur-sm">
          <button 
            onClick={() => setActiveTab('analytics')}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
              activeTab === 'analytics' ? "bg-white text-primary shadow-sm" : "text-on-surface-variant hover:text-primary"
            )}
          >
            <PieChartIcon size={18} />
            Analytics
          </button>
          <button 
            onClick={() => setActiveTab('tasks')}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
              activeTab === 'tasks' ? "bg-white text-primary shadow-sm" : "text-on-surface-variant hover:text-primary"
            )}
          >
            <LayoutList size={18} />
            Must-Dos
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
              activeTab === 'history' ? "bg-white text-primary shadow-sm" : "text-on-surface-variant hover:text-primary"
            )}
          >
            <History size={18} />
            History
          </button>
        </div>
      </header>

      <CheckmarkCelebration 
        isVisible={showCelebration} 
        onComplete={() => setShowCelebration(false)} 
      />

      {activeTab === 'analytics' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Stats Overview */}
          <div className="lg:col-span-1 space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary text-white p-8 rounded-[2.5rem] shadow-2xl shadow-primary/20 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform">
                <TrendingUp size={80} />
              </div>
              <p className="text-white/70 font-bold uppercase tracking-widest text-[10px] mb-2">Total Investment</p>
              <h2 className="text-5xl font-black tracking-tighter italic mb-4">${totalExpenses.toLocaleString()}</h2>
              <div className="flex items-center gap-2 text-xs font-bold bg-white/10 w-fit px-3 py-1 rounded-full">
                <ArrowUpRight size={14} />
                <span>+12% from last month</span>
              </div>
            </motion.div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/30 shadow-sm">
                <div className="w-10 h-10 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary mb-4">
                  <DollarSign size={20} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant/60">Avg / Plot</p>
                <p className="text-xl font-black text-on-surface">${(totalExpenses / (plots.length || 1)).toFixed(0)}</p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-outline-variant/30 shadow-sm">
                <div className="w-10 h-10 rounded-2xl bg-tertiary/10 flex items-center justify-center text-tertiary mb-4">
                  <Calendar size={20} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant/60">Projected</p>
                <p className="text-xl font-black text-on-surface">${(totalExpenses * 1.2).toFixed(0)}</p>
              </div>
            </div>

            <button 
              onClick={() => setIsAddExpenseOpen(true)}
              className="w-full bg-primary text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20"
            >
              <Plus size={20} />
              Add Expense
            </button>
          </div>

          {/* Charts */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white p-8 rounded-[2.5rem] border border-outline-variant/30 shadow-sm flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-black text-xl tracking-tight italic">Category Split</h3>
                <PieChartIcon size={20} className="text-primary/40" />
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {expenseData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-white p-8 rounded-[2.5rem] border border-outline-variant/30 shadow-sm flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-black text-xl tracking-tight italic">Monthly Burn</h3>
                <TrendingUp size={20} className="text-primary/40" />
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(21,66,18,0.05)' }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="value" fill="#154212" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>

          {/* CPY Analysis Section */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-[2.5rem] border border-outline-variant/30 shadow-sm overflow-hidden">
              <div className="p-8 border-bottom border-outline-variant/10 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-xl tracking-tight italic">Cost-per-Yield (CPY) Analysis</h3>
                  <p className="text-xs text-on-surface-variant font-medium mt-1">Economic viability per inhabitant based on yield and attributed costs.</p>
                </div>
                <TrendingUp size={20} className="text-primary/40" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-variant/10">
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Inhabitant</th>
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 text-right">Total Yield (kg/unit)</th>
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 text-right">Total Cost ($)</th>
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 text-right">CPY ($/unit)</th>
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 text-right">Efficiency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {cpyData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-surface-variant/5 transition-colors">
                        <td className="px-8 py-4 text-sm font-bold text-on-surface">{item.name}</td>
                        <td className="px-8 py-4 text-sm font-medium text-right">{item.yield}</td>
                        <td className="px-8 py-4 text-sm font-medium text-right">${item.cost.toFixed(2)}</td>
                        <td className="px-8 py-4 text-sm font-black text-right text-primary">${item.cpy.toFixed(2)}</td>
                        <td className="px-8 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-surface-variant/20 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary" 
                                style={{ width: `${Math.min(100, (1 / (item.cpy || 1)) * 100)}%` }} 
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {cpyData.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-on-surface-variant/40 font-medium italic">
                          No yield data available for CPY analysis. Log yields in the Ledger to see results.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Expense History */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-[2.5rem] border border-outline-variant/30 shadow-sm overflow-hidden">
              <div className="p-8 border-bottom border-outline-variant/10 flex items-center justify-between">
                <h3 className="font-black text-xl tracking-tight italic">Expense History</h3>
                <Filter size={20} className="text-on-surface-variant/40" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-variant/10">
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Date</th>
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Item</th>
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Category</th>
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Plot</th>
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 text-right">Amount</th>
                      <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {[...visibleExpenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(exp => (
                      <tr key={exp.id} className="hover:bg-surface-variant/5 transition-colors group">
                        <td className="px-8 py-4 text-sm font-medium text-on-surface-variant">{format(new Date(exp.date), 'MMM dd, yyyy')}</td>
                        <td className="px-8 py-4 text-sm font-bold text-on-surface">{exp.item}</td>
                        <td className="px-8 py-4">
                          <span className="px-3 py-1 rounded-full bg-surface-variant/20 text-[10px] font-black uppercase tracking-widest">
                            {exp.category}
                          </span>
                        </td>
                        <td className="px-8 py-4 text-sm font-medium text-secondary">{exp.plotName || 'General'}</td>
                        <td className="px-8 py-4 text-sm font-black text-right">${Number(exp.amount).toFixed(2)}</td>
                        <td className="px-8 py-4 text-right">
                          <button 
                            onClick={() => deleteExpense(exp.id)}
                            className="p-2 text-on-surface-variant/20 hover:text-destructive hover:bg-destructive/5 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {visibleExpenses.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-8 py-12 text-center text-on-surface-variant/40 font-medium italic">
                          No expenses recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'tasks' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Task Summary */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-secondary text-white p-8 rounded-[2.5rem] shadow-2xl shadow-secondary/20">
              <p className="text-white/70 font-bold uppercase tracking-widest text-[10px] mb-2">Productivity</p>
              <h2 className="text-5xl font-black tracking-tighter italic mb-4">
                {visibleTasks.filter(t => t.completed).length}/{visibleTasks.length}
              </h2>
              <div className="w-full bg-white/20 h-3 rounded-full overflow-hidden mb-6">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(visibleTasks.filter(t => t.completed).length / visibleTasks.length) * 100 || 0}%` }}
                  className="h-full bg-white"
                />
              </div>
              <button 
                onClick={() => setIsAddTaskOpen(true)}
                className="w-full bg-white text-secondary py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-white/90 transition-all active:scale-95"
              >
                <Plus size={20} />
                New Must-Do
              </button>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-outline-variant/30 shadow-sm">
              <h4 className="font-black text-sm uppercase tracking-wider text-on-surface-variant/60 mb-4">Quick Filters</h4>
              <div className="flex flex-wrap gap-2">
                {TASK_FREQUENCIES.map(freq => (
                  <button key={freq} className="px-4 py-2 rounded-xl bg-surface-variant/20 text-xs font-bold hover:bg-primary hover:text-white transition-all">
                    {freq}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Task List */}
          <div className="lg:col-span-2 space-y-4">
            <AnimatePresence mode="popLayout">
              {visibleTasks.length === 0 ? (
                <div className="bg-white p-12 rounded-[2.5rem] border border-dashed border-outline-variant flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-surface-variant/20 flex items-center justify-center text-on-surface-variant/40 mb-4">
                    <LayoutList size={32} />
                  </div>
                  <h3 className="font-black text-xl italic mb-2">No tasks yet</h3>
                  <p className="text-on-surface-variant text-sm max-w-xs">Start by adding your daily or weekly gardening routines.</p>
                </div>
              ) : (
                visibleTasks.map((task, index) => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: migratingTasks.has(task.id) ? 0 : 1, x: 0, scale: migratingTasks.has(task.id) ? 0.95 : 1 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{ duration: 0.4 }}
                    onClick={() => toggleTask(task)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Task: ${task.task}. Frequency: ${task.frequency}. ${task.completed ? 'Completed' : 'Not completed'}. Click to toggle.`}
                    onKeyDown={(e) => e.key === 'Enter' && toggleTask(task)}
                    className={cn(
                      "group bg-white p-6 rounded-3xl border transition-all flex items-center gap-6 cursor-pointer touch-target",
                      task.completed || migratingTasks.has(task.id) ? "border-primary/20 bg-primary/5" : "border-outline-variant/30 hover:border-primary/40"
                    )}
                  >
                    <button 
                      disabled={migratingTasks.has(task.id)}
                      aria-hidden="true"
                      className={cn(
                        "w-10 h-10 rounded-2xl flex items-center justify-center transition-all",
                        task.completed || migratingTasks.has(task.id) ? "bg-primary text-white" : "bg-surface-variant/20 text-on-surface-variant/40 hover:bg-primary/10 hover:text-primary"
                      )}
                    >
                      {task.completed || migratingTasks.has(task.id) ? <CheckCircle2 size={24} className={cn(migratingTasks.has(task.id) && "animate-pulse")} /> : <Circle size={24} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <h4 className={cn(
                        "font-bold text-lg transition-all",
                        (task.completed || migratingTasks.has(task.id)) ? "text-on-surface-variant/40 line-through" : "text-on-surface"
                      )}>
                        {task.task}
                      </h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-surface-variant/30 text-on-surface-variant">
                          {task.frequency}
                        </span>
                        {task.plantName && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-secondary flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-secondary" />
                            {task.plantName}
                          </span>
                        )}
                        {(task.completed || migratingTasks.has(task.id)) && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                            {migratingTasks.has(task.id) ? 'Migrating...' : 'Completed'}
                          </span>
                        )}
                      </div>
                    </div>

                    <button 
                      onClick={() => deleteTask(task.id)}
                      className="p-3 text-on-surface-variant/20 hover:text-destructive hover:bg-destructive/5 rounded-2xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={20} />
                    </button>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-outline-variant/30 shadow-sm overflow-hidden p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-surface-variant/20 flex items-center justify-center text-on-surface-variant/40 mb-4">
            <History size={32} />
          </div>
          <h3 className="font-black text-xl italic mb-2">Historical Audit</h3>
          <p className="text-on-surface-variant text-sm max-w-xs mb-8">
            Detailed historical logs are available in the main dashboard's "History" section.
            We are working on integrating a dedicated financial audit view here.
          </p>
          <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab('analytics')}
              className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-sm shadow-lg shadow-primary/20"
            >
              Back to Analytics
            </button>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      <AnimatePresence>
        {isAddTaskOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddTaskOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[3rem] p-10 shadow-2xl"
            >
              <h2 className="text-3xl font-black tracking-tighter italic text-primary mb-8">New Must-Do</h2>
              <form onSubmit={handleAddTask} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-4">Task Description</label>
                  <input
                    autoFocus
                    type="text"
                    required
                    value={newTask.task}
                    onChange={(e) => setNewTask({ ...newTask, task: e.target.value })}
                    placeholder="e.g., Prune the hydrangeas"
                    className="w-full px-6 py-4 rounded-2xl bg-surface-variant/10 border-none focus:ring-2 focus:ring-primary font-bold"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-4">Frequency</label>
                  <div className="grid grid-cols-2 gap-2">
                    {TASK_FREQUENCIES.map(freq => (
                      <button
                        key={freq}
                        type="button"
                        onClick={() => setNewTask({ ...newTask, frequency: freq })}
                        className={cn(
                          "py-3 rounded-xl text-xs font-bold transition-all",
                          newTask.frequency === freq 
                            ? "bg-primary text-white shadow-lg shadow-primary/20" 
                            : "bg-surface-variant/10 text-on-surface-variant hover:bg-surface-variant/20"
                        )}
                      >
                        {freq}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-4">Assign to Plant</label>
                    <select
                      value={newTask.plantId}
                      onChange={(e) => setNewTask({ ...newTask, plantId: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-surface-variant/10 border-none text-xs font-bold"
                    >
                      <option value="">None</option>
                      {inhabitants.map(inh => (
                        <option key={inh.id} value={inh.id}>{inh.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-4">Assign to Plot</label>
                    <select
                      value={newTask.plotId}
                      onChange={(e) => setNewTask({ ...newTask, plotId: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-surface-variant/10 border-none text-xs font-bold"
                    >
                      <option value="">None</option>
                      {plots.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAddTaskOpen(false)}
                    className="flex-1 py-4 rounded-2xl font-black text-on-surface-variant hover:bg-surface-variant/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-4 rounded-2xl bg-primary text-white font-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    Save Task
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Expense Modal */}
      <AnimatePresence>
        {isAddExpenseOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddExpenseOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[3rem] p-10 shadow-2xl"
            >
              <h2 className="text-3xl font-black tracking-tighter italic text-primary mb-8">New Expense</h2>
              <form onSubmit={handleAddExpense} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-4">Item Name</label>
                  <input
                    autoFocus
                    type="text"
                    required
                    value={newExpense.item}
                    onChange={(e) => setNewExpense({ ...newExpense, item: e.target.value })}
                    placeholder="e.g., Organic Fertilizer"
                    className="w-full px-6 py-4 rounded-2xl bg-surface-variant/10 border-none focus:ring-2 focus:ring-primary font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-4">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-6 py-4 rounded-2xl bg-surface-variant/10 border-none focus:ring-2 focus:ring-primary font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-4">Date</label>
                    <input
                      type="date"
                      required
                      value={newExpense.date}
                      onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                      className="w-full px-6 py-4 rounded-2xl bg-surface-variant/10 border-none focus:ring-2 focus:ring-primary font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-4">Category</label>
                    <select
                      value={newExpense.category}
                      onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-surface-variant/10 border-none text-xs font-bold"
                    >
                      {['Seeds', 'Soil', 'Tools', 'Water', 'Fertilizer', 'Other'].map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-4">Assign to Plot</label>
                    <select
                      value={newExpense.plotId}
                      onChange={(e) => setNewExpense({ ...newExpense, plotId: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-surface-variant/10 border-none text-xs font-bold"
                    >
                      <option value="">General</option>
                      {plots.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAddExpenseOpen(false)}
                    className="flex-1 py-4 rounded-2xl font-black text-on-surface-variant hover:bg-surface-variant/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-4 rounded-2xl bg-primary text-white font-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    Save Expense
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
