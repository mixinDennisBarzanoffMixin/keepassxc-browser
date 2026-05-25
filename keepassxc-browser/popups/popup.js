'use strict';

let reloadCount = 0;

HTMLElement.prototype.show = function() {
    this.style.display = 'block';
};

HTMLElement.prototype.hide = function() {
    this.style.display = 'none';
};

function statusResponse(r) {
    $('#initial-state').hide();
    $('#error-encountered').hide();
    $('#need-reconfigure').hide();
    $('#not-configured').hide();
    $('#configured-and-associated').hide();
    $('#configured-not-associated').hide();
    $('#lock-database-button').hide();
    $('#getting-started-guide').hide();
    $('#database-not-opened').hide();

    if (!r.keePassXCAvailable) {
        $('#error-message').textContent = r.error;
        $('#error-encountered').show();

        if (r.showGettingStartedGuideAlert) {
            $('#getting-started-guide').show();
        }

        if (r.showTroubleshootingGuideAlert && reloadCount >= 2) {
            $('#troubleshooting-guide').show();
        } else {
            $('#troubleshooting-guide').hide();
        }
    } else if (r.keePassXCAvailable && r.databaseClosed) {
        $('#database-error-message').textContent = r.error;
        $('#database-not-opened').show();
    } else if (!r.configured) {
        $('#not-configured').show();
    } else if (r.encryptionKeyUnrecognized) {
        $('#need-reconfigure').show();
        $('#need-reconfigure-message').textContent = r.error;
    } else if (!r.associated) {
        $('#need-reconfigure').show();
        $('#need-reconfigure-message').textContent = r.error;
    } else if (r.error) {
        $('#error-encountered').show();
        $('#error-message').textContent = r.error;
    } else {
        $('#configured-and-associated').show();
        $('#associated-identifier').textContent = r.identifier;
        $('#lock-database-button').show();

        if (r.usernameFieldDetected) {
            $('#username-field-detected').show();
        }

        if (r.iframeDetected) {
            $('#iframe-detected').show();
        }

        reloadCount = 0;
    }
}

const sendMessageToTab = async function(message) {
    const tab = await getCurrentTab();
    if (!tab) {
        return false; // Only the background devtools or a popup are opened
    }

    await browser.tabs.sendMessage(tab.id, {
        action: message
    });

    return true;
};

function dennisSetStatus(message, isError = false) {
    const status = $('#dennis-status');
    status.textContent = message;
    status.className = isError ? 'small mb-2 text-danger' : 'small mb-2 text-muted';
}

function dennisLoadEditor(entry = {}) {
    $('#dennis-editor').show();
    $('#dennis-profile').value = entry.profile_id || entry.profileId || 'personal';
    $('#dennis-label').value = entry.label || '';
    $('#dennis-site').value = entry.site || $('#dennis-domain').value.trim();
    $('#dennis-username').value = entry.username || '';
    $('#dennis-password').value = entry.password || '';
}

function dennisShowEntries(entries) {
    const list = $('#dennis-entries');
    list.replaceChildren();
    for (const entry of entries) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'list-group-item list-group-item-action py-1';
        const profile = entry.profile_id ? `[${entry.profile_id}] ` : '';
        const title = entry.label || entry.username || 'Login';
        const detail = entry.username_hint || entry.username || entry.site || '';
        button.textContent = `${profile}${title} ${detail ? `(${detail})` : ''}`;
        button.addEventListener('click', () => dennisLoadEditor(entry));
        list.appendChild(button);
    }
}

(async () => {
    await initColorTheme();

    $('#connect-button').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
            action: 'associate'
        });

        // This does not work with Firefox because of https://bugzilla.mozilla.org/show_bug.cgi?id=1665380
        await sendMessageToTab('retrieve_credentials_forced');
        close();
    });

    $('#reconnect-button').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
            action: 'associate'
        });
        close();
    });

    $('#reload-status-button').addEventListener('click', async () => {
        statusResponse(await browser.runtime.sendMessage({
            action: 'reconnect'
        }));

        // Shows the Troubleshooting Guide alert every third time Reload button is pressed when popup is open
        if (reloadCount > 2) {
            reloadCount = 0;
        }
        reloadCount++;
    });

    $('#reopen-database-button').addEventListener('click', async () => {
        statusResponse(await browser.runtime.sendMessage({
            action: 'get_status',
            args: [ false, true ] // Set forcePopup to true
        }));
        window.close();
    });

    $('#redetect-fields-button').addEventListener('click', async () => {
        const res = await sendMessageToTab('redetect_fields');
        if (!res) {
            return;
        }

        statusResponse(await browser.runtime.sendMessage({
            action: 'get_status'
        }));
    });

    $('#lock-database-button').addEventListener('click', async () => {
        statusResponse(await browser.runtime.sendMessage({
            action: 'lock_database'
        }));
    });

    $('#username-only-button').addEventListener('click', async () => {
        await sendMessageToTab('add_username_only_option');
        await sendMessageToTab('redetect_fields');
        $('#username-field-detected').hide();
    });

    $('#allow-iframe-button').addEventListener('click', async () => {
        await sendMessageToTab('add_allow_iframes_option');
        await sendMessageToTab('redetect_fields');
        $('#iframe-detected').hide();
    });

    $('#dennis-read').addEventListener('click', async () => {
        const domain = $('#dennis-domain').value.trim();
        const otp = $('#dennis-otp').value.trim();
        if (!domain || !otp) {
            dennisSetStatus('Enter domain and OTP.', true);
            return;
        }
        try {
            dennisSetStatus(`Reading ${domain}...`);
            const data = await browser.runtime.sendMessage({
                action: 'dennis_vault_read_domain',
                args: [ domain, otp ]
            });
            dennisShowEntries(data.entries || []);
            dennisSetStatus((data.entries || []).length ? `Found ${(data.entries || []).length} login(s).` : 'No saved logins.', !(data.entries || []).length);
            $('#dennis-otp').value = '';
        } catch (err) {
            dennisSetStatus(String(err.message || err), true);
        }
    });

    $('#dennis-new').addEventListener('click', () => dennisLoadEditor({
        profile_id: 'personal',
        site: $('#dennis-domain').value.trim(),
    }));

    $('#dennis-save').addEventListener('click', async () => {
        const otp = $('#dennis-otp').value.trim();
        const domain = $('#dennis-domain').value.trim();
        if (!domain || !otp || !$('#dennis-password').value) {
            dennisSetStatus('Enter domain, OTP, and password.', true);
            return;
        }
        try {
            await browser.runtime.sendMessage({
                action: 'dennis_vault_save_login',
                args: [ {
                    domain,
                    otpCode: otp,
                    profileId: $('#dennis-profile').value.trim() || 'personal',
                    label: $('#dennis-label').value.trim(),
                    site: $('#dennis-site').value.trim() || domain,
                    username: $('#dennis-username').value.trim(),
                    password: $('#dennis-password').value,
                } ]
            });
            $('#dennis-otp').value = '';
            dennisSetStatus('Saved. Re-read the domain to confirm.');
        } catch (err) {
            dennisSetStatus(String(err.message || err), true);
        }
    });

    $('#getting-started-alert-close-button').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
            action: 'hide_getting_started_guide_alert'
        });
    });

    $('#troubleshooting-guide-alert-close-button').addEventListener('click', async () => {
        await browser.runtime.sendMessage({
            action: 'hide_troubleshooting_guide_alert'
        });
    });

    statusResponse(await browser.runtime.sendMessage({
        action: 'get_status'
    }).catch((err) => {
        logError('Could not get status: ' + err);
    }));
})();
