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

    const panel = document.createElement('div');
    panel.className = 'kpxc kpxc-pwgen-panel';

    const title = document.createElement('div');
    title.className = 'kpxc-pwgen-title';
    title.textContent = 'Password generator';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'kpxc-pwgen-close';
    close.textContent = '×';
    close.addEventListener('click', () => kpxcPasswordGenerator.removePanel());
    title.appendChild(close);

    const password = document.createElement('div');
    password.className = 'kpxc-pwgen-password';

    const lengthLabel = document.createElement('label');
    lengthLabel.textContent = 'Length';
    const length = document.createElement('input');
    length.type = 'range';
    length.min = '8';
    length.max = '64';
    length.value = '24';
    const lengthValue = document.createElement('span');
    lengthValue.className = 'kpxc-pwgen-length';

    const checks = document.createElement('div');
    checks.className = 'kpxc-pwgen-checks';
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
    customSymbols.className = 'kpxc-pwgen-symbols';
    customSymbols.value = '!@#$%^&*_-+=?.';

    const actions = document.createElement('div');
    actions.className = 'kpxc-pwgen-actions';
    const makeButton = (text, className = '') => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = text;
        actions.appendChild(button);
        return button;
    };
    const generate = makeButton('Generate', 'primary');
    const use = makeButton('Use');
    const copy = makeButton('Copy');

    panel.append(title, password, lengthLabel, length, lengthValue, checks, customLabel, customSymbols, actions);
    document.documentElement.appendChild(panel);
    kpxcPasswordGenerator.panel = panel;

    const place = () => {
        const rect = field.getBoundingClientRect();
        panel.style.left = Pixels(Math.max(8, rect.left + window.scrollX));
        panel.style.top = Pixels(rect.bottom + window.scrollY + 8);
    };
    place();

    const refresh = () => {
        lengthValue.textContent = `${length.value} characters`;
        kpxcPasswordGenerator.currentPassword = kpxcPasswordGenerator.generateLocalPassword(
            Number(length.value),
            kpxcPasswordGenerator.panelOptions(panel)
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
        customSymbols: panel.querySelector('.kpxc-pwgen-symbols')?.value || '!@#$%^&*_-+=?.',
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
