# CFVlessWithSuber

Vless script work on CF worker and pages with suber
自带定阅器的多ProxyIP，多合一Vless脚本

## 特点

相比较现行的CF vless脚本，最大的特点在于：

- 支持多个反代ProxyIP及CF优选IP组合，方便手搓生成固定地区的节点
- 结合CF KV，支持IP远程推送修改，方便实现全自动化IP优选并生成订阅
- 单项目自带订阅，不依赖第三方，自主可控、安全高效（暂时只支持V2rayNG\Clash Mate内核，可自定义Clash模板）

## 使用说明

1. 使用CF worker的安装：
   - 新建一个Worker。
   - 将 [worker.js](https://github.com/VxNull/CFVlessWithSuber/blob/main/_worker.js) 的内容粘贴到 Worker 编辑器中。
   - 修改第7行的UUID。
   - 修改第9行的c_goodips数组的IP信息，主要有：country-proxyIP-cfIP。

2. 给 workers绑定 自定义域：
   - 在 workers控制台的 `触发器`选项卡，下方点击 `添加自定义域`。
   - 填入你已转入 CF 域名解析服务的次级域名，例如:`vless.xxxxxxxxx.xyz`后 点击`添加自定义域`，等待证书生效即可。

3. 订阅信息
   - `V2rayNG`订阅地址：`https://vless.xxxxxxxxx.xyz/[UUID]`
   - `Clash Mate`订阅地址：`https://vless.xxxxxxxxx.xyz/[UUID]?sub=clash`
   - 调试打印未编码节点地址：`https://vless.xxxxxxxxx.xyz/[UUID]?sub=raw`
   - 调试打印KV存储内容地址：`https://vless.xxxxxxxxx.xyz/[UUID]?sub=print_kv`

4. ENV环境变量配置

   | 变量            | 说明                                                         | 示例                                                         |
   | --------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
   | UUID            | Vless节点UUID，将覆盖代码中的值                              | 89a571fb-4fd2-4b37-8596-1b7d9728af45                         |
   | CLASH_TEMPL_URL | Clash模板文件地址，建议采用github raw文件地址。模板文件中插入节点的地方填写：`#  - {{proxies_list}}`，要插入节点组名的地方填入：`#      - {{proxies_name_list}}`，可以参考默认的模板文件。 | https://raw.githubusercontent.com/VxNull/ClashTemplate/main/v2aryse_clash_meta_templ.yaml |
   | SHORT_SEC_URL   | 修改地址URL访问，用于取代订阅地址中的[UUID]字段以方便人工输入使用。请注意安全保密，并建议取值16个及以上无规律字符串防止被扫。 | 订阅地址：https://vless.xxxxxxxxx.xyz/[SHORT_SEC_URL]        |
   | ACCESS_KEY      | 配合绑定KV使用后，用于Post修改KV值的API安全加强认证，启用该变量后，要求在Post 的Header里带上：`Access-Key: [ACCESS_KEY]`才能访问。 | Post请求：https://vless.xxxxxxxxx.xyz/[UUID]，同时配置好Header信息：`Access-Key: [ACCESS_KEY]` |

5. KV绑定（高级选项，预留用于自动化远程推送）

   新建一个KV，并在Worker的**Settings-Variables-KV Namespace Bindings**菜单下，绑定好：名为`GOODIP_KV`的KV。

   绑定后，就可以通过Post请求地址：https://vless.xxxxxxxxx.xyz/[UUID] 修改内KV内容，如果有配置`ACCESS_KEY`，则要求配置好Header：`Access-Key: [ACCESS_KEY]`，curl示例：

   ```shell
   curl -X POST https://vless.xxxxxxxxx.xyz/[UUID] \
        -H "Content-Type: application/json" \
        -H "Access-Key: [ACCESS_KEY]" \
        -d '[
          {"country": "HK", "proxyIP": ["192.168.0.1", "192.168.0.2", "192.168.0.3"], "cfIP": ["172.16.0.1"]},
          {"country": "US", "proxyIP": ["203.0.113.1", "203.0.113.2"], "cfIP": ["198.51.100.1", "198.51.100.2", "198.51.100.3"]},
          {"country": "DE", "proxyIP": ["85.214.123.1"], "cfIP": ["85.214.123.2", "85.214.123.3"]}
        ]'
   ```

   这部分将会结合另外一个反代IP自动查找开源项目实现。

6. Clash定阅说明
   项目使用简单的替换方式实现Clash定阅，将模板文件中的proxies及proxy-groups自动替换生成，如下图所示：

   ![WXWorkCapture_17187021301456](https://github.com/VxNull/CFVlessWithSuber/blob/main/doc/WXWorkCapture_17187021301456.png)
   
   所以只需要在Clash模板文件中插入节点的地方填写：`#  - {{proxies_list}}`，要插入节点组名的地方填入：`#      - {{proxies_name_list}}`。

   默认的模板文件：https://raw.githubusercontent.com/VxNull/ClashTemplate/main/v2aryse_clash_meta_templ.yaml

   自定义模板文件地址通过变量`CLASH_TEMPL_URL`指定。

   
## 声明

本项目被设计和开发仅供学习、研究和安全测试目的。它旨在为安全研究者、学术界人士和技术爱好者提供一个了解和实践网络通信技术的工具。使用者在下载和使用该项目时，必须遵守当地法律和规定。使用者有责任确保他们的行为符合其所在地区的法律、规章以及其他适用的规定。

## 感谢

[cmliu](https://github.com/cmliu/edgetunnel)

