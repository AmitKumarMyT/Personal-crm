import { create } from 'zustand';

interface UserProfile {
  userId: string;
  name?: string;
  age?: number;
  height?: string;
  weight_kg?: number;
  goal: "hypertrophy";
  equipment: string[];
  priority_phase: "arms" | "legs" | "lower_back_core";
  stats: {
    totalVolume: number;
    streak: number;
  };
}

interface Exercise {
  name: string;
  muscle_group: string;
  equipment: string;
  sets: number;
  reps: string;
  tempo: string;
  rest_seconds: number;
  rpe: string;
  notes: string;
}

interface WorkoutSession {
  date: string;
  phase: "arms" | "legs" | "lower_back_core";
  duration_minutes: number;
  energy_level: "low" | "medium" | "high";
  soreness: string[];
  pain_flags: string[];
  completed: boolean;
}

interface AppState {
  profile: UserProfile | null;
  currentWorkout: {
    session: WorkoutSession;
    exercises: Exercise[];
  } | null;
  history: any[];
  isLoading: boolean;
  setProfile: (profile: UserProfile | null) => void;
  setCurrentWorkout: (workout: any) => void;
  setHistory: (history: any[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  profile: null,
  currentWorkout: null,
  history: [],
  isLoading: true,
  setProfile: (profile) => set({ profile }),
  setCurrentWorkout: (currentWorkout) => set({ currentWorkout }),
  setHistory: (history) => set({ history }),
  setLoading: (isLoading) => set({ isLoading }),
}));
