import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchActiveRestaurantId } from "@/lib/active-restaurant";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Pencil,
  Upload,
  ArrowLeft,
  Loader2,
  UtensilsCrossed,
  ArrowUp,
  ArrowDown,
  Info,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/restaurant/menu")({
  component: MenuManagementPage,
});

interface Restaurant {
  id: string;
  name: string;
}
interface Category {
  id: string;
  name: string;
  sort_order: number;
}
interface MenuItem {
  id: string;
  restaurant_id: string;
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
  menu_item_id: string;
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
  sort_order: number;
  is_available: boolean;
}

function MenuManagementPage() {
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  // dialogs
  const [editItem, setEditItem] = useState<MenuItem | null>(null);

  async function load() {
    if (!user) return;
    const rid = await fetchActiveRestaurantId(user.id);
    const { data: r } = rid
      ? await supabase.from("restaurants").select("id, name").eq("id", rid).maybeSingle()
      : { data: null };
    setRestaurant(r as Restaurant | null);
    if (r) {
      const [{ data: c }, { data: m }] = await Promise.all([
        supabase
          .from("menu_categories")
          .select("*")
          .eq("restaurant_id", r.id)
          .order("sort_order"),
        supabase
          .from("menu_items")
          .select("*")
          .eq("restaurant_id", r.id)
          .order("sort_order"),
      ]);
      setCategories((c ?? []) as Category[]);
      setItems((m ?? []) as MenuItem[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) {
    return (
      <main className="p-6 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (!restaurant) {
    return (
      <main className="max-w-2xl mx-auto p-4">
        <Card className="p-6 text-center space-y-3">
          <p>ยังไม่มีร้านอาหาร</p>
          <Button asChild>
            <Link to="/my-restaurant">ตั้งค่าร้านก่อน</Link>
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-4 pb-24 space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/my-restaurant">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold">จัดการเมนู</h1>
          <p className="text-sm text-muted-foreground">{restaurant.name}</p>
        </div>
      </div>

      <Tabs defaultValue="items">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="items">เมนูอาหาร</TabsTrigger>
          <TabsTrigger value="categories">หมวดหมู่</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-3 mt-3">
          <Button
            className="w-full"
            onClick={() =>
              setEditItem({
                id: "",
                restaurant_id: restaurant.id,
                name: "",
                description: "",
                allergen_info: "",
                price: 0,
                image_url: null,
                is_available: true,
                category_id: null,
                sort_order: items.length,
              })
            }
          >
            <Plus className="h-4 w-4 mr-2" /> เพิ่มเมนูใหม่
          </Button>

          {items.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              ยังไม่มีเมนู กดปุ่มด้านบนเพื่อเพิ่มเมนูแรก
            </Card>
          ) : (
            <ItemList
              items={items}
              categories={categories}
              onEdit={setEditItem}
              onChange={load}
            />
          )}
        </TabsContent>

        <TabsContent value="categories" className="mt-3">
          <CategoryManager
            restaurantId={restaurant.id}
            categories={categories}
            onChange={load}
          />
        </TabsContent>
      </Tabs>

      {editItem && (
        <ItemEditDialog
          item={editItem}
          categories={categories}
          restaurantId={restaurant.id}
          ownerId={user!.id}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            load();
          }}
        />
      )}

    </main>
  );
}

/* ----------------------- Category manager ----------------------- */

function CategoryManager({
  restaurantId,
  categories,
  onChange,
}: {
  restaurantId: string;
  categories: Category[];
  onChange: () => void;
}) {
  const [newName, setNewName] = useState("");

  async function add() {
    if (!newName.trim()) return;
    const { error } = await supabase.from("menu_categories").insert({
      restaurant_id: restaurantId,
      name: newName.trim(),
      sort_order: categories.length,
    });
    if (error) return toast.error(error.message);
    setNewName("");
    onChange();
  }

  async function rename(id: string, name: string) {
    const { error } = await supabase
      .from("menu_categories")
      .update({ name })
      .eq("id", id);
    if (error) return toast.error(error.message);
    onChange();
  }

  async function remove(id: string) {
    if (!confirm("ลบหมวดหมู่นี้? เมนูในหมวดจะกลายเป็น 'ไม่มีหมวด'")) return;
    const { error } = await supabase.from("menu_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onChange();
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= categories.length) return;
    const a = categories[idx];
    const b = categories[j];
    await Promise.all([
      supabase.from("menu_categories").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("menu_categories").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    onChange();
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="ชื่อหมวดหมู่ใหม่ เช่น อาหารจานเดียว"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          ยังไม่มีหมวดหมู่
        </p>
      ) : (
        <div className="space-y-2">
          {categories.map((c, i) => (
            <CategoryRow
              key={c.id}
              cat={c}
              isFirst={i === 0}
              isLast={i === categories.length - 1}
              onRename={(name) => rename(c.id, name)}
              onRemove={() => remove(c.id)}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function CategoryRow({
  cat,
  isFirst,
  isLast,
  onRename,
  onRemove,
  onUp,
  onDown,
}: {
  cat: Category;
  isFirst: boolean;
  isLast: boolean;
  onRename: (n: string) => void;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const [name, setName] = useState(cat.name);
  return (
    <div className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== cat.name && onRename(name)}
      />
      <Button size="icon" variant="ghost" disabled={isFirst} onClick={onUp}>
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" disabled={isLast} onClick={onDown}>
        <ArrowDown className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className="text-destructive" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

/* ----------------------- Item list ----------------------- */

function ItemList({
  items,
  categories,
  onEdit,
  onChange,
}: {
  items: MenuItem[];
  categories: Category[];
  onEdit: (it: MenuItem) => void;
  onChange: () => void;
}) {
  async function toggle(it: MenuItem, v: boolean) {
    await supabase.from("menu_items").update({ is_available: v }).eq("id", it.id);
    onChange();
  }
  async function remove(it: MenuItem) {
    if (!confirm(`ลบเมนู "${it.name}"?`)) return;
    await supabase.from("menu_items").delete().eq("id", it.id);
    onChange();
  }

  // group by category
  const groups: { cat: Category | null; rows: MenuItem[] }[] = [];
  for (const c of categories) {
    groups.push({ cat: c, rows: items.filter((i) => i.category_id === c.id) });
  }
  groups.push({ cat: null, rows: items.filter((i) => !i.category_id) });

  return (
    <div className="space-y-4">
      {groups
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <div key={g.cat?.id ?? "none"} className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground px-1">
              {g.cat?.name ?? "ไม่มีหมวดหมู่"}
            </h3>
            {g.rows.map((it) => (
              <Card key={it.id} className="p-3">
                <div className="flex gap-3 items-start">
                  <div className="w-16 h-16 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-primary/30">
                        <UtensilsCrossed className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{it.name}</p>
                      {!it.is_available && <Badge variant="secondary">หมด</Badge>}
                    </div>
                    {it.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {it.description}
                      </p>
                    )}
                    <p className="text-primary font-semibold mt-1">
                      ฿{Number(it.price).toFixed(0)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={it.is_available}
                      onCheckedChange={(v) => toggle(it, v)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {it.is_available ? "พร้อมขาย" : "หมดวันนี้"}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => onEdit(it)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => remove(it)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ))}
    </div>
  );
}

/* ----------------------- Item edit dialog ----------------------- */

function ItemEditDialog({
  item,
  categories,
  restaurantId,
  ownerId,
  onClose,
  onSaved,
}: {
  item: MenuItem;
  categories: Category[];
  restaurantId: string;
  ownerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !item.id;
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [allergenInfo, setAllergenInfo] = useState(item.allergen_info ?? "");
  const [price, setPrice] = useState(String(item.price ?? ""));
  const [imageUrl, setImageUrl] = useState<string | null>(item.image_url);
  const [categoryId, setCategoryId] = useState<string | null>(item.category_id);
  const [isAvailable, setIsAvailable] = useState(item.is_available);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Variants (size/type) — stored as a single addon_group with pricing_mode='variant'
  type VariantRow = { id?: string; name: string; price: string; tempKey: string };
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [variantGroupId, setVariantGroupId] = useState<string | null>(null);
  type VariantTemplate = {
    id: string;
    name: string;
    options: { name: string; price_delta: number; sort_order: number }[];
  };
  const [variantTemplates, setVariantTemplates] = useState<VariantTemplate[]>([]);

  useEffect(() => {
    if (!item.id) return;
    (async () => {
      const { data: g } = await supabase
        .from("menu_addon_groups")
        .select("id")
        .eq("menu_item_id", item.id)
        .eq("pricing_mode", "variant")
        .maybeSingle();
      if (!g) return;
      setVariantGroupId(g.id);
      const { data: opts } = await supabase
        .from("menu_addon_options")
        .select("id, name, price_delta, sort_order")
        .eq("group_id", g.id)
        .order("sort_order");
      setVariants(
        (opts ?? []).map((o) => ({
          id: o.id,
          name: o.name,
          price: String(o.price_delta),
          tempKey: o.id,
        })),
      );
    })();
  }, [item.id]);

  function addVariant() {
    setVariants((v) => [
      ...v,
      { name: "", price: "", tempKey: `new-${Date.now()}-${Math.random()}` },
    ]);
  }
  function updateVariant(key: string, patch: Partial<VariantRow>) {
    setVariants((v) => v.map((x) => (x.tempKey === key ? { ...x, ...patch } : x)));
  }
  function removeVariant(key: string) {
    setVariants((v) => v.filter((x) => x.tempKey !== key));
  }

  // ----- Addon groups (toppings / extras) -----
  type AddonOptionRow = {
    id?: string;
    name: string;
    price: string;
    isAvailable: boolean;
    tempKey: string;
  };
  type AddonGroupRow = {
    id?: string;
    name: string;
    isRequired: boolean;
    minSelect: number;
    maxSelect: number;
    options: AddonOptionRow[];
    tempKey: string;
  };
  const [addonGroups, setAddonGroups] = useState<AddonGroupRow[]>([]);
  const [initialAddonGroupIds, setInitialAddonGroupIds] = useState<string[]>([]);
  type Template = {
    id: string;
    name: string;
    is_required: boolean;
    min_select: number;
    max_select: number;
    options: { name: string; price_delta: number; sort_order: number }[];
  };
  const [templates, setTemplates] = useState<Template[]>([]);

  // load existing addon groups for this menu item
  useEffect(() => {
    if (!item.id) return;
    (async () => {
      const { data: g } = await supabase
        .from("menu_addon_groups")
        .select("id, name, is_required, min_select, max_select, sort_order")
        .eq("menu_item_id", item.id)
        .neq("pricing_mode", "variant")
        .order("sort_order");
      const groupList = g ?? [];
      if (groupList.length === 0) return;
      const ids = groupList.map((x) => x.id);
      setInitialAddonGroupIds(ids);
      const { data: opts } = await supabase
        .from("menu_addon_options")
        .select("id, group_id, name, price_delta, is_available, sort_order")
        .in("group_id", ids)
        .order("sort_order");
      const optsByGroup: Record<string, AddonOptionRow[]> = {};
      for (const o of opts ?? []) {
        (optsByGroup[o.group_id] ??= []).push({
          id: o.id,
          name: o.name,
          price: String(o.price_delta),
          isAvailable: o.is_available,
          tempKey: o.id,
        });
      }
      setAddonGroups(
        groupList.map((g0) => ({
          id: g0.id,
          name: g0.name,
          isRequired: g0.is_required,
          minSelect: g0.min_select,
          maxSelect: g0.max_select,
          options: optsByGroup[g0.id] ?? [],
          tempKey: g0.id,
        })),
      );
    })();
  }, [item.id]);

  // load reusable templates for this restaurant
  useEffect(() => {
    (async () => {
      const { data: t } = await supabase
        .from("addon_group_templates")
        .select("id, name, is_required, min_select, max_select")
        .eq("restaurant_id", restaurantId)
        .order("name");
      const tList = t ?? [];
      if (tList.length === 0) {
        setTemplates([]);
        return;
      }
      const { data: o } = await supabase
        .from("addon_group_template_options")
        .select("template_id, name, price_delta, sort_order")
        .in(
          "template_id",
          tList.map((x) => x.id),
        )
        .order("sort_order");
      const byT: Record<string, Template["options"]> = {};
      for (const opt of o ?? []) {
        (byT[opt.template_id] ??= []).push({
          name: opt.name,
          price_delta: Number(opt.price_delta),
          sort_order: opt.sort_order,
        });
      }
      setTemplates(
        tList.map((x) => ({
          id: x.id,
          name: x.name,
          is_required: x.is_required,
          min_select: x.min_select,
          max_select: x.max_select,
          options: byT[x.id] ?? [],
        })),
      );
    })();
  }, [restaurantId]);

  // load reusable variant templates for this restaurant
  useEffect(() => {
    (async () => {
      const { data: t } = await supabase
        .from("variant_group_templates")
        .select("id, name")
        .eq("restaurant_id", restaurantId)
        .order("name");
      const tList = t ?? [];
      if (tList.length === 0) {
        setVariantTemplates([]);
        return;
      }
      const { data: o } = await supabase
        .from("variant_group_template_options")
        .select("template_id, name, price_delta, sort_order")
        .in("template_id", tList.map((x) => x.id))
        .order("sort_order");
      const byT: Record<string, VariantTemplate["options"]> = {};
      for (const opt of o ?? []) {
        (byT[opt.template_id] ??= []).push({
          name: opt.name,
          price_delta: Number(opt.price_delta),
          sort_order: opt.sort_order,
        });
      }
      setVariantTemplates(
        tList.map((x) => ({ id: x.id, name: x.name, options: byT[x.id] ?? [] })),
      );
    })();
  }, [restaurantId]);

  function applyVariantTemplate(templateId: string) {
    const t = variantTemplates.find((x) => x.id === templateId);
    if (!t) return;
    const base = Number(price) || 0;
    setVariants(
      t.options.map((o) => ({
        name: o.name,
        price: String(base + Number(o.price_delta || 0)),
        tempKey: `new-${Date.now()}-${Math.random()}`,
      })),
    );
  }

  function newKey() {
    return `new-${Date.now()}-${Math.random()}`;
  }
  function addAddonGroup(name = "") {
    setAddonGroups((g) => [
      ...g,
      {
        name,
        isRequired: false,
        minSelect: 0,
        maxSelect: 1,
        options: [],
        tempKey: newKey(),
      },
    ]);
  }
  function applyTemplate(templateId: string) {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setAddonGroups((g) => [
      ...g,
      {
        name: t.name,
        isRequired: t.is_required,
        minSelect: t.min_select,
        maxSelect: t.max_select,
        options: t.options.map((o) => ({
          name: o.name,
          price: String(o.price_delta),
          isAvailable: true,
          tempKey: newKey(),
        })),
        tempKey: newKey(),
      },
    ]);
  }
  function updateAddonGroup(key: string, patch: Partial<AddonGroupRow>) {
    setAddonGroups((g) => g.map((x) => (x.tempKey === key ? { ...x, ...patch } : x)));
  }
  function removeAddonGroup(key: string) {
    setAddonGroups((g) => g.filter((x) => x.tempKey !== key));
  }
  function addOption(groupKey: string) {
    updateAddonGroupOptions(groupKey, (opts) => [
      ...opts,
      { name: "", price: "0", isAvailable: true, tempKey: newKey() },
    ]);
  }
  function updateOption(groupKey: string, optKey: string, patch: Partial<AddonOptionRow>) {
    updateAddonGroupOptions(groupKey, (opts) =>
      opts.map((o) => (o.tempKey === optKey ? { ...o, ...patch } : o)),
    );
  }
  function removeOption(groupKey: string, optKey: string) {
    updateAddonGroupOptions(groupKey, (opts) => opts.filter((o) => o.tempKey !== optKey));
  }
  function updateAddonGroupOptions(
    key: string,
    fn: (opts: AddonOptionRow[]) => AddonOptionRow[],
  ) {
    setAddonGroups((g) =>
      g.map((x) => (x.tempKey === key ? { ...x, options: fn(x.options) } : x)),
    );
  }

  async function syncAddons(menuItemId: string) {
    const cleanGroups = addonGroups
      .map((g) => ({
        ...g,
        name: g.name.trim(),
        options: g.options
          .map((o) => ({ ...o, name: o.name.trim() }))
          .filter((o) => o.name.length > 0),
      }))
      .filter((g) => g.name.length > 0);

    // delete groups removed by user
    const keepIds = cleanGroups.filter((g) => g.id).map((g) => g.id!) as string[];
    const toDelete = initialAddonGroupIds.filter((id) => !keepIds.includes(id));
    if (toDelete.length > 0) {
      await supabase.from("menu_addon_groups").delete().in("id", toDelete);
    }

    for (let i = 0; i < cleanGroups.length; i++) {
      const grp = cleanGroups[i];
      let groupId = grp.id;
      const groupPayload = {
        name: grp.name,
        is_required: grp.isRequired,
        min_select: Math.max(0, grp.minSelect),
        max_select: Math.max(1, grp.maxSelect),
        sort_order: i,
      };
      if (groupId) {
        await supabase.from("menu_addon_groups").update(groupPayload).eq("id", groupId);
      } else {
        const { data, error } = await supabase
          .from("menu_addon_groups")
          .insert({ ...groupPayload, menu_item_id: menuItemId, pricing_mode: "addon" })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message ?? "create addon group failed");
        groupId = data.id;
      }

      // sync options for this group
      const keepOptIds = grp.options.filter((o) => o.id).map((o) => o.id!) as string[];
      if (grp.id) {
        const { data: existing } = await supabase
          .from("menu_addon_options")
          .select("id")
          .eq("group_id", groupId);
        const optsToDelete = (existing ?? [])
          .map((e) => e.id)
          .filter((id) => !keepOptIds.includes(id));
        if (optsToDelete.length > 0) {
          await supabase.from("menu_addon_options").delete().in("id", optsToDelete);
        }
      }
      for (let j = 0; j < grp.options.length; j++) {
        const o = grp.options[j];
        const priceNum = Number(o.price) || 0;
        if (o.id) {
          await supabase
            .from("menu_addon_options")
            .update({
              name: o.name,
              price_delta: priceNum,
              is_available: o.isAvailable,
              sort_order: j,
            })
            .eq("id", o.id);
        } else {
          await supabase.from("menu_addon_options").insert({
            group_id: groupId,
            name: o.name,
            price_delta: priceNum,
            is_available: o.isAvailable,
            sort_order: j,
          });
        }
      }

      // upsert template (per restaurant, by name)
      const { data: tpl, error: tplErr } = await supabase
        .from("addon_group_templates")
        .upsert(
          {
            restaurant_id: restaurantId,
            name: grp.name,
            is_required: grp.isRequired,
            min_select: groupPayload.min_select,
            max_select: groupPayload.max_select,
          },
          { onConflict: "restaurant_id,name" },
        )
        .select("id")
        .single();
      if (!tplErr && tpl) {
        await supabase
          .from("addon_group_template_options")
          .delete()
          .eq("template_id", tpl.id);
        if (grp.options.length > 0) {
          await supabase.from("addon_group_template_options").insert(
            grp.options.map((o, j) => ({
              template_id: tpl.id,
              name: o.name,
              price_delta: Number(o.price) || 0,
              sort_order: j,
            })),
          );
        }
      }
    }
  }

  async function uploadImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop();
    const path = `${ownerId}/menu-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("restaurant-images")
      .upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("restaurant-images").getPublicUrl(path);
    setImageUrl(data.publicUrl);
    toast.success("อัปโหลดรูปแล้ว");
  }

  async function syncVariants(menuItemId: string) {
    const cleanRows = variants
      .map((v) => ({ ...v, name: v.name.trim() }))
      .filter((v) => v.name.length > 0);

    // Case 1: no variants → delete existing group if any
    if (cleanRows.length === 0) {
      if (variantGroupId) {
        await supabase.from("menu_addon_groups").delete().eq("id", variantGroupId);
      }
      return;
    }

    // Case 2: ensure group exists
    let groupId = variantGroupId;
    if (!groupId) {
      const { data, error } = await supabase
        .from("menu_addon_groups")
        .insert({
          menu_item_id: menuItemId,
          name: "ขนาด",
          pricing_mode: "variant",
          is_required: true,
          min_select: 1,
          max_select: 1,
          sort_order: 0,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "create variant group failed");
      groupId = data.id;
    }

    // Sync options: delete removed, upsert kept/new
    const keepIds = cleanRows.filter((r) => r.id).map((r) => r.id!) as string[];
    if (variantGroupId) {
      const { data: existing } = await supabase
        .from("menu_addon_options")
        .select("id")
        .eq("group_id", groupId);
      const toDelete = (existing ?? [])
        .map((e) => e.id)
        .filter((id) => !keepIds.includes(id));
      if (toDelete.length > 0) {
        await supabase.from("menu_addon_options").delete().in("id", toDelete);
      }
    }

    for (let i = 0; i < cleanRows.length; i++) {
      const r = cleanRows[i];
      const priceNum = Number(r.price) || 0;
      if (r.id) {
        await supabase
          .from("menu_addon_options")
          .update({ name: r.name, price_delta: priceNum, sort_order: i })
          .eq("id", r.id);
      } else {
        await supabase.from("menu_addon_options").insert({
          group_id: groupId,
          name: r.name,
          price_delta: priceNum,
          sort_order: i,
          is_available: true,
        });
      }
    }

    // upsert variant template (per restaurant, by group name)
    const prices = cleanRows.map((r) => Number(r.price) || 0);
    const minPrice = Math.min(...prices);
    const tplName = "ขนาด";
    const { data: tpl, error: tplErr } = await supabase
      .from("variant_group_templates")
      .upsert(
        { restaurant_id: restaurantId, name: tplName },
        { onConflict: "restaurant_id,name" },
      )
      .select("id")
      .single();
    if (!tplErr && tpl) {
      await supabase
        .from("variant_group_template_options")
        .delete()
        .eq("template_id", tpl.id);
      await supabase.from("variant_group_template_options").insert(
        cleanRows.map((r, i) => ({
          template_id: tpl.id,
          name: r.name,
          price_delta: (Number(r.price) || 0) - minPrice,
          sort_order: i,
        })),
      );
    }
  }

  async function save() {
    if (!name.trim()) return toast.error("กรุณาใส่ชื่อเมนู");
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return toast.error("ราคาไม่ถูกต้อง");
    // Validate variant prices
    for (const v of variants) {
      if (v.name.trim() && (!Number.isFinite(Number(v.price)) || Number(v.price) < 0)) {
        return toast.error(`ราคาตัวเลือก "${v.name}" ไม่ถูกต้อง`);
      }
    }
    setSaving(true);
    const payload = {
      restaurant_id: restaurantId,
      name: name.trim(),
      description: description.trim() || null,
      allergen_info: allergenInfo.trim() || null,
      price: priceNum,
      image_url: imageUrl,
      category_id: categoryId,
      is_available: isAvailable,
    };
    try {
      let savedId = item.id;
      if (isNew) {
        const { data, error } = await supabase
          .from("menu_items")
          .insert(payload)
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message ?? "insert failed");
        savedId = data.id;
      } else {
        const { error } = await supabase
          .from("menu_items")
          .update(payload)
          .eq("id", item.id);
        if (error) throw new Error(error.message);
      }
      await syncVariants(savedId);
      await syncAddons(savedId);
      toast.success(isNew ? "เพิ่มเมนูแล้ว" : "บันทึกแล้ว");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "เพิ่มเมนูใหม่" : "แก้ไขเมนู"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>รูปเมนู</Label>
            <div className="aspect-video rounded-lg bg-secondary overflow-hidden">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-primary/30">
                  <UtensilsCrossed className="h-10 w-10" />
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={uploadImage}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> อัปโหลดรูป
            </Button>
          </div>

          <div className="space-y-2">
            <Label>ชื่อเมนู *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>รายละเอียด</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>ข้อมูลสำหรับผู้แพ้อาหาร</Label>
            <Textarea
              value={allergenInfo}
              onChange={(e) => setAllergenInfo(e.target.value)}
              rows={2}
              placeholder="เช่น มีถั่ว, นม, ไข่, กลูเตน, อาหารทะเล"
            />
            <p className="text-xs text-muted-foreground">
              ระบุวัตถุดิบที่อาจก่อให้เกิดอาการแพ้ ข้อมูลนี้จะแสดงให้ลูกค้าเห็นชัดเจน
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>ราคา (บาท) *</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>หมวดหมู่</Label>
              <Select
                value={categoryId ?? "__none__"}
                onValueChange={(v) => setCategoryId(v === "__none__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="เลือก" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">ไม่ระบุ</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Variants (size/type) section */}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Label className="m-0">ขนาด / ประเภท (ที่เปลี่ยนราคา)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground"
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 text-xs leading-relaxed">
                    <p className="font-semibold text-sm mb-1">เคล็ดลับการใช้งาน</p>
                    <p className="text-muted-foreground">
                      เปิดใช้เมื่อเมนูมี <b>หลายขนาด/ประเภทที่ราคาต่างกัน</b> เช่น
                      ชานม แก้วเล็ก 50฿ / แก้วใหญ่ 70฿
                    </p>
                    <p className="text-muted-foreground mt-2">
                      ลูกค้าจะเห็นราคาบนการ์ดเมนูเป็น <b>"เริ่มต้น ฿50"</b> และ
                      เมื่อเลือกขนาด ราคาที่เลือกจะกลายเป็นราคาเมนู
                      (ไม่ใช่บวกเพิ่มจากราคาฐาน)
                    </p>
                    <p className="text-muted-foreground mt-2">
                      ส่วน <b>ตัวเลือกเสริม</b> เช่น ท็อปปิ้ง ไข่ดาว ที่บวกเพิ่ม
                      จากราคาฐาน ให้ใช้เมนู "ตัวเลือกเสริม" จากหน้ารายการเมนูเหมือนเดิม
                    </p>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {variants.length > 0 && (
              <div className="space-y-2">
                {variants.map((v) => (
                  <div key={v.tempKey} className="flex items-center gap-2">
                    <Input
                      placeholder="เช่น แก้วเล็ก"
                      value={v.name}
                      onChange={(e) => updateVariant(v.tempKey, { name: e.target.value })}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="ราคา"
                      value={v.price}
                      onChange={(e) => updateVariant(v.tempKey, { price: e.target.value })}
                      className="w-24"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive shrink-0"
                      onClick={() => removeVariant(v.tempKey)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={addVariant}
              >
                <Plus className="h-4 w-4 mr-1" /> เพิ่มตัวเลือกขนาด
              </Button>
              <Select
                value=""
                onValueChange={(v) => v && applyVariantTemplate(v)}
                disabled={variantTemplates.length === 0}
              >
                <SelectTrigger className="flex-1 h-9 text-xs">
                  <SelectValue
                    placeholder={
                      variantTemplates.length === 0
                        ? "ยังไม่มีเทมเพลต"
                        : "ใช้เทมเพลตที่บันทึกไว้"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {variantTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.options.map((o) => o.name).join(", ")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {variants.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center">
                ไม่ต้องตั้งค่าหากเมนูมีราคาเดียว
              </p>
            )}
          </div>

          {/* Addon groups (toppings / extras) */}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center gap-1.5">
              <Label className="m-0">ตัวเลือกเสริม (ท็อปปิ้ง / ของเพิ่ม)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 text-xs leading-relaxed">
                  <p className="font-semibold text-sm mb-1">เคล็ดลับการใช้งาน</p>
                  <p className="text-muted-foreground">
                    เพิ่มตัวเลือกเสริมที่ <b>บวกเพิ่มจากราคาฐาน</b> เช่น ไข่ดาว +10฿,
                    ชีส +20฿
                  </p>
                  <p className="text-muted-foreground mt-2">
                    กลุ่มที่สร้างจะถูก <b>บันทึกอัตโนมัติเป็นเทมเพลต</b> ของร้าน
                    เลือกใช้ซ้ำในเมนูอื่นได้จากดรอปดาวน์ "ใช้กลุ่มที่เคยตั้งไว้"
                  </p>
                </PopoverContent>
              </Popover>
            </div>

            {addonGroups.map((g) => (
              <Card key={g.tempKey} className="p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <Input
                    placeholder='เช่น "ท็อปปิ้ง"'
                    value={g.name}
                    onChange={(e) => updateAddonGroup(g.tempKey, { name: e.target.value })}
                    className="font-medium"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-destructive shrink-0"
                    onClick={() => removeAddonGroup(g.tempKey)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs items-center">
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={g.isRequired}
                      onCheckedChange={(v) => updateAddonGroup(g.tempKey, { isRequired: v })}
                    />
                    บังคับ
                  </label>
                  <div className="flex items-center gap-1">
                    <span>ขั้นต่ำ</span>
                    <Input
                      type="number"
                      min={0}
                      value={g.minSelect}
                      onChange={(e) =>
                        updateAddonGroup(g.tempKey, {
                          minSelect: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="h-8"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span>สูงสุด</span>
                    <Input
                      type="number"
                      min={1}
                      value={g.maxSelect}
                      onChange={(e) =>
                        updateAddonGroup(g.tempKey, {
                          maxSelect: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="h-8"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {g.options.map((o) => (
                    <div key={o.tempKey} className="flex items-center gap-2">
                      <Input
                        placeholder="ชื่อ"
                        value={o.name}
                        onChange={(e) =>
                          updateOption(g.tempKey, o.tempKey, { name: e.target.value })
                        }
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        inputMode="decimal"
                        placeholder="+ราคา"
                        value={o.price}
                        onChange={(e) =>
                          updateOption(g.tempKey, o.tempKey, { price: e.target.value })
                        }
                        className="w-20"
                      />
                      <Switch
                        checked={o.isAvailable}
                        onCheckedChange={(v) =>
                          updateOption(g.tempKey, o.tempKey, { isAvailable: v })
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-destructive shrink-0"
                        onClick={() => removeOption(g.tempKey, o.tempKey)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => addOption(g.tempKey)}
                  >
                    <Plus className="h-4 w-4 mr-1" /> เพิ่มตัวเลือก
                  </Button>
                </div>
              </Card>
            ))}

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addAddonGroup()}
              >
                <Plus className="h-4 w-4 mr-1" /> เพิ่มกลุ่มใหม่
              </Button>
              <Select
                value=""
                onValueChange={(v) => v && applyTemplate(v)}
                disabled={templates.length === 0}
              >
                <SelectTrigger className="h-9">
                  <SelectValue
                    placeholder={
                      templates.length === 0
                        ? "ยังไม่มีเทมเพลต"
                        : "ใช้กลุ่มที่เคยตั้งไว้"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.options.length} ตัวเลือก)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {addonGroups.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center">
                ไม่ต้องตั้งค่าหากเมนูนี้ไม่มีตัวเลือกเสริม
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">พร้อมขายวันนี้</p>
              <p className="text-xs text-muted-foreground">
                ปิดสวิตช์เพื่อแสดงว่า "หมด" ชั่วคราว
              </p>
            </div>
            <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

