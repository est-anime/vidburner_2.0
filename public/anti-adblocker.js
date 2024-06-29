document.addEventListener("DOMContentLoaded", function() {
    // Create a bait element
    var adElement = document.createElement('div');
    adElement.className = 'adsbox';
    adElement.style.display = 'none';
    document.body.appendChild(adElement);

    // Check if the ad element is blocked
    setTimeout(function() {
        if (!adElement || adElement.offsetParent === null || adElement.offsetHeight === 0) {
            // Adblocker is enabled
            document.getElementById('adblocker-popup').style.display = 'flex';
            document.body.classList.add('blur');
        } else {
            // Adblocker is not enabled
            adElement.style.display = 'none';
        }
    }, 100);
});
