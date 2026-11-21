// Catalogs copied from wiki/reglas-finales.md, section «Catálogos». Change them there first.

export const CITIES = [
  'Cochabamba',
  'La Paz',
  'El Alto',
  'Santa Cruz',
  'Oruro',
  'Potosí',
  'Sucre',
  'Tarija',
  'Trinidad',
  'Cobija',
] as const;

export const DEFAULT_CITY = 'Cochabamba';

/** Suggested zones per city. Users can always type a zone that is not listed. */
export const SUGGESTED_ZONES: Readonly<Record<(typeof CITIES)[number], readonly string[]>> = {
  Cochabamba: [
    'Centro', 'Cala Cala', 'Sarco', 'Queru Queru', 'Tupuraya', 'Muyurina', 'Hipódromo',
    'Villa Busch', 'Quillacollo', 'Tiquipaya', 'Colcapirhua', 'Vinto', 'Sipe Sipe', 'Sacaba',
    'Colomi', 'Villa Tunari',
  ],
  'La Paz': ['Centro', 'Sopocachi', 'Miraflores', 'San Pedro', 'Zona Sur'],
  'Santa Cruz': ['Centro', 'Equipetrol', 'Plan 3000', 'Villa 1ro de Mayo', 'Urbarí'],
  'El Alto': [],
  Oruro: [],
  Potosí: [],
  Sucre: [],
  Tarija: [],
  Trinidad: [],
  Cobija: [],
};

export const TAGS = [
  'Comida', 'Almuerzos', 'Ofertas', 'Precios', 'Servicios', 'Salud', 'Educación', 'Transporte',
  'Hogar', 'Tecnología', 'Mascotas', 'Ropa', 'Eventos', 'Trabajo', 'Alquileres', 'Trámites',
  'Belleza', 'Mercado',
] as const;

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam o publicidad' },
  { value: 'false_info', label: 'Información falsa' },
  { value: 'offensive', label: 'Lenguaje ofensivo' },
  { value: 'personal_data', label: 'Datos personales' },
  { value: 'inappropriate', label: 'Contenido inapropiado' },
  { value: 'other', label: 'Otro' },
] as const;

export const PAGE_SIZE = 30;
export const MAX_TAGS = 3;
export const BOLIVIA_TIME_ZONE = 'America/La_Paz';
