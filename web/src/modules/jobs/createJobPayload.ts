import type { StopState } from "./createJobTypes";
import { toMins } from "./createJobUtils";

// ── Payload type ──────────────────────────────────────────────────────────────

export interface CreateJobPayload {
  stops: StopState[];
  canSplitShipment: string;
  goodsType: string;
  securingRequirements: string[];
  specialRequirements: string[];
  unit: string;
  unitOther: string;
  materialType: string;
  quantity: string;
  weight: string;
  volume: string;
  adrClass: string;
  loadNotes: string;
  dimensions: string;
  fragile: boolean;
  stackable: boolean;
  tempControlled: boolean;
  tempRange: string;
  photosRequired: boolean;
  weighbridgeRequired: boolean;
  forkliftRequired: boolean;
  tailLiftRequired: boolean;
  craneRequired: boolean;
  loadingMethod: string;
  unloadingMethod: string;
  vehicleClass: string;
  vehicleClassOther: string;
  reqBodyCategory: string;
  reqGvwMin: string;
  reqBodyType: string;
  reqEquipment: string[];
  reqLicenceClass: string;
  reqEndorsements: string[];
  assignedDriverId: number | null;
  customerId: number | null;
  customerName: string;
  plannedDate: string;
  serviceType: string;
  jobType: string;
  jobTitle: string;
  referenceNumber: string;
  customerRef: string;
  purchaseOrderNumber: string;
  priority: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  billingNotes: string;
  customerInstructions: string;
  custRefRequired: boolean;
  poRequired: boolean;
  assignedTruck: string;
  assignedTrailer: string;
  trailerTypesAllowed: string[];
  heightRestriction: string;
  weightRestriction: string;
  lengthRestriction: string;
  vehicleAccessNotes: string;
  requirePOD: boolean;
  failureAction: string;
  assistancePhone: string;
  assistanceNote: string;
  returnDestination: string;
  needsAltAddress: boolean;
  altSavedLocationId: number | null;
  altSiteName: string;
  altStreet: string;
  altTown: string;
  altPostcode: string;
  altCountry: string;
  altLat: string;
  altLng: string;
  altUnitName: string;
  altAddressLine2: string;
  altCountyRegion: string;
  altContactName: string;
  altContactPhone: string;
  altContactEmail: string;
  altNavigationInstructions: string;
  altInstructions: string;
  isEditMode: boolean;
  saveAsTemplate: boolean;
  templateName: string;
  agreedRate: string;
  plannerNotes: string;
}

// ── Builder function ──────────────────────────────────────────────────────────

export function buildBody(params: CreateJobPayload, saveMode: "draft" | "ready_to_plan"): Record<string, unknown> {
  const {
    stops,
    canSplitShipment,
    goodsType,
    securingRequirements,
    specialRequirements,
    unit,
    unitOther,
    materialType,
    quantity,
    weight,
    volume,
    adrClass,
    loadNotes,
    dimensions,
    fragile,
    stackable,
    tempControlled,
    tempRange,
    photosRequired,
    weighbridgeRequired,
    forkliftRequired,
    tailLiftRequired,
    craneRequired,
    loadingMethod,
    unloadingMethod,
    vehicleClass,
    vehicleClassOther,
    reqBodyCategory,
    reqGvwMin,
    reqBodyType,
    reqEquipment,
    reqLicenceClass,
    reqEndorsements,
    assignedDriverId,
    customerId,
    customerName,
    plannedDate,
    serviceType,
    jobType,
    jobTitle,
    referenceNumber,
    customerRef,
    purchaseOrderNumber,
    priority,
    contactName,
    contactPhone,
    contactEmail,
    billingNotes,
    customerInstructions,
    custRefRequired,
    poRequired,
    assignedTruck,
    assignedTrailer,
    trailerTypesAllowed,
    heightRestriction,
    weightRestriction,
    lengthRestriction,
    vehicleAccessNotes,
    requirePOD,
    failureAction,
    assistancePhone,
    assistanceNote,
    returnDestination,
    needsAltAddress,
    altSavedLocationId,
    altSiteName,
    altStreet,
    altTown,
    altPostcode,
    altCountry,
    altLat,
    altLng,
    altUnitName,
    altAddressLine2,
    altCountyRegion,
    altContactName,
    altContactPhone,
    altContactEmail,
    altNavigationInstructions,
    altInstructions,
    isEditMode,
    saveAsTemplate,
    templateName,
    agreedRate,
    plannerNotes,
  } = params;

  const mappedStops = stops.map((stop, i) => {
    const locationTextSnapshot = [stop.siteName, stop.street, stop.town, stop.postcode].filter(Boolean).join(", ");

    const base: Record<string, unknown> = {
      sequenceNumber:        i + 1,
      type:                  stop.type,
      savedLocationId:       stop.savedLocationId,
      siteName:              stop.siteName,
      unitName:              stop.unitName,
      street:                stop.street,
      town:                  stop.town,
      postcode:              stop.postcode,
      country:               stop.country,
      addressLine2:          stop.addressLine2,
      countyRegion:          stop.countyRegion,
      locationTextSnapshot,
      lat:                   stop.lat ? parseFloat(stop.lat) : null,
      lng:                   stop.lng ? parseFloat(stop.lng) : null,
      contactName:           stop.contactName,
      contactPhone:          stop.contactPhone,
      contactEmail:          stop.contactEmail,
      referenceNumber:       stop.referenceNumber,
      instructions:          stop.instructions,
      bookingRequired:       stop.bookingRequired,
      bookingRef:            stop.bookingRef,
      openingHours:          stop.openingHours,
      locationType:          stop.locationType,
      navigationInstructions: stop.navigationInstructions,
      numPallets:            stop.numPallets ? parseInt(stop.numPallets, 10) : null,
      internalNotes:         stop.internalNotes,
      earliestArrivalMinutes: toMins(stop.earliestArrival),
      unloadingAllowanceMinutes: toMins(stop.unloadingTime),
      quantityRequired:      stop.stopQuantity ? parseFloat(stop.stopQuantity) : null,
      quantityUnit:          stop.stopQuantity ? stop.stopQuantityUnit : null,
      exchangeDropQty:       stop.exchangeDropQty ? parseFloat(stop.exchangeDropQty) : null,
      exchangeCollectQty:    stop.exchangeCollectQty ? parseFloat(stop.exchangeCollectQty) : null,
      exchangeUnit:          (stop.exchangeDropQty || stop.exchangeCollectQty) ? stop.exchangeUnit : null,
      handlingMethods:       stop.handlingMethods.length ? stop.handlingMethods : null,
      accessRequirements:    [...stop.accessRequirements, ...stop.ppeItems].length ? [...stop.accessRequirements, ...stop.ppeItems] : null,
      proofRequirements:     stop.proofRequirements.length ? stop.proofRequirements : null,
      loadReadiness:         stop.loadReadiness || null,
      stopNotes:             stop.stopNotes || null,
    };

    if (stop.timeType === "exact" && stop.exactTime) {
      base.bookedTime = `${stop.date}T${stop.exactTime}:00.000Z`;
    } else if (stop.timeType === "window" && stop.windowStart && stop.windowEnd) {
      base.timeWindowStart = `${stop.date}T${stop.windowStart}:00.000Z`;
      base.timeWindowEnd   = `${stop.date}T${stop.windowEnd}:00.000Z`;
    }

    return base;
  });

  const effectiveUnit = unit === "other" ? unitOther : unit;
  const loadDetails = {
    goodsType,
    materialType,
    quantity:           quantity ? parseFloat(quantity) : null,
    unit:               effectiveUnit,
    weight:             weight ? parseFloat(weight) : null,
    volume:             volume ? parseFloat(volume) : null,
    hazardClass:        adrClass,
    notes:              loadNotes,
    dimensions,
    fragile,
    stackable,
    tempControlled,
    tempRange,
    photosRequired,
    weighbridgeRequired,
    forkliftRequired,
    tailLiftRequired,
    craneRequired,
    loadingMethod,
    unloadingMethod,
    securingRequirements: securingRequirements.length ? securingRequirements : null,
    specialRequirements:  specialRequirements.length  ? specialRequirements  : null,
  };

  const vehicleClassRequired = reqBodyCategory || (vehicleClass === "other"
    ? `other: ${vehicleClassOther}`.trim()
    : vehicleClass);

  return {
    saveMode,
    canSplitShipment,
    assignedDriverId:       assignedDriverId ?? undefined,
    customerId,
    customerName,
    plannedDate:            plannedDate || undefined,
    serviceType,
    jobType,
    jobTitle,
    referenceNumber,
    customerRef,
    purchaseOrderNumber,
    priority:               priority as "low" | "normal" | "high",
    bookingContactName:     contactName,
    bookingContactPhone:    contactPhone,
    bookingContactEmail:    contactEmail,
    billingNotes,
    customerInstructions,
    custRefRequired,
    poRequired,
    vehicleClassRequired,
    reqBodyCategory,
    reqGvwMin,
    reqBodyType,
    reqEquipment,
    reqLicenceClass,
    assignedTruck:          assignedTruck.trim(),
    assignedTrailer:        assignedTrailer.trim(),
    trailerTypesAllowed,
    heightRestriction,
    weightRestriction,
    lengthRestriction,
    vehicleAccessNotes,
    requirePOD,
    failureAction,
    assistancePhone:        failureAction === "call_assistance" ? assistancePhone : "",
    assistanceNote:         failureAction === "call_assistance" ? assistanceNote  : "",
    returnDestination:      failureAction === "finish_then_return" ? returnDestination : "",
    altAddress: needsAltAddress ? {
      savedLocationId:      altSavedLocationId,
      siteName:             altSiteName,
      street:               altStreet,
      town:                 altTown,
      postcode:             altPostcode,
      country:              altCountry,
      lat:                  altLat ? parseFloat(altLat) : null,
      lng:                  altLng ? parseFloat(altLng) : null,
      unitName:             altUnitName,
      addressLine2:         altAddressLine2,
      countyRegion:         altCountyRegion,
      contactName:          altContactName,
      contactPhone:         altContactPhone,
      contactEmail:         altContactEmail,
      navigationInstructions: altNavigationInstructions,
      instructions:         altInstructions,
    } : null,
    stops:                  mappedStops,
    loadDetails,
    saveAsTemplate:         !isEditMode && saveAsTemplate,
    templateName:           !isEditMode && saveAsTemplate ? templateName.trim() : undefined,
    agreedRate:             agreedRate ? parseFloat(agreedRate) : undefined,
    plannerNotes:           plannerNotes.trim() || undefined,
  };
}
