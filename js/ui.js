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
    fallback: 0.30,
    refund: 0,
    seedYield: 1,
    harvestYield: 2,
    coins: 0,
    failReward: 4,
    targetMode: "unlock",
    targetFlower: "天鹅初恋",
    targetCount: 1,
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
    try { localStorage.setItem(LS_STOCK, JSON.stringify(state.stock)); } catch (e) {}
  }
  function saveMeta() {
    try {
      localStorage.setItem(LS_META, JSON.stringify({
        plots: state.plots,
        fallback: state.fallback,
        refund: state.refund,
        seedYield: state.seedYield,
        harvestYield: state.harvestYield,
        targetMode: state.targetMode,
        targetFlower: state.targetFlower,
        targetCount: state.targetCount,
        sortBy: state.sortBy,
        onlyLocked: state.onlyLocked,
        coins: state.coins,
        failReward: state.failReward,
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
      }
      var m = localStorage.getItem(LS_META) || localStorage.getItem("gp-meta-v3");
      if (m) {
        var mm = JSON.parse(m);
        ["plots", "fallback", "seedYield", "harvestYield", "targetCount", "coins", "failReward"].forEach(function (k) {
          if (mm[k] !== undefined) state[k] = mm[k];
        });
        if (mm.refund !== undefined) state.refund = mm.refund;
        if (mm.targetMode) state.targetMode = mm.targetMode;
        if (mm.onlyLocked !== undefined) state.onlyLocked = mm.onlyLocked;
        if (mm.targetFlower) state.targetFlower = mm.targetFlower;
        if (mm.sortBy) state.sortBy = mm.sortBy;
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
  function renderStock() {
    var t = $("#stockTable");
    var h = "<thead><tr><th>花</th><th>花材</th><th>生长中</th><th>种子</th><th>图鉴</th></tr></thead><tbody>";
    state.flowers.forEach(function (f) {
      var fl = state.stock.flower[f] || 0;
      var gr = state.stock.growing[f] || 0;
      var sd = state.stock.seed[f] || 0;
      var un = state.unlocked.has(f);
      h += "<tr><td>" + esc(f) + "</td>" +
        '<td><input type="number" min="0" step="1" data-k="flower" data-f="' + esc(f) + '" value="' + fl + '"></td>' +
        '<td><input type="number" min="0" step="1" data-k="growing" data-f="' + esc(f) + '" value="' + gr + '"></td>' +
        '<td><input type="number" min="0" step="1" data-k="seed" data-f="' + esc(f) + '" value="' + sd + '"></td>' +
        '<td><button class="mini" data-unlock="' + esc(f) + '">' + (un ? "✓" : "点亮") + "</button></td></tr>";
    });
    t.innerHTML = h + "</tbody>";

    t.querySelectorAll("input").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var k = inp.dataset.k, f = inp.dataset.f;
        state.stock[k] = state.stock[k] || {};
        state.stock[k][f] = Math.max(0, Math.round(num(inp.value) || 0));
        saveStock(); calc();
      });
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
      '<th style="width:13%">亲本 A</th><th style="width:13%">亲本 B</th>' +
      '<th style="width:15%">产物 1</th><th style="width:8%">概率</th>' +
      '<th style="width:15%">产物 2</th><th style="width:8%">概率</th>' +
      '<th style="width:10%">成功率</th><th style="width:6%"></th></tr></thead><tbody>';

    state.recipes.forEach(function (r, i) {
      var sVal = (r.s === null || r.s === undefined || !isFinite(r.s)) ? "" : r.s;
      h += "<tr>" +
        '<td><select data-i="' + i + '" data-p="a">' + flowerOptions(r.a) + "</select></td>" +
        '<td><select data-i="' + i + '" data-p="b">' + flowerOptions(r.b) + "</select></td>" +
        '<td><select data-i="' + i + '" data-p="o1">' + flowerOptions(r.o1) + "</select></td>" +
        '<td><input type="number" min="0" max="1" step="0.05" data-i="' + i + '" data-p="p1" value="' + (r.p1 || 0) + '"></td>' +
        '<td><select data-i="' + i + '" data-p="o2">' + flowerOptions(r.o2) + "</select></td>" +
        '<td><input type="number" min="0" max="1" step="0.05" data-i="' + i + '" data-p="p2" value="' + (r.p2 || 0) + '"></td>' +
        '<td><input type="number" min="0.01" max="1" step="0.01" class="' + (sVal === "" ? "blank" : "") +
          '" data-i="' + i + '" data-p="s" value="' + sVal + '" placeholder="默认"></td>' +
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
      harvestYield: state.harvestYield
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

    var h = "<h3>① 种植</h3>";
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

  function scheduleSection(sch) {
    var h = "<h3>② 轮次安排</h3>";
    if (!sch.rounds.length) {
      h += '<p class="empty">不需要种种子。</p>';
      return h;
    }

    h += '<p class="small">至少 <b>' + sch.rounds.length + "</b> 轮（理论下界 " + sch.lower +
      " 轮），共使用 <b>" + sch.totalPlots + "</b> 块地·次。" +
      (sch.stall ? ' <span class="pill bad">中途卡住：材料不够，检查配方</span>' : "") + "</p>";

    h += '<details><summary>展开每轮种什么</summary>' +
      '<table style="margin-top:8px"><thead><tr><th>轮次</th><th>种什么</th><th>用地</th><th>本轮合成出种子</th></tr></thead><tbody>';
    sch.rounds.forEach(function (r, i) {
      var keys = Object.keys(r.planted);
      var pills = keys.map(function (f) {
        return '<span class="pill">' + esc(f) + " ×" + r.planted[f] + "</span>";
      }).join(" ") || '<span class="muted">（空）</span>';
      var cnt = keys.reduce(function (s, f) { return s + r.planted[f]; }, 0);
      h += "<tr><td>第 " + (i + 1) + " 轮</td><td>" + pills + "</td>" +
        '<td class="mono">' + cnt + "</td>" +
        '<td class="mono">' + r.seeds + "</td></tr>";
    });
    h += "</tbody></table></details>";
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

  function coinSection(res) {
    var fails = 0;
    res.steps.forEach(function (s) {
      fails += Math.max(0, s.attempts * (1 - s.s));
    });
    var income = fails * state.failReward;
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
      res = M.analyze(cfg(), 1);
      if (!res.targets.length) {
        box.innerHTML = '<p class="empty">图鉴已经全解锁了 🎉</p>';
        return;
      }
    }

    var sch = M.schedule(cfg(), res);

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

    if (ranking) h += rankingTable(ranking, F, N);

    if (mode === "unlock") {
      h += exploreSection(res);
      h += '<details style="margin-top:14px"><summary>完整规划：种植 / 轮次 / 合成顺序</summary>';
      h += plantingSection(res, plots, sch);
      h += scheduleSection(sch);
      h += synthSection(res);
      h += "</details>";
    } else {
      h += plantingSection(res, plots, sch);
      h += scheduleSection(sch);
      h += synthSection(res);
    }

    h += '<details style="margin-top:10px"><summary>现在就能合的</summary>' + canDoSection(res) + "</details>";
    h += coinSection(res);
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
    $("#btnCalc").addEventListener("click", calc);
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
    $("#fallback").addEventListener("change", function () {
      var v = num($("#fallback").value);
      state.fallback = isNaN(v) ? 0.3 : Math.min(1, Math.max(0.01, v));
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
    $("#failReward").addEventListener("change", function () {
      state.failReward = Math.max(0, Math.round(num($("#failReward").value) || 0));
      saveMeta(); calc();
    });

    document.addEventListener("keydown", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); doUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); doRedo(); }
    });

    window.addEventListener("beforeunload", function (e) {
      if (JSON.stringify(state.recipes) !== savedRecipes) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

  function init() {
    loadAll();
    $("#plots").value = state.plots;
    $("#fallback").value = state.fallback;
    $("#refund").value = String(state.refund);
    $("#seedYield").value = state.seedYield;
    $("#harvestYield").value = state.harvestYield;
    $("#coins").value = state.coins;
    $("#failReward").value = state.failReward;
    bindEvents();
    renderAll();
    calc();
  }

  root.GPUI = { init: init, state: state };
})(window);
