'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, collection, query, orderBy, limit, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { useStore } from './store';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { setProfile, setHistory, setCurrentWorkout } = useStore();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (authUser) {
        // Fetch or init profile
        try {
          const profileRef = doc(db, 'users', authUser.uid);
          const profileSnap = await getDoc(profileRef);

          if (!profileSnap.exists()) {
            const newProfile = {
              userId: authUser.uid,
              name: authUser.displayName || '',
              goal: 'hypertrophy',
              equipment: ['dumbbells', 'chair', 'bodyweight'],
              priority_phase: 'arms',
              stats: { totalVolume: 0, streak: 0 }
            };
            await setDoc(profileRef, newProfile);
            setProfile(newProfile as any);
          } else {
            setProfile(profileSnap.data() as any);
          }
        } catch (err) {
          console.error("Profile initialization failed", err);
        }
      } else {
        setProfile(null);
        setHistory([]);
        setCurrentWorkout(null);
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, [setProfile, setHistory, setCurrentWorkout]);

  // Data listeners managed in a separate effect for clean lifecycle
  useEffect(() => {
    if (!user) return;

    const workoutsQuery = query(
      collection(db, 'users', user.uid, 'workouts'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribeWorkouts = onSnapshot(workoutsQuery, 
      (snap) => {
        const historyData = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
        setHistory(historyData);
        const last = historyData[0];
        if (last && !last.session?.completed) {
          setCurrentWorkout(last);
        }
      },
      (error) => {
        console.error("Workouts subscription error", error);
        if (error.code === 'permission-denied') {
          // Silent fail or notify if needed
        }
      }
    );

    return () => unsubscribeWorkouts();
  }, [user, setHistory, setCurrentWorkout]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed", err);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
