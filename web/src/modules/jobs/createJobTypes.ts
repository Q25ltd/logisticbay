// ── Stop state ────────────────────────────────────────────────────────────────

export interface StopState {
  id: string;
  collapsed: boolean;
  showOptional: boolean;
  stopType: "collection" | "delivery";
  locationQuery: string;
  savedLocationId: number | null;
  siteName: string;
  street: string;
  town: string;
  postcode: string;
  country: string;
  lat: string;
  lng: string;
  unitBuilding: string;
  addressLine2: string;
  countyRegion: string;
  date: string;
  timeType: "exact" | "window" | "anytime";
  exactTime: string;
  windowStart: string;
  windowEnd: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  refNumber: string;
  bookingRequired: boolean;
  bookingRef: string;
  openingHours: string;
  locationType: string;
  driverNotes: string;
  navigationInstructions: string;
  numPallets: string;
  quantity: string;
  earliestArrival: string;
  unloadingTime: string;
  internalNotes: string;
}
