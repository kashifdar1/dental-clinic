export type UiLanguage = 'en' | 'ur'
import { formatAvailability } from './availability'
import type { AvailabilityWindow, SpecialtyId } from './types'
export const UI_LANGUAGE_STORAGE_KEY = 'clinic-hub-ui-language'

export function getStoredUiLanguage(): UiLanguage | null {
  const value = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)
  return value === 'en' || value === 'ur' ? value : null
}

export function storeUiLanguage(language: UiLanguage): void {
  localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language)
}

export interface UiStrings {
  careAcrossSpecialties: string
  clinicalTeam: string
  doctorsWhoCare: string
  activePractitionersAcross: string
  needHelpChoosing: string
  viewProfile: string
  acceptingPatients: string
  existingPatientsOnly: string
  aboutDoctor: string
  availability: string
  languages: string
  newPatients: string
  currentlyAccepting: string
  specialtiesAndCare: string
  contactClinic: string
  emergencyNotice: string
  heroDescription: string
  searchPlaceholder: string
  backToDoctors: string
  clinicSingular: string
  clinicPlural: string
  ourDoctors: string
  contact: string
  trustedCare: string
  findDoctor: string
  meetDoctors: string
  specialty: string
  clinic: string
  searchDoctors: string
  availableToday: string
  allClinics: string
  allSpecialties: string
  noDoctorMatches: string
  contactNearestClinic: string
  requestAppointment: string
  requestAppointmentHelp: string
  yourName: string
  phone: string
  email: string
  preferredDay: string
  anyAvailableDay: string
  message: string
  sendRequest: string
  requestSent: string
  close: string
}

const ENGLISH: UiStrings = {
  careAcrossSpecialties: 'Care across specialties',
  clinicalTeam: 'Our clinical team',
  doctorsWhoCare: 'Doctors who listen, explain, and care.',
  activePractitionersAcross: 'active practitioners across',
  needHelpChoosing: 'Need help choosing?',
  viewProfile: 'View profile',
  acceptingPatients: 'Accepting patients',
  existingPatientsOnly: 'Existing patients only',
  aboutDoctor: 'About the doctor',
  availability: 'Availability',
  languages: 'Languages',
  newPatients: 'New patients',
  currentlyAccepting: 'Currently accepting',
  specialtiesAndCare: 'Specialties and care',
  contactClinic: 'Contact clinic',
  emergencyNotice: 'For emergencies, contact your local emergency service.',
  heroDescription: 'Meet experienced practitioners across our clinics, explore their specialties, and contact the clinic directly.',
  searchPlaceholder: 'Name, specialty, or clinic',
  backToDoctors: 'Back to all doctors',
  clinicSingular: 'clinic',
  clinicPlural: 'clinics',
  ourDoctors: 'Our doctors',
  contact: 'Contact',
  trustedCare: 'Trusted, connected care',
  findDoctor: 'Find the right doctor for your family.',
  meetDoctors: 'Meet our doctors',
  specialty: 'Specialty',
  clinic: 'Clinic',
  searchDoctors: 'Search doctors',
  availableToday: 'Available today',
  allClinics: 'All clinics',
  allSpecialties: 'All specialties',
  noDoctorMatches: 'No doctors match these filters. Try another search or filter.',
  contactNearestClinic: 'Contact your nearest clinic.',
  requestAppointment: 'Request an appointment',
  requestAppointmentHelp: 'Share your details and the clinic will contact you to confirm a time.',
  yourName: 'Your name',
  phone: 'Phone',
  email: 'Email',
  preferredDay: 'Preferred day',
  anyAvailableDay: 'Any available day',
  message: 'Message',
  sendRequest: 'Send request',
  requestSent: 'Request sent to the clinic.',
  close: 'Close',
}

const URDU: UiStrings = {
  careAcrossSpecialties: 'تمام شعبوں میں معیاری علاج',
  clinicalTeam: 'ہماری طبی ٹیم',
  doctorsWhoCare: 'ایسے ڈاکٹر جو سنتے، سمجھاتے اور خیال رکھتے ہیں۔',
  activePractitionersAcross: 'فعال ڈاکٹر، کلینکس کی تعداد',
  needHelpChoosing: 'انتخاب میں مدد چاہیے؟',
  viewProfile: 'پروفائل دیکھیں',
  acceptingPatients: 'نئے مریضوں کو قبول کر رہے ہیں',
  existingPatientsOnly: 'صرف موجودہ مریض',
  aboutDoctor: 'ڈاکٹر کے بارے میں',
  availability: 'دستیابی',
  languages: 'زبانیں',
  newPatients: 'نئے مریض',
  currentlyAccepting: 'اس وقت مریض قبول کر رہے ہیں',
  specialtiesAndCare: 'شعبے اور علاج',
  contactClinic: 'کلینک سے رابطہ کریں',
  emergencyNotice: 'ایمرجنسی میں اپنے مقامی ایمرجنسی سروس سے رابطہ کریں۔',
  heroDescription: 'اپنے کلینک کے تجربہ کار ڈاکٹروں اور مختلف شعبوں میں علاج دریافت کریں۔',
  searchPlaceholder: 'نام، شعبہ یا کلینک',
  backToDoctors: 'تمام ڈاکٹرز پر واپس جائیں',
  clinicSingular: 'کلینک',
  clinicPlural: 'کلینکس',
  ourDoctors: 'ہمارے ڈاکٹرز',
  contact: 'رابطہ',
  trustedCare: 'قابل اعتماد اور مربوط علاج',
  findDoctor: 'اپنے خاندان کے لیے درست ڈاکٹر تلاش کریں۔',
  meetDoctors: 'ڈاکٹرز سے ملیں',
  specialty: 'شعبہ',
  clinic: 'کلینک',
  searchDoctors: 'ڈاکٹر تلاش کریں',
  availableToday: 'آج دستیاب',
  allClinics: 'تمام کلینکس',
  allSpecialties: 'تمام شعبے',
  noDoctorMatches: 'کوئی ڈاکٹر نہیں ملا۔ تلاش یا فلٹر تبدیل کریں۔',
  contactNearestClinic: 'قریب ترین کلینک سے رابطہ کریں۔',
  requestAppointment: 'ملاقات کی درخواست',
  requestAppointmentHelp: 'اپنی معلومات دیں، کلینک وقت کی تصدیق کے لیے رابطہ کرے گا۔',
  yourName: 'آپ کا نام',
  phone: 'فون',
  email: 'ای میل',
  preferredDay: 'پسندیدہ دن',
  anyAvailableDay: 'کوئی بھی دستیاب دن',
  message: 'پیغام',
  sendRequest: 'درخواست بھیجیں',
  requestSent: 'درخواست کلینک کو بھیج دی گئی ہے۔',
  close: 'بند کریں',
}

const URDU_SPECIALTIES: Record<SpecialtyId, string> = {
  general_medicine: 'جنرل میڈیسن',
  gynecology: 'امراضِ نسواں',
  dentistry: 'دندان سازی',
  pediatrics: 'بچوں کے امراض',
  cardiology: 'امراضِ قلب',
}

const URDU_WEEKDAYS: Record<string, string> = {
  Monday: 'پیر',
  Tuesday: 'منگل',
  Wednesday: 'بدھ',
  Thursday: 'جمعرات',
  Friday: 'جمعہ',
  Saturday: 'ہفتہ',
  Sunday: 'اتوار',
}

export function getUiStrings(locale: string): UiStrings {
  return locale.toLowerCase().startsWith('ur') ? URDU : ENGLISH
}

export function getSpecialtyLabel(id: SpecialtyId, language: UiLanguage): string {
  return language === 'ur' ? URDU_SPECIALTIES[id] : id
}

export function formatLocalizedAvailability(
  availability: AvailabilityWindow,
  language: UiLanguage,
): string {
  const formatted = formatAvailability(availability)
  if (language !== 'ur') return formatted
  return Object.entries(URDU_WEEKDAYS).reduce(
    (value, [english, urdu]) => value.replaceAll(english, urdu),
    formatted,
  )
}
