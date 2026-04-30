/* eslint-disable no-var */
 
import { LitElement, html, TemplateResult, css, PropertyValues, CSSResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCardEditor, ActionHandlerEvent } from './ha-types.js';
import { getLovelace, debounce, hasAction, handleAction } from './ha-helpers.js';
import { getLocale } from './helpers';
import { entityComputeStateDisplay, stringComputeStateDisplay } from './compute_state_display';
import type { timeFormat, WeatherCardConfig, HkoWeatherForecast } from './types';
import { actionHandler } from './action-handler-directive';
import { CARD_VERSION } from './const';

/* eslint no-console: 0 */
console.info(
  `%c  PLATINUM-WEATHER-CARD  \n%c  Version ${CARD_VERSION}          `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

// This puts your card into the UI card picker dialog
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'platinum-weather-card',
  name: 'Platinum Weather Card',
  description: 'An fully customisable weather card with a GUI configuration',
});

// TODO Name your custom element
@customElement('platinum-weather-card')
export class PlatinumWeatherCard extends LitElement {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import('./editor');
    return document.createElement('platinum-weather-card-editor');
  }

  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  // TODO Add any properities that should cause your element to re-render here
  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config!: WeatherCardConfig;

  private _resizeObserver!: ResizeObserver;

  @state() private _cardWidth = 492;

  private _error: string[] = [];

  public getCardSize(): number {
    // Guard for early calls before config is set
    if (!this._config) {
      return 3; // Return a sensible default
    }

    // console.info(`Tempate Test String:${entityComputeStateDisplay(this.hass.localize, this.hass.states['sensor.template_test_string'], getLocale(this.hass))}`);
    // console.info(`Tempate Test Number:${entityComputeStateDisplay(this.hass.localize, this.hass.states['sensor.template_test_number'], getLocale(this.hass))}`);

    // Get the heights of each section
    const overiewSectionHeight = this._getCardSizeOverviewSection();
    const extendedSectionHeight = this._getCardSizeExtendedSection();
    const slotsSectionHeight = this._getCardSizeSlotsSection();
    const dailyForecastSectionHeight = this._getCardSizeDailyForecastSection();

    // Estimate the card height in pixels
    // Start with the value of the top/bottom borders (minimum card height) and add all the section heights
    const cardHeight = 16 + overiewSectionHeight + extendedSectionHeight + slotsSectionHeight + dailyForecastSectionHeight;

    // Now calculate an estimated cardsize
    const cardSize = Math.ceil(cardHeight / 50);

    //    console.info(`Card Size=${cardSize} Card Height=${cardHeight} Overview=${overiewSectionHeight} Extended=${extendedSectionHeight} Slots=${slotsSectionHeight} DailyForecast=${dailyForecastSectionHeight}`);

    return cardSize;
  }

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: WeatherCardConfig): void {
    // TODO Check for required fields and that they are of the proper format
    if (!config) {
      throw new Error('Invalid configuration');
    }

    if (config.test_gui) {
      getLovelace()?.setEditMode(true);
    }

    this._config = {
      name: 'Weather',
      ...config,
    };
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this._config) {
      return false;
    }

    const oldHass = changedProps.get("hass") as HomeAssistant || undefined;

    if (
      !oldHass ||
      oldHass.themes !== this.hass.themes ||
      oldHass.locale !== this.hass.locale
    ) {
      return true;
    }

    // Check if any entities mentioned in the config have changed
    if (Object.keys(this._config).every(entity => {
      if (entity.match(/^entity_/) !== null) {
        if (oldHass.states[this._config[entity]] !== this.hass.states[this._config[entity]]) {
          return false;
        }
      }
      return true;
    }) === false) {
      return true;
    }

    // check if any of the calculated forecast entities have changed, but only if the daily slot is shown
    if (this._config.show_section_daily_forecast) {
      const days = this._config.daily_forecast_days || 5;
      for (const entity of ['entity_forecast_icon_1', 'entity_forecast_summary_1', 'entity_forecast_min_temp_1', 'entity_forecast_max_temp_1', 'entity_forecast_min_rh_1', 'entity_forecast_max_rh_1', 'entity_forecast_psr_1']) {
        if ((this._config[entity] !== undefined) && (this._config[entity].match('^weather.') === null)) {
          // check there is a number in the name
          const start = this._config[entity].match(/(\d+)(?!.*\d)/g);
          if (start) {
            // has a number so now check all the extra entities exist
            for (var _i = 1; _i < days; _i++) {
              const newEntity = this._config[entity].replace(/(\d+)(?!.*\d)/g, Number(start) + _i);
              if (oldHass.states[newEntity] !== this.hass.states[newEntity]) {
                return true;
              }
            }
          }
        }
      }
    }

    return changedProps.has('config');
  }

  protected firstUpdated(): void {
    this._resize();
    this._attachObserver();
    // console.info(`Initial cardwdith = ${this._cardWidth}`);
  }

  private _attachObserver() {
    if (!this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(
        debounce(() => this._resize(), 250, false)
      );
    }
    // Watch for changes in size
    const card = this.shadowRoot?.querySelector('ha-card');
    // If we show an error or warning there is no ha-card
    if (!card) {
      return;
    }
    // this._resizeObserver.observe(card);
    this._resizeObserver.observe(this);
  }

  private _resize() {
    if (!this.isConnected) {
      return;
    }

    const card = this.shadowRoot?.querySelector('ha-card');
    if (!card) return;
    this._cardWidth = card.getBoundingClientRect().width;
    // console.info(`Resize cardwdith = ${this._cardWidth}`);
  }

  private _checkForErrors(): boolean {
    this._error = [];
    Object.keys(this._config).forEach(entity => {
      if (entity.match(/^entity_/) !== null) {
        if (this.hass.states[this._config[entity]] === undefined) {
          this._error.push(`'${entity}=${this._config[entity]}' not found`);
        }
      }
    });
    for (const entityName of ['entity_forecast_icon_1', 'entity_forecast_summary_1', 'entity_forecast_min_temp_1', 'entity_forecast_max_temp_1', 'entity_forecast_min_rh_1', 'entity_forecast_max_rh_1', 'entity_forecast_psr_1']) {
      if (this._config[entityName] !== undefined) {
        // check if we have a weather domain as the entity
        if (this._config.entity_hko_forecast) {
          if (!this.hass.states[this._config.entity_hko_forecast]?.attributes?.weatherForecast) {
            this._error.push(`sensor.hko_forecast attribute weatherForecast not found`);
          }
        } else {
          // we are dealing with the sensor domain
          // check there is a number in the name
          const start = this._config[entityName].match(/(\d+)(?!.*\d)/g);
          if (start) {
            // has a number so now check all the extra entities exist
            const newEntity = this._config[entityName].replace(/(\d+)(?!.*\d)/g, Number(start) + 1);
            if (this.hass.states[newEntity] === undefined) {
              this._error.push(`'${entityName}'+'1'=${newEntity}' not found`);
            }
          } else {
            this._error.push(`'${entityName}=${this._config[entityName]}' value needs to have a number`);
          }
        }
      }
    }
    return this._error.length !== 0;
  }



  private _renderUpdateTime(): TemplateResult {
    if ((this._config.entity_update_time) && (this.hass.states[this._config.entity_update_time]) && (this.hass.states[this._config.entity_update_time].state !== undefined)) {
      if (this._config.update_time_use_attr === true) {
        if (this._config.update_time_name_attr !== undefined) {
          const attribute = this._config.update_time_name_attr.toLowerCase().split(".").reduce((retval, value) => retval !== undefined ? retval[value] : undefined, this.hass.states[this._config.entity_update_time].attributes);
          if (attribute !== undefined) {
            const d = new Date(`${attribute}`);
            switch (this.timeFormat) {
              case '12hour':
                return html`${d.toLocaleString(this.locale || navigator.language, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(" ", "") + ", " + d.toLocaleDateString(this.locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(",", "")}`;
              case '24hour':
                return html`${d.toLocaleString(this.locale || navigator.language, { hour: '2-digit', minute: '2-digit', hour12: false }) + ", " + d.toLocaleDateString(this.locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(",", "")}`;
              case 'system':
                return html`${d.toLocaleTimeString(navigator.language, { timeStyle: 'short' }).replace(" ", "") + ", " + d.toLocaleDateString(navigator.language).replace(",", "")}`;
            }
          }
        }
      } else {
        const d = new Date(this.hass.states[this._config.entity_update_time].state);
        switch (this.timeFormat) {
          case '12hour':
            return html`${d.toLocaleString(this.locale || navigator.language, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(" ", "") + ", " + d.toLocaleDateString(this.locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(",", "")}`;
          case '24hour':
            return html`${d.toLocaleString(this.locale || navigator.language, { hour: '2-digit', minute: '2-digit', hour12: false }) + ", " + d.toLocaleDateString(this.locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(",", "")}`;
          case 'system':
            return html`${d.toLocaleTimeString(navigator.language, { timeStyle: 'short' }).replace(" ", "") + ", " + d.toLocaleDateString(navigator.language).replace(",", "")}`;
        }
      }
    }
    return html`---`;
  }

  private _renderCompleteOverviewSection(): TemplateResult {
    if (this._config?.show_section_overview === false) return html``;

    const weatherIcon = this._weatherIcon(this.currentIcon);
    const url = new URL('weather_icons/' + (this._config.option_static_icons ? 'static' : 'animated') + '/' + weatherIcon + '.svg', import.meta.url);
    const hoverText = weatherIcon !== 'unknown' ? '' : `Unknown condition\n${this.currentIcon}`;
    const unknownDiv = weatherIcon !== 'unknown' ? html`` : html`<div class="unknown-forecast">${this.currentIcon}</div>`;
    const biggerIcon = html`<div class="big-icon"><img src="${url.href}" width="100%" height="100%" title="${hoverText}"></div>`;

    const currentTemp = html`
      <div class="current-temp">
        <div class="temp" id="current-temp-text">${this.currentTemperature}</div>
        <div class="unit-temp-big">${this.getUOM('temperature')}</div>
      </div>
    `;

    const apparent = this.currentApparentTemperature;
    const apparentTemp = apparent != '' ? html`
      <div class="apparent-temp">
        <div class="apparent">${this.localeTextFeelsLike}&nbsp;${apparent}</div>
        <div class="unit-temp-small"> ${this.getUOM('temperature')}</div>
      </div>
    ` : html``;

    const separator = this._config.option_show_overview_separator === true ? html`<hr class=line>` : html``;

    const currentText = (this._config.entity_current_summary) && (this.hass.states[this._config.entity_current_summary]) ?
      html`<div class="forecast-text">${entityComputeStateDisplay(this.hass.localize, this.hass.states[this._config.entity_current_summary], getLocale(this.hass))}</div>` ?? html`<div class="forecast-text">---</div>` : html``;

    return html`
      <div class="overview-section section">
        ${this._config.text_card_title ? html`<div class="card-header">${this._config.text_card_title}</div>` : html``}
        ${this._config.text_card_title_2 ? html`<div class="card-header">${this._config.text_card_title_2}</div>` : html``}
        ${this._config.entity_update_time ? html`<div class="updated">${this._config.text_update_time_prefix ? this._config.text_update_time_prefix + ' ' : ''}${this._renderUpdateTime()}</div>` : html``}
        <div class="overview-top">
          <div class="top-left">${biggerIcon}${unknownDiv}</div>
          <div class="currentTemps">${currentTemp}${apparentTemp}</div>
        </div>
        ${currentText}
        ${separator}
      </div>
    `;
  }

  private _renderObservationsOverviewSection(): TemplateResult {
    if (this._config?.show_section_overview === false) return html``;

    const stack = (this._cardWidth >= 344) ? ' stacked' : '';

    const currentTemp = html`
      <div class="current-temp">
        <div class="temp" id="current-temp-text">${this.currentTemperature}</div>
        <div class="unit-temp-big">${this.getUOM('temperature')}</div>
      </div>
    `;

    const apparent = this.currentApparentTemperature;
    const apparentTemp = apparent != '' ? html`
      <div class="apparent-temp">
        <div class="apparent">${this.localeTextFeelsLike}&nbsp;${apparent}</div>
        <div class="unit-temp-small"> ${this.getUOM('temperature')}</div>
      </div>
    ` : html``;

    const separator = this._config.option_show_overview_separator === true ? html`<hr class=line>` : html``;

    return html`
      <div class="overview-section section${stack}">
        ${this._config.text_card_title ? html`<div class="card-header">${this._config.text_card_title}</div>` : html``}
        ${this._config.text_card_title_2 ? html`<div class="card-header">${this._config.text_card_title_2}</div>` : html``}
        ${this._config.entity_update_time ? html`<div class="updated">${this._config.text_update_time_prefix ? this._config.text_update_time_prefix + ' ' : ''}${this._renderUpdateTime()}</div>` : html``}
      </div>
      <div class="overview-section section">
        <div class="overview-top">
          <div class="top-left-obs"></div>
          <div class="currentTemps">${currentTemp}${apparentTemp}</div>
        </div>
        ${separator}
      </div>
    `;
  }

  private _renderTitleOnlyOverviewSection(): TemplateResult {
    if (this._config?.show_section_overview === false) return html``;

    const separator = this._config.option_show_overview_separator === true ? html`<hr class=line>` : html``;

    return html`
      <div class="overview-section section">
        ${this._config.option_show_overview_cardwidth === true ? html`<div style="font-size:12px; opacity:0.7;">cardWidth: ${Math.round(this._cardWidth)}px</div>` : html``}
        ${this._config.text_card_title ? html`<div class="card-header">${this._config.text_card_title}</div>` : html``}
        ${this._config.text_card_title_2 ? html`<div class="card-header">${this._config.text_card_title_2}</div>` : html``}
        ${this._config.entity_update_time ? html`<div class="updated">${this._config.text_update_time_prefix ? this._config.text_update_time_prefix + ' ' : ''}${this._renderUpdateTime()}</div>` : html``}
        ${separator}
      </div>
    `;
  }
  private _renderForecastOverviewSection(): TemplateResult {
    if (this._config?.show_section_overview === false) return html``;

    const weatherIcon = this._weatherIcon(this.currentIcon);
    const url = new URL('weather_icons/' + (this._config.option_static_icons ? 'static' : 'animated') + '/' + weatherIcon + '.svg', import.meta.url);
    const hoverText = weatherIcon !== 'unknown' ? '' : `Unknown condition\n${this.currentIcon}`;
    const unknownDiv = weatherIcon !== 'unknown' ? html`` : html`<div class="unknown-forecast">${this.currentIcon}</div>`;
    const biggerIcon = html`<div class="big-icon"><img src="${url.href}" width="100%" height="100%" title="${hoverText}"></div>`;

    const separator = this._config.option_show_overview_separator === true ? html`<hr class=line>` : html``;

    const currentText = (this._config.entity_current_summary) && (this.hass.states[this._config.entity_current_summary]) ?
      html`<div class="forecast-text-right">${entityComputeStateDisplay(this.hass.localize, this.hass.states[this._config.entity_current_summary], getLocale(this.hass))}</div>` ?? html`<div class="forecast-text-right">---</div>` : html``;

    return html`
      <div class="overview-section section">
        ${this._config.text_card_title ? html`<div class="card-header">${this._config.text_card_title}</div>` : html``}
        ${this._config.text_card_title_2 ? html`<div class="card-header">${this._config.text_card_title_2}</div>` : html``}
        ${this._config.entity_update_time ? html`<div class="updated">${this._config.text_update_time_prefix ? this._config.text_update_time_prefix + ' ' : ''}${this._renderUpdateTime()}</div>` : html``}
        <div class="overview-top">
          <div class="top-left">${biggerIcon}${unknownDiv}</div>
          ${currentText}
        </div>
        ${separator}
      </div>
    `;
  }

  private _getCardSizeOverviewSection(): number {
    var sectionHeight = 0;
    if (this._config.show_section_overview !== false) {
      if (this._config.overview_layout === 'observations') {
        return 76;
      } else {
        sectionHeight = 16;
        sectionHeight += this._config.text_card_title !== undefined ? 20 : 0;
        sectionHeight += this._config.text_card_title_2 !== undefined ? 20 : 0;
        sectionHeight += this._config.entity_update_time !== undefined ? 20 : 0;
      }
      if (this._config.overview_layout !== 'title only') {
        sectionHeight += (this._config.overview_layout !== 'forecast') && (this._config.entity_current_summary !== undefined) ? 145 : 120;
      }
    }
    return sectionHeight;
  }

  private _renderOverviewSection(): TemplateResult {
    if (this._config?.show_section_overview === false) return html``;

    const layout = this._config.overview_layout || 'complete';
    switch (layout) {
      case 'observations':
        return this._renderObservationsOverviewSection();
      case 'forecast':
        return this._renderForecastOverviewSection();
      case 'title only':
        return this._renderTitleOnlyOverviewSection();
      case 'complete':
      default:
        return this._renderCompleteOverviewSection();
    }
  }

  private _getCardSizeExtendedSection(): number {
    var sectionHeight = 0;
    if (this._config.show_section_extended !== false) {
      // Add the basic margins
      sectionHeight += 16;
      // this is a guess. assume 2 lines of text and add an extra 1 if uv or fire danger is added
      sectionHeight += this._config.entity_extended ? 40 : 0;
      sectionHeight += (this._config.entity_todays_uv_forecast !== undefined) || (this._config.entity_todays_fire_danger !== undefined) ? 20 : 0;
    }
    return sectionHeight;
  }

  private _renderExtendedSection(): TemplateResult {
    if ((this._config?.show_section_extended === false) || (this._config.entity_extended === undefined) && (this._config.entity_todays_uv_forecast === undefined) && (this._config.entity_todays_fire_danger === undefined)) return html``;

    const extendedEntity = this._config.entity_extended || '';
    var extended: TemplateResult[] = [];
    if (this.hass.states[extendedEntity] !== undefined) {
      if (this._config.extended_use_attr === true) {
        if (this._config.extended_name_attr !== undefined) {
          const attribute = this._config.extended_name_attr.split(".").reduce((retval, value) => retval !== undefined ? retval[value] : undefined, this.hass.states[extendedEntity].attributes);
          if (attribute !== undefined) extended.push(html`${attribute}`);
        }
      } else {
        if (this.hass.states[extendedEntity] !== undefined) extended.push(html`${this.hass.states[extendedEntity].state}`);
      }
    }
    extended.push(html`${this._config.entity_todays_uv_forecast && this.hass.states[this._config.entity_todays_uv_forecast] &&
      this.hass.states[this._config.entity_todays_uv_forecast].state !== "unknown" ? " " +
    this.hass.states[this._config.entity_todays_uv_forecast].state : ""}`);
    extended.push(html`${this._config.entity_todays_fire_danger && this.hass.states[this._config.entity_todays_fire_danger] &&
      this.hass.states[this._config.entity_todays_fire_danger].state !== "unknown" ? " " +
    this.hass.states[this._config.entity_todays_fire_danger].state : ""}`);

    return html`
      <div class="extended-section section">
        <div class="f-extended">
          ${extended}
        </div>
      </div>
    `;
  }

  private _getCardSizeSlotsSection(): number {
    var sectionHeight = 0;
    if (this._config.show_section_slots !== false) {
      // Calculate the max number of slots in both left and right
      var slotsLeft =
        (this._config.slot_l1 !== 'remove' ? 1 : 0) +
        (this._config.slot_l2 !== 'remove' ? 1 : 0) +
        (this._config.slot_l3 !== 'remove' ? 1 : 0) +
        (this._config.slot_l4 !== 'remove' ? 1 : 0) +
        (this._config.slot_l5 !== 'remove' ? 1 : 0) +
        ((this._config.slot_l6 !== undefined) && (this._config.slot_l6 !== 'remove') ? 1 : 0) +
        ((this._config.slot_l7 !== undefined) && (this._config.slot_l7 !== 'remove') ? 1 : 0) +
        ((this._config.slot_l8 !== undefined) && (this._config.slot_l8 !== 'remove') ? 1 : 0);
      var slotsRight =
        (this._config.slot_r1 !== 'remove' ? 1 : 0) +
        (this._config.slot_r2 !== 'remove' ? 1 : 0) +
        (this._config.slot_r3 !== 'remove' ? 1 : 0) +
        (this._config.slot_r4 !== 'remove' ? 1 : 0) +
        (this._config.slot_r5 !== 'remove' ? 1 : 0) +
        ((this._config.slot_r6 !== undefined) && (this._config.slot_r6 !== 'remove') ? 1 : 0) +
        ((this._config.slot_r7 !== undefined) && (this._config.slot_r7 !== 'remove') ? 1 : 0) +
        ((this._config.slot_r8 !== undefined) && (this._config.slot_r8 !== 'remove') ? 1 : 0);
      sectionHeight += 16 + Math.max(slotsLeft, slotsRight) * 24;
    }
    return sectionHeight;
  }

  private _renderSlotsSection(): TemplateResult {
    if (this._config?.show_section_slots === false) return html``;

    var slot_section = (this._config.use_old_column_format === true) ? html`
      <div>
        <ul class="variations-ugly">
          <li>
            <ul class="slot-list">${this.slotL1}${this.slotL2}${this.slotL3}${this.slotL4}${this.slotL5}${this.slotL6}${this.slotL7}${this.slotL8}</ul>
          </li>
          <li>
            <ul class="slot-list">${this.slotR1}${this.slotR2}${this.slotR3}${this.slotR4}${this.slotR5}${this.slotR6}${this.slotR7}${this.slotR8}</ul>
          </li>
        </ul>
      </div>
    ` : html`
      <div>
        <ul class="variations">
          <li class="slot-list-item-1">
            <ul class="slot-list">
              ${this.slotL1}${this.slotL2}${this.slotL3}${this.slotL4}${this.slotL5}${this.slotL6}${this.slotL7}${this.slotL8}
            </ul>
          </li>
          <li>
            <ul class="slot-list">
              ${this.slotR1}${this.slotR2}${this.slotR3}${this.slotR4}${this.slotR5}${this.slotR6}${this.slotR7}${this.slotR8}
            </ul>
          </li>
        </ul>
      </div>
    `;

    return html`
      <div class="slot-section section">${slot_section}</div>
    `;
  }

  private _renderHorizontalDailyForecastSection(): TemplateResult {
    const htmlDays: TemplateResult[] = [];
    const days = this._config.daily_forecast_days || 5;
    const now = new Date().getHours();
    const offset = now < 12 ? 0 : 1;

    for (var i = 0; i < days; i++) {
      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + i + offset);
      var htmlIcon: TemplateResult;
      var maxTemp: string | undefined;
      var minTemp: string | undefined;
      var maxRH: string | undefined;
      var minRH: string | undefined;
      if (this._config.entity_hko_forecast) {
        // using a weather domain entity
        const iconEntity = this._config.entity_hko_forecast;
        const condition = this._getForecastPropFromWeather('condition', i);
        if (condition === undefined) {
          break;
        }

        const url = new URL(('weather_icons/' + (this._config.option_static_icons ? 'static' : 'animated') + '/' + (iconEntity && condition ? this._weatherIcon(condition) : 'unknown') + '.svg').replace(/-wrain[arb]|-wts/g, ""), import.meta.url);
        htmlIcon = html`<li class="f-slot-horiz-icon"><i class="icon" style="background: none, url(${url.href}) no-repeat; background-size: contain;"></i></li>`;
      } else {
        // using sensor domain entities
        var start = this._config.entity_forecast_icon_1 ? this._config.entity_forecast_icon_1.match(/(\d+)(?!.*\d)/g) : false;
        const iconEntity = this._config.entity_forecast_icon_1 ? this._config.entity_forecast_icon_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i)) : undefined;
        if ((iconEntity === undefined) || (this.hass.states[iconEntity] === undefined)) { // if there is no data then cut the forecast short
          break;
        }
        const url = new URL(('weather_icons/' + (this._config.option_static_icons ? 'static' : 'animated') + '/' + (iconEntity && this.hass.states[iconEntity] ? this._weatherIcon(this.hass.states[iconEntity].state) : 'unknown') + '.svg').replace(/-wrain[arb]|-wts/g, ""), import.meta.url);
        htmlIcon = html`<i class="icon" style="background: none, url(${url.href}) no-repeat; background-size: contain;"></i>`;
      }
      if (this._config.entity_hko_forecast) {
        maxTemp = this._getForecastPropFromWeather('forecastMaxtemp', i);
      } else {
        start = this._config.entity_forecast_max_temp_1 ? this._config.entity_forecast_max_temp_1.match(/(\d+)(?!.*\d)/g) : false;
        maxTemp = start && this._config.entity_forecast_max_temp_1 ? this.hass.states[this._config.entity_forecast_max_temp_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i))].state : undefined;
      }
      if (this._config.entity_hko_forecast) {
        minTemp = this._getForecastPropFromWeather('forecastMintemp', i);
      } else {
        start = this._config.entity_forecast_min_temp_1 ? this._config.entity_forecast_min_temp_1.match(/(\d+)(?!.*\d)/g) : false;
        minTemp = start && this._config.entity_forecast_min_temp_1 ? this.hass.states[this._config.entity_forecast_min_temp_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i))].state : undefined;
      }
      const tempUnit = html`<div class="unit-temp-small">${this.getUOM("temperature")}</div>`;
      const minMaxTemp = this._config.old_daily_format === true
        ?
        html`
          <li class="f-slot-horiz-text">
            <span>
              <div class="slot-text highTemp">${maxTemp ? maxTemp : '---'}</div>
              <div class="unit-temp-small highTemp">${this.getUOM("temperature")}</div>
            </span>
          </li>
          <li class="f-slot-horiz-text">
            <span>
              <div class="slot-text lowTemp">${minTemp ? minTemp : '---'}</div>
              <div class="unit-temp-small lowTemp">${this.getUOM("temperature")}</div>
            </span>
          </li>`
        :
        this._config.tempformat === "highlow"
          ?
          html`
            <li class="f-slot-horiz-text">
              <span>
                <div class="slot-text highTemp">${maxTemp ? maxTemp : "---"}</div>
                <div class="slot-text slash">/</div>
                <div class="slot-text lowTemp">${minTemp ? minTemp : "---"}</div>
                ${tempUnit}
              </span>
            </li>`
          :
          html`
            <li class="f-slot-horiz-text">
              <span>
                <div class="slot-text lowTemp">${minTemp ? minTemp : "---"}</div>
                <div class="slot-text slash">/</div>
                <div class="slot-text highTemp">${maxTemp ? maxTemp : "---"}</div>
                ${tempUnit}
              </span>
            </li>
          `;

      if (this._config.entity_hko_forecast) {
        maxRH = this._getForecastPropFromWeather('forecastMaxrh', i);
      } else {
        start = this._config.entity_forecast_max_rh_1 ? this._config.entity_forecast_max_rh_1.match(/(\d+)(?!.*\d)/g) : false;
        maxRH = start && this._config.entity_forecast_max_rh_1 ? this.hass.states[this._config.entity_forecast_max_rh_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i))].state : undefined;
      }
      if (this._config.entity_hko_forecast) {
        minRH = this._getForecastPropFromWeather('forecastMinrh', i);
      } else {
        start = this._config.entity_forecast_min_rh_1 ? this._config.entity_forecast_min_rh_1.match(/(\d+)(?!.*\d)/g) : false;
        minRH = start && this._config.entity_forecast_min_rh_1 ? this.hass.states[this._config.entity_forecast_min_rh_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i))].state : undefined;
      }
      const rhUnit = html`<div class="unit">%</div>`;
      const minMaxRH = 
          html`
            <li class="f-slot-horiz-text">
              <span>
                <div class="slot-text rh">${minRH ? minRH : "---"}</div>
                <div class="slot-text slash">-</div>
                <div class="slot-text rh">${maxRH ? maxRH : "---"}</div>
                ${rhUnit}
              </span>
            </li>
          `;

      var psr: TemplateResult;
      var tooltip: TemplateResult;
      if (this._config.entity_hko_forecast) {
        const psrEntity = this._config.entity_hko_forecast;
        const psrData = this._getForecastPropFromWeather('PSR', i);
        psr = psrEntity ? html`<li class="f-slot-horiz-text"><span><div class="psr">${this.hass.states[psrEntity] && psrData !== undefined ? this.localeTextPSR(psrData, 'short') : "---"}</div></span></li>` : html``;
      } else {
        start = this._config.entity_forecast_psr_1 ? this._config.entity_forecast_psr_1.match(/(\d+)(?!.*\d)/g) : false;
        const psrEntity = start && this._config.entity_forecast_psr_1 ? this._config.entity_forecast_psr_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i)) : undefined;
        psr = start ? html`<li class="f-slot-horiz-text"><span><div class="psr">${psrEntity && this.hass.states[psrEntity] ? this.localeTextPSR(this.hass.states[psrEntity].state, 'short') : "---"}</div></span></li>` : html``;
      }
      if (this._config.entity_hko_forecast) {
        const tooltipEntity = this._config.entity_hko_forecast;
        const tooltipData = this._getForecastPropFromWeather('summary', i);
        tooltip = html`<div class="fcasttooltipblock" id="fcast-summary-${i}" style="width:${days * 100}%;left:-${i * 100}%;"><div class="fcasttooltiptext">${this.hass.states[tooltipEntity] && tooltipData !== undefined ? stringComputeStateDisplay(this.hass.localize, tooltipData) : "---"}</div>
            <span style="content:'';position:absolute;top:100%;left:${(100 / days / 2) + i * (100 / days)}%;margin-left:-7.5px;border-width:7.5px;border-style:solid;border-color:#FFA100 transparent transparent transparent;"></span>
          </div>`;
      } else {
        start = this._config.entity_forecast_summary_1 ? this._config.entity_forecast_summary_1.match(/(\d+)(?!.*\d)/g) : false;
        const tooltipEntity = start && this._config.entity_forecast_summary_1 ? this._config.entity_forecast_summary_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i)) : undefined;
        tooltip = html`<div class="fcasttooltipblock" id="fcast-summary-${i}" style="width:${days * 100}%;left:-${i * 100}%;"><div class="fcasttooltiptext">${this._config.option_tooltips && tooltipEntity ? this.hass.states[tooltipEntity] ? this.hass.states[tooltipEntity].state : "---" : ""}</div>
            <span style="content:'';position:absolute;top:100%;left:${(100 / days / 2) + i * (100 / days)}%;margin-left:-7.5px;border-width:7.5px;border-style:solid;border-color:#FFA100 transparent transparent transparent;"></span>
          </div>`;
      }

      htmlDays.push(html`
        <div class="day-horiz fcasttooltip">
          <ul class="f-slot-horiz">
            <li class="f-slot-horiz-text"><span class="dayname">${forecastDate ? forecastDate.toLocaleDateString(this.locale, { month: 'numeric', day: 'numeric'}) : "---"}</span></li>
            <li class="f-slot-horiz-text"><span class="dayname">${forecastDate ? forecastDate.toLocaleDateString(this.locale, { weekday: 'short' }) : "---"}</span></li>
            ${htmlIcon}
            ${minMaxTemp}
            ${minMaxRH}
            ${psr}
          </ul>
          ${tooltip}
        </div>
      `);
    }
    return html`
      <div class="daily-forecast-horiz-section section">
        ${htmlDays}
      </div>
    `;
  }

  private _renderVerticalDailyForecastSection(): TemplateResult {
    const htmlDays: TemplateResult[] = [];
    const days = this._config.daily_forecast_days || 5;
    const now = new Date().getHours();
    const offset = now < 12 ? 0 : 1;
    const widthClass = this._forecastWidthClass;

    for (var i = 0; i < days; i++) {
      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + i + offset);
      var htmlIcon: TemplateResult;
      var maxTemp: string | undefined;
      var minTemp: string | undefined;
      var maxRH: string | undefined;
      var minRH: string | undefined;
      var psr: TemplateResult;

      if (this._config.entity_hko_forecast) {
        // using a weather domain entity
        const iconEntity = this._config.entity_hko_forecast;
        const condition = this._getForecastPropFromWeather('condition', i);
        if (condition === undefined) {
          break;
        }

        const url = new URL(('weather_icons/' + (this._config.option_static_icons ? 'static' : 'animated') + '/' + (iconEntity && condition ? this._weatherIcon(condition) : 'unknown') + '.svg').replace(/-wrain[arb]|-wts/g, ""), import.meta.url);
        htmlIcon = html`<i class="icon-vert" style="background: none, url(${url.href}) no-repeat; background-size: contain;"></i>`;
      } else {
        // using sensor domain entities
        var start = this._config.entity_forecast_icon_1 ? this._config.entity_forecast_icon_1.match(/(\d+)(?!.*\d)/g) : false;
        const iconEntity = start && this._config.entity_forecast_icon_1 ? this._config.entity_forecast_icon_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i)) : undefined;
        if (!iconEntity || this.hass.states[iconEntity] === undefined || this.hass.states[iconEntity].state === 'unknown') { // Stop adding forecast days as soon as an undefined entity is encountered
          break;
        }
        const url = new URL(('weather_icons/' + (this._config.option_static_icons ? 'static' : 'animated') + '/' + (this.hass.states[iconEntity] !== undefined ? this._weatherIcon(this.hass.states[iconEntity].state) : 'unknown') + '.svg').replace(/-wrain[arb]|-wts/g, ""), import.meta.url);
        htmlIcon = html`<i class="icon-vert" style="background: none, url(${url.href}) no-repeat; background-size: contain;"></i>`;
      }

      var start = this._config.entity_forecast_summary_1 ? this._config.entity_forecast_summary_1.match(/(\d+)(?!.*\d)/g) : false;
      const summaryEntity = start && this._config.entity_forecast_summary_1 ? this._config.entity_forecast_summary_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i)) : undefined;
      const summary = start ? html`
        <div class="f-summary-vert">${summaryEntity && this.hass.states[summaryEntity] ? this.hass.states[summaryEntity].state : "---"}</div>` : html``;

      if (this._config.entity_hko_forecast) {
        maxTemp = this._getForecastPropFromWeather('forecastMaxtemp', i);
      } else {
        start = this._config.entity_forecast_max_temp_1 ? this._config.entity_forecast_max_temp_1.match(/(\d+)(?!.*\d)/g) : false;
        maxTemp = start && this._config.entity_forecast_max_temp_1 ? this.hass.states[this._config.entity_forecast_max_temp_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i))].state : undefined;
      }
      if (this._config.entity_hko_forecast) {
        minTemp = this._getForecastPropFromWeather('forecastMintemp', i);
      } else {
        start = this._config.entity_forecast_min_temp_1 ? this._config.entity_forecast_min_temp_1.match(/(\d+)(?!.*\d)/g) : false;
        minTemp = start && this._config.entity_forecast_min_temp_1 ? this.hass.states[this._config.entity_forecast_min_temp_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i))].state : undefined;
      }
      const tempUnit = html`<span class="unit-small-vert">${this.getUOM("temperature")}</span>`;
      const minMaxTemp = html`
        <span class="metric-inline">
          <span class="metric-label">
            <ha-icon icon="mdi:thermometer"></ha-icon>
          </span>
          <span class="metric-value">
            <span class="lowTemp-vert">${minTemp ? minTemp : "---"}</span> / <span class="highTemp-vert">${maxTemp ? maxTemp : "---"}</span>${tempUnit}
          </span>
        </span>`;
      if (this._config.entity_hko_forecast) {
        maxRH = this._getForecastPropFromWeather('forecastMaxrh', i);
      } else {
        start = this._config.entity_forecast_max_rh_1 ? this._config.entity_forecast_max_rh_1.match(/(\d+)(?!.*\d)/g) : false;
        maxRH = start && this._config.entity_forecast_max_rh_1 ? this.hass.states[this._config.entity_forecast_max_rh_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i))].state : undefined;
      }
      if (this._config.entity_hko_forecast) {
        minRH = this._getForecastPropFromWeather('forecastMinrh', i);
      } else {
        start = this._config.entity_forecast_min_rh_1 ? this._config.entity_forecast_min_rh_1.match(/(\d+)(?!.*\d)/g) : false;
        minRH = start && this._config.entity_forecast_min_rh_1 ? this.hass.states[this._config.entity_forecast_min_rh_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i))].state : undefined;
      }
      const rhUnit = html`<span class="unit-small-vert">%</span>`;
      const minMaxRH = html`
        <span class="metric-inline">
          <span class="metric-label">
            <ha-icon icon="mdi:water-percent"></ha-icon>
          </span>
          <span class="metric-value">${minRH ? minRH : "---"} - ${maxRH ? maxRH : "---"}${rhUnit}
          </span>
        </span>`;
      if (this._config.entity_hko_forecast) {
        const psrEntity = this._config.entity_hko_forecast;
        const psrData = this._getForecastPropFromWeather('PSR', i);
        psr = psrEntity ? html`<span class="metric-inline"><span class="metric-label"><ha-icon icon="mdi:umbrella"></ha-icon></span>
        <span class="psr">${this.hass.states[psrEntity] && psrData !== undefined ? this.localeTextPSR(psrData, this._psrVariant) : "---"}</span></span>` : html``;
      } else {
        start = this._config.entity_forecast_psr_1 ? this._config.entity_forecast_psr_1.match(/(\d+)(?!.*\d)/g) : false;
        const psrEntity = start && this._config.entity_forecast_psr_1 ? this._config.entity_forecast_psr_1.replace(/(\d+)(?!.*\d)/g, String(Number(start) + i)) : undefined;
        psr = start ? html`
          <span class="metric-inline"><span class="metric-label"><ha-icon icon="mdi:umbrella"></ha-icon></span>
          <span class="psr">${psrEntity && this.hass.states[psrEntity] ? this.localeTextPSR(this.hass.states[psrEntity].state, this._psrVariant) : "---"}</span></span>` : html``;
      }

      htmlDays.push(html`
        <div class="day-vert ${widthClass}">
          <div class="day-vert-left">
            <div class="dayname-vert">
              <div class="day-vert-date">
                ${forecastDate ? forecastDate.toLocaleDateString(this.locale, { month: 'numeric', day: 'numeric' }) : "---"}
              </div>
              <div class="day-vert-weekday">
                ${forecastDate ? forecastDate.toLocaleDateString(this.locale, { weekday: 'short' }) : "---"}
              </div>
            </div>
            <div class="day-vert-dayicon">
              ${htmlIcon}
            </div>
          </div>
          <div class="day-vert-right">
            <div class="day-vert-metrics">
              ${minMaxTemp}${minMaxRH}${psr}
            </div>
            <div class="day-vert-summary">
              ${summary}
            </div>
          </div>
        </div>
      `);
    }

    return html`
      <div class="daily-forecast-vert-section section">
        ${htmlDays}
      </div>
    `;
  }

  private _getForecastPropFromWeather(propKey: string, index: number): string | undefined {
    const entity = this._config?.entity_hko_forecast;
    if (!entity) {
      return undefined;
    }
    const list = this.hass.states[entity]?.attributes?.weatherForecast as HkoWeatherForecast[];
    if (!list || !list[index]) return undefined;
    const f = list[index];
    switch (propKey) {
      case 'condition':
        return f.ForecastIcon !== undefined ? String(f.ForecastIcon) : undefined;
      case 'forecastMaxtemp':
        return f.forecastMaxtemp?.value !== undefined ? String(f.forecastMaxtemp.value) : undefined;
      case 'forecastMintemp':
        return f.forecastMintemp?.value !== undefined ? String(f.forecastMintemp.value) : undefined;
      case 'forecastMaxrh':
        return f.forecastMaxrh?.value !== undefined ? String(f.forecastMaxrh.value) : undefined;
      case 'forecastMinrh':
        return f.forecastMinrh?.value !== undefined ? String(f.forecastMinrh.value) : undefined;
      case 'PSR':
        return f.PSR !== undefined ? String(f.PSR) : undefined;
      case 'summary':
        return f.forecastWeather !== undefined ? String(f.forecastWeather) : undefined;
      case 'forecastWind':
        return f.forecastWind !== undefined ? String(f.forecastWind) : undefined;
      default:
        return undefined;
    }
  }

  private _getCardSizeDailyForecastSection(): number {
    var sectionHeight = 0;
    if (this._config.show_section_daily_forecast !== false) {
      if (this._config.daily_forecast_layout !== 'vertical') {
        // Horizontal layout
        sectionHeight += 146;
      } else {
        // Vertical layout
        // Add the stats part of each day
        sectionHeight += 18 + (this._config.daily_forecast_days || 5) * 87;
        // Add the guess for the extended forecast text (guess at 2 lines per forecast)
        if (this._config.daily_extended_forecast_days !== 0) {
          sectionHeight += Math.min(this._config.daily_forecast_days || 5, this._config.daily_extended_forecast_days || 7) * 48;
        }
      }
    }
    return sectionHeight;
  }

  private _renderDailyForecastSection(): TemplateResult {
    if (this._config?.show_section_daily_forecast === false) return html``;

    if (this._config.daily_forecast_layout !== 'vertical') {
      return this._renderHorizontalDailyForecastSection();
    } else {
      return this._renderVerticalDailyForecastSection();
    }
  }

  protected render(): TemplateResult | void {
    // Guard for Lit 3 lifecycle - render may be called before config/hass are set
    if (!this._config) {
      return html``;
    }

    // hass is required for most render paths; render a minimal shell until it arrives
    if (!this.hass) {
      return html`
        <style>
          ${this.styles}
        </style>
        <ha-card class="card">
          <div class="content"></div>
        </ha-card>
      `;
    }

    const htmlCode: TemplateResult[] = [];
    if (this._checkForErrors()) htmlCode.push(this._showConfigWarning(this._error));

    const sections: TemplateResult[] = [];
    if (this._config.section_order !== undefined) {
      this._config.section_order.forEach(section => {
        switch (section) {
          case 'overview':
            sections.push(this._renderOverviewSection());
            break;
          case 'extended':
            sections.push(this._renderExtendedSection());
            break;
          case 'slots':
            sections.push(this._renderSlotsSection());
            break;
          case 'daily_forecast':
            sections.push(this._renderDailyForecastSection());
            break;
        }
      });
    }

    htmlCode.push(html`
      <style>
        ${this.styles}
      </style>
      <ha-card class="card"
        @action=${this._handleAction}
        .actionHandler=${actionHandler({ hasHold: hasAction(this._config.hold_action), })}
        ><div class="content">
          ${sections}
        </div>
      </ha-card>
    `);
    return html`${htmlCode}`;
  }

  private _handleAction(ev: ActionHandlerEvent): void {
    if (this.hass && this._config && ev.detail.action) {
      handleAction(this, this.hass, this._config, ev.detail.action);
    }
  }

  // slots - returns the value to be displyed in a specific current condition slot
  get slotL1(): TemplateResult {
    return this.slotValue('l1', this._config.slot_l1);
  }

  get slotL2(): TemplateResult {
    return this.slotValue('l2', this._config.slot_l2);
  }

  get slotL3(): TemplateResult {
    return this.slotValue('l3', this._config.slot_l3);
  }

  get slotL4(): TemplateResult {
    return this.slotValue('l4', this._config.slot_l4);
  }

  get slotL5(): TemplateResult {
    return this.slotValue('l5', this._config.slot_l5);
  }

  get slotL6(): TemplateResult {
    return this.slotValue('l6', this._config.slot_l6);
  }

  get slotL7(): TemplateResult {
    return this.slotValue('l7', this._config.slot_l7);
  }

  get slotL8(): TemplateResult {
    return this.slotValue('l8', this._config.slot_l8);
  }

  get slotR1(): TemplateResult {
    return this.slotValue('r1', this._config.slot_r1);
  }

  get slotR2(): TemplateResult {
    return this.slotValue('r2', this._config.slot_r2);
  }

  get slotR3(): TemplateResult {
    return this.slotValue('r3', this._config.slot_r3);
  }

  get slotR4(): TemplateResult {
    return this.slotValue('r4', this._config.slot_r4);
  }

  get slotR5(): TemplateResult {
    return this.slotValue('r5', this._config.slot_r5);
  }

  get slotR6(): TemplateResult {
    return this.slotValue('r6', this._config.slot_r6);
  }

  get slotR7(): TemplateResult {
    return this.slotValue('r7', this._config.slot_r7);
  }

  get slotR8(): TemplateResult {
    return this.slotValue('r8', this._config.slot_r8);
  }

  // slots - calculates the specific slot value
  slotValue(slot: string, value: string | undefined): TemplateResult {
    switch (value) {
      case 'pop': return this.slotPop;
      case 'popforecast': return this.slotPopForecast;
      case 'possible_today': return this.slotPos;
      case 'possible_tomorrow': return this.slotPossibleTomorrow;
      case 'rainfall': return this.slotRainfall;
      case 'humidity': return this.slotHumidity;
      case 'pressure': return this.slotPressure;
      case 'observed_max': return this.slotObservedMax;
      case 'observed_min': return this.slotObservedMin;
      case 'observed_maxmin': return this.slotObservedMaxMin;
      case 'forecast_max': return this.slotForecastMax;
      case 'forecast_min': return this.slotForecastMin;
      case 'temp_next': return this.slotTempNext;
      case 'temp_following': return this.slotTempFollowing;
      case 'temp_maximums': return this.slotTempMaximums;
      case 'temp_minimums': return this.slotTempMinimums;
      case 'uv_summary': return this.slotUvSummary;
      case 'fire_danger': return this.slotFireDanger;
      case 'wind': return this.slotWind;
      case 'wind_kt': return this.slotWindKt;
      case 'visibility': return this.slotVisibility;
      case 'sun_next': return this.slotSunNext;
      case 'sun_following': return this.slotSunFollowing;
      case 'custom1': return this.slotCustom1;
      case 'custom2': return this.slotCustom2;
      case 'custom3': return this.slotCustom3;
      case 'custom4': return this.slotCustom4;
      case 'empty': return this.slotEmpty;
      case 'remove': return this.slotRemove;
    }

    // If no value can be matched pass back a default for the slot
    switch (slot) {
      case 'l1': return this.slotSunNext;
      case 'l2': return this.slotObservedMaxMin;
      case 'l3': return this.slotWind;
      case 'l4': return this.slotPressure;
      case 'l5': return this.slotRemove;
      case 'l6': return this.slotRemove;
      case 'l7': return this.slotRemove;
      case 'l8': return this.slotRemove;
      case 'r1': return this.slotSunFollowing;
      case 'r2': return this.slotHumidity;
      case 'r3': return this.slotUvSummary;
      case 'r4': return this.slotRainfall;
      case 'r5': return this.slotRemove;
      case 'r6': return this.slotRemove;
      case 'r7': return this.slotRemove;
      case 'r8': return this.slotRemove;
    }
    return this.slotEmpty;
  }

  // getters that return the html for an individual slot
  get slotEmpty(): TemplateResult {
    return html`<li>&nbsp;</li>`;
  }

  get slotRemove(): TemplateResult {
    return html``;
  }

  get slotPopForecast(): TemplateResult {
    const pop = this._config.entity_pop && this.hass.states[this._config.entity_pop] !== undefined
      ? this._config.entity_pop.match('^weather.') === null
        ? Math.round(Number(this.hass.states[this._config.entity_pop].state))
        : this.hass.states[this._config.entity_pop].attributes?.forecast?.[0]?.precipitation_probability !== undefined
          ? Math.round(Number(this.hass.states[this._config.entity_pop].attributes?.forecast?.[0]?.precipitation_probability))
          : '---'
      : "---";
    const pop_units = pop !== "---" ? html`<div class="slot-text unit">%</div>` : html``;
    const pos = this._config.entity_pos && this.hass.states[this._config.entity_pos] !== undefined
      ? this._config.entity_pos.match('^weather.') === null
        ? this.hass.states[this._config.entity_pos].state
        : this.hass.states[this._config.entity_pos].attributes?.forecast?.[0]?.precipitation !== undefined
          ? this.hass.states[this._config.entity_pos].attributes?.forecast?.[0]?.precipitation
          : '---'
      : "---";
    const pos_units = pos !== "---" ? html`<div class="slot-text unit">${this.getUOM('precipitation')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:weather-rainy"></ha-icon>
          </div>
          <div class="slot-text pop-text">${pop}</div>${pop_units}<div class="slot-text">&nbsp;</div>
          <div class="slot-text pop-text-today">${pos}</div>${pos_units}
        </div>
      </li>
    `;
  }

  get slotPop(): TemplateResult {
    const pop = this._config.entity_pop && this.hass.states[this._config.entity_pop] !== undefined
      ? this._config.entity_pop.match('^weather.') === null
        ? Math.round(Number(this.hass.states[this._config.entity_pop].state))
        : this.hass.states[this._config.entity_pop].attributes?.forecast?.[0]?.precipitation_probability !== undefined
          ? Math.round(Number(this.hass.states[this._config.entity_pop].attributes?.forecast?.[0]?.precipitation_probability))
          : '---'
      : "---";
    const pop_units = pop !== "---" ? html`<div class="slot-text unit">%</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:weather-rainy"></ha-icon>
          </div>
          <div class="slot-text pop-text">${pop}</div>${pop_units}<div class="slot-text"></div>
        </div>
      </li>
    `;
  }

  get slotPos(): TemplateResult {
    const pos = this._config.entity_pos && this.hass.states[this._config.entity_pos] !== undefined
      ? this._config.entity_pos.match('^weather.') === null
        ? this.hass.states[this._config.entity_pos].state
        : this.hass.states[this._config.entity_pos].attributes?.forecast?.[0]?.precipitation !== undefined
          ? this.hass.states[this._config.entity_pos].attributes?.forecast?.[0]?.precipitation
          : '---'
      : "---";
    const units = pos !== "---" ? html`<div class="slot-text unit">${this.getUOM('precipitation')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:weather-rainy"></ha-icon>
          </div>${this.localeTextPosToday}&nbsp;<div class="slot-text possible_today-text">${pos}</div>${units}
        </div>
      </li>
    `;
  }

  get slotPossibleTomorrow(): TemplateResult {
    const pos = this._config.entity_possible_tomorrow && this.hass.states[this._config.entity_possible_tomorrow] !== undefined
      ? this._config.entity_possible_tomorrow.match('^weather.') === null
        ? this.hass.states[this._config.entity_possible_tomorrow].state
        : this.hass.states[this._config.entity_possible_tomorrow].attributes?.forecast?.[1]?.precipitation !== undefined
          ? this.hass.states[this._config.entity_possible_tomorrow].attributes?.forecast?.[1]?.precipitation
          : '---'
      : "---";
    const units = pos !== "---" ? html`<div class="slot-text unit">${this.getUOM('precipitation')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:weather-rainy"></ha-icon>
          </div>${this.localeTextPosTomorrow}&nbsp;<div class="slot-text possible_tomorrow-text">${pos}</div>${units}
        </div>
      </li>
    `;
  }

  get slotRainfall(): TemplateResult {
    const rainfall = this.currentRainfall;
    const units = rainfall !== "---" ? html`<div class="slot-text unit"></span>${this.getUOM('precipitation')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:weather-rainy"></ha-icon>
          </div>
          <div class="slot-text rainfall-text">${rainfall}</div>${units}
        </div>
      </li>
    `;
  }

  get slotHumidity(): TemplateResult {
    const humidity = this.currentHumidity;
    const units = humidity !== '---' ? html`<div class="slot-text unit">%</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:water-percent"></ha-icon>
          </div>
          <div class="slot-text humidity-text">${humidity}</div>${units}
        </div>
      </li>`;
  }

  get slotPressure(): TemplateResult {
    const pressure = this.currentPressure;
    const units = pressure !== "---" ? html`<div class="slot-text unit">${this._config.pressure_units ? this._config.pressure_units : this.getUOM('air_pressure')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:gauge"></ha-icon>
          </div>
          <div class="slot-text pressure-text">${this.currentPressure}</div>${units}
        </div>
      </li>
    `;
  }

  get slotObservedMax(): TemplateResult {
    const digits = this._config.option_slot_temperature_decimals === true ? 1 : 0;
    const temp = this._config.entity_observed_max && this.hass.states[this._config.entity_observed_max] !== undefined ? (Number(this.hass.states[this._config.entity_observed_max].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "---";
    const units = temp !== "---" ? html`<div class="unit-temp-small">${this.getUOM('temperature')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:thermometer-high"></ha-icon>
          </div>
          <div class="slot-text">${this.localeTextObservedMax}&nbsp;</div>
          <div class="slot-text observed-max-text">${temp}</div>${units}
        </div>
      </li>
    `;
  }

  get slotObservedMin(): TemplateResult {
    const digits = this._config.option_slot_temperature_decimals === true ? 1 : 0;
    const temp = this._config.entity_observed_min && this.hass.states[this._config.entity_observed_min] !== undefined ? (Number(this.hass.states[this._config.entity_observed_min].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "---";
    const units = temp !== "---" ? html`<div class="unit-temp-small">${this.getUOM('temperature')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:thermometer-low"></ha-icon>
          </div>
          <div class="slot-text">${this.localeTextObservedMin}&nbsp;</div>
          <div class="slot-text observed-min-text">${temp}</div>${units}
        </div>
      </li>
    `;
  }

  get slotObservedMaxMin(): TemplateResult {
    const digits = this._config.option_slot_temperature_decimals === true ? 1 : 0;
    const obs_max = this._config.entity_observed_max && this.hass.states[this._config.entity_observed_max] !== undefined ? (Number(this.hass.states[this._config.entity_observed_max].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "---";
    const obs_min = this._config.entity_observed_min && this.hass.states[this._config.entity_observed_min] !== undefined ? (Number(this.hass.states[this._config.entity_observed_min].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "---";
    const units = html`<div class="unit-temp-small">${this.getUOM('temperature')}</div>`;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:thermometer"></ha-icon>
          </div>
          <div class="slot-text observed-min-text lowTemp">${obs_min}</div>
          <div class="slot-text slash">/</div>
          <div class="slot-text forecast-min-text">${obs_max}</div>${units}
        </div>
      </li>
    `;
  }

  get slotForecastMax(): TemplateResult {
    const digits = this._config.option_slot_temperature_decimals === true ? 1 : 0;
    const temp = this._config.entity_forecast_max && this.hass.states[this._config.entity_forecast_max] !== undefined
      ? this._config.entity_forecast_max.match('^weather.') === null
        ? (Number(this.hass.states[this._config.entity_forecast_max].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
        : this.hass.states[this._config.entity_forecast_max].attributes?.forecast?.[0]?.temperature !== undefined
          ? (Number(this.hass.states[this._config.entity_forecast_max].attributes?.forecast?.[0]?.temperature)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
          : '---'
      : "---";
    const units = temp !== "---" ? html`<div class="unit-temp-small">${this.getUOM('temperature')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:thermometer-high"></ha-icon>
          </div>
          <div class="slot-text">${this.localeTextForecastMax}&nbsp;</div>
          <div class="slot-text forecast-max-text">${temp}</div>${units}
        </div>
      </li>
    `;
  }

  get slotForecastMin(): TemplateResult {
    const digits = this._config.option_slot_temperature_decimals === true ? 1 : 0;
    const temp = this._config.entity_forecast_min && this.hass.states[this._config.entity_forecast_min] !== undefined
      ? this._config.entity_forecast_min.match('^weather.') === null
        ? (Number(this.hass.states[this._config.entity_forecast_min].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
        : this.hass.states[this._config.entity_forecast_min].attributes?.forecast?.[0]?.templow !== undefined
          ? (Number(this.hass.states[this._config.entity_forecast_min].attributes?.forecast?.[0]?.templow)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
          : '---'
      : "---";
    const units = temp !== "---" ? html`<div class="unit-temp-small">${this.getUOM('temperature')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:thermometer-low"></ha-icon>
          </div>
          <div class="slot-text">${this.localeTextForecastMin}&nbsp;</div>
          <div class="slot-text forecast-min-text">${temp}</div>${units}
        </div>
      </li>
    `;
  }

  get slotTempNext(): TemplateResult {
    const digits = this._config.option_slot_temperature_decimals === true ? 1 : 0;
    const icon = this._config.entity_temp_next_label && this.hass.states[this._config.entity_temp_next_label] !== undefined ? this.hass.states[this._config.entity_temp_next_label].state.toLowerCase().includes("min") || this.hass.states[this._config.entity_temp_next_label].state.toLowerCase().includes("low") ? "mdi:thermometer-low" : "mdi:thermometer-high" : "mdi:help-box";
    const temp = this._config.entity_temp_next && this.hass.states[this._config.entity_temp_next] !== undefined ? (Number(this.hass.states[this._config.entity_temp_next].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "---";
    const label = this._config.entity_temp_next_label && this.hass.states[this._config.entity_temp_next_label] !== undefined ? this.hass.states[this._config.entity_temp_next_label].state : "";
    const units = temp !== "---" ? html`<div class="slot-text unit-temp-small">${this.getUOM('temperature')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="${icon}"></ha-icon>
          </div>
          <div class="slot-text temp-next-text">${label} ${temp}</div>
          ${units}
        </div>
      </li>
    `;
  }

  get slotTempFollowing(): TemplateResult {
    const digits = this._config.option_slot_temperature_decimals === true ? 1 : 0;
    const icon = this._config.entity_temp_following_label && this.hass.states[this._config.entity_temp_following_label] !== undefined ? this.hass.states[this._config.entity_temp_following_label].state.toLowerCase().includes("min") || this.hass.states[this._config.entity_temp_following_label].state.toLowerCase().includes("low") ? "mdi:thermometer-low" : "mdi:thermometer-high" : "mdi:help-box";
    const temp = this._config.entity_temp_following && this.hass.states[this._config.entity_temp_following] !== undefined ? (Number(this.hass.states[this._config.entity_temp_following].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "---";
    const label = this._config.entity_temp_following_label && this.hass.states[this._config.entity_temp_following_label] !== undefined ? this.hass.states[this._config.entity_temp_following_label].state : "";
    const units = temp !== "---" ? html`<div class="slot-text unit-temp-small">${this.getUOM('temperature')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="${icon}"></ha-icon>
          </div>
          <div class="slot-text temp-following-text">${label} ${temp}</div>
          ${units}
        </div>
      </li>
    `;
  }

  get slotTempMaximums(): TemplateResult {
    const digits = this._config.option_slot_temperature_decimals === true ? 1 : 0;
    const temp_obs = this._config.entity_observed_max && this.hass.states[this._config.entity_observed_max] !== undefined ? (Number(this.hass.states[this._config.entity_observed_max].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "---";
    const temp_for = this._config.entity_forecast_max && this.hass.states[this._config.entity_forecast_max] !== undefined ? (Number(this.hass.states[this._config.entity_forecast_max].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "---";
    const units = temp_obs !== "---" ? html`<div class="unit-temp-small">${this.getUOM('temperature')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:thermometer-high"></ha-icon>
          </div>
          <div class="slot-text">${this.localeTextObsMax}&nbsp;</div>
          <div class="slot-text observed-max-text">${temp_obs}</div>${units}
          <div class="slot-text">&nbsp;(${this.localeTextFore}&nbsp;</div>
          <div class="slot-text forecast-max-text">${temp_for}</div>${units}
          <div class="slot-text">)</div>
        </div>
      </li>
    `;
  }

  get slotTempMinimums(): TemplateResult {
    const digits = this._config.option_slot_temperature_decimals === true ? 1 : 0;
    const temp_obs = this._config.entity_observed_min && this.hass.states[this._config.entity_observed_min] !== undefined ? (Number(this.hass.states[this._config.entity_observed_min].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "---";
    const temp_for = this._config.entity_forecast_min && this.hass.states[this._config.entity_forecast_min] !== undefined ? (Number(this.hass.states[this._config.entity_forecast_min].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "---";
    const units = temp_obs !== "---" ? html`<div class="unit-temp-small">${this.getUOM('temperature')}</div>` : html``;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:thermometer-low"></ha-icon>
          </div>
          <div class="slot-text">${this.localeTextObsMin}&nbsp;</div>
          <div class="slot-text observed-min-text">${temp_obs}</div>${units}
          <div class="slot-text">&nbsp;(${this.localeTextFore}&nbsp;</div>
          <div class="slot-text forecast-min-text">${temp_for}</div>${units}
          <div class="slot-text">)</div>
        </div>
      </li>
    `;
  }

  get slotUvSummary(): TemplateResult {
    const uv = this.currentUv;
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:weather-sunny"></ha-icon>
          </div>
          <div class="slot-text daytime-uv-text">${this.localeTextUVRating} ${uv}</div>
        </div>
      </li>
    `;
  }

  get slotFireDanger(): TemplateResult {
    const entity = this._config.entity_fire_danger;
    const fire = entity && this.hass.states[entity] !== undefined ? this.hass.states[entity].state !== 'unknown' ? this._config.option_color_fire_danger === false ? this.hass.states[entity].state : this.hass.states[entity].state.toLocaleUpperCase() : "Not Applicable" : "---";
    var fireStyle = entity && this._config.option_color_fire_danger !== false && this.hass.states[entity].attributes.color_fill ? `background-color:${this.hass.states[entity].attributes.color_fill}; color:${this.hass.states[entity].attributes.color_text};` : "";
    if (this._config.option_color_fire_danger === false) {
      return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:fire"></ha-icon>
          </div>
          <div class="slot-text fire-danger-text" style="${fireStyle}">${fire} </div>
        </div>
      </li>`;
    } else {
      if (fireStyle === '') {
        fireStyle = "font-weight:300; padding-left:0px;";
      }
      return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:fire"></ha-icon>
          </div>
          <div class="slot-text fire-danger-text">
            <p class="fire-danger-text-color" style="${fireStyle}">${fire}</p>
          </div>
        </div>
      </li>`;
    }
  }

  get slotWind(): TemplateResult {
    const beaufort = this._config.entity_wind_speed && this._config.option_show_beaufort ? html`<div class="slot-text"></div>BFT: ${this.currentBeaufort} -&nbsp;</div>` : "";
    const bearing = this._config.entity_wind_bearing ? html`<div class="slot-text">${this.currentWindBearing}&nbsp;</div>` : "";
    const units = html`<div class="slot-text unit-small">${this.getUOM('length')}/h</div>`;
    const speed = this._config.entity_wind_speed ? html`<div class="slot-text">${this.currentWindSpeed}</div>${units}&nbsp;` : "";
    const gust = this._config.entity_wind_gust ? html`<div class="slot-text">( ${this.localeTextGust} ${this.currentWindGust}</div>${units}&nbsp)` : "";
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:weather-windy"></ha-icon>
          </div>
          ${beaufort}${bearing}${speed}${gust}
        </div>
      </li>
    `;
  }

  get slotWindKt(): TemplateResult {
    const beaufort = this._config.entity_wind_speed_kt && this._config.option_show_beaufort ? html`<div class="slot-text"></div>BFT: ${this.currentBeaufortKt} -&nbsp;</div>` : "";
    const bearing = this._config.entity_wind_bearing ? html`<div class="slot-text">${this.currentWindBearing}&nbsp;</div>` : "";
    const units = html`<div class="slot-text unit">Kt</div>`;
    const speed = this._config.entity_wind_speed_kt ? html`<div class="slot-text">${this.currentWindSpeedKt}</div>${units}&nbsp;` : "";
    const gust = this._config.entity_wind_gust_kt ? html`<div class="slot-text">( ${this.localeTextGust} ${this.currentWindGustKt}</div>${units}&nbsp)` : "";
    return html`
      <li>
        <div class="slot">
          <div class="slot-icon">
            <ha-icon icon="mdi:weather-windy"></ha-icon>
          </div>
          ${beaufort}${bearing}${speed}${gust}
        </div>
      </li>
    `;
  }

  get slotVisibility(): TemplateResult {
    const vis = this.currentVisibility;
    const units = vis !== "---" ? this.getUOM('length') : "";
    return html`
      <li>
        <div class="slot-icon">
          <ha-icon icon="mdi:weather-fog"></ha-icon>
        </div>
        <div class="slot-text visibility-text">${vis}</div>
        <div class="slot-text unit"> ${units}
        </div>
      </li>
    `;
  }

  get slotSunNext(): TemplateResult {
    return this._config.entity_sun ? this.sunSet.next : html``;
  }

  get slotSunFollowing(): TemplateResult {
    return this._config.entity_sun ? this.sunSet.following : html``;
  }

  get slotCustom1(): TemplateResult {
    var icon = this._config.custom1_icon ? this._config.custom1_icon : 'mdi:help-box';
    var value = this._config.custom1_value && this.hass.states[this._config.custom1_value] !== undefined ? this.hass.states[this._config.custom1_value].state : 'unknown';
    var unit = this._config.custom1_units ? this._config.custom1_units : '';
    return html`
      <li>
        <div class="slot-icon">
          <ha-icon icon=${icon}></ha-icon>
        </div>
        <div class="slot-text custom-1-text">${value}</div><div class="slot-text unit">${unit}</div>
      </li>
    `;
  }

  get slotCustom2(): TemplateResult {
    var icon = this._config.custom2_icon ? this._config.custom2_icon : 'mdi:help-box';
    var value = this._config.custom2_value && this.hass.states[this._config.custom2_value] !== undefined ? this.hass.states[this._config.custom2_value].state : 'unknown';
    var unit = this._config.custom2_units ? this._config.custom2_units : '';
    return html`
      <li>
        <div class="slot-icon">
          <ha-icon icon=${icon}></ha-icon>
        </div>
        <div class="slot-text custom-2-text">${value}</div><div class="slot-text unit">${unit}</div>
      </li>
    `;
  }

  get slotCustom3(): TemplateResult {
    var icon = this._config.custom3_icon ? this._config.custom3_icon : 'mdi:help-box';
    var value = this._config.custom3_value && this.hass.states[this._config.custom3_value] !== undefined ? this.hass.states[this._config.custom3_value].state : 'unknown';
    var unit = this._config.custom3_units ? this._config.custom3_units : '';
    return html`
      <li>
        <div class="slot-icon">
          <ha-icon icon=${icon}></ha-icon>
        </div>
        <div class="slot-text custom-3-text">${value}</div><div class="slot-text unit">${unit}</div>
      </li>
    `;
  }

  get slotCustom4(): TemplateResult {
    var icon = this._config.custom4_icon ? this._config.custom4_icon : 'mdi:help-box';
    var value = this._config.custom4_value && this.hass.states[this._config.custom4_value] !== undefined ? this.hass.states[this._config.custom4_value].state : 'unknown';
    var unit = this._config.custom4_units ? this._config.custom4_units : '';
    return html`
      <li>
        <div class="slot-icon">
          <ha-icon icon=${icon}></ha-icon>
        </div>
        <div class="slot-text custom-4-text">${value}</div><div class="slot-text unit">${unit}</div>
      </li>
    `;
  }

  // getters that return the value to be shown
  get currentIcon(): string {
    const entity = this._config.entity_current_icon;
    return entity && this.hass.states[entity]
      ? this.hass.states[entity].state
      : '---';
  }

  get currentTemperature(): string {
    const entity = this._config.entity_temperature;
    const digits = this._config.option_show_overview_decimals === true ? 1 : 0;
    return entity && this.hass.states[entity]
      ? entity.match('^weather.') === null
        ? (Number(this.hass.states[entity].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
        : this.hass.states[entity].attributes.temperature !== undefined
          ? (Number(this.hass.states[entity].attributes.temperature)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
          : '---'
      : '---';
  }

  get currentApparentTemperature(): string {
    const entity = this._config.entity_apparent_temp;
    const digits = this._config.option_show_overview_apparent_decimals === true ? 1 : 0;
    return entity && this.hass.states[entity]
      ? (Number(this.hass.states[entity].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : '';
  }

  get currentHumidity(): string {
    const entity = this._config.entity_humidity;
    return entity && this.hass.states[entity]
      ? entity.match('^weather.') === null
        ? (Number(this.hass.states[entity].state)).toLocaleString(this.locale)
        : this.hass.states[entity].attributes.humidity !== undefined
          ? (Number(this.hass.states[entity].attributes.humidity)).toLocaleString(this.locale)
          : '---'
      : '---';
  }

  get currentRainfall(): string {
    const entity = this._config.entity_rainfall;
    return entity && this.hass.states[entity]
      ? (Number(this.hass.states[entity].state)).toLocaleString(this.locale) : '---';
  }

  get currentPressure(): string {
    const entity = this._config.entity_pressure;
    const digits = this._config.option_slot_pressure_decimals === true ? 1 : 0;
    return entity && this.hass.states[entity]
      ? entity.match('^weather.') === null
        ? (Number(this.hass.states[entity].state)).toLocaleString(this.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
        : this.hass.states[entity].attributes.pressure !== undefined
          ? (Number(this.hass.states[entity].attributes.pressure)).toLocaleString(this.locale)
          : '---'
      : '---';
  }

  get currentVisibility(): string {
    const entity = this._config.entity_visibility;
    return entity && this.hass.states[entity]
      ? entity.match('^weather.') === null
        ? (Number(this.hass.states[entity].state)).toLocaleString(this.locale)
        : this.hass.states[entity].attributes.visibility !== undefined
          ? (Number(this.hass.states[entity].attributes.visibility)).toLocaleString(this.locale)
          : '---'
      : '---';
  }

  get currentWindBearing(): string {
    const entity = this._config.entity_wind_bearing;
    const value = entity && this.hass.states[entity]
      ? this.hass.states[entity].state
      : '';
    return entity && this.hass.states[entity]
      ? entity.match('^sensor\\.hko_') !== null
        ? this._hkoWindDirections(value)
        : entity.match('^weather.') === null
          ? isNaN(Number(value))
            ? value
            : this.windDirections[(Math.round((Number(value) / 360) * 16))]
          : this.hass.states[entity].attributes.wind_bearing !== undefined
            ? isNaN(Number(this.hass.states[entity].attributes.wind_bearing))
              ? this.hass.states[entity].attributes.wind_bearing
              : this.windDirections[(Math.round((Number(this.hass.states[entity].attributes.wind_bearing) / 360) * 16))]
            : '---'
      : '---';
  }

  get currentWindSpeed(): string {
    const entity = this._config.entity_wind_speed;
    return entity && this.hass.states[entity]
      ? entity.match('^weather.') === null
        ? Math.round(Number(this.hass.states[entity].state)).toLocaleString(this.locale)
        : this.hass.states[entity].attributes.wind_speed !== undefined
          ? Math.round(Number(this.hass.states[entity].attributes.wind_speed)).toLocaleString(this.locale)
          : '---'
      : '---';
  }

  get currentWindGust(): string {
    const entity = this._config.entity_wind_gust;
    return entity && this.hass.states[entity]
      ? Math.round(Number(this.hass.states[entity].state)).toLocaleString(this.locale) : '---';
  }

  get currentWindSpeedKt(): string {
    const entity = this._config.entity_wind_speed_kt;
    return entity && this.hass.states[entity]
      ? entity.match('^weather.') === null
        ? Math.round(Number(this.hass.states[entity].state)).toLocaleString(this.locale)
        : this.hass.states[entity].attributes.wind_speed !== undefined
          ? Math.round(Number(this.hass.states[entity].attributes.wind_speed)).toLocaleString(this.locale)
          : '---'
      : '---';
  }

  get currentWindGustKt(): string {
    const entity = this._config.entity_wind_gust_kt;
    return entity && this.hass.states[entity]
      ? Math.round(Number(this.hass.states[entity].state)).toLocaleString(this.locale) : '---';
  }

  // windDirections - returns set of possible wind directions by specified language
  get windDirections(): string[] {
    const windDirections_en = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'N'];
    const windDirections_fr = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO', 'N'];
    const windDirections_de = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'N'];
    const windDirections_nl = ['N', 'NNO', 'NO', 'ONO', 'O', 'OZO', 'ZO', 'ZZO', 'Z', 'ZZW', 'ZW', 'WZW', 'W', 'WNW', 'NW', 'NNW', 'N'];
    const windDirections_he = ['צפון', 'צ-צ-מז', 'צפון מזרח', 'מז-צ-מז', 'מזרח', 'מז-ד-מז', 'דרום מזרח', 'ד-ד-מז', 'דרום', 'ד-ד-מע', 'דרום מערב', 'מע-ד-מע', 'מערב', 'מע-צ-מע', 'צפון מערב', 'צ-צ-מע', 'צפון'];
    const windDirections_da = ['N', 'NNØ', 'NØ', 'ØNØ', 'Ø', 'ØSØ', 'SØ', 'SSØ', 'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV', 'N'];
    const windDirections_ru = ['С', 'ССВ', 'СВ', 'ВСВ', 'В', 'ВЮВ', 'ЮВ', 'ЮЮВ', 'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ', 'З', 'ЗСЗ', 'СЗ', 'ССЗ', 'С'];
    const windDirections_bg = ['С', 'ССИ', 'СИ', 'ИСИ', 'И', 'ИЮИ', 'ЮИ', 'ЮЮИ', 'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ', 'З', 'ЗСЗ', 'СЗ', 'ССЗ', 'С'];

    switch (this.locale) {
      case "it":
      case "fr":
        return windDirections_fr;
      case "de":
        return windDirections_de;
      case "nl":
        return windDirections_nl;
      case "he":
        return windDirections_he;
      case "ru":
        return windDirections_ru;
      case "da":
        return windDirections_da;
      case "bg":
        return windDirections_bg;
      default:
        return windDirections_en;
    }
  }

  private _hkoWindDirections(dir: string): string {
    const locale = this.locale || '';
    const isTC = /^zh-(?:hant|hk|mo|tw)$/i.test(locale);
    const isSC = /^(?:zh|zh-(?:hans|cn))$/i.test(locale);
    const mapping: Record<string, { tc: string; sc: string; en: string }> = {
      'North':     { tc: '北',   sc: '北',   en: 'N' },
      '北':        { tc: '北',   sc: '北',   en: 'N' },
      'Northeast': { tc: '東北', sc: '东北', en: 'NE' },
      '東北':      { tc: '東北', sc: '东北', en: 'NE' },
      'East':      { tc: '東',   sc: '东',   en: 'E' },
      '東':        { tc: '東',   sc: '东',   en: 'E' },
      'Southeast': { tc: '東南', sc: '东南', en: 'SE' },
      '東南':      { tc: '東南', sc: '东南', en: 'SE' },
      'South':     { tc: '南',   sc: '南',   en: 'S' },
      '南':        { tc: '南',   sc: '南',   en: 'S' },
      'Southwest': { tc: '西南', sc: '西南', en: 'SW' },
      '西南':      { tc: '西南', sc: '西南', en: 'SW' },
      'West':      { tc: '西',   sc: '西',   en: 'W' },
      '西':        { tc: '西',   sc: '西',   en: 'W' },
      'Northwest': { tc: '西北', sc: '西北', en: 'NW' },
      '西北':      { tc: '西北', sc: '西北', en: 'NW' },
      'Variable':  { tc: '不定', sc: '不定', en: 'VRB' },
      '風向不定':  { tc: '不定', sc: '不定', en: 'VRB' },
      'Calm':      { tc: '無風', sc: '无风', en: 'O' },
      '無風':      { tc: '無風', sc: '无风', en: 'O' },
      'N/A':       { tc: '維修', sc: '维修', en: 'M' }
    };
    const result = mapping[dir];
    if (result) {
      if (isTC) return result.tc;
      if (isSC) return result.sc;
      return result.en;
    }
    return dir;
  }

  localeTextPSR(psr: string, variant: 'short' | 'full' = 'short'): string {
    const locale = this.locale || '';
    const isTC = /^zh-(?:hant|hk|mo|tw)$/i.test(locale);
    const isSC = /^(?:zh|zh-(?:hans|cn))$/i.test(locale);
    type PsrKey = 'high' | 'medium_high' | 'medium' | 'medium_low' | 'low';
    const normalizeMap: Record<string, PsrKey> = {
      'High': 'high',
      '高': 'high',
      'Medium High': 'medium_high',
      '中高': 'medium_high',
      'Medium': 'medium',
      '中': 'medium',
      'Medium Low': 'medium_low',
      '中低': 'medium_low',
      'Low': 'low',
      '低': 'low'
    };
    const labels: Record<PsrKey, {
      tc: { short: string; full: string };
      sc: { short: string; full: string };
      en: { short: string; full: string };
    }> = {
      high: {
        tc: { short: '高', full: '高' },
        sc: { short: '高', full: '高' },
        en: { short: 'Hi', full: 'High' }
      },
      medium_high: {
        tc: { short: '中高', full: '中高' },
        sc: { short: '中高', full: '中高' },
        en: { short: 'Med Hi', full: 'Medium High' }
      },
      medium: {
        tc: { short: '中', full: '中' },
        sc: { short: '中', full: '中' },
        en: { short: 'Med', full: 'Medium' }
      },
      medium_low: {
        tc: { short: '中低', full: '中低' },
        sc: { short: '中低', full: '中低' },
        en: { short: 'Med Lo', full: 'Medium Low' }
      },
      low: {
        tc: { short: '低', full: '低' },
        sc: { short: '低', full: '低' },
        en: { short: 'Lo', full: 'Low' }
      }
    };
    const key = normalizeMap[psr?.trim()];
    if (!key) return psr;
    if (isTC) return labels[key].tc[variant];
    if (isSC) return labels[key].sc[variant];
    return labels[key].en[variant];
  }

  get _forecastWidthClass(): string {
    if (this._cardWidth >= 430) return 'is-wide';
    if (this._cardWidth < 387) return 'is-narrow';
    return 'is-normal';
  }

  get _psrVariant(): 'short' | 'full' {
    return this._cardWidth >= 430 ? 'full' : 'short';
  }

  // beaufortWind - returns the wind speed on the beaufort scale
  // reference https://en.wikipedia.org/wiki/Beaufort_scale
  get currentBeaufort(): string {
    const entity = this._config.entity_wind_speed;
    if (entity && this.hass.states[entity] && !isNaN(Number(this.hass.states[entity].state))) {
      const value = Number(this.hass.states[entity].state);
      switch (this.hass.states[entity].attributes.unit_of_measurement) {
        case 'mph':
          if (value >= 73) return '12';
          if (value >= 64) return '11';
          if (value >= 55) return '10';
          if (value >= 47) return '9';
          if (value >= 39) return '8';
          if (value >= 32) return '7';
          if (value >= 25) return '6';
          if (value >= 19) return '5';
          if (value >= 13) return '4';
          if (value >= 8) return '3';
          if (value >= 4) return '2';
          if (value >= 1) return '1';
          return '0';
        case 'm/s':
          if (value >= 32.7) return '12';
          if (value >= 28.5) return '11';
          if (value >= 24.5) return '10';
          if (value >= 20.8) return '9';
          if (value >= 17.2) return '8';
          if (value >= 13.9) return '7';
          if (value >= 10.8) return '6';
          if (value >= 8) return '5';
          if (value >= 5.5) return '4';
          if (value >= 3.4) return '3';
          if (value >= 1.6) return '2';
          if (value >= 0.5) return '1';
          return '0';
        default: // Assume km/h
          if (value >= 118) return '12';
          if (value >= 103) return '11';
          if (value >= 89) return '10';
          if (value >= 75) return '9';
          if (value >= 62) return '8';
          if (value >= 50) return '7';
          if (value >= 39) return '6';
          if (value >= 29) return '5';
          if (value >= 20) return '4';
          if (value >= 12) return '3';
          if (value >= 6) return '2';
          if (value >= 2) return '1';
          return '0';
      }
    }
    return '---';
  }

  get currentBeaufortKt(): string {
    const entity = this._config.entity_wind_speed_kt;
    if (entity && this.hass.states[entity] && !isNaN(Number(this.hass.states[entity].state))) {
      const value = Number(this.hass.states[entity].state);
      {
        if (value >= 64) return '12';
        if (value >= 56) return '11';
        if (value >= 48) return '10';
        if (value >= 41) return '9';
        if (value >= 34) return '8';
        if (value >= 28) return '7';
        if (value >= 22) return '6';
        if (value >= 17) return '5';
        if (value >= 11) return '4';
        if (value >= 7) return '3';
        if (value >= 4) return '2';
        if (value >= 1) return '1';
        return '0';
      }
    }
    return '---';
  }

  get currentUv(): string {
    const entity = this._config.entity_uv_alert_summary;
    if (entity && this.hass.states[entity] && !isNaN(Number(this.hass.states[entity].state))) {
      const value = Number(this.hass.states[entity].state);
      switch (this.locale) {
        case 'zh':
        case 'zh-cn':
          if (value >= 11) return '极高';
          if (value >= 8) return '甚高';
          if (value >= 6) return '高';
          if (value >= 3) return '中';
          if (value >= 0) return '低';
          break;
        case 'zh-hk':
          if (value >= 11) return '極高';
          if (value >= 8) return '甚高';
          if (value >= 6) return '高';
          if (value >= 3) return '中';
          if (value >= 0) return '低';
          break;
        default:
          if (value >= 11) return 'Extreme';
          if (value >= 8) return 'Very high';
          if (value >= 6) return 'High';
          if (value >= 3) return 'Moderate';
          if (value >= 0) return 'Low';
      }
    }
    return '---';
  }

  // SunSetAndRise: returns set and rise information
  get sunSet(): { next: TemplateResult, following: TemplateResult, nextText: string, followingText: string, nextIcon: string, followingIcon: string } {
    var nextSunSet: string;
    var nextSunRise: string;
    switch (this.timeFormat) {
      case '12hour':
        nextSunSet = this._config.entity_sun && (this.hass.states[this._config.entity_sun] !== undefined) ? new Date(this.hass.states[this._config.entity_sun].attributes.next_setting).toLocaleTimeString(this.locale, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(" am", "am").replace(" pm", "pm") : "";
        nextSunRise = this._config.entity_sun && (this.hass.states[this._config.entity_sun] !== undefined) ? new Date(this.hass.states[this._config.entity_sun].attributes.next_rising).toLocaleTimeString(this.locale, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(" am", "am").replace(" pm", "pm") : "";
        break;
      case '24hour':
        nextSunSet = this._config.entity_sun && (this.hass.states[this._config.entity_sun] !== undefined) ? new Date(this.hass.states[this._config.entity_sun].attributes.next_setting).toLocaleTimeString(this.locale, { hour: '2-digit', minute: '2-digit', hour12: false }) : "";
        nextSunRise = this._config.entity_sun && (this.hass.states[this._config.entity_sun] !== undefined) ? new Date(this.hass.states[this._config.entity_sun].attributes.next_rising).toLocaleTimeString(this.locale, { hour: '2-digit', minute: '2-digit', hour12: false }) : "";
        break;
      case 'system':
        nextSunSet = this._config.entity_sun && (this.hass.states[this._config.entity_sun] !== undefined) ? new Date(this.hass.states[this._config.entity_sun].attributes.next_setting).toLocaleTimeString(navigator.language, { timeStyle: 'short' }).replace(" am", "am").replace(" pm", "pm") : "";
        nextSunRise = this._config.entity_sun && (this.hass.states[this._config.entity_sun] !== undefined) ? new Date(this.hass.states[this._config.entity_sun].attributes.next_rising).toLocaleTimeString(navigator.language, { timeStyle: 'short' }).replace(" am", "am").replace(" pm", "pm") : "";
        break;
    }
    var nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);
    if ((this._config.entity_sun) && (this.hass.states[this._config.entity_sun] !== undefined)) {
      if (this.hass.states[this._config.entity_sun].state === "above_horizon") {
        nextSunRise = nextDate.toLocaleDateString(this.locale, { weekday: 'short' }) + " " + nextSunRise;
        return {
          'next': html`
            <li>
              <div class="slot-icon">
                <ha-icon id="sun-next-icon" icon="mdi:weather-sunset-down"></ha-icon>
              </div>
              <div class="slot-text sun-next-text">${nextSunSet}</div>
            </li>`,
          'following': html`
            <li>
              <div class="slot-icon">
                <ha-icon id="sun-following-icon" icon="mdi:weather-sunset-up"></ha-icon>
              </div>
              <div class="slot-text sun-following-text">${nextSunRise}</div>
            </li>`,
          'nextText': nextSunSet,
          'followingText': nextSunRise,
          'nextIcon': "mdi:weather-sunset-down",
          'followingIcon': "mdi:weather-sunset-up",
        };
      } else {
        if (new Date().getDate() != new Date(this.hass.states[this._config.entity_sun].attributes.next_rising).getDate()) {
          nextSunRise = nextDate.toLocaleDateString(this.locale, { weekday: 'short' }) + " " + nextSunRise;
          nextSunSet = nextDate.toLocaleDateString(this.locale, { weekday: 'short' }) + " " + nextSunSet;
        }
        return {
          'next': html`
            <li>
              <div class="slot-icon">
                <ha-icon id="sun-next-icon" icon="mdi:weather-sunset-up"></ha-icon>
              </div>
              <div class="slot-text sun-next-text">${nextSunRise}</div>
            </li>`,
          'following': html`
            <li>
              <div class="slot-icon">
                <ha-icon id="sun-following-icon" icon="mdi:weather-sunset-down"></ha-icon>
              </div>
              <div class="slot-text sun-following-text">${nextSunSet}</div>
            </li>`,
          'nextText': nextSunRise,
          'followingText': nextSunSet,
          'nextIcon': "mdi:weather-sunset-up",
          'followingIcon': "mdi:weather-sunset-down",
        };
      }
    } else {
      return {
        'next': html``,
        'following': html``,
        nextText: "",
        followingText: "",
        nextIcon: "",
        followingIcon: ""
      }
    }
  }

  // is12Hour - returns true if 12 hour clock or false if 24
  get timeFormat(): timeFormat {
    return this._config.option_time_format ? this._config.option_time_format : 'system';
  }

  // get the icon that matches the current conditions
  private _weatherIcon(conditions: string): string {
    switch (conditions) {
      case '50': return this.sunny_icon;
      case '51': return this.sunny_periods_icon;
      case '52': return this.sunny_intervals_icon;
      case '53': return this.light_showers_icon;
      case '54': return this.showers_icon;
      case '60': return this.cloudy_icon;
      case '61': return this.overcast_icon;
      case '62': return this.light_rain_icon;
      case '63': return this.rain_icon;
      case '64': return this.heavy_rain_icon;
      case '65': return this.thunderstorms_icon;
      case '70': return this.moon_new_icon;
      case '71': return this.moon_waxing_crescent_icon;
      case '72': return this.moon_first_quarter_icon;
      case '73': return this.moon_full_icon;
      case '74': return this.moon_last_quarter_icon;
      case '75': return this.moon_waning_crescent_icon;
      case '76': return this.mainly_cloudy_icon;
      case '77': return this.mainly_fine_icon;
      case '80': return this.windy_icon;
      case '81': return this.dry_icon;
      case '82': return this.humid_icon;
      case '83': return this.fog_icon;
      case '84': return this.mist_icon;
      case '85': return this.haze_icon;
      case '90': return this.hot_icon;
      case '91': return this.warm_icon;
      case '92': return this.cool_icon;
      case '93': return this.cold_icon;
    }
    return 'unknown';
  }

  get dayOrNight(): string {
    const transformDayNight = { "below_horizon": "night", "above_horizon": "day", };
    return this._config.entity_sun && this.hass.states[this._config.entity_sun] !== undefined ? transformDayNight[this.hass.states[this._config.entity_sun].state] : 'day';
  }

  get wrain(): string {
    try {
     const entity = this._config?.entity_hko_warnsum;
     if (!entity) return '';
     const wrainData = this.hass.states[entity]?.attributes?.WRAIN;
     if (!wrainData || wrainData.actionCode === 'CANCEL') {
      return '';
     }
     switch (wrainData.code) {
       case 'WRAINA': return '-wraina';
       case 'WRAINR': return '-wrainr';
       case 'WRAINB': return '-wrainb';
       default: return '';
     }
    } catch {
     return '';
    }
  }

  get wts(): string {
    try {
     const entity = this._config?.entity_hko_warnsum;
     if (!entity) return '';
     const wtsData = this.hass.states[entity]?.attributes?.WTS;
     if (wtsData && wtsData.actionCode !== 'CANCEL') {
      return '-wts';
     }
     return '';
    } catch {
     return '';
    }
  }
 
  get sunny_icon(): string {
    return `sunny`;
  }

  get sunny_periods_icon(): string {
    return `sunny-periods${this.wts}`;
  }

  get sunny_intervals_icon(): string {
    return `cloudy-day-3${this.wts}`;
  }

  get light_showers_icon(): string {
    return `light-showers${this.wts}`;
  }

  get showers_icon(): string {
    return `showers${this.wts}`;
  }

  get cloudy_icon(): string {
    return `cloudy${this.wts}`;
  }

  get overcast_icon(): string {
    return `overcast${this.wts}`;
  }

  get light_rain_icon(): string {
    return `light-rain${this.wts}`;
  }

  get rain_icon(): string {
    return `rain${this.wrain}${this.wts}`;
  }

  get heavy_rain_icon(): string {
    return `heavy-rain${this.wrain}${this.wts}`;
  }

  get thunderstorms_icon(): string {
    return `thunderstorms${this.wrain}`;
  }

  get moon_new_icon(): string {
    return `moon-new`;
  }

  get moon_waxing_crescent_icon(): string {
    return `moon-waxing-crescent`;
  }

  get moon_first_quarter_icon(): string {
    return `moon-first-quarter`;
  }

  get moon_full_icon(): string {
    return `moon-full`;
  }

  get moon_last_quarter_icon(): string {
    return `moon-last-quarter`;
  }

  get moon_waning_crescent_icon(): string {
    return `moon-waning-crescent`;
  }

  get mainly_cloudy_icon(): string {
    return `mainly-cloudy${this.wts}`;
  }

  get mainly_fine_icon(): string {
    return `mainly-fine${this.wts}`;
  }

  get windy_icon(): string {
    return `windy`;
  }

  get dry_icon(): string {
    return `dry`;
  }

  get humid_icon(): string {
    return `humid`;
  }

  get fog_icon(): string {
    return `fog${this.wts}`;
  }

  get mist_icon(): string {
    return `mist${this.wts}`;
  }

  get haze_icon(): string {
    return `haze${this.wts}`;
  }

  get hot_icon(): string {
    return `hot`;
  }

  get warm_icon(): string {
    return `warm`;
  }

  get cool_icon(): string {
    return `cool`;
  }

  get cold_icon(): string {
    return `cold`;
  }

  get locale(): string | undefined {
    try {
      Intl.NumberFormat(this._config.option_locale);
      return this._config.option_locale;
    } catch {
      return undefined;
    }
  }

  get localeTextFeelsLike(): string {
    switch (this.locale) {
      case 'it': return "Percepito";
      case 'fr': return "Ressenti";
      case 'de': return "Gefühlt";
      case 'nl': return "Voelt als";
      case 'pl': return "Odczuwalne";
      case 'he': return "מרגיש כמו";
      case 'da': return "Føles som";
      case 'ru': return "Ощущается как";
      case 'ua': return "Відчувається як";
      case 'bg': return "Усеща се като";
      case 'zh':
      case 'zh-cn': return "体感";
      case 'zh-hk': return "體感";
      default: return "Feels like";
    }
  }

  get localeTextObservedMax(): string {
    switch (this.locale) {
      default: return "Observed Max";
    }
  }

  get localeTextObservedMin(): string {
    switch (this.locale) {
      default: return "Observed Min";
    }
  }

  get localeTextObsMax(): string {
    switch (this.locale) {
      default: return "Obs Max";
    }
  }

  get localeTextObsMin(): string {
    switch (this.locale) {
      default: return "Obs Min";
    }
  }

  get localeTextForecastMax(): string {
    switch (this.locale) {
      case 'it': return "Max oggi";
      case 'fr': return "Max aujourd'hui";
      case 'de': return "Max heute";
      case 'nl': return "Max vandaag";
      case 'pl': return "Maks Temperatura";
      case 'he': return "מקסימלי היום";
      case 'da': return "Højeste i dag";
      case 'ru': return "Макс сегодня";
      case 'ua': return "Макс сьогодні";
      case 'bg': return "Макс днес";
      default: return "Forecast Max";
    }
  }

  get localeTextForecastMin(): string {
    switch (this.locale) {
      case 'it': return "Min oggi";
      case 'fr': return "Min aujourd'hui";
      case 'de': return "Min heute";
      case 'nl': return "Min vandaag";
      case 'pl': return "Min Temperatura";
      case 'he': return "דקות היום";
      case 'da': return "Laveste i dag";
      case 'ru': return "Мин сегодня";
      case 'ua': return "Мін сьогодні";
      case 'bg': return "Мин днес";
      default: return "Forecast Min";
    }
  }

  get localeTextPosToday(): string {
    switch (this.locale) {
      case 'it': return "Previsione";
      case 'fr': return "Prévoir";
      case 'de': return "Vorhersage";
      case 'nl': return "Prognose";
      case 'pl': return "Prognoza";
      case 'he': return "תַחֲזִית";
      case 'da': return "Vejrudsigt";
      case 'ru': return "Прогноз";
      case 'ua': return "Прогноз";
      case 'bg': return "Прогноза";
      default: return "Forecast";
    }
  }

  get localeTextPosTomorrow(): string {
    switch (this.locale) {
      case 'it': return "Prev per domani";
      case 'fr': return "Prév demain";
      case 'de': return "Prog morgen";
      case 'nl': return "Prog morgen";
      case 'pl': return "Prog jutro";
      case 'he': return "תחזית מחר";
      case 'da': return "Prog i morgen";
      case 'ru': return "Прогноз на завтра";
      case 'ua': return "Прогноз на завтра";
      case 'bg': return "Прогноза за утре";
      default: return "Fore Tom";
    }
  }

  get localeTextFore(): string {
    switch (this.locale) {
      case 'it': return "Prev";
      case 'fr': return "Prév";
      case 'de': return "Prog";
      case 'nl': return "Prog";
      case 'pl': return "Prog";
      case 'he': return "תַחֲזִית";
      case 'da': return "Prog";
      case 'ru': return "Прогноз";
      case 'ua': return "Прогноз";
      case 'bg': return "Прогноза";
      default: return "Fore";
    }
  }

  get localeTextUVRating(): string {
    switch (this.locale) {
      case 'it': return "UV";
      case 'fr': return "UV";
      case 'de': return "UV";
      case 'nl': return "UV";
      case 'pl': return "UV";
      case 'he': return "UV";
      case 'da': return "UV";
      case 'ru': return "УФ";
      case 'ua': return "УФ";
      case 'bg': return "UV";
      case 'zh':
      case 'zh-cn': return "紫外线";
      case 'zh-hk': return "紫外線";
      default: return "UV";
    }
  }

  get localeTextFireDanger(): string {
    switch (this.locale) {
      case 'it': return "Fuoco";
      case 'fr': return "Feu";
      case 'de': return "Feuer";
      case 'nl': return "Brand";
      case 'pl': return "Ogień";
      case 'he': return "אֵשׁ";
      case 'da': return "Brand";
      case 'ru': return "Огонь";
      case 'ua': return "Вогонь";
      case 'bg': return "Пожар";
      default: return "Fire";
    }
  }

  get localeTextGust(): string {
    switch (this.locale) {
      case 'it': return "Raffica";
      case 'fr': return "Rafale";
      case 'de': return "Böen";
      case 'nl': return "Windvlaag";
      case 'pl': return "Poryw";
      case 'he': return "משב";
      case 'da': return "Vindstød";
      case 'ru': return "Порыв";
      case 'ua': return "Порив";
      case 'bg': return "Порив";
      case 'zh':
      case 'zh-cn': return "阵风";
      case 'zh-hk': return "陣風";
      default: return "Gust";
    }
  }

  getUOM(measure: string): string {
    const lengthUnit = this.hass.config.unit_system.length;

    switch (measure) {
      case 'air_pressure':
        return this._config.entity_pressure !== undefined && this.hass.states[this._config.entity_pressure].attributes.unit_of_measurement !== undefined ?
          this.hass.states[this._config.entity_pressure].attributes.unit_of_measurement as string :
          lengthUnit === 'km' ?
            'hPa' :
            'mbar';
      case 'length':
        return lengthUnit;
      case 'precipitation':
        return lengthUnit === 'km' ? 'mm' : 'in';
      case 'intensity':
        return lengthUnit === 'km' ? 'mm/h' : 'in/h';
      default:
        return this.hass.config.unit_system[measure] || '';
    }
  }

  private _showConfigWarning(warnings: string[]): TemplateResult {
    // const errorCard = <LovelaceCard>document.createElement('hui-error-card');
     
    return html`
      <hui-warning>
        <div>Weather Card</div>
        ${warnings.map(warning => html`<div>${warning}</div>`)}
      </hui-warning>
    `;
  }

  // https://lit.dev/docs/components/styles/
  get styles(): CSSResult {
    // Get config flags or set defaults if not configured
    const biggerIconHeight = this._config.bigger_icon_height || "140px";
    const biggerIconWidth = this._config.bigger_icon_width || "140px";
    const tooltipVisible = this._config.option_tooltips ? "visible" : "hidden";
    const tempFontWeight = this._config.temp_font_weight || "300";
    const tempFontSize = this._config.temp_font_size || "4em";
    const currentTextFontSize = this._config.current_text_font_size || "21px";
    const currentTextAlignment = this._config.current_text_alignment || "center";

    return css`
      .card {
        padding: 8px 16px 8px 16px;
      }
      .content {
        align-items: center;
      }
      .card-header {
        font-size: 1.5em;
        color: var(--primary-text-color);
      }
      .section {
        margin: -1px;
        border: 1px solid transparent;
        padding-top: 8px;
        padding-bottom: 8px;
      }
      .updated {
        font-size: 0.9em;
        font-weight: 1em;
        color: var(--primary-text-color);
      }
      .overview-top {
        display: flex;
        justify-content: flex-start;
        flex-wrap: nowrap;
      }
      .overview-top > .currentTemps {
        margin-left: auto;
      }
      .stacked {
        position: absolute;
      }
      .top-left {
        display: flex;
        flex-direction: column;
        height: 85px;
      }
      .top-left-obs {
        display: flex;
        flex-direction: column;
      }
      .big-icon {
        height: ${unsafeCSS(biggerIconHeight)};
        width: ${unsafeCSS(biggerIconWidth)};
        position: relative;
      }
      .unknown-forecast {
        position: relative;
        top: -30px;
        text-align: center;
      }
      .currentTemps {
        display: flex;
        align-self: flex-start;
        flex-direction: column;
        height: 60px;
      }
      .current-temp {
        display: table-row;
        margin-left: auto;
        padding: 2px 0px;
      }
      .temp {
        display:table-cell;
        font-weight: ${unsafeCSS(tempFontWeight)};
        font-size: ${unsafeCSS(tempFontSize)};
        color: var(--primary-text-color);
        position: relative;
        line-height: 74%;
      }
      .unit-temp-big {
        display: table-cell;
        vertical-align: top;
        font-weight: ${unsafeCSS(tempFontWeight)};
        font-size: 1.5em;
        color: var(--primary-text-color);
        position: relative;
        line-height: 74%;
      }
      .apparent-temp {
        display: table-row;
        margin-left: auto;
        height: 24px;
      }
      .apparent {
        display: table-cell;
        color: var(--primary-text-color);
        font-weight: 1em;
        position: relative;
        line-height: 24px;
      }
      .unit-temp-small {
        display: table-cell;
        vertical-align: top;
        font-size: 10.5px;
        color: var(--primary-text-color);
        position: relative;
        line-height: 14px;
        padding-top: 3.6px;
        padding-left: 1px;
      }
      .line {
        margin-top : 7px;
        margin-bottom: -9px;
        color: var(--primary-text-color);
      }
      .forecast-text {
        font-size: ${unsafeCSS(currentTextFontSize)};
        text-align: ${unsafeCSS(currentTextAlignment)};
        line-height: 25px;
      }
      .forecast-text-right {
        font-size: ${unsafeCSS(currentTextFontSize)};
        text-align: ${unsafeCSS(currentTextAlignment)};
        width: 100%;
        align-items: center;
        display: flex;
        justify-content: center;
        line-height: 25px;
        margin-left: -40px;
      }
      .variations {
        display: flex;
        flex-flow: row wrap;
        font-weight: 1em;
        color: var(--primary-text-color);
        list-style: none;
        margin-block-start: 0px;
        margin-block-end: 0px;
        padding-inline-start: 8px;
      }
      .slot-list-item-1 {
        min-width:50%;
        padding-right: 8px;
      }
      .slot-list {
        list-style: none;
        padding: 0;
      }
      .slot-list li {
        height:24px;
      }
      .variations-ugly {
        display: flex;
        flex-flow: row wrap;
        justify-content: space-between;
        font-weight: 1em;
        color: var(--primary-text-color);
        list-style: none;
        margin-block-start: 0px;
        margin-block-end: 0px;
        padding-inline-start: 8px;
      }
      .ha-icon {
        height: 24px;
        margin-right: 5px;
        color: var(--state-icon-color);
      }
      .unit-small {
        font-size: 0.8em;
        display: table-cell;
        padding-left: 1px;
      }
      .unit {
        font-size: 1em;
        display: table-cell;
        padding-left: 1px;
      }      
      .slot {
        display: table-row;
      }
      .slot-icon {
        display: table-cell;
        position: relative;
        height: 18px;
        padding-right: 5px;
        color: var(--state-icon-color);
      }
      .slot-text {
        display: table-cell;
        position: relative;
      }
      .fire-danger-text-color {
        display: inline-block;
        height: 18px;
        line-height: 20px;
        text-align: left;
        vertical-align: middle;
        margin: 0;
        padding-left: 4px;
        font-weight: 600;
        width: 108px;
      }
      .daily-forecast-horiz-section {
        display: flex;
        flex-flow: row wrap;
        width: 100%;
        margin: 0;
        clear: both;
      }
      .daily-forecast-horiz-section .day-horiz:nth-last-child(1) {
        border-right: transparent;
      }
      .day-horiz {
        flex: 1;
        float: left;
        text-align: center;
        color: var(--primary-text-color);
        border-right: 1px solid #d9d9d9;
        margin-right: -1px;
        box-sizing: border-box;
      }
      .daily-forecast-vert-section {
        display: flex;
        flex-flow: column nowrap;
        margin: 0 auto;
        clear: both;
      }
      .day-vert {
        display: flex;
        flex: 1;
        width: 100%;
        align-items: flex-start;
        gap: 10px;
        color: var(--primary-text-color);
        border-top: 1px solid #d9d9d9;
        line-height: 24px;
        box-sizing: border-box;
        padding-top: 6px;
        padding-bottom: 8px;
      }
      .dayname {
        text-transform: capitalize;
      }
      .icon {
        width: 55px;
        height: 55px;
        margin: auto;
        display: inline-block;
        background-size: contain;
        background-position: center center;
        background-repeat: no-repeat;
        text-indent: -9999px;
      }
      .f-slot-horiz {
        display: inline-block;
        text-align: center;
        list-style: none;
        overflow: hidden;
        font-weight: 1em;
        padding: 0;
        margin-block-start: 0;
        margin-block-end: -12px;
      }
      .f-slot-horiz-text {
        height:20px;
      }
      .f-slot-horiz-icon {
        height:50px;
      }
      .f-summary-vert {
        padding-left: 0;
        font-weight: 400;
        display: block;
      }
      .f-extended {
        display: inline-table;
        font-size: 1em;
        padding-top: 8px;
        line-height:20px;
      }
      .extended-section .f-extended {
        padding-top: 0;
      }
      .highTemp {
        display: table-cell;
        font-weight: bold;
      }
      .lowTemp {
        display: table-cell;
        font-weight: 1em;
        color: var(--secondary-text-color);
      }
      .slash {
        padding-left: 2px;
        padding-right: 2px;
      }
      .rh {
        display: table-cell;
        font-weight: 1em;
        color: var(--primary-text-color);
      }
      .psr {
        display: table-cell;
        font-weight: 1em;
        color: var(--primary-text-color);
        white-space: nowrap;
      }
      .fcasttooltip {
        position: relative;
        display: inline-block;
      }
      .fcasttooltip .fcasttooltipblock {
        visibility: hidden;
        background-color: #4B9BEF;
        color: #FFFFFF;
        text-align: center;
        border-radius: 6px;
        border-style: solid;
        border-color: #FFA100;
        border-width: 1px;
        padding: 5px 0;
        position: absolute;
        z-index: 1;
        bottom: 107%;
        margin-left: -2px;
      }
      .fcasttooltip:hover .fcasttooltipblock {
        visibility: ${unsafeCSS(tooltipVisible)};
      }
      .fcasttooltiptext {
        padding-left: 8px;
        padding-right: 8px;
      }
      .day-vert-left {
        flex: 0 0 64px;
        width: 64px;
        min-width: 64px;
        max-width: 64px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
      }
      .dayname-vert {
        min-width: 64px;
        max-width: 64px;
        text-transform: none;
        text-align: center;
        line-height: 20px;
        padding-top: 2px;
      }
      .day-vert-date {
        color: var(--primary-text-color);
        text-align: center;
        text-transform: capitalize;
      }
      .day-vert-weekday {
        color: var(--primary-text-color);
        text-align: center;
        text-transform: capitalize;
      }
      .day-vert-dayicon {
        width: 64px;
        min-width: 64px;
        max-width: 64px;
        float: none;
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: 4px;
        margin-bottom: 0;
        text-align: center;
      }
      .icon-vert {
        width: 55px;
        height: 55px;
        margin: 0 auto;
        display: block;
      }
      .day-vert-right {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        padding-top: 2px;
      }
      .day-vert-metrics {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px 10px;
        line-height: 22px;
      }
      .metric-inline {
        display: inline-flex;
        align-items: center;
        white-space: nowrap;
        flex: 0 0 auto;
      }
      .metric-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-right: 4px;
        white-space: nowrap;
        color: var(--state-icon-color); 
      }
      .metric-value{
        white-space: nowrap;
      }
      .day-vert-wind {
        display: block;
        padding-top: 4px;
        text-align: left;
        line-height: 22px;
      }
      .day-vert-summary {
        display: block;
        padding-top: 4px;
        text-align: left;
        line-height: 22px;
      }
      .highTemp-vert {
        display: inline-block;
        font-weight: bold;
      }
      .lowTemp-vert {
        display: inline-block;
        font-weight: 1em;
        color: var(--secondary-text-color);
      }
      .unit-small-vert {
        display: inline-block;
        font-size: 10.5px;
      }      .day-vert.is-normal .day-vert-metrics {
        gap: 6px 10px;
      }
      .day-vert.is-narrow .day-vert-metrics {
        gap: 4px 6px;
        line-height: 20px;
      }

      .day-vert.is-narrow .metric-label {
        margin-right: 2px;
      }

      .day-vert.is-narrow .metric-value,
      .day-vert.is-narrow .psr {
        font-size: 0.95em;
      }

      .day-vert.is-wide .day-vert-metrics {
        gap: 6px 10px;
      }

      .day-vert.is-wide .metric-value,
      .day-vert.is-wide .psr {
        font-size: 1em;
      }
    `;
  }
}

