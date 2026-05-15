import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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
  const [addonsForItem, setAddonsForItem] = useState<MenuItem | null>(null);

  async function load() {
    if (!user) return;
    const { data: r } = await supabase
      .from("restaurants")
      .select("id, name")
      .eq("owner_id", user.id)
      .maybeSingle();
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
              onAddons={setAddonsForItem}
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

      {addonsForItem && (
        <AddonsDialog
          menuItem={addonsForItem}
          onClose={() => setAddonsForItem(null)}
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
  onAddons,
  onChange,
}: {
  items: MenuItem[];
  categories: Category[];
  onEdit: (it: MenuItem) => void;
  onAddons: (it: MenuItem) => void;
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
                    <Button size="sm" variant="outline" onClick={() => onAddons(it)}>
                      ตัวเลือกเสริม
                    </Button>
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
  const [price, setPrice] = useState(String(item.price ?? ""));
  const [imageUrl, setImageUrl] = useState<string | null>(item.image_url);
  const [categoryId, setCategoryId] = useState<string | null>(item.category_id);
  const [isAvailable, setIsAvailable] = useState(item.is_available);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function save() {
    if (!name.trim()) return toast.error("กรุณาใส่ชื่อเมนู");
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return toast.error("ราคาไม่ถูกต้อง");
    setSaving(true);
    const payload = {
      restaurant_id: restaurantId,
      name: name.trim(),
      description: description.trim() || null,
      price: priceNum,
      image_url: imageUrl,
      category_id: categoryId,
      is_available: isAvailable,
    };
    const { error } = isNew
      ? await supabase.from("menu_items").insert(payload)
      : await supabase.from("menu_items").update(payload).eq("id", item.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isNew ? "เพิ่มเมนูแล้ว" : "บันทึกแล้ว");
    onSaved();
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

/* ----------------------- Add-ons dialog ----------------------- */

function AddonsDialog({
  menuItem,
  onClose,
}: {
  menuItem: MenuItem;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<AddonGroup[]>([]);
  const [optionsMap, setOptionsMap] = useState<Record<string, AddonOption[]>>({});
  const [loading, setLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState("");

  async function load() {
    const { data: g } = await supabase
      .from("menu_addon_groups")
      .select("*")
      .eq("menu_item_id", menuItem.id)
      .order("sort_order");
    const groupList = (g ?? []) as AddonGroup[];
    setGroups(groupList);
    if (groupList.length > 0) {
      const { data: o } = await supabase
        .from("menu_addon_options")
        .select("*")
        .in("group_id", groupList.map((x) => x.id))
        .order("sort_order");
      const map: Record<string, AddonOption[]> = {};
      for (const opt of (o ?? []) as AddonOption[]) {
        (map[opt.group_id] ??= []).push(opt);
      }
      setOptionsMap(map);
    } else {
      setOptionsMap({});
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuItem.id]);

  async function addGroup() {
    if (!newGroupName.trim()) return;
    const { error } = await supabase.from("menu_addon_groups").insert({
      menu_item_id: menuItem.id,
      name: newGroupName.trim(),
      sort_order: groups.length,
    });
    if (error) return toast.error(error.message);
    setNewGroupName("");
    load();
  }

  async function updateGroup(g: AddonGroup, patch: Partial<AddonGroup>) {
    const { error } = await supabase
      .from("menu_addon_groups")
      .update(patch)
      .eq("id", g.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function removeGroup(id: string) {
    if (!confirm("ลบกลุ่มนี้และตัวเลือกทั้งหมด?")) return;
    await supabase.from("menu_addon_groups").delete().eq("id", id);
    load();
  }

  async function addOption(groupId: string) {
    const opts = optionsMap[groupId] ?? [];
    const { error } = await supabase.from("menu_addon_options").insert({
      group_id: groupId,
      name: "ตัวเลือกใหม่",
      price_delta: 0,
      sort_order: opts.length,
    });
    if (error) return toast.error(error.message);
    load();
  }

  async function updateOption(opt: AddonOption, patch: Partial<AddonOption>) {
    const { error } = await supabase
      .from("menu_addon_options")
      .update(patch)
      .eq("id", opt.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function removeOption(id: string) {
    await supabase.from("menu_addon_options").delete().eq("id", id);
    load();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ตัวเลือกเสริม — {menuItem.name}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder='เช่น "ระดับความเผ็ด", "ขนาด"'
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addGroup()}
              />
              <Button onClick={addGroup}>
                <Plus className="h-4 w-4 mr-1" /> เพิ่มกลุ่ม
              </Button>
            </div>

            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                ยังไม่มีกลุ่มตัวเลือก
              </p>
            )}

            {groups.map((g) => (
              <Card key={g.id} className="p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <Input
                    defaultValue={g.name}
                    onBlur={(e) =>
                      e.target.value !== g.name && updateGroup(g, { name: e.target.value })
                    }
                    className="font-medium"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => removeGroup(g.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={g.pricing_mode === "variant"}
                    onCheckedChange={(v) =>
                      updateGroup(
                        g,
                        v
                          ? {
                              pricing_mode: "variant",
                              is_required: true,
                              min_select: 1,
                              max_select: 1,
                            }
                          : { pricing_mode: "addon" },
                      )
                    }
                  />
                  เป็นตัวเลือกขนาด/ประเภท (ราคาทดแทนราคาเมนู)
                </label>

                {g.pricing_mode !== "variant" && (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={g.is_required}
                        onCheckedChange={(v) => updateGroup(g, { is_required: v })}
                      />
                      บังคับเลือก
                    </label>
                    <div className="flex items-center gap-1">
                      <span>ขั้นต่ำ</span>
                      <Input
                        type="number"
                        min={0}
                        defaultValue={g.min_select}
                        onBlur={(e) =>
                          updateGroup(g, { min_select: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className="h-8"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span>สูงสุด</span>
                      <Input
                        type="number"
                        min={1}
                        defaultValue={g.max_select}
                        onBlur={(e) =>
                          updateGroup(g, { max_select: Math.max(1, Number(e.target.value) || 1) })
                        }
                        className="h-8"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {(optionsMap[g.id] ?? []).map((opt) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <Input
                        defaultValue={opt.name}
                        onBlur={(e) =>
                          e.target.value !== opt.name &&
                          updateOption(opt, { name: e.target.value })
                        }
                        placeholder="ชื่อ"
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        defaultValue={opt.price_delta}
                        onBlur={(e) =>
                          updateOption(opt, { price_delta: Number(e.target.value) || 0 })
                        }
                        placeholder="+ราคา"
                        className="w-24"
                      />
                      <Switch
                        checked={opt.is_available}
                        onCheckedChange={(v) => updateOption(opt, { is_available: v })}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => removeOption(opt.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => addOption(g.id)}
                  >
                    <Plus className="h-4 w-4 mr-1" /> เพิ่มตัวเลือก
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>เสร็จสิ้น</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
