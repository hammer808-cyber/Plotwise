import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import GardenHub from './components/GardenHub';
import PlantsPage from './components/PlantsPage';
import CarePage from './components/CarePage';
import Chat from './components/Chat';
import PlantDetail from './components/PlantDetail';
import Settings from './components/Settings';
import Plots from './components/Plots';
import PlotDetail from './components/PlotDetail';
import Financials from './components/Financials';
import ErrorBoundary from './components/ErrorBoundary';

import { FirebaseProvider, useFirebase } from './contexts/FirebaseContext';
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import { ProgressProvider } from './contexts/ProgressContext';
import { ActivePlotProvider } from './contexts/ActivePlotContext';
import Login from './components/Login';
import BedDetail from './components/BedDetail';
import OnboardingWizard from './components/OnboardingWizard';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from './firebase';

import { Toaster } from 'sonner';

/**
 * First-run gate: a brand-new account (no beds, no plots of its own) builds
 * its first bed before seeing the app. Returning users skip this entirely.
 */
function FirstRunGate({ children }: { children: React.ReactNode }) {
  const { user } = useFirebase();
  const [checked, setChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [bedsSnap, plotsSnap] = await Promise.all([
          getDocs(query(collection(db, 'planters'), where('ownerUid', '==', user.uid), limit(1))),
          getDocs(query(collection(db, 'spatial_plots'), where('ownerUid', '==', user.uid), limit(1))),
        ]);
        if (!cancelled) setNeedsOnboarding(bedsSnap.empty && plotsSnap.empty);
      } catch {
        if (!cancelled) setNeedsOnboarding(false);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!checked) {
    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  if (needsOnboarding) return <OnboardingWizard onDone={() => setNeedsOnboarding(false)} />;
  return <>{children}</>;
}

function AppContent() {
  const { user, loading } = useFirebase();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Served from the /Plotwise/ subpath on GitHub Pages;
  // basename keeps client-side routes under it. import.meta.env.BASE_URL is
  // '/Plotwise/' in the Pages build ('/' in dev).
  const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';

  return (
    <Router basename={basename}>
      <Toaster position="top-right" richColors />
      <FirstRunGate>
      <Layout>
        <Routes>
          <Route path="/" element={<GardenHub />} />
          {/* Consolidated: Plants = My Plants + Discover + Companions */}
          <Route path="/plants" element={<PlantsPage />} />
          <Route path="/inventory" element={<PlantsPage initialTab="mine" />} />
          <Route path="/library" element={<PlantsPage initialTab="discover" />} />
          <Route path="/companions" element={<PlantsPage initialTab="companions" />} />
          {/* Consolidated: Care = Treatments + Weeding + Schedule */}
          <Route path="/care" element={<CarePage />} />
          <Route path="/treatment" element={<CarePage initialTab="treatments" />} />
          <Route path="/weeding" element={<CarePage initialTab="weeding" />} />
          <Route path="/calendar" element={<CarePage initialTab="schedule" />} />
          {/* Rules now lives inside Settings */}
          <Route path="/rules" element={<Navigate to="/settings" replace />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/plant/:id" element={<PlantDetail />} />
          <Route path="/plots" element={<Plots />} />
          <Route path="/financials" element={<Financials />} />
          <Route path="/plots/:plotId" element={
            <ErrorBoundary>
              <PlotDetail />
            </ErrorBoundary>
          } />
          <Route path="/plots/:plotId/beds/:bedId" element={
            <ErrorBoundary>
              <BedDetail />
            </ErrorBoundary>
          } />
          {/* Standalone bed — not in any plot yet */}
          <Route path="/beds/:bedId" element={
            <ErrorBoundary>
              <BedDetail />
            </ErrorBoundary>
          } />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
      </FirstRunGate>
    </Router>
  );
}

export default function App() {
  return (
    <FirebaseProvider>
      <AccessibilityProvider>
        <ProgressProvider>
          <ActivePlotProvider>
            <AppContent />
          </ActivePlotProvider>
        </ProgressProvider>
      </AccessibilityProvider>
    </FirebaseProvider>
  );
}
