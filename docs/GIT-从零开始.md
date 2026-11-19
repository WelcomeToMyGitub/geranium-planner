# Git 从零开始（配这个项目）

写给完全没用过 Git 的人。照着做，最后你会有一个自己的 GitHub 仓库，
里面是这个规划器的完整提交历史。

---

## 0. 装 Git

1. 打开 https://git-scm.com/download/win
2. 下载 **64-bit Git for Windows Setup**
3. 一路下一步。安装选项里唯一要注意的：
   - 默认编辑器选 **Visual Studio Code**（如果装了）或者 Notepad
   - `PATH` 选默认的 **Git from the command line and also from 3rd-party software**
   - 换行符选 **Checkout Windows-style, commit Unix-style**（默认）
4. 装完打开 **PowerShell**，输入：

```powershell
git --version
```

看到 `git version 2.x.x` 就成功了。

> 如果提示“无法识别 git”，重启一次 PowerShell；还不行就重装，注意 PATH 那一步。

---

## 1. 注册 GitHub

1. 打开 https://github.com
2. 点右上角 **Sign up**
3. 依次填：邮箱 → 密码 → 用户名（英文，会成为你主页地址）→ 邮箱验证码
4. 选 **Free** 计划
5. 进邮箱点验证链接

注册完，你的主页是 `https://github.com/你的用户名`。

---

## 2. 配置身份（只需一次）

Git 提交时会记录作者，先告诉它你是谁：

```powershell
git config --global user.name "你的名字或昵称"
git config --global user.email "你注册 GitHub 的邮箱"
git config --global init.defaultBranch main
```

检查：

```powershell
git config --global --list
```

> 这两项会写进每一次提交。邮箱建议和 GitHub 一致，否则提交不会算到你头上。

---

## 3. 把项目变成 Git 仓库

```powershell
cd F:\P_Games\geranium-planner
git init
```

输出 `Initialized empty Git repository in ...` 就对了。

看一眼状态：

```powershell
git status
```

你会看到一堆红色文件——它们在“工作区”，还没被 Git 管。

---

## 4. 第一次提交

先看看会提交哪些文件（`.gitignore` 已经帮你排除了临时文件）：

```powershell
git add .
git status
```

红色变绿色，说明进了“暂存区”。然后提交：

```powershell
git commit -m "init: 项目骨架、样式、默认数据"
```

看历史：

```powershell
git log --oneline
```

只有一条，但已经是可追溯的起点了。

---

## 5. 建远程仓库并推上去

1. 打开 https://github.com/new
2. Repository name 填 `geranium-planner`
3. 选 **Public**（作品集要公开）或 Private
4. **不要**勾 "Add a README"（我们本地已经有了）
5. 点 **Create repository**

然后回到 PowerShell，把本地和远程连起来：

```powershell
git remote add origin https://github.com/你的用户名/geranium-planner.git
git branch -M main
git push -u origin main
```

第一次 push 会弹窗让你登录 GitHub：选 **Sign in with your browser**，
浏览器里点授权即可（Git for Windows 自带凭据管理器，只需一次）。

刷新 GitHub 页面，文件应该都在了。

---

## 6. 后续的提交路线（练手用）

不要一次全提交完。按下面顺序，每完成一步提交一次，历史才好看。

| # | 改什么 | commit message |
|---|---|---|
| 1 | 现在这样 | `init: 项目骨架、样式、默认数据` |
| 2 | 改 README 里的说明 | `docs: 补充功能说明` |
| 3 | 调整样式（颜色、间距） | `style: 调整卡片间距` |
| 4 | 给配方表加一列 | `feat: 配方表显示层级` |
| 5 | 改 `model.js` 的常量 | `refactor: 抽出 perSuccess 常量` |
| 6 | 修一个小 bug | `fix: 库存为 0 时不再显示负数` |
| 7 | 加注释 | `docs: 补充模型注释` |
| 8 | 加 `data/recipes.json` | `feat: 配方支持导出 JSON` |

每步都是：

```powershell
git status          # 看改了什么
git diff            # 看具体改了哪几行
git add .
git commit -m "xxx"
```

---

## 7. 分支：改坏了也不怕

分支 = 平行世界。先在分支上试，满意了再合回 main。

```powershell
git switch -c feature/seed-yield
```

在这个分支上改代码、提交。改完：

```powershell
git switch main
git merge feature/seed-yield
```

如果 main 没动过，会直接“快进合并”，很顺。

删掉用完的分支：

```powershell
git branch -d feature/seed-yield
```

---

## 8. 冲突：长什么样，怎么解

故意制造一次：

1. 在 `main` 上改 README 第一行，提交
2. `git switch feature/x`，也改同一行，提交
3. `git switch main`，`git merge feature/x`

会报 `CONFLICT`。打开文件，会看到：

```
<<<<<<< HEAD
main 上的版本
=======
feature 上的版本
>>>>>>> feature/x
```

改成人话（删掉 `<<<<<<<`、`=======`、`>>>>>>>` 三行，保留你要的内容），然后：

```powershell
git add README.md
git commit
```

冲突解决完，`git status` 应该干净。

---

## 9. 日常最常用的 8 条

```powershell
git status                 # 现在什么状态
git diff                   # 改了哪几行
git add .                  # 全部加入暂存
git commit -m "说明"        # 提交
git log --oneline --graph  # 看历史
git switch -c 分支名        # 建并切分支
git switch main            # 切回 main
git push                   # 推到 GitHub
```

出事了先别慌：

```powershell
git restore 文件名          # 撤销工作区改动（没 add 的）
git restore --staged 文件名  # 从暂存区拿出来
git reset --soft HEAD~1     # 撤销上一次提交，改动还在
```

---

## 10. 常见的坑

- **`git add .` 之后后悔**：`git restore --staged .`
- **提交信息写错**：`git commit --amend -m "新信息"`
- **push 被拒（non-fast-forward）**：先 `git pull --rebase`，再 push
- **不小心提交了密码**：立刻改密码，并从历史里删（`git filter-repo`），别只删文件
- **换电脑**：`git clone https://github.com/你的用户名/geranium-planner.git`
- **中文文件名乱码**：`git config --global core.quotepath false`

---

## 11. 做完之后

你的仓库应该长这样：

```
geranium-planner/
├─ index.html
├─ css/style.css
├─ js/{data,model,ui,main}.js
├─ data/
├─ tools/serve.py
├─ docs/GIT-从零开始.md
├─ README.md
└─ .gitignore
```

再加一个 `docs/设计说明.md`，写清楚：
问题是什么 → 怎么抽象成图 → 公式怎么来的 → 哪些是假设 → 怎么验证。
这份文档在面试时比代码更能说明问题。
