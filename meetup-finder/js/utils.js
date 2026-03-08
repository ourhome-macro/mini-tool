const Utils = {
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    calculateCenter(locations) {
        if (!locations || locations.length === 0) {
            return null;
        }

        let sumLng = 0;
        let sumLat = 0;

        locations.forEach(location => {
            sumLng += location.lng;
            sumLat += location.lat;
        });

        return {
            lng: sumLng / locations.length,
            lat: sumLat / locations.length
        };
    },

    calculateDistance(lat1, lng1, lat2, lng2) {
        const rad = (d) => d * Math.PI / 180.0;
        const EARTH_RADIUS = 6378.137;

        const radLat1 = rad(lat1);
        const radLat2 = rad(lat2);
        const a = radLat1 - radLat2;
        const b = rad(lng1) - rad(lng2);

        let s = 2 * Math.asin(Math.sqrt(
            Math.pow(Math.sin(a / 2), 2) +
            Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)
        ));

        s = s * EARTH_RADIUS;
        s = Math.round(s * 100) / 100;

        return s;
    },

    formatDistance(km) {
        if (km < 1) {
            return Math.round(km * 1000) + '米';
        }
        return km.toFixed(1) + '公里';
    },

    showLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.add('active');
        }
    },

    hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.remove('active');
        }
    },

    showMessage(message, type = 'info') {
        const poiList = document.getElementById('poiList');
        if (!poiList) return;

        const className = type === 'error' ? 'error-message' : 'empty-state';
        poiList.innerHTML = `
            <div class="${className}">
                <div class="empty-state-icon">${type === 'error' ? '❌' : 'ℹ️'}</div>
                <p>${message}</p>
            </div>
        `;
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
};
