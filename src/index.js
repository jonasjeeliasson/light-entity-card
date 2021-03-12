import '@babel/polyfill';

import { html, LitElement } from 'lit-element';
import style from './style';

import defaultConfig from './defaults';
import LightEntityCardEditor from './index-editor';
import packageJson from '../package.json';

const editorName = 'light-entity-card-editor';
customElements.define(editorName, LightEntityCardEditor);

/* eslint no-console: 0 */
console.info(
  `%c  LIGHT-ENTITY-CARD   \n%c  Version ${packageJson.version}       `,
  'color: orange; font-weight: bold; background: black',
  // eslint-disable-next-line comma-dangle
  'color: white; font-weight: bold; background: dimgray',
);

class LightEntityCard extends LitElement {
  async firstUpdated() {
    if (window.loadCardHelpers) {
      const helpers = await window.loadCardHelpers();
      helpers.importMoreInfoControl('light');
    }
  }

  static get properties() {
    return {
      hass: Object,
      config: Object,
    };
  }

  /**
   * checks and saves config of entity
   * @param {*} config
   */
  setConfig(config) {
    if (!config.entity) throw Error('entity required.');

    this.config = {
      ...defaultConfig,
      ...config,
    };

    this._hueSegments = this.config.smooth_color_wheel ? 0 : 24;
    this._saturationSegments = this.config.smooth_color_wheel ? 0 : 8;
  }

  static async getConfigElement() {
    // eslint-disable-next-line no-undef
    return document.createElement(editorName);
  }

  static get featureNames() {
    return {
      brightness: 1,
      colorTemp: 2,
      effectList: 4,
      color: 16,
      whiteValue: 128,
    };
  }

  static get cmdToggle() {
    return {
      on: 'turn_on',
      off: 'turn_off',
    };
  }

  static get entityLength() {
    return {
      light: 10,
      switch: 1,
    };
  }

  /**
   * get the current size of the card
   * @return {Number}
   */
  getCardSize() {
    if (!this.config || !this.__hass || !this.__hass.states[this.config.entity]) {
      return 1;
    }

    let cardLength = 0;
    const entities = this.__hass.states[this.config.entity];

    // if given a group entity then sum length of each entity by type
    // else just get the sible entity length
    if (Array.isArray(entities.attributes.entity_id)) {
      entities.attributes.entity_id.forEach(entity_id => (cardLength += this.getEntityLength(entity_id)));
    } else {
      cardLength += this.getEntityLength(entities.attributes.entity_id);
    }

    // if we are compacting the card account for that
    if (this.config.group) {
      cardLength *= 0.8;
    }

    return parseInt(cardLength, 1);
  }

  /**
   * determines the UI length of an entity
   * @param {string} entity_id
   */
  getEntityLength(entity_id) {
    if (/^light\./.test(entity_id)) {
      return LightEntityCard.entityLength.light;
    } else if (/^switch\./.test(entity_id)) {
      return LightEntityCard.entityLength.switch;
    } else {
      return 0;
    }
  }

  /**
   * generates the CSS styles for this card
   * @return {TemplateResult}
   */
  get styles() {
    return style;
  }

  get language() {
    return this.__hass.resources[this.__hass.language];
  }

  /**
   * check if the given entity is on or off
   * @param {LightEntity} stateObj
   * @return {Boolean}
   */
  isEntityOn(stateObj) {
    return stateObj.state === 'on';
  }

  /**
   * bug in ha-color-picker dones't allow you to set desiredHsColor until
   * after it's in DOM so we wait until it's in the DOM and set it here
   * https://github.com/home-assistant/home-assistant-polymer/issues/2618
   */
  updated() {
    this._isUpdating = false;

    // eslint-disable-next-line arrow-parens
    this._shownStateObjects.forEach(stateObj => {
      const id = this.generateColorPickerId(stateObj);
      const colorpickerElement = this.shadowRoot.querySelectorAll(`#${id}`);

      if (colorpickerElement.length) {
        const h = (stateObj.attributes.hs_color && stateObj.attributes.hs_color[0]) || 0;
        const s = (stateObj.attributes.hs_color && stateObj.attributes.hs_color[1] / 100) || 0;
        colorpickerElement[0].desiredHsColor = { h, s };
      }
    });
  }

  /**
   * generates a card for each given entiy in the config
   * @return {TemplateResult}
   */
  render() {
    const entity = this.__hass.states[this.config.entity];
    if (!entity) throw Error(`Invalid entity: ${this.config.entity}`);

    this._isUpdating = true;
    this._stateObjects = this.getEntitiesToShow(entity);

    // need to find what state objects are actually gonig to be shown
    if (this.config.consolidate_entities) {
      this._shownStateObjects = [entity];
    } else {
      this._shownStateObjects = [...this._stateObjects];
    }

    const templates = this._shownStateObjects.reduce(
      (htmlTemplate, stateObj) => html`${htmlTemplate}${this.createEntityTemplate(stateObj, this._stateObjects)}`,
      // eslint-disable-next-line comma-dangle
      '',
    );

    const css = `light-entity-card ${this.config.shorten_cards ? ' group' : ''} ${
      this.config.child_card ? ' light-entity-child-card' : ''
    }`;

    const hidden = this._stateObjects.some(s => s.state === 'on') ? '' : 'hidden';

    return html`
      <style>
        ${this.styles}
      </style>
      <ha-card class="${css} ${hidden}">
        <more-info-light .hass=${this.hass}></more-info-light>
        ${templates}
      </ha-card>
    `;
  }

  /**
   * gets all the entities we need to build this card for
   * @param {LightEntity|GroupEntity} entities
   * @return {Array<LightEntity>}
   */
  getEntitiesToShow(entities) {
    if (entities.attributes.entity_id && Array.isArray(entities.attributes.entity_id))
      return entities.attributes.entity_id.map(entity_id => this.__hass.states[entity_id]).filter(Boolean);

    return [entities];
  }

  /**
   * creates an entity's template
   * @param {LightEntity} stateObj
   * @return {TemplateResult}
   */
  createEntityTemplate(stateObj, stateObjects) {
    const sliderClass = this.config.full_width_sliders ? 'ha-slider-full-width' : '';

    return html`
      ${this.createHeader(stateObj)}
      <div class="light-entity-card-sliders ${sliderClass}">
        ${this.createBrightnessSlider(stateObj, stateObjects)} 
        ${this.createColorTemperature(stateObj, stateObjects)}
        ${this.createWhiteValue(stateObj)}
      </div>
      ${this.createColorPicker(stateObj)} ${this.createEffectList(stateObj)}
    `;
  }

  /**
   * creates card header with state toggle for a given entity
   * @param {LightEntity} stateObj
   * @return {TemplateResult}
   */
  createHeader(stateObj) {
    if (this.config.hide_header) return html``;

    // if using group and its spread out then use name of each entity in group first else use header name first
    let title = this.config.header;
    if (this.config.consolidate_entities) {
      title = this.config.header || stateObj.attributes.friendly_name || stateObj.entity_id;
    } else {
      title = stateObj.attributes.friendly_name || stateObj.entity_id || this.config.header;
    }

    return html`
      <div class="light-entity-card__header">
        <div class="light-entity-card__title">${title}</div>
        <div class="light-entity-card-toggle">
          <ha-switch .checked=${this.isEntityOn(stateObj)} @change=${e => this.setToggle(e, stateObj)}></ha-switch>
        </div>
      </div>
    `;
  }

  /**
   * creates brightness slider
   * @param {LightEntity} stateObj
   * @param stateObjects
   * @return {TemplateResult}
   */
  createBrightnessSlider(stateObj, stateObjects) {
    if (this.config.brightness === false) return html``;
    if (this.dontShowFeature('brightness', stateObj)) return html``;

    return html`
      <div class="control light-entity-card-center">
        <ha-icon icon="hass:${this.config.brightness_icon}"></ha-icon>
        <ha-slider
          .value="${stateObj.attributes.brightness}"
          @value-changed="${e => this.setBrightness(e, stateObj, stateObjects)}"
          min="1"
          max="255"
        ></ha-slider>
        ${this.showPercent(stateObj.attributes.brightness, 0, 254)}
      </div>
    `;
  }

  /**
   * shows slider percent if config is set
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @return {TemplateResult}
   */
  showPercent(value, min, max) {
    if (!this.config.show_slider_percent) return html``;
    let percent = parseInt(((value - min) * 100) / (max - min), 0);
    if (isNaN(percent)) percent = 0;

    return html` <div class="percent-slider">${percent}%</div> `;
  }

  /**
   * creates color temperature slider for a given entity
   * @param {LightEntity} stateObj
   * @param stateObjects
   * @return {TemplateResult}
   */
  createColorTemperature(stateObj, stateObjects) {
    if (this.config.color_temp === false) return html``;
    if (this.dontShowFeature('colorTemp', stateObj)) return html``;

    const percent = this.showPercent(
      stateObj.attributes.color_temp,
      stateObj.attributes.min_mireds - 1,
      // eslint-disable-next-line comma-dangle
      stateObj.attributes.max_mireds - 1,
    );

    return html`
      <div class="control light-entity-card-center">
        <ha-icon icon="hass:${this.config.temperature_icon}"></ha-icon>
        <ha-slider
          class="light-entity-card-color_temp"
          min="${stateObj.attributes.min_mireds}"
          max="${stateObj.attributes.max_mireds}"
          .value=${stateObj.attributes.color_temp}
          @value-changed="${e => this.setColorTemp(e, stateObj, stateObjects)}"
        >
        </ha-slider>
        ${percent}
      </div>
    `;
  }

  /**
   * creates white value slider for a given entity
   * @param {LightEntity} stateObj
   * @return {TemplateResult}
   */
  createWhiteValue(stateObj) {
    if (this.config.white_value === false) return html``;
    if (this.dontShowFeature('whiteValue', stateObj)) return html``;

    return html`
      <div class="control light-entity-card-center">
        <ha-icon icon="hass:${this.config.white_icon}"></ha-icon>
        <ha-slider
          max="255"
          .value="${stateObj.attributes.white_value}"
          @value-changed="${e => this.setWhiteValue(e, stateObj)}"
        >
        </ha-slider>
        ${this.showPercent(stateObj.attributes.white_value, 0, 254)}
      </div>
    `;
  }

  /**
   * creates effect list dropdown for a given entity
   * @param {LightEntity} stateObj
   * @return {TemplateResult}
   */
  createEffectList(stateObj) {
    // do we disable effect list always?
    if (this.config.effects_list === false) return html``;

    // need to check state and persist_features here because if given custom effect list we may
    // want to sho that even if the feature doesn't exist so dont check that part to move forward just persist_features/state
    if (!this.config.persist_features && !this.isEntityOn(stateObj)) return html``;

    let effect_list = stateObj.attributes.effect_list || [];

    // if we were given a custom list then use that
    if (this.config.effects_list && Array.isArray(this.config.effects_list)) {
      effect_list = this.config.effects_list;
    } else if (this.config.effects_list && this.hass.states[this.config.effects_list]) {
      // else if given an input_select entity use that as effect list
      const inputSelect = this.hass.states[this.config.effects_list];
      effect_list = (inputSelect.attributes && inputSelect.attributes.options) || [];
    } else if (this.dontShowFeature('effectList', stateObj)) {
      // finally if no custom list nor feature exists then dont show effect list
      return html``;
    }

    const listItems = effect_list.map(effect => html`<paper-item>${effect}</paper-item>`);
    const selectedIndex = effect_list.indexOf(stateObj.attributes.effect);
    const caption = this.language['ui.card.light.effect'];

    return html`
      <div class="control light-entity-card-center light-entity-card-effectlist">
        <paper-dropdown-menu @value-changed=${e => this.setEffect(e, stateObj)} label="${caption}">
          <paper-listbox selected="${selectedIndex}" slot="dropdown-content" placeholder="${caption}">
            ${listItems}
          </paper-listbox>
        </paper-dropdown-menu>
      </div>
    `;
  }

  /**
   * creates color picker wheel for a given entity
   * @param {LightEntity} stateObj
   * @return {TemplateResult}
   */
  createColorPicker(stateObj) {
    if (this.config.color_picker === false) return html``;
    if (this.dontShowFeature('color', stateObj)) return html``;

    return html`
      <div class="light-entity-card__color-picker">
        <ha-color-picker
          id="${this.generateColorPickerId(stateObj)}"
          class="control color"
          saturation-segments=${this._saturationSegments}
          hue-segments=${this._hueSegments}
          throttle="500"
          @colorselected=${e => this.setColorPicker(e, stateObj)}
        >
        </ha-color-picker>
      </div>
    `;
  }

  /**
   * do we show a feature or not?
   * @param {string} featureName
   * @param {LightEntity} stateObj
   * @return {boolean}
   */
  dontShowFeature(featureName, stateObj) {
    const feature_not_supported = !(LightEntityCard.featureNames[featureName] & stateObj.attributes.supported_features);
    if (feature_not_supported) return true;

    if (!this.config.persist_features && !this.isEntityOn(stateObj)) return true;
  }

  /**
   *
   * @param {LightEntity} stateObj
   */
  generateColorPickerId(stateObj) {
    const entity_id = stateObj.entity_id.replace('.', '-');
    return `light-entity-card-${entity_id}`;
  }

  /**
   * change to hs color for a given entity
   * @param {CustomEvent} event
   * @param {LightEntity} stateObj
   */
  setColorPicker(event, stateObj) {
    this.callEntityService({ hs_color: [event.detail.hs.h, event.detail.hs.s * 100] }, stateObj);
  }

  /**
   * set the new brightness from the slider for a given entity
   * @param {CustomEvent} event
   * @param {LightEntity} stateObj
   * @param stateObjects
   */
  setBrightness(event, stateObj, stateObjects) {
    const brightness = parseInt(event.target.value, 0);
    if (isNaN(brightness)) return;

    stateObjects
      .filter(s => s.state === 'on')
      .forEach((s) => {
        this.callEntityService({ brightness }, s);
      });
  }

  /**
   * sets the current Color Temperature selected for a given entity
   * @param {CustomEvent} event
   * @param {LightEntity} stateObj
   * @param stateObjects
   */
  setColorTemp(event, stateObj, stateObjects) {
    const colorTemp = parseInt(event.target.value, 0);
    if (isNaN(colorTemp)) return;

    stateObjects
      .filter(s => s.state === 'on')
      .forEach((s) => {
        this.callEntityService({ color_temp: colorTemp }, s);
      });
  }

  /**
   * sets the current white Value selected for a given entity
   * @param {CustomEvent} event
   * @param {LightEntity} stateObj
   */
  setWhiteValue(event, stateObj) {
    const whiteValue = parseInt(event.target.value, 0);
    if (isNaN(whiteValue) || parseInt(stateObj.attributes.white_value, 0) === whiteValue) return;

    this.callEntityService({ white_value: whiteValue }, stateObj);
  }

  /**
   * sets the toggle state based on the given entity state
   * @param {CustomEvent} event
   * @param {LightEntity} stateObj
   */
  setToggle(event, stateObj) {
    const newState = this.isEntityOn(stateObj) ? LightEntityCard.cmdToggle.off : LightEntityCard.cmdToggle.on;
    this.callEntityService({}, stateObj, newState);
  }

  /**
   * sets the current effect selected for an entity
   * @param {CustomEvent} event
   * @param {LightEntity} entity
   */
  setEffect(event, stateObj) {
    this.callEntityService({ effect: event.detail.value }, stateObj);
  }

  /**
   * call light service to update a state of an entity
   * @param {Object} payload
   * @param {LightEntity} entity
   * @param {String} state
   */
  callEntityService(payload, stateObj, state) {
    if (this._isUpdating) return;
    let entityType = stateObj.entity_id.split('.')[0];
    if (entityType === 'group') entityType = 'homeassistant';

    this.hass.callService(entityType, state || LightEntityCard.cmdToggle.on, {
      entity_id: stateObj.entity_id,
      ...payload,
    });
  }
}

customElements.define('light-entity-card', LightEntityCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'light-entity-card',
  name: 'Light Entity Card',
  description: 'Control lights and swtichs',
});
