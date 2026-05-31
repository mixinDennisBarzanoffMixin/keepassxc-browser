'use strict';

const kpxcPasswordIcons = {};
kpxcPasswordIcons.icons = [];

kpxcPasswordIcons.newIcon = function(field, databaseState = DatabaseState.DISCONNECTED) {
    kpxcPasswordIcons.icons.push(new PasswordIcon(field, databaseState));
};

kpxcPasswordIcons.switchIcon = function(state) {
    kpxcPasswordIcons.icons.forEach(u => u.switchIcon(state));
};

kpxcPasswordIcons.isValid = function(field) {
    if (!field
        || field.readOnly
        || field.offsetWidth < MIN_INPUT_FIELD_OFFSET_WIDTH
        || kpxcIcons.hasIcon(field)
        || !kpxcFields.isVisible(field)) {
        return false;
    }

    return true;
};


class PasswordIcon extends Icon {
    constructor(field, databaseState = DatabaseState.DISCONNECTED) {
        super(field, databaseState);
        this.nextFieldExists = false;

        this.initField(field);
        kpxcIcons.monitorIconPosition(this);
    }
}

PasswordIcon.prototype.initField = function(field) {
    // Observer the visibility
    if (this.observer) {
        this.observer.observe(field);
    }

    this.createIcon(field);
    this.inputField = field;
};

PasswordIcon.prototype.createIcon = function(field) {
    const className = getIconClass('key');
    const size = this.calculateIconSize(field);

    const icon = kpxcUI.createElement('div', 'kpxc kpxc-pwgen-icon ' + className,
        {
            'title': tr('passwordGeneratorGenerateText'),
            'size': size,
            'kpxc-pwgen-field-id': field.getAttribute('data-kpxc-id'),
            'popover': 'manual'
        });

    if (kpxcFields.popoverSupported) {
        icon.style.margin = 0;
    } else {
        icon.style.zIndex = '10000000';
    }
    icon.style.width = Pixels(size);
    icon.style.height = Pixels(size);

    if (this.databaseState === DatabaseState.DISCONNECTED || this.databaseState === DatabaseState.LOCKED) {
        icon.style.filter = 'saturate(0%)';
    }

    icon.addEventListener('click', async function(e) {
        if (!e.isTrusted) {
            return;
        }

        if (e.shiftKey) {
            if (kpxcFields.popoverSupported) {
                icon.hidePopover();
            } else {
                icon.style.display = 'none';
            }
            return;
        }

        e.stopPropagation();
        kpxcPasswordGenerator.showPasswordGenerator(field);
    });

    icon.addEventListener('mousedown', ev => ev.stopPropagation());
    icon.addEventListener('mouseup', ev => ev.stopPropagation());

    kpxcIcons.setIconPosition(icon, field, this.rtl);
    this.icon = icon;
    this.createWrapper('css/pwgen.css');
    if (kpxcFields.popoverSupported) {
        icon.showPopover();
    }
};


const kpxcPasswordGenerator = {};
kpxcPasswordGenerator.panel = null;
kpxcPasswordGenerator.currentPassword = '';
kpxcPasswordGenerator.targetField = null;

kpxcPasswordGenerator.showPasswordGenerator = async function(field) {
    kpxcPasswordGenerator.targetField = field ?? document.activeElement;
    kpxcPasswordGenerator.showPanel(kpxcPasswordGenerator.targetField);
};

kpxcPasswordGenerator.generate = async function(field) {
    if (!await isPasswordGeneratorSupported()) {
        kpxcPasswordGenerator.fill(field, kpxcPasswordGenerator.generateLocalPassword());
        return;
    }

    const password = await sendMessage('generate_password');
    kpxcPasswordGenerator.fill(field, password || kpxcPasswordGenerator.generateLocalPassword());
};

kpxcPasswordGenerator.showPanel = function(field) {
    kpxcPasswordGenerator.removePanel();
    if (!field) {
        return;
    }

    const host = document.createElement('div');
    host.style.all = 'initial';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
        :host { all: initial; }
        .backdrop {
            align-items: center;
            background: rgba(15, 23, 42, 0.28);
            display: flex;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            inset: 0;
            justify-content: center;
            position: fixed;
        }
        .dialog {
            background: #fff;
            border: 1px solid #c8d0dc;
            border-radius: 8px;
            box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
            box-sizing: border-box;
            color: #161b25;
            max-width: calc(100vw - 32px);
            padding: 14px;
            width: 380px;
        }
        * { box-sizing: border-box; }
        .title {
            align-items: center;
            display: flex;
            font-size: 15px;
            font-weight: 700;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .close {
            appearance: none;
            background: transparent;
            border: 0;
            color: #4c5565;
            cursor: pointer;
            font: inherit;
            font-size: 22px;
            line-height: 1;
            padding: 0 2px;
            width: auto;
        }
        .password {
            background: #f6f8fb;
            border: 1px solid #d8dee8;
            border-radius: 6px;
            color: #101623;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 13px;
            line-height: 1.45;
            margin-bottom: 10px;
            overflow-wrap: anywhere;
            padding: 10px;
            user-select: all;
        }
        label {
            color: #303848;
            display: block;
            font-size: 12px;
            font-weight: 600;
            margin: 8px 0 5px;
        }
        input[type="range"], input[type="text"] { width: 100%; }
        input[type="text"] {
            border: 1px solid #c8d0dc;
            border-radius: 5px;
            color: #161b25;
            font: inherit;
            padding: 7px;
        }
        .length {
            color: #687386;
            display: block;
            font-size: 12px;
            margin-top: 3px;
        }
        .checks {
            display: grid;
            gap: 7px 10px;
            grid-template-columns: 1fr 1fr;
            margin-top: 8px;
        }
        .checks label {
            align-items: center;
            display: flex;
            font-weight: 500;
            gap: 7px;
            margin: 0;
        }
        .checks input { margin: 0; width: auto; }
        .actions {
            display: grid;
            gap: 8px;
            grid-template-columns: 1fr 1fr 1fr;
            margin-top: 12px;
        }
        button.action {
            appearance: none;
            background: #edf1f7;
            border: 1px solid #c8d0dc;
            border-radius: 5px;
            color: #161b25;
            cursor: pointer;
            font: 600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            padding: 8px;
            width: auto;
        }
        button.primary {
            background: #1769e0;
            border-color: #1769e0;
            color: #fff;
        }
    `;

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    const panel = document.createElement('div');
    panel.className = 'dialog';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'Password generator';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = '×';
    close.addEventListener('click', () => kpxcPasswordGenerator.removePanel());
    title.appendChild(close);

    const password = document.createElement('div');
    password.className = 'password';

    const lengthLabel = document.createElement('label');
    lengthLabel.textContent = 'Length';
    const length = document.createElement('input');
    length.type = 'range';
    length.min = '8';
    length.max = '64';
    length.value = '24';
    const lengthValue = document.createElement('span');
    lengthValue.className = 'length';

    const checks = document.createElement('div');
    checks.className = 'checks';
    const option = (key, label, checked = true) => {
        const wrapper = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.kpxcPwgen = key;
        input.checked = checked;
        wrapper.append(input, document.createTextNode(label));
        checks.appendChild(wrapper);
        return input;
    };
    option('upper', 'Uppercase');
    option('lower', 'Lowercase');
    option('digits', 'Digits');
    option('symbols', 'Symbols');
    option('brackets', 'Brackets', false);
    option('ambiguous', 'No ambiguous');

    const customLabel = document.createElement('label');
    customLabel.textContent = 'Symbols';
    const customSymbols = document.createElement('input');
    customSymbols.type = 'text';
    customSymbols.className = 'symbols';
    customSymbols.value = '!@#$%^&*_-+=?.';

    const actions = document.createElement('div');
    actions.className = 'actions';
    const makeButton = (text, className = '') => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `action ${className}`.trim();
        button.textContent = text;
        actions.appendChild(button);
        return button;
    };
    const generate = makeButton('Generate', 'primary');
    const use = makeButton('Use');
    const copy = makeButton('Copy');

    panel.append(title, password, lengthLabel, length, lengthValue, checks, customLabel, customSymbols, actions);
    backdrop.appendChild(panel);
    shadow.append(style, backdrop);
    document.documentElement.appendChild(host);
    kpxcPasswordGenerator.panel = host;
    backdrop.addEventListener('click', event => {
        if (event.target === backdrop) {
            kpxcPasswordGenerator.removePanel();
        }
    });

    const refresh = () => {
        lengthValue.textContent = `${length.value} characters`;
        kpxcPasswordGenerator.currentPassword = kpxcPasswordGenerator.generateLocalPassword(
            Number(length.value),
            kpxcPasswordGenerator.panelOptions(shadow)
        );
        password.textContent = kpxcPasswordGenerator.currentPassword;
    };

    generate.addEventListener('click', refresh);
    length.addEventListener('input', refresh);
    checks.addEventListener('change', refresh);
    customSymbols.addEventListener('input', refresh);
    use.addEventListener('click', () => {
        kpxcPasswordGenerator.fill(kpxcPasswordGenerator.targetField, kpxcPasswordGenerator.currentPassword);
        kpxcPasswordGenerator.removePanel();
    });
    copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(kpxcPasswordGenerator.currentPassword);
        copy.textContent = 'Copied';
        setTimeout(() => {
            copy.textContent = 'Copy';
        }, 1200);
    });

    refresh();
};

kpxcPasswordGenerator.panelOptions = function(panel) {
    const checked = key => panel.querySelector(`[data-kpxc-pwgen="${key}"]`)?.checked;
    return {
        upper: checked('upper'),
        lower: checked('lower'),
        digits: checked('digits'),
        symbols: checked('symbols'),
        brackets: checked('brackets'),
        noAmbiguous: checked('ambiguous'),
        customSymbols: panel.querySelector('.symbols')?.value || '!@#$%^&*_-+=?.',
    };
};

kpxcPasswordGenerator.removePanel = function() {
    kpxcPasswordGenerator.panel?.remove();
    kpxcPasswordGenerator.panel = null;
};

kpxcPasswordGenerator.generateLocalPassword = function(length = 20, options = {}) {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const symbols = options.customSymbols || '!@#$%^&*_-+=?.';
    const brackets = '[]{}()<>';
    const ambiguous = new Set('iIlLoO01|'.split(''));
    const filter = chars => options.noAmbiguous
        ? Array.from(chars).filter(char => !ambiguous.has(char)).join('')
        : chars;
    const groups = [
        options.upper !== false ? filter(upper) : '',
        options.lower !== false ? filter(lower) : '',
        options.digits !== false ? filter(digits) : '',
        options.symbols !== false ? filter(symbols) : '',
        options.brackets ? filter(brackets) : '',
    ].filter(Boolean);
    if (groups.length === 0) {
        throw new Error('Choose at least one character set');
    }

    const alphabet = groups.join('');
    const values = new Uint32Array(length + groups.length);
    crypto.getRandomValues(values);
    const pick = (chars, value) => chars[value % chars.length];
    const password = groups.map((chars, index) => pick(chars, values[index]));

    for (let index = password.length; index < length; index += 1) {
        password.push(pick(alphabet, values[index]));
    }

    for (let index = password.length - 1; index > 0; index -= 1) {
        const swap = values[length + (index % groups.length)] % (index + 1);
        [ password[index], password[swap] ] = [ password[swap], password[index] ];
    }

    return password.join('');
};

kpxcPasswordGenerator.fill = function(elem, password) {
    if (!elem || !password) {
        return;
    }

    if (password.length === 0) {
        kpxcUI.createNotification('error', tr('usernameLockedFieldText'));
        return;
    }

    if (elem.getAttribute('maxlength')) {
        if (password.length > elem.getAttribute('maxlength')) {
            const message =
                tr('passwordGeneratorErrorTooLong') +
                '\r\n' +
                tr('passwordGeneratorErrorTooLongCut') +
                '\r\n' +
                tr('passwordGeneratorErrorTooLongRemember');
            message.style.whiteSpace = 'pre';
            kpxcUI.createNotification('error', message);
            return;
        }
    }

    const fillField = (field) => {
        field.value = password;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
    };

    fillField(elem);
    kpxc.lastActiveInput = elem;

    const form = elem.form || kpxc.getForm(elem);
    const passwordInputs = form ? kpxcFields.getPasswordInputs(form) : kpxcFields.getPasswordInputs(document);
    for (const nextField of passwordInputs) {
        if (nextField !== elem && nextField.maxLength && nextField.maxLength > 0 && password.length > nextField.maxLength) {
            continue;
        }
        if (nextField !== elem) {
            fillField(nextField);
        }
    }
};

const isPasswordGeneratorSupported = async function() {
    const response = await browser.runtime.sendMessage({
        action: 'get_features_list'
    });
    return response?.passwordGenerator;
};
