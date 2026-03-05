export type Vehicle = {
  id: string;
  nickname: string;
  ev_model: string;
  battery_capacity_kwh: number;
  supported_ports: string[];
};

export type Port = {
  id: string;
  port_type: string;
  power_kw: number;
  is_available: boolean;
};

export type Station = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  distance_km: number | null;
  is_supercharger: boolean;
  cost_per_kwh: number;
  ports: Port[];
};

