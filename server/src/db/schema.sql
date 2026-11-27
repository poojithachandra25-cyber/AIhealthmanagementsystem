-- MedPoint Hospital Management System schema (MySQL 8+).
-- Safe to run repeatedly: every statement is idempotent.

CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120)  NOT NULL,
  email           VARCHAR(190)  NOT NULL,
  phone           VARCHAR(30)   NULL,
  role            ENUM('patient', 'doctor', 'admin') NOT NULL,
  specialization  VARCHAR(120)  NULL COMMENT 'Doctors only: department they practise in',
  password_hash   VARCHAR(100)  NOT NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS departments (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug         VARCHAR(60)   NOT NULL,
  name         VARCHAR(120)  NOT NULL,
  tagline      VARCHAR(200)  NOT NULL,
  description  TEXT          NOT NULL,
  icon         VARCHAR(60)   NOT NULL,
  hours        VARCHAR(40)   NOT NULL,
  accent_from  CHAR(7)       NOT NULL,
  accent_to    CHAR(7)       NOT NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_departments_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS department_services (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id  INT UNSIGNED NOT NULL,
  name           VARCHAR(120) NOT NULL,
  CONSTRAINT fk_services_department FOREIGN KEY (department_id)
    REFERENCES departments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doctors (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id     INT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NULL COMMENT 'Linked login account, if the doctor has one',
  name              VARCHAR(120) NOT NULL,
  title             VARCHAR(120) NOT NULL,
  experience_years  TINYINT UNSIGNED NOT NULL,
  intro             TEXT         NOT NULL,
  image_url         VARCHAR(255) NOT NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doctors_user (user_id),
  KEY idx_doctors_department (department_id),
  CONSTRAINT fk_doctors_department FOREIGN KEY (department_id)
    REFERENCES departments (id) ON DELETE CASCADE,
  CONSTRAINT fk_doctors_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id        INT UNSIGNED NOT NULL,
  doctor_id         INT UNSIGNED NOT NULL,
  appointment_date  DATE         NOT NULL,
  appointment_time  TIME         NOT NULL,
  appointment_type  ENUM('regular', 'emergency') NOT NULL DEFAULT 'regular',
  status            ENUM('pending', 'confirmed', 'completed', 'missed', 'cancelled') NOT NULL DEFAULT 'pending',
  reason           VARCHAR(255) NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_appointments_patient (patient_id),
  KEY idx_appointments_doctor_date (doctor_id, appointment_date),
  CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_appointments_doctor FOREIGN KEY (doctor_id)
    REFERENCES doctors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Weekly consulting hours. day_of_week: 0 = Sunday … 6 = Saturday.
CREATE TABLE IF NOT EXISTS doctor_availability (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doctor_id     INT UNSIGNED NOT NULL,
  day_of_week   TINYINT UNSIGNED NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  slot_minutes  TINYINT UNSIGNED NOT NULL DEFAULT 30,
  UNIQUE KEY uq_availability_doctor_day (doctor_id, day_of_week),
  CONSTRAINT fk_availability_doctor FOREIGN KEY (doctor_id)
    REFERENCES doctors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Records a doctor adds for a patient: prescriptions, lab reports, diagnoses, advice.
CREATE TABLE IF NOT EXISTS medical_records (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id      INT UNSIGNED NOT NULL,
  doctor_id       INT UNSIGNED NOT NULL,
  appointment_id  INT UNSIGNED NULL,
  record_type     ENUM('prescription', 'lab_report', 'diagnosis', 'advice') NOT NULL,
  title           VARCHAR(160) NOT NULL,
  details         TEXT         NULL,
  record_date     DATE         NOT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_records_patient (patient_id, record_date),
  CONSTRAINT fk_records_patient FOREIGN KEY (patient_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_records_doctor FOREIGN KEY (doctor_id)
    REFERENCES doctors (id) ON DELETE CASCADE,
  CONSTRAINT fk_records_appointment FOREIGN KEY (appointment_id)
    REFERENCES appointments (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- What the doctor recorded at a visit (the Update → Prescription form).
-- Saving it also writes medical_records rows (consultation_id) that the patient sees.
CREATE TABLE IF NOT EXISTS consultations (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id     INT UNSIGNED NOT NULL,
  doctor_id          INT UNSIGNED NOT NULL,
  patient_id         INT UNSIGNED NOT NULL,
  diagnosis          VARCHAR(255) NOT NULL,
  blood_pressure     VARCHAR(15)  NULL,
  pulse              VARCHAR(15)  NULL,
  temperature        VARCHAR(15)  NULL,
  weight             VARCHAR(15)  NULL,
  advice             TEXT         NULL,
  recommended_tests  VARCHAR(500) NULL COMMENT 'Comma-separated tests the patient should undergo',
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_consultations_appointment (appointment_id),
  CONSTRAINT fk_consultations_appointment FOREIGN KEY (appointment_id)
    REFERENCES appointments (id) ON DELETE CASCADE,
  CONSTRAINT fk_consultations_doctor FOREIGN KEY (doctor_id)
    REFERENCES doctors (id) ON DELETE CASCADE,
  CONSTRAINT fk_consultations_patient FOREIGN KEY (patient_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prescription_items (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  consultation_id  INT UNSIGNED NOT NULL,
  sort_order       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  name             VARCHAR(120) NOT NULL,
  dosage           VARCHAR(60)  NULL,
  frequency        VARCHAR(60)  NULL,
  duration         VARCHAR(60)  NULL,
  KEY idx_items_consultation (consultation_id),
  CONSTRAINT fk_items_consultation FOREIGN KEY (consultation_id)
    REFERENCES consultations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lab reports a patient uploads themselves (PDF or image, up to 5 MB). Doctors who have an
-- appointment with the patient see them in the case file's Reports tab.
CREATE TABLE IF NOT EXISTS patient_reports (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id   INT UNSIGNED NOT NULL,
  title        VARCHAR(160)  NOT NULL,
  notes        VARCHAR(1000) NULL,
  report_date  DATE          NOT NULL,
  file_name    VARCHAR(200)  NOT NULL,
  mime_type    VARCHAR(60)   NOT NULL,
  size_bytes   INT UNSIGNED  NOT NULL,
  data         LONGBLOB      NOT NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_patient_reports_patient (patient_id, report_date),
  CONSTRAINT fk_patient_reports_patient FOREIGN KEY (patient_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One bill per appointment: consultation fee plus GST, paid through the dummy gateway.
CREATE TABLE IF NOT EXISTS bills (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id    INT UNSIGNED NOT NULL,
  patient_id        INT UNSIGNED NOT NULL,
  consultation_fee  DECIMAL(10, 2) NOT NULL,
  gst_rate          DECIMAL(5, 2)  NOT NULL,
  gst_amount        DECIMAL(10, 2) NOT NULL,
  total             DECIMAL(10, 2) NOT NULL,
  status            ENUM('pending', 'paid', 'failed', 'refunded', 'cancelled') NOT NULL DEFAULT 'pending',
  payment_method    ENUM('card', 'upi', 'netbanking') NULL,
  payment_detail    VARCHAR(60)  NULL COMMENT 'Masked: card last 4, UPI id or bank name. Never full card data.',
  transaction_id    VARCHAR(40)  NULL,
  failure_reason    VARCHAR(160) NULL,
  paid_at           DATETIME     NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bills_appointment (appointment_id),
  KEY idx_bills_patient (patient_id),
  CONSTRAINT fk_bills_appointment FOREIGN KEY (appointment_id)
    REFERENCES appointments (id) ON DELETE CASCADE,
  CONSTRAINT fk_bills_patient FOREIGN KEY (patient_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_messages (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(190) NOT NULL,
  subject     VARCHAR(200) NULL,
  message     TEXT         NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
