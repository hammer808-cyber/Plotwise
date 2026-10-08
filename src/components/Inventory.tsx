import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Filter, ArrowRight, Info, Leaf, Droplets, Thermometer, AlertCircle, MoreVertical, CheckCircle2, XCircle, Check, Wrench, Eye, EyeOff } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/src/lib/utils';
import { useFirebase } from '../contexts/FirebaseContext';
import { useActivePlot } from '../contexts/ActivePlotContext';
import { db, collection, query, where, onSnapshot, handleFirestoreError, OperationType, addDoc, serverTimestamp, deleteDoc, doc, deleteField, batchDelete } from '../firebase';
import { getPlantInfo, PLANT_DATABASE } from '../constants/plants';
import { PLANT_PLACEHOLDER } from '../lib/plantImage';
import { Inhabitant, SpatialPlot, EventLog } from '../types';
import { calculateVigorIndex } from '../lib/botany';
import { Trash2, CheckSquare, Square, Table, LayoutGrid, ExternalLink, X, MapPin, Edit2, Download, CheckCircle, Plus, ChevronUp, ChevronDown, Activity, Droplets as WaterIcon, Bug, Sun, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { updateDoc } from 'firebase/firestore';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import HealthCheckWizard from './HealthCheckWizard';

export default function Inventory() {
  const { user } = useFirebase();
  const { activePlotId, activePlot } = useActivePlot();
  const [scope, setScope] = useState<'plot' | 'all'>('plot');
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [inhabitants, setInhabitants] = useState<Inhabitant[]>([]);
  const [spatialPlots, setSpatialPlots] = useState<SpatialPlot[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [planters, setPlanters] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'Grid' | 'Table'>('Table');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Inhabitant; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [inventoryType, setInventoryType] = useState<'Plants' | 'Equipment'>('Plants');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPlant, setEditingPlant] = useState<any | null>(null);
  const [editingEquipment, setEditingEquipment] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditEquipmentModalOpen, setIsEditEquipmentModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [healthCheckPlant, setHealthCheckPlant] = useState<Inhabitant | null>(null);
  const [newPlantData, setNewPlantData] = useState<any>({
    name: '',
    scientific: '',
    type: 'Herb',
    waterFreq: 'Regular',
    sunExposure: 'Full Sun',
    notes: '',
    quantity: 1
  });
  const [newEquipmentData, setNewEquipmentData] = useState<any>({
    name: '',
    category: 'Tools',
    condition: 'Good',
    quantity: 1,
    notes: ''
  });

  useEffect(() => {
    if (location.state?.openAddPlant) {
      const initialPlant = location.state.initialPlant;
      if (initialPlant) {
        setNewPlantData({
          name: initialPlant.name || '',
          scientific: initialPlant.scientific || '',
          type: initialPlant.type || 'Herb',
          waterFreq: initialPlant.water || 'Regular',
          sunExposure: initialPlant.sun || 'Full Sun',
          notes: initialPlant.description || '',
          quantity: 1
        });
      }
      setIsAddModalOpen(true);
      // Clear state
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useEffect(() => {
    if (!user) return;

    const plotsQ = query(collection(db, 'spatial_plots'), where('ownerUid', '==', user.uid));
    const unsubscribePlots = onSnapshot(plotsQ, (snapshot) => {
      setSpatialPlots(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SpatialPlot)));
    });

    const inhabitantsQ = query(collection(db, 'inhabitants'), where('ownerUid', '==', user.uid));
    const unsubscribeInhabitants = onSnapshot(inhabitantsQ, (snapshot) => {
      setInhabitants(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inhabitant)));
    });

    const logsQ = query(collection(db, 'event_logs'), where('ownerUid', '==', user.uid));
    const unsubscribeLogs = onSnapshot(logsQ, (snapshot) => {
      setEventLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventLog)));
    });

    const plantersQ = query(collection(db, 'planters'), where('ownerUid', '==', user.uid));
    const unsubscribePlanters = onSnapshot(plantersQ, (snapshot) => {
      setPlanters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const equipmentQ = query(collection(db, 'equipment'), where('ownerUid', '==', user.uid));
    const unsubscribeEquipment = onSnapshot(equipmentQ, (snapshot) => {
      setEquipment(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribePlots();
      unsubscribeInhabitants();
      unsubscribeLogs();
      unsubscribePlanters();
      unsubscribeEquipment();
    };
  }, [user]);

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.length || isDeleting) return;
    
    setIsDeleting(true);
    try {
      const collectionName = inventoryType === 'Plants' ? 'inhabitants' : 'equipment';
      await batchDelete(collectionName, selectedIds);
      setSelectedIds([]);
      setShowDeleteModal(false);
      toast.success(`Successfully deleted ${selectedIds.length} ${inventoryType.toLowerCase()}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${inventoryType.toLowerCase()}/batch`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditPlant = (plant: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPlant({ ...plant });
    setIsEditModalOpen(true);
  };

  const handleSavePlant = async () => {
    if (!editingPlant) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'inhabitants', editingPlant.id), {
        name: editingPlant.name,
        scientific: editingPlant.scientific || '',
        type: editingPlant.type,
        waterFreq: editingPlant.waterFreq,
        sunExposure: editingPlant.sunExposure,
        notes: editingPlant.notes || '',
        plotId: editingPlant.plotId,
        planterId: editingPlant.planterId,
        updatedAt: serverTimestamp()
      });
      
      toast.success('Plant details updated');
      
      // Success-to-close logic
      setTimeout(() => {
        setIsEditModalOpen(false);
        setIsSaving(false);
      }, 500);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inhabitants/${editingPlant.id}`);
      setIsSaving(false);
    }
  };

  const handleEditEquipment = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingEquipment({ ...item });
    setIsEditEquipmentModalOpen(true);
  };

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEquipment) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'equipment', editingEquipment.id), {
        name: editingEquipment.name,
        category: editingEquipment.category,
        condition: editingEquipment.condition,
        quantity: Number(editingEquipment.quantity),
        notes: editingEquipment.notes || '',
        updatedAt: serverTimestamp()
      });
      
      toast.success('Equipment updated');
      setIsEditEquipmentModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `equipment/${editingEquipment.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPlant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newPlantData.name) return;
    setIsSaving(true);
    try {
      const plantData = {
        ownerUid: user.uid,
        name: newPlantData.name,
        scientific: newPlantData.scientific || '',
        type: newPlantData.type,
        waterFreq: newPlantData.waterFreq,
        sunExposure: newPlantData.sunExposure,
        notes: newPlantData.notes || '',
        image: getPlantInfo(newPlantData.name)?.image || PLANT_PLACEHOLDER,
        status: 'Healthy',
        vigor: 5,
        daysActive: 0,
        lastWatered: serverTimestamp(),
        nextWatering: format(addDays(new Date(), 2), 'yyyy-MM-dd'),
        tempRange: '65-85°F',
        gridPosition: { x: 0, y: 0 },
        planterId: deleteField(),
        plotId: deleteField(),
        createdAt: serverTimestamp()
      };

      const qty = Math.max(1, Math.min(12, Number(newPlantData.quantity) || 1));
      for (let i = 0; i < qty; i++) {
        await addDoc(collection(db, 'inhabitants'), plantData);
      }
      toast.success(qty > 1 ? `${qty} plants added to your list!` : 'Plant added to your list!');
      setIsAddModalOpen(false);
      setLibrarySearch('');
      setNewPlantData({
        name: '',
        scientific: '',
        type: 'Herb',
        waterFreq: 'Regular',
        sunExposure: 'Full Sun',
        notes: '',
        quantity: 1
      });
    } catch (error) {
      console.error('Error adding plant:', error);
      toast.error('Failed to add plant.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newEquipmentData.name) return;
    setIsSaving(true);
    try {
      const equipData = {
        ownerUid: user.uid,
        name: newEquipmentData.name,
        category: newEquipmentData.category,
        condition: newEquipmentData.condition,
        quantity: Number(newEquipmentData.quantity),
        notes: newEquipmentData.notes || '',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'equipment'), equipData);
      toast.success('Equipment added to inventory!');
      setIsAddModalOpen(false);
      setNewEquipmentData({
        name: '',
        category: 'Tools',
        condition: 'Good',
        quantity: 1,
        notes: ''
      });
    } catch (error) {
      console.error('Error adding equipment:', error);
      toast.error('Failed to add equipment.');
    } finally {
      setIsSaving(false);
    }
  };

  const [showAdvanced, setShowAdvanced] = useState(false);

  const getBedCapacity = (planterId: string) => {
    const planter = planters.find(p => p.id === planterId);
    if (!planter) return 0;
    return planter.size.w * planter.size.h;
  };

  const getBedUsage = (planterId: string) => {
    return inhabitants.filter(p => p.planterId === planterId).length;
  };

  const getPlantStatus = (plant: any) => {
    if (plant.plotId && plant.planterId && plant.gridPosition && (plant.gridPosition.x !== 0 || plant.gridPosition.y !== 0)) {
      return { label: 'Mapped', color: 'bg-emerald-500', icon: '🟢' };
    }
    if (plant.plotId) {
      return { label: 'Assigned', color: 'bg-amber-500', icon: '🟡' };
    }
    return { label: 'Unassigned', color: 'bg-rose-500', icon: '🔴' };
  };

  const handleSort = (key: keyof Inhabitant) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedItems = [...(inventoryType === 'Plants' ? inhabitants : equipment)].sort((a: any, b: any) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const filteredItems = sortedItems.filter(item => {
    const matchesFilter = filter === 'All' || (inventoryType === 'Plants' ? item.type === filter : item.category === filter);
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (item.latinName?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    // Active-plot scope for plants: unassigned plants stay visible; equipment is global.
    const matchesPlot = inventoryType !== 'Plants' || scope === 'all' || !activePlotId || item.plotId === activePlotId || !item.plotId;
    return matchesFilter && matchesSearch && matchesPlot;
  });

  // Library quick-pick for the add-plant form (keeps the library's real care data).
  const libraryMatches = (() => {
    const q = librarySearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return PLANT_DATABASE.filter(p =>
      p.name.toLowerCase().includes(q) || p.scientific.toLowerCase().includes(q)
    ).slice(0, 6);
  })();

  const renderTable = () => (
    <div className="overflow-x-auto bg-surface-container-low rounded-[2rem] border border-outline-variant/10 shadow-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-outline-variant/20 bg-surface-container-high/50">
            <th className="p-4 w-12">
              <button 
                onClick={() => setSelectedIds(selectedIds.length === filteredItems.length ? [] : filteredItems.map(i => i.id))}
                className="text-primary touch-target"
              >
                {selectedIds.length === filteredItems.length ? <CheckSquare size={20} /> : <Square size={20} />}
              </button>
            </th>
            <th className="p-4 font-label text-[10px] uppercase tracking-widest text-on-surface-variant cursor-pointer" onClick={() => handleSort('name')}>
              <div className="flex items-center gap-1">
                Species/Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
              </div>
            </th>
            <th className="p-4 font-label text-[10px] uppercase tracking-widest text-on-surface-variant cursor-pointer" onClick={() => handleSort('vigorIndex')}>
              <div className="flex items-center gap-1">
                Vigor Index {sortConfig.key === 'vigorIndex' && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
              </div>
            </th>
            <th className="p-4 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Water</th>
            <th className="p-4 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Sun</th>
            <th className="p-4 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Status</th>
            <th className="p-4 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Plot</th>
            <th className="p-4 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Last Event</th>
            <th className="p-4 font-label text-[10px] uppercase tracking-widest text-on-surface-variant text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {filteredItems.map((item: any, idx) => {
            const plot = spatialPlots.find(p => p.id === item.plotId);
            const lastEvent = eventLogs.filter(l => l.targetId === item.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            
            return (
              <tr key={item.id} className={cn(
                "hover:bg-primary/5 transition-colors group",
                idx % 2 === 0 ? "bg-white" : "bg-surface-container-lowest"
              )}>
                <td className="p-4">
                  <button onClick={(e) => toggleSelection(item.id, e)} className="text-primary touch-target">
                    {selectedIds.includes(item.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                  </button>
                </td>
                <td className="p-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-on-surface">{item.name}</span>
                    <span className="text-[10px] italic text-on-surface-variant">{item.latinName || item.scientific}</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full", item.vigorIndex > 70 ? "bg-emerald-500" : item.vigorIndex > 40 ? "bg-amber-500" : "bg-rose-500")}
                        style={{ width: `${item.vigorIndex || 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold">{item.vigorIndex || 0}%</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface whitespace-nowrap">
                    <Droplets size={14} className="text-sky-600 shrink-0" />
                    {item.waterFreq || '—'}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface whitespace-nowrap">
                    <Sun size={14} className="text-amber-500 shrink-0" />
                    {item.sunExposure || '—'}
                  </div>
                </td>
                <td className="p-4">
                  <span className={cn(
                    "px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-md",
                    item.status === 'Struggling' ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                  )}>
                    {item.status}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                    <MapPin size={12} />
                    {plot?.name || 'Unassigned'}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex flex-col text-[10px]">
                    <span className="font-bold text-primary">{lastEvent?.type || 'No events'}</span>
                    <span className="text-on-surface-variant">{lastEvent ? format(new Date(lastEvent.date), 'MMM d') : '-'}</span>
                  </div>
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setHealthCheckPlant(item)} title="Log care" aria-label={`Log care for ${item.name}`} className="p-2 hover:bg-primary/10 rounded-lg text-primary transition-colors touch-target">
                      <Stethoscope size={16} />
                    </button>
                    <button onClick={() => navigate(`/plant/${item.id}`)} className="p-2 hover:bg-primary/10 rounded-lg text-primary transition-colors touch-target">
                      <ArrowRight size={16} />
                    </button>
                    <button onClick={(e) => handleEditPlant(item, e)} className="p-2 hover:bg-secondary/10 rounded-lg text-secondary transition-colors touch-target">
                      <Edit2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="px-6 max-w-5xl mx-auto py-8 space-y-12 pb-32">
      {/* Editorial Header */}
      <section className="flex flex-col md:flex-row justify-between items-start gap-6 relative">
        <div className="absolute -top-10 -left-10 opacity-5 pointer-events-none">
          <Leaf size={140} className="text-primary rotate-45" />
        </div>
        <div className="flex-1 relative z-10">
          <motion.span 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-label text-xs uppercase tracking-[0.2em] text-secondary font-bold mb-2 block"
          >
            Curation & Growth
          </motion.span>
          <motion.h2 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-headline text-5xl md:text-6xl font-extrabold tracking-tighter text-primary leading-none mb-6"
          >
            The Garden Inventory
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="font-body text-on-surface-variant max-w-md text-lg leading-relaxed"
          >
            Detailed records of your botanical inhabitants, tracking vitality from seedling to bloom.
          </motion.p>

          {/* Plot scope toggle — plants follow the active plot */}
          {inventoryType === 'Plants' && activePlot && (
            <div className="flex bg-surface-variant/20 p-1 rounded-xl text-xs font-bold w-fit mt-6">
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
          )}

          {/* Inventory Type Toggle */}
          <div className="flex flex-col sm:flex-row gap-4 mt-8">
            <div className="flex gap-4">
              <button 
                onClick={() => { setInventoryType('Plants'); setFilter('All'); setSelectedIds([]); }}
                className={cn(
                  "px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all touch-target",
                  inventoryType === 'Plants' ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                )}
              >
                Botanical Entities
              </button>
              <button 
                onClick={() => { setInventoryType('Equipment'); setFilter('All'); setSelectedIds([]); }}
                className={cn(
                  "px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all touch-target",
                  inventoryType === 'Equipment' ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                )}
              >
                Tools & Equipment
              </button>
            </div>
            
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={cn(
                "px-6 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2 touch-target",
                showAdvanced ? "bg-secondary text-white" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
              )}
            >
              {showAdvanced ? <EyeOff size={16} /> : <Eye size={16} />}
              {showAdvanced ? 'Hide Advanced Data' : 'View Advanced Data'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 w-full md:w-auto relative z-10">
          <div className="flex flex-col sm:flex-row gap-3">
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-4 px-8 py-4 bg-primary text-on-primary rounded-[2rem] font-bold transition-all active:scale-95 shadow-lg shadow-primary/20"
            >
              <div className="p-2 bg-white/20 rounded-xl">
                <Plus size={20} />
              </div>
              <div className="text-left">
                <span className="block leading-none text-lg">Add {inventoryType === 'Plants' ? 'Plant' : 'Item'}</span>
                <span className="text-[10px] opacity-60 font-black uppercase tracking-tighter">To Inventory</span>
              </div>
            </motion.button>

            <AnimatePresence>
              {selectedIds.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ y: -4, scale: 1.02, backgroundColor: '#ef4444' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowDeleteModal(true)}
                  disabled={isDeleting}
                  className="flex items-center gap-3 px-8 py-4 bg-error text-on-error rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-error/20"
                >
                  <Trash2 size={20} />
                  <span>Delete ({selectedIds.length})</span>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Productivity Checklist */}
      <section className="bg-surface-container-low p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Check size={18} />
            </div>
            <h3 className="font-headline font-bold text-lg">Inventory Productivity</h3>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">3 Tasks Pending</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            'Review Recent Growth',
            'Update Plant Status',
            'Log New Observations'
          ].map((item) => (
            <label key={item} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-outline-variant/5 cursor-pointer hover:bg-primary/5 transition-colors group">
              <input type="checkbox" className="rounded text-primary focus:ring-primary/20" />
              <span className="text-xs font-bold text-on-surface-variant group-hover:text-primary">{item}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Search & Filter */}
      <section className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
          <input 
            type="text" 
            placeholder={`Search ${inventoryType.toLowerCase()}...`} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 hide-scrollbar">
          {(inventoryType === 'Plants' 
            ? ['All', 'Vegetable', 'Herb', 'Flower', 'Fruit', 'Succulent']
            : ['All', 'Tools', 'Irrigation', 'Soil', 'Pest Control', 'Safety']
          ).map((cat) => (
            <button 
              key={cat}
              onClick={() => setFilter(cat)}
              className={cn(
                "px-6 py-3 rounded-full font-bold text-sm whitespace-nowrap transition-all active:scale-95",
                filter === cat ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* View Mode Toggle */}
      <div className="flex justify-end gap-2">
        <button 
          onClick={() => setViewMode('Grid')}
          className={cn(
            "p-2 rounded-lg transition-all touch-target",
            viewMode === 'Grid' ? "bg-primary text-white" : "bg-surface-container-low text-on-surface-variant"
          )}
        >
          <LayoutGrid size={20} />
        </button>
        <button 
          onClick={() => setViewMode('Table')}
          className={cn(
            "p-2 rounded-lg transition-all touch-target",
            viewMode === 'Table' ? "bg-primary text-white" : "bg-surface-container-low text-on-surface-variant"
          )}
        >
          <Table size={20} />
        </button>
      </div>

      {/* Inventory Content */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-20 px-6 bg-surface-container-low rounded-[2rem] border border-dashed border-outline-variant/30">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
            <Leaf size={28} />
          </div>
          <h3 className="font-headline text-2xl font-black mb-2">No plants on your list yet</h3>
          <p className="text-on-surface-variant max-w-sm mx-auto mb-6">
            Build your plant list first — track water, sun and health for each plant.
            You can place them into beds whenever you're ready.
          </p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-on-primary rounded-[2rem] font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all"
          >
            <Plus size={20} /> Add your first plant
          </button>
        </div>
      ) : viewMode === 'Table' && inventoryType === 'Plants' ? renderTable() : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredItems.map((item, idx) => (
              <motion.div 
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                onClick={() => inventoryType === 'Plants' && navigate(`/plant/${item.id}`)}
                role="button"
                tabIndex={0}
                aria-label={`${inventoryType === 'Plants' ? 'Plant' : 'Equipment'}: ${item.name}. Status: ${item.status}. Click to view details.`}
                onKeyDown={(e) => e.key === 'Enter' && inventoryType === 'Plants' && navigate(`/plant/${item.id}`)}
                className={cn(
                  "rounded-[2.5rem] p-8 relative overflow-hidden group cursor-pointer border border-outline-variant/10 hover:shadow-2xl transition-all duration-500 glass-card touch-target",
                  selectedIds.includes(item.id) ? "ring-4 ring-primary ring-offset-4" : "",
                  idx % 3 === 0 ? "md:col-span-7 bg-surface-container-lowest" : idx % 3 === 1 ? "md:col-span-5 bg-primary text-white organic-border" : "md:col-span-6 bg-surface-container-low"
                )}
              >
              <div className="flex justify-between items-start mb-12 relative z-10">
                <div className="flex items-start gap-4">
                  <button 
                    onClick={(e) => toggleSelection(item.id, e)}
                    aria-label={selectedIds.includes(item.id) ? `Deselect ${item.name}` : `Select ${item.name}`}
                    className={cn(
                      "mt-1 transition-all active:scale-90 touch-target",
                      idx % 3 === 1 ? "text-white" : "text-primary"
                    )}
                  >
                    {selectedIds.includes(item.id) ? <CheckSquare size={24} /> : <Square size={24} />}
                  </button>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                    {inventoryType === 'Plants' ? (
                      <>
                        <span className={cn(
                          "px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full",
                          item.status === 'Struggling' ? "bg-tertiary-fixed text-on-tertiary-fixed-variant" : "bg-primary-container text-on-primary-container"
                        )}>
                          {item.status}
                        </span>
                        <span className={cn("text-xs font-bold tracking-wide", idx % 3 === 1 ? "text-white/60" : "text-outline")}>{item.type}</span>
                        <div className={cn(
                          "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                          idx % 3 === 1 ? "bg-white/20 text-white" : "bg-surface-container-highest text-on-surface-variant"
                        )}>
                          <span>{getPlantStatus(item).icon}</span>
                          <span>{getPlantStatus(item).label}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className={cn(
                          "px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full",
                          item.condition === 'Poor' ? "bg-error-container text-on-error-container" : "bg-primary-container text-on-primary-container"
                        )}>
                          {item.condition}
                        </span>
                        <span className={cn("text-xs font-bold tracking-wide", idx % 3 === 1 ? "text-white/60" : "text-outline")}>{item.category}</span>
                      </>
                    )}
                  </div>
                  <h3 className="font-headline text-3xl font-black tracking-tight">{item.name}</h3>
                  {inventoryType === 'Plants' && (
                    <p className={cn("text-sm italic mt-1", idx % 3 === 1 ? "text-white/70" : "text-on-surface-variant")}>{item.latinName || item.scientific}</p>
                  )}
                  {inventoryType === 'Plants' && (
                    <div className={cn("flex items-center gap-4 mt-3 text-xs font-semibold", idx % 3 === 1 ? "text-white/80" : "text-on-surface-variant")}>
                      <span className="flex items-center gap-1.5">
                        <Droplets size={13} className={idx % 3 === 1 ? "text-white" : "text-sky-600"} />
                        {item.waterFreq || '—'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Sun size={13} className={idx % 3 === 1 ? "text-white" : "text-amber-500"} />
                        {item.sunExposure || '—'}
                      </span>
                    </div>
                  )}
                  {inventoryType === 'Equipment' && (
                    <p className={cn("text-sm mt-1", idx % 3 === 1 ? "text-white/70" : "text-on-surface-variant")}>Qty: {item.quantity}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                  {inventoryType === 'Plants' ? (
                    <>
                      <span className={cn("block text-[2.5rem] font-headline font-black leading-none", idx % 3 === 1 ? "text-white" : "text-primary")}>{item.daysActive || 0}</span>
                      <span className={cn("text-[10px] uppercase font-black tracking-tighter", idx % 3 === 1 ? "text-white/50" : "text-outline")}>Days Active</span>
                    </>
                  ) : (
                    <div className={cn(
                      "w-16 h-16 rounded-3xl flex items-center justify-center",
                      idx % 3 === 1 ? "bg-white/20" : "bg-primary/10"
                    )}>
                      <Wrench size={32} className={idx % 3 === 1 ? "text-white" : "text-primary"} />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-end justify-between relative z-10">
                <div className="space-y-4 w-full max-w-[200px]">
                  <AnimatePresence>
                    {showAdvanced && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        {inventoryType === 'Plants' ? (
                          <div>
                            <div className={cn("flex justify-between text-[10px] font-black mb-2 uppercase tracking-widest", idx % 3 === 1 ? "text-white/50" : "text-on-surface-variant")}>
                              <span>Vigor Index</span>
                              <span>{item.vigorIndex || item.vigor}/100</span>
                            </div>
                            <div className={cn("h-2 w-full rounded-full overflow-hidden shadow-inner", idx % 3 === 1 ? "bg-white/20" : "bg-surface-container-high")}>
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${(item.vigorIndex || (item.vigor * 20))}%` }}
                                transition={{ duration: 1, delay: 0.5 }}
                                className={cn("h-full rounded-full", idx % 3 === 1 ? "bg-white" : item.status === 'Struggling' ? "bg-tertiary" : "bg-primary")}
                              ></motion.div>
                            </div>
                          </div>
                        ) : (
                          <div className={cn("text-xs font-medium", idx % 3 === 1 ? "text-white/70" : "text-on-surface-variant")}>
                            {item.notes || 'No maintenance notes'}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                
                <div className="flex gap-2">
                  {inventoryType === 'Plants' ? (
                    <>
                      <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
                        idx % 3 === 1 ? "bg-white text-primary" : "bg-primary text-white shadow-lg shadow-primary/20"
                      )}>
                        <ArrowRight size={20} />
                      </div>
                      
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => { e.stopPropagation(); setHealthCheckPlant(item); }}
                        title="Log care"
                        aria-label={`Log care for ${item.name}`}
                        className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
                          idx % 3 === 1 ? "bg-white/20 text-white hover:bg-white/30" : "bg-surface-container-high text-primary hover:bg-surface-container-highest shadow-sm"
                        )}
                      >
                        <Stethoscope size={20} />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => handleEditPlant(item, e)}
                        className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
                          idx % 3 === 1 ? "bg-white/20 text-white hover:bg-white/30" : "bg-surface-container-high text-primary hover:bg-surface-container-highest shadow-sm"
                        )}
                      >
                        <Edit2 size={20} />
                      </motion.button>
                    </>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => handleEditEquipment(item, e)}
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
                        idx % 3 === 1 ? "bg-white text-primary" : "bg-primary text-white shadow-lg shadow-primary/20"
                      )}
                    >
                      <Edit2 size={20} />
                    </motion.button>
                  )}
                </div>
              </div>

              {/* Background Decoration */}
              <div className="absolute top-0 right-0 w-48 h-48 -mr-12 -mt-12 opacity-5 pointer-events-none">
                {inventoryType === 'Plants' ? <Leaf size={200} className="fill-current" /> : <Wrench size={200} className="fill-current" />}
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
      )}

      {/* Curator's Note */}
      <motion.section 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        className="p-10 border border-outline-variant/20 rounded-[3rem] glass-card flex flex-col md:flex-row gap-8 items-center shadow-inner relative overflow-hidden"
      >
        <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none">
          <Leaf size={160} className="text-primary rotate-12" />
        </div>
        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-xl shrink-0 relative z-10">
          <Info className="text-primary" size={32} />
        </div>
        <div className="space-y-2 relative z-10">
          <h4 className="font-headline text-2xl font-black text-on-surface tracking-tight">Curator's Note</h4>
          <p className="text-on-surface-variant text-lg leading-relaxed italic font-medium">
            "Plants are the silent historians of our care. The Rosemary requires a shift to better drainage before the next full moon to stabilize its vigor index."
          </p>
        </div>
      </motion.section>

      {/* Add Item Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[3rem] shadow-2xl overflow-hidden"
            >
              <form onSubmit={inventoryType === 'Plants' ? handleAddPlant : handleAddEquipment} className="p-8 space-y-8">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 text-primary rounded-xl">
                      <Plus size={24} />
                    </div>
                    <h3 className="text-3xl font-headline font-black tracking-tight italic">Add New {inventoryType === 'Plants' ? 'Plant' : 'Equipment'}</h3>
                  </div>
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-primary/5 rounded-full text-on-surface-variant">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  {inventoryType === 'Plants' ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Quick pick from library</label>
                        <input
                          value={librarySearch}
                          onChange={(e) => setLibrarySearch(e.target.value)}
                          placeholder="Search the plant library…"
                          className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                        {libraryMatches.length > 0 && (
                          <div className="rounded-2xl overflow-hidden border border-outline-variant/20 divide-y divide-outline-variant/10 max-h-56 overflow-y-auto">
                            {libraryMatches.map(m => (
                              <button
                                type="button"
                                key={m.name}
                                onClick={() => {
                                  setNewPlantData({
                                    ...newPlantData,
                                    name: m.name,
                                    scientific: m.scientific,
                                    type: m.type,
                                    waterFreq: m.water,
                                    sunExposure: m.sun,
                                    notes: m.description || newPlantData.notes
                                  });
                                  setLibrarySearch('');
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-primary/5 transition-colors"
                              >
                                <img src={m.image} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-bold text-sm truncate">{m.name}</div>
                                  <div className="text-[11px] italic text-on-surface-variant truncate">{m.scientific}</div>
                                </div>
                                <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 shrink-0">{m.type}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Plant Name</label>
                        <input 
                          required
                          value={newPlantData.name}
                          onChange={(e) => setNewPlantData({ ...newPlantData, name: e.target.value })}
                          placeholder="e.g., Roma Tomato"
                          className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Scientific Name</label>
                        <input 
                          value={newPlantData.scientific}
                          onChange={(e) => setNewPlantData({ ...newPlantData, scientific: e.target.value })}
                          placeholder="e.g., Solanum lycopersicum"
                          className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Type</label>
                          <select 
                            value={newPlantData.type}
                            onChange={(e) => setNewPlantData({ ...newPlantData, type: e.target.value })}
                            className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                          >
                            {Array.from(new Set(['Herb', 'Vegetable', 'Fruit', 'Flower', 'Succulent', newPlantData.type])).map(o => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Watering</label>
                          <select 
                            value={newPlantData.waterFreq}
                            onChange={(e) => setNewPlantData({ ...newPlantData, waterFreq: e.target.value })}
                            className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                          >
                            {Array.from(new Set(['Regular', 'Frequent', 'Sparse', newPlantData.waterFreq])).map(o => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Sun Exposure</label>
                        <select 
                          value={newPlantData.sunExposure}
                          onChange={(e) => setNewPlantData({ ...newPlantData, sunExposure: e.target.value })}
                          className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                        >
                          {Array.from(new Set(['Full Sun', 'Partial Shade', 'Full Shade', newPlantData.sunExposure])).map(o => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Quantity</label>
                        <div className="flex items-center gap-4 bg-surface-container-low rounded-2xl px-4 py-2 w-fit">
                          <button
                            type="button"
                            onClick={() => setNewPlantData({ ...newPlantData, quantity: Math.max(1, (Number(newPlantData.quantity) || 1) - 1) })}
                            className="p-2 rounded-full hover:bg-primary/10 text-primary font-black text-xl leading-none touch-target"
                            aria-label="Decrease quantity"
                          >−</button>
                          <span className="font-black text-lg w-8 text-center">{newPlantData.quantity}</span>
                          <button
                            type="button"
                            onClick={() => setNewPlantData({ ...newPlantData, quantity: Math.min(12, (Number(newPlantData.quantity) || 1) + 1) })}
                            className="p-2 rounded-full hover:bg-primary/10 text-primary font-black text-xl leading-none touch-target"
                            aria-label="Increase quantity"
                          >+</button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Notes</label>
                        <textarea 
                          value={newPlantData.notes}
                          onChange={(e) => setNewPlantData({ ...newPlantData, notes: e.target.value })}
                          placeholder="Any special care instructions..."
                          className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all min-h-[100px] resize-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Item Name</label>
                        <input 
                          required
                          value={newEquipmentData.name}
                          onChange={(e) => setNewEquipmentData({ ...newEquipmentData, name: e.target.value })}
                          placeholder="e.g., Garden Trowel"
                          className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Category</label>
                          <select 
                            value={newEquipmentData.category}
                            onChange={(e) => setNewEquipmentData({ ...newEquipmentData, category: e.target.value })}
                            className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                          >
                            <option value="Tools">Tools</option>
                            <option value="Irrigation">Irrigation</option>
                            <option value="Soil">Soil</option>
                            <option value="Pest Control">Pest Control</option>
                            <option value="Safety">Safety</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Condition</label>
                          <select 
                            value={newEquipmentData.condition}
                            onChange={(e) => setNewEquipmentData({ ...newEquipmentData, condition: e.target.value })}
                            className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                          >
                            <option value="New">New</option>
                            <option value="Good">Good</option>
                            <option value="Fair">Fair</option>
                            <option value="Poor">Poor</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Quantity</label>
                        <input 
                          type="number"
                          min="1"
                          value={newEquipmentData.quantity}
                          onChange={(e) => setNewEquipmentData({ ...newEquipmentData, quantity: e.target.value })}
                          className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Notes</label>
                        <textarea 
                          value={newEquipmentData.notes}
                          onChange={(e) => setNewEquipmentData({ ...newEquipmentData, notes: e.target.value })}
                          placeholder="Storage location, last maintenance, etc..."
                          className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all min-h-[100px] resize-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <button 
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="flex-1 py-4 rounded-2xl font-black text-on-surface-variant hover:bg-surface-container-high transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={isSaving}
                      className="flex-1 bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                    >
                      {isSaving ? 'Adding...' : `Add to ${inventoryType}`}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Plant Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingPlant && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[3rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-8 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 text-primary rounded-xl">
                      <Edit2 size={24} />
                    </div>
                    <h3 className="text-3xl font-headline font-black tracking-tight italic">Edit Plant Details</h3>
                  </div>
                  <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-primary/5 rounded-full text-on-surface-variant">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="p-4 bg-surface-container-low rounded-2xl flex items-center gap-4">
                    <img src={editingPlant.image} alt={editingPlant.name} className="w-16 h-16 rounded-xl object-cover" />
                    <div className="flex-1">
                      <input 
                        value={editingPlant.name}
                        onChange={(e) => setEditingPlant({ ...editingPlant, name: e.target.value })}
                        className="w-full bg-transparent border-none font-bold text-lg p-0 focus:ring-0"
                        placeholder="Plant Name"
                      />
                      <input 
                        value={editingPlant.scientific}
                        onChange={(e) => setEditingPlant({ ...editingPlant, scientific: e.target.value })}
                        className="w-full bg-transparent border-none text-xs text-on-surface-variant italic p-0 focus:ring-0"
                        placeholder="Scientific Name"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Type</label>
                      <select 
                        value={editingPlant.type}
                        onChange={(e) => setEditingPlant({ ...editingPlant, type: e.target.value })}
                        className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                      >
                        <option value="Herb">Herb</option>
                        <option value="Vegetable">Vegetable</option>
                        <option value="Fruit">Fruit</option>
                        <option value="Flower">Flower</option>
                        <option value="Succulent">Succulent</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Watering</label>
                      <select 
                        value={editingPlant.waterFreq}
                        onChange={(e) => setEditingPlant({ ...editingPlant, waterFreq: e.target.value })}
                        className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                      >
                        <option value="Regular">Regular</option>
                        <option value="Frequent">Frequent</option>
                        <option value="Sparse">Sparse</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Sun Exposure</label>
                    <select 
                      value={editingPlant.sunExposure}
                      onChange={(e) => setEditingPlant({ ...editingPlant, sunExposure: e.target.value })}
                      className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                    >
                      <option value="Full Sun">Full Sun</option>
                      <option value="Partial Shade">Partial Shade</option>
                      <option value="Full Shade">Full Shade</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Notes</label>
                    <textarea 
                      value={editingPlant.notes || ''}
                      onChange={(e) => setEditingPlant({ ...editingPlant, notes: e.target.value })}
                      className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all min-h-[80px] resize-none"
                      placeholder="Care instructions..."
                    />
                  </div>

                  <div className="space-y-4 pt-4 border-t border-outline-variant/10">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Spatial Assignment</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Select Plot</label>
                        <select 
                          value={editingPlant.plotId || ''}
                          onChange={(e) => setEditingPlant({ ...editingPlant, plotId: e.target.value, planterId: null })}
                          className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                        >
                          <option value="">Unassigned</option>
                          {spatialPlots.map(plot => (
                            <option key={plot.id} value={plot.id}>{plot.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Select Bed</label>
                        <select 
                          value={editingPlant.planterId || ''}
                          disabled={!editingPlant.plotId}
                          onChange={(e) => setEditingPlant({ ...editingPlant, planterId: e.target.value })}
                          className={cn(
                            "w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none",
                            !editingPlant.plotId && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <option value="">No Bed Selected</option>
                          {planters
                            .filter(p => p.plotId === editingPlant.plotId)
                            .map(planter => {
                              const capacity = getBedCapacity(planter.id);
                              const usage = getBedUsage(planter.id);
                              const isFull = usage >= capacity && planter.id !== editingPlant.planterId;
                              return (
                                <option key={planter.id} value={planter.id} disabled={isFull}>
                                  {planter.name} ({usage}/{capacity} {isFull ? '- FULL' : 'slots'})
                                </option>
                              );
                            })}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button 
                      type="button"
                      onClick={() => setIsEditModalOpen(false)}
                      className="flex-1 py-4 rounded-2xl font-black text-on-surface-variant hover:bg-surface-container-high transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSavePlant}
                      disabled={isSaving}
                      className="flex-1 bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <CheckCircle size={20} className="animate-bounce" />
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Edit Equipment Modal */}
      <AnimatePresence>
        {isEditEquipmentModalOpen && editingEquipment && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditEquipmentModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[3rem] shadow-2xl overflow-hidden"
            >
              <form onSubmit={handleSaveEquipment} className="p-8 space-y-8">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 text-primary rounded-xl">
                      <Edit2 size={24} />
                    </div>
                    <h3 className="text-3xl font-headline font-black tracking-tight italic">Edit Equipment</h3>
                  </div>
                  <button type="button" onClick={() => setIsEditEquipmentModalOpen(false)} className="p-2 hover:bg-primary/5 rounded-full text-on-surface-variant">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Item Name</label>
                    <input 
                      required
                      value={editingEquipment.name}
                      onChange={(e) => setEditingEquipment({ ...editingEquipment, name: e.target.value })}
                      className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Category</label>
                      <select 
                        value={editingEquipment.category}
                        onChange={(e) => setEditingEquipment({ ...editingEquipment, category: e.target.value })}
                        className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                      >
                        <option value="Tools">Tools</option>
                        <option value="Irrigation">Irrigation</option>
                        <option value="Soil">Soil</option>
                        <option value="Pest Control">Pest Control</option>
                        <option value="Safety">Safety</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Condition</label>
                      <select 
                        value={editingEquipment.condition}
                        onChange={(e) => setEditingEquipment({ ...editingEquipment, condition: e.target.value })}
                        className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                      >
                        <option value="New">New</option>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                        <option value="Poor">Poor</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Quantity</label>
                    <input 
                      type="number"
                      min="1"
                      value={editingEquipment.quantity}
                      onChange={(e) => setEditingEquipment({ ...editingEquipment, quantity: e.target.value })}
                      className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4">Notes</label>
                    <textarea 
                      value={editingEquipment.notes}
                      onChange={(e) => setEditingEquipment({ ...editingEquipment, notes: e.target.value })}
                      className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all min-h-[100px] resize-none"
                    />
                  </div>

                  <div className="flex gap-4">
                    <button 
                      type="button"
                      onClick={() => setIsEditEquipmentModalOpen(false)}
                      className="flex-1 py-4 rounded-2xl font-black text-on-surface-variant hover:bg-surface-container-high transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={isSaving}
                      className="flex-1 bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteSelected}
        message={`Are you sure you want to permanently delete the selected ${inventoryType.toLowerCase()}? This action cannot be undone.`}
        itemCount={selectedIds.length}
        isDeleting={isDeleting}
      />

      {healthCheckPlant && (
        <HealthCheckWizard
          plant={healthCheckPlant}
          onClose={() => setHealthCheckPlant(null)}
        />
      )}
    </div>
  );
}
