import { LovelaceCard, LovelaceCardConfig, LovelaceCardEditor, ActionConfig } from './ha-types.js';

declare global {
  interface HTMLElementTagNameMap {
    'platinum-weather-card-editor': LovelaceCardEditor;
    'hui-error-card': LovelaceCard;
  }
}
export interface HassCustomElement extends CustomElementConstructor {
  getConfigElement(): Promise<unknown>;
}

export const sectionNames = ['overview', 'extended', 'slots', 'daily_forecast'];
export type sectionType = typeof sectionNames[number];

export type layoutOverview = "complete" | "observations" | "forecast" | "title only";
export type layoutOrientation = "horizontal" | "vertical";
export type layoutDays = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type extendedDays = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type pressureDecimals = 0 | 1 | 2 | 3;
export type timeFormat = 'system' | '12hour' | '24hour';

// TODO Add your configuration elements here for type-checking
export interface WeatherCardConfig extends LovelaceCardConfig {
  type: string;
  card_config_version?: number;
  section_order: sectionType[];
  show_section_overview?: boolean;
  show_section_extended?: boolean;
  show_section_slots?: boolean;
  show_section_daily_forecast?: boolean;
  overview_layout?: layoutOverview;
  text_card_title?: string;
  text_card_title_2?: string;
  entity_update_time?: string;
  update_time_use_attr?: boolean;
  update_time_name_attr?: string;
  text_update_time_prefix?: string;
  entity_temperature?: string;
  entity_apparent_temp?: string;
  entity_forecast_icon?: string;
  entity_summary?: string;
  option_show_overview_decimals?: boolean;
  option_show_overview_separator?: boolean;
  entity_extended?: string;
  extended_use_attr?: boolean;
  extended_name_attr?: string;
  slot_l1?: string;
  slot_l2?: string;
  slot_l3?: string;
  slot_l4?: string;
  slot_l5?: string;
  slot_l6?: string;
  slot_l7?: string;
  slot_l8?: string;
  slot_r1?: string;
  slot_r2?: string;
  slot_r3?: string;
  slot_r4?: string;
  slot_r5?: string;
  slot_r6?: string;
  slot_r7?: string;
  slot_r8?: string;
  entity_humidity?: string;
  entity_pressure?: string;
  entity_visibility?: string;
  entity_wind_bearing?: string;
  entity_wind_speed?: string;
  entity_wind_gust?: string;
  entity_wind_speed_kt?: string;
  entity_wind_gust_kt?: string;
  entity_temp_next?: string;
  entity_temp_next_label?: string;
  entity_temp_following?: string;
  entity_temp_following_label?: string;
  entity_forecast_max?: string;
  entity_forecast_min?: string;
  entity_observed_max?: string;
  entity_observed_min?: string;
  entity_fire_danger?: string;
  entity_pop?: string;
  entity_pos?: string;
  entity_possible_tomorrow?: string;
  entity_sun?: string;
  entity_uv_alert_summary?: string;
  entity_rainfall?: string;
  entity_todays_fire_danger?: string;
  entity_todays_uv_forecast?: string;

  custom1_value?: string;
  custom1_icon?: string;
  custom1_units?: string;
  custom2_value?: string;
  custom2_icon?: string;
  custom2_units?: string;
  custom3_value?: string;
  custom3_icon?: string;
  custom3_units?: string;
  custom4_value?: string;
  custom4_icon?: string;
  custom4_units?: string;

  entity_forecast_icon_1?: string;
  entity_forecast_min_temp_1?: string;
  entity_forecast_max_temp_1?: string;
  entity_forecast_min_rh_1?: string;
  entity_forecast_max_rh_1?: string;
  entity_psr_1?: string;
  entity_summary_1?: string;
  entity_extended_1?: string;
  entity_fire_danger_1?: string;

  daily_forecast_layout?: layoutOrientation;
  daily_forecast_days?: layoutDays;
  daily_extended_forecast_days?: extendedDays;
  daily_extended_use_attr?: boolean;
  daily_extended_name_attr?: string;

  option_slot_temperature_decimals?: boolean;
  option_today_rainfall_decimals?: boolean;
  option_pressure_decimals?: pressureDecimals;
  option_color_fire_danger?: boolean;
  option_daily_color_fire_danger?: boolean;

  // Display formatting options (used directly by the card rendering/CSS)
  pressure_units?: string;
  tempformat?: string;
  use_old_column_format?: boolean;
  temp_font_weight?: string;
  temp_font_size?: string;
  forecast_text_font_size?: string;
  forecast_text_alignment?: string;

  option_locale?: string;
  option_static_icons?: boolean;
  option_time_format?: timeFormat;
  option_tooltips?: boolean;
  old_daily_format?: boolean;
  option_show_beaufort?: boolean;

  entity?: string;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  style?: string;
}

// Valid keys for WeatherCardConfig - used to filter unknown config properties
export const weatherCardConfigKeys: (keyof WeatherCardConfig)[] = [
  'type',
  'card_config_version',
  'section_order',
  'show_section_overview',
  'show_section_extended',
  'show_section_slots',
  'show_section_daily_forecast',
  'overview_layout',
  'text_card_title',
  'text_card_title_2',
  'entity_update_time',
  'update_time_use_attr',
  'update_time_name_attr',
  'text_update_time_prefix',
  'entity_temperature',
  'entity_apparent_temp',
  'entity_forecast_icon',
  'entity_summary',
  'option_show_overview_decimals',
  'option_show_overview_separator',
  'entity_extended',
  'extended_use_attr',
  'extended_name_attr',
  'slot_l1',
  'slot_l2',
  'slot_l3',
  'slot_l4',
  'slot_l5',
  'slot_l6',
  'slot_l7',
  'slot_l8',
  'slot_r1',
  'slot_r2',
  'slot_r3',
  'slot_r4',
  'slot_r5',
  'slot_r6',
  'slot_r7',
  'slot_r8',
  'entity_humidity',
  'entity_pressure',
  'entity_visibility',
  'entity_wind_bearing',
  'entity_wind_speed',
  'entity_wind_gust',
  'entity_wind_speed_kt',
  'entity_wind_gust_kt',
  'entity_temp_next',
  'entity_temp_next_label',
  'entity_temp_following',
  'entity_temp_following_label',
  'entity_forecast_max',
  'entity_forecast_min',
  'entity_observed_max',
  'entity_observed_min',
  'entity_fire_danger',
  'entity_pop',
  'entity_pos',
  'entity_possible_tomorrow',
  'entity_sun',
  'entity_uv_alert_summary',
  'entity_rainfall',
  'entity_todays_fire_danger',
  'entity_todays_uv_forecast',
  'custom1_value',
  'custom1_icon',
  'custom1_units',
  'custom2_value',
  'custom2_icon',
  'custom2_units',
  'custom3_value',
  'custom3_icon',
  'custom3_units',
  'custom4_value',
  'custom4_icon',
  'custom4_units',
  'entity_forecast_icon_1',
  'entity_forecast_min_temp_1',
  'entity_forecast_max_temp_1',
  'entity_forecast_min_rh_1',
  'entity_forecast_max_rh_1',
  'entity_psr_1',
  'entity_summary_1',
  'entity_extended_1',
  'entity_fire_danger_1',
  'daily_forecast_layout',
  'daily_forecast_days',
  'daily_extended_forecast_days',
  'daily_extended_use_attr',
  'daily_extended_name_attr',
  'option_slot_temperature_decimals',
  'option_today_rainfall_decimals',
  'option_pressure_decimals',
  'option_color_fire_danger',
  'option_daily_color_fire_danger',
  'pressure_units',
  'tempformat',
  'use_old_column_format',
  'temp_font_weight',
  'temp_font_size',
  'forecast_text_font_size',
  'forecast_text_alignment',
  'option_locale',
  'option_static_icons',
  'option_time_format',
  'option_tooltips',
  'old_daily_format',
  'option_show_beaufort',
  'entity',
  'tap_action',
  'hold_action',
  'style',
];
