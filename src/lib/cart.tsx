import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface SelectedAddon {
  groupName: string;
  optionName: string;
  priceDelta: number;
}

export interface CartItem {
  lineId: string; // unique per (menuItemId + addons combo)
  menuItemId: string;
  restaurantId: string;
  name: string;
  basePrice: number;
  unitPrice: number; // basePrice + sum(addon.priceDelta)
  quantity: number;
  imageUrl?: string | null;
  addons: SelectedAddon[];
  note?: string | null;
}

interface CartContextValue {
  items: CartItem[];
  restaurantId: string | null;
  add: (item: Omit<CartItem, "quantity" | "lineId" | "unitPrice"> & { quantity?: number }) => void;
  remove: (lineId: string) => void;
  setQty: (lineId: string, qty: number) => void;
  clear: () => void;
  total: number;
  count: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);
const STORAGE_KEY = "fooddash_cart_v2";

function makeLineId(menuItemId: string, addons: SelectedAddon[], note?: string | null) {
  const key =
    menuItemId +
    "|" +
    addons
      .map((a) => `${a.groupName}:${a.optionName}`)
      .sort()
      .join(",") +
    "|" +
    (note ?? "");
  return key;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const restaurantId = items[0]?.restaurantId ?? null;

  function add(input: Omit<CartItem, "quantity" | "lineId" | "unitPrice"> & { quantity?: number }) {
    const addons = input.addons ?? [];
    const unitPrice =
      input.basePrice + addons.reduce((s, a) => s + Number(a.priceDelta || 0), 0);
    const lineId = makeLineId(input.menuItemId, addons, input.note);
    const qty = input.quantity ?? 1;

    setItems((prev) => {
      // If from a different restaurant, replace cart
      if (prev.length > 0 && prev[0].restaurantId !== input.restaurantId) {
        return [
          {
            ...input,
            addons,
            unitPrice,
            lineId,
            quantity: qty,
          },
        ];
      }
      const existing = prev.find((p) => p.lineId === lineId);
      if (existing) {
        return prev.map((p) =>
          p.lineId === lineId ? { ...p, quantity: p.quantity + qty } : p,
        );
      }
      return [...prev, { ...input, addons, unitPrice, lineId, quantity: qty }];
    });
  }

  function remove(lineId: string) {
    setItems((prev) => prev.filter((p) => p.lineId !== lineId));
  }

  function setQty(lineId: string, qty: number) {
    if (qty <= 0) return remove(lineId);
    setItems((prev) =>
      prev.map((p) => (p.lineId === lineId ? { ...p, quantity: qty } : p)),
    );
  }

  function clear() {
    setItems([]);
  }

  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, restaurantId, add, remove, setQty, clear, total, count }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
