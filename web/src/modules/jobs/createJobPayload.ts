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
  // Driver instructions (notesData blob)
  driverNoteChips: string[];
  driverVisibleNotes: string;
  safetyInstructions: string;
  // Rejection & return policy (exceptionPolicyData blob)
  rejectionAction: string;
  alternativeReturnAddress: string;
  alternativeReturnPostcode: string;
  alternativeReturnContactName: string;
  alternativeReturnContactPhone: string;
  approvalContactName: string;
  approvalContactPhone: string;
  photosRequiredOnRejection: boolean;
  rejectionSignatureRequired: boolean;
  rejectionNotes: string;
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
    dimensions,
    fragile,
    stackable,
    tempControlled,
    tempRange,
    photosRequired,
    weighbridgeRequired,
    reqBodyCategory,
    reqGvwMin,
    reqBodyType,
    reqEquipment,
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
    trailerTypesAllowed,
    heightRestriction,
    weightRestriction,
    lengthRestriction,
    vehicleAccessNotes,
    requirePOD,
    assistancePhone,
    assistanceNote,
    needsAltAddress,
    altStreet,
    altTown,
    altPostcode,
    altContactName,
    altContactPhone,
    isEditMode,
    saveAsTemplate,
    templateName,
    agreedRate,
    plannerNotes,
    driverNoteChips,
    driverVisibleNotes,
    safetyInstructions,
    rejectionAction,
    alternativeReturnAddress,
    alternativeReturnPostcode,
    alternativeReturnContactName,
    alternativeReturnContactPhone,
    approvalContactName,
    approvalContactPhone,
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
      handlingMethods:       stop.handlingMethods.length
        ? stop.handlingMethods.map(m => m === "other" && stop.handlingMethodOther?.trim() ? `other: ${stop.handlingMethodOther.trim()}` : m)
        : null,
      accessRequirements:    [...stop.accessRequirements, ...stop.ppeItems].length ? [...stop.accessRequirements, ...stop.ppeItems] : null,
      heightRestriction:     stop.heightRestrictionValue || null,
      weightRestriction:     stop.weightRestrictionValue || null,
      lengthRestriction:     stop.lengthRestrictionValue || null,
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

  return {
    saveMode,
    canSplitShipment,
    customerId,
    customerName,
    plannedDate:            plannedDate || undefined,
    serviceType,
    jobType,
    jobTitle,
    referenceNumber,
    customerRef,
    purchaseOrderNumber,
    priority:               priority as "low" | "normal" | "high" | "urgent",
    bookingContactName:     contactName,
    bookingContactPhone:    contactPhone,
    bookingContactEmail:    contactEmail,
    billingNotes,
    customerInstructions,
    custRefRequired,
    poRequired,
    // Load fields — flat canonical names
    goodsDescription:       materialType.trim() || undefined,
    goodsType:              goodsType || undefined,
    quantity:               quantity ? parseFloat(quantity) : undefined,
    quantityUnit:           effectiveUnit || undefined,
    weight:                 weight ? parseFloat(weight) : undefined,
    volume:                 volume ? parseFloat(volume) : undefined,
    dimensions:             dimensions || undefined,
    fragile,
    stackable,
    tempControlled,
    tempRange:              tempRange || undefined,
    hazardClass:            adrClass || undefined,
    photosRequired,
    weighbridgeRequired,
    securingRequirements:   securingRequirements.length ? securingRequirements : undefined,
    specialRequirements:    specialRequirements.length  ? specialRequirements  : undefined,
    // Vehicle requirement fields — flat canonical names
    vehicleCategory:        reqBodyCategory || undefined,
    bodyTypes:              reqBodyType ? [reqBodyType] : undefined,
    minGvwClass:            reqGvwMin || undefined,
    equipment:              reqEquipment.length ? reqEquipment : undefined,
    trailersAllowed:        trailerTypesAllowed.length ? trailerTypesAllowed : undefined,
    heightRestriction,
    weightRestriction,
    lengthRestriction,
    vehicleAccessNotes,
    requirePOD,
    // Driver instructions — flat canonical names
    driverNoteChips:        driverNoteChips.length ? driverNoteChips : undefined,
    driverVisibleNotes:     driverVisibleNotes.trim() || undefined,
    safetyInstructions:     safetyInstructions.trim() || undefined,
    // Exception / return policy — flat canonical names
    failureAction:          rejectionAction || undefined,
    assistancePhone:        rejectionAction === "call_assistance" ? assistancePhone : undefined,
    assistanceNote:         rejectionAction === "call_assistance" ? assistanceNote  : undefined,
    alternativeReturnAddress: needsAltAddress
      ? ([altStreet, altTown].filter(Boolean).join(", ") || undefined)
      : (alternativeReturnAddress.trim() || undefined),
    alternativeReturnPostcode:     needsAltAddress ? (altPostcode.trim() || undefined)     : (alternativeReturnPostcode.trim() || undefined),
    alternativeReturnContactName:  needsAltAddress ? (altContactName.trim() || undefined)  : (alternativeReturnContactName.trim() || undefined),
    alternativeReturnContactPhone: needsAltAddress ? (altContactPhone.trim() || undefined) : (alternativeReturnContactPhone.trim() || undefined),
    approvalContactName:           approvalContactName.trim() || undefined,
    approvalContactPhone:          approvalContactPhone.trim() || undefined,
    stops:                  mappedStops,
    saveAsTemplate:         !isEditMode && saveAsTemplate,
    templateName:           !isEditMode && saveAsTemplate ? templateName.trim() : undefined,
    agreedRate:             agreedRate ? parseFloat(agreedRate) : undefined,
    plannerNotes:           plannerNotes.trim() || undefined,
  };
}
