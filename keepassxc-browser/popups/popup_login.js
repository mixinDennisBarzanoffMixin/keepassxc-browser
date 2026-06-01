'use strict';

(async () => {
    await initColorTheme();

    $('#lock-database-button').show();

    const tab = await getCurrentTab();
    if (!tab) {
        return [];
    }

    const logins = await getLoginData();
    const ll = document.getElementById('login-list');

    const detailLine = function(label, value, secret = false) {
        const row = document.createElement('div');
        row.className = 'login-detail-line';

        const labelElement = document.createElement('span');
        labelElement.className = 'login-detail-label';
        labelElement.textContent = label;

        const valueElement = document.createElement('span');
        valueElement.className = secret ? 'login-detail-value login-detail-secret' : 'login-detail-value';
        valueElement.textContent = value || '—';

        row.append(labelElement, valueElement);
        return row;
    };

    for (const [ i, login ] of logins.entries()) {
        const uuid = login.uuid;
        const item = document.createElement('div');
        item.setAttribute('class', 'list-group-item login-list-item');
        item.setAttribute('data-login-index', '' + i);
        item.setAttribute('data-login-search', [
            login.text,
            login.title,
            login.username,
            login.site,
            login.profile,
        ].filter(Boolean).join(' '));

        const row = document.createElement('div');
        row.className = 'login-list-row';

        const fillButton = document.createElement('button');
        fillButton.type = 'button';
        fillButton.className = 'login-fill-button';
        fillButton.textContent = login.text;

        fillButton.addEventListener('click', (e) => {
            if (!e.isTrusted) {
                return;
            }

            browser.tabs.sendMessage(tab?.id, {
                action: 'fill_user_pass_with_specific_login',
                id: i,
                uuid: uuid
            });

            close();
        });

        const detailsButton = document.createElement('button');
        detailsButton.type = 'button';
        detailsButton.className = 'btn btn-sm btn-secondary login-details-button';
        detailsButton.textContent = 'Details';

        const details = document.createElement('div');
        details.className = 'login-details';
        details.hidden = true;
        details.append(
            detailLine('Profile', login.profile),
            detailLine('Title', login.title),
            detailLine('Site', login.site),
            detailLine('Username', login.username),
            detailLine('Password', login.password, true),
        );

        detailsButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!e.isTrusted) {
                return;
            }

            details.hidden = !details.hidden;
            detailsButton.textContent = details.hidden ? 'Details' : 'Hide';
        });

        row.append(fillButton, detailsButton);
        item.append(row, details);
        ll.appendChild(item);
    }

    if (logins.length > 1) {
        $('#filter-block').show();
        const filter = document.getElementById('login-filter');
        filter.addEventListener('keyup', (e) => {
            if (!e.isTrusted) {
                return;
            }

            const val = filter.value;
            const re = new RegExp(val, 'i');
            const items = ll.getElementsByClassName('login-list-item');
            for (const i in items) {
                if (items.hasOwnProperty(i)) {
                    const found = String(items[i].dataset.loginSearch || items[i].textContent).match(re) !== null;
                    items[i].style = found ? '' : 'display: none;';
                }
            }
        });

        filter.focus();
    }

    $('#lock-database-button').addEventListener('click', (e) => {
        browser.runtime.sendMessage({
            action: 'lock_database'
        });

        $('#credentialsList').hide();
        $('#database-not-opened').show();
        $('#lock-database-button').hide();
        $('#database-error-message').textContent = tr('errorMessageDatabaseNotOpened');
    });

    $('#reopen-database-button').addEventListener('click', (e) => {
        browser.runtime.sendMessage({
            action: 'get_status',
            args: [ false, true ] // Set forcePopup to true
        });
    });
})();
