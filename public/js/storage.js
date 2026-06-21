// storage.js — localStorage wrapper with sessionStorage fallback
// All ARMS data is keyed under 'arms_*' to avoid collisions.

const KEYS = {
  STUDENTS:       'arms_students',
  ATTENDANCE:     'arms_attendance',
  ATTENDANCE_ALL: 'arms_attendance_all',
  MODULES:        'arms_modules',
  GRADES_RAW:     'arms_grades_raw',
  GRADES_META:    'arms_grades_meta',
  GRADES:         'arms_grades',
  GRADES_SHEET:   'arms_grades_sheet',
  WARNING_DATA:   'arms_warning_data',
  GRADE_APPEALS:  'arms_grade_appeals',
};

const Store = (() => {
  function _set(key, value) {
    const json = JSON.stringify(value);
    try {
      localStorage.setItem(key, json);
      return true;
    } catch (e) {
      // QuotaExceededError — fall back to sessionStorage
      try {
        sessionStorage.setItem(key, json);
        console.warn(`[Store] localStorage quota exceeded for "${key}", using sessionStorage.`);
        return true;
      } catch (e2) {
        console.error(`[Store] Could not store "${key}" — data too large for both storages.`);
        return false;
      }
    }
  }

  function _get(key) {
    const lsVal = localStorage.getItem(key);
    if (lsVal !== null) {
      try { return JSON.parse(lsVal); } catch { return null; }
    }
    const ssVal = sessionStorage.getItem(key);
    if (ssVal !== null) {
      try { return JSON.parse(ssVal); } catch { return null; }
    }
    return null;
  }

  function _remove(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }

  function _has(key) {
    return localStorage.getItem(key) !== null || sessionStorage.getItem(key) !== null;
  }

  return { set: _set, get: _get, remove: _remove, has: _has };
})();

// Seed module reference data on first load (bundled from data/modules.json).
// Skipped if user has already uploaded a fresh attendance file (which overwrites this).
(function seedModules() {
  if (Store.has(KEYS.MODULES)) return;
  Store.set(KEYS.MODULES, {"MOD11W":{"name":"Turbine Aeroplane Aerodynamics, Structures and Systems Workshop","sessions":90},"MOD11":{"name":"Turbine Aeroplane Aerodynamics, Structures and Systems","sessions":255},"GEN1040_E2":{"name":"Sustainability and Environmental Science","sessions":30},"EAE2340_E31":{"name":"Strength of Materials","sessions":45},"ME103":{"name":"Strength of Materials","sessions":30},"ENG2150_E31":{"name":"Statics","sessions":45},"EG102":{"name":"Statics","sessions":30},"MOD17W":{"name":"Propellers Workshop","sessions":30},"MOD17":{"name":"Propellers","sessions":45},"BS101":{"name":"Project Management","sessions":30},"40952M":{"name":"Product Design and Manufacture in Engineering","sessions":30},"40961M":{"name":"Pneumatic and Hydraulic Systems","sessions":30},"MOD16W":{"name":"Piston Engine Workshop","sessions":30},"MOD16":{"name":"Piston Engine","sessions":60},"MOD2W":{"name":"Physics Lab","sessions":30},"MOD2":{"name":"Physics","sessions":60},"40955M":{"name":"Microcontroller Systems","sessions":30},"ME100":{"name":"Mechanical Workshop Practices","sessions":30},"ME109":{"name":"Mechanical Systems Modelling","sessions":30},"EA303MAA":{"name":"Mechanical Systems Modelling","sessions":30},"ME105":{"name":"Mechanical Project Design","sessions":45},"ME101":{"name":"Mechanical Principles","sessions":30},"40950M":{"name":"Mechanical Principles","sessions":30},"EA304MAA":{"name":"Mechanical Industry and Professional Studies","sessions":30},"ME111":{"name":"Mechanical Industry and Professional Studies","sessions":30},"EA305MAA":{"name":"Mechanical Applications","sessions":60},"ME108":{"name":"Mechanical Applications","sessions":60},"MOD1":{"name":"Mathematics","sessions":60},"ENG3260":{"name":"Math IV","sessions":45},"ENG3250":{"name":"Math III","sessions":45},"ENG1200":{"name":"Math II","sessions":45},"ENG1100":{"name":"Math I","sessions":45},"EAE3350":{"name":"Materials Science and Engineering","sessions":30},"EG108":{"name":"Materials Engineering","sessions":30},"MOD6W":{"name":"Materials & Hardware Workshop","sessions":60},"MOD6":{"name":"Materials & Hardware","sessions":150},"ENG2210":{"name":"Manufacturing Technology","sessions":30},"ME106":{"name":"Manufacturing Process","sessions":30},"AMW107B":{"name":"Maintenance Practices Workshop B","sessions":15},"MOD7BW":{"name":"Maintenance Practices Workshop B","sessions":45},"MOD7AW":{"name":"Maintenance Practices Workshop A","sessions":50},"AMW107A":{"name":"Maintenance Practices Workshop A","sessions":30},"MOD7M":{"name":"Maintenance Practices (Sec. 7.4 at B2 Level) (MCQ)","sessions":210},"GEN2040":{"name":"Islamic Culture","sessions":30},"ENG1000":{"name":"Introduction to Math","sessions":45},"AV105":{"name":"Integrated Flight Instrument Systems","sessions":30},"GEN3015":{"name":"Innovation and Entrepreneurship","sessions":30},"ME110":{"name":"Individual Mechanical Project","sessions":45},"AV110":{"name":"Individual Avionics Project","sessions":45},"AE108":{"name":"Individual Aerospace Project","sessions":45},"MOD9M_GCAA":{"name":"Human Factors (MCQ) (GCAA)","sessions":50},"EG110":{"name":"Health, Safety and Risk Assessment in Engineering","sessions":30},"MOD13B2":{"name":"Aircraft Aerodynamics, Structures and Systems (B2)","sessions":350},"MOD13B2W":{"name":"Aircraft Aerodynamics, Structures and Systems Workshop (B2)","sessions":30},"MOD14":{"name":"Propulsion","sessions":45},"MOD14W":{"name":"Propulsion Workshop","sessions":30},"MOD15W":{"name":"Gas Turbine Engines Workshop","sessions":120},"MOD15":{"name":"Gas Turbine Engines","sessions":240},"MA101":{"name":"Further Analytical Methods for Engineers","sessions":45},"AE102":{"name":"Further Aerodynamics","sessions":30},"FDN1020":{"name":"Foundation Physics","sessions":15},"FDN1010":{"name":"Foundation Math","sessions":15},"EAE2400":{"name":"Fluid Mechanics","sessions":45},"ME104":{"name":"Fluid Mechanics","sessions":45},"EAE4240":{"name":"Flight Vehicle Dynamics and Stability","sessions":30},"EAE3100":{"name":"Flight Mechanics","sessions":30},"EAE3250":{"name":"Flight Control Systems","sessions":30},"GEN1010":{"name":"English I","sessions":30},"EAE2300":{"name":"Engineering Thermodynamics","sessions":45},"AV103":{"name":"Electronic Principles","sessions":45},"MOD4W":{"name":"Electronic Fundamentals Lab","sessions":30},"MOD4B2":{"name":"Electronic Fundamentals (B2)","sessions":90},"MOD4B2W":{"name":"Electronic Fundamentals Lab (B2)","sessions":30},"MOD4":{"name":"Electronic Fundamentals","sessions":60},"40968M":{"name":"Electronic Devices and Circuits","sessions":45},"MOD3W":{"name":"Electrical Fundamentals Lab","sessions":60},"MOD3":{"name":"Electrical Fundamentals","sessions":139.99999999999997},"EG101":{"name":"Electrical Electronic and Digital Principles","sessions":90},"ENG1260":{"name":"Electrical and Electronic Principles","sessions":45},"AV107":{"name":"Electrical and Electronic Principles","sessions":45},"41006M":{"name":"Electrical and Electronic Principles","sessions":30},"ENG2230_E31":{"name":"Dynamics","sessions":45},"EG106":{"name":"Dynamics","sessions":45},"MOD5W":{"name":"Digital Techniques Electronic Instrument Systems Lab","sessions":55},"MOD5B2":{"name":"Digital Techniques Electronic Instrument Systems (B2)","sessions":45},"MOD5B2W":{"name":"Digital Techniques Electronic Instrument Systems Lab (B2)","sessions":25},"MOD5":{"name":"Digital Techniques Electronic Instrument Systems","sessions":105},"AV102":{"name":"Digital and Analogue Devices and Circuits","sessions":45},"40951M":{"name":"Delivery of Engineering Processes Safely as a Team","sessions":30},"GEN3020":{"name":"Cross Cultural Studies","sessions":30},"GEN1060":{"name":"Critical Thinking","sessions":30},"EG117":{"name":"Control and Instrumentation","sessions":30},"308SE":{"name":"Control & Instrumentations","sessions":45},"EG103":{"name":"Construction and Operation of Aircraft Fluid Systems","sessions":45},"EG121":{"name":"Computer Aided Design and Manufacture","sessions":30},"EAE3200":{"name":"Compressible Aerodynamics","sessions":45},"AV101":{"name":"Combinational and Sequential Logic","sessions":45},"40956M":{"name":"Calculus to Solve Engineering Problems","sessions":30},"BS100":{"name":"Business Management Techniques for Engineers","sessions":30},"EG104":{"name":"Basic Thermodynamics","sessions":30},"AV100":{"name":"Basic Electrical and Electronic Workshop Practices","sessions":30},"AE100":{"name":"Basic Aircraft Workshop Practices","sessions":30},"EG107":{"name":"Basic Aerodynamics","sessions":30},"MOD8":{"name":"Basic Aerodynamics","sessions":60},"AV109":{"name":"Avionics Systems II","sessions":45},"AE101":{"name":"Avionics Systems I","sessions":45},"AV108":{"name":"Avionics Project Design","sessions":45},"MOD10M_GCAA":{"name":"Aviation Legislation (MCQ) (GCAA)","sessions":69.99999999999999},"AV106":{"name":"Automatic Flight Control Systems","sessions":30},"ME107":{"name":"Application of Machine Tools","sessions":30},"MA100":{"name":"Analytical Methods for Engineers","sessions":45},"41001M":{"name":"Airframe Construction and Repair","sessions":30},"EG105":{"name":"Aircraft Systems Principles and Applications","sessions":45},"EAE4195_E31":{"name":"Aircraft Structures II","sessions":45},"EAE4190_E31":{"name":"Aircraft Structures I","sessions":45},"AE106":{"name":"Aircraft Structure","sessions":45},"AE105":{"name":"Aircraft Propulsion Technology","sessions":45},"EAE3365":{"name":"Aircraft Propulsion II","sessions":30},"EAE2810":{"name":"Aircraft Propulsion I","sessions":30},"AE103":{"name":"Aircraft Gas Turbine Science","sessions":45},"40999M":{"name":"Aircraft Gas Turbine Engines","sessions":30},"40997M":{"name":"Aircraft Flight Principles and Practice","sessions":45},"EAE4250_E31":{"name":"Aircraft Design I","sessions":30},"AV104":{"name":"Aircraft Communication and Navigation Systems","sessions":30},"EG116":{"name":"Aerospace Technology II","sessions":45},"314SE":{"name":"Aerospace Technology 2","sessions":45},"EAE4060":{"name":"Aerospace Project I","sessions":45},"AE104":{"name":"Aerospace Project Design","sessions":30},"315SE":{"name":"Aerospace Industrial Studies","sessions":30},"AE107":{"name":"Aerospace Industrial Studies","sessions":30},"EG118":{"name":"Aerospace Applications","sessions":90},"302SE":{"name":"Aerospace Applications","sessions":90},"ME102":{"name":"Advanced Thermodynamics and Heat Engine","sessions":30},"MA102":{"name":"Advanced Mathematics","sessions":45},"40954M":{"name":"A Specialist Engineering Project","sessions":30},"EA310EDM":{"name":"Airworthiness","sessions":5},"AME107":{"name":"Maintenance Practices","sessions":37.5},"AME110":{"name":"Aviation Legislation","sessions":70},"IND100":{"name":"Industrial Traning (I)","sessions":20},"IND101":{"name":"Industrial Training (II)","sessions":20},"IND102":{"name":"Industrial Training (III)","sessions":20},"IND103":{"name":"Industrial Training (IV)","sessions":20},"IND104":{"name":"Industrial Training (V)","sessions":20},"ENG4120":{"name":"Industrial Training (I) - Live Aircraft Environment (Hangar)","sessions":20},"ENG4130":{"name":"Industrial Training (II) - Engines Workshop","sessions":20},"ENG4140":{"name":"Industrial Training (III) - Cabin Workshop","sessions":20},"ENG4150":{"name":"Industrial Training (IV) - Structures & Avionics Workshop","sessions":20},"ENG4160":{"name":"Industrial Training (V) - Wheels and Brakes Workshop","sessions":20}});
})();
