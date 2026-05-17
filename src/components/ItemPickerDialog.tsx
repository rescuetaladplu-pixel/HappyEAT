import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCart, SelectedAddon } from "@/lib/cart";
import { Button } from "@/components/ui/button";
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
import { Plus, Minus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export interface PickerMenuItem {
  id: string;
  name: string;
  description: string | null;
  allergen_info: string | null;
  price: number;
  image_url: string | null;
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

interface Props {
  item: PickerMenuItem;
  restaurantId: string;
  onClose: () => void;
  /** if set, dialog runs in EDIT mode and replaces this cart line */
  editLineId?: string;
  initialAddons?: SelectedAddon[];
  initialNote?: string | null;
  initialQty?: number;
}

export function ItemPickerDialog({
  item,
  restaurantId,
  onClose,
  editLineId,
  initialAddons,
  initialNote,
  initialQty,
}: Props) {
  const { add, remove, restaurantId: cartRestaurantId } = useCart();
  const [groups, setGroups] = useState<AddonGroup[]>([]);
  const [optionsMap, setOptionsMap] = useState<Record<string, AddonOption[]>>({});
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState(initialNote ?? "");
  const [qty, setQty] = useState(initialQty ?? 1);
  const [loading, setLoading] = useState(true);

  const isEdit = !!editLineId;

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
        const opts = (o ?? []) as AddonOption[];
        for (const opt of opts) {
          (map[opt.group_id] ??= []).push(opt);
        }
        setOptionsMap(map);

        // pre-select initialAddons (match by groupName + optionName)
        if (initialAddons && initialAddons.length > 0) {
          const pre: Record<string, string[]> = {};
          for (const grp of groupList) {
            const grpOpts = map[grp.id] ?? [];
            const matches = initialAddons.filter((a) => a.groupName === grp.name);
            for (const m of matches) {
              const opt = grpOpts.find((o) => o.name === m.optionName);
              if (opt) (pre[grp.id] ??= []).push(opt.id);
            }
          }
          setSelected(pre);
        }
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const unitPrice = useMemo(() => {
    let variantPrice: number | null = null;
    let extras = 0;
    for (const g of groups) {
      for (const oid of selected[g.id] ?? []) {
        const opt = (optionsMap[g.id] ?? []).find((o) => o.id === oid);
        if (!opt) continue;
        if (g.pricing_mode === "variant") variantPrice = Number(opt.price_delta);
        else extras += Number(opt.price_delta);
      }
    }
    const base = variantPrice ?? Number(item.price);
    return base + extras;
  }, [groups, selected, optionsMap, item.price]);

  function handleSave() {
    for (const g of groups) {
      const cur = selected[g.id] ?? [];
      if (g.is_required && cur.length === 0) return toast.error(`กรุณาเลือก "${g.name}"`);
      if (cur.length < g.min_select)
        return toast.error(`"${g.name}" ต้องเลือกอย่างน้อย ${g.min_select} รายการ`);
    }

    if (!isEdit && cartRestaurantId && cartRestaurantId !== restaurantId) {
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
          addons.push({ groupName: g.name, optionName: opt.name, priceDelta: 0 });
        } else {
          addons.push({
            groupName: g.name,
            optionName: opt.name,
            priceDelta: Number(opt.price_delta),
          });
        }
      }
    }

    // EDIT: remove old line first, then add the new one (auto-merge if duplicate)
    if (isEdit && editLineId) remove(editLineId);

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
    toast.success(isEdit ? "บันทึกการแก้ไขแล้ว" : `เพิ่ม ${item.name} ลงตะกร้าแล้ว`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "แก้ไข: " : ""}
            {item.name}
          </DialogTitle>
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
                    <RadioGroup value={cur[0] ?? ""} onValueChange={(v) => toggle(g, v)}>
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
          <Button onClick={handleSave} className="w-full" disabled={loading}>
            {isEdit ? "บันทึกการแก้ไข" : "เพิ่มลงตะกร้า"} • ฿{(unitPrice * qty).toFixed(0)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
