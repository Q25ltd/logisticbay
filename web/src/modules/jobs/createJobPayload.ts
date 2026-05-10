import type { StopState } from "./createJobTypes";
import { toMins } from "./createJobUtils";

// ── Payload type ──────────────────────────────────────────────────────────────

export interface CreateJobPayload {
  stops: StopState[];
  qtyUnit: string;
  qtyUnitOther: string;
  materialDesc: string;
  totalQty: string;
  totalWeight: string;
  volume: string;
  adrClass: string;
  loadNotes: string;
  dimensions: string;
  fragile: boolean;
  stackable: boolean;
  tempControlled: boolean;
  tempRange: string;
  photosRequired: boolean;
  weighbridgeReq: boolean;
  forkliftReq: boolean;
  tailLiftReq: boolean;
  craneReq: boolean;
  loadingMethod: string;
  unloadingMethod: string;
  vehicleType: string;
  vehicleTypeOther: string;
  reqBodyCategory: string;
  reqGvwMin: string;
  reqBodyType: string;
  reqEquipment: string[];
  reqLicenceClass: string;
  reqEndorsements: string[];
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
  custInstructions: string;
  custRefRequired: boolean;
  poRequired: boolean;
  assignedTruck: string;
  assignedTrailer: string;
  minSize: string;
  trailersAllowed: string[];
  equipmentReq: string[];
  driverQuals: string[];
  heightRestriction: string;
  weightRestriction: string;
  lengthRestriction: string;
  accessNotes: string;
  podRequired: boolean;
  failureAction: string;
  assistancePhone: string;
  assistanceNote: string;
  returnDestination: string;
  needsAltAddress: boolean;
  altSavedLocationId: number | null;
  altCompanyName: string;
  altStreet: string;
  altTown: string;
  altPostcode: string;
  altCountry: string;
  altLat: string;
  altLng: string;
  altUnit: string;
  altAddressLine2: string;
  altCounty: string;
  altContactName: string;
  altContactPhone: string;
  altContactEmail: string;
  altNavNotes: string;
  altDriverNotes: string;
  isEditMode: boolean;
  saveAsTemplate: boolean;
  templateName: string;
}

// ── Builder function ──────────────────────────────────────────────────────────

export function buildBody(params: CreateJobPayload, saveMode: "draft" | "ready_to_plan"): Record<string, unknown> {
  const {
    stops,
    qtyUnit,
    qtyUnitOther,
    materialDesc,
    totalQty,
    totalWeight,
    volume,
    adrClass,
    loadNotes,
    dimensions,
    fragile,
    stackable,
    tempControlled,
    tempRange,
    photosRequired,
    weighbridgeReq,
    forkliftReq,
    tailLiftReq,
    craneReq,
    loadingMethod,
    unloadingMethod,
    vehicleType,
    vehicleTypeOther,
    reqBodyCategory,
    reqGvwMin,
    reqBodyType,
    reqEquipment,
    reqLicenceClass,
    reqEndorsements,
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
    custInstructions,
    custRefRequired,
    poRequired,
    assignedTruck,
    assignedTrailer,
    minSize,
    trailersAllowed,
    equipmentReq,
    driverQuals,
    heightRestriction,
    weightRestriction,
    lengthRestriction,
    accessNotes,
    podRequired,
    failureAction,
    assistancePhone,
    assistanceNote,
    returnDestination,
    needsAltAddress,
    altSavedLocationId,
    altCompanyName,
    altStreet,
    altTown,
    altPostcode,
    altCountry,
    altLat,
    altLng,
    altUnit,
    altAddressLine2,
    altCounty,
    altContactName,
    altContactPhone,
    altContactEmail,
    altNavNotes,
    altDriverNotes,
    isEditMode,
    saveAsTemplate,
    templateName,
  } = params;

  const mappedStops = stops.map((stop, i) => {
    const type = stop.stopType === "collection" ? "pickup" : "dropoff";
    const locationTextSnapshot = [stop.siteName, stop.street, stop.town, stop.postcode].filter(Boolean).join(", ");

    const base: Record<string, unknown> = {
      sequenceNumber:        i + 1,
      type,
      savedLocationId:       stop.savedLocationId,
      siteName:              stop.siteName,
      unitName:              stop.unitBuilding,
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
      referenceNumber:       stop.refNumber,
      instructions:          stop.driverNotes,
      bookingRequired:       stop.bookingRequired,
      bookingRef:            stop.bookingRef,
      openingHours:          stop.openingHours,
      locationType:          stop.locationType,
      navigationInstructions: stop.navigationInstructions,
      numPallets:            stop.numPallets ? parseInt(stop.numPallets, 10) : null,
      internalNotes:         stop.internalNotes,
      earliestArrivalMinutes: toMins(stop.earliestArrival),
      unloadingAllowanceMinutes: toMins(stop.unloadingTime),
    };

    if (stop.timeType === "exact" && stop.exactTime) {
      base.bookedTime = `${stop.date}T${stop.exactTime}:00.000Z`;
    } else if (stop.timeType === "window" && stop.windowStart && stop.windowEnd) {
      base.timeWindowStart = `${stop.date}T${stop.windowStart}:00.000Z`;
      base.timeWindowEnd   = `${stop.date}T${stop.windowEnd}:00.000Z`;
    }

    return base;
  });

  const effectiveUnit = qtyUnit === "other" ? qtyUnitOther : qtyUnit;
  const loadDetails = {
    materialType:       materialDesc,
    quantity:           totalQty ? parseFloat(totalQty) : null,
    unit:               effectiveUnit,
    weight:             totalWeight ? parseFloat(totalWeight) : null,
    volume:             volume ? parseFloat(volume) : null,
    hazardClass:        adrClass,
    notes:              loadNotes,
    dimensions,
    fragile,
    stackable,
    tempControlled,
    tempRange,
    photosRequired,
    weighbridgeRequired: weighbridgeReq,
    forkliftRequired:   forkliftReq,
    tailLiftRequired:   tailLiftReq,
    craneRequired:      craneReq,
    loadingMethod,
    unloadingMethod,
  };

  const vehicleClassRequired = reqBodyCategory || (vehicleType === "other"
    ? `other: ${vehicleTypeOther}`.trim()
    : vehicleType);

  return {
    saveMode,
    customerId:             customerId,
    customerName:           customerName,
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
    customerInstructions:   custInstructions,
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
    minVehicleSize:         reqGvwMin || minSize,
    trailerTypesAllowed:    trailersAllowed,
    equipmentRequired:      reqEquipment.length ? reqEquipment : equipmentReq,
    driverQualificationsReq: reqEndorsements.length ? reqEndorsements : driverQuals,
    heightRestriction,
    weightRestriction,
    lengthRestriction,
    vehicleAccessNotes:     accessNotes,
    requirePOD:             podRequired,
    failureAction,
    assistancePhone:        failureAction === "call_assistance" ? assistancePhone : "",
    assistanceNote:         failureAction === "call_assistance" ? assistanceNote  : "",
    returnDestination:      failureAction === "finish_then_return" ? returnDestination : "",
    altAddress: needsAltAddress ? {
      savedLocationId: altSavedLocationId,
      companyName:     altCompanyName,
      street:          altStreet,
      town:            altTown,
      postcode:        altPostcode,
      country:         altCountry,
      lat:             altLat ? parseFloat(altLat) : null,
      lng:             altLng ? parseFloat(altLng) : null,
      unit:            altUnit,
      addressLine2:    altAddressLine2,
      county:          altCounty,
      contactName:     altContactName,
      contactPhone:    altContactPhone,
      contactEmail:    altContactEmail,
      navNotes:        altNavNotes,
      driverNotes:     altDriverNotes,
    } : null,
    stops:                  mappedStops,
    loadDetails,
    saveAsTemplate:         !isEditMode && saveAsTemplate,
    templateName:           !isEditMode && saveAsTemplate ? templateName.trim() : undefined,
  };
}
