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
