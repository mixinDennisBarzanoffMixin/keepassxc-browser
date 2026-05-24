'use strict';

const params = new URLSearchParams(window.location.search);
const requestId = params.get('requestId') || '';
const message = params.get('message') || 'Enter your TOTP code.';
const messageEl = document.getElementById('message');
const otpEl = document.getElementById('otp');
const unlockEl = document.getElementById('unlock');

messageEl.textContent = message;

async function submitOtp() {
    const otp = otpEl.value.trim();
    if (!otp || !requestId) {
        return;
    }

    await browser.storage.local.set({
        [`dennisVaultOtp:${requestId}`]: otp,
    });
    window.close();
}

unlockEl.addEventListener('click', submitOtp);
otpEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        submitOtp();
    }
});
