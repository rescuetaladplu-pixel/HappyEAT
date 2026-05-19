import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { useCart } from "@/lib/cart";
import { ItemPickerDialog } from "@/components/ItemPickerDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Star, UtensilsCrossed, AlertTriangle, Heart } from "lucide-react";
import { useFavorites } from "@/lib/favorites";
import { toast } from "sonner";
import { isOpenNow, nextOpenLabel, type OpeningHours } from "@/lib/opening-hours";

export const Route = createFileRoute("/_app/restaurants/$restaurantId")({
  component: RestaurantDetail,
});

interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  cover_url: string | null;
  rating: number;
  delivery_fee: number;
  is_open: boolean;
  is_open_until: string | null;
  address: string | null;
  opening_hours: OpeningHours | null;
}
interface Category {
  id: string;
  name: string;
  sort_order: number;
}
interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  allergen_info: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  category_id: string | null;
  sort_order: number;
}

function RestaurantDetail() {
  const { restaurantId } = Route.useParams();
  const navigate = useNavigate();
  const { count } = useCart();
  const { isFavorite, toggle: toggleFav } = useFavorites();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [variantMin, setVariantMin] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState<MenuItem | null>(null);

  const load = useCallback(async () => {
    const [{ data: r }, { data: c }, { data: m }] = await Promise.all([
      supabase.from("restaurants_public").select("*").eq("id", restaurantId).maybeSingle(),
      supabase
        .from("menu_categories")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("sort_order"),
      supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("sort_order"),
    ]);
    setRestaurant(r as Restaurant | null);
    setCategories((c ?? []) as Category[]);
    const itemList = (m ?? []) as MenuItem[];
    setItems(itemList);

    // Compute variant minimum price per item
    if (itemList.length > 0) {
      const { data: groupsData } = await supabase
        .from("menu_addon_groups")
        .select("id, menu_item_id, pricing_mode")
        .in("menu_item_id", itemList.map((i) => i.id))
        .eq("pricing_mode", "variant");
      const variantGroups = (groupsData ?? []) as {
        id: string;
        menu_item_id: string;
      }[];
      if (variantGroups.length > 0) {
        const { data: optsData } = await supabase
          .from("menu_addon_options")
          .select("group_id, price_delta, is_available")
          .in(
            "group_id",
            variantGroups.map((g) => g.id),
          )
          .eq("is_available", true);
        const minByItem: Record<string, number> = {};
        for (const opt of (optsData ?? []) as {
          group_id: string;
          price_delta: number;
        }[]) {
          const grp = variantGroups.find((g) => g.id === opt.group_id);
          if (!grp) continue;
          const p = Number(opt.price_delta);
          if (minByItem[grp.menu_item_id] === undefined || p < minByItem[grp.menu_item_id]) {
            minByItem[grp.menu_item_id] = p;
          }
        }
        setVariantMin(minByItem);
      }
    }
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  useRefetchOnFocus(load);

  const grouped = useMemo(() => {
    const out: { cat: Category | null; rows: MenuItem[] }[] = [];
    for (const c of categories) {
      const rows = items.filter((i) => i.category_id === c.id);
      if (rows.length > 0) out.push({ cat: c, rows });
    }
    const orphan = items.filter((i) => !i.category_id);
    if (orphan.length > 0) out.push({ cat: null, rows: orphan });
    return out;
  }, [items, categories]);

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto p-4 space-y-3">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </main>
    );
  }

  if (!restaurant) {
    return (
      <main className="p-6 text-center">
        <p>ไม่พบร้าน</p>
        <Link to="/home" className="text-primary underline">กลับหน้าแรก</Link>
      </main>
    );
  }

  const cover = restaurant.cover_url || restaurant.image_url;

  return (
    <main className="max-w-2xl mx-auto pb-24">
      <div className="relative aspect-[3/1] bg-gradient-to-br from-accent to-secondary">
        {cover ? (
          <img src={cover} alt={restaurant.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-primary/30">
            <UtensilsCrossed className="h-16 w-16" />
          </div>
        )}
        <button
          onClick={() => navigate({ to: "/home" })}
          className="absolute top-4 left-4 h-10 w-10 rounded-full bg-card/90 backdrop-blur flex items-center justify-center shadow"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => toggleFav(restaurant.id)}
          aria-label="ร้านโปรด"
          className="absolute top-4 right-4 h-10 w-10 rounded-full bg-card/90 backdrop-blur flex items-center justify-center shadow"
        >
          <Heart
            className={`h-5 w-5 ${isFavorite(restaurant.id) ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
          />
        </button>
      </div>

      <div className="px-4 py-4 border-b border-border">
        <h1 className="text-2xl font-bold">{restaurant.name}</h1>
        {restaurant.description && (
          <p className="text-sm text-muted-foreground mt-1">{restaurant.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
          <Link
            to="/restaurants/$restaurantId/reviews"
            params={{ restaurantId }}
            className="flex items-center gap-1 hover:text-primary underline-offset-2 hover:underline"
          >
            <Star className="h-4 w-4 fill-primary text-primary" />
            {Number(restaurant.rating).toFixed(1)}
            <span className="text-xs">(ดูรีวิว)</span>
          </Link>
          <span>•</span>
          <span>ค่าส่ง ฿{Number(restaurant.delivery_fee).toFixed(0)}</span>
          {(() => {
            const withinHours = isOpenNow(restaurant.opening_hours);
            const extendActive = !!(restaurant.is_open_until && new Date(restaurant.is_open_until) > new Date());
            const reallyOpen = restaurant.is_open && (withinHours || extendActive);
            if (reallyOpen) return null;
            const label = !restaurant.is_open
              ? "ปิดอยู่"
              : (nextOpenLabel(restaurant.opening_hours) ?? "นอกเวลาทำการ");
            return (
              <>
                <span>•</span>
                <Badge variant="secondary">{label}</Badge>
              </>
            );
          })()}
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          ยังไม่มีเมนูในร้านนี้
        </p>
      ) : (
        grouped.map((g) => (
          <section key={g.cat?.id ?? "none"} className="p-4 space-y-3">
            <h2 className="text-lg font-semibold">{g.cat?.name ?? "เมนู"}</h2>
            {g.rows.map((item) => (
              <Card key={item.id} className="p-3 flex gap-3 items-center">
                <div className="w-20 h-20 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-primary/30">
                      <UtensilsCrossed className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{item.name}</h3>
                    {!item.is_available && <Badge variant="secondary">หมด</Badge>}
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                  )}
                  {item.allergen_info && (
                    <div className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-1">แพ้: {item.allergen_info}</span>
                    </div>
                  )}
                  {variantMin[item.id] !== undefined ? (
                    <p className="text-primary font-semibold mt-1">
                      เริ่มต้น ฿{variantMin[item.id].toFixed(0)}
                    </p>
                  ) : (
                    <p className="text-primary font-semibold mt-1">฿{Number(item.price).toFixed(0)}</p>
                  )}
                </div>
                <Button
                  size="icon"
                  onClick={() => setPicking(item)}
                  disabled={!item.is_available || !restaurant.is_open || (!isOpenNow(restaurant.opening_hours) && !(restaurant.is_open_until && new Date(restaurant.is_open_until) > new Date()))}
                  className="rounded-full"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </section>
        ))
      )}

      {count > 0 && (
        <div className="fixed bottom-20 inset-x-0 px-4 z-30">
          <div className="max-w-2xl mx-auto">
            <Button asChild size="lg" className="w-full shadow-lg">
              <Link to="/cart">ดูตะกร้า ({count} รายการ)</Link>
            </Button>
          </div>
        </div>
      )}

      {picking && (
        <ItemPickerDialog
          item={picking}
          restaurantId={restaurantId}
          onClose={() => setPicking(null)}
        />
      )}
    </main>
  );
}