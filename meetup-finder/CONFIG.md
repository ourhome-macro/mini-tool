# 高德地图API Key配置说明

## 如何获取API Key

1. 访问高德开放平台：https://lbs.amap.com/
2. 注册/登录账号
3. 进入控制台 → 应用管理 → 我的应用
4. 点击"创建新应用"
5. 填写应用信息：
   - 应用名称：朋友聚会地点查找器
   - 应用类型：Web端
6. 添加Key，服务平台选择"Web端(JS API)"
7. 复制生成的Key

## 配置方法

打开 `js/map.js` 文件，找到第6行：

```javascript
apiKey: 'YOUR_AMAP_KEY_HERE',
```

将 `YOUR_AMAP_KEY_HERE` 替换为你刚才复制的API Key。

## 安全建议

1. **域名白名单**
   - 在高德控制台设置允许的域名
   - 防止Key被他人滥用

2. **不要提交到公开仓库**
   - 如果使用Git，建议将Key配置在单独的文件中
   - 可以创建 `config.js` 文件存储Key

3. **使用环境变量**（如果使用构建工具）
   ```javascript
   apiKey: process.env.AMAP_KEY,
   ```

## 示例配置

```javascript
// js/map.js
const MapManager = {
    map: null,
    markers: [],
    centerMarker: null,
    circle: null,
    geocoder: null,
    placeSearch: null,
    apiKey: '你的API_Key_放在这里',  // 替换这一行
    
    // ... 其他代码
};
```

## 验证Key是否生效

配置完成后，打开浏览器控制台：
- 如果看到地图正常加载，说明Key配置成功
- 如果看到错误提示，请检查Key是否正确
