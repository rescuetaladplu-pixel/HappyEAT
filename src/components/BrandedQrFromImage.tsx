import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { Store, Loader2 } from "lucide-react";

interface Props {
  imageUrl: string;
  amount: number;
  restaurantName?: string | null;
  restaurantLogoUrl?: string | null;
  holderName?: string | null;
}

/**
 * โหลดรูป QR ที่ร้านอัปโหลดมา แล้ว detect ตำแหน่ง QR ด้วย jsQR
 * - ถ้าเจอ → decode payload + re-encode เป็น QR ใหม่ในเฟรมแบรนด์ HappyEat (สวย คมชัด)
 * - ถ้าไม่เจอ → fallback crop ตามตำแหน่งที่ detect ได้ หรือใช้รูปเดิม
 */
export function BrandedQrFromImage({
  imageUrl,
  amount,
  restaurantName,
  restaurantLogoUrl,
  holderName,
}: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    setCroppedUrl(null);
    setFailed(false);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      if (cancelled) return;
      const canvas = canvasRef.current ?? document.createElement("canvas");
      const maxSide = 1024;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return setFailed(true);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
      });

      if (code?.data) {
        // Re-encode payload เป็น QR ใหม่ที่คมชัด สวยงาม
        try {
          const url = await QRCode.toDataURL(code.data, {
            width: 512,
            margin: 1,
            errorCorrectionLevel: "M",
          });
          if (!cancelled) setQrDataUrl(url);
          return;
        } catch (e) {
          console.warn("Re-encode QR failed, fallback to crop", e);
        }
      }

      // Fallback: crop ตาม bounding box ของ QR ถ้ามี location
      if (code?.location) {
        const pts = [
          code.location.topLeftCorner,
          code.location.topRightCorner,
          code.location.bottomLeftCorner,
          code.location.bottomRightCorner,
        ];
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const pad = 16;
        const x = Math.max(0, Math.min(...xs) - pad);
        const y = Math.max(0, Math.min(...ys) - pad);
        const w = Math.min(canvas.width - x, Math.max(...xs) - Math.min(...xs) + pad * 2);
        const h = Math.min(canvas.height - y, Math.max(...ys) - Math.min(...ys) + pad * 2);
        const out = document.createElement("canvas");
        out.width = w;
        out.height = h;
        const octx = out.getContext("2d");
        if (octx) {
          octx.fillStyle = "#fff";
          octx.fillRect(0, 0, w, h);
          octx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
          if (!cancelled) setCroppedUrl(out.toDataURL("image/png"));
          return;
        }
      }

      if (!cancelled) setFailed(true);
    };
    img.onerror = () => !cancelled && setFailed(true);
    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const displayUrl = qrDataUrl ?? croppedUrl;

  return (
    <div className="rounded-xl overflow-hidden border-2 border-primary/30 bg-gradient-to-b from-primary/5 to-background">
      {/* Header แบรนด์ + ร้าน */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
        <div className="h-10 w-10 rounded-full bg-background overflow-hidden flex items-center justify-center shrink-0 border-2 border-background/50">
          {restaurantLogoUrl ? (
            <img src={restaurantLogoUrl} alt={restaurantName ?? "ร้าน"} className="w-full h-full object-cover" />
          ) : (
            <Store className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider opacity-80 leading-tight">PromptPay • HappyEat</p>
          <p className="text-sm font-bold truncate leading-tight">{restaurantName ?? "ร้านอาหาร"}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] opacity-80 leading-tight">ยอด</p>
          <p className="text-base font-bold leading-tight">฿{amount.toFixed(2)}</p>
        </div>
      </div>

      {/* QR */}
      <div className="bg-white px-4 py-5 flex flex-col items-center">
        {displayUrl ? (
          <img
            src={displayUrl}
            alt="PromptPay QR"
            className="w-56 h-56 object-contain"
          />
        ) : failed ? (
          // Fallback สุดท้าย: แสดงรูปดิบของร้าน
          <img src={imageUrl} alt="PromptPay QR" className="w-56 h-56 object-contain" />
        ) : (
          <div className="w-56 h-56 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {holderName && (
          <p className="mt-3 text-xs text-muted-foreground">
            ชื่อบัญชี <span className="text-foreground font-medium">{holderName}</span>
          </p>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
