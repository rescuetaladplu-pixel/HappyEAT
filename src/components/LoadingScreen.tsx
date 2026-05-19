import logoSrc from "@/assets/happyeat-logo.png";

type LoadingScreenProps = {
  label?: string;
  fullScreen?: boolean;
};

/**
 * หน้าโหลดดิ้งมาตรฐานของแอป — โลโก้ HappyEat อยู่ตรงกลาง
 * ล้อมด้วยวงแหวนหมุนสีส้ม/เขียว (แบบเดียวกับฝั่งไรเดอร์)
 */
export function LoadingScreen({ label = "กำลังโหลด...", fullScreen = true }: LoadingScreenProps) {
  return (
    <div
      className={
        fullScreen
          ? "fixed inset-x-0 top-0 bottom-0 z-50 flex flex-col items-center justify-center gap-6 bg-background safe-top safe-bottom"
          : "flex flex-col items-center justify-center gap-6 py-16"
      }
    >
      <div className="relative h-48 w-48 flex items-center justify-center">
        {/* วงแหวนพื้นหลังจางๆ */}
        <div className="absolute inset-0 rounded-full border-[6px] border-muted/40" />

        {/* วงแหวนหมุน — gradient ส้ม → เขียว ผ่าน conic-gradient + mask */}
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, var(--brand-orange) 90deg, var(--brand-green) 270deg, transparent 360deg)",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px))",
            animationDuration: "1.4s",
          }}
          role="status"
          aria-label={label}
        />

        {/* โลโก้ตรงกลาง */}
        <img
          src={logoSrc}
          alt="HappyEat"
          className="relative h-28 w-28 object-contain"
        />
      </div>

      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export default LoadingScreen;
