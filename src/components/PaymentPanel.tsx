import { useEffect, useRef, useState, ChangeEvent } from "react";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, QrCode, Copy, CheckCircle2, AlertTriangle, Store } from "lucide-react";
import { toast } from "sonner";
import { sendStatusPush } from "@/lib/fcm.functions";
import { BrandedQrFromImage } from "@/components/BrandedQrFromImage";

interface Props {
  orderId: string;
  amount: number;
  /** 'id' = generate QR from PromptPay number; 'qr_image' = use restaurant-uploaded QR image */
  mode?: "id" | "qr_image";
  /** Required when mode = 'id' */
  promptpayId?: string | null;
  /** Required when mode = 'qr_image' */
  qrImageUrl?: string | null;
  holderName: string | null;
  restaurantName?: string | null;
  restaurantLogoUrl?: string | null;
  restaurantOwnerId: string;
  onSubmitted: () => void;
}

export function PaymentPanel({
  orderId,
  amount,
  mode = "id",
  promptpayId,
  qrImageUrl,
  holderName,
  restaurantName,
  restaurantLogoUrl,
  restaurantOwnerId,
  onSubmitted,
}: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== "id" || !promptpayId) return;
    try {
      const payload = generatePayload(promptpayId, { amount });
      QRCode.toDataURL(payload, { width: 320, margin: 1 }).then(setQrDataUrl);
    } catch (e) {
      console.error("QR generation failed", e);
    }
  }, [promptpayId, amount, mode]);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error("ไฟล์ใหญ่เกิน 5MB");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submitSlip() {
    if (!file) return toast.error("กรุณาเลือกสลิป");
    setSubmitting(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${orderId}/slip-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("payment-slips")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (upErr) {
      setSubmitting(false);
      return toast.error(upErr.message);
    }
    const { error: updErr } = await supabase
      .from("orders")
      .update({
        payment_slip_url: path,
        payment_submitted_at: new Date().toISOString(),
        status: "awaiting_payment_confirm",
      })
      .eq("id", orderId);
    setSubmitting(false);
    if (updErr) return toast.error(updErr.message);

    toast.success("ส่งสลิปแล้ว รอร้านยืนยัน");
    sendStatusPush({
      data: {
        targetUserId: restaurantOwnerId,
        title: "💰 ลูกค้าส่งสลิปแล้ว",
        body: `ออเดอร์ #${orderId.slice(0, 8)} — ฿${amount.toFixed(0)} กรุณาตรวจสลิป`,
        url: "/restaurant/orders",
        tag: `slip-${orderId}`,
      },
    }).catch(() => {});
    onSubmitted();
  }

  function copyAmount() {
    navigator.clipboard.writeText(amount.toFixed(2));
    toast.success("คัดลอกยอดเงินแล้ว");
  }

  function copyId() {
    if (!promptpayId) return;
    navigator.clipboard.writeText(promptpayId);
    toast.success("คัดลอกแล้ว");
  }

  const isImageMode = mode === "qr_image";

  return (
    <Card className="p-4 space-y-3 border-primary/40 overflow-hidden">
      <div className="flex items-center gap-2">
        <QrCode className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">ชำระเงินด้วย PromptPay</h3>
      </div>

      {/* Restaurant header — เน้นว่าโอนตรงให้ร้าน ไม่ผ่านแพลตฟอร์ม */}
      {(restaurantName || restaurantLogoUrl) && (
        <div className="flex items-center gap-2 bg-secondary/40 rounded-lg p-2">
          <div className="h-9 w-9 rounded-full bg-background overflow-hidden flex items-center justify-center shrink-0">
            {restaurantLogoUrl ? (
              <img src={restaurantLogoUrl} alt={restaurantName ?? "ร้าน"} className="w-full h-full object-cover" />
            ) : (
              <Store className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-tight">ชำระโดยตรงให้กับร้าน</p>
            <p className="text-sm font-semibold truncate">{restaurantName ?? "—"}</p>
          </div>
        </div>
      )}

      {/* QR display */}
      {isImageMode ? (
        qrImageUrl ? (
          <BrandedQrFromImage
            imageUrl={qrImageUrl}
            amount={amount}
            restaurantName={restaurantName}
            restaurantLogoUrl={restaurantLogoUrl}
            holderName={holderName}
          />
        ) : (
          <div className="text-center text-sm text-destructive py-6">ร้านยังไม่ได้อัปโหลด QR</div>
        )
      ) : qrDataUrl ? (
        <div className="flex flex-col items-center bg-white rounded-lg p-3">
          <img src={qrDataUrl} alt="PromptPay QR" className="w-56 h-56" />
        </div>
      ) : (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {/* Amount — big and clear, with copy */}
      <button
        onClick={copyAmount}
        className="w-full bg-primary/10 border border-primary/30 rounded-lg p-3 flex items-center justify-between hover:bg-primary/15 transition"
      >
        <span className="text-sm text-muted-foreground">ยอดที่ต้องโอน</span>
        <span className="flex items-center gap-2 text-2xl font-bold text-primary">
          ฿{amount.toFixed(2)} <Copy className="h-4 w-4 opacity-60" />
        </span>
      </button>

      {/* Notice — แตกต่างชัดเจนระหว่าง 2 โหมด */}
      {isImageMode ? (
        <div className="flex gap-2 bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-400 dark:border-amber-600 rounded-lg p-3 text-sm text-amber-900 dark:text-amber-100">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">⚠️ ต้องพิมพ์ยอดเงินเอง</p>
            <p className="text-xs leading-relaxed">
              QR นี้เป็นรูปภาพคงที่ <b>ไม่มียอดเงินฝังอยู่</b> — โปรดพิมพ์ยอด{" "}
              <b className="text-base">฿{amount.toFixed(2)}</b>{" "}
              ในแอปธนาคารด้วยตนเองก่อนกดโอน
            </p>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 bg-green-50 dark:bg-green-950/30 border-2 border-green-400 dark:border-green-600 rounded-lg p-3 text-sm text-green-900 dark:text-green-100">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">✓ ยอดเงินถูกฝังใน QR แล้ว</p>
            <p className="text-xs leading-relaxed">
              สแกน QR แล้วแอปธนาคารจะ <b>กรอกยอด ฿{amount.toFixed(2)} ให้อัตโนมัติ</b> — ไม่ต้องพิมพ์เอง
            </p>
          </div>
        </div>
      )}

      {/* PromptPay number row for id mode */}
      {!isImageMode && promptpayId && (
        <div className="text-sm flex items-center justify-between">
          <span className="text-muted-foreground">PromptPay</span>
          <button onClick={copyId} className="flex items-center gap-1 font-mono">
            {promptpayId} <Copy className="h-3 w-3" />
          </button>
        </div>
      )}

      {holderName && (
        <div className="text-sm flex justify-between">
          <span className="text-muted-foreground">ชื่อบัญชี</span>
          <span>{holderName}</span>
        </div>
      )}

      <div className="border-t pt-3 space-y-2">
        <p className="text-sm font-medium">อัปโหลดสลิปการโอน</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
        />
        {preview ? (
          <div className="space-y-2">
            <img src={preview} alt="slip" className="w-full max-h-72 object-contain rounded border" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="w-full">
              เลือกไฟล์ใหม่
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => fileRef.current?.click()} className="w-full">
            <Upload className="h-4 w-4 mr-2" /> เลือกรูปสลิป
          </Button>
        )}
        <Button onClick={submitSlip} disabled={!file || submitting} className="w-full">
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          ส่งสลิปให้ร้าน
        </Button>
      </div>
    </Card>
  );
}
