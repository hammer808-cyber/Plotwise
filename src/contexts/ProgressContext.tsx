import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from '../firebase';
import { useFirebase } from './FirebaseContext';
import { newProgressDocument } from '../lib/wizardWrites';

interface UserProgress {
  xp: number;
  level: number;
  streak: number;
  lastEventDate: string | null;
  totalEvents: number;
}

interface ProgressContextType {
  progress: UserProgress;
  addXP: (amount: number) => Promise<void>;
  growthMeterHeight: number; // in mm
}

const ProgressContext = createContext<ProgressContextType | undefined>(undefined);

export const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useFirebase();
  const [progress, setProgress] = useState<UserProgress>({
    xp: 0,
    level: 1,
    streak: 0,
    lastEventDate: null,
    totalEvents: 0,
  });

  useEffect(() => {
    if (!user) return;

    const progressRef = doc(db, 'user_progress', user.uid);
    
    const unsubscribe = onSnapshot(progressRef, (docSnap) => {
      if (docSnap.exists()) {
        setProgress(docSnap.data() as UserProgress);
      } else {
        // Initialize progress if it doesn't exist
        // lastEventDate is omitted: rules require a string, and null is rejected,
        // so the progress doc never existed and later XP updates had nothing to hit.
        const initialProgress = newProgressDocument();
        setDoc(progressRef, initialProgress).catch((error) => {
          console.error('progress init failed', error);
        });
        setProgress({ ...initialProgress, lastEventDate: null });
      }
    });

    return () => unsubscribe();
  }, [user]);

  const addXP = async (amount: number) => {
    if (!user) return;

    const progressRef = doc(db, 'user_progress', user.uid);
    const today = new Date().toISOString().split('T')[0];
    
    const docSnap = await getDoc(progressRef);
    if (!docSnap.exists()) {
      await setDoc(progressRef, newProgressDocument());
    }
    const currentData = docSnap.data() as UserProgress | undefined;

    let newStreak = currentData?.streak || 0;
    if (currentData?.lastEventDate) {
      const lastDate = new Date(currentData.lastEventDate);
      const diffTime = Math.abs(new Date(today).getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        newStreak += 1;
      } else if (diffDays > 1) {
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }

    await updateDoc(progressRef, {
      xp: increment(amount),
      totalEvents: increment(1),
      lastEventDate: today,
      streak: newStreak,
      updatedAt: serverTimestamp(),
    });
  };

  // Growth Meter Height: 10mm base + 2mm per 100 XP
  const growthMeterHeight = 10 + (progress.xp / 50); 

  return (
    <ProgressContext.Provider value={{ progress, addXP, growthMeterHeight }}>
      {children}
    </ProgressContext.Provider>
  );
};

export const useProgress = () => {
  const context = useContext(ProgressContext);
  if (context === undefined) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};
