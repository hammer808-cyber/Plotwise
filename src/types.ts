export type PlantStage = 'seed' | 'seedling' | 'vegetative' | 'flowering' | 'harvest';

/**
 * Earlier plant shape used by the task helper.
 * Canonical garden plants are `Inhabitant` records.
 */
export interface Plant {
  id: string;
  name: string;
  variety?: string;
  location: string;
  plantedDate: string;
  stage: PlantStage;
  waterFrequencyDays: number;
  notes?: string;
  health?: 'thriving' | 'okay' | 'struggling';
  lastWatered?: string;
}

export interface Task {
  id: string;
  plantId?: string;
  title: string;
  type: 'water' | 'fertilize' | 'inspect' | 'harvest' | 'custom';
  dueDate: string;
  completed: boolean;
  ownerUid: string;
}

export interface LogEntry {
  id: string;
  plantId?: string;
  message: string;
  createdAt: string;
  ownerUid: string;
}

/**
 * Dates already stored in Firestore are sometimes strings and sometimes
 * timestamp objects. Existing screens use both `new Date(value)` and `value.toDate()`.
 * `toDate()` is also subtracted directly when sorting, which JavaScript coerces.
 */
export type TimestampValue = number & {
  toLocaleDateString: () => string;
};

export type StoredDate = (string | number | Date) & {
  toDate?: () => TimestampValue;
};

export type InhabitantStatus =
  | 'Healthy'
  | 'Struggling'
  | 'Excellent'
  | 'Dormant'
  | 'Flowering'
  | 'Vegetative'
  | 'Pending'
  | 'Planted'
  | 'Thirsty';

export type InhabitantType = 'Herb' | 'Vegetable' | 'Flower' | 'Annual' | 'Perennial';

/** Includes values older forms saved that current security rules do not accept. */
export type PlotStatus = 'Active' | 'Planned' | 'Retired' | 'Quarantine' | 'Inactive';

/** Includes values older forms saved that current security rules do not accept. */
export type PlotHealth = 'Excellent' | 'Stable' | 'Stressed' | 'Critical' | 'Thriving' | 'Dormant';

export type EventType =
  | 'Treatment'
  | 'Weeding'
  | 'Observation'
  | 'Fertilizing'
  | 'Watering'
  | 'Harvest'
  | 'Task'
  | 'Manual'
  | 'Pruning'
  | 'Harvesting'
  | 'Pest Control'
  | 'Soil Amendment'
  | 'Propagation';

export type EnergyLevel = 'Low' | 'Medium' | 'High';

export interface GridPosition {
  x: number;
  y: number;
}

/**
 * Canonical plant (`inhabitants`).
 * Fields are optional because older documents predate the current model.
 */
export interface Inhabitant {
  id?: string;
  ownerUid?: string;
  name?: string;
  latinName?: string;
  scientific?: string;
  cultivar?: string;
  type?: InhabitantType | string;
  status?: InhabitantStatus | string;
  image?: string;
  description?: string;
  notes?: string;
  waterFreq?: string;
  sunExposure?: string;
  tempRange?: string;
  plotId?: string | null;
  planterId?: string | null;
  gridPosition?: GridPosition;
  family?: string;
  familyId?: string;
  nutrientDraw?: 'Heavy' | 'Medium' | 'Low' | string;
  vigor?: number;
  vigorIndex?: number;
  daysActive?: number;
  progress?: number;
  needsWater?: boolean;
  nextWatering?: string;
  lastWatered?: StoredDate;
  plantedAt?: StoredDate;
  startDate?: string;
  endDate?: string;
  pullDate?: string;
  actualGrowthRate?: number;
  expectedGrowthRate?: number;
  baseTemperature?: number;
  cumulativeGDD?: number;
  cropCoefficient?: number;
  totalYield?: number;
  urgencyIndex?: number;
  seasonalCohort?: string;
  etc?: number;
  cpy?: number;
  createdAt?: StoredDate;
}

export interface PlotLayoutItem {
  id: string;
  x: number;
  y: number;
  type: 'plant' | 'planter';
}

export interface CropHistoryEntry {
  year: number;
  familyId?: string;
}

/**
 * Canonical plot (`spatial_plots`).
 * Fields are optional because older documents predate the current model.
 */
export interface SpatialPlot {
  id?: string;
  ownerUid?: string;
  name?: string;
  location?: string;
  description?: string;
  notes?: string;
  status?: PlotStatus | string;
  healthStatus?: PlotHealth | string;
  soilType?: string;
  plantFamily?: string;
  irrigationZone?: string;
  sunlight?: string; // legacy name; canonical field is sunExposure
  sunExposure?: string;
  startDate?: string;
  endDate?: string;
  plantingDate?: string;
  currentCrop?: string;
  wateringFreq?: string;
  mapLayout?: PlotLayoutItem[];
  cropHistory?: CropHistoryEntry[];
  gridConfig?: { rows?: number; cols?: number };
  dailyJoke?: { text?: string; lastUpdated?: number };
  maintenanceLog?: { id?: string; action?: string; date?: string; notes?: string }[];
  createdAt?: StoredDate;
  /** Plot sharing: uids allowed into this plot (besides the owner). */
  collaboratorUids?: string[];
  /** Display names keyed by collaborator uid. */
  collaboratorNames?: Record<string, string>;
}

export interface EventLog {
  id?: string;
  ownerUid?: string;
  targetId?: string;
  targetType?: string;
  type?: string;
  eventType?: string;
  date?: string;
  notes?: string;
  pest_pressure?: number;
  treatmentType?: string;
  dosage_ml?: number;
  active_ingredient?: string;
  phenological_stage?: string;
  evapotranspiration?: number;
  energyLevel?: EnergyLevel;
  calendarTitle?: string;
  calendarDescription?: string;
  isPersistent?: boolean;
  data?: {
    type?: string;
    action?: string;
    completed?: boolean;
  };
  createdAt?: StoredDate;
}

export interface Expense {
  id?: string;
  ownerUid?: string;
  plotId?: string;
  plotName?: string;
  item?: string;
  amount?: number;
  category?: string;
  date?: string;
  createdAt?: StoredDate;
}

export interface WeatherRecord {
  id?: string;
  date?: string;
  tempMax?: number;
  tempMin?: number;
  solarRadiation?: number;
  windSpeed?: number;
  humidity?: number;
  et0?: number;
}
