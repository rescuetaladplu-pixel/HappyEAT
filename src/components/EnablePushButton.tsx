import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { requestFcmToken, onForegroundMessage } from "@/lib/firebase-client";
import { registerFcmToken } from "@/lib/fcm.functions";

interface Props {
  restaurantId?: string | null;
}

export function EnablePushButton({ restaurantId }: Props) {
  const [status, setStatus] = useState<"idle" | "granted" | "denied" | "busy">("idle");
  const register = useServerFn(registerFcmToken);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("Notification" in window) {
      if (Notification.permission === "granted") setStatus("granted");
      else if (Notification.permission === "denied") setStatus("denied");
    }
  }, []);

  useEffect(() => {
    if (status !== "granted") return;
    let unsub: (() => void) | undefined;
    (async () => {
      const off = await onForegroundMessage(({ title, body }) => {
        toast.success(title || "แจ้งเตือน", { description: body });
      });
      unsub = typeof off === "function" ? off : undefined;
    })();
    return () => unsub?.();
  }, [status]);

  async function enable() {
    setStatus("busy");
    try {
      const token = await requestFcmToken();
      if (!token) {
        setStatus("denied");
        toast.error("ไม่ได้รับสิทธิ์แจ้งเตือน — กรุณาเปิดในตั้งค่าเบราว์เซอร์");
        return;
      }
      await register({
        data: {
          token,
          restaurantId: restaurantId ?? null,
          userAgent: navigator.userAgent.slice(0, 500),
        },
      });
      setStatus("granted");
      toast.success("เปิดการแจ้งเตือนสำเร็จ!");
    } catch (e) {
      setStatus("idle");
      toast.error(e instanceof Error ? e.message : "เปิดไม่สำเร็จ");
    }
  }

  if (status === "granted") {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <BellRing className="h-4 w-4 text-primary" />
        เปิดแจ้งเตือนแล้ว
      </Button>
    );
  }
  if (status === "denied") {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2 text-muted-foreground">
        <BellOff className="h-4 w-4" />
        ถูกบล็อก — เปิดในตั้งค่าเบราว์เซอร์
      </Button>
    );
  }
  return (
    <Button onClick={enable} size="sm" disabled={status === "busy"} className="gap-2">
      <Bell className="h-4 w-4" />
      {status === "busy" ? "กำลังเปิด..." : "เปิดแจ้งเตือน Push"}
    </Button>
  );
}
