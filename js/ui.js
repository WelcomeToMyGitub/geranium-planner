// 界面层：读 DOM、渲染表格、绑定事件。
// 所有计算都交给 GPModel，这里只负责“显示”和“存”。
(function (root) {
  "use strict";

  var D = root.GPData, M = root.GPModel;

  var LS_STOCK = "gp-stock-v4";
  var LS_RECIPES = "gp-recipes-v4";
  var LS_META = "gp-meta-v4";

  var state = {
    flowers: D.FLOWERS.slice(),
    unlocked: new Set(D.DEFAULT_UNLOCKED),
    recipes: clone(D.DEFAULT_RECIPES),
    stock: clone(D.DEFAULT_STOCK),
    plots: 8,
    roundLimit: 20,
    fallback: 0.04,
    refund: 0,
    seedYield: 1,
    harvestYield: 2,
    coins: 0,
    failReward: 2,
    maxBuy: 3,
    useEarned: true,
    targetMode: "unlock",
    targetFlower: "天鹅初恋",
    targetCount: 1,
    unlockCount: 0,
    sortBy: "cost",
    onlyLocked: true
  };

  var undoStack = [], redoStack = [], savedRecipes = "";

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function $(s) { return document.querySelector(s); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---------- 存 ----------
  function saveStock() {
    try {
      localStorage.setItem(LS_STOCK, JSON.stringify(state.stock));
      localStorage.setItem("gp-stock-at", String(Date.now()));
    } catch (e) {}
    renderStockStatus();
  }

  function renderStockStatus() {
    var el = document.getElementById("stockSaved");
    if (!el) return;
    var t = localStorage.getItem("gp-stock-at");
    el.textContent = t ? "本机已存 " + new Date(Number(t)).toLocaleTimeString() : "本机未存";
  }
  function syncStockFromDom() {
    document.querySelectorAll("#stockTable input").forEach(function (inp) {
      var k = inp.dataset.k, f = inp.dataset.f;
      state.stock[k] = state.stock[k] || {};
      state.stock[k][f] = Math.max(0, Math.round(num(inp.value) || 0));
    });
  }
  function saveMeta() {
    try {
      localStorage.setItem(LS_META, JSON.stringify({
        plots: state.plots,
        roundLimit: state.roundLimit,
        fallback: state.fallback,
        refund: state.refund,
        seedYield: state.seedYield,
        harvestYield: state.harvestYield,
        targetMode: state.targetMode,
        targetFlower: state.targetFlower,
        targetCount: state.targetCount,
        unlockCount: state.unlockCount,
        sortBy: state.sortBy,
        onlyLocked: state.onlyLocked,
        coins: state.coins,
        failReward: state.failReward,
        maxBuy: state.maxBuy,
        useEarned: state.useEarned,
        unlocked: Array.from(state.unlocked)
      }));
    } catch (e) {}
  }
  function saveRecipes() {
    try {
      localStorage.setItem(LS_RECIPES, JSON.stringify(state.recipes));
      savedRecipes = JSON.stringify(state.recipes);
      renderDirty();
    } catch (e) { alert("保存失败：" + e.message); }
  }
  function loadAll() {
    try {
      var s = localStorage.getItem(LS_STOCK) || localStorage.getItem("gp-stock-v3");
      if (s) {
        var d = JSON.parse(s);
        state.stock.flower = d.flower || {};
        state.stock.growing = d.growing || {};
        state.stock.seed = d.seed || {};
      } else if (window.GP_ADMIN_STOCK) {
        state.stock.flower = clone(window.GP_ADMIN_STOCK.flower || {});
        state.stock.growing = clone(window.GP_ADMIN_STOCK.growing || {});
        state.stock.seed = clone(window.GP_ADMIN_STOCK.seed || {});
      }
      var m = localStorage.getItem(LS_META) || localStorage.getItem("gp-meta-v3");
      if (m) {
        var mm = JSON.parse(m);
        ["plots", "fallback", "seedYield", "harvestYield", "targetCount", "unlockCount", "coins", "failReward", "roundLimit", "maxBuy"].forEach(function (k) {
          if (mm[k] !== undefined) state[k] = mm[k];
        });
        if (mm.refund !== undefined) state.refund = mm.refund;
        if (mm.targetMode) state.targetMode = mm.targetMode;
        if (mm.onlyLocked !== undefined) state.onlyLocked = mm.onlyLocked;
        if (mm.targetFlower) state.targetFlower = mm.targetFlower;
        if (mm.sortBy) state.sortBy = mm.sortBy;
        if (mm.useEarned !== undefined) state.useEarned = mm.useEarned;
        if (mm.unlocked) state.unlocked = new Set(mm.unlocked);
      }
      var r = localStorage.getItem(LS_RECIPES) || localStorage.getItem("gp-recipes-v3");
      if (r) {
        var rr = JSON.parse(r);
        if (Array.isArray(rr) && rr.length) state.recipes = rr;
      }
      savedRecipes = JSON.stringify(state.recipes);
    } catch (e) {}
  }

  // ---------- 撤销 ----------
  function snapshot() { return JSON.stringify(state.recipes); }
  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }
  function doUndo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    state.recipes = JSON.parse(undoStack.pop());
    renderRecipes(); calc();
  }
  function doRedo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    state.recipes = JSON.parse(redoStack.pop());
    renderRecipes(); calc();
  }
  function renderDirty() {
    var dirty = JSON.stringify(state.recipes) !== savedRecipes;
    var modified = JSON.stringify(state.recipes) !== JSON.stringify(D.DEFAULT_RECIPES);
    $("#dirtyFlag").textContent = dirty ? "● 配方有未保存修改" : "";
    $("#defaultFlag").textContent = modified ? "⚠ 配方已偏离默认" : "";
    $("#btnUndo").disabled = !undoStack.length;
    $("#btnRedo").disabled = !redoStack.length;
  }
  function renderRecipeToggle() {
    var open = !$("#recipeBody").hidden;
    $("#btnToggleRecipe").textContent = (open ? "收起" : "展开") + "（" + state.recipes.length + " 条）";
  }

  // ---------- 库存 ----------
  function download(name, text) {
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function saveSnapshot() {
    return {
      v: 1,
      savedAt: new Date().toISOString(),
      stock: state.stock,
      recipes: state.recipes,
      meta: {
        plots: state.plots, fallback: state.fallback, refund: state.refund,
        seedYield: state.seedYield, harvestYield: state.harvestYield,
        coins: state.coins, failReward: state.failReward, maxBuy: state.maxBuy, useEarned: state.useEarned,
        targetMode: state.targetMode, targetFlower: state.targetFlower,
        targetCount: state.targetCount,
        unlockCount: state.unlockCount, sortBy: state.sortBy, onlyLocked: state.onlyLocked,
        unlocked: Array.from(state.unlocked)
      }
    };
  }

  function parseSave(text) {
    var t = String(text).trim();
    if (!t) throw new Error("文件是空的");
    if (t.charAt(0) === "{") return JSON.parse(t);

    var m = t.match(/GP_ADMIN_STOCK\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (m) return { stock: JSON.parse(m[1]) };

    throw new Error("无法识别：既不是存档 JSON，也不是 stock.js");
  }

  function applySnapshot(d) {
    if (d.stock) {
      state.stock.flower = d.stock.flower || {};
      state.stock.growing = d.stock.growing || {};
      state.stock.seed = d.stock.seed || {};
    } else if (d.flower || d.growing || d.seed) {
      state.stock.flower = d.flower || {};
      state.stock.growing = d.growing || {};
      state.stock.seed = d.seed || {};
    }
    if (d.recipes) state.recipes = d.recipes;
    if (d.meta) {
      var m = d.meta;
      ["plots", "fallback", "refund", "seedYield", "harvestYield", "coins", "failReward", "targetCount", "maxBuy", "roundLimit"].forEach(function (k) {
        if (m[k] !== undefined) state[k] = m[k];
      });
      if (m.useEarned !== undefined) state.useEarned = m.useEarned;
      if (m.targetMode) state.targetMode = m.targetMode;
      if (m.targetFlower) state.targetFlower = m.targetFlower;
      if (m.sortBy) state.sortBy = m.sortBy;
      if (m.onlyLocked !== undefined) state.onlyLocked = m.onlyLocked;
      if (m.unlocked) state.unlocked = new Set(m.unlocked);
    }
    saveStock(); saveMeta();
    savedRecipes = JSON.stringify(state.recipes);
    $("#plots").value = state.plots;
    $("#fallback").value = state.fallback;
    $("#refund").value = String(state.refund);
    $("#seedYield").value = state.seedYield;
    $("#harvestYield").value = state.harvestYield;
    $("#coins").value = state.coins;
    $("#failReward").value = state.failReward;
    $("#maxBuy").value = state.maxBuy;
    $("#useEarned").checked = state.useEarned;
    renderAll(); calc();
  }

  function renderStock() {
    var t = $("#stockTable");
    var h = "<thead><tr><th>花</th><th>花材</th><th>生长中</th><th>种子</th><th>价格</th><th>图鉴</th></tr></thead><tbody>";
    state.flowers.forEach(function (f) {
      var fl = state.stock.flower[f] || 0;
      var gr = state.stock.growing[f] || 0;
      var sd = state.stock.seed[f] || 0;
      var un = state.unlocked.has(f);
      h += "<tr><td>" + esc(f) + "</td>" +
        '<td><input type="number" min="0" step="1" data-k="flower" data-f="' + esc(f) + '" value="' + fl + '"></td>' +
        '<td><input type="number" min="0" step="1" data-k="growing" data-f="' + esc(f) + '" value="' + gr + '"></td>' +
        '<td><input type="number" min="0" step="1" data-k="seed" data-f="' + esc(f) + '" value="' + sd + '"></td>' +
        '<td class="mono small">' + ((D.SEED_PRICE && D.SEED_PRICE[f]) || "—") + "</td>" +
        '<td><button class="mini" data-unlock="' + esc(f) + '">' + (un ? "✓" : "点亮") + "</button></td></tr>";
    });
    t.innerHTML = h + "</tbody>";

    t.querySelectorAll("input").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var k = inp.dataset.k, f = inp.dataset.f;
        state.stock[k] = state.stock[k] || {};
        state.stock[k][f] = Math.max(0, Math.round(num(inp.value) || 0));
        saveStock();
        if (state.stock[k][f] > 0 && !state.unlocked.has(f)) {
          state.unlocked.add(f);
          saveMeta();
          renderUnlock();
        }
      });
      inp.addEventListener("change", calc);
    });
    t.querySelectorAll("button[data-unlock]").forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.dataset.unlock;
        if (state.unlocked.has(f)) state.unlocked.delete(f);
        else state.unlocked.add(f);
        saveMeta(); renderAll(); calc();
      });
    });
  }

  function renderUnlock() {
    var box = $("#unlockBox");
    box.innerHTML = state.flowers.map(function (f) {
      var on = state.unlocked.has(f);
      return '<button class="mini" data-u="' + esc(f) + '" style="' +
        (on ? "border-color:#2e5a44;color:var(--accent)" : "") + '">' +
        (on ? "✓ " : "") + esc(f) + "</button>";
    }).join("");
    box.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.dataset.u;
        if (state.unlocked.has(f)) state.unlocked.delete(f);
        else state.unlocked.add(f);
        saveMeta(); renderAll(); calc();
      });
    });
    $("#unlockPill").textContent = state.unlocked.size + "/" + state.flowers.length + " 已解锁";
  }

  // ---------- 配方 ----------
  function flowerOptions(cur) {
    var h = '<option value="">（未知）</option>';
    state.flowers.forEach(function (f) {
      h += '<option value="' + esc(f) + '"' + (f === cur ? " selected" : "") + ">" + esc(f) + "</option>";
    });
    h += '<option value="?"' + (cur === "?" ? " selected" : "") + ">? 未知亲本</option>";
    return h;
  }

  function renderRecipes() {
    var t = $("#recipeTable");
    var h = "<thead><tr>" +
      '<th style="width:12%">亲本 A</th><th style="width:12%">亲本 B</th>' +
      '<th style="width:13%">产物 1</th><th style="width:7%">概率</th>' +
      '<th style="width:13%">产物 2</th><th style="width:7%">概率</th>' +
      '<th style="width:8%">成功率</th><th style="width:7%">成功币</th><th style="width:7%">失败币</th>' +
      '<th style="width:5%"></th></tr></thead><tbody>';

    state.recipes.forEach(function (r, i) {
      var sVal = (r.s === null || r.s === undefined || !isFinite(r.s)) ? "" : r.s;
      var csVal = (r.cs === null || r.cs === undefined) ? "" : r.cs;
      var cfVal = (r.cf === null || r.cf === undefined) ? "" : r.cf;
      h += "<tr>" +
        '<td><select data-i="' + i + '" data-p="a">' + flowerOptions(r.a) + "</select></td>" +
        '<td><select data-i="' + i + '" data-p="b">' + flowerOptions(r.b) + "</select></td>" +
        '<td><select data-i="' + i + '" data-p="o1">' + flowerOptions(r.o1) + "</select></td>" +
        '<td><input type="number" min="0" max="1" step="0.05" data-i="' + i + '" data-p="p1" value="' + (r.p1 || 0) + '"></td>' +
        '<td><select data-i="' + i + '" data-p="o2">' + flowerOptions(r.o2) + "</select></td>" +
        '<td><input type="number" min="0" max="1" step="0.05" data-i="' + i + '" data-p="p2" value="' + (r.p2 || 0) + '"></td>' +
        '<td><input type="number" min="0.01" max="1" step="0.01" class="' + (sVal === "" ? "blank" : "") +
          '" data-i="' + i + '" data-p="s" value="' + sVal + '" placeholder="默认"></td>' +
        '<td><input type="number" min="0" step="1" data-i="' + i + '" data-p="cs" value="' + csVal + '" placeholder="2"></td>' +
        '<td><input type="number" min="0" step="1" data-i="' + i + '" data-p="cf" value="' + cfVal + '" placeholder="2"></td>' +
        '<td><button class="mini" data-del="' + i + '">删</button></td></tr>';
    });
    t.innerHTML = h + "</tbody>";

    t.querySelectorAll("select").forEach(function (el) {
      el.addEventListener("change", function () {
        pushUndo();
        state.recipes[+el.dataset.i][el.dataset.p] = el.value;
        renderDirty(); calc();
      });
    });
    t.querySelectorAll("input").forEach(function (el) {
      el.addEventListener("change", function () {
        pushUndo();
        var i = +el.dataset.i, p = el.dataset.p;
        var v = num(el.value);
        state.recipes[i][p] = isNaN(v) ? null : v;
        if (p === "s") el.classList.toggle("blank", isNaN(v));
        renderDirty(); calc();
      });
    });
    t.querySelectorAll("button[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        pushUndo();
        state.recipes.splice(+b.dataset.del, 1);
        renderRecipes(); calc();
      });
    });
    renderDirty();
    renderRecipeToggle();
    renderSearch();
  }

  // ---------- 目标 ----------
  function renderTargets() {
    var list = state.flowers.filter(function (f) {
      return !state.onlyLocked || !state.unlocked.has(f);
    });
    if (!list.length) list = state.flowers.slice();
    if (list.indexOf(state.targetFlower) < 0) state.targetFlower = list[0];

    var sel = $("#targetFlower");
    sel.innerHTML = list.map(function (f) {
      return '<option value="' + esc(f) + '"' + (f === state.targetFlower ? " selected" : "") + ">" + esc(f) + "</option>";
    }).join("");

    document.querySelectorAll('input[name="targetMode"]').forEach(function (r) {
      r.checked = (r.value === state.targetMode);
    });
    $("#flowerTargetRow").hidden = state.targetMode !== "flower";
    $("#unlockCountRow").hidden = state.targetMode !== "unlock";
    $("#unlockCount").value = state.unlockCount;
    $("#targetCount").value = state.targetCount;
    $("#sortBy").value = state.sortBy;
    $("#onlyLocked").checked = state.onlyLocked;

    var locked = state.flowers.filter(function (f) { return !state.unlocked.has(f); });
    $("#targetHint").textContent = state.targetMode === "unlock"
      ? ("只算上面没点亮的 " + locked.length + " 种：" + (locked.join("、") || "无") + "。")
      : "从现有库存出发，把每条能产出目标花的合成链都算一遍，按你选的指标排序。";
  }

  // ---------- 计算 ----------
  function cfg() {
    return {
      flowers: state.flowers,
      unlocked: Array.from(state.unlocked),
      recipes: state.recipes,
      stock: state.stock,
      plots: state.plots,
      fallback: state.fallback,
      refund: state.refund,
      seedYield: state.seedYield,
      harvestYield: state.harvestYield,
      coinBudget: state.coins,
      useEarnedCoins: state.useEarned,
      seedPrice: D.SEED_PRICE || {},
      failReward: state.failReward,
      maxBuy: state.maxBuy
    };
  }

  function baseCostOf(res) {
    return (res.plant["初遇"] || 0) + (res.plant["谜题"] || 0);
  }
  function attemptsOf(res) {
    return res.steps.reduce(function (s, x) { return s + x.attempts; }, 0);
  }

  function rankChains(F, N) {
    var demand = {}, list = [];
    demand[F] = N;

    state.recipes.forEach(function (r) {
      if (r.o1 !== F && r.o2 !== F) return;
      if (!r.a || !r.b || r.a === "?" || r.b === "?" || !r.o1) return;
      var force = {};
      force[F] = r;
      var res = M.analyze(cfg(), 1, { demand: demand, targets: [F], force: force });
      list.push({
        label: r.a + " × " + r.b,
        res: res,
        baseCost: baseCostOf(res),
        attempts: attemptsOf(res),
        rounds: res.rounds,
        steps: res.steps.length
      });
    });

    if (!list.length) {
      var res0 = M.analyze(cfg(), 1, { demand: demand, targets: [F] });
      list.push({
        label: "直接种 / 用库存",
        res: res0,
        baseCost: baseCostOf(res0),
        attempts: attemptsOf(res0),
        rounds: res0.rounds,
        steps: res0.steps.length
      });
    }

    var key = state.sortBy;
    list.sort(function (a, b) {
      if (key === "speed") return (a.rounds - b.rounds) || (a.attempts - b.attempts);
      if (key === "safe") return (a.attempts - b.attempts) || (a.baseCost - b.baseCost);
      return (a.baseCost - b.baseCost) || (a.attempts - b.attempts);
    });
    return list;
  }

  function allocRound(list, P) {
    if (!list.length) return [];
    var total = list.reduce(function (s, x) { return s + x.n; }, 0);
    if (total <= P) return list.map(function (x) { return { f: x.f, n: Math.ceil(x.n) }; });

    var out = {}, usedN = 0;
    list.filter(function (x) { return x.f !== "初遇" && x.f !== "谜题"; })
      .forEach(function (x) { if (usedN < P) { out[x.f] = 1; usedN++; } });

    var rest = P - usedN;
    var baseList = list.filter(function (x) { return x.f === "初遇" || x.f === "谜题"; });
    var bt = baseList.reduce(function (s, x) { return s + x.n; }, 0);
    if (rest > 0 && bt > 0) {
      var raw = baseList.map(function (x) { return { f: x.f, v: x.n / bt * rest }; });
      var acc = 0;
      raw.forEach(function (o) { var n = Math.floor(o.v); out[o.f] = n; acc += n; });
      var left = rest - acc;
      raw.slice().sort(function (a, b) {
        return (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v));
      }).forEach(function (o) {
        if (left > 0) { out[o.f] = (out[o.f] || 0) + 1; left--; }
      });
    }
    return list.filter(function (x) { return out[x.f] > 0; })
      .map(function (x) { return { f: x.f, n: out[x.f] }; });
  }

  function plantingSection(res, plots, sch) {
    var plantList = state.flowers
      .filter(function (f) { return ((res.plant[f] || 0) + (res.gen[f] || 0)) > 0.01; })
      .map(function (f) {
        var now = res.plant[f] || 0, gen = res.gen[f] || 0;
        return {
          f: f, now: now, gen: gen, n: now + gen,
          d: isFinite(res.depth[f]) ? res.depth[f] : 0
        };
      })
      .sort(function (a, b) { return (b.d - a.d) || (b.n - a.n); });

    var alloc = allocRound(
      plantList.map(function (x) { return { f: x.f, n: x.now }; })
        .filter(function (x) { return x.n > 0.01; }),
      plots
    );

    var totalNeed = plantList.reduce(function (s, x) { return s + Math.ceil(x.n); }, 0);

    var h = "<h3>④ 本轮种什么（≤ " + plots + " 格）</h3>";
    if (!plantList.length) {
      h += '<p class="empty">不需要种种子，现有花材够合。</p>';
      return h;
    }

    h += '<p class="small">总共要种 <b>' + totalNeed + "</b> 颗，" + plots +
      " 块地约 <b>" + sch.rounds.length + "</b> 轮。本轮先种这些：</p>";

    var allocCnt = alloc.reduce(function (s, o) { return s + o.n; }, 0);
    h += '<p>' + (alloc.length
      ? alloc.map(function (o) {
          return '<span class="pill">' + esc(o.f) + " ×" + o.n + "</span>";
        }).join(" ")
      : '<span class="muted">本轮没有可种的</span>') +
      ' <span class="muted">（用地 ' + allocCnt + " / " + plots + "）</span></p>";

    var free = Math.max(0, plots - allocCnt);
    if (free > 0) {
      h += '<p class="small muted">还剩 ' + free + ' 格：本轮已经没有“必须种”的种子了，' +
        "可以先空着，或者加种初遇 / 谜题囤货。</p>";
    }

    h += '<p class="small muted">需求是期望值：每一步都要 ÷ 成功率 ÷ 产物概率，链越深乘得越多。' +
      "如果数字明显超出活动承受范围，先检查成功率是不是把“产物概率”当成了“成功率”。</p>";

    h += '<details><summary>完整需求（按链深排序）</summary>' +
      '<table style="margin-top:8px"><thead><tr><th>#</th><th>花种</th><th>现在种</th><th>合成产出种子</th><th>合计</th><th>层级</th></tr></thead><tbody>';
    plantList.forEach(function (x, i) {
      h += "<tr><td>" + (i + 1) + "</td><td>" + esc(x.f) +
        (x.d >= 2 ? '<span class="tag deep">关键</span>' : "") + "</td>" +
        '<td class="mono">' + Math.ceil(x.now) + "</td>" +
        '<td class="mono">' + Math.ceil(x.gen) + "</td>" +
        '<td class="mono">' + Math.ceil(x.n) + "</td>" +
        '<td class="mono">' + x.d + "</td></tr>";
    });
    h += "</tbody></table></details>";

    var c = Math.ceil(res.plant["初遇"] || 0);
    var m = Math.ceil(res.plant["谜题"] || 0);
    if (c || m) {
      h += '<p class="small muted">基础种配比 初遇 ' + c + " : 谜题 " + m + " ≈ " +
        (m ? (c / m).toFixed(2) : "∞") + " : 1。</p>";
    }

    return h;
  }

  function synthSection(res) {
    var h = "<h3>③ 合成顺序（按缺口，从材料往上）</h3>";
    if (!res.steps.length) {
      h += '<p class="empty">不需要额外合成。</p>';
    } else {
      h += "<table><thead><tr><th>#</th><th>做这个</th><th>配方</th><th>成功次数</th><th>材料折算</th><th>备注</th></tr></thead><tbody>";
      res.steps.forEach(function (s, i) {
        var r = s.r;
        var note = (r.p1 < 0.99 || (r.o2 && r.p2 < 0.99))
          ? "随机产物，按概率摊"
          : ("成功率 " + Math.round(s.s * 100) + "%");
        h += "<tr><td>" + (i + 1) + "</td><td>" + esc(s.f) + "</td>" +
          '<td class="small mono">' + esc(r.a) + " × " + esc(r.b) + " → " + esc(r.o1) +
          (r.o2 ? " / " + esc(r.o2) : "") + "</td>" +
          '<td class="mono">' + M.fmt(s.need) + "</td>" +
          '<td class="mono">' + Math.ceil(s.attempts) + "</td>" +
          '<td class="small muted">' + note + "</td></tr>";
      });
      h += "</tbody></table>";
    }
    return h;
  }

  function scheduleSection(sch, targets) {
    var h = "<h3>② 轮次安排（按期望成功次数）</h3>";
    if (!sch.rounds.length) {
      h += '<p class="empty">不需要种种子。</p>';
      return h;
    }

    h += '<p class="small">按期望约 <b>' + sch.rounds.length + "</b> 轮（理论下界 " + sch.lower +
      " 轮），共使用 <b>" + sch.totalPlots + "</b> 块地·次。" +
      (sch.stall ? ' <span class="pill bad">中途卡住：材料不够，检查配方</span>' : "") + "</p>";

    function row(r, i) {
      var sk = Object.keys(r.synth || {});
      var synthPills = sk.map(function (f) {
        return '<span class="pill">' + esc(f) + " ×" + r.synth[f] + "</span>";
      }).join(" ") || '<span class="muted">—</span>';
      var keys = Object.keys(r.planted);
      var pills = keys.map(function (f) {
        return '<span class="pill">' + esc(f) + " ×" + r.planted[f] + "</span>";
      }).join(" ") || '<span class="muted">（空）</span>';
      var cnt = keys.reduce(function (s, f) { return s + r.planted[f]; }, 0);
      var got = sk.filter(function (f) { return targets.indexOf(f) >= 0; });
      return "<tr><td>第 " + (i + 1) + " 轮</td><td>" + synthPills + "</td><td>" + pills + "</td>" +
        '<td class="mono">' + cnt + "</td>" +
        '<td class="mono">' + r.seeds + "</td>" +
        "<td>" + (got.length ? '<span class="pill ok">★ ' + got.join("、") + "</span>" : "") + "</td></tr>";
    }

    h += '<table style="margin-top:8px"><thead><tr><th>轮次</th><th>先合成（期望）</th><th>再种</th><th>用地</th><th>产出种子</th><th>本轮达成</th></tr></thead><tbody>';
    sch.rounds.slice(0, 2).forEach(function (r, i) { h += row(r, i); });
    h += "</tbody></table>";

    if (sch.rounds.length > 2) {
      h += '<details><summary>第 3 轮及以后（还有 ' + (sch.rounds.length - 2) + ' 轮）</summary>' +
        '<table style="margin-top:8px"><thead><tr><th>轮次</th><th>先合成（期望）</th><th>再种</th><th>用地</th><th>产出种子</th><th>本轮达成</th></tr></thead><tbody>';
      sch.rounds.slice(2).forEach(function (r, i) { h += row(r, i + 2); });
      h += "</tbody></table></details>";
    }

    h += '<p class="small muted">「先合成」是按期望成功次数排的，不是保证成功。实际有概率，可能提前或延后；每轮结束按真实库存重算一次。</p>';
    return h;
  }

  function renderSearch() {
    var box = $("#recipeSearchResult");
    var q = ($("#recipeSearch").value || "").trim();
    if (!q) { box.innerHTML = ""; return; }

    var hits = state.recipes.filter(function (r) {
      return [r.a, r.b, r.o1, r.o2].some(function (x) { return x && x.indexOf(q) >= 0; });
    });
    if (!hits.length) {
      box.innerHTML = '<p class="small muted">没有匹配的配方。</p>';
      return;
    }

    var h = '<table style="margin:6px 0 10px"><thead><tr><th>配方</th><th>产物</th><th>成功率</th><th>成功币</th><th>失败币</th></tr></thead><tbody>';
    hits.forEach(function (r) {
      var outs = (r.o1 || "?") + (r.o2 ? " / " + r.o2 : "");
      h += '<tr><td class="mono small">' + esc(r.a) + " × " + esc(r.b) + "</td>" +
        '<td class="small">' + esc(outs) + "</td>" +
        '<td class="mono">' + (r.s == null ? "?" : Math.round(r.s * 100) + "%") + "</td>" +
        '<td class="mono">' + (r.cs !== null && r.cs !== undefined ? r.cs : 2) + '</td><td class="mono">' + (r.cf !== null && r.cf !== undefined ? r.cf : 2) + "</td></tr>";
    });
    box.innerHTML = h + "</tbody></table>";
  }

  function synthWaves(res) {
    var avail = {};
    state.flowers.forEach(function (f) {
      avail[f] = (state.stock.flower[f] || 0) + (state.stock.growing[f] || 0);
    });

    var pending = (res.steps || []).map(function (s) {
      return {
        f: s.f, r: s.r, left: Math.max(0, Math.ceil(s.need)),
        depth: isFinite(s.depth) ? s.depth : 0
      };
    });

    var waves = [];
    for (var w = 0; w < 12; w++) {
      var wave = [];
      pending.forEach(function (st) {
        if (st.left <= 0) return;
        var n = Math.min(avail[st.r.a] || 0, avail[st.r.b] || 0, st.left);
        if (n <= 0) return;
        wave.push({ f: st.f, r: st.r, n: n, depth: st.depth });
        avail[st.r.a] -= n;
        avail[st.r.b] -= n;
        avail[st.f] = (avail[st.f] || 0) + n;
        st.left -= n;
      });
      if (!wave.length) break;
      wave.sort(function (a, b) { return b.depth - a.depth; });
      waves.push(wave);
    }

    var stuck = pending.filter(function (st) { return st.left > 0; });
    return { waves: waves, stuck: stuck };
  }

  function canDoList(counts) {
    var list = [];
    state.recipes.forEach(function (r) {
      if (!r.a || !r.b || r.a === "?" || r.b === "?") return;
      if (state.flowers.indexOf(r.a) < 0 || state.flowers.indexOf(r.b) < 0) return;
      var n = Math.min(counts[r.a] || 0, counts[r.b] || 0);
      if (n < 1) return;
      list.push({ r: r, n: n });
    });
    list.sort(function (a, b) { return b.n - a.n; });
    return list;
  }

  function rankTargets() {
    var missing = state.flowers.filter(function (f) { return !state.unlocked.has(f); });
    return missing.map(function (f) {
      var d = {};
      d[f] = 1;
      var r = M.analyze(cfg(), 1, { demand: d, targets: [f] });
      var s = M.schedule(cfg(), r);
      return { f: f, rounds: s.rounds.length, seeds: Math.ceil(r.totalSeed) };
    }).sort(function (a, b) {
      return (a.rounds - b.rounds) || (a.seeds - b.seeds);
    });
  }

  function targetRecommendSection() {
    var rows = rankTargets();
    if (!rows.length) return "";
    var count = state.unlockCount > 0 ? Math.min(state.unlockCount, rows.length) : rows.length;

    var h = "<h3>按目标分开看（越靠前越容易）</h3>";
    h += "<table><thead><tr><th>#</th><th>目标</th><th>轮数</th><th>种子</th><th></th></tr></thead><tbody>";
    rows.forEach(function (x, i) {
      h += "<tr><td>" + (i + 1) + "</td><td>" + esc(x.f) + "</td>" +
        '<td class="mono">' + x.rounds + "</td>" +
        '<td class="mono">' + x.seeds + "</td>" +
        "<td>" + (i < count ? '<span class="pill ok">本次选它</span>' : "") + "</td></tr>";
    });
    h += "</tbody></table>";
    return h;
  }

  function stageSection(res, sch) {
    var H = Math.max(1, state.harvestYield);

    var now = {};
    state.flowers.forEach(function (f) { now[f] = state.stock.flower[f] || 0; });

    var r0 = sch.rounds[0] ? sch.rounds[0].planted : {};
    var after = {};
    state.flowers.forEach(function (f) {
      after[f] = (now[f] || 0) + (state.stock.growing[f] || 0) + (r0[f] || 0) * H;
    });

    function allocate(counts) {
      var avail = {};
      state.flowers.forEach(function (f) { avail[f] = counts[f] || 0; });

      var acts = [];
      var steps = (res.steps || []).map(function (s) {
        return { f: s.f, r: s.r, left: Math.max(0, Math.ceil(s.need)), depth: s.depth || 0 };
      }).sort(function (a, b) { return b.depth - a.depth; });

      steps.forEach(function (st) {
        var n = Math.min(avail[st.r.a] || 0, avail[st.r.b] || 0, st.left);
        if (n <= 0) return;
        acts.push({ f: st.f, r: st.r, n: n });
        avail[st.r.a] -= n;
        avail[st.r.b] -= n;
      });

      return { acts: acts, avail: avail };
    }

    function actsHtml(acts) {
      if (!acts.length) return '<p class="small muted">没有能合的。</p>';
      return '<p class="small">' + acts.slice(0, 12).map(function (x) {
        return '<span class="pill">' + esc(x.r.a) + "×" + esc(x.r.b) + " → " + esc(x.f) + " ×" + x.n + "</span>";
      }).join(" ") + "</p>";
    }
    function restHtml(avail) {
      var parts = [];
      state.flowers.forEach(function (f) {
        if ((avail[f] || 0) > 0) parts.push(esc(f) + "×" + avail[f]);
      });
      return parts.length ? '<p class="small muted">没用上：' + parts.join("、") + "</p>" : "";
    }
    function plantHtml(p) {
      var keys = Object.keys(p);
      if (!keys.length) return '<p class="small muted">没有。</p>';
      return '<p class="small">' + keys.map(function (f) {
        return '<span class="pill">' + esc(f) + " ×" + p[f] + "</span>";
      }).join(" ") + "</p>";
    }

    var a1 = allocate(now);
    var a2 = allocate(after);

    // 下一轮真正能种的种子：库存 + 这轮合成产出 + 还能买到的
    var seedAvail = {};
    state.flowers.forEach(function (f) { seedAvail[f] = state.stock.seed[f] || 0; });

    var p0 = sch.rounds[0] ? sch.rounds[0].planted : {};
    Object.keys(p0).forEach(function (f) {
      seedAvail[f] = Math.max(0, (seedAvail[f] || 0) - p0[f]);
    });
    var s0 = sch.rounds[0] ? sch.rounds[0].synth : {};
    Object.keys(s0).forEach(function (f) {
      seedAvail[f] = (seedAvail[f] || 0) + s0[f] * state.seedYield;
    });

    var coinsLeft = state.coins - (res.coinsSpent || 0);
    state.flowers.forEach(function (f) {
      var price = D.SEED_PRICE && D.SEED_PRICE[f];
      if (price && coinsLeft >= price) {
        var n = Math.floor(coinsLeft / price);
        seedAvail[f] = (seedAvail[f] || 0) + n;
        coinsLeft -= n * price;
      }
    });
    seedAvail["初遇"] = Infinity;
    seedAvail["谜题"] = Infinity;

    var want = sch.rounds[1] ? sch.rounds[1].planted : {};
    var canPlant = {}, notYet = {};
    Object.keys(want).forEach(function (f) {
      var haveN = Math.floor(seedAvail[f] || 0);
      var take = Math.min(want[f], haveN);
      if (take > 0) canPlant[f] = take;
      if (want[f] > take) notYet[f] = want[f] - take;
    });

    var h = "<h3>分三步看（按数量分配）</h3>";
    h += "<h4>① 现在手上的花材怎么分配合成</h4>" + actsHtml(a1.acts) + restHtml(a1.avail);
    h += "<h4>② 加上生长中和这轮种下（每颗收 " + H + " 朵）后</h4>" + actsHtml(a2.acts);
    h += "<h4>③ 下一轮建议种（只列现有种子或买得到的）</h4>" + plantHtml(canPlant);
    if (Object.keys(notYet).length) {
      h += '<p class="small muted">还种不了，等合成产出：' +
        Object.keys(notYet).map(function (f) { return esc(f) + "×" + notYet[f]; }).join("、") + "</p>";
    }
    return h;
  }

  function waveSection(res) {
    var w = synthWaves(res);
    if (!w.waves.length && !w.stuck.length) return "";

    var h = "<h3>按现在的材料，合成这样排</h3>";
    h += '<p class="small muted">每波用上一波合出来的产物；同一波里，离最终目标近的排前面。材料不够的放最后。</p>';

    w.waves.forEach(function (wave, i) {
      h += '<div class="wave"><b>第 ' + (i + 1) + " 波" + (i === 0 ? "（现在就能合）" : "") + "：</b> " +
        wave.map(function (x) {
          return '<span class="pill">' + esc(x.r.a) + "×" + esc(x.r.b) + " → " + esc(x.f) + " ×" + x.n + "</span>";
        }).join(" ") + "</div>";
    });

    if (w.stuck.length) {
      h += '<div class="wave"><b>材料不够，先种/先买：</b> ' +
        w.stuck.map(function (x) {
          return '<span class="pill bad">' + esc(x.f) + " 还差 " + x.left + " 次（需要 " +
            esc(x.r.a) + "×" + x.left + " + " + esc(x.r.b) + "×" + x.left + "）</span>";
        }).join(" ") + "</div>";
    }
    return h;
  }

  function treeNode(f, res, depth, seen) {
    var seeds = (res.plant[f] || 0) + (res.gen[f] || 0);
    var bought = (res.bought && res.bought[f]) || 0;
    var cls = "tnode";
    if (seeds > 0.01) cls += " plant";
    if (bought > 0) cls += " buy";
    var tag = bought > 0 ? " 买×" + Math.ceil(bought) : (seeds > 0.01 ? " 种" : "");
    var html = "<div class='" + cls + "'>" + esc(f) + tag + "</div>";

    if (bought > 0) return html;
    if (depth >= 3 || seen[f]) return html;
    var r = res.choice[f];
    if (!r) return html;

    var nseen = {};
    Object.keys(seen).forEach(function (k) { nseen[k] = true; });
    nseen[f] = true;

    return html + "<div class='tchildren'>" +
      treeNode(r.a, res, depth + 1, nseen) +
      treeNode(r.b, res, depth + 1, nseen) + "</div>";
  }

  function treeSection(res) {
    if (!res.targets || !res.targets.length) return "";
    var h = "<h3>合成树</h3>" +
      '<p class="small muted">绿框 = 要种，橙框 = 用花花币买。只展开 3 层。</p><div class="tree">';
    res.targets.forEach(function (t) { h += treeNode(t, res, 0, {}); });
    h += "</div>";
    return h;
  }

  function canDoSection(res) {
    var availOf = function (f) {
      return (state.stock.flower[f] || 0) + (state.stock.growing[f] || 0);
    };
    var canDo = [];
    state.recipes.forEach(function (r) {
      if (!r.a || !r.b || r.a === "?" || r.b === "?") return;
      if (state.flowers.indexOf(r.a) < 0 || state.flowers.indexOf(r.b) < 0) return;
      var n = Math.min(availOf(r.a), availOf(r.b));
      if (n < 1) return;
      var outs = [];
      if (r.o1 && r.p1 > 0) outs.push([r.o1, r.p1]);
      if (r.o2 && r.p2 > 0) outs.push([r.o2, r.p2]);
      var useful = outs.length === 0 ? true : outs.some(function (o) {
        return !state.unlocked.has(o[0]);
      });
      canDo.push({ r: r, n: n, outs: outs, useful: useful });
    });
    canDo.sort(function (x, y) {
      function rank(c) { return c.outs.length === 0 ? 1 : (c.useful ? 0 : 2); }
      if (rank(x) !== rank(y)) return rank(x) - rank(y);
      var cx = x.outs[0] ? (res.cost[x.outs[0][0]] || 1e9) : 1e9;
      var cy = y.outs[0] ? (res.cost[y.outs[0][0]] || 1e9) : 1e9;
      return cx - cy;
    });

    var h = "<h3>④ 现在就能合的（按你手上的花材）</h3>";
    if (!canDo.length) {
      h += '<p class="empty">手上没有能直接配成一对的花材，先等种子成熟。</p>';
      return h;
    }
    h += "<table><thead><tr><th>配方</th><th>成功率</th><th>能做</th><th>期望产物</th><th>建议</th></tr></thead><tbody>";
    canDo.slice(0, 14).forEach(function (c) {
      var r = c.r;
      var s = M.effS(r, state.fallback, 1);
      var expTxt = c.outs.length
        ? c.outs.map(function (o) { return esc(o[0]) + "×" + M.fmt(c.n * s * o[1]); }).join("，")
        : '<span class="muted">结果未知</span>';
      var tip = c.outs.length === 0
        ? '<span class="pill warn">值得试</span>'
        : (c.useful ? '<span class="pill ok">推荐</span>' : '<span class="pill">已够</span>');
      h += '<tr><td class="small mono">' + esc(r.a) + " × " + esc(r.b) + "</td>" +
        '<td class="mono">' + Math.round(s * 100) + "%" + (r.s == null ? "*" : "") + "</td>" +
        '<td class="mono">' + c.n + "</td>" +
        '<td class="small">' + expTxt + "</td><td>" + tip + "</td></tr>";
    });
    h += '</tbody></table><p class="small muted">* = 成功率是默认值补的，不是实测。</p>';
    return h;
  }

  function costSection(res) {
    var h = '<details style="margin-top:14px"><summary>每种花的最优路线 / 期望成本</summary>' +
      '<table style="margin-top:8px"><thead><tr><th>花</th><th>路线</th><th>成本</th><th>成功率</th><th>状态</th></tr></thead><tbody>';
    state.flowers.forEach(function (f) {
      if (f === "初遇" || f === "谜题") return;
      var r = res.choice[f];
      var s = r ? M.effS(r, state.fallback, 1) : null;
      h += "<tr><td>" + esc(f) + "</td>" +
        '<td class="small">' + (r ? esc(r.a) + " × " + esc(r.b) : "—") + "</td>" +
        '<td class="mono">' + (isFinite(res.cost[f]) ? M.fmt(res.cost[f]) : "∞") + "</td>" +
        '<td class="mono">' + (s ? Math.round(s * 100) + "%" : "—") + "</td>" +
        "<td>" + (state.unlocked.has(f) ? '<span class="pill ok">已解锁</span>' : '<span class="pill warn">缺</span>') + "</td></tr>";
    });
    h += '</tbody></table><p class="small muted">成本 = 折合基础种子，已含固定成功率、种子产出与失败返还。</p></details>';
    return h;
  }

  function unknownSection(res) {
    var availOf = function (f) {
      return (state.stock.flower[f] || 0) + (state.stock.growing[f] || 0);
    };
    var unknown = state.recipes.filter(function (r) {
      return !r.o1 || r.a === "?" || r.b === "?";
    });
    if (!unknown.length) return "";

    var rows = unknown.map(function (r) {
      var cost = (isFinite(res.cost[r.a]) && isFinite(res.cost[r.b]))
        ? res.cost[r.a] + res.cost[r.b] : Infinity;
      var can = r.a !== "?" && r.b !== "?" && availOf(r.a) >= 1 && availOf(r.b) >= 1;
      return { r: r, cost: cost, can: can };
    }).sort(function (a, b) { return a.cost - b.cost; });

    var h = '<details style="margin-top:10px"><summary>待测配方（' + unknown.length +
      ' 条，按试错成本排序）</summary>' +
      '<table style="margin-top:8px"><thead><tr><th>配方</th><th>成功率</th><th>试一次约耗</th><th>现在能试</th></tr></thead><tbody>';
    rows.forEach(function (x) {
      var r = x.r;
      h += '<tr><td class="mono small">' + esc(r.a || "?") + " × " + esc(r.b || "?") +
        " → " + (r.o1 ? esc(r.o1) : "?") + "</td>" +
        '<td class="mono">' + (r.s == null ? "?" : Math.round(r.s * 100) + "%") + "</td>" +
        '<td class="mono">' + (isFinite(x.cost) ? M.fmt(x.cost) : "∞") + "</td>" +
        "<td>" + (x.can ? '<span class="pill ok">可以</span>' : '<span class="pill">先攒材料</span>') + "</td></tr>";
    });
    h += "</tbody></table></details>";
    return h;
  }

  function rankingTable(list, F, N) {
    var h = "<h3>候选路线（目标：" + esc(F) + " ×" + N + "）</h3>";
    h += "<table><thead><tr><th>#</th><th>路线</th><th>成功步数</th><th>总尝试</th><th>基础种子</th><th>地块·轮</th><th></th></tr></thead><tbody>";
    list.forEach(function (x, i) {
      h += "<tr><td>" + (i + 1) + "</td><td class=\"mono small\">" + esc(x.label) + "</td>" +
        '<td class="mono">' + x.steps + "</td>" +
        '<td class="mono">' + Math.ceil(x.attempts) + "</td>" +
        '<td class="mono">' + Math.ceil(x.baseCost) + "</td>" +
        '<td class="mono">' + x.rounds + "</td>" +
        "<td>" + (i === 0 ? '<span class="pill ok">推荐</span>' : "") + "</td></tr>";
    });
    h += "</tbody></table>";
    return h;
  }

  function purchaseSection(res) {
    var spent = res.coinsSpent || 0;
    var earned = res.coinsEarned || 0;
    var bought = res.bought || {};
    var items = Object.keys(bought).filter(function (f) { return bought[f] > 0; });

    if (!items.length && spent <= 0 && earned <= 0) return "";

    var h = "<h3>花花币决策</h3>";
    h += '<div class="stat">' +
      "<div><b>" + Math.round(state.coins) + "</b><span>可用预算</span></div>" +
      "<div><b>" + Math.round(spent) + "</b><span>买种花费</span></div>" +
      "<div><b>" + Math.round(earned) + "</b><span>合成获得</span></div>" +
      "<div><b>" + (state.useEarned ? "可动用" : "不计入") + "</b><span>合成所得</span></div>" +
      "</div>";

    if (items.length) {
      h += '<p class="small">买了：' + items.map(function (f) {
        return '<span class="pill">' + esc(f) + " ×" + bought[f] + "</span>";
      }).join(" ") + "</p>";

      h += "<table><thead><tr><th>买什么</th><th>种子</th><th>花费</th><th>折合花朵</th><th>占地</th></tr></thead><tbody>";
      items.forEach(function (f) {
        var seeds = bought[f];
        var price = (D.SEED_PRICE && D.SEED_PRICE[f]) || 0;
        h += "<tr><td>" + esc(f) + "</td>" +
          '<td class="mono">' + seeds + "</td>" +
          '<td class="mono">' + (seeds * price) + "</td>" +
          '<td class="mono">' + (seeds * state.harvestYield) + "</td>" +
          '<td class="mono">' + seeds + "</td></tr>";
      });
      h += "</tbody></table>";
    } else {
      h += '<p class="small muted">预算不够买任何种子，全部靠种 / 合成。</p>';
    }
    return h;
  }

  function coinSection(res) {
    var fails = 0, income = 0;
    res.steps.forEach(function (s) {
      var cs = s.r.cs || 0;
      var cf = (s.r.cf !== null && s.r.cf !== undefined) ? s.r.cf : state.failReward;
      fails += Math.max(0, s.attempts * (1 - s.s));
      income += s.attempts * (s.s * cs + (1 - s.s) * cf);
    });
    var avail = state.coins + income;

    var rows = [];
    state.flowers.forEach(function (f) {
      var price = D.SEED_PRICE && D.SEED_PRICE[f];
      if (!price) return;
      var seeds = Math.ceil((res.plant[f] || 0) + (res.gen[f] || 0));
      if (seeds <= 0) return;
      var st = null;
      res.steps.forEach(function (s) { if (s.f === f) st = s; });
      var attempts = st ? st.attempts : 0;
      var cost = seeds * price;
      rows.push({
        f: f, price: price, seeds: seeds, cost: cost,
        attempts: attempts, perCoin: attempts / cost
      });
    });
    rows.sort(function (a, b) { return b.perCoin - a.perCoin; });

    var total = rows.reduce(function (s, x) { return s + x.cost; }, 0);

    var h = "<h3>花花币</h3>";
    h += '<div class="stat">' +
      "<div><b>" + state.coins + "</b><span>初始</span></div>" +
      "<div><b>" + Math.round(fails) + "</b><span>预计失败次数</span></div>" +
      "<div><b>" + Math.round(income) + "</b><span>失败收入</span></div>" +
      "<div><b>" + Math.round(avail) + "</b><span>可用合计</span></div>" +
      "</div>";

    if (!rows.length) {
      h += '<p class="small muted">当前计划里没有已知价格的种子可买。</p>';
      return h;
    }

    h += '<p class="small">买齐下表种子要 <b>' + Math.round(total) + "</b> 币，" +
      (avail >= total
        ? "够，可以全买。"
        : "还差 <b>" + Math.round(total - avail) + "</b> 币。") + "</p>";
    h += '<p class="small muted">这是“全买”的粗算：买了某一种，就不用再合成它，实际花费会更低。' +
      "「每币省尝试」= 合成它的期望尝试 ÷ 全买花费，越大越值得先买。</p>";

    h += "<table><thead><tr><th>#</th><th>买什么种子</th><th>单价</th><th>计划要种</th><th>全买花费</th><th>合成需尝试</th><th>每币省尝试</th></tr></thead><tbody>";
    rows.forEach(function (x, i) {
      h += "<tr><td>" + (i + 1) + "</td><td>" + esc(x.f) +
        (i < 2 ? '<span class="tag deep">优先</span>' : "") + "</td>" +
        '<td class="mono">' + x.price + "</td>" +
        '<td class="mono">' + x.seeds + "</td>" +
        '<td class="mono">' + Math.round(x.cost) + "</td>" +
        '<td class="mono">' + Math.ceil(x.attempts) + "</td>" +
        '<td class="mono">' + (isFinite(x.perCoin) ? x.perCoin.toFixed(2) : "0") + "</td></tr>";
    });
    h += "</tbody></table>";

    if (avail < total) {
      var acc = 0, buy = [];
      rows.forEach(function (x) {
        if (acc + x.cost <= avail) { acc += x.cost; buy.push(x.f); }
      });
      h += '<p class="small">按当前预算，建议先买：' +
        (buy.length
          ? buy.map(function (f) { return '<span class="pill">' + esc(f) + "</span>"; }).join(" ")
          : "（不够买任何一种）") + "</p>";
    }

    return h;
  }

  function exploreSection(res) {
    var availOf = function (f) {
      return (state.stock.flower[f] || 0) + (state.stock.growing[f] || 0);
    };
    var list = [];

    state.recipes.forEach(function (r) {
      var unknownOut = !r.o1;
      var unknownS = (r.s === null || r.s === undefined || !isFinite(r.s));
      if (!unknownOut && !unknownS) return;
      if (!r.a || !r.b || r.a === "?" || r.b === "?") return;
      if (state.flowers.indexOf(r.a) < 0 || state.flowers.indexOf(r.b) < 0) return;

      var ca = res.cost[r.a], cb = res.cost[r.b];
      var cost = (isFinite(ca) && isFinite(cb)) ? ca + cb : Infinity;
      var can = availOf(r.a) >= 1 && availOf(r.b) >= 1;
      var gain = unknownOut
        ? ((r.p1 > 0 ? 1 : 0) + (r.p2 > 0 ? 1 : 0))
        : 1;
      list.push({ r: r, cost: cost, can: can, gain: gain, unknownOut: unknownOut });
    });

    list.sort(function (a, b) {
      if (a.can !== b.can) return a.can ? -1 : 1;
      var ra = a.cost / Math.max(1, a.gain);
      var rb = b.cost / Math.max(1, b.gain);
      return ra - rb;
    });

    var h = "<h3>最省钱的试探顺序</h3>";
    if (!list.length) {
      h += '<p class="empty">没有待测配方，配方表已经补全。</p>';
      return h;
    }
    h += '<p class="small muted">按「能立刻试 → 试一次成本 ÷ 可能揭示数」排序。' +
      '解锁一个未知产物后，它可能同时打通好几条链，试完把结果填回配方表，成本会自动重算。</p>';
    h += "<table><thead><tr><th>#</th><th>配方</th><th>可能揭示</th><th>试一次成本</th><th>现在能试</th></tr></thead><tbody>";
    list.slice(0, 10).forEach(function (x, i) {
      var r = x.r;
      var reveal = x.unknownOut
        ? ("新产物" + (x.gain > 1 ? " ×2" : " ×1"))
        : "成功率";
      h += "<tr><td>" + (i + 1) + "</td>" +
        '<td class="mono small">' + esc(r.a) + " × " + esc(r.b) + " → " + (r.o1 ? esc(r.o1) : "?") + "</td>" +
        '<td class="small">' + reveal + "</td>" +
        '<td class="mono">' + (isFinite(x.cost) ? M.fmt(x.cost) : "∞") + "</td>" +
        "<td>" + (x.can ? '<span class="pill ok">可以</span>' : '<span class="pill">先攒材料</span>') + "</td></tr>";
    });
    h += "</tbody></table>";
    return h;
  }

  function calc() {
    var box = $("#result");
    var plots = Math.max(1, Math.round(state.plots));
    var mode = state.targetMode;
    var res, ranking = null, F = null, N = 1;
    var resNoBuy = null, schNoBuy = null, willBuy = false;

    if (mode === "flower") {
      F = state.targetFlower;
      N = Math.max(1, Math.round(state.targetCount) || 1);
      if (!F) { box.innerHTML = '<p class="empty">先选一个目标花材。</p>'; return; }
      ranking = rankChains(F, N);
      if (!ranking.length) {
        box.innerHTML = '<p class="empty">这个花材暂时没有可用配方，先补配方表。</p>';
        return;
      }
      res = ranking[0].res;
    } else {
      var ranked = rankTargets();
      var count = state.unlockCount > 0 ? Math.min(state.unlockCount, ranked.length) : ranked.length;
      var chosen = ranked.slice(0, count).map(function (x) { return x.f; });
      var demand = {};
      chosen.forEach(function (f) { demand[f] = 1; });

      if (!chosen.length) {
        box.innerHTML = '<p class="empty">图鉴已经全解锁了 🎉</p>';
        return;
      }

      var cfg0 = cfg();
      cfg0.coinBudget = 0;
      cfg0.useEarnedCoins = false;
      resNoBuy = M.analyze(cfg0, 1, { demand: demand, targets: chosen });
      schNoBuy = M.schedule(cfg0, resNoBuy);
      willBuy = state.coins > 0 && schNoBuy.rounds.length > state.roundLimit;
      res = willBuy ? M.analyze(cfg(), 1, { demand: demand, targets: chosen }) : resNoBuy;
    }

    var sch = (mode === "unlock" && !willBuy) ? schNoBuy : M.schedule(cfg(), res);

    var h = "";
    if (mode === "flower") {
      var have = (state.stock.flower[F] || 0) + (state.stock.growing[F] || 0);
      var seedN = (state.stock.seed[F] || 0) * state.harvestYield;
      h += '<div class="stat">' +
        "<div><b>" + esc(F) + "</b><span>目标花材</span></div>" +
        "<div><b>" + N + "</b><span>需要数量</span></div>" +
        "<div><b>" + have + "</b><span>现有花材</span></div>" +
        "<div><b>" + Math.ceil(res.totalSeed) + "</b><span>要种种子</span></div>" +
        "<div><b>" + sch.rounds.length + "</b><span>地块·轮</span></div>" +
        "</div>";
      h += '<p class="small muted">现有 ' + have + " 朵 + " + (state.stock.seed[F] || 0) +
        " 颗种子（约合 " + seedN + " 朵），缺口按当前库存算。</p>";
    } else {
      h += '<div class="stat">' +
        "<div><b>" + res.targets.length + "</b><span>还缺图鉴</span></div>" +
        "<div><b>" + Math.ceil(res.totalSeed) + "</b><span>要种种子</span></div>" +
        "<div><b>" + sch.rounds.length + "</b><span>地块·轮（" + plots + " 格）</span></div>" +
        "</div>";
      h += '<p class="small muted">缺口：' + res.targets.map(function (f) {
        return '<span class="pill warn">' + esc(f) + "</span>";
      }).join(" ") + "</p>";
    }

    if (mode === "unlock" && schNoBuy) {
      h += '<p class="small">不买种：<b>' + schNoBuy.rounds.length + "</b> 轮（上限 " + state.roundLimit + "）";
      if (willBuy) {
        h += "，超了，用 <b>" + state.coins + "</b> 币买种后降到 <b>" + sch.rounds.length + "</b> 轮。";
      } else {
        h += "，在上限内，建议先不买，把币留着。";
      }
      h += "</p>";
    }

    if (ranking) h += rankingTable(ranking, F, N);
    if (mode === "unlock") {
      h += '<details style="margin-top:8px"><summary>试探顺序（补配方用，可先不看）</summary>' +
        exploreSection(res) + "</details>";
    }

    if (mode === "unlock") h += targetRecommendSection();
    h += stageSection(res, sch);
    h += plantingSection(res, plots, sch);

    h += '<details style="margin-top:12px"><summary>后续轮次与完整计划</summary>';
    h += scheduleSection(sch, res.targets);
    h += synthSection(res);
    h += treeSection(res);
    h += "</details>";

    h += purchaseSection(res);
    h += costSection(res);
    h += unknownSection(res);

    box.innerHTML = h;
  }

  // ---------- 事件 ----------
  function renderAll() {
    renderStock();
    renderUnlock();
    renderRecipes();
    renderTargets();
  }

  function bindEvents() {
    $("#recipeSearch").addEventListener("input", renderSearch);
    $("#btnSaveStock").addEventListener("click", function () {
      syncStockFromDom();
      saveStock(); saveMeta();
      $("#stockSaved").textContent = "已保存 " + new Date().toLocaleTimeString();
      calc();
    });

    $("#btnLoadAdmin").addEventListener("click", function () {
      if (!window.GP_ADMIN_STOCK) { alert("没有管理员库存"); return; }
      state.stock.flower = clone(window.GP_ADMIN_STOCK.flower || {});
      state.stock.growing = clone(window.GP_ADMIN_STOCK.growing || {});
      state.stock.seed = clone(window.GP_ADMIN_STOCK.seed || {});
      state.flowers.forEach(function (f) {
        if ((state.stock.flower[f] || 0) + (state.stock.growing[f] || 0) + (state.stock.seed[f] || 0) > 0) {
          state.unlocked.add(f);
        }
      });
      saveStock(); saveMeta(); renderAll(); calc();
      $("#stockSaved").textContent = "已载入管理员库存";
    });

    $("#btnExportSave").addEventListener("click", function () {
      download("geranium-save.json", JSON.stringify(saveSnapshot(), null, 2));
    });

    $("#btnAdminStock").addEventListener("click", function () {
      syncStockFromDom();
      saveStock();
      var text = "// generated " + new Date().toISOString() + "\nwindow.GP_ADMIN_STOCK = " +
        JSON.stringify(state.stock, null, 2) + ";\n";
      download("stock.js", text);
      $("#stockSaved").textContent = "已下载 stock.js，覆盖 data/stock.js 即可";
    });

    $("#btnImportSave").addEventListener("click", function () { $("#fileSave").click(); });
    $("#fileSave").addEventListener("change", function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          applySnapshot(parseSave(reader.result));
          $("#stockSaved").textContent = "存档已导入 " + new Date().toLocaleTimeString();
        } catch (err) { alert("导入失败：" + err.message); }
      };
      reader.readAsText(f);
      e.target.value = "";
    });

    $("#btnCalc").addEventListener("click", function () {
      syncStockFromDom();
      saveStock();
      calc();
    });
    $("#btnUndo").addEventListener("click", doUndo);
    $("#btnRedo").addEventListener("click", doRedo);
    $("#btnSave").addEventListener("click", saveRecipes);

    $("#btnToggleRecipe").addEventListener("click", function () {
      $("#recipeBody").hidden = !$("#recipeBody").hidden;
      renderRecipeToggle();
    });

    $("#btnAdd").addEventListener("click", function () {
      pushUndo();
      state.recipes.push({ a: "初遇", b: "初遇", o1: "", p1: 0.5, o2: "", p2: 0.5, s: null });
      renderRecipes(); calc();
    });

    $("#btnResetRecipes").addEventListener("click", function () {
      if (!confirm("恢复成内置默认配方？当前修改可以先撤销找回。")) return;
      pushUndo();
      state.recipes = clone(D.DEFAULT_RECIPES);
      renderRecipes(); calc();
    });

    $("#btnSyncUnlock").addEventListener("click", function () {
      state.flowers.forEach(function (f) {
        var n = (state.stock.flower[f] || 0) + (state.stock.growing[f] || 0) + (state.stock.seed[f] || 0);
        if (n > 0) state.unlocked.add(f);
      });
      saveMeta(); renderAll(); calc();
    });

    $("#btnAll").addEventListener("click", function () {
      if (state.unlocked.size === state.flowers.length) state.unlocked.clear();
      else state.unlocked = new Set(state.flowers);
      saveMeta(); renderAll(); calc();
    });

    document.querySelectorAll('input[name="targetMode"]').forEach(function (r) {
      r.addEventListener("change", function () {
        if (!r.checked) return;
        state.targetMode = r.value;
        saveMeta(); renderTargets(); calc();
      });
    });
    $("#targetFlower").addEventListener("change", function () {
      state.targetFlower = $("#targetFlower").value;
      saveMeta(); calc();
    });
    $("#targetCount").addEventListener("change", function () {
      state.targetCount = Math.max(1, Math.round(num($("#targetCount").value) || 1));
      saveMeta(); calc();
    });
    $("#unlockCount").addEventListener("change", function () {
      state.unlockCount = Math.max(0, Math.round(num($("#unlockCount").value) || 0));
      saveMeta(); calc();
    });
    $("#sortBy").addEventListener("change", function () {
      state.sortBy = $("#sortBy").value;
      saveMeta(); calc();
    });
    $("#onlyLocked").addEventListener("change", function () {
      state.onlyLocked = $("#onlyLocked").checked;
      saveMeta(); renderTargets(); calc();
    });

    $("#btnExport").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(state.recipes, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "geranium-recipes.json";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });

    $("#btnImport").addEventListener("click", function () { $("#fileImport").click(); });
    $("#fileImport").addEventListener("change", function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var d = JSON.parse(reader.result);
          if (!Array.isArray(d)) throw new Error("不是数组");
          pushUndo();
          state.recipes = d;
          renderRecipes(); calc();
        } catch (err) { alert("导入失败：" + err.message); }
      };
      reader.readAsText(f);
      e.target.value = "";
    });

    $("#plots").addEventListener("change", function () {
      state.plots = Math.max(1, Math.round(num($("#plots").value) || 8));
      saveMeta(); calc();
    });
    $("#roundLimit").addEventListener("change", function () {
      state.roundLimit = Math.max(1, Math.round(num($("#roundLimit").value) || 20));
      saveMeta(); calc();
    });
    $("#fallback").addEventListener("change", function () {
      var v = num($("#fallback").value);
      state.fallback = isNaN(v) ? 0.04 : Math.min(1, Math.max(0.01, v));
      saveMeta(); calc();
    });
    $("#refund").addEventListener("change", function () {
      state.refund = num($("#refund").value) || 0;
      saveMeta(); calc();
    });
    $("#seedYield").addEventListener("change", function () {
      state.seedYield = Math.max(0, Math.round(num($("#seedYield").value) || 0));
      saveMeta(); calc();
    });
    $("#harvestYield").addEventListener("change", function () {
      state.harvestYield = Math.max(1, Math.round(num($("#harvestYield").value) || 1));
      saveMeta(); calc();
    });
    $("#coins").addEventListener("change", function () {
      state.coins = Math.max(0, Math.round(num($("#coins").value) || 0));
      saveMeta(); calc();
    });
    $("#useEarned").addEventListener("change", function () {
      state.useEarned = $("#useEarned").checked;
      saveMeta(); calc();
    });
    $("#failReward").addEventListener("change", function () {
      state.failReward = Math.max(0, Math.round(num($("#failReward").value) || 0));
      saveMeta(); calc();
    });
    $("#maxBuy").addEventListener("change", function () {
      state.maxBuy = Math.max(0, Math.round(num($("#maxBuy").value) || 0));
      saveMeta(); calc();
    });

    document.addEventListener("keydown", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); doUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); doRedo(); }
    });

    window.addEventListener("beforeunload", function (e) {
      saveStock(); saveMeta();
      if (JSON.stringify(state.recipes) !== savedRecipes) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    window.addEventListener("pagehide", function () { saveStock(); saveMeta(); });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") { saveStock(); saveMeta(); }
    });
  }

  function init() {
    loadAll();
    renderStockStatus();
    $("#plots").value = state.plots;
    $("#roundLimit").value = state.roundLimit;
    $("#fallback").value = state.fallback;
    $("#refund").value = String(state.refund);
    $("#seedYield").value = state.seedYield;
    $("#harvestYield").value = state.harvestYield;
    $("#coins").value = state.coins;
    $("#useEarned").checked = state.useEarned;
    $("#failReward").value = state.failReward;
    bindEvents();
    renderAll();
    calc();
  }

  root.GPUI = { init: init, state: state };
})(window);
