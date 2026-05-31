'use strict';

/* global browser */

const dennisVault = {};

dennisVault.defaultBrokerUrl = 'https://broker-production-792e.up.railway.app';
dennisVault.otpTtlMs = 90 * 1000;
dennisVault.session = {
    otpCode: '',
    expiresAt: 0,
};

dennisVault.settings = async function() {
    const item = await browser.storage.local.get({
        dennisVault: {
            enabled: true,
            brokerUrl: dennisVault.defaultBrokerUrl,
            defaultProfileId: '',
            knownProfiles: [],
        },
    });

    const settings = item.dennisVault || {};
    settings.enabled = settings.enabled !== false;
    settings.brokerUrl = (settings.brokerUrl || dennisVault.defaultBrokerUrl).replace(/\/+$/, '');
    settings.defaultProfileId = settings.defaultProfileId || '';
    settings.knownProfiles = Array.isArray(settings.knownProfiles) ? settings.knownProfiles : [];
    settings.knownProfiles = Array.from(new Set([ settings.defaultProfileId, ...settings.knownProfiles ].filter(Boolean)));
    return settings;
};

dennisVault.isEnabled = async function() {
    return (await dennisVault.settings()).enabled;
};

dennisVault.markAvailable = function() {
    keepass.isConnected = true;
    keepass.isDatabaseClosed = false;
    keepass.isKeePassXCAvailable = true;
    keepass.isEncryptionKeyUnrecognized = false;
    keepass.associated.value = true;
    keepass.associated.hash = 'dennis-vault';
    keepass.databaseHash = 'dennis-vault';
};

dennisVault.setOtp = function(otpCode) {
    dennisVault.session.otpCode = otpCode;
    dennisVault.session.expiresAt = Date.now() + dennisVault.otpTtlMs;
};

dennisVault.clearOtp = function() {
    dennisVault.session.otpCode = '';
    dennisVault.session.expiresAt = 0;
};

dennisVault.otp = async function(promptText = 'Dennis Vault TOTP code') {
    if (dennisVault.session.otpCode && dennisVault.session.expiresAt > Date.now()) {
        return dennisVault.session.otpCode;
    }

    const requestId = Math.random().toString(16).slice(2);
    const storageKey = `dennisVaultOtp:${requestId}`;
    const popupUrl = browser.runtime.getURL(
        `popups/dennis_otp.html?requestId=${encodeURIComponent(requestId)}&message=${encodeURIComponent(promptText)}`,
    );

    await browser.windows.create({
        url: popupUrl,
        type: 'popup',
        width: 380,
        height: 260,
    });

    const startedAt = Date.now();
    let otpCode = '';
    while (Date.now() - startedAt < 120000) {
        const item = await browser.storage.local.get(storageKey);
        otpCode = item[storageKey]?.trim() || '';
        if (otpCode) {
            await browser.storage.local.remove(storageKey);
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (otpCode) {
        dennisVault.setOtp(otpCode);
    }
    return otpCode;
};

dennisVault.domainFromUrl = function(url) {
    try {
        return new URL(url).hostname
            .replace(/^www\./i, '')
            .replace(/[^a-zA-Z0-9.-]/g, '-')
            .toLowerCase();
    } catch (_err) {
        return '';
    }
};

dennisVault.post = async function(path, payload) {
    const settings = await dennisVault.settings();
    const response = await fetch(`${settings.brokerUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Dennis Vault broker ${response.status}: ${detail}`);
    }

    return await response.json();
};

dennisVault.toKeePassLogin = function(entry) {
    const uuid = entry.id || entry.path || `${entry.profile_id || 'profile'}:${entry.username || entry.label}`;
    const name = entry.label || entry.site || entry.path || 'Dennis Vault Login';
    return {
        uuid,
        name,
        login: entry.username || entry.username_hint || '',
        password: entry.password || '',
        url: entry.site || '',
        group: entry.profile_id || '',
        expired: 'false',
        stringFields: [],
    };
};

dennisVault.retrieveCredentials = async function(url) {
    const domain = dennisVault.domainFromUrl(url);
    if (!domain) {
        return [];
    }

    const otpCode = await dennisVault.otp(`Dennis Vault TOTP for ${domain}`);
    if (!otpCode) {
        return [];
    }

    try {
        const data = await dennisVault.post('/secrets/read-domain', {
            /* eslint-disable camelcase */
            domain,
            otp_code: otpCode,
            /* eslint-enable camelcase */
        });
        return (data.entries || []).map(dennisVault.toKeePassLogin);
    } catch (err) {
        dennisVault.clearOtp();
        throw err;
    }
};

dennisVault.rememberProfile = async function(profileId) {
    if (!profileId) {
        return;
    }

    const item = await browser.storage.local.get({ dennisVault: {} });
    const settings = item.dennisVault || {};
    const knownProfiles = Array.isArray(settings.knownProfiles) ? settings.knownProfiles : [];
    settings.knownProfiles = Array.from(new Set([ ...knownProfiles, profileId ].filter(Boolean)));
    await browser.storage.local.set({ dennisVault: settings });
};

dennisVault.saveCredentials = async function(username, password, url, profileId, domainOverride, existingPath) {
    const domain = dennisVault.domainFromUrl(domainOverride || url) || String(domainOverride || '').replace(/^www\./i, '').toLowerCase();
    if (!domain || !password) {
        return 'error';
    }

    const otpCode = await dennisVault.otp(`Dennis Vault TOTP to save ${domain}`);
    if (!otpCode) {
        return 'cancelled';
    }

    const settings = await dennisVault.settings();
    const saveProfileId = profileId || settings.defaultProfileId;
    if (!saveProfileId) {
        return 'error';
    }
    try {
        await dennisVault.post('/secrets/save-login', {
            /* eslint-disable camelcase */
            domain,
            profile_id: saveProfileId,
            label: username || domain,
            username,
            password,
            site: url,
            existing_path: existingPath || '',
            otp_code: otpCode,
            /* eslint-enable camelcase */
        });
        await dennisVault.rememberProfile(saveProfileId);
        return 'created';
    } catch (err) {
        dennisVault.clearOtp();
        throw err;
    }
};

dennisVault.readDomainManual = async function(domain, otpCode) {
    const normalizedDomain = dennisVault.domainFromUrl(domain) || domain.replace(/^www\./i, '').toLowerCase();
    const data = await dennisVault.post('/secrets/read-domain', {
        /* eslint-disable camelcase */
        domain: normalizedDomain,
        otp_code: otpCode,
        /* eslint-enable camelcase */
    });
    return {
        domain: data.domain || normalizedDomain,
        entries: data.entries || [],
    };
};

dennisVault.saveLoginManual = async function(payload) {
    const profileId = payload.profileId || '';
    if (!profileId) {
        throw new Error('Profile is required.');
    }
    await dennisVault.post('/secrets/save-login', {
        /* eslint-disable camelcase */
        domain: dennisVault.domainFromUrl(payload.domain) || payload.domain,
        profile_id: profileId,
        label: payload.label || payload.username || payload.domain,
        username: payload.username || '',
        password: payload.password || '',
        site: payload.site || payload.domain,
        existing_path: payload.existingPath || '',
        otp_code: payload.otpCode,
        /* eslint-enable camelcase */
    });
    await dennisVault.rememberProfile(profileId);
    return true;
};
