import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, Star, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/restaurants/$restaurantId")({
  component: RestaurantDetail,
});

interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  rating: number;
  delivery_fee: number;
  is_open: boolean;
  address: string | null;
}
interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  category: string | null;
}

function RestaurantDetail() {
  const { restaurantId } = Route.useParams();
  const navigate = useNavigate();
  const { add, count, restaurantId: cartRestaurantId } = useCart();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: r }, { data: m }] = await Promise.all([
        supabase.from("restaurants").select("*").eq("id", restaurantId).maybeSingle(),
        supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId).order("category"),
      ]);
      setRestaurant(r as Restaurant | null);
      setItems((m ?? []) as MenuItem[]);
      setLoading(false);
    }
    load();
  }, [restaurantId]);

  function handleAdd(item: MenuItem) {
    if (cartRestaurantId && cartRestaurantId !== restaurantId) {
      const ok = confirm("ตะกร้ามีอาหารจากร้านอื่นอยู่ ต้องการล้างและเริ่มใหม่?");
      if (!ok) return;
    }
    add({
      menuItemId: item.id,
      restaurantId: restaurantId,
      name: item.name,
      price: Number(item.price),
      imageUrl: item.image_url,
    });
    toast.success(`เพิ่ม ${item.name} ลงตะกร้าแล้ว`);
  }

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

  return (
    <main className="max-w-2xl mx-auto pb-24">
      <div className="relative aspect-[2/1] bg-gradient-to-br from-accent to-secondary">
        {restaurant.image_url ? (
          <img src={restaurant.image_url} alt={restaurant.name} className="w-full h-full object-cover" />
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
        </div>
      </div>

      <section className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">เมนู</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">ยังไม่มีเมนูในร้านนี้</p>
        ) : (
          items.map((item) => (
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
                <h3 className="font-medium">{item.name}</h3>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                )}
                <p className="text-primary font-semibold mt-1">฿{Number(item.price).toFixed(0)}</p>
              </div>
              <Button
                size="icon"
                onClick={() => handleAdd(item)}
                disabled={!item.is_available || !restaurant.is_open}
                className="rounded-full"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </Card>
          ))
        )}
      </section>

      {count > 0 && (
        <div className="fixed bottom-20 inset-x-0 px-4 z-30">
          <div className="max-w-2xl mx-auto">
            <Button asChild size="lg" className="w-full shadow-lg">
              <Link to="/cart">ดูตะกร้า ({count} รายการ)</Link>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
