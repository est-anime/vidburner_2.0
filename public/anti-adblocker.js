document.addEventListener('DOMContentLoaded', function() {
    // Check if an adblocker is enabled
    setTimeout(function() {
        var adsElement = document.createElement('div');
        adsElement.className = 'adsbox';
        adsElement.style.display = 'none';
        document.body.appendChild(adsElement);

        // Check if the ads element is blocked
        setTimeout(function() {
            if (!adsElement || adsElement.offsetParent === null || adsElement.offsetHeight === 0) {
                // Adblocker is enabled, show the adblocker popup
                var adblockerPopup = document.getElementById('adblocker-popup');
                if (adblockerPopup) {
                    adblockerPopup.style.display = 'flex';
                    document.body.classList.add('blur');
                }
            }
        }, 100);
    }, 100);
});
