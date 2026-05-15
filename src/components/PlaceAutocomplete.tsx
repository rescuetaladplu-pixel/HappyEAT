import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Search } from "lucide-react";
import { placesAutocomplete, placeDetails } from "@/lib/places.functions";

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
}

function newSessionToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function PlaceAutocomplete({ onSelect, placeholder, id }: Props) {
  const autocomplete = useServerFn(placesAutocomplete);
  const details = useServerFn(placeDetails);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const sessionRef = useRef<string>(newSessionToken());
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
        const res = await autocomplete({
          data: { input: q, sessionToken: sessionRef.current },
        });
        if (myReq !== reqIdRef.current) return;
        setSuggestions(res.results);
        setOpen(true);
      } catch {
        if (myReq !== reqIdRef.current) return;
        setSuggestions([]);
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, autocomplete]);

  async function pick(s: Suggestion) {
    setOpen(false);
    setFetchingDetails(true);
    try {
      const d = await details({
        data: { placeId: s.placeId, sessionToken: sessionRef.current },
      });
      onSelect({
        address: d.address || `${s.mainText} ${s.secondaryText}`.trim(),
        name: d.name || s.mainText,
        lat: d.lat,
        lng: d.lng,
      });
      setQuery(d.address || s.mainText);
      // start new session after a selection per Places API billing model
      sessionRef.current = newSessionToken();
    } catch {
      onSelect({
        address: `${s.mainText} ${s.secondaryText}`.trim(),
        name: s.mainText,
        lat: null,
        lng: null,
      });
    } finally {
      setFetchingDetails(false);
    }
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
        {(loading || fetchingDetails) && (
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
