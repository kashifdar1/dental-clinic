export type UiLanguage = 'en' | 'ur'
export const UI_LANGUAGE_STORAGE_KEY = 'clinic-hub-ui-language'

export function getStoredUiLanguage(): UiLanguage | null {
  const value = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)
  return value === 'en' || value === 'ur' ? value : null
}

export function storeUiLanguage(language: UiLanguage): void {
  localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language)
}

export interface UiStrings {
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

export function getUiStrings(locale: string): UiStrings {
  return locale.toLowerCase().startsWith('ur') ? URDU : ENGLISH
}
