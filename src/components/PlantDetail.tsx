import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Heart, Share2, Droplets, Sun, Thermometer, Info, Calendar, Scissors, AlertCircle, ChevronRight, Check, Activity, X, BookOpen, Trash2, Settings2, ClipboardList, Plus, Loader2, CheckCircle2, Clock, Stethoscope, RefreshCw, Camera } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { cn } from '@/src/lib/utils';
import { useFirebase } from '../contexts/FirebaseContext';
import { recalculateVigor, type VigorBreakdown } from '../lib/vigor';
import { waterNowUpdate } from '../lib/wateringUpdate';
import { db, doc, onSnapshot, updateDoc, deleteDoc, handleFirestoreError, OperationType, serverTimestamp, query, collection, where, ref, uploadBytes, getDownloadURL, storage, addDoc, runTransaction } from '../firebase';
import { toast } from 'sonner';
import { Inhabitant, EventLog } from '../types';
import { calculateGDD, calculateVigorIndex, processInhabitantEliteMetrics } from '../services/botanyService';
import { fetchLongBeachWeather } from '../services/weatherService';
import { format } from 'date-fns';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import HealthCheckWizard from './HealthCheckWizard';
import { getPlantInfo } from '../constants/plants';
import PlantPhotoLog from './PlantPhotoLog';
import { PLANT_PLACEHOLDER } from '../lib/plantImage';

export default function PlantDetail() {
  const { user } = useFirebase();
  const navigate = useNavigate();
  const { id } = useParams();
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [plant, setPlant] = useState<Inhabitant | null>(null);
  const [showHealthCheck, setShowHealthCheck] = useState(false);
  const [refreshingPhoto, setRefreshingPhoto] = useState(false);

  const refreshPhoto = async () => {
    const info = getPlantInfo(plant.name);
    if (!info?.image) { toast.info('No library photo for this plant yet'); return; }
    if (plant.image === info.image) { toast.info('Already using the latest photo'); return; }
    setRefreshingPhoto(true);
    try {
      await updateDoc(doc(db, 'inhabitants', id), { image: info.image });
      toast.success('Photo refreshed');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'inhabitant');
      toast.error('Could not refresh the photo');
    } finally {
      setRefreshingPhoto(false);
    }
  };
  const [treatments, setTreatments] = useState<any[]>([]);
  const [taskHistory, setTaskHistory] = useState<any[]>([]);
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const [migratingTasks, setMigratingTasks] = useState<Set<string>>(new Set());
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [weather, setWeather] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    status: '',
    vigorIndex: 0,
    notes: '',
    startDate: '',
    endDate: '',
    baseTemperature: 10,
    cropCoefficient: 1.0
  });

  useEffect(() => {
    if (!id) return;

    const unsubscribe = onSnapshot(doc(db, 'inhabitants', id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Inhabitant;
        if (data) {
          setPlant({ id: docSnap.id, ...data });
          setEditForm({
            name: data.name || '',
            status: data.status || 'Healthy',
            vigorIndex: data.vigorIndex || 80,
            notes: data.notes || '',
            startDate: data.startDate || '',
            endDate: data.endDate || '',
            baseTemperature: data.baseTemperature || 10,
            cropCoefficient: data.cropCoefficient || 1.0
          });
        }
      } else {
        setPlant(null);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `inhabitants/${id}`);
      setLoading(false);
    });

    // Fetch treatments for this plant
    const treatmentsQ = query(collection(db, 'treatments'), where('plantId', '==', id));
    const unsubscribeTreatments = onSnapshot(treatmentsQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTreatments(list.sort((a: any, b: any) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'treatments');
    });

    // Fetch task history for this plant
    const historyQ = query(collection(db, 'task_history'), where('plantId', '==', id));
    const unsubscribeHistory = onSnapshot(historyQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTaskHistory(list.sort((a: any, b: any) => {
        const dateA = a.completionDate?.toDate?.() || new Date(0);
        const dateB = b.completionDate?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'task_history');
    });

    // Fetch active tasks for this plant
    const tasksQ = query(collection(db, 'tasks'), where('plantId', '==', id));
    const unsubscribeTasks = onSnapshot(tasksQ, (snapshot) => {
      setActiveTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    });

    // Fetch all logs for elite metrics
    const allLogsQ = query(collection(db, 'event_logs'), where('ownerUid', '==', user.uid));
    const unsubscribeAllLogs = onSnapshot(allLogsQ, (snapshot) => {
      setEventLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventLog)));
    });

    // Fetch expenses for CPY
    const expensesQ = query(collection(db, 'expenses'), where('ownerUid', '==', user.uid));
    const unsubscribeExpenses = onSnapshot(expensesQ, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Fetch weather
    const loadWeather = async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const weatherData = await fetchLongBeachWeather(today);
      setWeather(weatherData);
    };
    loadWeather();

    return () => {
      unsubscribe();
      unsubscribeTreatments();
      unsubscribeHistory();
      unsubscribeTasks();
      unsubscribeAllLogs();
      unsubscribeExpenses();
    };
  }, [id, user]);

  const eliteMetrics = React.useMemo(() => {
    if (!plant || !weather) return null;
    return processInhabitantEliteMetrics(plant, eventLogs, weather, expenses);
  }, [plant, eventLogs, weather, expenses]);

  const handleUpdatePlant = async () => {
    if (!id) return;
    
    // Basic date validation
    if (editForm.startDate && editForm.endDate) {
      if (new Date(editForm.startDate) > new Date(editForm.endDate)) {
        toast.error('Start date cannot be after end date');
        return;
      }
    }

    try {
      const plantRef = doc(db, 'inhabitants', id);
      const { vigorIndex: _dropped, ...safeForm } = editForm as any;
      await updateDoc(plantRef, {
        ...safeForm,
        updatedAt: serverTimestamp()
      });
      // Status/notes changed -> recompute the condition factor (other factors preserved)
      if (plant) {
        recalculateVigor({ ...plant, ...safeForm } as any).catch(() => {});
      }
      setIsEditing(false);
      toast.success('Botanical record updated!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inhabitants/${id}`);
    }
  };

  const handleWaterNow = async () => {
    if (!plant || !id) return;
    try {
      const watered = waterNowUpdate();
      await updateDoc(doc(db, 'inhabitants', id), {
        lastWatered: watered.lastWatered,
        status: watered.status,
      });
      // Recalculate vigor from the fresh watering (pest factor preserved)
      recalculateVigor({ ...plant, lastWatered: watered.lastWatered.toISOString(), status: watered.status } as any, eventLogs as any).catch(() => {});
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inhabitants/${id}`);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'inhabitants', id));
      toast.success('Inhabitant removed from inventory');
      navigate('/inventory');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `inhabitants/${id}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !user) return;

    setIsUploading(true);
    const toastId = toast.loading('Uploading botanical photo...');

    try {
      const storageRef = ref(storage, `inhabitants/${user.uid}/${id}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      await updateDoc(doc(db, 'inhabitants', id), {
        image: downloadURL,
        updatedAt: serverTimestamp()
      });

      // Keep the visual timeline complete: profile changes are logged too
      try {
        await addDoc(collection(db, 'inhabitants', id, 'photos'), {
          url: downloadURL,
          storagePath: `inhabitants/${user.uid}/${id}/${Date.now()}_${file.name}`,
          caption: 'Profile photo',
          ownerUid: user.uid,
          createdAt: serverTimestamp(),
        });
      } catch { /* log write is best-effort */ }

      toast.success('Botanical photo updated!', { id: toastId });
    } catch (error) {
      console.error('Upload error:', error);
      handleFirestoreError(error, OperationType.WRITE, `inhabitants/${id}/image`);
      toast.error('Failed to upload photo', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddTask = async () => {
    if (!id || !newTask || !user) return;
    try {
      await addDoc(collection(db, 'tasks'), {
        ownerUid: user.uid,
        plantId: id,
        plantName: plant.name,
        plotId: plant.plotId || null,
        task: newTask,
        completed: false,
        category: 'Maintenance',
        createdAt: serverTimestamp()
      });
      setNewTask('');
      setIsAddingTask(false);
      toast.success('Task added!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const handleToggleTask = async (task: any) => {
    if (!user || migratingTasks.has(task.id)) return;

    setMigratingTasks(prev => new Set(prev).add(task.id));
    const toastId = toast.loading(`Migrating "${task.task}" to history...`);

    try {
      await runTransaction(db, async (transaction) => {
        const taskRef = doc(db, 'tasks', task.id);
        const calendarRef = doc(collection(db, 'calendar_events'));
        const historyRef = doc(collection(db, 'task_history'));

        // 1. Create Calendar Event
        transaction.set(calendarRef, {
          ownerUid: user.uid,
          title: `Completed: ${task.task}`,
          start: new Date().toISOString(),
          end: new Date().toISOString(),
          allDay: true,
          category: task.category || 'Maintenance',
          description: `Task completed for plant: ${plant.name}`,
          plotId: plant.plotId || null,
          plantId: id,
          createdAt: serverTimestamp()
        });

        // 2. Add to Task History
        transaction.set(historyRef, {
          ownerUid: user.uid,
          taskId: task.id,
          task: task.task,
          plotId: plant.plotId || null,
          plantId: id,
          plantName: plant.name,
          category: task.category || 'Maintenance',
          completionDate: serverTimestamp(),
          status: 'Completed'
        });

        // 3. Delete from active tasks
        transaction.delete(taskRef);
      });

      toast.success(`"${task.task}" migrated to history`, { id: toastId });
    } catch (error) {
      console.error('Migration error:', error);
      handleFirestoreError(error, OperationType.WRITE, 'tasks/migration');
      toast.error('Failed to complete task migration', { id: toastId });
    } finally {
      setMigratingTasks(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
      toast.success('Task removed');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${taskId}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!plant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center space-y-6">
        <div className="w-24 h-24 bg-surface-container-low rounded-full flex items-center justify-center">
          <AlertCircle size={48} className="text-outline" />
        </div>
        <h2 className="text-3xl font-headline font-black text-on-surface">Plant Not Found</h2>
        <p className="text-on-surface-variant max-w-xs">This botanical entry may have been removed or relocated.</p>
        <button 
          onClick={() => navigate('/inventory')}
          className="bg-primary text-white px-8 py-4 rounded-full font-black text-sm uppercase tracking-widest shadow-xl"
        >
          Return to Inventory
        </button>
      </div>
    );
  }

  const stats = [
    { label: 'Water', value: plant.waterFreq || 'Regular', icon: Droplets, color: 'text-primary' },
    { label: 'Sunlight', value: plant.sunExposure || 'Full Sun', icon: Sun, color: 'text-secondary' },
    { label: 'Temp', value: plant.tempRange || '65-85°F', icon: Thermometer, color: 'text-tertiary' },
  ];

  const timeline = [
    { 
      date: plant.startDate || (plant.plantedAt?.toDate ? plant.plantedAt.toDate().toLocaleDateString() : (plant.plantedAt ? new Date(plant.plantedAt).toLocaleDateString() : 'N/A')), 
      event: 'Planted / Started', 
      completed: true 
    },
    { 
      date: plant.endDate || 'Ongoing', 
      event: 'Expected Finish', 
      completed: false 
    },
    { 
      date: plant.lastWatered?.toDate ? plant.lastWatered.toDate().toLocaleDateString() : (plant.lastWatered ? new Date(plant.lastWatered).toLocaleDateString() : 'N/A'), 
      event: 'Last Watered', 
      completed: true 
    },
    { 
      date: plant.nextWatering || 'Soon', 
      event: 'Next Watering', 
      completed: false 
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Hero Header */}
      <div className="relative h-[55vh] w-full overflow-hidden">
        <motion.img 
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.5 }}
          src={plant.image || PLANT_PLACEHOLDER}
          alt={plant.name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={(e) => { e.currentTarget.src = PLANT_PLACEHOLDER; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-black/40"></div>
        
        {/* Top Actions */}
        <div className="absolute top-8 left-6 right-6 flex justify-between items-center z-10">
          <button 
            onClick={() => navigate(-1)}
            className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/40 transition-all active:scale-90"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex gap-3">
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-primary transition-all active:scale-90 disabled:opacity-50"
              title="Add Photo"
            >
              {isUploading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera size={20} />
              )}
            </button>
            <button
              onClick={refreshPhoto}
              disabled={refreshingPhoto}
              className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-primary transition-all active:scale-90 disabled:opacity-50"
              title="Refresh photo from the plant library"
              aria-label="Refresh photo from the plant library"
            >
              <RefreshCw size={20} className={refreshingPhoto ? 'animate-spin' : ''} />
            </button>
            <button 
              onClick={() => setIsEditing(true)}
              className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-primary transition-all active:scale-90"
              title="Edit Plant"
            >
              <Settings2 size={20} />
            </button>
            <button 
              onClick={() => setShowDeleteModal(true)}
              className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-destructive transition-all active:scale-90"
            >
              <Trash2 size={20} />
            </button>
            <button className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/40 transition-all active:scale-90">
              <Share2 size={20} />
            </button>
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className={cn(
                "w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center transition-all active:scale-90",
                isLiked ? "bg-tertiary text-white" : "bg-white/20 text-white hover:bg-white/40"
              )}
            >
              <Heart size={20} fill={isLiked ? "currentColor" : "none"} />
            </button>
          </div>
        </div>

        {/* Floating Title Card */}
        <div className="absolute bottom-0 left-0 w-full px-6 pb-8">
          <motion.div 
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 20 }}
            className="bg-white rounded-[3rem] p-10 shadow-2xl shadow-emerald-950/10 border border-surface-variant/20"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-primary italic font-serif text-sm mb-1 tracking-wide">{plant.scientific}</p>
                <h1 className="text-5xl font-headline font-black text-on-surface tracking-tighter leading-none">{plant.name}</h1>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="bg-primary-fixed text-primary px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-sm">
                  {plant.status}
                </span>
                {plant.notes && (
                  <span className="text-[10px] text-on-surface-variant font-medium italic max-w-[150px] text-right line-clamp-1">
                    "{plant.notes}"
                  </span>
                )}
              </div>
            </div>
              <div className="flex gap-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center">
                    <Activity size={20} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50">Vigor Index</p>
                    <p className="text-sm font-bold text-on-surface">{plant.vigorIndex ?? '—'}{plant.vigorIndex != null ? '%' : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center">
                    <Thermometer size={20} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50">Phenology (GDD)</p>
                    <p className="text-sm font-bold text-on-surface">{Math.floor(eliteMetrics?.cumulativeGDD || plant.cumulativeGDD || 0)} Units</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center">
                    <Clock size={20} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50">Urgency Index</p>
                    <p className={cn(
                      "text-sm font-bold",
                      (eliteMetrics?.urgencyIndex || 0) > 0.8 ? "text-error" : 
                      (eliteMetrics?.urgencyIndex || 0) > 0.5 ? "text-amber-500" : "text-on-surface"
                    )}>
                      {Math.round((eliteMetrics?.urgencyIndex || 0) * 100)}%
                    </p>
                  </div>
                </div>
                <div className="flex-1 flex justify-end gap-2">
                  <button 
                    onClick={() => setShowHealthCheck(true)}
                    className="bg-white border-2 border-primary/30 text-primary px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
                  >
                    <Stethoscope size={16} /> Quick check
                  </button>
                  <button 
                    onClick={handleWaterNow}
                    className="bg-primary text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                  >
                    <Droplets size={16} /> Water Now
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* How this score was earned — calculated from real events, never hand-entered */}
        {(plant as any).vigorBreakdown && (
          <div className="px-6 mt-8">
            <div className="bg-surface-container-low rounded-[2.5rem] p-8 border border-outline-variant/10">
              <h3 className="font-headline text-xl font-black text-on-surface mb-1">Vigor breakdown</h3>
              <p className="text-xs text-on-surface-variant font-medium mb-6">Calculated from your waterings, treatments and notes. Updates when you log care.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Hydration', value: (plant as any).vigorBreakdown.hydration, hint: 'Days since last watering' },
                  { label: 'Condition', value: (plant as any).vigorBreakdown.condition, hint: 'Status + your notes' },
                  { label: 'Pest pressure', value: (plant as any).vigorBreakdown.pests, hint: 'Active vs resolved treatments' },
                  { label: 'Care momentum', value: (plant as any).vigorBreakdown.care, hint: 'Recent care events' },
                ].map(f => (
                  <div key={f.label} className="bg-white/60 rounded-2xl p-4">
                    <div className="flex items-baseline justify-between mb-2">
                      <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">{f.label}</p>
                      <p className="text-lg font-black text-on-surface">{f.value}%</p>
                    </div>
                    <div className="h-2 rounded-full bg-stone-200 overflow-hidden mb-2">
                      <div
                        className={cn("h-full rounded-full", f.value >= 70 ? "bg-primary" : f.value >= 40 ? "bg-amber-500" : "bg-error")}
                        style={{ width: `${f.value}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-on-surface-variant font-medium">{f.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Elite Insights Section */}
        <div className="px-6 mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface-container-low rounded-[2.5rem] p-8 border border-outline-variant/10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-secondary/10 text-secondary rounded-2xl">
                <Droplets size={24} />
              </div>
              <h3 className="font-headline text-xl font-black">Irrigation (ETc)</h3>
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-black text-on-surface">{eliteMetrics?.etc?.toFixed(2)} <span className="text-sm font-medium opacity-50">mm/day</span></p>
              <p className="text-xs text-on-surface-variant font-medium">Estimated evapotranspiration based on local weather and crop coefficient ({plant.cropCoefficient || 1.0}).</p>
            </div>
          </div>

          <div className="bg-surface-container-low rounded-[2.5rem] p-8 border border-outline-variant/10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-tertiary/10 text-tertiary rounded-2xl">
                <Activity size={24} />
              </div>
              <h3 className="font-headline text-xl font-black">Financial (CPY)</h3>
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-black text-on-surface">${eliteMetrics?.cpy?.toFixed(2)} <span className="text-sm font-medium opacity-50">per yield unit</span></p>
              <p className="text-xs text-on-surface-variant font-medium">Cost-per-Yield analysis based on attributed expenses and expected output.</p>
            </div>
          </div>

          <div className="bg-surface-container-low rounded-[2.5rem] p-8 border border-outline-variant/10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                <Calendar size={24} />
              </div>
              <h3 className="font-headline text-xl font-black">Seasonal Cohort</h3>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-black text-on-surface uppercase tracking-tight">{eliteMetrics?.seasonalCohort || 'N/A'}</p>
              <p className="text-xs text-on-surface-variant font-medium">Categorized based on target pull date and seasonal transition logic.</p>
            </div>
          </div>
        </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden"
            >
              <div className="p-10 space-y-8">
                <div className="flex justify-between items-center">
                  <h3 className="font-headline text-3xl font-black tracking-tight">Edit Botanical Record</h3>
                  <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Plant Name</label>
                    <input 
                      type="text" 
                      value={editForm.name}
                      onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                      className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 ring-primary/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Status</label>
                      <select 
                        value={editForm.status}
                        onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                        className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 ring-primary/20"
                      >
                        <option value="Healthy">Healthy</option>
                        <option value="Struggling">Struggling</option>
                        <option value="Dormant">Dormant</option>
                        <option value="Harvested">Harvested</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Vigor Index</label>
                      <div className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold text-on-surface-variant">
                        {plant.vigorIndex ?? '—'}{plant.vigorIndex != null ? '%' : ''} — calculated from your waterings, treatments and notes
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Base Temp (°C)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={editForm.baseTemperature}
                        onChange={(e) => setEditForm({...editForm, baseTemperature: parseFloat(e.target.value)})}
                        className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 ring-primary/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Crop Coeff (Kc)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={editForm.cropCoefficient}
                        onChange={(e) => setEditForm({...editForm, cropCoefficient: parseFloat(e.target.value)})}
                        className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 ring-primary/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Start Date</label>
                      <DatePicker
                        selected={editForm.startDate ? new Date(editForm.startDate) : null}
                        onChange={(date) => setEditForm({...editForm, startDate: date ? date.toISOString().split('T')[0] : ''})}
                        className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 ring-primary/20"
                        dateFormat="yyyy-MM-dd"
                        placeholderText="Select start date"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">End Date</label>
                      <DatePicker
                        selected={editForm.endDate ? new Date(editForm.endDate) : null}
                        onChange={(date) => setEditForm({...editForm, endDate: date ? date.toISOString().split('T')[0] : ''})}
                        className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 ring-primary/20"
                        dateFormat="yyyy-MM-dd"
                        placeholderText="Select end date"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Curator's Notes</label>
                    <textarea 
                      value={editForm.notes}
                      onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                      className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 ring-primary/20 min-h-[120px]"
                      placeholder="Enter observations..."
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={handleUpdatePlant}
                    className="flex-1 bg-primary text-white font-black py-5 rounded-[2rem] hover:shadow-xl transition-all active:scale-[0.98]"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isAddingTask && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black font-headline tracking-tight">New Task</h3>
                  <button onClick={() => setIsAddingTask(false)} className="p-2 hover:bg-stone-100 rounded-full transition-colors"><X /></button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Task Description</label>
                    <input 
                      type="text" 
                      value={newTask}
                      onChange={(e) => setNewTask(e.target.value)}
                      className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 ring-primary/20"
                      placeholder="e.g. Prune yellow leaves"
                      autoFocus
                    />
                  </div>
                </div>

                <button 
                  onClick={handleAddTask}
                  className="w-full bg-primary text-white font-black py-5 rounded-2xl hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <Check size={20} /> Add to Checklist
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHealthCheck && plant && (
          <HealthCheckWizard
            plant={plant}
            onClose={() => setShowHealthCheck(false)}
            onDone={(v) => setPlant({ ...plant, vigorIndex: v })}
          />
        )}
      </AnimatePresence>

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        message={`Are you sure you want to permanently delete "${plant.name}"? This action cannot be undone.`}
        isDeleting={isDeleting}
      />

      {/* Content Area */}
      <div className="px-6 space-y-12 mt-12 max-w-3xl mx-auto">
        {/* Quick Stats */}
        <section className="grid grid-cols-3 gap-6">
          {stats.map((stat: any) => (
            <div key={stat.label} className="bg-surface-container-low p-6 rounded-[2rem] flex flex-col items-center text-center gap-3 border border-transparent hover:border-primary/10 transition-colors group">
              <div className={cn("w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform", stat.color)}>
                <stat.icon size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.15em] opacity-60 mb-1">{stat.label}</p>
                <p className="text-sm font-black text-on-surface">{stat.value}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Description */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 bg-primary rounded-full"></div>
            <h2 className="text-3xl font-headline font-black text-on-surface tracking-tight">Botanical Profile</h2>
          </div>
          <p className="text-on-surface-variant text-lg leading-relaxed font-medium">
            {plant.description || "No botanical profile available for this entry."}
          </p>
        </section>

        {/* Photo Log — visual growth timeline */}
        <PlantPhotoLog
          plantId={id!}
          plantName={plant.name}
          currentImage={plant.image}
          onSetProfilePhoto={async (url) => {
            await updateDoc(doc(db, 'inhabitants', id), { image: url, updatedAt: serverTimestamp() });
          }}
        />

        {/* Active Tasks Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-primary/10 rounded-3xl text-primary">
                <ClipboardList size={28} />
              </div>
              <div>
                <h2 className="text-3xl font-headline font-black text-on-surface tracking-tight">Active Tasks</h2>
                <p className="text-sm text-on-surface-variant font-medium uppercase tracking-widest">Pending care activities</p>
              </div>
            </div>
            <button 
              onClick={() => setIsAddingTask(true)}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-black text-sm hover:shadow-lg transition-all active:scale-95"
            >
              <Plus size={20} /> Add Task
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeTasks.length === 0 ? (
              <div className="col-span-full bg-surface-container-low p-12 rounded-[2.5rem] text-center border border-outline-variant/10">
                <p className="text-on-surface-variant font-medium italic">No pending tasks for this plant. You're all caught up!</p>
              </div>
            ) : (
              activeTasks.map(task => (
                <motion.div 
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ 
                    opacity: migratingTasks.has(task.id) ? 0.5 : 1,
                    y: 0,
                    scale: migratingTasks.has(task.id) ? 0.98 : 1
                  }}
                  className={cn(
                    "bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm flex items-center justify-between group transition-all",
                    migratingTasks.has(task.id) && "bg-primary/5 border-primary/20"
                  )}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <button 
                      onClick={() => handleToggleTask(task)}
                      disabled={migratingTasks.has(task.id)}
                      className={cn(
                        "w-10 h-10 rounded-2xl border-2 flex items-center justify-center transition-all",
                        migratingTasks.has(task.id) ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" : "border-outline-variant hover:border-primary/50"
                      )}
                    >
                      {migratingTasks.has(task.id) ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={20} className="opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                      )}
                    </button>
                    <div className="flex flex-col">
                      <span className={cn(
                        "text-lg font-bold transition-all",
                        migratingTasks.has(task.id) ? "text-on-surface-variant line-through" : "text-on-surface"
                      )}>
                        {task.task}
                      </span>
                      {migratingTasks.has(task.id) && (
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest animate-pulse">Migrating to history...</span>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteTask(task.id)}
                    disabled={migratingTasks.has(task.id)}
                    className="p-3 text-outline hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all opacity-0 group-hover:opacity-100 disabled:hidden"
                  >
                    <Trash2 size={18} />
                  </button>
                </motion.div>
              ))
            )}
          </div>
        </section>

        {/* Growth & Care History */}
        <section className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-headline font-black text-on-surface tracking-tight">Growth & Care History</h2>
            <div className="flex gap-2">
              <span className="bg-surface-container-high px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                {treatments.length} Treatments
              </span>
            </div>
          </div>
          
          <div className="space-y-6 relative pl-4">
            <div className="absolute left-7 top-2 bottom-2 w-0.5 bg-outline-variant/20"></div>
            
            {/* Future/Next Tasks */}
            <div className="flex items-center gap-6 relative">
              <div className="w-6 h-6 rounded-full flex items-center justify-center z-10 shadow-sm bg-white text-primary border-2 border-primary animate-pulse">
                <Droplets size={14} />
              </div>
              <div className="flex-1 p-6 rounded-[2rem] bg-primary/5 border border-primary/20 flex justify-between items-center">
                <div>
                  <span className="font-black text-primary tracking-tight block">Scheduled Watering</span>
                  <p className="text-xs text-on-surface-variant font-medium">Optimal hydration window</p>
                </div>
                <span className="text-[10px] font-black text-primary uppercase tracking-widest">{plant.nextWatering || 'TBD'}</span>
              </div>
            </div>

            {/* Past Events */}
            {timeline.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-6 relative">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center z-10 shadow-sm transition-all duration-500",
                  item.completed ? "bg-primary text-white" : "bg-white text-on-surface-variant border-2 border-outline-variant"
                )}>
                  {item.completed ? <Check size={14} /> : <div className="w-2 h-2 rounded-full bg-outline-variant/40"></div>}
                </div>
                <div className={cn(
                  "flex-1 p-6 rounded-[2rem] flex justify-between items-center transition-all",
                  item.completed ? "bg-surface-container-low border border-primary/5" : "bg-surface-container-lowest border border-dashed border-outline-variant/30 opacity-60"
                )}>
                  <span className="font-black text-on-surface tracking-tight">{item.event}</span>
                  <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest opacity-60">{item.date}</span>
                </div>
              </div>
            ))}

            {/* Treatment Logs */}
            {treatments.map((log) => (
              <div key={log.id} className="flex items-center gap-6 relative">
                <div className="w-6 h-6 rounded-full flex items-center justify-center z-10 shadow-sm bg-tertiary text-white">
                  <Activity size={14} />
                </div>
                <div className="flex-1 p-6 rounded-[2rem] bg-tertiary/5 border border-tertiary/10 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="font-black text-tertiary tracking-tight">{log.diseaseName || 'Treatment'}</span>
                    <span className="text-[10px] font-black text-tertiary uppercase tracking-widest">
                      {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString() : 'Recently'}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant font-medium">
                    {log.treatmentUsed || 'Diagnosis & Recovery Protocol'}
                  </p>
                  {log.successRate && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-1 flex-1 bg-tertiary/20 rounded-full overflow-hidden">
                        <div className="h-full bg-tertiary" style={{ width: `${log.successRate}%` }}></div>
                      </div>
                      <span className="text-[8px] font-black text-tertiary uppercase">{log.successRate}% Success</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Task History Logs */}
            {taskHistory.map((history) => (
              <div key={history.id} className="flex items-center gap-6 relative">
                <div className="w-6 h-6 rounded-full flex items-center justify-center z-10 shadow-sm bg-secondary text-white">
                  <Check size={14} />
                </div>
                <div className="flex-1 p-6 rounded-[2rem] bg-secondary/5 border border-secondary/10 flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="font-black text-secondary tracking-tight">{history.task}</span>
                    <span className="text-[10px] font-black text-secondary uppercase tracking-widest">
                      {history.completionDate?.toDate ? history.completionDate.toDate().toLocaleDateString() : 'Archived'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest bg-surface-container-high px-2 py-0.5 rounded-full">
                      {history.category || 'Maintenance'}
                    </span>
                    <span className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">
                      Task Migration
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* AI Insights Card */}
        <section className="bg-primary text-white rounded-[3rem] p-10 relative overflow-hidden shadow-2xl shadow-primary/20 group">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center">
                <AlertCircle className="text-white" size={20} />
              </div>
              <span className="font-headline font-black uppercase tracking-[0.2em] text-[10px] opacity-80">AI Botanical Insight</span>
            </div>
            <h3 className="text-3xl font-black mb-4 tracking-tight leading-tight">Pruning recommended in 3 days</h3>
            <p className="text-white/70 text-lg leading-relaxed mb-8 max-w-md">
              Based on current growth rate and local humidity, pruning the lower stems will improve airflow and prevent potential fungal issues.
            </p>
            <button 
              onClick={() => setIsGuideOpen(true)}
              className="bg-white text-primary px-10 py-4 rounded-full font-black text-sm uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              View Pruning Guide
            </button>
          </div>
          <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-white/5 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-1000"></div>
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Scissors size={120} />
          </div>
        </section>
      </div>

      {/* Pruning Guide Modal */}
      <AnimatePresence>
        {isGuideOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsGuideOpen(false)}
              className="fixed inset-0 bg-stone-900/80 backdrop-blur-md z-[60]"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-[3.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden max-w-2xl mx-auto"
            >
              <div className="w-full flex justify-center py-6 shrink-0">
                <div className="w-16 h-1.5 bg-outline-variant/30 rounded-full"></div>
              </div>
              <div className="px-10 pb-8 shrink-0">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-primary">
                      <BookOpen size={16} />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Care Guide</span>
                    </div>
                    <h3 className="font-headline text-4xl font-black text-on-surface tracking-tighter">Pruning Protocol</h3>
                  </div>
                  <button 
                    onClick={() => setIsGuideOpen(false)}
                    className="bg-surface-container-high p-4 rounded-full text-on-surface-variant hover:bg-surface-container-highest transition-colors active:scale-90"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>
              <div className="px-10 pb-16 overflow-y-auto hide-scrollbar space-y-8">
                <div className="aspect-video rounded-[2.5rem] overflow-hidden bg-surface-container-low border border-outline-variant/10">
                  <img 
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDFv6wsRqwoPZYLPHjQQKUR69Aah9-hmQKMlUhm174iigthW4JKvkA7UnPbC-Pr-ceNmtlzeSWRIbpvlEYs1o6xVhCoUoXlAccmaX8ZLZ6DFhPuiL24590-c4kt-_Dbahwj6Ej0uoc6yKAGb2A9qucnHDFOjCCEwiuWpOI3oUiXGNcxsgwhOlwKmt4AXZfaypoxpF0IRTxrsgzYodP0JWZgmQB3cSSfTBfZ-5aS0v7smWQ8PDqPmJiM1wz5FNePUhex5VU7hk4bVdNi" 
                    alt="Pruning demonstration" 
                    className="w-full h-full object-cover opacity-80"
                  />
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h4 className="text-xl font-black text-on-surface tracking-tight">Step 1: Identify Yellowing Leaves</h4>
                    <p className="text-on-surface-variant leading-relaxed">Locate the three lower leaves showing early signs of chlorosis. These are no longer contributing to the plant's energy production.</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xl font-black text-on-surface tracking-tight">Step 2: Clean Your Tools</h4>
                    <p className="text-on-surface-variant leading-relaxed">Wipe your pruning shears with 70% isopropyl alcohol to prevent the spread of pathogens between plants.</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xl font-black text-on-surface tracking-tight">Step 3: Make the Cut</h4>
                    <p className="text-on-surface-variant leading-relaxed">Cut at a 45-degree angle approximately 1/4 inch above the main stem node to encourage new growth.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsGuideOpen(false)}
                  className="w-full py-6 bg-primary text-white rounded-full font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-primary/20 active:scale-95 transition-all"
                >
                  Got it, Protocol Logged
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
