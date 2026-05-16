import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const KEY = "happyeat:active_restaurant_id";

export function getActiveRestaurantId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActiveRestaurantId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export interface OwnedRestaurant {
  id: string;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  is_open: boolean;
  is_approved: boolean;
  category: string | null;
}

/**
 * Returns the currently active restaurant id for the signed-in owner.
 * - Verifies that the stored id still belongs to the user
 * - Falls back to the first owned restaurant (and persists it) if missing/stale
 * - Returns null if the user owns no restaurants
 */
export async function fetchActiveRestaurantId(userId: string): Promise<string | null> {
  const stored = getActiveRestaurantId();
  if (stored) {
    const { data } = await supabase
      .from("restaurants")
      .select("id")
      .eq("id", stored)
      .eq("owner_id", userId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  const { data } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data?.id) {
    setActiveRestaurantId(data.id);
    return data.id;
  }
  return null;
}

/** Hook: list all restaurants owned by the signed-in user + active selection. */
export function useOwnedRestaurants() {
  const { user } = useAuth();
  const [restaurants, setRestaurants] = useState<OwnedRestaurant[]>([]);
  const [activeId, setActive] = useState<string | null>(getActiveRestaurantId());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) {
      setRestaurants([]);
      setActive(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("restaurants")
      .select("id, name, logo_url, cover_url, is_open, is_approved, category")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true });
    const list = (data ?? []) as OwnedRestaurant[];
    setRestaurants(list);
    const stored = getActiveRestaurantId();
    const valid = stored && list.some((r) => r.id === stored) ? stored : list[0]?.id ?? null;
    if (valid !== stored) setActiveRestaurantId(valid);
    setActive(valid);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const selectRestaurant = useCallback((id: string) => {
    setActiveRestaurantId(id);
    setActive(id);
  }, []);

  return { restaurants, activeId, loading, selectRestaurant, reload };
}
