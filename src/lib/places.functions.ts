import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!mapsKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": mapsKey,
    "Content-Type": "application/json",
  };
}

const AutocompleteInput = z.object({
  input: z.string().min(1).max(200),
  sessionToken: z.string().min(1).max(100).optional(),
});

export const placesAutocomplete = createServerFn({ method: "POST" })
  .inputValidator((d) => AutocompleteInput.parse(d))
  .handler(async ({ data }) => {
    const res = await fetch(`${GATEWAY_URL}/places/v1/places:autocomplete`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        input: data.input,
        languageCode: "th",
        regionCode: "TH",
        includedRegionCodes: ["th"],
        sessionToken: data.sessionToken,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`Places autocomplete failed [${res.status}]: ${JSON.stringify(json)}`);
    }
    type Suggestion = {
      placePrediction?: {
        placeId: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    };
    const suggestions = (json.suggestions ?? []) as Suggestion[];
    return {
      results: suggestions
        .filter((s) => s.placePrediction)
        .map((s) => ({
          placeId: s.placePrediction!.placeId,
          mainText:
            s.placePrediction!.structuredFormat?.mainText?.text ??
            s.placePrediction!.text?.text ??
            "",
          secondaryText: s.placePrediction!.structuredFormat?.secondaryText?.text ?? "",
        })),
    };
  });

const DetailsInput = z.object({
  placeId: z.string().min(1).max(200),
  sessionToken: z.string().min(1).max(100).optional(),
});

export const placeDetails = createServerFn({ method: "POST" })
  .inputValidator((d) => DetailsInput.parse(d))
  .handler(async ({ data }) => {
    const url = new URL(`${GATEWAY_URL}/places/v1/places/${encodeURIComponent(data.placeId)}`);
    if (data.sessionToken) url.searchParams.set("sessionToken", data.sessionToken);
    url.searchParams.set("languageCode", "th");
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        ...authHeaders(),
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
      },
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`Place details failed [${res.status}]: ${JSON.stringify(json)}`);
    }
    return {
      placeId: json.id as string,
      name: (json.displayName?.text ?? "") as string,
      address: (json.formattedAddress ?? "") as string,
      lat: (json.location?.latitude ?? null) as number | null,
      lng: (json.location?.longitude ?? null) as number | null,
    };
  });
