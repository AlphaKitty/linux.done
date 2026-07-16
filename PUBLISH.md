# 开源发布说明（给仓库维护者）

本目录 `linux.done/` 即为 **可独立开源的完整扩展包**。  
当前父目录可能还混有其它实验文件 / 历史 Git 对象，**不要把整个 soloapp monorepo 直接公开**。

## 推荐：导出为全新干净仓库

在任意空目录执行：

```bash
# 1) 复制扩展目录（排除依赖与系统垃圾）
rsync -a --exclude node_modules --exclude .DS_Store --exclude '*.zip' \
  /path/to/soloapp/linux.done/ \
  /path/to/linux.done-oss/

cd /path/to/linux.done-oss

# 2) 初始化独立 Git 仓库
git init
git add .
git status   # 确认只有扩展源码，无 node_modules / 密钥

# 3) 首提交
git commit -m "chore: initial open-source release of linux.done v1.0.5"

# 4) 关联 GitHub 并推送（先在 GitHub 建空仓库）
git branch -M main
git remote add origin git@github.com:<your-username>/linux.done.git
git push -u origin main
```

## 发布前检查清单

- [ ] `README.md` 中 Chrome Web Store 链接已替换真实 ID
- [ ] `package.json` / README 中 `<your-username>` 已替换
- [ ] `LICENSE` 版权人信息正确
- [ ] 确认愿意公开 `icons/wechat-pay.png` 等赞赏码
- [ ] `lib/analytics.js` 中 `API_SECRET` 仍为空（默认不发统计）
- [ ] `git status` 无 `.env`、无 `node_modules`、无日志 dump
- [ ] 本地 `chrome://extensions` 加载本目录可正常运行

## 打包扩展（本地 / 商店上传）

```bash
cd linux.done
npm run pack
# 生成 ../linux.done-v1.0.5.zip
```

或手动：

```bash
zip -r linux.done-v1.0.5.zip . \
  -x '*.git*' -x 'node_modules/*' -x '*.zip' -x '.DS_Store' -x 'PUBLISH.md'
```

## 目录应包含的文件

```
LICENSE
README.md
.gitignore
package.json
manifest.json
background.js
content.js
content.css
lib/
popup/
options/
icons/
```

不应包含：

```
node_modules/
.git/          # 仅在复制到新仓库后重新 init
*.zip / *.crx
.env*
.playwright-mcp/
其它 monorepo 项目文件
```
