import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface CartItem {
  menuItemId: string;
  restaurantId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

interface CartContextValue {
  items: CartItem[];
  restaurantId: string | null;
  add: (item: Omit<CartItem, "quantity">) => void;
  remove: (menuItemId: string) => void;
  setQty: (menuItemId: string, qty: number) => void;
  clear: () => void;
  total: number;
  count: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);
const STORAGE_KEY = "fooddash_cart_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const restaurantId = items[0]?.restaurantId ?? null;

  function add(item: Omit<CartItem, "quantity">) {
    setItems((prev) => {
      // If from a different restaurant, replace cart
      if (prev.length > 0 && prev[0].restaurantId !== item.restaurantId) {
        return [{ ...item, quantity: 1 }];
      }
      const existing = prev.find((p) => p.menuItemId === item.menuItemId);
      if (existing) {
        return prev.map((p) =>
          p.menuItemId === item.menuItemId ? { ...p, quantity: p.quantity + 1 } : p
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }

  function remove(menuItemId: string) {
    setItems((prev) => prev.filter((p) => p.menuItemId !== menuItemId));
  }

  function setQty(menuItemId: string, qty: number) {
    if (qty <= 0) return remove(menuItemId);
    setItems((prev) => prev.map((p) => (p.menuItemId === menuItemId ? { ...p, quantity: qty } : p)));
  }

  function clear() {
    setItems([]);
  }

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, restaurantId, add, remove, setQty, clear, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
