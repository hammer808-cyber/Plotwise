import React, { createContext, useContext, useEffect, useState } from 'react';
import { linkWithPopup } from 'firebase/auth';
import { toast } from 'sonner';
import { auth, googleProvider, signInAnonymously, signInWithPopup, signOut, onAuthStateChanged, User, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  /** True when the current session is a guest (anonymous) identity. */
  isAnonymous: boolean;
  /**
   * Sign in with Google. When the current session is a guest, the Google
   * credential is *linked* onto the guest identity so the garden survives
   * instead of being orphaned under a fresh uid.
   */
  signInWithGoogle: () => Promise<void>;
  /** Start a guest session (garden lives in this browser only). */
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
        ),
      ]);

    // Failsafe: never trap the user on the spinner.
    const failsafe = setTimeout(() => {
      console.warn('Auth init still pending after 12s; releasing the loading gate.');
      setLoading(false);
    }, 12000);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // No silent anonymous sign-in anymore: first-time visitors land on
      // the Login screen and choose Google or guest. Returning visitors
      // (persisted session) skip the gate entirely.
      //
      // Ensure a profile doc exists for signed-in (non-anonymous) users.
      // Skipped for anonymous users: the Firestore user rules require a
      // valid email, which anonymous identities don't have.
      // Best-effort only: handleFirestoreError re-throws by design, so a
      // failure here must never break app init. The 12s failsafe above is
      // the backstop.
      if (currentUser && !currentUser.isAnonymous) {
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const userDoc = await withTimeout(getDoc(userRef), 8000, 'User doc read');
          if (!userDoc.exists()) {
            await withTimeout(
              setDoc(userRef, {
                uid: currentUser.uid,
                displayName: currentUser.displayName,
                email: currentUser.email,
                photoURL: currentUser.photoURL,
                isPro: false,
                createdAt: serverTimestamp(),
              }),
              8000,
              'User doc write',
            );
          }
        } catch (error) {
          try {
            handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
          } catch (handlerError) {
            console.error('Non-fatal: user profile doc could not be ensured.', handlerError);
          }
        }
      }
      clearTimeout(failsafe);
      setUser(currentUser);
      setLoading(false);
    });

    return () => {
      clearTimeout(failsafe);
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      const current = auth.currentUser;
      if (current && current.isAnonymous) {
        // Upgrade the guest identity in place — the uid (and the garden
        // under it) survives instead of being orphaned.
        await linkWithPopup(current, googleProvider);
        toast.success('Garden backed up to your Google account.');
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (error: any) {
      const code = error?.code as string | undefined;
      if (code === 'auth/operation-not-allowed') {
        toast.error('Google sign-in isn\u2019t turned on yet — continue as guest for now.', { duration: 6000 });
      } else if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        toast.error('That Google account already has its own garden here. Sign out first to switch.', { duration: 6000 });
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // User dismissed the popup — stay silent.
      } else {
        toast.error('Could not sign in with Google. Try again.');
      }
      console.error('Google sign-in failed:', error);
    }
  };

  const continueAsGuest = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Guest sign-in failed (is the Anonymous provider enabled in the Firebase console?):', error);
      toast.error('Could not start a guest session. Check your connection and try again.');
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <FirebaseContext.Provider
      value={{ user, loading, isAnonymous: !!user?.isAnonymous, signInWithGoogle, continueAsGuest, logout }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}
