import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { format, addDays } from 'date-fns';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { 
  DndContext, 
  useDraggable, 
  useDroppable, 
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Leaf, 
  Box, 
  Plus, 
  Trash2, 
  RotateCw,
  Settings2, 
  Maximize2, 
  Minimize2, 
  X, 
  Palette, 
  Move, 
  Check, 
  ArrowLeft, 
  Edit3,
  Calendar,
  Activity,
  Info,
  Droplets,
  Bug,
  Sprout,
  Laugh,
  ClipboardList,
  Clock,
  AlertCircle,
  Wrench,
  Thermometer,
  Sun,
  ScrollText,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  Filter,
  Map as MapIcon,
  Tag,
  Target,
  AlertTriangle,
  ShieldAlert,
  ChevronRight,
  Copy
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { logEvent } from '../services/eventService';
import { db, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, handleFirestoreError, OperationType, setDoc, deleteField, batchDelete, runTransaction, serverTimestamp } from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { GoogleGenAI, Type } from "@google/genai";
import { toast } from 'sonner';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import PlotEditForm, { PlotEditData } from './PlotEditForm';
import BedEditModal from './BedEditModal';
import { isPlanted, countPlanted, countWaiting } from '../lib/plotStats';
import { plantCellAfterBedMove } from '../lib/bedCoords';
import { duplicateBed } from '../lib/duplicateBed';
import { recalculateVigor, refreshStaleVigor, averageVigor } from '../lib/vigor';
import WeedWarriorWizard from './WeedWarriorWizard';
import TreatmentConflictModal from './TreatmentConflictModal';

import { 
  Inhabitant, 
  SpatialPlot, 
  InhabitantStatus, 
  InhabitantType, 
  PlotStatus, 
  PlotHealth,
  EventLog,
  EventType
} from '../types';

import { 
  calculateSuitabilityScore, 
  calculateUrgencyIndex, 
  getSeasonalCohort, 
  checkMonoculture, 
  getRecommendedSuccessor,
  checkTreatmentConflict,
  checkCompanionConflicts,
  type CompanionConflict,
  BOTANICAL_RELATIONS
} from '../services/botanyService';
import { getThreatsForPlant, type PlantThreat } from '../constants/threats';
import PlantHealthDrawer from './PlantHealthDrawer';
import PlantImage from './PlantImage';
import BedBuildQuiz from './BedBuildQuiz';
import ThreatCard from './ThreatCard';

const GARDEN_JOKES = [
  "Why did the tomato turn red? Because it saw the salad dressing!",
  "What do you call a sleeping blackcurrant? A berry-tired fruit.",
  "How do you fix a broken tomato? With tomato paste!",
  "What do you call a mushroom who goes to a party? A fun-gi!",
  "Why are gardens so great? Because they're always growing on you!",
  "What's a gardener's favorite music? Rock and roll-mow!",
  "Why did the gardener quit? Because his celery was too low!",
  "What do you call a bee that can't make up its mind? A maybe.",
  "What do you call a tree that fits in your hand? A palm tree!",
  "Why did the scarecrow win an award? Because he was outstanding in his field!"
];

interface GridPosition {
  x: number;
  y: number;
}

interface Planter {
  id: string;
  name: string;
  type: string;
  gridPosition: GridPosition;
  size: { w: number; h: number };
  color: string;
  plotId: string;
}

interface Plant {
  id: string;
  name: string;
  planterId?: string;
  plotId?: string;
  gridPosition: GridPosition;
  image?: string;
  scientific?: string;
}

interface MaintenanceLog {
  id: string;
  date: string;
  action: string;
  notes: string;
}

interface ChecklistItem {
  id: string;
  task: string;
  completed: boolean;
  ownerUid: string;
  plotId: string;
  plantId?: string;
  plantName?: string;
  category?: string;
  createdAt: any;
}

interface PlotLayoutItem {
  id: string;
  x: number;
  y: number;
  type: 'plant' | 'planter';
}

interface Plot {
  id: string;
  name: string;
  description?: string;
  status: 'Active' | 'Inactive';
  currentCrop?: string;
  plantingDate?: string;
  startDate?: string;
  endDate?: string;
  soilType?: string;
  healthStatus?: 'Excellent' | 'Stable' | 'Stressed' | 'Critical';
  wateringFreq?: string;
  maintenanceLog?: MaintenanceLog[];
  checklist?: ChecklistItem[];
  dailyJoke?: {
    text: string;
    lastUpdated: number;
  };
  mapLayout?: PlotLayoutItem[];
}

export default function PlotDetail() {
  const { plotId } = useParams<{ plotId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useFirebase();
  
  const [plot, setPlot] = useState<SpatialPlot | null>(null);
  const [tasks, setTasks] = useState<ChecklistItem[]>([]);
  const [migratingTasks, setMigratingTasks] = useState<Set<string>>(new Set());
  const [planters, setPlanters] = useState<Planter[]>([]);
  const [inhabitants, setInhabitants] = useState<Inhabitant[]>([]);
  const [availableInhabitants, setAvailableInhabitants] = useState<Inhabitant[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'planter' | 'plant' | null>(null);
  const [zoom, setZoom] = useState(1);
  const [activeLayer, setActiveLayer] = useState<'none' | 'family' | 'irrigation'>('none');
  const [selectedPlanterId, setSelectedPlanterId] = useState<string | null>(null);

  // Predetermined plot grid: each plot carries its own dimensions from the
  // bed-build quiz (gridConfig). Legacy plots fall back to the old 30x20.
  const COLS = plot?.gridConfig?.cols || 30;
  const ROWS = plot?.gridConfig?.rows || 20;

  // Fit the grid to the phone screen: measure the scroll container and size
  // cells so the whole plot outline fits the available width. Zoom scales up.
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const gridInnerRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(0);
  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setWrapWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const GRID_PAD = 24; // breathing room beyond the plot borders (each side)
  const baseCell = wrapWidth > 0 ? Math.max(8, Math.floor((wrapWidth - GRID_PAD * 2) / COLS)) : 24;
  const cell = baseCell * zoom;

  const [showBedQuiz, setShowBedQuiz] = useState(false);
  // Tap-to-place (mobile): pick a plant from the rail, then tap a bed cell.
  const [placingPlant, setPlacingPlant] = useState<Inhabitant | null>(null);
  // Tap-to-move (mobile): pick a bed, then tap the plot grid where it goes.
  const [movingBed, setMovingBed] = useState<Planter | null>(null);
  const [isEditingPlot, setIsEditingPlot] = useState(false);
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isWeedWarriorOpen, setIsWeedWarriorOpen] = useState(false);
  const [conflictModalData, setConflictModalData] = useState<{ isOpen: boolean; message: string; action: string; conflictingAction: string; conflictingDate: string } | null>(null);
  const [editingPlanter, setEditingPlanter] = useState<any>(null);
  const [newLog, setNewLog] = useState({ action: '', notes: '' });
  const [newTask, setNewTask] = useState('');
  const [quickTips, setQuickTips] = useState<string>('');
  const [loadingTips, setLoadingTips] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'plot' | 'planter' } | null>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);

  const eliteInsights = React.useMemo(() => {
    if (!plot || inhabitants.length === 0) return null;
    
    const thirstyCount = inhabitants.filter(p => p.status === 'Thirsty').length;
    const avgVigorNum = averageVigor(inhabitants);
    const avgVigor = avgVigorNum === null ? null : avgVigorNum.toFixed(1);
      
    return {
      monoculture: checkMonoculture(inhabitants),
      nutrientDraw: inhabitants.reduce((acc, p) => {
        const draw = p.nutrientDraw || 'Medium';
        if (draw === 'Heavy') return 'High';
        if (draw === 'Medium' && acc !== 'High') return 'Medium';
        return acc;
      }, 'Low' as 'High' | 'Medium' | 'Low'),
      succession: getRecommendedSuccessor(inhabitants),
      avgVigor,
      thirstyCount
    };
  }, [plot, inhabitants]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    if (!user || !plotId) return;

    // Fetch Plot Details
    const unsubscribePlot = onSnapshot(doc(db, 'spatial_plots', plotId), (docSnap) => {
      setLoading(false);
      if (docSnap.exists()) {
        const data = docSnap.data() as SpatialPlot;
        setPlot({ id: docSnap.id, ...data });
      } else {
        toast.error('Plot not found');
        navigate('/');
      }
    });

    // Fetch Planters for this Plot
    const pq = query(collection(db, 'planters'), where('plotId', '==', plotId), where('ownerUid', '==', user.uid));
    const unsubscribePlanters = onSnapshot(pq, (snapshot) => {
      setPlanters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Planter)));
    });

    // Fetch Inhabitants for this Plot
    const inhabitantsQ = query(collection(db, 'inhabitants'), where('plotId', '==', plotId), where('ownerUid', '==', user.uid));
    const unsubscribeInhabitants = onSnapshot(inhabitantsQ, (snapshot) => {
      const allPlotInhabitants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inhabitant));
      // Planted = sitting in a bed (planterId set) or at a real grid position
      setInhabitants(allPlotInhabitants.filter(isPlanted));
      // Assigned to this plot but still waiting in the rail
      const assignedNotMapped = allPlotInhabitants.filter(p => !isPlanted(p));
      
      setAvailableInhabitants(prev => {
        const unassigned = prev.filter(p => !p.plotId);
        return [...unassigned, ...assignedNotMapped];
      });
    });

    // Fetch Unassigned Inhabitants
    const unassignedQ = query(collection(db, 'inhabitants'), where('plotId', '==', null), where('ownerUid', '==', user.uid));
    const unsubscribeUnassigned = onSnapshot(unassignedQ, (snapshot) => {
      const unassigned = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inhabitant));
      setAvailableInhabitants(prev => {
        const assignedToThisPlot = prev.filter(p => p.plotId === plotId);
        return [...unassigned, ...assignedToThisPlot];
      });
    });

    // Fetch Tasks for this Plot
    const tasksQ = query(collection(db, 'tasks'), where('plotId', '==', plotId), where('ownerUid', '==', user.uid));
    const unsubscribeTasks = onSnapshot(tasksQ, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChecklistItem)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    });

    // Fetch event logs for conflict checking
    const logsQ = query(collection(db, 'event_logs'), where('ownerUid', '==', user.uid));
    const unsubscribeLogs = onSnapshot(logsQ, (snapshot) => {
      setEventLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventLog)));
    });

    return () => {
      unsubscribePlot();
      unsubscribePlanters();
      unsubscribeInhabitants();
      unsubscribeUnassigned();
      unsubscribeTasks();
      unsubscribeLogs();
    };
  }, [user, plotId, navigate]);

  // Background vigor refresh: recompute stale/never-calculated scores once data lands.
  // Logs are filtered per-plant inside the engine, so the all-plots query can't leak.
  const vigorRefreshed = useRef<string | null>(null);
  useEffect(() => {
    if (!plotId || inhabitants.length === 0 || vigorRefreshed.current === plotId) return;
    vigorRefreshed.current = plotId;
    const t = setTimeout(() => {
      refreshStaleVigor(inhabitants, eventLogs as any).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [plotId, inhabitants, eventLogs]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    setActiveType(active.data.current?.type);
  };

  // Companion conflicts per plant, recomputed whenever the bed changes.
  // Each unordered pair is reported once; attach to both plants for badges.
  const { conflictMap, conflictList } = useMemo(() => {
    const map = new Map<string, CompanionConflict[]>();
    const list: { plantId: string; plantName: string; conflict: CompanionConflict }[] = [];
    const seen = new Set<string>();

    inhabitants.forEach((p) => {
      const others = inhabitants.filter((o) => o.id !== p.id);
      const conflicts = checkCompanionConflicts(
        { name: p.name, familyId: p.familyId },
        p.gridPosition,
        others.map((o) => ({ id: o.id, name: o.name, familyId: o.familyId, gridPosition: o.gridPosition }))
      );
      if (conflicts.length > 0) {
        map.set(p.id, conflicts);
        conflicts.forEach((c) => {
          const key = [p.id, c.neighborId].sort().join('|');
          if (!seen.has(key)) {
            seen.add(key);
            list.push({ plantId: p.id, plantName: p.name, conflict: c });
          }
        });
      }
    });
    return { conflictMap: map, conflictList: list };
  }, [inhabitants]);

  // Plant health drawer + tap-vs-drag guard (a drag that travels
  // must not open the drawer on release)
  const [selectedPlant, setSelectedPlant] = useState<Inhabitant | null>(null);
  const suppressClickRef = useRef(false);

  const handleSelectPlant = (p: Inhabitant) => {
    if (suppressClickRef.current) return;
    setSelectedPlant(p);
  };

  // Threat Watch: top threats across everything currently planted,
  // high severity first, then by number of plants affected.
  const threatWatch = useMemo(() => {
    const byId = new Map<string, { threat: PlantThreat; plants: string[] }>();
    inhabitants.forEach((p) => {
      getThreatsForPlant(p.name).forEach((t) => {
        const entry = byId.get(t.id) ?? { threat: t, plants: [] as string[] };
        if (!entry.plants.includes(p.name)) entry.plants.push(p.name);
        byId.set(t.id, entry);
      });
    });
    const rank: Record<PlantThreat['severity'], number> = { high: 0, medium: 1, low: 2 };
    return [...byId.values()]
      .sort((a, b) => rank[a.threat.severity] - rank[b.threat.severity] || b.plants.length - a.plants.length)
      .slice(0, 5);
  }, [inhabitants]);

  // Where inside a bed did the pointer land? Converts the dragged node's
  // translated rect into a grid cell, clamped to the bed's footprint.
  // Falls back to the bed's top-left corner when the rect is unavailable.
  const dropCellInPlanter = (activeRect: { left: number; top: number; width: number; height: number } | null | undefined, planter: Planter) => {
    const fallback = { ...planter.gridPosition };
    try {
      const gridEl = gridInnerRef.current;
      if (!activeRect || !gridEl) return fallback;
      const box = gridEl.getBoundingClientRect();
      const cx = activeRect.left + activeRect.width / 2 - box.left;
      const cy = activeRect.top + activeRect.height / 2 - box.top;
      const gx = Math.round(cx / cell - 0.5);
      const gy = Math.round(cy / cell - 0.5);
      return {
        x: Math.max(planter.gridPosition.x, Math.min(planter.gridPosition.x + planter.size.w - 1, gx)),
        y: Math.max(planter.gridPosition.y, Math.min(planter.gridPosition.y + planter.size.h - 1, gy)),
      };
    } catch {
      return fallback;
    }
  };

  // Geometric bed hit-test: which bed (if any) contains the pointer's grid
  // cell? Uses the dragged node's own translated rect, so it doesn't depend
  // on dnd-kit's `over` (whose droppable rects can go stale when the page
  // scrolls mid-drag). Returns null when the pointer isn't over the grid.
  const bedAtPointer = (activeRect: { left: number; top: number; width: number; height: number } | null | undefined) => {
    try {
      const gridEl = gridInnerRef.current;
      if (!activeRect || !gridEl || !cell) return null;
      const box = gridEl.getBoundingClientRect();
      const cx = activeRect.left + activeRect.width / 2 - box.left;
      const cy = activeRect.top + activeRect.height / 2 - box.top;
      if (cx < 0 || cy < 0 || cx > COLS * cell || cy > ROWS * cell) return null;
      const gx = Math.floor(cx / cell);
      const gy = Math.floor(cy / cell);
      const bed = planters.find(p =>
        p.gridPosition && p.size &&
        gx >= p.gridPosition.x && gx < p.gridPosition.x + p.size.w &&
        gy >= p.gridPosition.y && gy < p.gridPosition.y + p.size.h
      );
      return bed ? { bed, pos: { x: gx, y: gy } } : null;
    } catch {
      return null;
    }
  };

  // Companion check: warn when a plant lands next to an antagonist
  // or a same-family neighbor.
  const warnForCompanionConflicts = (plant: Inhabitant, pos: { x: number; y: number }) => {
    const conflicts = checkCompanionConflicts(
      { name: plant.name, familyId: plant.familyId },
      pos,
      inhabitants
        .filter((o) => o.id !== plant.id)
        .map((o) => ({ id: o.id, name: o.name, familyId: o.familyId, gridPosition: o.gridPosition }))
    );
    if (conflicts.length > 0) {
      toast.warning(
        `${plant.name} landed next to ${conflicts.map((c) => c.neighborName).join(', ')} — ${conflicts[0].message}`,
        { duration: 7000 }
      );
    }
  };

  /** Shared plant-placement write: used by drag-drop AND tap-to-place. */
  const commitPlantPlacement = async (inhabitant: Inhabitant, targetPlanter: Planter, newPos: { x: number; y: number }) => {
    try {
      await updateDoc(doc(db, 'inhabitants', inhabitant.id), {
        plotId: plotId,
        gridPosition: newPos,
        planterId: targetPlanter.id,
        // NOTE: no status flip here — 'Planted' is not in the Firestore
        // status enum, so writing it rejects the whole update and the
        // plant bounces back to the rail. planterId marks placement.
        updatedAt: serverTimestamp()
      });

      const currentLayout = plot?.mapLayout || [];
      const updatedLayout = currentLayout.filter(item => item.id !== inhabitant.id);
      updatedLayout.push({ id: inhabitant.id, x: newPos.x, y: newPos.y, type: 'plant' });
      await updateDoc(doc(db, 'spatial_plots', plotId), { mapLayout: updatedLayout });

      toast.success(`${inhabitant.name} planted in ${targetPlanter.name}`);
      warnForCompanionConflicts(inhabitant, newPos);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inhabitants/${inhabitant.id}`);
    }
  };

  const bedsOverlap = (x: number, y: number, w: number, h: number, excludeId?: string) =>
    planters.some(b =>
      b.id !== excludeId &&
      x < b.gridPosition.x + b.size.w && x + w > b.gridPosition.x &&
      y < b.gridPosition.y + b.size.h && y + h > b.gridPosition.y
    );

  /** Shared bed-move write: used by drag-drop AND tap-to-move. Plants riding the bed move with it. */
  const commitBedMove = async (planter: Planter, rawX: number, rawY: number) => {
    // Beds stay inside the plot outline
    const newX = Math.max(0, Math.min(COLS - planter.size.w, rawX));
    const newY = Math.max(0, Math.min(ROWS - planter.size.h, rawY));
    if (newX === planter.gridPosition.x && newY === planter.gridPosition.y) return false;

    try {
      await updateDoc(doc(db, 'planters', planter.id), {
        gridPosition: { x: newX, y: newY }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `planters/${planter.id}`);
      return false;
    }

    const dx = newX - planter.gridPosition.x;
    const dy = newY - planter.gridPosition.y;
    if (dx !== 0 || dy !== 0) {
      const riders = inhabitants.filter(p =>
        p.planterId === planter.id ||
        (!p.planterId && p.gridPosition &&
          p.gridPosition.x >= planter.gridPosition.x && p.gridPosition.x < planter.gridPosition.x + planter.size.w &&
          p.gridPosition.y >= planter.gridPosition.y && p.gridPosition.y < planter.gridPosition.y + planter.size.h)
      );
      for (const r of riders) {
        const next = plantCellAfterBedMove(
          { x: r.gridPosition?.x || 0, y: r.gridPosition?.y || 0 },
          dx,
          dy,
          COLS,
          ROWS
        );
        try {
          await updateDoc(doc(db, 'inhabitants', r.id), {
            gridPosition: next,
            planterId: planter.id,
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `inhabitants/${r.id}`);
        }
      }
    }
    return true;
  };

  /** Nudge the moving bed one cell; used by the banner arrow pad. */
  /** Tap-to-move: tap anywhere on the plot (bed or bare grid) to drop the bed there. */
  const handleMoveTap = (e: React.MouseEvent) => {
    if (!movingBed || placingPlant) return;
    const el = gridInnerRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const gx = Math.floor((e.clientX - box.left) / cell);
    const gy = Math.floor((e.clientY - box.top) / cell);
    if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return;
    if (bedsOverlap(gx, gy, movingBed.size.w, movingBed.size.h, movingBed.id)) {
      toast.warning("Can't move there — another bed is in the way.");
      return;
    }
    const mb = movingBed;
    commitBedMove(mb, gx, gy).then((moved) => {
      if (moved) {
        setMovingBed(null);
        toast.success(`Moved ${mb.name}`);
      }
    });
  };

  const nudgeMovingBed = async (dx: number, dy: number) => {
    if (!movingBed) return;
    const nx = Math.max(0, Math.min(COLS - movingBed.size.w, movingBed.gridPosition.x + dx));
    const ny = Math.max(0, Math.min(ROWS - movingBed.size.h, movingBed.gridPosition.y + dy));
    if (bedsOverlap(nx, ny, movingBed.size.w, movingBed.size.h, movingBed.id)) {
      toast.warning("Can't move there — another bed is in the way.");
      return;
    }
    const moved = await commitBedMove(movingBed, nx, ny);
    if (moved) {
      // refresh the moving snapshot so repeated nudges keep working
      setMovingBed({ ...movingBed, gridPosition: { x: nx, y: ny } });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveId(null);
    setActiveType(null);

    // If the pointer actually traveled, this was a drag — don't let
    // the release click open the plant health drawer.
    if (Math.abs(delta.x) > 4 || Math.abs(delta.y) > 4) {
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 200);
    }

    if (!active || !user || !plotId) return;

    const xDiff = Math.round(delta.x / cell);
    const yDiff = Math.round(delta.y / cell);

    if (active.data.current?.type === 'planter') {
      const planter = planters.find(p => p.id === active.id);
      if (planter) {
        await commitBedMove(planter, planter.gridPosition.x + xDiff, planter.gridPosition.y + yDiff);
      }
    } else if (active.data.current?.type === 'plant') {
      const inhabitant = [...inhabitants, ...availableInhabitants].find(p => p.id === active.id);
      if (!inhabitant) {
        toast.error('Could not find that plant — try again.');
        return;
      }
      if (inhabitant && plot) {
        // A tap isn't a drop — leave everything alone.
        if (Math.abs(delta.x) < 4 && Math.abs(delta.y) < 4) return;

        // Plants only live in beds — never on bare plot. Find the bed
        // geometrically first (robust to stale droppable rects), then fall
        // back to dnd-kit's `over` target.
        const translated = active.rect.current?.translated;
        let target = bedAtPointer(translated);
        if (!target && over && over.data.current?.type === 'planter') {
          const bed = planters.find(p => p.id === over.id);
          if (bed) target = { bed, pos: dropCellInPlanter(translated, bed) };
        }
        // Dropped back over the rail (above the grid): silent snap-back.
        if (!target && translated && gridInnerRef.current) {
          const box = gridInnerRef.current.getBoundingClientRect();
          const cy = translated.top + translated.height / 2 - box.top;
          if (cy < 0) return;
        }
        if (!target) {
          // Dropped on bare plot — not allowed. It animates back on its own.
          toast.warning('Plants need a bed — drop it on a bed to plant it.', { duration: 4000 });
          return;
        }
        // Land where the pointer actually is inside the bed, not the corner.
        await commitPlantPlacement(inhabitant, target.bed, target.pos);
      }
    }
  };

  const deletePlanter = async () => {
    if (!itemToDelete || itemToDelete.type !== 'planter') return;
    const id = itemToDelete.id;
    setIsDeletingConfirmed(true);
    try {
      const inhabitantsInPlanter = inhabitants.filter(p =>
        p.planterId === id ||
        (!p.planterId && p.gridPosition &&
          p.gridPosition.x >= planters.find(pl => pl.id === id)!.gridPosition.x && p.gridPosition.x < planters.find(pl => pl.id === id)!.gridPosition.x + planters.find(pl => pl.id === id)!.size.w && p.gridPosition.y >= planters.find(pl => pl.id === id)!.gridPosition.y && p.gridPosition.y < planters.find(pl => pl.id === id)!.gridPosition.y + planters.find(pl => pl.id === id)!.size.h)
      );
      for (const inhabitant of inhabitantsInPlanter) {
        await updateDoc(doc(db, 'inhabitants', inhabitant.id), {
          gridPosition: { x: 0, y: 0 },
          planterId: deleteField(),
          // Back to the rail: Planted -> Pending
          ...(inhabitant.status === 'Planted' ? { status: 'Pending' as const } : {}),
        });
      }
      await deleteDoc(doc(db, 'planters', id));
      setEditingPlanter(null);
      toast.success('Planter removed');
      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `planters/${id}`);
    } finally {
      setIsDeletingConfirmed(false);
    }
  };

  const rotatePlanter = async (id: string) => {
    const planter = planters.find(p => p.id === id);
    if (!planter) return;
    // 90-degree rotation: swap width and height, then pull back inside the plot
    const newSize = { w: planter.size.h, h: planter.size.w };
    const newX = Math.max(0, Math.min(COLS - newSize.w, planter.gridPosition.x));
    const newY = Math.max(0, Math.min(ROWS - newSize.h, planter.gridPosition.y));
    try {
      await updateDoc(doc(db, 'planters', id), {
        size: newSize,
        gridPosition: { x: newX, y: newY }
      });
      // Plants riding in the bed keep riding: shift them by the same delta the
      // bed moved, clamped inside the bed's new footprint so the arrangement
      // survives the rotation instead of stacking at the origin.
      const dx = newX - planter.gridPosition.x;
      const dy = newY - planter.gridPosition.y;
      const riders = inhabitants.filter(p =>
        p.planterId === id ||
        (!p.planterId && p.gridPosition &&
          p.gridPosition.x >= planter.gridPosition.x && p.gridPosition.x < planter.gridPosition.x + planter.size.w &&
          p.gridPosition.y >= planter.gridPosition.y && p.gridPosition.y < planter.gridPosition.y + planter.size.h)
      );
      for (const r of riders) {
        const rx = Math.max(newX, Math.min(newX + newSize.w - 1, (r.gridPosition?.x || 0) + dx));
        const ry = Math.max(newY, Math.min(newY + newSize.h - 1, (r.gridPosition?.y || 0) + dy));
        await updateDoc(doc(db, 'inhabitants', r.id), {
          gridPosition: { x: rx, y: ry },
          planterId: id,
        });
      }
      toast.success('Bed rotated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `planters/${id}`);
    }
  };

  const handleDuplicateBed = async (planter: Planter) => {
    if (!user || !plotId) return;
    setSelectedPlanterId(null);
    try {
      const result = await duplicateBed({
        bed: { ...planter, plotId, ownerUid: user.uid },
        plants: [...inhabitants, ...availableInhabitants],
        siblingBeds: planters
          .filter((p) => p.id !== planter.id)
          .map((p) => ({ id: p.id, name: p.name, gridPosition: p.gridPosition, size: p.size, color: p.color })),
        plotCols: COLS,
        plotRows: ROWS,
      });
      if (!result) {
        toast.warning('No room for a copy — the plot is full.');
      } else {
        toast.success(
          `Duplicated as "${result.name}"${result.plantsCopied ? ` with ${result.plantsCopied} plant${result.plantsCopied === 1 ? '' : 's'}` : ''}`
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'planters');
    }
  };

  const handleUpdatePlot = async (data: PlotEditData) => {
    if (!plotId || isSaving) return;

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'spatial_plots', plotId), { ...data });

      toast.success('Plot details updated');

      setTimeout(() => {
        setIsEditingPlot(false);
        setIsSaving(false);
      }, 500);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `spatial_plots/${plotId}`);
      setIsSaving(false);
    }
  };

  const [isDeletingConfirmed, setIsDeletingConfirmed] = useState(false);

  const handleDeletePlot = async () => {
    if (!plotId || !itemToDelete || itemToDelete.type !== 'plot' || !user) return;
    const uid = user.uid;
    setIsDeletingConfirmed(true);
    
    try {
      // 1. Get planters
      const plantersQ = query(collection(db, 'planters'), where('plotId', '==', plotId), where('ownerUid', '==', uid));
      const plantersSnap = await getDocs(plantersQ);
      const planterIds = plantersSnap.docs.map(d => d.id);

      // 2. Unassign inhabitants
      const inhabitantsQ = query(collection(db, 'inhabitants'), where('plotId', '==', plotId), where('ownerUid', '==', uid));
      const inhabitantsSnap = await getDocs(inhabitantsQ);
      for (const d of inhabitantsSnap.docs) {
        const data = d.data();
        await updateDoc(doc(db, 'inhabitants', d.id), {
          plotId: deleteField(),
          planterId: deleteField(),
          gridPosition: { x: 0, y: 0 },
          // Back to unassigned: Planted -> Pending
          ...(data.status === 'Planted' ? { status: 'Pending' } : {})
        });
      }

      // 3. Delete planters in batch
      if (planterIds.length > 0) {
        await batchDelete('planters', planterIds);
      }

      // 4. Delete plot
      await deleteDoc(doc(db, 'spatial_plots', plotId));
      
      toast.success('Plot deleted and inhabitants unassigned');
      setShowDeleteModal(false);
      setItemToDelete(null);
      navigate('/');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `spatial_plots/${plotId}`);
    } finally {
      setIsDeletingConfirmed(false);
    }
  };

  const addMaintenanceLog = async (force = false) => {
    if (!plotId || !newLog.action || isSaving || !user) return;

    if (!force) {
      // Check for treatment conflicts
      const conflictResult = checkTreatmentConflict(newLog.action, eventLogs);
      if (conflictResult.conflict && conflictResult.conflictingLog) {
        setConflictModalData({
          isOpen: true,
          message: conflictResult.message || '',
          action: newLog.action,
          conflictingAction: conflictResult.conflictingLog.eventType || conflictResult.conflictingLog.type || 'Unknown',
          conflictingDate: new Date(conflictResult.conflictingLog.date).toLocaleDateString()
        });
        return;
      }
    }

    setIsSaving(true);
    
    try {
      await logEvent({
        ownerUid: user.uid,
        category: 'event_logs',
        eventType: 'Treatment',
        data: {
          targetId: plotId,
          targetType: 'SpatialPlot',
          type: 'Treatment',
          plotId: plotId,
          action: newLog.action,
          notes: newLog.notes,
          date: new Date().toISOString()
        },
        calendarTitle: `Maintenance: ${newLog.action} (${plot?.name || 'Plot'})`,
        calendarDescription: newLog.notes || `Maintenance performed on ${plot?.name || 'plot'}.`
      });

      await updateDoc(doc(db, 'spatial_plots', plotId), {
        healthStatus: 'Stable' // Update health status on maintenance
      });
      
      toast.success('Maintenance log added');
      
      setTimeout(() => {
        setNewLog({ action: '', notes: '' });
        setIsAddingLog(false);
        setIsSaving(false);
        setConflictModalData(null);
      }, 500);
    } catch (error) {
      console.error('Error adding maintenance log:', error);
      toast.error('Failed to add maintenance log');
      setIsSaving(false);
    }
  };

  const handleWeedingVictory = async (data: any) => {
    if (!user || !plotId) return;
    
    try {
      await logEvent({
        ownerUid: user.uid,
        category: 'event_logs',
        eventType: 'Weeding',
        data: {
          ...data,
          targetId: plotId,
          targetType: 'SpatialPlot',
          type: 'Weeding',
          date: new Date().toISOString()
        },
        calendarTitle: `Weeding Victory: ${data.weedType} (${plot?.name || 'Plot'})`,
        calendarDescription: `Cleared ${data.areaCleared} sq ft of ${data.weedType} using ${data.method}. Efficiency: ${data.weq.toFixed(1)} WEQ.`
      });

      toast.success(`Tactical weeding logged for ${plot?.name}`);
    } catch (error) {
      console.error('Error logging weeding victory:', error);
      toast.error('Failed to log weeding victory');
    }
  };

  const addChecklistItem = async () => {
    if (!plotId || !newTask || !user || isSaving) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'tasks'), {
        ownerUid: user.uid,
        plotId: plotId,
        task: newTask,
        completed: false,
        category: 'Maintenance',
        createdAt: serverTimestamp()
      });
      
      toast.success('Task added to plot checklist');
      
      setNewTask('');
      setIsAddingTask(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleChecklistItem = async (task: ChecklistItem) => {
    if (!user || migratingTasks.has(task.id)) return;

    setMigratingTasks(prev => new Set(prev).add(task.id));
    const toastId = toast.loading(`Migrating "${task.task}" to history...`);

    try {
      await logEvent({
        ownerUid: user.uid,
        category: 'task_history',
        eventType: 'Task',
        data: {
          taskId: task.id,
          task: task.task,
          plotId: plotId,
          plotName: plot?.name || 'Unknown',
          plantId: task.plantId || null,
          plantName: task.plantName || null,
          category: task.category || 'Maintenance',
          status: 'Completed',
          timestamp: new Date().toISOString()
        },
        calendarTitle: `Completed: ${task.task} (${plot?.name || 'Plot'})`,
        calendarDescription: `Task completed in plot: ${plot?.name || 'Unknown'}`
      });

      // Delete from active tasks
      await deleteDoc(doc(db, 'tasks', task.id));

      toast.success(`"${task.task}" migrated to history and calendar`, { id: toastId });
    } catch (error) {
      console.error('Migration error:', error);
      toast.error('Failed to complete task migration', { id: toastId });
    } finally {
      setMigratingTasks(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const deleteChecklistItem = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
      toast.success('Task removed');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${taskId}`);
    }
  };

  useEffect(() => {
    if (location.state?.waterPlantId && inhabitants.length > 0) {
      handleWaterPlant(location.state.waterPlantId);
      // Clear state
      window.history.replaceState({}, document.title);
    }
  }, [location.state, inhabitants]);

  const handleWaterPlant = async (inhabitantId: string) => {
    if (!user || !plot) return;
    const inhabitant = inhabitants.find(p => p.id === inhabitantId);
    if (!inhabitant) return;

    try {
      const nextDate = addDays(new Date(), 2); // Default to 2 days
      await logEvent({
        ownerUid: user.uid,
        category: 'event_logs',
        eventType: 'Watering',
        data: {
          targetId: inhabitantId,
          targetType: 'Inhabitant',
          type: 'Watering',
          plotId: plotId,
          notes: `Hydrated ${inhabitant.name}`,
          date: new Date().toISOString()
        },
        calendarTitle: `Watered: ${inhabitant.name} (${plot.name})`,
        calendarDescription: `Hydration session for ${inhabitant.name} in ${plot.name}.`
      });

      // Update inhabitant document
      await updateDoc(doc(db, 'inhabitants', inhabitantId), {
        needsWater: false,
        nextWatering: format(nextDate, 'yyyy-MM-dd')
      });

      // Recalculate vigor from the fresh watering event
      recalculateVigor({ ...inhabitant, needsWater: false, nextWatering: format(nextDate, 'yyyy-MM-dd') } as Inhabitant, eventLogs as any).catch(() => {});

      toast.success(`${inhabitant.name} hydrated and logged!`);
    } catch (error) {
      console.error('Error watering plant:', error);
      toast.error('Failed to log watering event');
    }
  };
  const generateQuickTips = async () => {
    if (!plot || inhabitants.length === 0) {
      toast.info('Add some inhabitants to get tailored tips!');
      return;
    }
    setLoadingTips(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const inhabitantNames = inhabitants.map(p => p.name).join(', ');
      const prompt = `As a master gardener, provide 3 quick, actionable "Pro-Tips" for a garden plot containing these plants: ${inhabitantNames}. The plot status is ${plot.status}. Keep each tip concise (under 20 words). Format as a simple list.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      setQuickTips(response.text || 'No tips available at the moment.');
    } catch (error) {
      console.error('Error generating tips:', error);
      toast.error('Failed to generate tips');
    } finally {
      setLoadingTips(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 px-6 pb-20 animate-pulse">
        <div className="h-48 bg-surface-container-low rounded-[2.5rem]" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-surface-container-low rounded-[2.5rem]" />
          <div className="h-96 bg-surface-container-low rounded-[2.5rem]" />
        </div>
      </div>
    );
  }

  if (!plot) {
    return (
      <div className="p-20 text-center space-y-4">
        <h2 className="text-2xl font-bold">Plot Not Found</h2>
        <p className="text-on-surface-variant">The plot you're looking for doesn't exist or you don't have permission to view it.</p>
        <button 
          onClick={() => navigate('/')}
          className="bg-primary text-white px-6 py-2 rounded-full font-bold"
        >
          Back to Hub
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6 pb-20">
      {/* Bed info sheet: tap a bed on the map for its details */}
      <AnimatePresence>
        {selectedPlanterId && (() => {
          const planter = planters.find(p => p.id === selectedPlanterId);
          if (!planter) return null;
          const bedPlants = inhabitants.filter(p =>
            p.planterId === planter.id ||
            (!p.planterId && p.gridPosition &&
              p.gridPosition.x >= planter.gridPosition.x && p.gridPosition.x < planter.gridPosition.x + planter.size.w &&
              p.gridPosition.y >= planter.gridPosition.y && p.gridPosition.y < planter.gridPosition.y + planter.size.h)
          );
          return (
            <motion.div
              key="bed-sheet"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[105] flex items-end justify-center sm:items-center p-4"
              onClick={() => setSelectedPlanterId(null)}
            >
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 space-y-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl shadow-inner" style={{ backgroundColor: planter.color }} />
                    <div>
                      <h3 className="font-black text-xl tracking-tight">{planter.name}</h3>
                      <p className="text-xs font-bold text-on-surface-variant">
                        {planter.size.w} × {planter.size.h} cells • {bedPlants.length} plant{bedPlants.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedPlanterId(null)} className="p-2 hover:bg-stone-100 rounded-full text-on-surface-variant">
                    <X size={20} />
                  </button>
                </div>

                {bedPlants.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {bedPlants.map(p => (
                      <div key={p.id} className="flex flex-col items-center gap-1 shrink-0 w-14">
                        <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 overflow-hidden flex items-center justify-center">
                          {p.image ? (
                            <PlantImage src={p.image} className="w-full h-full object-cover" />
                          ) : (
                            <Leaf size={18} className="text-primary" />
                          )}
                        </div>
                        <span className="text-[9px] font-bold text-center leading-tight line-clamp-2">{p.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-3">
                  <button
                    onClick={() => rotatePlanter(planter.id)}
                    className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-primary/10 text-primary font-black text-xs hover:bg-primary/20 transition-colors"
                  >
                    <RotateCw size={20} />
                    Rotate
                  </button>
                  <button
                    onClick={() => handleDuplicateBed(planter)}
                    className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-stone-100 text-on-surface font-black text-xs hover:bg-stone-200 transition-colors"
                  >
                    <Copy size={20} />
                    Duplicate
                  </button>
                  <button
                    onClick={() => { setSelectedPlanterId(null); setEditingPlanter(planter); }}
                    className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-stone-100 text-on-surface font-black text-xs hover:bg-stone-200 transition-colors"
                  >
                    <Settings2 size={20} />
                    Edit
                  </button>
                  <button
                    onClick={() => { setSelectedPlanterId(null); setItemToDelete({ id: planter.id, type: 'planter' }); setShowDeleteModal(true); }}
                    className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-red-50 text-red-500 font-black text-xs hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={20} />
                    Delete
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
      {/* Plot Header & Metadata */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-surface-container-low p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-sm">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/plots')}
            className="p-4 hover:bg-surface-container-high rounded-2xl transition-colors text-on-surface-variant"
          >
            <ArrowLeft size={28} />
          </button>
          <div className="space-y-1">
            <div className="flex items-center gap-4">
              <h3 className="font-headline font-black text-3xl tracking-tight">{plot.name}</h3>
              <div className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2",
                plot.status === 'Active' ? "bg-primary/10 text-primary" : "bg-on-surface-variant/10 text-on-surface-variant"
              )}>
                <Activity size={12} />
                {plot.status}
              </div>
              <div className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2",
                plot.healthStatus === 'Excellent' ? "bg-green-100 text-green-700" :
                plot.healthStatus === 'Stable' ? "bg-blue-100 text-blue-700" :
                plot.healthStatus === 'Stressed' ? "bg-yellow-100 text-yellow-700" :
                "bg-red-100 text-red-700"
              )}>
                <Activity size={12} />
                {plot.healthStatus || 'Stable'}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-on-surface-variant font-medium">
              <div className="flex items-center gap-2">
                <Leaf size={16} className="text-primary" />
                <span>Inhabitants: <span className="font-black text-on-surface">{inhabitants.length}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-primary" />
                <span>Vigor: <span className="font-black text-on-surface">{eliteInsights?.avgVigor ? `${eliteInsights.avgVigor}%` : '—'}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Info size={16} className="text-primary" />
                <span>Family: <span className="font-black text-on-surface">{plot.plantFamily || 'Not set'}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Sun size={16} className="text-amber-500" />
                <span>Sun: <span className="font-black text-on-surface">{plot.sunExposure || plot.sunlight || 'Not set'}</span></span>
              </div>
              {plot.irrigationZone && (
                <div className="flex items-center gap-2">
                  <Droplets size={16} className="text-blue-500" />
                  <span>Irrigation: <span className="font-black text-on-surface">{plot.irrigationZone}</span></span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-primary" />
                <span>Started: <span className="font-black text-on-surface">{plot.startDate || plot.plantingDate || 'Not set'}</span></span>
              </div>
              {plot.endDate && (
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-primary" />
                  <span>Ends: <span className="font-black text-on-surface">{plot.endDate}</span></span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Info size={16} className="text-primary" />
                <span>Soil: <span className="font-black text-on-surface">{plot.soilType || 'Not set'}</span></span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={cn(
              "p-4 rounded-2xl transition-all touch-target",
              showAdvanced ? "bg-secondary text-white" : "hover:bg-surface-container-high text-on-surface-variant"
            )}
            title={showAdvanced ? "Hide Advanced Data" : "View Advanced Data"}
          >
            {showAdvanced ? <EyeOff size={24} /> : <Eye size={24} />}
          </button>
          <button 
            onClick={() => setIsEditingPlot(true)}
            className="p-4 hover:bg-surface-container-high rounded-2xl transition-colors text-on-surface-variant touch-target"
            title="Edit Plot Details"
          >
            <Edit3 size={24} />
          </button>
          <div className="w-px h-10 bg-outline-variant/20 mx-2" />
          <div className="flex items-center gap-1 bg-white/50 p-1 rounded-xl border border-outline-variant/10">
            <button onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))} className="p-2 hover:bg-surface-container-high rounded-lg transition-colors"><Minimize2 size={20} /></button>
            <span className="text-[10px] font-black w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(prev => Math.min(2, prev + 0.1))} className="p-2 hover:bg-surface-container-high rounded-lg transition-colors"><Maximize2 size={20} /></button>
          </div>
          <button 
            onClick={() => setShowBedQuiz(true)}
            className="flex items-center gap-2 px-8 py-4 bg-primary text-white rounded-2xl font-black text-sm hover:shadow-lg transition-all"
          >
            <Plus size={20} /> Add Bed
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Grid Editor */}
          <div className="lg:col-span-3 space-y-4">
            {/* Plant rail — quiz picks land here, drag them onto the bed */}
            <div className="bg-white p-4 rounded-3xl border border-outline-variant/10 shadow-sm">
              <div className="flex items-center justify-between mb-3 px-2">
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                  Your plants <span className="text-primary">— tap one, then tap a bed cell</span>
                </h4>
                <span className="text-[10px] font-bold text-on-surface-variant">
                  {availableInhabitants.length} to place
                </span>
              </div>
              {availableInhabitants.length === 0 ? (
                <p className="text-xs text-on-surface-variant italic px-2 py-3 text-center">
                  All plants are placed. Pick more with the bed quiz or add them from the Library.
                </p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 pt-1 px-1 snap-x custom-scrollbar">
                  {availableInhabitants.map(inhabitant => (
                    <DraggablePlantIcon
                      key={inhabitant.id}
                      inhabitant={inhabitant}
                      compact
                      selected={placingPlant?.id === inhabitant.id}
                      onTapPlant={(p) => {
                        if (suppressClickRef.current) return;
                        setMovingBed(null);
                        setPlacingPlant(prev => prev?.id === p.id ? null : p);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-outline-variant/10 shadow-sm">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Spatial Layers</span>
              </div>
              <div className="flex gap-2">
                {[
                  { id: 'none', label: 'Default', icon: MapIcon },
                  { id: 'family', label: 'Family', icon: Tag },
                  { id: 'irrigation', label: 'Irrigation', icon: Droplets }
                ].map(layer => (
                  <button
                    key={layer.id}
                    onClick={() => setActiveLayer(layer.id as any)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      activeLayer === layer.id ? "bg-primary text-white shadow-lg" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                    )}
                  >
                    <layer.icon size={12} />
                    {layer.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              id="plot-grid"
              ref={gridWrapRef}
              onClick={() => setSelectedPlanterId(null)}
              className="relative overflow-auto bg-stone-100 rounded-[2.5rem] border-4 border-stone-200 shadow-inner min-h-[420px] p-6 custom-scrollbar"
            >
            {/* Tap-to-place / tap-to-move banners */}
            <AnimatePresence>
              {placingPlant && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="mb-3 flex items-center gap-3 bg-primary text-white rounded-2xl px-4 py-3 shadow-lg"
                >
                  <Target size={18} className="shrink-0" />
                  <p className="text-sm font-bold flex-1">Tap a bed cell to plant <span className="font-black">{placingPlant.name}</span></p>
                  <button
                    onClick={() => setPlacingPlant(null)}
                    className="p-2 rounded-xl bg-white/20 hover:bg-white/30 active:scale-90"
                    aria-label="Cancel placing"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              )}
              {movingBed && !placingPlant && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="mb-3 bg-stone-800 text-white rounded-2xl px-4 py-3 shadow-lg space-y-2"
                >
                  <div className="flex items-center gap-3">
                    <Move size={18} className="shrink-0" />
                    <p className="text-sm font-bold flex-1">Move <span className="font-black">{movingBed.name}</span> — tap the plot, or nudge it:</p>
                    <button
                      onClick={() => { setMovingBed(null); toast.info('Move cancelled'); }}
                      className="p-2 rounded-xl bg-white/20 hover:bg-white/30 active:scale-90"
                      aria-label="Done moving"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    {[
                      { dx: 0, dy: -1, label: 'Up', arrow: '▲' },
                      { dx: -1, dy: 0, label: 'Left', arrow: '◀' },
                      { dx: 1, dy: 0, label: 'Right', arrow: '▶' },
                      { dx: 0, dy: 1, label: 'Down', arrow: '▼' },
                    ].map(a => (
                      <button
                        key={a.label}
                        onClick={() => nudgeMovingBed(a.dx, a.dy)}
                        aria-label={`Nudge ${a.label}`}
                        className="w-12 h-12 rounded-2xl bg-white/15 hover:bg-white/25 active:scale-90 text-lg font-black touch-target flex items-center justify-center"
                      >
                        {a.arrow}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div
              ref={gridInnerRef}
              onClick={(e) => {
                // Tap-to-move: tapping the plot grid relocates the selected bed.
                if (!movingBed) return;
                const box = gridInnerRef.current?.getBoundingClientRect();
                if (!box) return;
                const gx = Math.floor((e.clientX - box.left) / cell);
                const gy = Math.floor((e.clientY - box.top) / cell);
                const nx = Math.max(0, Math.min(COLS - movingBed.size.w, gx));
                const ny = Math.max(0, Math.min(ROWS - movingBed.size.h, gy));
                if (bedsOverlap(nx, ny, movingBed.size.w, movingBed.size.h, movingBed.id)) {
                  toast.warning('That spot overlaps another bed — pick a clear area.');
                  return;
                }
                commitBedMove(movingBed, nx, ny).then(() => {
                  toast.success(`${movingBed.name} moved`);
                  setMovingBed(null);
                });
              }}
              className="relative bg-white shadow-2xl mx-auto rounded-lg border-4 border-primary/60"
                style={{
                  width: COLS * cell,
                  height: ROWS * cell,
                  backgroundImage: `linear-gradient(to right, #e7e5e4 1px, transparent 1px), linear-gradient(to bottom, #e7e5e4 1px, transparent 1px)`,
                  backgroundSize: `${cell}px ${cell}px`
                }}
              >
                {planters.map(planter => (
                  <PlanterItem
                    key={planter.id}
                    planter={planter}
                    cell={cell}
                    selected={selectedPlanterId === planter.id}
                    onEdit={() => setEditingPlanter(planter)}
                    onTap={() => {
                      // A tap that ends a drag shouldn't also select the bed
                      if (suppressClickRef.current) return;
                      setSelectedPlanterId(prev => prev === planter.id ? null : planter.id);
                    }}
                    inhabitants={inhabitants.filter(p => (p.gridPosition?.x ?? -1) >= planter.gridPosition.x && (p.gridPosition?.x ?? -1) < planter.gridPosition.x + planter.size.w && (p.gridPosition?.y ?? -1) >= planter.gridPosition.y && (p.gridPosition?.y ?? -1) < planter.gridPosition.y + planter.size.h)}
                    activeLayer={activeLayer}
                    onSelectPlant={handleSelectPlant}
                    placing={!!placingPlant}
                    onPlaceCell={(bed, pos) => {
                      if (!placingPlant) return;
                      const plant = placingPlant;
                      setPlacingPlant(null);
                      commitPlantPlacement(plant, bed, pos);
                    }}
                  />
                ))}

                {inhabitants.filter(p => !planters.some(pl => (p.gridPosition?.x ?? -1) >= pl.gridPosition.x && (p.gridPosition?.x ?? -1) < pl.gridPosition.x + pl.size.w && (p.gridPosition?.y ?? -1) >= pl.gridPosition.y && (p.gridPosition?.y ?? -1) < pl.gridPosition.y + pl.size.h)).map(inhabitant => (
                  <DraggableItem
                    key={inhabitant.id}
                    id={inhabitant.id}
                    type="plant"
                    position={inhabitant.gridPosition}
                    size={{ w: 1, h: 1 }}
                    cell={cell}
                    image={inhabitant.image}
                    name={inhabitant.name}
                    activeLayer={activeLayer}
                    inhabitant={inhabitant}
                    hasConflict={conflictMap.has(inhabitant.id)}
                    onSelect={handleSelectPlant}
                  />
                ))}

                {/* Suitability Heatmap Overlay during Drag */}
                {activeId && activeType === 'plant' && plot && (
                  <SuitabilityOverlay
                    activePlant={[...inhabitants, ...availableInhabitants].find(p => p.id === activeId) || {}}
                    plot={plot}
                    inhabitants={inhabitants}
                    cell={cell}
                    cols={COLS}
                    rows={ROWS}
                  />
                )}
              </div>

              <DragOverlay dropAnimation={null}>
                {activeId ? (
                  <div
                    className={cn(
                      "rounded-lg shadow-2xl flex items-center justify-center border-2 border-primary ring-4 ring-primary/20",
                      activeType === 'planter' ? "bg-primary/20" : "bg-white"
                    )}
                    style={{
                      width: (activeType === 'planter' ? planters.find(p => p.id === activeId)?.size.w || 1 : 1) * cell,
                      height: (activeType === 'planter' ? planters.find(p => p.id === activeId)?.size.h || 1 : 1) * cell,
                    }}
                  >
                    {activeType === 'plant' ? <Leaf size={Math.max(12, cell * 0.66)} className="text-primary" /> : <Box size={Math.max(16, cell)} className="text-primary" />}
                  </div>
                ) : null}
              </DragOverlay>
            </div>
            <p className="text-[11px] font-bold text-on-surface-variant text-center">
              Tap a plant in the rail, then tap a bed cell to plant it — or drag if you prefer. Move beds with the Move button on their card, then tap the plot where the bed should go.
            </p>

            {/* Bed cards — one per bed, tap for the focused single-bed view */}
            {planters.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">Beds in this plot</h3>
                  <span className="text-[11px] font-bold text-on-surface-variant">{planters.length} bed{planters.length === 1 ? '' : 's'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {planters.map(bed => {
                    const bedPlants = inhabitants.filter(p =>
                      p.planterId === bed.id ||
                      (!p.planterId && p.gridPosition &&
                        p.gridPosition.x >= bed.gridPosition.x && p.gridPosition.x < bed.gridPosition.x + bed.size.w &&
                        p.gridPosition.y >= bed.gridPosition.y && p.gridPosition.y < bed.gridPosition.y + bed.size.h)
                    );
                    const vigor = averageVigor(bedPlants);
                    return (
                      <button
                        key={bed.id}
                        onClick={() => navigate(`/plots/${plotId}/beds/${bed.id}`)}
                        className="text-left bg-white rounded-2xl border border-outline-variant/30 p-4 hover:border-primary/40 hover:shadow-md transition-all"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-black text-sm text-on-surface truncate">{bed.name || 'Bed'}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPlacingPlant(null);
                                setSelectedPlanterId(bed.id);
                                setMovingBed(bed);
                                document.getElementById('plot-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-800 text-white text-[11px] font-black active:scale-95 transition-transform"
                              aria-label={`Move ${bed.name || 'bed'}`}
                            >
                              <Move size={12} /> Move
                            </button>
                            <ChevronRight size={16} className="text-on-surface-variant" />
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] font-bold text-on-surface-variant">
                          <span className="flex items-center gap-1"><Leaf size={12} /> {bedPlants.length} plant{bedPlants.length === 1 ? '' : 's'}</span>
                          <span>{bed.size.w}×{bed.size.h} cells</span>
                          <span className={cn("ml-auto", vigor === null ? "text-on-surface-variant/50" : vigor >= 70 ? "text-emerald-600" : vigor >= 40 ? "text-amber-600" : "text-rose-600")}>
                            {vigor === null ? 'Vigor —' : `Vigor ${vigor}%`}
                          </span>
                        </div>
                        {/* Mini bed preview: plant dots in their cells */}
                        <div
                          className="relative mt-3 rounded-lg bg-primary/5 border border-primary/10 overflow-hidden"
                          style={{ height: Math.max(28, bed.size.h * 10) }}
                        >
                          {bedPlants.filter(p => p.gridPosition).map(p => (
                            <div
                              key={p.id}
                              className="absolute rounded-full bg-primary/70"
                              style={{
                                left: `${((p.gridPosition.x - bed.gridPosition.x) / bed.size.w) * 100}%`,
                                top: `${((p.gridPosition.y - bed.gridPosition.y) / bed.size.h) * 100}%`,
                                width: `${Math.min(100 / bed.size.w, 22)}%`,
                                aspectRatio: '1',
                                transform: 'translate(10%, 10%)'
                              }}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* Sidebar: Stats */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-primary/5 p-6 rounded-[2rem] border border-primary/10">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary mb-4">Plot Inventory</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-primary/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary"><Leaf size={16} /></div>
                    <span className="text-xs font-bold">Planted</span>
                  </div>
                  <span className="font-black text-lg">{inhabitants.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-primary/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><Leaf size={16} /></div>
                    <span className="text-xs font-bold">Waiting to place</span>
                  </div>
                  <span className="font-black text-lg">{availableInhabitants.filter(i => i.plotId === plotId).length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-primary/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary"><Box size={16} /></div>
                    <span className="text-xs font-bold">Beds</span>
                  </div>
                  <span className="font-black text-lg">{planters.length}</span>
                </div>
              </div>
            </div>

            {/* Companion Alerts */}
            {conflictList.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-amber-600 shrink-0" size={18} />
                  <p className="text-xs font-black text-amber-900 uppercase tracking-wider">
                    Companion Alerts ({conflictList.length})
                  </p>
                </div>
                <div className="space-y-2">
                  {conflictList.map(({ plantId, plantName, conflict }) => (
                    <div key={`${plantId}-${conflict.neighborId}`} className="flex gap-2 items-start bg-white/70 rounded-xl p-2.5 border border-amber-100">
                      <span className={`mt-0.5 shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full ${conflict.type === 'enemy' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                        {conflict.type === 'enemy' ? 'Clash' : 'Crowded'}
                      </span>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-bold text-stone-800">{plantName} × {conflict.neighborName}</p>
                        <p className="text-[10px] font-medium text-stone-600 leading-snug">{conflict.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] font-medium text-amber-700 italic">Drag a plant to a new spot to clear its alert.</p>
              </div>
            )}

            {/* Threat Watch */}
            {threatWatch.length > 0 && (
              <div className="bg-white border border-stone-200/80 p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="text-emerald-700 shrink-0" size={18} />
                  <p className="text-xs font-black text-stone-900 uppercase tracking-wider">
                    Threat Watch
                  </p>
                </div>
                <p className="text-[10px] font-medium text-stone-500 -mt-2">
                  Top pests & diseases for what's planted — tap a plant on the bed for its full list.
                </p>
                <div className="space-y-2">
                  {threatWatch.map(({ threat, plants }) => (
                    <ThreatCard key={threat.id} threat={threat} affectedPlants={plants} compact />
                  ))}
                </div>
              </div>
            )}

            {/* Case Manager Alerts */}
            {plot && (
              <div className="space-y-3">
                {(() => {
                  const monoculture = checkMonoculture(inhabitants);
                  if (monoculture.isMonoculture) {
                    return (
                      <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex gap-3 items-start animate-pulse">
                        <Bug className="text-red-500 shrink-0" size={20} />
                        <div className="space-y-1">
                          <p className="text-xs font-black text-red-900 uppercase tracking-wider">Monoculture Alert</p>
                          <p className="text-[10px] font-medium text-red-700">
                            High concentration of {monoculture.dominantFamily} ({monoculture.percentage?.toFixed(0)}%). Diversify to reduce pest risk.
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                
                {inhabitants.some(p => p.nutrientDraw === 'Heavy') && (
                  <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3 items-start">
                    <Thermometer className="text-amber-500 shrink-0" size={20} />
                    <div className="space-y-1">
                      <p className="text-xs font-black text-amber-900 uppercase tracking-wider">Nutrient Draw Analysis</p>
                      <p className="text-[10px] font-medium text-amber-700">Heavy feeders detected. Suggest nitrogen-fixing successors (Beans/Clover) for next rotation.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Daily Garden Dad Joke */}
            <div className="bg-secondary/5 p-6 rounded-[2rem] border border-secondary/10 overflow-hidden relative group">
              <div className="absolute -right-4 -top-4 text-secondary/10 rotate-12 group-hover:rotate-0 transition-transform duration-500">
                <Laugh size={120} />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-secondary/10 rounded-lg text-secondary"><Laugh size={16} /></div>
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-secondary">Garden Humor</h4>
                </div>
                <p className="text-sm font-medium italic text-on-surface leading-relaxed">
                  "{plot.dailyJoke?.text || 'Loading joke...'}"
                </p>
                <p className="text-[10px] font-black text-secondary/60 mt-4 uppercase tracking-widest">Refreshes every 24h</p>
              </div>
            </div>
          </div>

        </div>
      </DndContext>

      {/* Plant health drawer: tap a plant for its pests, diseases & treatments */}
      <PlantHealthDrawer
        plant={selectedPlant}
        onClose={() => setSelectedPlant(null)}
        onLogTreatment={(threat) => {
          if (selectedPlant) {
            setNewLog({
              action: 'Pest Control',
              notes: `${selectedPlant.name} — ${threat.name}: ${threat.quickFix.join(' / ')}`,
            });
          }
          setSelectedPlant(null);
          setIsAddingLog(true);
        }}
        onLogUnknown={(labels) => {
          if (selectedPlant) {
            setNewLog({
              action: 'Pest Control',
              notes: `${selectedPlant.name} — Unknown issue, not in library yet. Symptoms seen: ${labels.length > 0 ? labels.join(', ') : 'none noted'}.`,
            });
          }
          setSelectedPlant(null);
          setIsAddingLog(true);
        }}
      />

      {/* Elite Botanical Insights Section */}
      <div className="px-6 mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-8 rounded-[2.5rem] border space-y-4 shadow-sm transition-all",
            eliteInsights?.monoculture?.isMonoculture 
              ? "bg-error/5 border-error/20 text-error" 
              : "bg-surface-container-low border-outline-variant/10"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-3 rounded-2xl",
              eliteInsights?.monoculture?.isMonoculture ? "bg-error/10" : "bg-primary/10 text-primary"
            )}>
              <AlertCircle size={24} />
            </div>
            <h3 className="font-headline text-xl font-black">Monoculture Alert</h3>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-black uppercase tracking-tight">
              {eliteInsights?.monoculture?.isMonoculture ? "Warning: High Risk" : "Diverse & Healthy"}
            </p>
            <p className="text-xs font-medium opacity-70">
              {eliteInsights?.monoculture?.isMonoculture 
                ? `Too many ${eliteInsights.monoculture.dominantFamily}s in one plot. Risk of pest outbreaks.`
                : "Your plant families are well-distributed. Natural pest resistance is high."}
            </p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface-container-low p-8 rounded-[2.5rem] border border-outline-variant/10 space-y-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-secondary/10 text-secondary rounded-2xl">
              <Activity size={24} />
            </div>
            <h3 className="font-headline text-xl font-black">Nutrient Draw</h3>
          </div>
          <div className="space-y-1">
            <p className={cn(
              "text-3xl font-black uppercase tracking-tight",
              eliteInsights?.nutrientDraw === 'High' ? "text-amber-600" : "text-on-surface"
            )}>
              {eliteInsights?.nutrientDraw || 'Low'}
            </p>
            <p className="text-xs text-on-surface-variant font-medium">
              {eliteInsights?.nutrientDraw === 'High' 
                ? "Heavy feeders detected. Consider adding compost or organic fertilizer soon."
                : "Nutrient consumption is sustainable for the current soil profile."}
            </p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-surface-container-low p-8 rounded-[2.5rem] border border-outline-variant/10 space-y-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-tertiary/10 text-tertiary rounded-2xl">
              <Sprout size={24} />
            </div>
            <h3 className="font-headline text-xl font-black">Succession Prompt</h3>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-black text-on-surface uppercase tracking-tight">
              {eliteInsights?.succession?.recommendedCrop || 'N/A'}
            </p>
            <p className="text-xs text-on-surface-variant font-medium">
              {eliteInsights?.succession?.reason || "No specific succession recommendation at this time."}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Bottom Sections: Documentation, Tips, Checklist */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden"
          >
            {/* Overview & Documentation */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary"><ScrollText size={20} /></div>
              <h4 className="font-headline font-black text-xl tracking-tight">Documentation</h4>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10">
              <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2 block">Plot Notes</label>
              <p className="text-sm text-on-surface-variant font-medium leading-relaxed">
                {plot.description || 'No notes added yet. Click edit to add plot details.'}
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1 block">Soil Type</label>
                <span className="text-sm font-black">{plot.soilType || 'Unspecified'}</span>
              </div>
              <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1 block">Planting Date</label>
                <span className="text-sm font-black">{plot.plantingDate || 'Not set'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Tips & AI Advice */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-secondary/10 rounded-2xl text-secondary"><Sprout size={20} /></div>
              <h4 className="font-headline font-black text-xl tracking-tight">Pro-Tips</h4>
            </div>
            <button 
              onClick={generateQuickTips}
              disabled={loadingTips}
              className="p-2 hover:bg-secondary/10 rounded-xl text-secondary transition-colors disabled:opacity-50"
            >
              <Plus size={20} />
            </button>
          </div>
          
          <div className="bg-secondary/5 p-6 rounded-2xl border border-secondary/10 min-h-[150px] flex flex-col justify-center">
            {loadingTips ? (
              <div className="flex flex-col items-center gap-3 text-secondary">
                <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[10px] font-black uppercase tracking-widest">Consulting Garden AI...</span>
              </div>
            ) : quickTips ? (
              <div className="space-y-3">
                {quickTips.split('\n').filter(t => t.trim()).map((tip, i) => (
                  <div key={i} className="flex gap-3 text-sm font-medium text-on-surface leading-relaxed">
                    <span className="text-secondary font-black">•</span>
                    <span>{tip.replace(/^\d+\.\s*/, '')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center space-y-3">
                <p className="text-sm text-on-surface-variant italic">Need advice? Click the plus to get AI-powered tips for your specific plants.</p>
              </div>
            )}
          </div>
        </div>

        {/* Maintenance Checklist */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary"><ClipboardList size={20} /></div>
              <h4 className="font-headline font-black text-xl tracking-tight">Checklist</h4>
            </div>
            <button 
              onClick={() => setIsAddingTask(true)}
              className="p-2 hover:bg-primary/10 rounded-xl text-primary transition-colors"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
            {tasks.length === 0 ? (
              <p className="text-sm text-on-surface-variant italic text-center py-8">No tasks added yet.</p>
            ) : (
              tasks.map(item => (
                <motion.div 
                  key={item.id} 
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ 
                    opacity: migratingTasks.has(item.id) ? 0.5 : 1, 
                    x: 0,
                    scale: migratingTasks.has(item.id) ? 0.98 : 1
                  }}
                  className={cn(
                    "flex items-center justify-between p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/10 group transition-all",
                    migratingTasks.has(item.id) && "bg-primary/5 border-primary/20"
                  )}
                >
                  <button 
                    onClick={() => toggleChecklistItem(item)}
                    disabled={migratingTasks.has(item.id)}
                    className="flex items-center gap-3 text-left flex-1"
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                      item.completed || migratingTasks.has(item.id) ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" : "border-outline-variant hover:border-primary/50"
                    )}>
                      {migratingTasks.has(item.id) ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : item.completed ? (
                        <Check size={14} />
                      ) : (
                        <CheckCircle2 size={14} className="opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className={cn(
                        "text-sm font-bold transition-all",
                        (item.completed || migratingTasks.has(item.id)) ? "text-on-surface-variant line-through" : "text-on-surface"
                      )}>
                        {item.task}
                      </span>
                      {migratingTasks.has(item.id) && (
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest animate-pulse">Migrating to history...</span>
                      )}
                    </div>
                  </button>
                  <button 
                    onClick={() => deleteChecklistItem(item.id)}
                    disabled={migratingTasks.has(item.id)}
                    className="p-2 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 rounded-lg disabled:hidden"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              ))
            )}
          </div>
          
          {tasks.length > 0 && (
            <div className="pt-4 border-t border-outline-variant/10">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                <span>Active Tasks</span>
                <span>{tasks.length} remaining</span>
              </div>
            </div>
          )}
        </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Maintenance Log */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-sm space-y-6 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-2xl text-primary"><Clock size={20} /></div>
                <h4 className="font-headline font-black text-xl tracking-tight">Maintenance Log</h4>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsWeedWarriorOpen(true)}
                  className="flex items-center gap-2 px-6 py-2 bg-secondary/10 text-secondary rounded-xl font-black text-xs hover:bg-secondary/20 transition-all"
                >
                  <Target size={16} /> Weed Warrior
                </button>
                <button 
                  onClick={() => setIsAddingLog(true)}
                  className="flex items-center gap-2 px-6 py-2 bg-primary/10 text-primary rounded-xl font-black text-xs hover:bg-primary/20 transition-all"
                >
                  <Plus size={16} /> Log Intervention
                </button>
              </div>
            </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(!plot.maintenanceLog || plot.maintenanceLog.length === 0) ? (
            <div className="col-span-full py-12 text-center">
              <p className="text-sm text-on-surface-variant italic">No activity logged yet.</p>
            </div>
          ) : (
            <>
              {[...(plot.maintenanceLog || [])].reverse().map(log => (
                <div key={log.id} className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">{log.action}</span>
                    <span className="text-[10px] font-bold text-on-surface-variant">{new Date(log.date).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm font-medium text-on-surface leading-relaxed">{log.notes}</p>
                </div>
              ))}
            </>
          )}
        </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Plot Modal */}
      <AnimatePresence>
        {isEditingPlot && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black font-headline tracking-tight">Edit Plot</h3>
                  <button onClick={() => setIsEditingPlot(false)} className="p-2 hover:bg-stone-100 rounded-full transition-colors"><X /></button>
                </div>

                {plot && (
                  <PlotEditForm
                    initial={plot}
                    isSaving={isSaving}
                    onSave={handleUpdatePlot}
                    onCancel={() => setIsEditingPlot(false)}
                  />
                )}

                <div className="flex gap-3">
                  <button 
                    onClick={() => { setIsEditingPlot(false); setItemToDelete({ id: plotId, type: 'plot' }); setShowDeleteModal(true); }}
                    className="p-5 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                    title="Delete Plot"
                  >
                    <Trash2 size={24} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setItemToDelete(null);
        }}
        onConfirm={itemToDelete?.type === 'plot' ? handleDeletePlot : deletePlanter}
        message={itemToDelete?.type === 'plot' 
          ? `Are you sure you want to permanently delete "${plot?.name}"? This will unassign all plants and remove all planters. This action cannot be undone.`
          : "Are you sure you want to permanently delete this planter? Plants inside will be moved to the plot."
        }
        itemCount={1}
        isDeleting={isDeletingConfirmed}
      />
      {/* Bed Build Quiz — the one place beds get added */}
      <AnimatePresence>
        {showBedQuiz && plotId && (
          <BedBuildQuiz
            plotId={plotId}
            plotName={plot?.name || 'Plot'}
            plotCols={COLS}
            plotRows={ROWS}
            existingBeds={planters}
            onClose={() => setShowBedQuiz(false)}
            onComplete={() => setShowBedQuiz(false)}
          />
        )}
      </AnimatePresence>

      {/* Planter Editor Modal */}
      <AnimatePresence>
        {editingPlanter && (
          <BedEditModal
            bed={editingPlanter}
            cols={COLS}
            rows={ROWS}
            otherBeds={planters.filter((b) => b.id !== editingPlanter.id)}
            plants={inhabitants}
            onClose={() => setEditingPlanter(null)}
          />
        )}
      </AnimatePresence>

      {/* Add Maintenance Log Modal */}
      <AnimatePresence>
        {isAddingLog && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black font-headline tracking-tight">Log Intervention</h3>
                  <button onClick={() => setIsAddingLog(false)} className="p-2 hover:bg-stone-100 rounded-full transition-colors"><X /></button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Action Type</label>
                    <select 
                      value={newLog.action}
                      onChange={(e) => setNewLog({...newLog, action: e.target.value})}
                      className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 ring-primary/20 appearance-none"
                    >
                      <option value="">Select action...</option>
                      <option>Fertilizing</option>
                      <option>Weeding</option>
                      <option>Pest Control</option>
                      <option>Pruning</option>
                      <option>Harvesting</option>
                      <option>Soil Amendment</option>
                      <option>Other</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Notes</label>
                    <textarea 
                      value={newLog.notes}
                      onChange={(e) => setNewLog({...newLog, notes: e.target.value})}
                      className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 ring-primary/20 min-h-[100px]"
                      placeholder="What exactly did you do?"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => addMaintenanceLog()}
                  disabled={isSaving}
                  className="w-full bg-primary text-white font-black py-5 rounded-2xl hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Check size={20} className="animate-bounce" />
                      Saved!
                    </>
                  ) : (
                    'Save to Log'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Checklist Task Modal */}
      <AnimatePresence>
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
                      placeholder="e.g. Water the tomatoes"
                      autoFocus
                    />
                  </div>
                </div>

                <button 
                  onClick={addChecklistItem}
                  disabled={isSaving}
                  className="w-full bg-primary text-white font-black py-5 rounded-2xl hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Check size={20} className="animate-bounce" />
                      Added!
                    </>
                  ) : (
                    'Add to Checklist'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Weed Warrior Wizard */}
      <WeedWarriorWizard 
        isOpen={isWeedWarriorOpen}
        onClose={() => setIsWeedWarriorOpen(false)}
        onSave={handleWeedingVictory}
        plotId={plotId}
        plotName={plot.name}
      />

      {/* Treatment Conflict Modal */}
      {conflictModalData && (
        <TreatmentConflictModal 
          isOpen={conflictModalData.isOpen}
          onClose={() => setConflictModalData(null)}
          onConfirm={() => addMaintenanceLog(true)}
          conflictMessage={conflictModalData.message}
          actionName={conflictModalData.action}
          conflictingAction={conflictModalData.conflictingAction}
          conflictingDate={conflictModalData.conflictingDate}
        />
      )}
    </div>
  );
}

function DraggablePlantIcon({ inhabitant, compact = false, onTapPlant, selected }: { inhabitant: Inhabitant; compact?: boolean; onTapPlant?: (p: Inhabitant) => void; selected?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: inhabitant.id,
    data: { type: 'plant' }
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  const urgency = inhabitant.pullDate ? calculateUrgencyIndex(inhabitant.pullDate) : null;
  const cohort = getSeasonalCohort(inhabitant);

  const stopProp = (e: React.PointerEvent) => {
    e.stopPropagation();
    listeners?.onPointerDown(e);
  };

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        onPointerDown={stopProp}
        onClick={() => { if (onTapPlant) onTapPlant(inhabitant); }}
        className={cn(
          "shrink-0 snap-start w-20 flex flex-col items-center gap-1.5 cursor-grab active:cursor-grabbing botanical-tooltip",
          isDragging && "opacity-50",
          selected && "ring-4 ring-primary rounded-2xl"
        )}
        data-tooltip={`${inhabitant.name} (${cohort})`}
      >
        <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-primary/30 bg-primary/5 shadow-sm flex items-center justify-center">
          {inhabitant.image ? (
            <PlantImage src={inhabitant.image} alt={inhabitant.name} className="w-full h-full object-cover pointer-events-none" />
          ) : (
            <Leaf size={22} className="text-primary" />
          )}
        </div>
        <span className="text-[10px] font-bold text-center leading-tight line-clamp-2">{inhabitant.name}</span>
      </div>
    );
  }

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes}
      onPointerDown={(e) => {
        e.stopPropagation();
        listeners?.onPointerDown(e);
      }}
      className={cn(
        "bg-white p-3 rounded-2xl border border-outline-variant/20 flex flex-col items-center gap-2 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-primary/50 hover:bg-primary/5 transition-all botanical-tooltip relative overflow-hidden",
        isDragging && "opacity-50"
      )}
      data-tooltip={`${inhabitant.name} (${cohort})`}
    >
      {urgency && (
        <div className={cn("absolute top-0 left-0 w-full h-1", urgency.color.replace('text-', 'bg-'))} />
      )}
      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center overflow-hidden">
        {inhabitant.image ? (
          <PlantImage src={inhabitant.image} className="w-full h-full object-cover" />
        ) : (
          <Leaf size={20} className="text-primary" />
        )}
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] font-black text-center truncate w-full">{inhabitant.name}</span>
        {urgency && (
          <span className={cn("text-[8px] font-bold", urgency.color)}>
            {urgency.daysRemaining < 0 ? 'Overdue' : `${urgency.daysRemaining}d left`}
          </span>
        )}
      </div>
    </div>
  );
}

function SuitabilityOverlay({ activePlant, plot, inhabitants, cell, cols, rows }: { activePlant: Partial<Inhabitant>, plot: SpatialPlot, inhabitants: Inhabitant[], cell: number, cols: number, rows: number }) {
  const cells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const score = calculateSuitabilityScore(x, y, activePlant, plot, inhabitants);
      cells.push({ x, y, score });
    }
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-40">
      {cells.map(c => (
        <div
          key={`${c.x}-${c.y}`}
          className="absolute border border-white/5 transition-colors duration-300"
          style={{
            left: c.x * cell,
            top: c.y * cell,
            width: cell,
            height: cell,
            backgroundColor: c.score > 70 ? 'rgba(34, 197, 94, 0.3)' : c.score > 40 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          }}
        >
          {c.score > 80 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full animate-ping" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// A plant living inside a bed: draggable to another bed (or another spot
// in the same bed), tap for its health drawer. stopPropagation keeps the
// bed itself from starting a drag when you grab a plant.
function BedPlantDot({ inhabitant, cell, onSelect }: { inhabitant: Inhabitant; cell: number; onSelect?: (inhabitant: Inhabitant) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: inhabitant.id,
    data: { type: 'plant' }
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        e.stopPropagation();
        listeners?.onPointerDown?.(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect(inhabitant); // handleSelectPlant ignores post-drag taps itself
      }}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      className={cn(
        "w-full aspect-square bg-white rounded-full border border-primary/30 flex items-center justify-center overflow-hidden shadow-sm cursor-grab active:cursor-grabbing botanical-tooltip",
        isDragging && "opacity-40"
      )}
      data-tooltip={inhabitant.name}
    >
      {inhabitant.image ? (
        <PlantImage src={inhabitant.image} className="w-full h-full object-cover pointer-events-none" />
      ) : (
        <Leaf size={Math.max(6, cell / 3)} className="text-primary" />
      )}
    </div>
  );
}

function PlanterItem({ planter, cell, onEdit, onTap, selected, inhabitants, activeLayer, onSelectPlant, placing, onPlaceCell }: { planter: Planter, cell: number, onEdit: () => void, onTap: () => void, selected: boolean, inhabitants: Inhabitant[], activeLayer: string, onSelectPlant?: (inhabitant: Inhabitant) => void, placing?: boolean, onPlaceCell?: (planter: Planter, pos: { x: number; y: number }) => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: planter.id,
    data: { type: 'planter' }
  });

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: planter.id,
    data: { type: 'planter' }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    position: 'absolute' as const,
    left: planter.gridPosition.x * cell,
    top: planter.gridPosition.y * cell,
    width: planter.size.w * cell,
    height: planter.size.h * cell,
    zIndex: selected ? 15 : 10,
    opacity: isDragging ? 0.3 : 1,
  };

  const getLayerColor = () => {
    if (activeLayer === 'irrigation') return '#3b82f640'; // Blue for water
    if (activeLayer === 'family') return '#f59e0b40'; // Amber for family
    return planter.color + '40';
  };

  return (
    <div 
      ref={(node) => {
        setNodeRef(node);
        setDragRef(node);
      }}
      style={style} 
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      className={cn(
        "group rounded-lg border-2 transition-all relative shadow-sm",
        selected ? "border-primary ring-4 ring-primary/30" :
        isOver ? "border-primary ring-4 ring-primary/20 scale-[1.02]" : "border-stone-400",
        "cursor-grab active:cursor-grabbing"
      )}
    >
      <div 
        className="w-full h-full relative overflow-hidden rounded-md p-1" 
        style={{ backgroundColor: getLayerColor() }}
        {...attributes}
        {...listeners}
      >
        <div className="absolute inset-0 border-2 border-dashed border-stone-500/20"></div>
        <div className="absolute top-1 left-1 bg-stone-800/80 text-white text-[8px] px-1 rounded font-bold uppercase tracking-tighter z-20">
          {planter.name}
          {activeLayer === 'irrigation' && ' • Zone A'}
        </div>
        
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="absolute top-1 right-1 p-1 bg-white/80 rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-20"
        >
          <Settings2 size={10} />
        </button>

        {/* Tap-to-place overlay: every cell becomes a big tappable target */}
        {placing && onPlaceCell && (
          <div className="absolute inset-0 z-30 grid" style={{ gridTemplateColumns: `repeat(${planter.size.w}, 1fr)`, gridTemplateRows: `repeat(${planter.size.h}, 1fr)` }}>
            {Array.from({ length: planter.size.w * planter.size.h }).map((_, i) => {
              const cx = i % planter.size.w;
              const cy = Math.floor(i / planter.size.w);
              return (
                <button
                  key={i}
                  aria-label={`Plant here (cell ${cx + 1}, ${cy + 1})`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlaceCell(planter, { x: planter.gridPosition.x + cx, y: planter.gridPosition.y + cy });
                  }}
                  className="border border-primary/30 bg-primary/10 hover:bg-primary/30 active:bg-primary/50 transition-colors touch-target"
                />
              );
            })}
          </div>
        )}

        {/* Inhabitants inside planter — positioned by their grid cell relative
            to the bed, so a drop lands exactly where the pointer was. */}
        <div className="absolute inset-0 pointer-events-none">
          {inhabitants.filter(i => i.gridPosition).map(inhabitant => {
            const rx = (inhabitant.gridPosition.x - planter.gridPosition.x) * cell;
            const ry = (inhabitant.gridPosition.y - planter.gridPosition.y) * cell;
            return (
              <div
                key={inhabitant.id}
                className="absolute pointer-events-auto p-[1px]"
                style={{ left: rx, top: ry, width: cell, height: cell }}
              >
                <BedPlantDot inhabitant={inhabitant} cell={cell} onSelect={onSelectPlant} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DraggableItem({ id, type, position, size, cell, image, name, activeLayer, inhabitant, hasConflict, onSelect }: { id: string, type: string, position: { x: number, y: number }, size: { w: number, h: number }, cell: number, image?: string, name: string, activeLayer: string, inhabitant?: Inhabitant, hasConflict?: boolean, onSelect?: (inhabitant: Inhabitant) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: id,
    data: { type: type }
  });

  const style = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    position: 'absolute' as const,
    left: position.x * cell,
    top: position.y * cell,
    width: size.w * cell,
    height: size.h * cell,
    zIndex: 30,
    opacity: isDragging ? 0.3 : 1,
  };

  const getHighlightColor = () => {
    if (activeLayer === 'family' && inhabitant?.family) {
      const families: Record<string, string> = {
        'Solanaceae': 'ring-red-500',
        'Brassicaceae': 'ring-green-500',
        'Cucurbitaceae': 'ring-yellow-500',
        'Lamiaceae': 'ring-purple-500'
      };
      return families[inhabitant.family] || 'ring-primary';
    }
    return 'ring-primary/20';
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes}
      onPointerDown={(e) => {
        e.stopPropagation();
        listeners?.onPointerDown(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (inhabitant && onSelect) onSelect(inhabitant);
      }}
      className={cn(
        "rounded-full border-2 border-primary bg-white shadow-lg flex items-center justify-center overflow-hidden cursor-move active:cursor-grabbing hover:scale-110 hover:ring-4 transition-transform group botanical-tooltip",
        getHighlightColor(),
        isDragging && "z-50"
      )}
      data-tooltip={name}
    >
      {image ? (
        <PlantImage src={image} className="w-full h-full object-cover" />
      ) : (
        <Leaf size={Math.max(10, cell * 0.66)} className="text-primary" />
      )}
      {hasConflict && (
        <div className="absolute -top-1 -right-1 bg-amber-400 rounded-full p-0.5 shadow-md border border-white" title="Companion conflict — check alerts">
          <AlertTriangle size={Math.max(8, cell * 0.4)} className="text-amber-900" />
        </div>
      )}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-[8px] px-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
        {name}
        {activeLayer === 'family' && inhabitant?.family && ` (${inhabitant.family})`}
      </div>
    </div>
  );
}
