import logoSrc from "@/assets/happyeat-logo.png";

type LogoProps = {
  className?: string;
  showText?: boolean;
  size?: number;
};

/**
 * โลโก้แบรนด์ HappyEat — รวมรูป + ข้อความเป็น component เดียว
 * ใช้แทน UtensilsCrossed / placeholder อื่นๆ ทั่วทั้งแอป
 */
export function Logo({ className, showText = false, size = 40 }: LogoProps) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <img
        src={logoSrc}
        alt="HappyEat"
        width={size}
        height={size}
        style={{ objectFit: "contain", display: "block" }}
      />
      {showText && (
        <span className="text-xl font-bold tracking-tight">
          <span style={{ color: "var(--brand-orange)" }}>Happy</span>
          <span style={{ color: "var(--brand-green)" }}>EAT</span>
        </span>
      )}
    </span>
  );
}

export default Logo;
