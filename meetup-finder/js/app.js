const App = {
    locations: [],
    poiMarkers: [],

    init() {
        this.bindEvents();
        this.loadMapAPI();
    },

    loadMapAPI() {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${MapManager.apiKey}&callback=App.onMapLoaded`;
        script.onerror = () => {
            Utils.showMessage('地图API加载失败，请检查API Key是否正确', 'error');
        };
        document.head.appendChild(script);
    },

    onMapLoaded() {
        if (MapManager.init()) {
            console.log('地图初始化成功');
        }
    },

    bindEvents() {
        const addBtn = document.getElementById('addLocationBtn');
        const locationInput = document.getElementById('locationInput');
        const searchBtn = document.getElementById('searchBtn');
        const radiusSlider = document.getElementById('radiusSlider');
        const poiTypeSelect = document.getElementById('poiType');

        addBtn.addEventListener('click', () => this.addLocation());
        locationInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addLocation();
            }
        });

        searchBtn.addEventListener('click', () => this.searchPOIs());

        radiusSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            document.getElementById('radiusValue').textContent = value;
            this.updateCircle();
        });

        poiTypeSelect.addEventListener('change', () => {
            if (this.locations.length >= 2) {
                this.searchPOIs();
            }
        });
    },

    async addLocation() {
        const input = document.getElementById('locationInput');
        const address = input.value.trim();

        if (!address) {
            Utils.showMessage('请输入地址', 'error');
            return;
        }

        Utils.showLoading();

        try {
            const result = await MapManager.geocode(address);

            const location = {
                id: Utils.generateId(),
                name: address,
                address: result.formattedAddress,
                lng: result.lng,
                lat: result.lat
            };

            this.locations.push(location);
            MapManager.addMarker(location, this.locations.length - 1);

            this.renderLocationList();
            this.updateCenter();
            this.updateSearchButton();

            input.value = '';
            Utils.hideLoading();

        } catch (error) {
            Utils.hideLoading();
            Utils.showMessage('地址解析失败，请检查地址是否正确', 'error');
            console.error(error);
        }
    },

    removeLocation(id) {
        const index = this.locations.findIndex(loc => loc.id === id);
        if (index > -1) {
            this.locations.splice(index, 1);
            MapManager.clearMarkers();
            this.locations.forEach((loc, idx) => {
                MapManager.addMarker(loc, idx);
            });
            this.renderLocationList();
            this.updateCenter();
            this.updateSearchButton();
        }
    },

    renderLocationList() {
        const listContainer = document.getElementById('locationList');

        if (this.locations.length === 0) {
            listContainer.innerHTML = '';
            return;
        }

        listContainer.innerHTML = this.locations.map((loc, index) => `
            <div class="location-item">
                <div class="location-info">
                    <div class="location-name">${index + 1}. ${loc.name}</div>
                    <div class="location-address">${loc.address}</div>
                </div>
                <button class="location-remove" onclick="App.removeLocation('${loc.id}')">×</button>
            </div>
        `).join('');
    },

    updateCenter() {
        if (this.locations.length < 2) {
            if (MapManager.centerMarker) {
                MapManager.centerMarker.setMap(null);
            }
            if (MapManager.circle) {
                MapManager.circle.setMap(null);
            }
            return;
        }

        const center = Utils.calculateCenter(this.locations);
        MapManager.setCenter(center);
        this.updateCircle();
        MapManager.fitView();
    },

    updateCircle() {
        if (this.locations.length < 2) return;

        const center = Utils.calculateCenter(this.locations);
        const radius = parseFloat(document.getElementById('radiusSlider').value);
        MapManager.drawCircle(center, radius);
    },

    updateSearchButton() {
        const searchBtn = document.getElementById('searchBtn');
        searchBtn.disabled = this.locations.length < 2;
    },

    async searchPOIs() {
        if (this.locations.length < 2) {
            Utils.showMessage('请至少添加2个位置', 'error');
            return;
        }

        Utils.showLoading();

        try {
            const center = Utils.calculateCenter(this.locations);
            const radius = parseFloat(document.getElementById('radiusSlider').value);
            const type = document.getElementById('poiType').value;

            const pois = await MapManager.searchPOI(center, radius, type);

            this.clearPOIMarkers();
            this.renderPOIList(pois);

            pois.forEach((poi, index) => {
                const marker = MapManager.addPOIMarker(poi, index);
                this.poiMarkers.push(marker);
            });

            Utils.hideLoading();

            if (pois.length === 0) {
                Utils.showMessage('未找到符合条件的地点，请尝试调整搜索半径');
            }

        } catch (error) {
            Utils.hideLoading();
            Utils.showMessage('搜索失败，请稍后重试', 'error');
            console.error(error);
        }
    },

    clearPOIMarkers() {
        this.poiMarkers.forEach(marker => marker.setMap(null));
        this.poiMarkers = [];
    },

    renderPOIList(pois) {
        const listContainer = document.getElementById('poiList');

        if (pois.length === 0) {
            listContainer.innerHTML = '';
            return;
        }

        const center = Utils.calculateCenter(this.locations);

        listContainer.innerHTML = pois.map((poi, index) => {
            const distance = Utils.calculateDistance(
                center.lat, center.lng,
                poi.lat, poi.lng
            );

            return `
                <div class="poi-item" onclick="App.showPOIDetail(${index})">
                    <div class="poi-name">${index + 1}. ${poi.name}</div>
                    <div class="poi-address">📍 ${poi.address || '暂无地址'}</div>
                    <div class="poi-distance">
                        📏 距中心点 ${Utils.formatDistance(distance)}
                        ${poi.rating !== '暂无' ? ` | ⭐ ${poi.rating}分` : ''}
                    </div>
                    <span class="poi-type">${poi.type || '其他'}</span>
                </div>
            `;
        }).join('');
    },

    showPOIDetail(index) {
        const pois = this.poiMarkers;
        if (pois[index]) {
            const marker = pois[index];
            const position = marker.getPosition();
            MapManager.panTo(position.lng, position.lat);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
