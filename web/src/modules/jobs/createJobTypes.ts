// ── Stop state ────────────────────────────────────────────────────────────────

export interface StopState {
  id: string;
  collapsed: boolean;
  showOptional: boolean;
  type: "collection" | "delivery";
  locationQuery: string;
  savedLocationId: number | null;
  siteName: string;
  street: string;
  town: string;
  postcode: string;
  country: string;
  lat: string;
  lng: string;
  unitName: string;
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
  referenceNumber: string;
  bookingRequired: boolean;
  bookingRef: string;
  openingHours: string;
  locationType: string;
  instructions: string;
  navigationInstructions: string;
  numPallets: string;
  quantity: string;
  earliestArrival: string;
  unloadingTime: string;
  internalNotes: string;
  // New parity fields (matching PublicRequestForm stop structure)
  stopQuantity: string;
  stopQuantityUnit: string;
  exchangeDropQty: string;
  exchangeCollectQty: string;
  exchangeUnit: string;
  handlingMethods: string[];
  handlingMethodOther: string;
  accessRequirements: string[];
  heightRestrictionValue: string;
  weightRestrictionValue: string;
  lengthRestrictionValue: string;
  ppeItems: string[];
  proofRequirements: string[];
  loadReadiness: string;
  stopNotes: string;
}
