import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, DollarSign, TrendingUp, Calendar, Tag, ChevronRight, Activity, Map as MapIcon, Filter, Search, X, Check, ExternalLink, Edit3 } from 'lucide-react';
import { db, collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, handleFirestoreError, OperationType, updateDoc, getDocs, batchDelete } from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { useActivePlot } from '../contexts/ActivePlotContext';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import PlotCreateModal from './PlotCreateModal';
import PlotEditForm, { PlotEditData } from './PlotEditForm';
import { countPlanted, countWaiting } from '../lib/plotStats';
import { unassignPlantUpdate } from '../lib/unassignedPlants';

import { 
  Inhabitant, 
  SpatialPlot, 
  InhabitantStatus, 
  InhabitantType, 
  Expense
} from '../types';

export default function Plots() {
  const { user } = useFirebase();
  const { activePlotId, setActivePlotId } = useActivePlot();
  const navigate = useNavigate();
  const location = useLocation();
  const [plots, setPlots] = useState<SpatialPlot[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [inhabitants, setInhabitants] = useState<Inhabitant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPlot, setShowAddPlot] = useState(false);
  const [showEditPlot, setShowEditPlot] = useState(false);
  const [editingPlot, setEditingPlot] = useState<SpatialPlot | null>(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [selectedPlotId, setSelectedPlotId] = useState<string | 'all'>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [plotToDelete, setPlotToDelete] = useState<string | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);

  const [newExpense, setNewExpense] = useState({ plotId: '', item: '', amount: '', category: 'Seeds', date: new Date().toISOString().split('T')[0] });

  useEffect(() => {
    if (!user) return;

    const plotsQ = query(collection(db, 'spatial_plots'), where('ownerUid', '==', user.uid));
    const unsubscribePlots = onSnapshot(plotsQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SpatialPlot));
      setPlots(list.sort((a, b) => b.createdAt?.toDate?.() - a.createdAt?.toDate?.()));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'spatial_plots');
      setLoading(false);
    });

    const expensesQ = query(collection(db, 'expenses'), where('ownerUid', '==', user.uid));
    const unsubscribeExpenses = onSnapshot(expensesQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
    });

    const inhabitantsQ = query(collection(db, 'inhabitants'), where('ownerUid', '==', user.uid));
    const unsubscribeInhabitants = onSnapshot(inhabitantsQ, (snapshot) => {
      setInhabitants(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inhabitant)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inhabitants');
    });

    return () => {
      unsubscribePlots();
      unsubscribeExpenses();
      unsubscribeInhabitants();
    };
  }, [user]);

  useEffect(() => {
    if (location.state?.openAddPlot) {
      setShowAddPlot(true);
      // Clear state to avoid reopening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newExpense.plotId || !newExpense.item || !newExpense.amount || isSaving) return;

    setIsSaving(true);
    const plot = plots.find(p => p.id === newExpense.plotId);

    try {
      await addDoc(collection(db, 'expenses'), {
        ...newExpense,
        amount: parseFloat(newExpense.amount),
        plotName: plot?.name || 'Unknown',
        ownerUid: user.uid,
        createdAt: serverTimestamp()
      });
      
      toast.success('Expense recorded');
      
      setTimeout(() => {
        setNewExpense({ plotId: '', item: '', amount: '', category: 'Seeds', date: new Date().toISOString().split('T')[0] });
        setShowAddExpense(false);
        setIsSaving(false);
      }, 500);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'expenses');
      setIsSaving(false);
    }
  };

  const handleUpdatePlot = async (data: PlotEditData) => {
    if (!user || !editingPlot || isSaving) return;

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'spatial_plots', editingPlot.id), { ...data });

      toast.success('Plot updated');

      setTimeout(() => {
        setShowEditPlot(false);
        setEditingPlot(null);
        setIsSaving(false);
      }, 500);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'spatial_plots');
      setIsSaving(false);
    }
  };

  const [isDeletingConfirmed, setIsDeletingConfirmed] = useState(false);

  const handleDeletePlot = async () => {
    if (!plotToDelete || !user) return;
    const id = plotToDelete;
    const uid = user.uid;
    setIsDeletingConfirmed(true);
    let step = 'init';
    try {
      // 1. Get planters
      step = 'read-planters';
      const plantersQ = query(collection(db, 'planters'), where('plotId', '==', id), where('ownerUid', '==', uid));
      const plantersSnap = await getDocs(plantersQ);
      const planterIds = plantersSnap.docs.map(d => d.id);

      // 2. Unassign inhabitants
      step = 'read-inhabitants';
      const inhabitantsQ = query(collection(db, 'inhabitants'), where('plotId', '==', id), where('ownerUid', '==', uid));
      const inhabitantsSnap = await getDocs(inhabitantsQ);
      step = 'update-inhabitants';
      for (const d of inhabitantsSnap.docs) {
        await updateDoc(doc(db, 'inhabitants', d.id), unassignPlantUpdate(d.data().status));
      }

      // 3. Delete expenses
      step = 'delete-expenses';
      const expensesQ = query(collection(db, 'expenses'), where('plotId', '==', id), where('ownerUid', '==', uid));
      const expensesSnap = await getDocs(expensesQ);
      for (const d of expensesSnap.docs) {
        await deleteDoc(doc(db, 'expenses', d.id));
      }

      // 4. Delete event logs
      step = 'delete-event-logs';
      const logsQ = query(collection(db, 'event_logs'), where('targetId', '==', id), where('ownerUid', '==', uid));
      const logsSnap = await getDocs(logsQ);
      for (const d of logsSnap.docs) {
        await deleteDoc(doc(db, 'event_logs', d.id));
      }

      // 5. Delete tasks
      step = 'delete-tasks';
      const tasksQ = query(collection(db, 'tasks'), where('plotId', '==', id), where('ownerUid', '==', uid));
      const tasksSnap = await getDocs(tasksQ);
      for (const d of tasksSnap.docs) {
        await deleteDoc(doc(db, 'tasks', d.id));
      }

      // 6. Delete calendar events (if they have plotId)
      step = 'delete-events';
      const eventsQ = query(collection(db, 'calendar_events'), where('plotId', '==', id), where('ownerUid', '==', uid));
      const eventsSnap = await getDocs(eventsQ);
      for (const d of eventsSnap.docs) {
        await deleteDoc(doc(db, 'calendar_events', d.id));
      }

      // 7. Delete planters in batch
      step = 'delete-planters';
      if (planterIds.length > 0) {
        await batchDelete('planters', planterIds);
      }

      // 8. Delete plot
      step = 'delete-plot';
      await deleteDoc(doc(db, 'spatial_plots', id));

      toast.success('Plot deleted. Its plants are back in your unassigned inventory.');
      setPlotToDelete(null);
      setShowDeleteModal(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Surface the failure visibly: silent deletes are how this bug hid.
      toast.error(`Delete failed at ${step}: ${msg}`, { duration: 10000 });
      handleFirestoreError(error, OperationType.DELETE, `spatial_plots/${id}@${step}`);
    } finally {
      setIsDeletingConfirmed(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;
    const id = expenseToDelete;
    setIsDeletingConfirmed(true);
    try {
      await deleteDoc(doc(db, 'expenses', id));
      toast.success('Expense removed');
      setExpenseToDelete(null);
      setShowDeleteModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'expenses');
    } finally {
      setIsDeletingConfirmed(false);
    }
  };

  const filteredExpenses = selectedPlotId === 'all' 
    ? expenses 
    : expenses.filter(e => e.plotId === selectedPlotId);

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-10">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-primary">
            <MapIcon size={32} className="stroke-[2.5]" />
            <h1 className="text-5xl font-headline font-black tracking-tighter italic">Active Plots</h1>
          </div>
          <p className="text-on-surface-variant font-medium max-w-md">
            Manage your garden zones and track investments for optimal yield analysis.
          </p>
        </div>
        <div className="flex gap-3">
          {plots.length > 0 && (
            <Link 
              to={`/plots/${plots[0].id}`}
              className="bg-surface-container-high text-primary px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-primary hover:text-white transition-all shadow-sm"
            >
              <MapIcon size={20} /> View Map
            </Link>
          )}
          <button 
            onClick={() => setShowAddPlot(true)}
            aria-label="Add new plot"
            className="bg-primary text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform touch-target"
          >
            <Plus size={20} /> New Plot
          </button>
          <button 
            onClick={() => setShowAddExpense(true)}
            aria-label="Log new expense"
            className="bg-secondary text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-secondary/20 hover:scale-105 transition-transform touch-target"
          >
            <DollarSign size={20} /> Log Expense
          </button>
        </div>
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface-container-low p-8 rounded-[2.5rem] border border-outline-variant/30 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Total Investment</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-headline font-black text-primary">${totalExpenses.toLocaleString()}</span>
            <span className="text-xs font-bold text-on-surface-variant">USD</span>
          </div>
          <div className="mt-6 flex items-center gap-2 text-secondary">
            <TrendingUp size={16} />
            <span className="text-xs font-black uppercase tracking-wider">ROI Tracking Active</span>
          </div>
        </div>

        <div className="bg-surface-container-low p-8 rounded-[2.5rem] border border-outline-variant/30 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Active Zones</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-headline font-black text-secondary">{plots.filter(p => p.status === 'Active').length}</span>
            <span className="text-xs font-bold text-on-surface-variant">Plots</span>
          </div>
          <div className="mt-6 flex items-center gap-2 text-primary">
            <Activity size={16} />
            <span className="text-xs font-black uppercase tracking-wider">All Systems Normal</span>
          </div>
        </div>

        <div className="bg-surface-container-low p-8 rounded-[2.5rem] border border-outline-variant/30 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Expense Frequency</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-headline font-black text-tertiary">{expenses.length}</span>
            <span className="text-xs font-bold text-on-surface-variant">Entries</span>
          </div>
          <div className="mt-6 flex items-center gap-2 text-tertiary">
            <Calendar size={16} />
            <span className="text-xs font-black uppercase tracking-wider">Last log: {expenses[0]?.date || 'N/A'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Plots List */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-headline font-black tracking-tight">Your Plots</h2>
            <div className="bg-surface-container-high px-3 py-1 rounded-full text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
              {plots.length} Total
            </div>
          </div>

          <div className="space-y-4">
            <button 
              onClick={() => setSelectedPlotId('all')}
              className={cn(
                "w-full p-6 rounded-[2rem] text-left transition-all border flex items-center justify-between group",
                selectedPlotId === 'all' 
                  ? "bg-primary text-white border-primary shadow-xl shadow-primary/20" 
                  : "bg-white border-outline-variant/30 hover:border-primary/50"
              )}
            >
              <div>
                <span className="block font-black text-lg tracking-tight">All Plots</span>
                <span className={cn("text-xs font-medium", selectedPlotId === 'all' ? "text-white/70" : "text-on-surface-variant")}>
                  Consolidated expense report
                </span>
              </div>
              <ChevronRight size={20} className={cn("transition-transform group-hover:translate-x-1", selectedPlotId === 'all' ? "text-white" : "text-primary")} />
            </button>

            {plots.map((plot) => {
              const plotInhabitants = inhabitants.filter(p => p.plotId === plot.id);
              const planted = countPlanted(plotInhabitants);
              const waiting = countWaiting(plotInhabitants);
              return (
              <div key={plot.id} className="relative group">
                <div className="flex gap-2">
                    <Link 
                      to={`/plots/${plot.id}`}
                      onClick={() => setActivePlotId(plot.id)}
                      aria-label={`View details for plot ${plot.name}. ${planted} planted${waiting > 0 ? `, ${waiting} waiting to place` : ''}.`}
                      className={cn(
                        "flex-1 p-6 rounded-[2rem] text-left transition-all border flex items-center justify-between group/card touch-target",
                        selectedPlotId === plot.id 
                          ? "bg-secondary text-white border-secondary shadow-xl shadow-secondary/20" 
                          : "bg-white border-outline-variant/30 hover:border-secondary/50"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="block font-black text-lg tracking-tight truncate">{plot.name}</span>
                          {plot.id === activePlotId && (
                            <span className="text-[10px] font-black uppercase tracking-widest bg-primary/15 text-primary px-2 py-0.5 rounded-full shrink-0">Active</span>
                          )}
                          {plot.status === 'Active' && plot.id !== activePlotId && (
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0"></span>
                          )}
                        </div>
                        <span className={cn("text-xs font-medium truncate block", selectedPlotId === plot.id ? "text-white/70" : "text-on-surface-variant")}>
                          {planted} planted{waiting > 0 ? ` • ${waiting} to place` : ''} • {plot.description || 'No description'}
                        </span>
                      </div>
                      <ChevronRight size={20} className={cn("transition-transform group-hover/card:translate-x-1", selectedPlotId === plot.id ? "text-white" : "text-secondary")} />
                    </Link>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => { setEditingPlot(plot); setShowEditPlot(true); }}
                      className="p-4 bg-surface-container-high text-on-surface-variant rounded-2xl flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-sm"
                      title="Edit Plot"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button 
                      onClick={() => { setPlotToDelete(plot.id); setShowDeleteModal(true); }}
                      className="p-4 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"
                      title="Delete Plot"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {/* Expenses Report */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-headline font-black tracking-tight">
              {selectedPlotId === 'all' ? 'Consolidated Expenses' : `Expenses: ${plots.find(p => p.id === selectedPlotId)?.name}`}
            </h2>
            <div className="flex gap-2">
              <button className="p-2 rounded-xl bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors">
                <Filter size={18} />
              </button>
              <button className="p-2 rounded-xl bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors">
                <Search size={18} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-outline-variant/30 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/30">
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Date</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Item</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Plot</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Category</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 text-right">Amount</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-20 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-30">
                          <DollarSign size={48} />
                          <p className="font-black uppercase tracking-widest text-xs">No expenses found for this selection</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((expense) => (
                      <tr key={expense.id} className="hover:bg-surface-container-lowest transition-colors group">
                        <td className="px-8 py-5 text-sm font-bold text-on-surface-variant">{expense.date}</td>
                        <td className="px-8 py-5">
                          <span className="font-black text-on-surface tracking-tight">{expense.item}</span>
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-secondary/10 text-secondary">
                            {expense.plotName}
                          </span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                            <Tag size={14} className="text-tertiary" />
                            <span className="text-xs font-bold text-on-surface-variant">{expense.category}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <span className="font-black text-primary tracking-tight">${expense.amount.toFixed(2)}</span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <button 
                            onClick={() => { setExpenseToDelete(expense.id); setShowDeleteModal(true); }}
                            className="p-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/5 rounded-lg"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* New Plot — name, location, footprint. Beds get added inside the plot. */}
      <AnimatePresence>
        {showAddPlot && (
          <PlotCreateModal
            onClose={() => setShowAddPlot(false)}
            onComplete={(plotId) => {
              setShowAddPlot(false);
              setActivePlotId(plotId);
              navigate(`/plots/${plotId}`);
            }}
          />
        )}
      </AnimatePresence>

      {/* Edit Plot Modal — shared form, same questions everywhere, pre-filled */}
      <AnimatePresence>
        {showEditPlot && editingPlot && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditPlot(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[3rem] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8 space-y-8">
                <div className="flex justify-between items-center">
                  <h3 className="text-3xl font-headline font-black tracking-tight italic text-primary">Edit Plot</h3>
                  <button onClick={() => setShowEditPlot(false)} className="p-2 hover:bg-primary/5 rounded-full text-on-surface-variant">
                    <X size={24} />
                  </button>
                </div>

                <PlotEditForm
                  initial={editingPlot}
                  isSaving={isSaving}
                  onSave={handleUpdatePlot}
                  onCancel={() => setShowEditPlot(false)}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Expense Modal */}
      <AnimatePresence>
        {showAddExpense && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddExpense(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[3rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-8">
                <div className="flex justify-between items-center">
                  <h3 className="text-3xl font-headline font-black tracking-tight italic text-secondary">Log Expense</h3>
                  <button onClick={() => setShowAddExpense(false)} className="p-2 hover:bg-secondary/5 rounded-full text-on-surface-variant">
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleAddExpense} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Select Plot</label>
                    <select 
                      required
                      value={newExpense.plotId}
                      onChange={(e) => setNewExpense({ ...newExpense, plotId: e.target.value })}
                      className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-secondary/20 transition-all appearance-none"
                    >
                      <option value="">Choose a plot...</option>
                      {plots.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Item Name</label>
                      <input 
                        type="text"
                        required
                        value={newExpense.item}
                        onChange={(e) => setNewExpense({ ...newExpense, item: e.target.value })}
                        placeholder="e.g. Organic Soil"
                        className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-secondary/20 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Amount ($)</label>
                      <input 
                        type="number"
                        step="0.01"
                        required
                        value={newExpense.amount}
                        onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                        placeholder="0.00"
                        className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-secondary/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Category</label>
                      <select 
                        value={newExpense.category}
                        onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                        className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-secondary/20 transition-all appearance-none"
                      >
                        {["Seeds", "Soil", "Tools", "Water", "Fertilizer", "Other"].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Date</label>
                      <input 
                        type="date"
                        required
                        value={newExpense.date}
                        onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                        className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-secondary/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button 
                      type="button"
                      onClick={() => setShowAddExpense(false)}
                      className="flex-1 py-4 rounded-2xl font-black text-on-surface-variant hover:bg-surface-container-high transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={isSaving}
                      className="flex-1 bg-secondary text-white py-4 rounded-2xl font-black shadow-lg shadow-secondary/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <Check size={20} className="animate-bounce" />
                          Logged!
                        </>
                      ) : (
                        'Log Expense'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setPlotToDelete(null);
          setExpenseToDelete(null);
        }}
        onConfirm={plotToDelete ? handleDeletePlot : handleDeleteExpense}
        message={plotToDelete 
          ? `Are you sure you want to permanently delete "${plots.find(p => p.id === plotToDelete)?.name}"? This will unassign all plants and remove all planters. This action cannot be undone.`
          : "Are you sure you want to permanently delete this expense? This action cannot be undone."
        }
        itemCount={1}
        isDeleting={isDeletingConfirmed}
      />
    </div>
  );
}
