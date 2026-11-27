// Seed rows for the departments, department_services and doctors tables.
// Mirrors src/app/core/departments.data.ts on the frontend. Keep the two in sync.
// fees: [regular consultation, emergency consultation] in INR, before GST.
const portrait = (gender, n) => `https://randomuser.me/api/portraits/${gender}/${n}.jpg`;

module.exports = [
  {
    slug: 'cardiology', name: 'Cardiology', icon: 'favorite', hours: 'Mon–Sat',
    tagline: 'Every heartbeat, expertly cared for.',
    description: 'Complete heart care from prevention to advanced intervention, with 24/7 cardiac monitoring and a dedicated cath lab.',
    accent: ['#e11d48', '#fb7185'],
    fees: [800, 1500],
    services: ['ECG & Echo', 'Angioplasty', 'Cardiac Rehab', 'Heart Failure Clinic'],
    doctors: [
      ['Dr. Michael Kim', 'Head of Cardiology', 20, 'Interventional cardiologist with extensive experience in angioplasty and complex coronary care. Leads our cath lab and structural heart program.', portrait('men', 52)],
      ['Dr. Sarah Lee', 'Senior Cardiologist', 14, 'Specializes in heart failure management and preventive cardiology for high-risk patients, with a focus on long-term lifestyle care.', portrait('women', 65)],
      ['Dr. Ravi Menon', 'Electrophysiologist', 9, 'Diagnoses and treats heart rhythm disorders, including pacemaker implantation and catheter ablation procedures.', portrait('men', 75)],
    ],
  },
  {
    slug: 'neurology', name: 'Neurology', icon: 'psychology', hours: 'Mon–Fri',
    tagline: 'Advanced care for the brain and nerves.',
    description: 'Expert diagnosis and treatment for stroke, epilepsy, migraines and movement disorders, backed by modern neuro-imaging.',
    accent: ['#6d28d9', '#a78bfa'],
    fees: [900, 1600],
    services: ['Stroke Unit', 'EEG & EMG', 'Epilepsy Clinic', 'Memory Care'],
    doctors: [
      ['Dr. James Okafor', 'Head of Neurology', 18, 'Leads our stroke unit and focuses on fast diagnosis and recovery planning after neurological events.', portrait('men', 85)],
      ['Dr. Elena Petrova', 'Neurologist', 12, 'Treats epilepsy, migraines and movement disorders with personalized long-term care plans for every patient.', portrait('women', 68)],
      ['Dr. Hannah Cole', 'Neurophysiologist', 7, 'Performs EEG and nerve conduction studies to pinpoint the cause of neurological symptoms quickly and accurately.', portrait('women', 26)],
    ],
  },
  {
    slug: 'orthopedics', name: 'Orthopedics', icon: 'accessible_forward', hours: 'Mon–Fri',
    tagline: 'Move freely. Live fully.',
    description: 'Bone, joint and sports-injury care, from minimally invasive surgery to complete physiotherapy and rehabilitation.',
    accent: ['#0f766e', '#14b8a6'],
    fees: [700, 1400],
    services: ['Joint Replacement', 'Sports Injuries', 'Spine Care', 'Physiotherapy'],
    doctors: [
      ['Dr. Robert Hayes', 'Orthopedic Surgeon', 19, 'Performs hip and knee replacements with a focus on faster recovery and long-term mobility.', portrait('men', 60)],
      ['Dr. Nina Kowalski', 'Sports Medicine', 10, 'Helps athletes and active people recover from injuries and get back to doing what they love.', portrait('women', 12)],
      ['Dr. Arjun Patel', 'Spine Specialist', 13, 'Treats back and neck conditions using both surgical and non-surgical approaches tailored to each patient.', portrait('men', 67)],
    ],
  },
  {
    slug: 'pediatrics', name: 'Pediatrics', icon: 'child_care', hours: 'Mon–Sat',
    tagline: 'Gentle care for growing smiles.',
    description: 'Child-friendly care for newborns, children and teens, from routine checkups and vaccines to neonatal intensive care.',
    accent: ['#c026d3', '#e879f9'],
    fees: [600, 1200],
    services: ['Well-baby Visits', 'Immunizations', 'Neonatal ICU', 'Child Nutrition'],
    doctors: [
      ['Dr. Grace Thompson', 'Head of Pediatrics', 15, 'Known for her gentle manner with young patients and her expertise in childhood development.', portrait('women', 50)],
      ['Dr. Omar Haddad', 'Pediatrician', 9, 'Cares for children from newborns to teens, with a special interest in asthma and allergies.', portrait('men', 41)],
      ['Dr. Laura Silva', 'Neonatologist', 11, 'Specializes in the care of newborns, including premature babies in our neonatal intensive care unit.', portrait('women', 57)],
    ],
  },
  {
    slug: 'emergency', name: 'Emergency & Trauma', icon: 'emergency', hours: 'Open 24/7',
    tagline: 'Ready every second, every day.',
    description: 'Round-the-clock emergency and trauma care with rapid triage, critical care beds and a dedicated ambulance fleet.',
    accent: ['#c2410c', '#f97316'],
    fees: [1000, 2000],
    services: ['Trauma Care', 'Critical Care', 'Ambulance', 'Rapid Triage'],
    doctors: [
      ['Dr. Daniel Reyes', 'Head of Emergency Medicine', 16, 'Leads our trauma team and specializes in rapid assessment and stabilization of critically injured patients.', portrait('men', 32)],
      ['Dr. Aisha Bello', 'Critical Care Specialist', 11, 'Focuses on intensive care for severe infections, respiratory failure and post-surgical recovery.', portrait('women', 44)],
      ['Dr. Tom Hughes', 'Emergency Physician', 8, 'Handles acute illness and injury with a calm, patient-first approach in high-pressure moments.', portrait('men', 46)],
    ],
  },
  {
    slug: 'general-medicine', name: 'General Medicine', icon: 'medical_services', hours: 'Mon–Sat',
    tagline: 'Your first stop for lifelong health.',
    description: 'Comprehensive primary care for adults and families: preventive checkups, chronic disease management and vaccinations.',
    accent: ['#1d4ed8', '#3b82f6'],
    fees: [500, 1000],
    services: ['Health Checkups', 'Diabetes Care', 'Vaccinations', 'Lab Tests'],
    doctors: [
      ['Dr. Anita Rao', 'Chief Medical Officer', 22, 'Internal medicine physician who oversees clinical quality and cares for patients with complex conditions.', portrait('women', 79)],
      ['Dr. Lucas Martin', 'Family Physician', 10, 'Provides everyday care for the whole family, from routine checkups to managing diabetes and hypertension.', portrait('men', 22)],
      ['Dr. Mei Chen', 'Internal Medicine', 6, 'Focuses on preventive care and helping patients build healthy, sustainable habits.', portrait('women', 33)],
    ],
  },
];
