const MapManager = {
    map: null,
    markers: [],
    centerMarker: null,
    circle: null,
    geocoder: null,
    placeSearch: null,
    apiKey: '91846374b66b9125eaa328c2c9f67557',
    webServiceKey: 'YOUR_KEY',
    isReady: false,
    readyCallbacks: [],

    init() {
        if (typeof AMap === 'undefined') {
            console.error('高德地图API未加载');
            Utils.showMessage('地图API加载失败，请检查网络连接', 'error');
            return false;
        }

        this.map = new AMap.Map('mapContainer', {
            zoom: 11,
            center: [116.397428, 39.90923],
            viewMode: '2D'
        });

        AMap.plugin(['AMap.Geocoder', 'AMap.PlaceSearch', 'AMap.ToolBar', 'AMap.Scale'], () => {
            this.geocoder = new AMap.Geocoder({
                city: '全国'
            });

            this.placeSearch = new AMap.PlaceSearch({
                pageSize: 20,
                pageIndex: 1,
                extensions: 'all'
            });

            this.map.addControl(new AMap.ToolBar());
            this.map.addControl(new AMap.Scale());
            
            this.isReady = true;
            console.log('地图插件加载完成');
            
            this.readyCallbacks.forEach(callback => callback());
            this.readyCallbacks = [];
        });

        return true;
    },
    
    onReady(callback) {
        if (this.isReady) {
            callback();
        } else {
            this.readyCallbacks.push(callback);
        }
    },

    geocode(address) {
        return new Promise((resolve, reject) => {
            console.log('开始地理编码:', address);
            
            this.geocodeByWebService(address)
                .then(resolve)
                .catch(error => {
                    console.warn('Web服务地理编码失败，尝试JS API:', error.message);
                    this.geocodeByJSAPI(address)
                        .then(resolve)
                        .catch(reject);
                });
        });
    },

    geocodeByWebService(address) {
        return new Promise((resolve, reject) => {
            const url = `https://restapi.amap.com/v3/geocode/geo?key=${this.webServiceKey}&address=${encodeURIComponent(address)}`;
            
            const timeout = setTimeout(() => {
                reject(new Error('Web服务地理编码超时'));
            }, 10000);

            fetch(url)
                .then(response => {
                    clearTimeout(timeout);
                    return response.json();
                })
                .then(data => {
                    console.log('Web服务地理编码结果:', data);
                    if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
                        const geocode = data.geocodes[0];
                        const [lng, lat] = geocode.location.split(',');
                        resolve({
                            lng: parseFloat(lng),
                            lat: parseFloat(lat),
                            formattedAddress: geocode.formatted_address
                        });
                    } else {
                        reject(new Error(data.info || '未找到地址'));
                    }
                })
                .catch(error => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    },

    geocodeByJSAPI(address) {
        return new Promise((resolve, reject) => {
            if (!this.geocoder) {
                reject(new Error('地理编码器未初始化'));
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('地址解析超时，请检查API Key是否有地理编码权限'));
            }, 15000);

            try {
                this.geocoder.getLocation(address, (status, result) => {
                    clearTimeout(timeout);
                    console.log('JS API地理编码结果:', status, result);
                    
                    if (status === 'complete' && result.geocodes && result.geocodes.length > 0) {
                        const geocode = result.geocodes[0];
                        resolve({
                            lng: geocode.location.lng,
                            lat: geocode.location.lat,
                            formattedAddress: geocode.formattedAddress
                        });
                    } else if (status === 'no_data') {
                        reject(new Error('未找到该地址，请尝试更详细的地址，如"北京市朝阳区三里屯"'));
                    } else {
                        const errorMsg = (result && (result.info || result.message)) || '未知错误';
                        console.error('地理编码失败详情:', result);
                        reject(new Error('地址解析失败: ' + errorMsg));
                    }
                });
            } catch (error) {
                clearTimeout(timeout);
                console.error('地理编码异常:', error);
                reject(new Error('地理编码调用失败: ' + error.message));
            }
        });
    },

    addMarker(location, index) {
        const marker = new AMap.Marker({
            position: [location.lng, location.lat],
            title: location.name,
            label: {
                content: `<div class="marker-label">${index + 1}</div>`,
                direction: 'top'
            }
        });

        marker.setMap(this.map);
        this.markers.push(marker);

        return marker;
    },

    removeMarker(marker) {
        const index = this.markers.indexOf(marker);
        if (index > -1) {
            this.markers.splice(index, 1);
            marker.setMap(null);
        }
    },

    clearMarkers() {
        this.markers.forEach(marker => marker.setMap(null));
        this.markers = [];
    },

    setCenter(center) {
        if (!center) return;

        if (this.centerMarker) {
            this.centerMarker.setMap(null);
        }

        this.centerMarker = new AMap.Marker({
            position: [center.lng, center.lat],
            icon: new AMap.Icon({
                size: new AMap.Size(32, 32),
                image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTQiIGZpbGw9IiNGRjk4MDAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+',
                imageSize: new AMap.Size(32, 32)
            }),
            title: '中心点',
            zIndex: 999
        });

        this.centerMarker.setMap(this.map);
    },

    drawCircle(center, radius) {
        if (!center) return;

        if (this.circle) {
            this.circle.setMap(null);
        }

        this.circle = new AMap.Circle({
            center: new AMap.LngLat(center.lng, center.lat),
            radius: radius * 1000,
            fillColor: '#1E88E5',
            fillOpacity: 0.2,
            strokeColor: '#1E88E5',
            strokeWeight: 2,
            strokeOpacity: 0.8
        });

        this.circle.setMap(this.map);
    },

    fitView() {
        if (this.markers.length === 0) return;

        this.map.setFitView(this.markers, false, [50, 50, 50, 50]);
    },

    async searchPOI(center, radius, type) {
        console.log('开始POI搜索:', { center, radius, type });
        
        return new Promise((resolve, reject) => {
            this.searchPOIByWebService(center, radius, type)
                .then(resolve)
                .catch(error => {
                    console.warn('Web服务POI搜索失败，尝试JS API:', error.message);
                    this.searchPOIByJSAPI(center, radius, type)
                        .then(resolve)
                        .catch(reject);
                });
        });
    },

    searchPOIByWebService(center, radius, type) {
        return new Promise((resolve, reject) => {
            const url = `https://restapi.amap.com/v3/place/around?key=${this.webServiceKey}&location=${center.lng},${center.lat}&radius=${radius * 1000}&types=${type}&offset=20&page=1&extensions=all`;
            
            console.log('Web服务POI搜索URL:', url);
            
            const timeout = setTimeout(() => {
                reject(new Error('POI搜索超时'));
            }, 10000);

            fetch(url)
                .then(response => {
                    clearTimeout(timeout);
                    return response.json();
                })
                .then(data => {
                    console.log('Web服务POI搜索结果:', data);
                    if (data.status === '1' && data.pois && data.pois.length > 0) {
                        const pois = data.pois.map(poi => {
                            const [lng, lat] = poi.location.split(',');
                            return {
                                id: poi.id,
                                name: poi.name,
                                address: poi.address,
                                lng: parseFloat(lng),
                                lat: parseFloat(lat),
                                type: poi.type,
                                typecode: poi.typecode,
                                distance: poi.distance,
                                rating: poi.biz_ext && poi.biz_ext.rating ? poi.biz_ext.rating : '暂无',
                                cost: poi.biz_ext && poi.biz_ext.cost ? poi.biz_ext.cost : '暂无',
                                weight: poi.weight || 0
                            };
                        });

                        pois.sort((a, b) => b.weight - a.weight);
                        resolve(pois);
                    } else {
                        resolve([]);
                    }
                })
                .catch(error => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    },

    searchPOIByJSAPI(center, radius, type) {
        return new Promise((resolve, reject) => {
            if (!this.placeSearch) {
                reject(new Error('POI搜索未初始化'));
                return;
            }

            const centerLngLat = [center.lng, center.lat];

            this.placeSearch.searchNearBy(
                type,
                centerLngLat,
                radius * 1000,
                (status, result) => {
                    console.log('JS API POI搜索结果:', status, result);
                    if (status === 'complete' && result.poiList) {
                        const pois = result.poiList.pois.map(poi => ({
                            id: poi.id,
                            name: poi.name,
                            address: poi.address,
                            lng: poi.location.lng,
                            lat: poi.location.lat,
                            type: poi.type,
                            typecode: poi.typecode,
                            distance: poi.distance,
                            rating: poi.biz_ext.rating || '暂无',
                            cost: poi.biz_ext.cost || '暂无',
                            weight: poi.weight || 0
                        }));

                        pois.sort((a, b) => b.weight - a.weight);

                        resolve(pois);
                    } else {
                        resolve([]);
                    }
                }
            );
        });
    },

    addPOIMarker(poi, index) {
        const marker = new AMap.Marker({
            position: [poi.lng, poi.lat],
            title: poi.name,
            label: {
                content: `<div class="poi-marker">${index + 1}</div>`,
                direction: 'top'
            }
        });

        marker.setMap(this.map);
        return marker;
    },

    setZoomAndCenter(zoom, center) {
        this.map.setZoomAndCenter(zoom, [center.lng, center.lat]);
    },

    panTo(lng, lat) {
        this.map.panTo([lng, lat]);
    }
};
