import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BoostOrder {
  id: string;
  delivery_fee: number;
}

export function BoostDeliveryFeeCard({
  order,
  onBoosted,
}: {
  order: BoostOrder;
  onBoosted: () => void;
}) {
  const [amount, setAmount] = useState(10);
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    setSubmitting(true);
    try {
      const { boostDeliveryFee } = await import("@/lib/dispatch.functions");
      const res = await boostDeliveryFee({ data: { orderId: order.id, amount } });
      if (res.ok) {
        toast.success(`เพิ่มค่าส่ง ฿${amount} แล้ว — กำลังเชิญไรเดอร์ใหม่`);
        onBoosted();
      } else {
        toast.error("ไม่สามารถเพิ่มค่าส่งได้ (อาจมีไรเดอร์รับงานไปแล้ว)");
        onBoosted();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "เพิ่มค่าส่งไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2 text-sm">
      <p className="font-medium text-amber-900">
        🛵 ตอนนี้ไรเดอร์ใกล้คุณยังไม่ว่างเลย
      </p>
      <p className="text-xs text-amber-800 leading-relaxed">
        ลองเพิ่มค่าส่งสักนิดเพื่อเป็นกำลังใจให้ไรเดอร์ที่อยู่ไกลขึ้นมารับงานนะคะ —
        ค่าส่งที่เพิ่มจะส่งตรงให้ไรเดอร์ตอนรับของ ไม่ผ่านระบบของเรา
      </p>
      <p className="text-xs text-muted-foreground">
        ค่าส่งปัจจุบัน: ฿{Number(order.delivery_fee).toFixed(0)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2"
          disabled={amount <= 10 || submitting}
          onClick={() => setAmount((a) => Math.max(10, a - 10))}
        >
          −
        </Button>
        <span className="font-semibold text-amber-900 min-w-[60px] text-center">
          +฿{amount}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2"
          disabled={amount >= 100 || submitting}
          onClick={() => setAmount((a) => Math.min(100, a + 10))}
        >
          +
        </Button>
        <Button
          size="sm"
          className="ml-auto bg-amber-600 hover:bg-amber-700"
          disabled={submitting}
          onClick={confirm}
        >
          {submitting ? "..." : `ยืนยันเพิ่ม ฿${amount}`}
        </Button>
      </div>
    </div>
  );
}
