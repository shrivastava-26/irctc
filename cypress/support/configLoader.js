// cypress/support/configLoader.js
import legacyFixture from '../fixtures/passenger_data.json';

/**
 * Phase 2 Integration Adapter
 * 
 * When the new Job Manager runs Cypress, it will pass the standardized
 * BookingRequest object via Cypress.env('BOOKING_REQUEST').
 * 
 * If absent, we safely fall back to the existing passenger_data.json fixture 
 * to maintain 100% backward compatibility with manual CLI execution.
 */

let rawBookingReq = Cypress.env('BOOKING_REQUEST'); console.log('RAW_BOOKING_REQ:', rawBookingReq);
const bookingRequest = typeof rawBookingReq === 'string' 
  ? JSON.parse(rawBookingReq) 
  : rawBookingReq;

let config = {};

if (bookingRequest) {
  // Map the new canonical schema to the legacy constants expected by the engine
  config = {
    TRAIN_NO: bookingRequest.trainNumber,
    TRAIN_COACH: bookingRequest.coach,
    TRAVEL_DATE: bookingRequest.travelDate,
    SOURCE_STATION: bookingRequest.source,
    DESTINATION_STATION: bookingRequest.destination,
    BOARDING_STATION: bookingRequest.boardingStation || null,
    TATKAL: bookingRequest.quota === 'TATKAL',
    PREMIUM_TATKAL: bookingRequest.quota === 'PREMIUM_TATKAL',
    UPI_ID_CONFIG: (bookingRequest.paymentPreference && bookingRequest.paymentPreference.upiId) || '',
    PASSENGER_DETAILS: bookingRequest.passengers.map(p => ({
      NAME: p.name,
      AGE: p.age,
      GENDER: p.gender,
      SEAT: p.berth || "No Preference",
      FOOD: p.food || "No Food"
    }))
  };
} else {
  config = legacyFixture;
}

export const {
  TRAIN_NO,
  TRAIN_COACH,
  TRAVEL_DATE,
  SOURCE_STATION,
  DESTINATION_STATION,
  BOARDING_STATION,
  TATKAL,
  PREMIUM_TATKAL,
  UPI_ID_CONFIG,
  PASSENGER_DETAILS
} = config;
