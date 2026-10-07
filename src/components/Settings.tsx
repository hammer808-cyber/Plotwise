import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  User, 
  Settings as SettingsIcon, 
  Database, 
  Trash2, 
  Download, 
  Moon, 
  Sun, 
  Bell, 
  Shield, 
  Smartphone,
  LogOut,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Accessibility,
  Type,
  Eye,
  Zap,
  AlignLeft
} from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import Rules from './Rules';

export default function Settings() {
  const { user, logout, isAnonymous, signInWithGoogle } = useFirebase();
  const { 
    theme, setTheme, 
    font, setFont, 
    lineSpacing, setLineSpacing, 
    reducedMotion, setReducedMotion 
  } = useAccessibility();
  
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const isDarkMode = theme === 'dark';
  const isHighContrast = theme === 'high-contrast';
  const isDyslexic = font === 'dyslexic';
  const isIncreasedSpacing = lineSpacing === 'increased';

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const q = query(collection(db, 'plants'), where('ownerUid', '==', user?.uid));
      const snapshot = await getDocs(q);
      const plants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      const csvContent = "data:text/csv;charset=utf-8," 
        + "Name,Scientific,Type,Status,Vigor\n"
        + plants.map(p => `${p.name},${p.scientific},${p.type},${p.status},${p.vigor}`).join("\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "garden_inventory_export.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("Data exported successfully!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export data.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearWeedingLogs = async () => {
    if (!window.confirm("Are you sure you want to delete ALL weeding logs? This cannot be undone.")) return;
    
    try {
      const q = query(collection(db, 'weeding_events'), where('ownerUid', '==', user?.uid));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'weeding_events', d.id)));
      await Promise.all(deletePromises);
      toast.success("All weeding logs cleared.");
    } catch (error) {
      toast.error("Failed to clear logs.");
    }
  };

  const handleResetLayout = async () => {
    if (!window.confirm("Are you sure you want to reset your garden layout? All plants will be moved to the default position.")) return;
    
    try {
      const q = query(collection(db, 'plants'), where('ownerUid', '==', user?.uid));
      const snapshot = await getDocs(q);
      const updatePromises = snapshot.docs.map(d => updateDoc(doc(db, 'plants', d.id), {
        mapPosition: { x: 50, y: 50 },
        gridPosition: { x: 15, y: 10 }
      }));
      await Promise.all(updatePromises);
      toast.success("Garden layout reset to default.");
    } catch (error) {
      toast.error("Failed to reset layout.");
    }
  };

  const handleClearAllPlants = async () => {
    if (!window.confirm("CRITICAL: Are you sure you want to delete ALL plants in your garden? This action is permanent.")) return;
    
    try {
      const q = query(collection(db, 'plants'), where('ownerUid', '==', user?.uid));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'plants', d.id)));
      await Promise.all(deletePromises);
      toast.success("All plants have been removed from your garden.");
    } catch (error) {
      toast.error("Failed to clear plants.");
    }
  };

  const sections = [
    {
      title: "Profile",
      icon: User,
      items: [
        { label: "Display Name", value: user?.displayName || "Botanist", type: "text" },
        { label: "Email Address", value: user?.email, type: "text", disabled: true },
        { label: "Garden Zone", value: "Zone 10b (SoCal)", type: "select" },
      ]
    },
    {
      title: "App Controls",
      icon: Database,
      items: [
        { 
          label: "Export Inventory", 
          description: "Download all plant data as CSV", 
          action: handleExportData, 
          icon: Download,
          loading: isExporting
        },
        { 
          label: "Clear Weeding Logs", 
          description: "Permanently delete all weeding history", 
          action: handleClearWeedingLogs, 
          icon: Trash2,
          variant: "destructive"
        },
        { 
          label: "Reset Layout", 
          description: "Move all plants to default positions", 
          action: handleResetLayout, 
          icon: RefreshCw 
        },
        { 
          label: "Clear All Plants", 
          description: "Permanently delete all plants from inventory", 
          action: handleClearAllPlants, 
          icon: AlertTriangle,
          variant: "destructive"
        },
      ]
    },
    {
      title: "Preferences",
      icon: SettingsIcon,
      items: [
        { 
          label: "Push Notifications", 
          description: "Get alerts for watering and weeding", 
          toggle: isNotificationsEnabled, 
          onToggle: () => setIsNotificationsEnabled(!isNotificationsEnabled),
          icon: Bell 
        },
      ]
    },
    {
      title: "Accessibility",
      icon: Accessibility,
      items: [
        { 
          label: "Dark Mode", 
          description: "Toggle application theme", 
          toggle: isDarkMode, 
          onToggle: () => setTheme(isDarkMode ? 'light' : 'dark'),
          icon: Moon 
        },
        { 
          label: "High Contrast", 
          description: "Maximize visibility for low vision", 
          toggle: isHighContrast, 
          onToggle: () => setTheme(isHighContrast ? 'light' : 'high-contrast'),
          icon: Eye 
        },
        { 
          label: "Dyslexic-Friendly Font", 
          description: "Use Atkinson Hyperlegible for better readability", 
          toggle: isDyslexic, 
          onToggle: () => setFont(isDyslexic ? 'standard' : 'dyslexic'),
          icon: Type 
        },
        { 
          label: "Increased Line Spacing", 
          description: "More space between lines for easier reading", 
          toggle: isIncreasedSpacing, 
          onToggle: () => setLineSpacing(isIncreasedSpacing ? 'standard' : 'increased'),
          icon: AlignLeft 
        },
        { 
          label: "Reduced Motion", 
          description: "Minimize animations and transitions", 
          toggle: reducedMotion, 
          onToggle: () => setReducedMotion(!reducedMotion),
          icon: Zap 
        },
      ]
    }
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-12">
        <h1 className="text-5xl font-black font-headline tracking-tighter italic text-primary mb-2">Settings</h1>
        <p className="text-on-surface-variant font-medium">Manage your garden profile and application preferences.</p>
      </header>

      <div className="space-y-12">
        {/* User Profile Card */}
        <section className="bg-surface-container-low rounded-[2.5rem] p-8 border border-outline-variant/10 shadow-sm">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-primary-fixed shadow-xl">
              <img 
                src={user?.photoURL || "https://picsum.photos/seed/gardener/200/200"} 
                alt="Profile" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h2 className="text-2xl font-black font-headline">{user?.displayName || "Botanist"}</h2>
              <p className="text-on-surface-variant font-medium">{user?.email}</p>
              <div className="flex gap-2 mt-3">
                <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">Pro Member</span>
                <span className="px-3 py-1 bg-secondary/10 text-secondary text-[10px] font-black uppercase tracking-widest rounded-full">SoCal Region</span>
              </div>
            </div>
          </div>
        </section>

        {/* Account */}
        <section className="bg-surface-container-low rounded-[2.5rem] p-8 border border-outline-variant/10 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <User className="text-primary" size={20} />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-outline">Account</h3>
          </div>
          {isAnonymous ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-on-surface-variant leading-relaxed">
                You're gardening as a <span className="font-black text-on-surface">guest</span> — your garden
                lives in this browser only. Back it up with Google to keep it across devices and share plots.
              </p>
              <button
                onClick={signInWithGoogle}
                className="w-full py-4 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all touch-target"
              >
                Back up with Google
              </button>
            </div>
          ) : (
            <p className="text-sm font-medium text-on-surface-variant leading-relaxed">
              Signed in with Google as <span className="font-black text-on-surface">{user?.email || user?.displayName || 'you'}</span>.
              Your garden syncs across devices and you can share plots.
            </p>
          )}
        </section>

        {/* Settings Sections */}
        {sections.map((section, idx) => (
          <section key={idx} className="space-y-6">
            <div className="flex items-center gap-3 px-4">
              <section.icon className="text-primary" size={20} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-outline">{section.title}</h3>
            </div>

            <div className="bg-white rounded-[2.5rem] overflow-hidden border border-outline-variant/10 shadow-sm">
              {section.items.map((item, itemIdx) => (
                <div 
                  key={itemIdx}
                  className={cn(
                    "flex items-center justify-between p-6 transition-colors",
                    itemIdx !== section.items.length - 1 && "border-bottom border-outline-variant/10",
                    item.action && "hover:bg-surface-container-lowest cursor-pointer"
                  )}
                  onClick={item.action}
                >
                  <div className="flex items-center gap-4">
                    {item.icon && (
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        item.variant === "destructive" ? "bg-error/10 text-error" : "bg-primary/5 text-primary"
                      )}>
                        <item.icon size={20} />
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-on-surface">{item.label}</p>
                      {item.description && <p className="text-xs text-on-surface-variant font-medium">{item.description}</p>}
                      {item.value && <p className="text-xs text-primary font-bold mt-1">{item.value}</p>}
                    </div>
                  </div>

                  {item.toggle !== undefined ? (
                    <button 
                      onClick={(e) => { e.stopPropagation(); item.onToggle?.(); }}
                      className={cn(
                        "w-12 h-6 rounded-full transition-all relative",
                        item.toggle ? "bg-primary" : "bg-outline-variant"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                        item.toggle ? "left-7" : "left-1"
                      )} />
                    </button>
                  ) : item.action ? (
                    <div className="text-on-surface-variant">
                      {item.loading ? (
                        <RefreshCw className="animate-spin" size={20} />
                      ) : (
                        <ChevronRight size={20} />
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Garden Rules */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <Shield className="text-primary" size={20} />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-outline">Garden Rules</h3>
          </div>
          <Rules embedded />
        </section>

        {/* Danger Zone */}
        <section className="pt-8">
          <button 
            onClick={logout}
            className="w-full flex items-center justify-center gap-3 p-6 bg-error/5 text-error rounded-[2rem] font-black uppercase tracking-widest text-sm hover:bg-error/10 transition-all border border-error/10"
          >
            <LogOut size={20} />
            Sign Out of Plotwise
          </button>
          <p className="text-center mt-6 text-[10px] font-bold text-outline uppercase tracking-widest opacity-50">
            Version 2.4.0 • Built with AI Studio
          </p>
        </section>
      </div>
    </div>
  );
}
