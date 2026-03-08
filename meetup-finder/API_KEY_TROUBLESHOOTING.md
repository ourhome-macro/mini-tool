# API Key 配置问题排查

## 问题：地址解析超时

如果你看到"地址解析超时，请检查API Key是否有地理编码权限"的错误，说明你的API Key可能缺少地理编码权限。

## 解决方案

### 1. 检查API Key权限

1. 登录 [高德开放平台控制台](https://console.amap.com/dev/key/app)
2. 找到你的应用
3. 查看Key的服务是否包含：
   - ✅ Web服务（必须有）
   - ✅ Web端(JS API)（必须有）

### 2. 开通地理编码服务

**重要：** 高德地图的地理编码服务需要单独开通！

1. 进入 [高德开放平台控制台](https://console.amap.com/dev/key/app)
2. 点击你的应用名称
3. 找到"服务平台"设置
4. 确保勾选了：
   - **Web服务** - 包含地理编码、路径规划等服务
   - **Web端(JS API)** - 地图显示服务

### 3. 创建新的Key（推荐）

如果当前Key权限不足，建议重新创建：

1. 进入控制台 → 应用管理 → 我的应用
2. 点击"添加新Key"
3. 选择服务平台：**Web服务**
4. 勾选服务：
   - ✅ 地理编码
   - ✅ 路径规划
   - ✅ POI搜索
5. 提交后获取新Key
6. 再创建一个Key，选择：**Web端(JS API)**
7. 将两个Key分别配置到项目中

### 4. 配置双Key方案

如果你的应用需要同时使用地图显示和地理编码，建议配置两个Key：

**修改 `js/map.js` 文件：**

```javascript
const MapManager = {
    map: null,
    markers: [],
    centerMarker: null,
    circle: null,
    geocoder: null,
    placeSearch: null,
    apiKey: '你的JS_API_Key',        // 用于地图显示
    webServiceKey: '你的Web服务Key',  // 用于地理编码
    isReady: false,
    readyCallbacks: [],
    
    // ... 其他代码
};
```

### 5. 使用Web服务API进行地理编码

如果JS API的地理编码不工作，可以改用Web服务API：

**修改地理编码方法：**

```javascript
geocode(address) {
    return new Promise((resolve, reject) => {
        const url = `https://restapi.amap.com/v3/geocode/geo?key=${this.webServiceKey}&address=${encodeURIComponent(address)}`;
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
                    const geocode = data.geocodes[0];
                    resolve({
                        lng: parseFloat(geocode.location.split(',')[0]),
                        lat: parseFloat(geocode.location.split(',')[1]),
                        formattedAddress: geocode.formatted_address
                    });
                } else {
                    reject(new Error('未找到该地址'));
                }
            })
            .catch(error => reject(error));
    });
}
```

## 验证API Key是否正确

### 测试地理编码API

在浏览器中访问以下URL（替换你的Key）：

```
https://restapi.amap.com/v3/geocode/geo?key=你的Key&address=北京市朝阳区三里屯
```

如果返回：
```json
{
  "status": "1",
  "info": "OK",
  "geocodes": [...]
}
```
说明Key有地理编码权限。

如果返回：
```json
{
  "status": "0",
  "info": "INVALID_USER_KEY"
}
```
说明Key无效或没有权限。

## 常见错误代码

- `INVALID_USER_KEY` - Key无效
- `SERVICE_NOT_AVAILABLE` - 服务未开通
- `DAILY_QUERY_OVER_LIMIT` - 超过日调用量限制
- `ACCESS_TOO_FREQUENT` - 访问过于频繁

## 联系支持

如果以上方法都无法解决，请联系高德地图技术支持：
- 官方文档：https://lbs.amap.com/api/javascript-api/guide/abc/prepare
- 开发者社区：https://lbs.amap.com/dev/
