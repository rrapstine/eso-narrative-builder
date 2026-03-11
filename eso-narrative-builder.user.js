// ==UserScript==
// @name         ESO Narrative Builder
// @namespace    https://github.com/rrapstine/
// @version      1.1.0
// @description  Build patient care narratives from templates with dynamic form fields
// @author       Richard F Rapstine III
// @match        https://*.esosuite.net/*
// @match        https://*.esosuite.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULT_TEMPLATE = `DISPATCH:
Medic {{MEDIC_NUMBER}} dispatched P{{PRIORITY}} to Baptist Neighborhood Hospital {{SCENE}} in San Antonio, TX for transport of a patient to {{DESTINATION}} in San Antonio, TX for {{TRANSPORT_REASON}} which is not available at sending facility.

ARRIVAL/PRE-ARRIVAL:
Responded to scene without delays or incidents. Facility evaluation and testing confirmed diagnosis of {{DIAGNOSIS}}. Per RN on scene, patient presented to the ED with complaints of {{ED_COMPLAINT}}. Treatment in the ED included IV access, {{ED_TREATMENTS}}. X-ray {{XRAY_RESULTS}}. CT scan {{CT_RESULTS}}. Labs {{LABS_RESULTS}}. 12-lead EKG {{EKG_RESULTS}}.

COMPLAINT:
{{PT_COMPLAINTS}}.

HISTORY:
{{PT_HISTORY}}.

ASSESSMENT:
Patient is a {{PT_AGE}} year old {{PT_SEX}}, {{PT_MENTAL_STATUS}}, found {{PT_POSITION}} in ED hospital bed. {{PT_ASSESSMENT}}. All other findings unremarkable or within normal limits. {{IV_SIZE}}ga IV access, saline-locked and patent, in {{IV_SITE}}.

RX:
{{TRANSPORT_RX}}.

TRANSPORT:
Patient {{TRANSPORT_PT_MOVED}} onto stretcher and secured for transport in {{TRANSPORT_PT_POSITION}} position with straps and rails. Initial vital signs and 3-lead cardiac monitoring obtained and monitored continuously during transport. Stretcher loaded into ambulance and locked into place securely. Transport performed without incident. At destination, patient transported to {{DESTINATION_ROOM}} and {{TRANSPORT_PT_MOVED}} into bed. Report given to receiving RN and care signed over.

EVENTS:
Nothing to report.

***All times are approximated to the highest degree of accuracy possible. Dispatch and report times may not be synchronized. Any potential variance between this narrative and other sections of the chart are unintended and the narrative should take precedence.***

Richard F Rapstine III, Paramedic

EOR.`;

    const DEFAULTS = {
        PRIORITY: '3',
        XRAY_RESULTS: 'unremarkable',
        CT_RESULTS: 'unremarkable',
        LABS_RESULTS: 'unremarkable',
        EKG_RESULTS: 'unremarkable',
        PT_COMPLAINTS: 'Patient has no current medical complaint',
        PT_HISTORY: 'Patient has no relevant medical history to current complaint/illness',
        PT_MENTAL_STATUS: 'alert and oriented',
        PT_POSITION: "semi-fowler's",
        TRANSPORT_RX: 'No medications were administered during transport',
        TRANSPORT_PT_MOVED: 'assisted',
        TRANSPORT_PT_POSITION: "semi-fowler's",
    };

    let modalVisible = false;
    let settingsVisible = false;

    function getTemplate() {
        return GM_getValue('narrativeTemplate', DEFAULT_TEMPLATE);
    }

    function setTemplate(template) {
        GM_setValue('narrativeTemplate', template);
    }

    function parseVariables(template) {
        const regex = /\{\{(\w+)\}\}/g;
        const variables = [];
        let match;
        while ((match = regex.exec(template)) !== null) {
            if (!variables.includes(match[1])) {
                variables.push(match[1]);
            }
        }
        return variables;
    }

    function toLabel(varName) {
        return varName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }

    const styles = `
        .enb-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .enb-modal {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            max-width: 600px;
            width: 90%;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
        }
        .enb-header {
            padding: 16px 20px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .enb-header h2 {
            margin: 0;
            font-size: 18px;
            color: #333;
        }
        .enb-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
            padding: 0;
            line-height: 1;
        }
        .enb-close:hover {
            color: #333;
        }
        .enb-body {
            padding: 20px;
            overflow-y: auto;
            flex: 1;
        }
        .enb-field {
            margin-bottom: 16px;
        }
        .enb-field label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
            color: #333;
            font-size: 14px;
        }
        .enb-field input,
        .enb-field textarea {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 14px;
            font-family: inherit;
            box-sizing: border-box;
        }
        .enb-field input:focus,
        .enb-field textarea:focus {
            outline: none;
            border-color: #007bff;
            box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }
        .enb-field textarea {
            min-height: 80px;
            resize: vertical;
        }
        .enb-footer {
            padding: 16px 20px;
            border-top: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            gap: 10px;
        }
        .enb-btn {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
        }
        .enb-btn-primary {
            background: #007bff;
            color: #fff;
        }
        .enb-btn-primary:hover {
            background: #0056b3;
        }
        .enb-btn-secondary {
            background: #6c757d;
            color: #fff;
        }
        .enb-btn-secondary:hover {
            background: #545b62;
        }
        .enb-btn-link {
            background: none;
            color: #007bff;
            text-decoration: underline;
            padding: 10px;
        }
        .enb-btn-link:hover {
            color: #0056b3;
        }
        .enb-settings textarea {
            width: 100%;
            min-height: 300px;
            font-family: monospace;
            font-size: 13px;
            padding: 12px;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-sizing: border-box;
        }
        .enb-toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #28a745;
            color: #fff;
            padding: 12px 20px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 1000000;
            animation: enb-toast-in 0.3s ease;
        }
        @keyframes enb-toast-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;

    function injectStyles() {
        const styleEl = document.createElement('style');
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }

    function createFormModal() {
        const template = getTemplate();
        const variables = parseVariables(template);

        const overlay = document.createElement('div');
        overlay.className = 'enb-overlay';
        overlay.id = 'enb-form-modal';

        let fieldsHtml = variables
            .map((v) => {
                const label = toLabel(v);
                const isLongField = v === 'PT_ASSESSMENT';

                if (isLongField) {
                    return `
                    <div class="enb-field">
                        <label for="enb-${v}">${label}</label>
                        <textarea id="enb-${v}" name="${v}" tabindex="0"></textarea>
                    </div>
                `;
                }
                return `
                <div class="enb-field">
                    <label for="enb-${v}">${label}</label>
                    <input type="text" id="enb-${v}" name="${v}" tabindex="0">
                </div>
            `;
            })
            .join('');

        overlay.innerHTML = `
            <div class="enb-modal">
                <div class="enb-header">
                    <h2>Build Narrative</h2>
                    <button class="enb-close" id="enb-close-form">&times;</button>
                </div>
                <div class="enb-body">
                    <form id="enb-form">
                        ${fieldsHtml}
                    </form>
                </div>
                <div class="enb-footer">
                    <button class="enb-btn enb-btn-link" id="enb-open-settings">Edit Template</button>
                    <div>
                        <button class="enb-btn enb-btn-secondary" id="enb-cancel">Cancel</button>
                        <button class="enb-btn enb-btn-primary" id="enb-submit">Copy to Clipboard</button>
                    </div>
                </div>
            </div>
        `;

        return overlay;
    }

    function createSettingsModal() {
        const template = getTemplate();

        const overlay = document.createElement('div');
        overlay.className = 'enb-overlay';
        overlay.id = 'enb-settings-modal';

        overlay.innerHTML = `
            <div class="enb-modal">
                <div class="enb-header">
                    <h2>Edit Template</h2>
                    <button class="enb-close" id="enb-close-settings">&times;</button>
                </div>
                <div class="enb-body enb-settings">
                    <p style="margin-top: 0; color: #666; font-size: 13px;">
                        Use <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">{{variable_name}}</code>
                        for fields. Fields will be auto-generated from your template.
                    </p>
                    <textarea id="enb-template-input">${template}</textarea>
                </div>
                <div class="enb-footer">
                    <button class="enb-btn enb-btn-link" id="enb-reset-template">Reset to Default</button>
                    <div>
                        <button class="enb-btn enb-btn-secondary" id="enb-settings-cancel">Cancel</button>
                        <button class="enb-btn enb-btn-primary" id="enb-settings-save">Save Template</button>
                    </div>
                </div>
            </div>
        `;

        return overlay;
    }

    function showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.className = 'enb-toast';
        toast.textContent = message;
        toast.style.background = isError ? '#dc3545' : '#28a745';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function fillTemplate(template, formData) {
        return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            let value = formData.get(varName) || '';
            const trimmed = value.trim();

            if (varName === 'TRANSPORT_PT_MOVED') {
                value = trimmed ? `transferred via ${trimmed}` : DEFAULTS.TRANSPORT_PT_MOVED;
            } else if (varName === 'PT_COMPLAINTS') {
                value = trimmed ? `Patient currently complains of ${trimmed}` : DEFAULTS.PT_COMPLAINTS;
            } else if (varName === 'PT_HISTORY') {
                value = trimmed ? `Patient has relevant history of ${trimmed}` : DEFAULTS.PT_HISTORY;
            } else if (!trimmed && DEFAULTS[varName] !== undefined) {
                value = DEFAULTS[varName];
            }

            return value;
        });
    }

    function setupCloseHandlers(modal, onClose) {
        function escHandler(e) {
            if (e.key === 'Escape') {
                onClose();
                document.removeEventListener('keydown', escHandler);
            }
        }
        document.addEventListener('keydown', escHandler);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) onClose();
        });
    }

    function showFormModal() {
        if (modalVisible) return;

        const existingModal = document.getElementById('enb-form-modal');
        if (existingModal) existingModal.remove();

        const modal = createFormModal();
        document.body.appendChild(modal);
        modalVisible = true;

        setTimeout(() => {
            const firstInput = modal.querySelector('input, textarea');
            if (firstInput) firstInput.focus();
        }, 50);

        modal.querySelector('#enb-close-form').addEventListener('click', hideFormModal);
        modal.querySelector('#enb-cancel').addEventListener('click', hideFormModal);
        modal.querySelector('#enb-open-settings').addEventListener('click', () => {
            hideFormModal();
            showSettingsModal();
        });

        modal.querySelector('#enb-submit').addEventListener('click', (e) => {
            e.preventDefault();
            const form = modal.querySelector('#enb-form');
            const formData = new FormData(form);
            const template = getTemplate();
            const filled = fillTemplate(template, formData);

            GM_setClipboard(filled);
            showToast('Narrative copied to clipboard!');
            hideFormModal();
        });

        setupCloseHandlers(modal, hideFormModal);
    }

    function hideFormModal() {
        const modal = document.getElementById('enb-form-modal');
        if (modal) modal.remove();
        modalVisible = false;
    }

    function showSettingsModal() {
        if (settingsVisible) return;

        const existingModal = document.getElementById('enb-settings-modal');
        if (existingModal) existingModal.remove();

        const modal = createSettingsModal();
        document.body.appendChild(modal);
        settingsVisible = true;

        setTimeout(() => {
            modal.querySelector('textarea').focus();
        }, 50);

        modal.querySelector('#enb-close-settings').addEventListener('click', hideSettingsModal);
        modal.querySelector('#enb-settings-cancel').addEventListener('click', hideSettingsModal);

        modal.querySelector('#enb-reset-template').addEventListener('click', () => {
            modal.querySelector('#enb-template-input').value = DEFAULT_TEMPLATE;
        });

        modal.querySelector('#enb-settings-save').addEventListener('click', () => {
            const newTemplate = modal.querySelector('#enb-template-input').value;
            setTemplate(newTemplate);
            showToast('Template saved!');
            hideSettingsModal();
        });

        setupCloseHandlers(modal, hideSettingsModal);
    }

    function hideSettingsModal() {
        const modal = document.getElementById('enb-settings-modal');
        if (modal) modal.remove();
        settingsVisible = false;
    }

    function init() {
        injectStyles();

        GM_registerMenuCommand('Build Narrative', showFormModal);
        GM_registerMenuCommand('Edit Template', showSettingsModal);

        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.code === 'Semicolon') {
                e.preventDefault();
                if (modalVisible) {
                    hideFormModal();
                } else if (settingsVisible) {
                    hideSettingsModal();
                } else {
                    showFormModal();
                }
            }
        });

        console.log('ESO Narrative Builder loaded. Press Alt+; (Option+; on Mac) to open.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
