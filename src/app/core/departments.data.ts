export interface Doctor {
  name: string;
  title: string;
  experience: number;
  intro: string;
  /** Placeholder portrait; swap for real staff photos in `public/`. */
  image: string;
}

export interface Department {
  slug: string;
  icon: string;
  title: string;
  tagline: string;
  description: string;
  services: string[];
  hours: string;
  /** Two-stop accent gradient that gives each department its own identity. */
  accent: [string, string];
  highlights: { value: string; label: string }[];
  doctors: Doctor[];
}

const portrait = (gender: 'men' | 'women', n: number) =>
  `https://randomuser.me/api/portraits/${gender}/${n}.jpg`;

/** Single source of department and doctor data for the navbar, list and detail pages. */
export const DEPARTMENTS: Department[] = [
  {
    slug: 'cardiology',
    icon: 'favorite',
    title: 'Cardiology',
    tagline: 'Every heartbeat, expertly cared for.',
    description:
      'Complete heart care from prevention to advanced intervention, with 24/7 cardiac monitoring and a dedicated cath lab.',
    services: ['ECG & Echo', 'Angioplasty', 'Cardiac Rehab', 'Heart Failure Clinic'],
    hours: 'Mon–Sat',
    accent: ['#e11d48', '#fb7185'],
    highlights: [
      { value: '98%', label: 'Procedure success' },
      { value: '24/7', label: 'Cardiac ICU' },
      { value: '5k+', label: 'Hearts treated yearly' },
    ],
    doctors: [
      { name: 'Dr. Michael Kim', title: 'Head of Cardiology', experience: 20, intro: 'Interventional cardiologist with extensive experience in angioplasty and complex coronary care. Leads our cath lab and structural heart program.', image: portrait('men', 52) },
      { name: 'Dr. Sarah Lee', title: 'Senior Cardiologist', experience: 14, intro: 'Specializes in heart failure management and preventive cardiology for high-risk patients, with a focus on long-term lifestyle care.', image: portrait('women', 65) },
      { name: 'Dr. Ravi Menon', title: 'Electrophysiologist', experience: 9, intro: 'Diagnoses and treats heart rhythm disorders, including pacemaker implantation and catheter ablation procedures.', image: portrait('men', 75) },
    ],
  },
  {
    slug: 'neurology',
    icon: 'psychology',
    title: 'Neurology',
    tagline: 'Advanced care for the brain and nerves.',
    description:
      'Expert diagnosis and treatment for stroke, epilepsy, migraines and movement disorders, backed by modern neuro-imaging.',
    services: ['Stroke Unit', 'EEG & EMG', 'Epilepsy Clinic', 'Memory Care'],
    hours: 'Mon–Fri',
    accent: ['#6d28d9', '#a78bfa'],
    highlights: [
      { value: '60 min', label: 'Stroke response' },
      { value: '3T', label: 'MRI imaging' },
      { value: '2k+', label: 'Patients yearly' },
    ],
    doctors: [
      { name: 'Dr. James Okafor', title: 'Head of Neurology', experience: 18, intro: 'Leads our stroke unit and focuses on fast diagnosis and recovery planning after neurological events.', image: portrait('men', 85) },
      { name: 'Dr. Elena Petrova', title: 'Neurologist', experience: 12, intro: 'Treats epilepsy, migraines and movement disorders with personalized long-term care plans for every patient.', image: portrait('women', 68) },
      { name: 'Dr. Hannah Cole', title: 'Neurophysiologist', experience: 7, intro: 'Performs EEG and nerve conduction studies to pinpoint the cause of neurological symptoms quickly and accurately.', image: portrait('women', 26) },
    ],
  },
  {
    slug: 'orthopedics',
    icon: 'accessible_forward',
    title: 'Orthopedics',
    tagline: 'Move freely. Live fully.',
    description:
      'Bone, joint and sports-injury care, from minimally invasive surgery to complete physiotherapy and rehabilitation.',
    services: ['Joint Replacement', 'Sports Injuries', 'Spine Care', 'Physiotherapy'],
    hours: 'Mon–Fri',
    accent: ['#0f766e', '#14b8a6'],
    highlights: [
      { value: '1.2k+', label: 'Joint replacements' },
      { value: '2 days', label: 'Avg. recovery stay' },
      { value: '96%', label: 'Mobility restored' },
    ],
    doctors: [
      { name: 'Dr. Robert Hayes', title: 'Orthopedic Surgeon', experience: 19, intro: 'Performs hip and knee replacements with a focus on faster recovery and long-term mobility.', image: portrait('men', 60) },
      { name: 'Dr. Nina Kowalski', title: 'Sports Medicine', experience: 10, intro: 'Helps athletes and active people recover from injuries and get back to doing what they love.', image: portrait('women', 12) },
      { name: 'Dr. Arjun Patel', title: 'Spine Specialist', experience: 13, intro: 'Treats back and neck conditions using both surgical and non-surgical approaches tailored to each patient.', image: portrait('men', 67) },
    ],
  },
  {
    slug: 'pediatrics',
    icon: 'child_care',
    title: 'Pediatrics',
    tagline: 'Gentle care for growing smiles.',
    description:
      'Child-friendly care for newborns, children and teens, from routine checkups and vaccines to neonatal intensive care.',
    services: ['Well-baby Visits', 'Immunizations', 'Neonatal ICU', 'Child Nutrition'],
    hours: 'Mon–Sat',
    accent: ['#c026d3', '#e879f9'],
    highlights: [
      { value: '10k+', label: 'Happy kids' },
      { value: 'Level III', label: 'Neonatal ICU' },
      { value: '4.9★', label: 'Parent rating' },
    ],
    doctors: [
      { name: 'Dr. Grace Thompson', title: 'Head of Pediatrics', experience: 15, intro: 'Known for her gentle manner with young patients and her expertise in childhood development.', image: portrait('women', 50) },
      { name: 'Dr. Omar Haddad', title: 'Pediatrician', experience: 9, intro: 'Cares for children from newborns to teens, with a special interest in asthma and allergies.', image: portrait('men', 41) },
      { name: 'Dr. Laura Silva', title: 'Neonatologist', experience: 11, intro: 'Specializes in the care of newborns, including premature babies in our neonatal intensive care unit.', image: portrait('women', 57) },
    ],
  },
  {
    slug: 'emergency',
    icon: 'emergency',
    title: 'Emergency & Trauma',
    tagline: 'Ready every second, every day.',
    description:
      'Round-the-clock emergency and trauma care with rapid triage, critical care beds and a dedicated ambulance fleet.',
    services: ['Trauma Care', 'Critical Care', 'Ambulance', 'Rapid Triage'],
    hours: 'Open 24/7',
    accent: ['#c2410c', '#f97316'],
    highlights: [
      { value: '< 10 min', label: 'Triage time' },
      { value: '24/7', label: 'Trauma team' },
      { value: '15', label: 'Ambulances' },
    ],
    doctors: [
      { name: 'Dr. Daniel Reyes', title: 'Head of Emergency Medicine', experience: 16, intro: 'Leads our trauma team and specializes in rapid assessment and stabilization of critically injured patients.', image: portrait('men', 32) },
      { name: 'Dr. Aisha Bello', title: 'Critical Care Specialist', experience: 11, intro: 'Focuses on intensive care for severe infections, respiratory failure and post-surgical recovery.', image: portrait('women', 44) },
      { name: 'Dr. Tom Hughes', title: 'Emergency Physician', experience: 8, intro: 'Handles acute illness and injury with a calm, patient-first approach in high-pressure moments.', image: portrait('men', 46) },
    ],
  },
  {
    slug: 'general-medicine',
    icon: 'medical_services',
    title: 'General Medicine',
    tagline: 'Your first stop for lifelong health.',
    description:
      'Comprehensive primary care for adults and families: preventive checkups, chronic disease management and vaccinations.',
    services: ['Health Checkups', 'Diabetes Care', 'Vaccinations', 'Lab Tests'],
    hours: 'Mon–Sat',
    accent: ['#1d4ed8', '#3b82f6'],
    highlights: [
      { value: '30k+', label: 'Consultations' },
      { value: 'Same day', label: 'Appointments' },
      { value: '4.8★', label: 'Patient rating' },
    ],
    doctors: [
      { name: 'Dr. Anita Rao', title: 'Chief Medical Officer', experience: 22, intro: 'Internal medicine physician who oversees clinical quality and cares for patients with complex conditions.', image: portrait('women', 79) },
      { name: 'Dr. Lucas Martin', title: 'Family Physician', experience: 10, intro: 'Provides everyday care for the whole family, from routine checkups to managing diabetes and hypertension.', image: portrait('men', 22) },
      { name: 'Dr. Mei Chen', title: 'Internal Medicine', experience: 6, intro: 'Focuses on preventive care and helping patients build healthy, sustainable habits.', image: portrait('women', 33) },
    ],
  },
];

export const findDepartment = (slug: string) => DEPARTMENTS.find((d) => d.slug === slug);

/** CSS custom properties for a department's accent, for use with `[style]`. */
export const accentVars = (d: Department) => ({ '--accent-1': d.accent[0], '--accent-2': d.accent[1] });

export interface DoctorProfile {
  rating: string;
  reviews: number;
  stats: { label: string; value: string }[];
}

/**
 * Profile figures shown on doctor cards. These are placeholders derived from years of
 * experience; replace with real figures (or an API) when available.
 */
export function doctorProfile(doctor: Doctor): DoctorProfile {
  const exp = doctor.experience;
  const seed = doctor.name.length;
  const patients = Math.round((exp * 180 + seed * 20) / 100) * 100;
  return {
    rating: (4.6 + ((exp + seed) % 4) / 10).toFixed(1),
    reviews: exp * 28 + seed * 3,
    stats: [
      { label: 'Experience', value: `${exp} Yrs+` },
      { label: 'Patients', value: `${patients.toLocaleString('en-US')}+` },
      { label: 'Research', value: `${Math.round(exp * 2.4)}+ Pubs` },
      { label: 'Consultations', value: `${Math.round(exp * 1.1)}k+` },
    ],
  };
}
