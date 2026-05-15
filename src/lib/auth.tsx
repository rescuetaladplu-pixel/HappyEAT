import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "customer" | "restaurant" | "rider" | "admin";

const ROLE_PRIORITY: AppRole[] = ["admin", "restaurant", "rider", "customer"];

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: AppRole,
    phone?: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // Defer role fetch to avoid deadlock with auth state callback
        setTimeout(() => fetchRole(newSession.user.id), 0);
      } else {
        setRole(null);
      }
    });

    // Then check existing session
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        // DEV: auto-login as tester for easier QA
        await supabase.auth.signInWithPassword({
          email: "tester@test.local",
          password: "tester001",
        });
        setLoading(false);
        return;
      }
      setSession(data.session);
      setUser(data.session.user);
      fetchRole(data.session.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchRole(userId: string) {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);

    if (error) {
      setRole("customer");
      return;
    }

    const roles = (data ?? []).map((row) => row.role as AppRole);
    setRole(ROLE_PRIORITY.find((candidate) => roles.includes(candidate)) ?? "customer");
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(
    email: string,
    password: string,
    fullName: string,
    roleChoice: AppRole,
    phone?: string,
  ) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName, phone: phone ?? "", role: roleChoice },
      },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
