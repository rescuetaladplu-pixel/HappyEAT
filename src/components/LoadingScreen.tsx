import logoSrc from "@/assets/happyeat-logo.png";

type LoadingScreenProps = {
  label?: string;
  fullScreen?: boolean;
};

/**
 * หน้าโหลดดิ้งมาตรฐานของแอป — โลโก้ HappyEAT + วงกลมหมุน
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
      <img
        src={logoSrc}
        alt="HappyEAT"
        className="h-32 w-auto object-contain animate-pulse"
      />
      <div
        className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin"
        role="status"
        aria-label={label}
      />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export default LoadingScreen;
