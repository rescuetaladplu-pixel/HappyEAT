import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export function useFavorites() {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setIds(new Set());
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("favorites")
      .select("restaurant_id")
      .eq("user_id", user.id);
    setIds(new Set((data ?? []).map((r) => r.restaurant_id as string)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggle = useCallback(
    async (restaurantId: string) => {
      if (!user) {
        toast.error("กรุณาเข้าสู่ระบบก่อนกดร้านโปรด");
        return;
      }
      const isFav = ids.has(restaurantId);
      // optimistic
      setIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(restaurantId);
        else next.add(restaurantId);
        return next;
      });
      if (isFav) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("restaurant_id", restaurantId);
        if (error) {
          toast.error("ลบร้านโปรดไม่สำเร็จ");
          reload();
        }
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, restaurant_id: restaurantId });
        if (error && !error.message.includes("duplicate")) {
          toast.error("เพิ่มร้านโปรดไม่สำเร็จ");
          reload();
        } else {
          toast.success("เพิ่มเป็นร้านโปรดแล้ว");
        }
      }
    },
    [user, ids, reload],
  );

  return { favoriteIds: ids, isFavorite: (id: string) => ids.has(id), toggle, loading, reload };
}
