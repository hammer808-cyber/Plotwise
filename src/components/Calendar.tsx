import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Tag, 
  AlertCircle, 
  CheckCircle2, 
  Trash2, 
  Edit2, 
  Filter,
  Search,
  X,
  MoreVertical,
  Droplets
} from 'lucide-react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { useFirebase } from '../contexts/FirebaseContext';
import { useActivePlot } from '../contexts/ActivePlotContext';
import { db, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, handleFirestoreError, OperationType, orderBy, getDocs, writeBatch } from '../firebase';
import { cn } from '@/src/lib/utils';
import { buildWateringSchedule } from '../lib/wateringSchedule';
import { toast } from 'sonner';
import { format, isSameDay, parseISO } from 'date-fns';

type EventType = 'Manual' | 'Watering' | 'Fertilizing' | 'Pruning' | 'Harvesting' | 'Pest Control' | 'Soil Amendment' | 'Propagation' | 'Task' | 'Treatment';
type Priority = 'Low' | 'Medium' | 'High';
type Recurrence = 'None' | 'Daily' | 'Weekly' | 'Bi-weekly';

interface GardenEvent {
  id: string;
  ownerUid: string;
  plotId?: string | null;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  type: EventType;
  priority?: Priority;
  recurrence?: Recurrence;
  createdAt: any;
}

export default function GardenCalendar() {
  const { user } = useFirebase();
  const { activePlotId, activePlot } = useActivePlot();
  const [date, setDate] = useState<any>(new Date());
  const [events, setEvents] = useState<GardenEvent[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<GardenEvent | null>(null);
  const [filterType, setFilterType] = useState<EventType | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'priority' | 'type'>('date');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'Manual' as EventType,
    priority: 'Medium' as Priority,
    recurrence: 'None' as Recurrence
  });

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'calendar_events'),
      where('ownerUid', '==', user.uid),
      orderBy('date', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedEvents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as GardenEvent[];
      setEvents(fetchedEvents);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'calendar_events');
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingEvent) {
        await updateDoc(doc(db, 'calendar_events', editingEvent.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        toast.success('Event updated');
      } else {
        // Handle recurrence if needed (for now we just save the pattern)
        // In a real app, we might generate multiple events or handle it in the UI
        await addDoc(collection(db, 'calendar_events'), {
          ...formData,
          ownerUid: user.uid,
          plotId: activePlotId || null,
          createdAt: serverTimestamp()
        });
        toast.success('Event added to calendar');
      }
      setIsAddModalOpen(false);
      setEditingEvent(null);
      setFormData({
        title: '',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        type: 'Manual',
        priority: 'Medium',
        recurrence: 'None'
      });
    } catch (error) {
      handleFirestoreError(error, editingEvent ? OperationType.UPDATE : OperationType.CREATE, 'calendar_events');
    }
  };

  const generateWateringSchedule = async () => {
    if (!user) return;
    const toastId = toast.loading('Generating consolidated watering schedule...');
    
    try {
      // Live plants are inhabitants. The legacy `plants` collection is empty
      // for current gardens, so reading it rebuilt nothing — after the old
      // code had already deleted every "Watering Day" event.
      const q = query(collection(db, 'inhabitants'), where('ownerUid', '==', user.uid));
      const snapshot = await getDocs(q);
      const days = buildWateringSchedule(snapshot.docs.map((d) => d.data()));

      // Nothing scheduled in the live garden: leave existing Watering Day
      // events alone. The previous sync deleted them first, then wrote
      // nothing when the legacy collection was empty.
      if (days.length === 0) {
        toast.success('No watering dates to sync yet.', { id: toastId });
        return;
      }

      const existingQ = query(
        collection(db, 'calendar_events'),
        where('ownerUid', '==', user.uid),
        where('title', '==', 'Watering Day')
      );
      const existingSnapshot = await getDocs(existingQ);

      // One batch: write the replacement schedule and drop the previous
      // generated events together. A rules rejection rolls the whole sync
      // back and leaves the existing events in place.
      const batch = writeBatch(db);
      for (const day of days) {
        const ref = doc(collection(db, 'calendar_events'));
        batch.set(ref, {
          ownerUid: user.uid,
          title: 'Watering Day',
          description: day.description,
          date: day.date,
          type: 'Watering',
          priority: 'High',
          recurrence: 'None',
          createdAt: serverTimestamp(),
        });
      }
      for (const d of existingSnapshot.docs) {
        batch.delete(d.ref);
      }
      await batch.commit();

      toast.success(`Generated ${days.length} consolidated watering events!`, { id: toastId });
    } catch (error) {
      console.error('Schedule generation error:', error);
      toast.error('Failed to generate schedule', { id: toastId });
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    try {
      await deleteDoc(doc(db, 'calendar_events', id));
      toast.success('Event deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'calendar_events');
    }
  };

  const openEditModal = (event: GardenEvent) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description || '',
      date: event.date,
      type: event.type,
      priority: event.priority || 'Medium',
      recurrence: event.recurrence || 'None'
    });
    setIsAddModalOpen(true);
  };

  // Plot scope applied everywhere on this page (list, day view, tile dots).
  const plotScopedEvents = events.filter(event => !event.plotId || !activePlotId || event.plotId === activePlotId);

  const filteredEvents = plotScopedEvents
    .filter(event => {
      const matchesType = filterType === 'All' || event.type === filterType;
      const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           event.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'date') return a.date.localeCompare(b.date);
      if (sortBy === 'priority') {
        const pMap = { High: 3, Medium: 2, Low: 1 };
        return (pMap[b.priority || 'Low'] || 0) - (pMap[a.priority || 'Low'] || 0);
      }
      return a.type.localeCompare(b.type);
    });

  const selectedDateEvents = plotScopedEvents.filter(event => isSameDay(parseISO(event.date), date));

  const tileContent = ({ date: tileDate, view }: { date: Date, view: string }) => {
    if (view === 'month') {
      const dayEvents = plotScopedEvents.filter(event => isSameDay(parseISO(event.date), tileDate));
      if (dayEvents.length > 0) {
        return (
          <div className="flex justify-center gap-0.5 mt-1">
            {dayEvents.slice(0, 3).map((event, i) => (
              <div 
                key={i} 
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  event.type === 'Watering' ? "bg-blue-500" :
                  event.type === 'Fertilizing' ? "bg-emerald-500" :
                  event.type === 'Treatment' ? "bg-rose-500" :
                  event.type === 'Task' ? "bg-amber-500" : "bg-primary"
                )}
              />
            ))}
            {dayEvents.length > 3 && <div className="w-1 h-1 rounded-full bg-gray-400" />}
          </div>
        );
      }
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-surface-container-lowest pb-20">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 text-primary rounded-xl">
                <CalendarIcon size={24} />
              </div>
              <span className="text-primary font-bold uppercase tracking-widest text-xs font-label">Garden Timeline</span>
            </div>
            <h1 className="text-5xl font-black text-on-surface font-headline tracking-tight">Calendar</h1>
            <p className="text-on-surface-variant max-w-md font-medium">
              Track your garden's history and plan future maintenance tasks.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button 
              onClick={generateWateringSchedule}
              className="flex items-center gap-3 bg-secondary text-white px-8 py-4 rounded-3xl font-bold shadow-xl shadow-secondary/20 hover:scale-105 active:scale-95 transition-all"
            >
              <Droplets size={20} />
              <span>Sync Watering</span>
            </button>
            <button 
              onClick={() => {
              setEditingEvent(null);
              setFormData({
                title: '',
                description: '',
                date: format(date, 'yyyy-MM-dd'),
                type: 'Manual',
                priority: 'Medium',
                recurrence: 'None'
              });
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-3 bg-primary text-white px-8 py-4 rounded-3xl font-bold shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus size={20} />
            <span>Add Event</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Calendar View */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-[3rem] p-8 border border-outline-variant/10 shadow-sm overflow-hidden">
              <Calendar 
                onChange={setDate} 
                value={date}
                tileContent={tileContent}
                className="w-full border-none font-body"
              />
            </div>

            {/* Selected Day Events */}
            <div className="bg-surface-container-low rounded-[3rem] p-8 border border-outline-variant/10 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-on-surface font-headline">
                  {format(date, 'MMMM do, yyyy')}
                </h2>
                <span className="text-xs font-black text-primary uppercase tracking-widest">
                  {selectedDateEvents.length} Events
                </span>
              </div>

              <div className="space-y-4">
                {selectedDateEvents.length > 0 ? (
                  selectedDateEvents.map((event) => (
                    <div 
                      key={event.id}
                      className="flex items-start gap-4 p-5 bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm group"
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                        event.type === 'Watering' ? "bg-blue-100 text-blue-600" :
                        event.type === 'Fertilizing' ? "bg-emerald-100 text-emerald-600" :
                        event.type === 'Treatment' ? "bg-rose-100 text-rose-600" :
                        event.type === 'Task' ? "bg-amber-100 text-amber-600" : "bg-primary/10 text-primary"
                      )}>
                        {event.type === 'Watering' ? <Droplets size={20} /> : <Clock size={20} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                            event.priority === 'High' ? "bg-rose-100 text-rose-600" :
                            event.priority === 'Medium' ? "bg-amber-100 text-amber-600" :
                            "bg-emerald-100 text-emerald-600"
                          )}>
                            {event.priority} Priority
                          </span>
                          <span className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest opacity-40">
                            {event.type}
                          </span>
                        </div>
                        <h3 className="font-bold text-on-surface">{event.title}</h3>
                        {event.description && (
                          <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{event.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => openEditModal(event)}
                          className="p-2 hover:bg-primary/10 text-primary rounded-full transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteEvent(event.id)}
                          className="p-2 hover:bg-rose-100 text-rose-600 rounded-full transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center space-y-4 opacity-40">
                    <CalendarIcon size={48} className="mx-auto" />
                    <p className="text-sm font-black uppercase tracking-widest">No events for this day</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: List & Filters */}
          <div className="lg:col-span-5 space-y-6">
            {/* Search & Filters */}
            <div className="bg-white rounded-[3rem] p-8 border border-outline-variant/10 shadow-sm space-y-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-40" size={18} />
                <input 
                  type="text"
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-surface-container-low rounded-2xl border-none focus:ring-2 focus:ring-primary/20 font-medium text-sm"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <Filter size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Filter by Type</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['All', 'Manual', 'Weeding', 'Fertilizing', 'Task', 'Treatment'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type as any)}
                      className={cn(
                        "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                        filterType === type 
                          ? "bg-primary text-white shadow-lg shadow-primary/20" 
                          : "bg-surface-container-low text-on-surface-variant hover:bg-primary/5 hover:text-primary"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <MoreVertical size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Sort by</span>
                </div>
                <div className="flex gap-2">
                  {['date', 'priority', 'type'].map((sort) => (
                    <button
                      key={sort}
                      onClick={() => setSortBy(sort as any)}
                      className={cn(
                        "flex-1 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                        sortBy === sort 
                          ? "bg-secondary text-white shadow-lg shadow-secondary/20" 
                          : "bg-surface-container-low text-on-surface-variant hover:bg-secondary/5 hover:text-secondary"
                      )}
                    >
                      {sort}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Upcoming Events List */}
            <div className="bg-white rounded-[3rem] p-8 border border-outline-variant/10 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-on-surface font-headline tracking-tight">Upcoming</h2>
                <span className="text-[10px] font-black text-primary uppercase tracking-widest">Next 30 Days</span>
              </div>

              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {filteredEvents.length > 0 ? (
                  filteredEvents.map((event) => (
                    <div 
                      key={event.id}
                      onClick={() => setDate(parseISO(event.date))}
                      className={cn(
                        "p-4 rounded-2xl border transition-all cursor-pointer group",
                        isSameDay(parseISO(event.date), date) 
                          ? "bg-primary/5 border-primary/20 shadow-md" 
                          : "bg-surface-container-lowest border-outline-variant/5 hover:border-primary/20"
                      )}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                          {format(parseISO(event.date), 'MMM d')}
                        </span>
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          event.priority === 'High' ? "bg-rose-500" :
                          event.priority === 'Medium' ? "bg-amber-500" :
                          "bg-emerald-500"
                        )} />
                      </div>
                      <h4 className="font-bold text-sm text-on-surface leading-tight">{event.title}</h4>
                      <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-widest mt-1">
                        {event.type}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center opacity-40">
                    <p className="text-[10px] font-black uppercase tracking-widest">No upcoming events</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Event Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
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
              className="relative w-full max-w-lg bg-white rounded-[3rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-on-surface font-headline tracking-tight">
                    {editingEvent ? 'Edit Event' : 'Add New Event'}
                  </h2>
                  <p className="text-xs text-on-surface-variant font-medium">Plan your garden activities</p>
                </div>
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 hover:bg-primary/5 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleAddEvent} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-4">Event Title</label>
                    <input 
                      required
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g., Prune Roses"
                      className="w-full px-6 py-4 bg-surface-container-low rounded-2xl border-none focus:ring-2 focus:ring-primary/20 font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-4">Date</label>
                      <input 
                        required
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                        className="w-full px-6 py-4 bg-surface-container-low rounded-2xl border-none focus:ring-2 focus:ring-primary/20 font-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-4">Type</label>
                      <select 
                        value={formData.type}
                        onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as EventType }))}
                        className="w-full px-6 py-4 bg-surface-container-low rounded-2xl border-none focus:ring-2 focus:ring-primary/20 font-medium appearance-none"
                      >
                        <option value="Manual">Manual</option>
                        <option value="Watering">Watering</option>
                        <option value="Fertilizing">Fertilizing</option>
                        <option value="Pruning">Pruning</option>
                        <option value="Harvesting">Harvesting</option>
                        <option value="Pest Control">Pest Control</option>
                        <option value="Soil Amendment">Soil Amendment</option>
                        <option value="Propagation">Propagation</option>
                        <option value="Task">Task</option>
                        <option value="Treatment">Treatment</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-4">Recurrence</label>
                    <div className="grid grid-cols-4 gap-2">
                      {(['None', 'Daily', 'Weekly', 'Bi-weekly'] as Recurrence[]).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, recurrence: r }))}
                          className={cn(
                            "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2",
                            formData.recurrence === r 
                              ? "bg-primary/10 border-primary text-primary"
                              : "bg-surface-container-low border-transparent text-on-surface-variant"
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-4">Priority</label>
                    <div className="flex gap-2">
                      {(['Low', 'Medium', 'High'] as Priority[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, priority: p }))}
                          className={cn(
                            "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2",
                            formData.priority === p 
                              ? p === 'High' ? "bg-rose-50 border-rose-500 text-rose-600" :
                                p === 'Medium' ? "bg-amber-50 border-amber-500 text-amber-600" :
                                "bg-emerald-50 border-emerald-500 text-emerald-600"
                              : "bg-surface-container-low border-transparent text-on-surface-variant"
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-4">Description (Optional)</label>
                    <textarea 
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Add more details..."
                      rows={3}
                      className="w-full px-6 py-4 bg-surface-container-low rounded-2xl border-none focus:ring-2 focus:ring-primary/20 font-medium resize-none"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full py-5 bg-primary text-white rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  {editingEvent ? 'Update Event' : 'Create Event'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
