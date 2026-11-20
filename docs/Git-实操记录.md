# Git 实操记录（本项目真实步骤）

这份文件记录的是**这台机器上实际执行过**的命令，以及踩到的坑。
和 `GIT-从零开始.md` 的区别：那个是通用教程，这个是“照着做就能复现”的流水账。

- 系统：Windows
- 终端：PowerShell（`cmd` 也可以，命令一样）
- 项目路径：`F:\P_Games\geranium-planner`
- GitHub 用户名：`WelcomeToMyGitub`
- 仓库地址：`https://github.com/WelcomeToMyGitub/geranium-planner.git`

---

## 一、一次性配置

```powershell
git config --global user.name "HHH"
git config --global user.email "2638838069@qq.com"
git config --global init.defaultBranch main
```

- `user.name` 只是提交记录里显示的作者名，**和 GitHub 账号无关**，随便起。
- `user.email` 建议和 GitHub 注册邮箱一致，否则提交不会算到你头上。

---

## 二、建仓 + 首次提交

```powershell
cd F:\P_Games\geranium-planner
git init
git status
git add .
git commit -m "init: 项目骨架、样式、默认数据"
git log --oneline
```

成功标志：

```
[main (root-commit) acbe50f] init: 项目骨架、样式、默认数据
 10 files changed, 1350 insertions(+)
```

---

## 三、关联远程 + 推送

```powershell
git remote add origin https://github.com/WelcomeToMyGitub/geranium-planner.git
git branch -M main
git push -u origin main
```

第一次 push 会弹浏览器授权，选 **Sign in with your browser**，点授权即可。
凭据会被 Windows 凭据管理器记住，之后不用再登。

成功标志：

```
 * [new branch]      main -> main
branch 'main' set up to track 'origin/main'.
```

---

## 四、踩过的坑

### 4.1 `remote: Repository not found`

完整报错：

```
git push -u origin main
info: please complete authentication in your browser...
remote: Repository not found.
fatal: repository 'https://github.com/HHH/geranium-planner.git/' not found
```

**原因**：远程地址里写的是 `HHH`，那是 `user.name`（显示名），不是 GitHub 用户名。
GitHub 上没有 `github.com/HHH` 这个账号，自然找不到仓库。

**排查顺序**：

1. 浏览器登录 GitHub，看右上角头像菜单里的 **Signed in as `xxxx`**，那才是用户名。
2. 确认仓库是否真的建了：打开 `https://github.com/xxxx/geranium-planner`，404 就是没建。
3. 没建就去 https://github.com/new 建一个，名字 `geranium-planner`，**不要勾 README**。
4. 改远程地址：

```powershell
git remote -v
git remote set-url origin https://github.com/xxxx/geranium-planner.git
git remote -v
git push -u origin main
```

**其他可能**：

- 仓库名打错（下划线 / 连字符）——以仓库页面地址栏为准。
- 浏览器授权时选了另一个 GitHub 账号——删掉 Windows 凭据后重试：
  控制面板 → 用户账户 → 凭据管理器 → Windows 凭据 → 删除 `git:https://github.com`。
- 仓库是 Private，当前账号没权限。

### 4.2 其他高频坑

| 现象 | 原因 | 解决 |
|---|---|---|
| `src refspec main does not match any` | 还没提交过 | 先 `git add .` + `git commit` |
| `failed to push some refs` / `non-fast-forward` | 远程有你本地没有的提交 | `git pull --rebase` 再 `git push` |
| `Please tell me who you are` | 没配 `user.name/email` | 回到第一节配置 |
| 中文文件名显示成 `\344\270\255` | Git 默认转义 | `git config --global core.quotepath false` |
| 提交里出现了不该有的文件 | 忘了 `.gitignore` | 补规则后 `git rm --cached 文件名` |

---

## 五、日常更新：四种场景

### 场景 A：只改代码（最常见）

```powershell
git status              # 看改了哪些文件
git diff                # 看具体改了哪几行
# 打开 index.html 刷新，确认功能正常
git add .
git commit -m "feat: 加生长时间估算"
git push
```

### 场景 B：只提交某几个文件

```powershell
git add js/model.js js/ui.js
git commit -m "fix: 修正需求展开的取整"
git push
```

### 场景 C：改坏了，想撤销

```powershell
# 还没 add，想丢弃工作区改动
git restore 文件名

# 已经 add 了，想拿回工作区
git restore --staged 文件名

# 已经 commit 了，想撤销这次提交但保留代码
git reset --soft HEAD~1

# 提交信息写错了（还没 push）
git commit --amend -m "新的说明"
```

> 已经 push 的提交不要 `reset`，用新的提交去修正。

### 场景 D：push 被拒

```powershell
git pull --rebase
git push
```

---

## 六、命令速查（按“什么时候用”）

| 什么时候用 | 命令 | 危险度 |
|---|---|---|
| 不知道现在什么状态 | `git status` | 安全 |
| 想知道改了哪几行 | `git diff` | 安全 |
| 看提交历史 | `git log --oneline --graph` | 安全 |
| 提交全部改动 | `git add .` → `git commit -m "..."` | 安全 |
| 只提交部分文件 | `git add 路径` | 安全 |
| 推到 GitHub | `git push` | 安全 |
| 拉远程更新 | `git pull --rebase` | 中等 |
| 丢弃未提交的改动 | `git restore 文件` | **会丢代码** |
| 撤销上一次提交（保留代码） | `git reset --soft HEAD~1` | 中等 |
| 暂存手头工作 | `git stash` / `git stash pop` | 安全 |
| 开新功能 | `git switch -c feature/xxx` | 安全 |
| 合并分支 | `git switch main` → `git merge feature/xxx` | 中等 |
| 删分支 | `git branch -d feature/xxx` | 中等 |

---

## 七、分支练习（建议做一次）

```powershell
git switch -c feature/growth-time
# 改代码
git add .
git commit -m "feat: 加生长时间估算"
git switch main
git merge feature/growth-time
git push
git branch -d feature/growth-time
```

再故意让两个分支改同一行，制造一次冲突，手动解决一次。
解决冲突的流程：改文件 → `git add` → `git commit`。

---

## 八、提交信息怎么写

格式：`类型: 一句话说明`

| 类型 | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修 bug |
| `docs` | 文档 |
| `style` | 格式/样式，不改逻辑 |
| `refactor` | 重构，不改行为 |
| `test` | 测试 |
| `chore` | 杂项（配置、依赖） |

例子：

- `feat: 结果里显示预计需要几天`
- `fix: 库存为 0 时不再显示负数`
- `docs: 补充模型公式说明`

原则：**一次提交只做一件事**，提交信息说清“做了什么”，不用说“怎么做的”。

---

# 第二阶段实操（分支 / 分页器 / 网络 / Pages）

以下都是这套项目里真实发生过的，按时间顺序。

## 九、分支完整走一遍

这次改的是三个文件（`index.html`、`js/model.js`、`js/ui.js`），开了分支：

```powershell
git branch                              # 看当前在哪个分支，* 是当前
git switch -c feature/target-mode       # 新建并切过去
git status                              # 确认改动还在
git add index.html js/model.js js/ui.js
git commit -m "feat: 配方表折叠 + 指定花材求解与路线排序"
git switch main
git merge feature/target-mode
git push
git branch -d feature/target-mode
```

关键输出：

```
Updating acbe50f..9981b05
Fast-forward
...
 * [new branch]      main -> main
Deleted branch feature/target-mode (was 9981b05).
```

- `Fast-forward`：main 没有分叉，直接快进到分支的最新提交，不产生合并提交
- `-d` 能删成功，说明这个分支**已经合并**；没合并的分支 `-d` 会拒绝，要 `-D` 强删（有风险）

### 关于分支的三个结论

1. 分支 = 指向某个提交的**可移动指针**，建/切/删都很便宜。
2. 未提交的改动**不属于任何分支**，切分支时会跟着走。
3. 删掉**未合并**的分支，提交会变成悬空提交，短期内能用 `git reflog` 找回，但不保险。

## 十、`git diff` 卡在 `less` 里

现象：敲 `git diff` 后满屏英文，底部有 `:`，按 `h` 后出现 “SUMMARY OF LESS COMMANDS”。

这不是报错，是 Git 调用了分页器 `less`。

```text
q        退出（在帮助页里按一次回到 diff，再按一次退出）
空格     下一屏
b        上一屏
/关键词  搜索
h        帮助
```

不想进分页器：

```powershell
git --no-pager diff
git diff --stat
```

### diff 怎么看

```
diff --git a/index.html b/index.html   ← 比较这个文件
index ffd61e2..8ffb39a 100644          ← 两个版本的内部编号
--- a/index.html                       ← 旧版
+++ b/index.html                       ← 新版
@@ -8,8 +8,8 @@                        ← 从第 8 行起，各 8 行
-  旧的一行
+  新的一行
```

| 命令 | 比较范围 |
|---|---|
| `git diff` | 工作区 ↔ 暂存区（还没 add 的） |
| `git diff --staged` | 暂存区 ↔ 上次提交 |
| `git diff HEAD` | 工作区 ↔ 上次提交 |

## 十一、push 报 `Connection was reset`

```text
fatal: unable to access 'https://github.com/...': Recv failure: Connection was reset
```

**这是网络问题，不是代码问题。** 本地提交已经存在，不会丢。

处理顺序：

1. 直接重试 `git push`（多数时候几次就好）
2. 有代理就配：

```powershell
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
git push
# 不用了取消
git config --global --unset http.proxy
git config --global --unset https.proxy
```

3. 改用 SSH：

```powershell
ssh-keygen -t ed25519 -C "2638838069@qq.com"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
# 复制到 GitHub → Settings → SSH and GPG keys → New SSH key
ssh -T git@github.com
git remote set-url origin git@github.com:WelcomeToMyGitub/geranium-planner.git
git push
```

## 十二、GitHub Pages

1. 仓库 → Settings → Pages
2. Source 选 `Deploy from a branch`
3. Branch 选 `main`，目录 `/ (root)`，Save
4. 等 1~2 分钟，页面顶部出现 `Your site is live at ...`

本项目的地址：

```text
https://welcometomygitub.github.io/geranium-planner/
```

要点：

- 之后每次 `git push` 到 main，会自动重新发布，等一分钟刷新
- 仓库必须 **Public**；Private 用 Pages 需要 GitHub Pro
- `localStorage` 按域名隔离，`file://` 和 `github.io` 的数据**不互通**，换过去要重填库存（配方可以导出/导入 JSON）
- 有链接就能访问 ≠ 搜索引擎能搜到；收录需要时间和外链

## 十三、提交历史（截至 2026-11-19）

```text
* d3c8c5a feat: 轮次排程 + 种子按收获数折算
* 9981b05 feat: 配方表折叠 + 指定花材求解与路线排序
* acbe50f init: 项目骨架、样式、默认数据
```

`git log --oneline --graph` 可以看同样的内容，带分支线。

## 十四、每次改完的固定动作

```powershell
git status                 # 1. 看改了哪些文件
git diff --stat            # 2. 看改动规模（想细看就 git diff）
# 3. 打开页面自测
git add 具体文件            # 4. 精确添加，别用 . 盲加
git commit -m "feat: xxx"  # 5. 一次一件事
git push                   # 6. 推上去
```

## 十五、这一阶段最值钱的几条经验

1. **`user.name` ≠ GitHub 用户名**，远程地址里必须是账号名。
2. **GitHub 页面上的提交信息列，是 `-m` 写的内容**，GitHub 只负责按历史展示。
3. **分支是保险，不是规矩**：小改动直接 main 也行，大改动开分支。
4. **push 失败不影响本地提交**，网络恢复后重试即可。
5. **浏览器读的是工作区文件，不是 git 历史**：改完刷新就生效，commit 只是存档。
6. **Pages 是公开的**，放上去等于把源码和页面都给所有人看。

---

# 第三阶段：分支的几个细节问题

## 十六、切分支会改本地文件吗

会，但只改**本地工作区**，和 GitHub 无关。

- `git switch xxx` 会把工作区的文件换成 `xxx` 分支当前提交的样子
- **不会**从 GitHub 拉东西；只有 `git pull` / `git fetch` 才会访问远程
- 所以“切分支”不是下载，是**在本地已存在的提交之间切换快照**

未提交的改动怎么办：

| 情况 | 结果 |
|---|---|
| 改动和要切的版本不冲突 | 改动跟着过去，不丢 |
| 改动会被覆盖 | Git 拒绝切换，提示 `Your local changes would be overwritten` |
| 已经 commit | 属于那个分支，切换后看不到，切回来还在 |

本地和远程的关系：

```text
工作区 ──add──▶ 暂存区 ──commit──▶ 本地仓库 ──push──▶ GitHub
                                      ◀──pull/fetch──
```

`switch` 只在前两格之间动，碰不到 GitHub。

## 十七、多久提交一次

三个层次分开看：

| 动作 | 频率 | 说明 |
|---|---|---|
| `commit` | 每完成一个能跑的小步骤（10~30 分钟） | 本地操作，免费，越细越好回退 |
| `push` | 一天一次，或一个功能一次 | 只是备份到 GitHub，不必每次提交都推 |
| 分支 | 一个功能一个分支 | 可以多次提交，最后一起 merge |

推荐的粒度：

- 改完一个按钮、一个函数、修一个 bug → commit 一次
- 一个功能拆成 3~5 个 commit → 最后 merge 进 main → push 一次
- 不要攒一整天再提交，出问题时不好定位

## 十八、一个功能一个分支，多次提交再合并

完全可以，而且是最常见的做法：

```powershell
git switch -c feature/explore-mode
# 第一次提交
git add js/model.js && git commit -m "feat: 加试探成本计算"
# 第二次提交
git add js/ui.js && git commit -m "feat: 试探清单表格"
# 第三次提交
git add index.html && git commit -m "style: 折叠原有推荐"
# 一起合并
git switch main
git merge feature/explore-mode
git push
git branch -d feature/explore-mode
```

每个 commit 都是独立的存档点，合并时一起带进 main。

## 十九、合并后删分支，模块还能找到吗

能。**删分支只删指针，提交已经在 main 的历史里。**

查找方式：

```powershell
git log --oneline --graph                 # 看整体历史
git log --oneline -- js/ui.js             # 只看某个文件的历史
git log --oneline --grep="试探"            # 按提交信息搜
git show 9981b05                           # 看某次提交改了什么
git blame js/ui.js                         # 每一行是谁哪次提交写的
```

一个差别：

- **fast-forward 合并**：历史是直线，看不出“这个功能从哪到哪”
- **`git merge --no-ff`**：强制生成一个合并提交，功能边界清楚

想让某个版本好找，可以打 tag：

```powershell
git tag v1.0
git push origin v1.0
```

tag 是给提交起的“版本名”，和 commit message 不是一回事。

---

# 第四阶段：数据存哪、UI 小坑、提交粒度

## 二十、「保存配方」到底写到哪

两层存储，别混：

```text
js/data.js（仓库文件，所有人共享）
   │ 页面启动时读取（localStorage 没有配方时才用）
   ▼
localStorage（本浏览器）
   │ 「保存配方」只写这里
   ▼
刷新后优先用 localStorage
```

结论：

- 网页里点「保存配方」→ 只改自己浏览器，**不会改 `js/data.js`**
- 想让所有人看到新的默认值 → 改 `js/data.js` → `commit` → `push`
- 改完 `data.js` 后，本地要「恢复默认配方」→「保存配方」，否则旧 localStorage 会盖住新默认

## 二十一、`hidden` 属性被 `display:flex` 覆盖

现象：给 `<div class="row" hidden>` 加 hidden，元素还是显示。

原因：浏览器默认样式 `[hidden]{display:none}` 的优先级低于作者样式 `.row{display:flex}`。

解决：在 CSS 里补一条

```css
[hidden] { display: none !important; }
```

这个问题会让“解锁全部图鉴 / 获得指定花材”两个模式看起来同时生效。

## 二十二、提交粒度怎么分

原则：**一次提交一个主题**，但不必细到每个文件一行。

这次可以拆成四个：

```powershell
git add js/data.js
git commit -m "data: 移除不存在的 荣光×荣光 配方"

git add css/style.css
git commit -m "fix: 修复 hidden 被 display:flex 覆盖"

git add js/ui.js
git commit -m "feat: 种植区只显示本轮，完整需求折叠"

git add docs/Git-实操记录.md
git commit -m "docs: 记录数据存储与 hidden 覆盖问题"
```

判断标准：

- 能用一个词概括（data / fix / feat / docs / refactor）→ 一次提交
- 混了两个不相关的事 → 拆开
- 拆到“每个文件一次”通常没必要

## 二十三、`.docx` 之类的导出文件

`git status` 里出现 `docs/*.docx`，是导出物，不是源码。

- 想留档：`git add docs/*.docx` 一起提交
- 不想留：在 `.gitignore` 加 `*.docx`，再 `git rm --cached`（如果已经加过）



