import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Search } from "lucide-react";

export interface PlaceSelection {
  address: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

interface Props {
  onSelect: (p: PlaceSelection) => void;
  placeholder?: string;
  id?: string;
}

interface Suggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  lat: number;
  lng: number;
  displayName: string;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  address?: Record<string, string>;
}

export function PlaceAutocomplete({ onSelect, placeholder, id }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", q);
        url.searchParams.set("format", "json");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "8");
        url.searchParams.set("countrycodes", "th");
        url.searchParams.set("accept-language", "th");
        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
        });
        const json = (await res.json()) as NominatimResult[];
        if (myReq !== reqIdRef.current) return;
        const mapped: Suggestion[] = json.map((r) => {
          const main = r.name || r.display_name.split(",")[0];
          const secondary = r.display_name
            .split(",")
            .slice(1)
            .join(",")
            .trim();
          return {
            placeId: String(r.place_id),
            mainText: main,
            secondaryText: secondary,
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
            displayName: r.display_name,
          };
        });
        setSuggestions(mapped);
        setOpen(true);
      } catch {
        if (myReq !== reqIdRef.current) return;
        setSuggestions([]);
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  function pick(s: Suggestion) {
    setOpen(false);
    onSelect({
      address: s.displayName,
      name: s.mainText,
      lat: s.lat,
      lng: s.lng,
    });
    setQuery(s.displayName);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          value={query}
          placeholder={placeholder ?? "ค้นหาสถานที่ เช่น โรงแรม, ห้าง, ชื่ออาคาร"}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
          className="pl-9 pr-9"
        />
        {loading && (
          <Loader2 className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-72 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              className="w-full text-left px-3 py-2 hover:bg-accent flex items-start gap-2 border-b last:border-b-0"
            >
              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{s.mainText}</p>
                {s.secondaryText && (
                  <p className="text-xs text-muted-foreground truncate">{s.secondaryText}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
