# 上传到 GitHub（三步）

这个 zip 里是 `dsh-reverse-switch` 0.1.0 的完整源码（不含 node_modules / .git）。

## 1. 解压后初始化并推送

```powershell
cd <解压出来的目录>
git init
git add -A
git commit -m "dsh-reverse-switch 0.1.0: sidebar switch for REA + Craft Anything"
git branch -M main
git remote add origin https://github.com/<你的用户名>/dsh-reverse-switch.git
git push -u origin main
```

> GitHub 现在直连不通（`github.com` 超时）。推送前先把代理挂上，或者用
> `git config --global http.proxy http://127.0.0.1:7890`。

## 2. 用 GitHub 的 commit 重新钉索引

索引里必须写死一个 40 位 commit，否则插件市场装不了。本地这份还钉在
Gitee 的 `87d3647` 上，推完 GitHub 后重跑一次：

```powershell
$sha = git rev-parse HEAD
node scripts/build-index.mjs --source git --repo https://github.com/<你的用户名>/dsh-reverse-switch --commit $sha
node scripts/validate-index.mjs --base https://raw.githubusercontent.com/<你的用户名>/dsh-reverse-switch/main/market/index.json
git add market/index.json
git commit -m "index: pin $sha"
git push
```

## 3. 拿到索引地址

```
https://raw.githubusercontent.com/<你的用户名>/dsh-reverse-switch/main/market/index.json
```

在 DSH 里：**插件 → 发现 → 索引源 → 添加**，粘贴这条。

图标用相对路径 `icons/reverse-mode.svg`，会相对索引 URL 解析成
`.../main/market/icons/reverse-mode.svg`，不用改文件。

## 注意

- `raw.githubusercontent.com` 国内直连经常超时。DSH 的 plugin-market 不走系统代理，
  所以别人在国内大概率读不到这条索引 —— Gitee 那条
  （`raw.giteeusercontent.com`）才是国内可用的。两条可以同时加。
- 仓库必须是**公开**的，否则 DSH 拉不到。
- 如果只想留 GitHub 一份、不要 Gitee，把 `market/index.json` 里的 source 换掉即可，
  第 2 步的脚本会自动做这件事。
