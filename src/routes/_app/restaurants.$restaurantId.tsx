import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { useCart, SelectedAddon } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Star, UtensilsCrossed, Minus, AlertTriangle } from "lucide-react";
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
interface AddonGroup {
  id: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  pricing_mode: "addon" | "variant";
}
interface AddonOption {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  is_available: boolean;
  sort_order: number;
}

function RestaurantDetail() {
  const { restaurantId } = Route.useParams();
  const navigate = useNavigate();
  const { count } = useCart();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [variantMin, setVariantMin] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState<MenuItem | null>(null);

  const load = useCallback(async () => {
    const [{ data: r }, { data: c }, { data: m }] = await Promise.all([
      supabase.from("restaurants").select("*").eq("id", restaurantId).maybeSingle(),
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
      </div>

      <div className="px-4 py-4 border-b border-border">
        <h1 className="text-2xl font-bold">{restaurant.name}</h1>
        {restaurant.description && (
          <p className="text-sm text-muted-foreground mt-1">{restaurant.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Star className="h-4 w-4 fill-primary text-primary" />
            {Number(restaurant.rating).toFixed(1)}
          </span>
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

/* ----- Item picker dialog with add-ons ----- */

function ItemPickerDialog({
  item,
  restaurantId,
  onClose,
}: {
  item: MenuItem;
  restaurantId: string;
  onClose: () => void;
}) {
  const { add, restaurantId: cartRestaurantId } = useCart();
  const [groups, setGroups] = useState<AddonGroup[]>([]);
  const [optionsMap, setOptionsMap] = useState<Record<string, AddonOption[]>>({});
  const [selected, setSelected] = useState<Record<string, string[]>>({}); // groupId -> [optionId]
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: g } = await supabase
        .from("menu_addon_groups")
        .select("*")
        .eq("menu_item_id", item.id)
        .order("sort_order");
      const groupList = (g ?? []) as AddonGroup[];
      setGroups(groupList);
      if (groupList.length > 0) {
        const { data: o } = await supabase
          .from("menu_addon_options")
          .select("*")
          .in("group_id", groupList.map((x) => x.id))
          .eq("is_available", true)
          .order("sort_order");
        const map: Record<string, AddonOption[]> = {};
        for (const opt of (o ?? []) as AddonOption[]) {
          (map[opt.group_id] ??= []).push(opt);
        }
        setOptionsMap(map);
      }
      setLoading(false);
    }
    load();
  }, [item.id]);

  function toggle(group: AddonGroup, optionId: string) {
    setSelected((prev) => {
      const cur = prev[group.id] ?? [];
      if (group.max_select <= 1) {
        return { ...prev, [group.id]: cur[0] === optionId ? [] : [optionId] };
      }
      if (cur.includes(optionId)) {
        return { ...prev, [group.id]: cur.filter((x) => x !== optionId) };
      }
      if (cur.length >= group.max_select) {
        toast.error(`เลือกได้สูงสุด ${group.max_select} รายการ`);
        return prev;
      }
      return { ...prev, [group.id]: [...cur, optionId] };
    });
  }

  const { unitPrice, addonsTotal } = useMemo(() => {
    let variantPrice: number | null = null;
    let extras = 0;
    for (const g of groups) {
      for (const oid of selected[g.id] ?? []) {
        const opt = (optionsMap[g.id] ?? []).find((o) => o.id === oid);
        if (!opt) continue;
        if (g.pricing_mode === "variant") {
          variantPrice = Number(opt.price_delta);
        } else {
          extras += Number(opt.price_delta);
        }
      }
    }
    const base = variantPrice ?? Number(item.price);
    return { unitPrice: base + extras, addonsTotal: extras };
  }, [groups, selected, optionsMap, item.price]);
  void addonsTotal;

  function handleAdd() {
    // validate required
    for (const g of groups) {
      const cur = selected[g.id] ?? [];
      if (g.is_required && cur.length === 0) {
        return toast.error(`กรุณาเลือก "${g.name}"`);
      }
      if (cur.length < g.min_select) {
        return toast.error(`"${g.name}" ต้องเลือกอย่างน้อย ${g.min_select} รายการ`);
      }
    }

    if (cartRestaurantId && cartRestaurantId !== restaurantId) {
      const ok = confirm("ตะกร้ามีอาหารจากร้านอื่นอยู่ ต้องการล้างและเริ่มใหม่?");
      if (!ok) return;
    }

    const addons: SelectedAddon[] = [];
    let variantPrice: number | null = null;
    for (const g of groups) {
      for (const oid of selected[g.id] ?? []) {
        const opt = (optionsMap[g.id] ?? []).find((o) => o.id === oid);
        if (!opt) continue;
        if (g.pricing_mode === "variant") {
          variantPrice = Number(opt.price_delta);
          // store for display, but priceDelta=0 since it's the base
          addons.push({
            groupName: g.name,
            optionName: opt.name,
            priceDelta: 0,
          });
        } else {
          addons.push({
            groupName: g.name,
            optionName: opt.name,
            priceDelta: Number(opt.price_delta),
          });
        }
      }
    }

    add({
      menuItemId: item.id,
      restaurantId,
      name: item.name,
      basePrice: variantPrice ?? Number(item.price),
      imageUrl: item.image_url,
      addons,
      note: note.trim() || null,
      quantity: qty,
    });
    toast.success(`เพิ่ม ${item.name} ลงตะกร้าแล้ว`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
        </DialogHeader>

        {item.image_url && (
          <div className="aspect-video rounded-lg overflow-hidden bg-secondary">
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          </div>
        )}
        {item.description && (
          <p className="text-sm text-muted-foreground">{item.description}</p>
        )}
        {item.allergen_info && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/40 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm text-amber-900 dark:text-amber-200">
              <div className="font-medium">ข้อมูลสำหรับผู้แพ้อาหาร</div>
              <div>{item.allergen_info}</div>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">กำลังโหลดตัวเลือก...</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              const opts = optionsMap[g.id] ?? [];
              if (opts.length === 0) return null;
              const cur = selected[g.id] ?? [];
              const isSingle = g.max_select <= 1;
              return (
                <div key={g.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">{g.name}</Label>
                    <span className="text-xs text-muted-foreground">
                      {g.is_required ? "จำเป็น" : "ไม่บังคับ"}
                      {!isSingle && ` • สูงสุด ${g.max_select}`}
                    </span>
                  </div>
                  {isSingle ? (
                    <RadioGroup
                      value={cur[0] ?? ""}
                      onValueChange={(v) => toggle(g, v)}
                    >
                      {opts.map((opt) => (
                        <label
                          key={opt.id}
                          className="flex items-center justify-between rounded-md border border-border p-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value={opt.id} id={opt.id} />
                            <span className="text-sm">{opt.name}</span>
                          </div>
                          {g.pricing_mode === "variant" ? (
                            <span className="text-sm text-muted-foreground">
                              ฿{Number(opt.price_delta).toFixed(0)}
                            </span>
                          ) : Number(opt.price_delta) !== 0 ? (
                            <span className="text-sm text-muted-foreground">
                              {Number(opt.price_delta) > 0 ? "+" : ""}
                              ฿{Number(opt.price_delta).toFixed(0)}
                            </span>
                          ) : null}
                        </label>
                      ))}
                    </RadioGroup>
                  ) : (
                    <div className="space-y-1">
                      {opts.map((opt) => (
                        <label
                          key={opt.id}
                          className="flex items-center justify-between rounded-md border border-border p-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={cur.includes(opt.id)}
                              onCheckedChange={() => toggle(g, opt.id)}
                            />
                            <span className="text-sm">{opt.name}</span>
                          </div>
                          {Number(opt.price_delta) !== 0 && (
                            <span className="text-sm text-muted-foreground">
                              {Number(opt.price_delta) > 0 ? "+" : ""}
                              ฿{Number(opt.price_delta).toFixed(0)}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="space-y-2">
              <Label>โน้ตถึงร้าน (ไม่บังคับ)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น ไม่ใส่ผัก, ไม่เผ็ด"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-sm">จำนวน</span>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center font-medium">{qty}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setQty((q) => q + 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleAdd} className="w-full" disabled={loading}>
            เพิ่มลงตะกร้า • ฿{(unitPrice * qty).toFixed(0)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
