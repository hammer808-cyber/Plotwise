import React from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../contexts/FirebaseContext';
import { useActivePlot } from '../contexts/ActivePlotContext';
import { db, collection, query, where, getDocs } from '../firebase';
import { format, parseISO, isAfter, startOfDay, addDays, isBefore } from 'date-fns';
import {
  Fence, Sprout, ClipboardList, CalendarDays, ArrowRight,
  TriangleAlert, MessageSquare, DollarSign, HeartPulse, BookOpen
} from 'lucide-react';

interface DashboardData {
  plots: any[];
  unassignedPlants: any[];
  openTasks: any[];
  upcomingEvents: any[];
  plantCount: number;
}

export default function GardenHub() {
  const { user, loading } = useFirebase();
  const { setActivePlotId } = useActivePlot();
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [dataLoading, setDataLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) { setDataLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const uid = user.uid;
        const [plotsSnap, sharedSnap, inhabitantsSnap, tasksSnap, eventsSnap] = await Promise.all([
          getDocs(query(collection(db, 'spatial_plots'), where('ownerUid', '==', uid))),
          getDocs(query(collection(db, 'spatial_plots'), where('collaboratorUids', 'array-contains', uid))),
          getDocs(query(collection(db, 'inhabitants'), where('ownerUid', '==', uid))),
          getDocs(query(collection(db, 'tasks'), where('ownerUid', '==', uid), where('completed', '==', false))),
          getDocs(query(collection(db, 'calendar_events'), where('ownerUid', '==', uid))),
        ]);
        if (cancelled) return;
        const seen = new Set(plotsSnap.docs.map((d) => d.id));
        const plots = [
          ...plotsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          ...sharedSnap.docs.filter((d) => !seen.has(d.id)).map(d => ({ id: d.id, ...d.data() })),
        ];
        const inhabitants = inhabitantsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const today = startOfDay(new Date());
        const weekOut = addDays(today, 7);
        const upcomingEvents = eventsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((e: any) => {
            if (!e.date) return false;
            try {
              const dt = startOfDay(parseISO(e.date));
              return (isAfter(dt, today) || +dt === +today) && isBefore(dt, weekOut);
            } catch { return false; }
          })
          .sort((a: any, b: any) => (a.date < b.date ? -1 : 1))
          .slice(0, 5);
        setData({
          plots,
          unassignedPlants: inhabitants.filter((p: any) => !p.plotId).slice(0, 5),
          openTasks: tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 5),
          upcomingEvents,
          plantCount: inhabitants.length,
        });
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (loading || dataLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const todayLabel = format(new Date(), 'EEEE, MMMM d');
  const attentionCount = (data?.unassignedPlants.length ?? 0) + (data?.openTasks.length ?? 0);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8 pb-16">
      {/* Header */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1">Home</p>
        <h1 className="font-headline text-5xl font-black tracking-tighter italic text-primary">Today</h1>
        <p className="text-on-surface-variant font-medium mt-1">{todayLabel}</p>
      </div>

      {!user ? (
        <p className="text-on-surface-variant font-medium">Sign in to see your garden.</p>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard icon={Fence} value={data?.plots.length ?? 0} label="Plots" to="/plots" />
            <StatCard icon={Sprout} value={data?.plantCount ?? 0} label="Plants" to="/plants" />
            <StatCard icon={ClipboardList} value={data?.openTasks.length ?? 0} label="Open tasks" to="/care" />
          </div>

          {/* Needs attention */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TriangleAlert size={18} className="text-amber-600" />
              <h2 className="font-headline text-xl font-black text-primary">Needs attention</h2>
              {attentionCount > 0 && (
                <span className="text-xs font-black bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">{attentionCount}</span>
              )}
            </div>
            {attentionCount === 0 && (data?.upcomingEvents.length ?? 0) === 0 ? (
              <p className="text-on-surface-variant text-sm font-medium bg-white rounded-2xl p-5 shadow-sm">
                All clear. Nothing waiting on you right now.
              </p>
            ) : (
              <div className="space-y-2">
                {data?.unassignedPlants.map(p => (
                  <Link
                    key={p.id}
                    to="/plants"
                    className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <Sprout size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-on-surface truncate">{p.name}</p>
                      <p className="text-xs text-on-surface-variant">Waiting to be placed in a plot</p>
                    </div>
                    <ArrowRight size={16} className="text-on-surface-variant shrink-0" />
                  </Link>
                ))}
                {data?.openTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                      <ClipboardList size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-on-surface truncate">{t.task || t.title || 'Task'}</p>
                      <p className="text-xs text-on-surface-variant">{t.category || 'Maintenance'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Coming up */}
          {data && data.upcomingEvents.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays size={18} className="text-primary" />
                <h2 className="font-headline text-xl font-black text-primary">Coming up</h2>
              </div>
              <div className="space-y-2">
                {data.upcomingEvents.map(e => (
                  <Link
                    key={e.id}
                    to="/care"
                    className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="shrink-0 w-12 text-center">
                      <p className="text-[10px] font-black uppercase text-on-surface-variant">{format(parseISO(e.date), 'MMM')}</p>
                      <p className="text-xl font-black text-primary leading-none">{format(parseISO(e.date), 'd')}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-on-surface truncate">{e.title || 'Event'}</p>
                      {e.notes && <p className="text-xs text-on-surface-variant truncate">{e.notes}</p>}
                    </div>
                    <ArrowRight size={16} className="text-on-surface-variant shrink-0" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Your plots */}
          {data && data.plots.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-headline text-xl font-black text-primary">Your plots</h2>
                <Link to="/plots" className="text-xs font-bold text-primary flex items-center gap-1">
                  View all <ArrowRight size={14} />
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.plots.slice(0, 4).map(plot => (
                  <Link
                    key={plot.id}
                    to={`/plots/${plot.id}`}
                    onClick={() => setActivePlotId(plot.id)}
                    className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
                        <Fence size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-on-surface truncate">{plot.name}</p>
                        <p className="text-xs text-on-surface-variant">
                          {[plot.lengthFt && plot.widthFt ? `${plot.lengthFt} × ${plot.widthFt} ft` : null, plot.sunExposure].filter(Boolean).join(' • ') || 'Garden plot'}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Shortcuts */}
          <section>
            <h2 className="font-headline text-xl font-black text-primary mb-3">Shortcuts</h2>
            <div className="grid grid-cols-2 gap-3">
              <ShortcutCard icon={BookOpen} label="Plant library" desc="Look up varieties" to="/plants" />
              <ShortcutCard icon={HeartPulse} label="Log care" desc="Treatments & weeding" to="/care" />
              <ShortcutCard icon={DollarSign} label="Financials" desc="Costs & harvest value" to="/financials" />
              <ShortcutCard icon={MessageSquare} label="Ask Plotwise" desc="Garden advice" to="/chat" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, value, label, to }: { icon: any; value: number; label: string; to: string }) {
  return (
    <Link to={to} className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow text-center">
      <Icon size={20} className="mx-auto mb-1 text-primary" />
      <p className="text-2xl font-black text-on-surface leading-none">{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mt-1">{label}</p>
    </Link>
  );
}

function ShortcutCard({ icon: Icon, label, desc, to }: { icon: any; label: string; desc: string; to: string }) {
  return (
    <Link to={to} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="font-bold text-sm text-on-surface">{label}</p>
        <p className="text-xs text-on-surface-variant truncate">{desc}</p>
      </div>
    </Link>
  );
}
