import { useEffect, useRef, useState, ChangeEvent } from "react";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Upload, QrCode, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { sendStatusPush } from "@/lib/fcm.functions";

interface Props {
  orderId: string;
  amount: number;
  promptpayId: string;
  holderName: string | null;
  restaurantOwnerId: string;
  onSubmitted: () => void;
}

export function PaymentPanel({
  orderId,
  amount,
  promptpayId,
  holderName,
  restaurantOwnerId,
  onSubmitted,
}: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const payload = generatePayload(promptpayId, { amount });
      QRCode.toDataURL(payload, { width: 320, margin: 1 }).then(setQrDataUrl);
    } catch (e) {
      console.error("QR generation failed", e);
    }
  }, [promptpayId, amount]);

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

  function copyId() {
    navigator.clipboard.writeText(promptpayId);
    toast.success("คัดลอกแล้ว");
  }

  return (
    <Card className="p-4 space-y-3 border-primary/40">
      <div className="flex items-center gap-2">
        <QrCode className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">ชำระเงินด้วย PromptPay</h3>
      </div>

      {qrDataUrl ? (
        <div className="flex flex-col items-center bg-white rounded-lg p-3">
          <img src={qrDataUrl} alt="PromptPay QR" className="w-56 h-56" />
        </div>
      ) : (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      <div className="text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">ยอดที่ต้องโอน</span>
          <span className="font-semibold text-primary text-lg">฿{amount.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">PromptPay</span>
          <button onClick={copyId} className="flex items-center gap-1 font-mono">
            {promptpayId} <Copy className="h-3 w-3" />
          </button>
        </div>
        {holderName && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">ชื่อบัญชี</span>
            <span>{holderName}</span>
          </div>
        )}
      </div>

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
