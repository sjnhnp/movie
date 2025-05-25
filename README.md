- cf绑定kv spacename：LIBRETV_PROXY_KV
- cloudflare pages / vercel 部署方法见[上游](https://github.com/LibreSpark/LibreTV)
  
与[上游](https://github.com/LibreSpark/LibreTV)主要差异

- 首页-设置-预加载集数开关
- 代码优化/瘦身，重构
- 播放页：
  - 依然使用dplayer
  - 记住进度：每一集，独立于观看历史进度
  - 修复某些浏览器点播其它集数不能自动播放的问题
  - 播放页整个网页快捷键
  - 跳过片头和片尾，自定义时间（秒）
  - 播放器双击：暂停/播放
  - 锁屏下，右上角全屏按钮+F快捷键全屏
- 观看历史
  - 保留观看过的每个集数
- 首页集数弹窗，播放同样可以按每集进度进入
- 豆瓣热门推荐的搜索结果，不计入搜索历史。
