import { useEffect, useState, lazy, Suspense } from "react";

const InnerMap = lazy(() => import("./LocationPickerInner"));

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

export function LocationPicker(props: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="h-72 w-full rounded-lg border border-border bg-muted flex items-center justify-center text-sm text-muted-foreground">
        กำลังโหลดแผนที่...
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="h-72 w-full rounded-lg border border-border bg-muted flex items-center justify-center text-sm text-muted-foreground">
          กำลังโหลดแผนที่...
        </div>
      }
    >
      <InnerMap {...props} />
    </Suspense>
  );
}
