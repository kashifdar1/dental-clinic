CREATE TABLE clinic_hub.currency_codes (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$')
);

INSERT INTO clinic_hub.currency_codes (code) VALUES
  ('AED'), ('AFN'), ('ALL'), ('AMD'), ('ANG'), ('AOA'), ('ARS'), ('AUD'), ('AWG'), ('AZN'),
  ('BAM'), ('BBD'), ('BDT'), ('BGN'), ('BHD'), ('BIF'), ('BMD'), ('BND'), ('BOB'), ('BRL'),
  ('BSD'), ('BTN'), ('BWP'), ('BYN'), ('BZD'), ('CAD'), ('CDF'), ('CHF'), ('CLP'), ('CNY'),
  ('COP'), ('CRC'), ('CUC'), ('CUP'), ('CVE'), ('CZK'), ('DJF'), ('DKK'), ('DOP'), ('DZD'),
  ('EGP'), ('ERN'), ('ETB'), ('EUR'), ('FJD'), ('FKP'), ('GBP'), ('GEL'), ('GHS'), ('GIP'),
  ('GMD'), ('GNF'), ('GTQ'), ('GYD'), ('HKD'), ('HNL'), ('HRK'), ('HTG'), ('HUF'), ('IDR'),
  ('ILS'), ('INR'), ('IQD'), ('IRR'), ('ISK'), ('JMD'), ('JOD'), ('JPY'), ('KES'), ('KGS'),
  ('KHR'), ('KMF'), ('KPW'), ('KRW'), ('KWD'), ('KYD'), ('KZT'), ('LAK'), ('LBP'), ('LKR'),
  ('LRD'), ('LSL'), ('LYD'), ('MAD'), ('MDL'), ('MGA'), ('MKD'), ('MMK'), ('MNT'), ('MOP'),
  ('MRU'), ('MUR'), ('MVR'), ('MWK'), ('MXN'), ('MYR'), ('MZN'), ('NAD'), ('NGN'), ('NIO'),
  ('NOK'), ('NPR'), ('NZD'), ('OMR'), ('PAB'), ('PEN'), ('PGK'), ('PHP'), ('PKR'), ('PLN'),
  ('PYG'), ('QAR'), ('RON'), ('RSD'), ('RUB'), ('RWF'), ('SAR'), ('SBD'), ('SCR'), ('SDG'),
  ('SEK'), ('SGD'), ('SHP'), ('SLE'), ('SLL'), ('SOS'), ('SRD'), ('SSP'), ('STN'), ('SVC'),
  ('SYP'), ('SZL'), ('THB'), ('TJS'), ('TMT'), ('TND'), ('TOP'), ('TRY'), ('TTD'), ('TWD'),
  ('TZS'), ('UAH'), ('UGX'), ('USD'), ('UYU'), ('UZS'), ('VES'), ('VND'), ('VUV'), ('WST'),
  ('XAF'), ('XCD'), ('XCG'), ('XDR'), ('XOF'), ('XPF'), ('XSU'), ('YER'), ('ZAR'), ('ZMW'),
  ('ZWG'), ('ZWL');

GRANT SELECT ON clinic_hub.currency_codes TO clinic_hub_app;

ALTER TABLE clinic_hub.location_services
  DROP CONSTRAINT location_services_currency_code_check;
ALTER TABLE clinic_hub.location_services
  ADD CONSTRAINT location_services_currency_code_fk
  FOREIGN KEY (currency_code)
  REFERENCES clinic_hub.currency_codes (code)
  ON DELETE RESTRICT;