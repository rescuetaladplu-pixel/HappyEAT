import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "customer" | "restaurant" | "rider" | "admin";

const ROLE_PRIORITY: AppRole[] = ["admin", "restaurant", "rider", "customer"];

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
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
      setLoading(false);
      if (newSession?.user) {
        // Defer role fetch to avoid deadlock with auth state callback
        setTimeout(() => fetchRole(newSession.user.id), 0);
      } else {
        setRole(null);
      }
    });

    // Then check existing session — always release loading even if it hangs
    const safetyTimer = setTimeout(() => setLoading(false), 4000);
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session?.user) fetchRole(data.session.user.id);
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        clearTimeout(safetyTimer);
        setLoading(false);
      });

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  async function fetchRole(userId: string) {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error) {
        setRole("customer");
        return;
      }

      const roles = (data ?? []).map((row) => row.role as AppRole);
      setRole(ROLE_PRIORITY.find((candidate) => roles.includes(candidate)) ?? "customer");
    } catch {
      setRole("customer");
    }
  }

  async function signIn(email: string, password: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) {
        const nextSession = data.session;
        const nextUser = data.user ?? nextSession?.user ?? null;
        setSession(nextSession ?? null);
        setUser(nextUser);
        if (nextUser) void fetchRole(nextUser.id);
      }
      return { error: error?.message ?? null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ" };
    } finally {
      setLoading(false);
    }
  }

  async function signUp(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    roleChoice: AppRole,
    phone?: string,
  ) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          first_name: firstName,
          last_name: lastName,
          phone: phone ?? "",
          role: roleChoice,
        },
      },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setLoading(false);
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
