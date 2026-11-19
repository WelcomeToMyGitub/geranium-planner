// 界面层：读 DOM、渲染表格、绑定事件。
// 所有计算都交给 GPModel，这里只负责“显示”和“存”。
(function (root) {
  "use strict";

  var D = root.GPData, M = root.GPModel;

  var LS_STOCK = "gp-stock-v3";
  var LS_RECIPES = "gp-recipes-v3";
  var LS_META = "gp-meta-v3";

  var state = {
    flowers: D.FLOWERS.slice(),
    unlocked: new Set(D.DEFAULT_UNLOCKED),
    recipes: clone(D.DEFAULT_RECIPES),
    stock: clone(D.DEFAULT_STOCK),
    plots: 8,
    fallback: 0.30,
    refund: 0,
    seedYield: 1,
    harvestYield: 2
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
      var s = localStorage.getItem(LS_STOCK);
      if (s) {
        var d = JSON.parse(s);
        state.stock.flower = d.flower || {};
        state.stock.growing = d.growing || {};
        state.stock.seed = d.seed || {};
      }
      var m = localStorage.getItem(LS_META);
      if (m) {
        var mm = JSON.parse(m);
        if (mm.plots) state.plots = mm.plots;
        if (mm.fallback) state.fallback = mm.fallback;
        if (mm.refund !== undefined) state.refund = mm.refund;
        if (mm.seedYield !== undefined) state.seedYield = mm.seedYield;
        if (mm.harvestYield !== undefined) state.harvestYield = mm.harvestYield;
        if (mm.unlocked) state.unlocked = new Set(mm.unlocked);
      }
      var r = localStorage.getItem(LS_RECIPES);
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
    $("#dirtyFlag").textContent = dirty ? "● 配方有未保存修改" : "";
    $("#btnUndo").disabled = !undoStack.length;
    $("#btnRedo").disabled = !redoStack.length;
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

  // ---------- 配方表 ----------
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

  function calc() {
    var res = M.analyze(cfg(), 1);
    var box = $("#result");

    if (!res.targets.length) {
      box.innerHTML = '<p class="empty">图鉴已经全解锁了 🎉</p>';
      return;
    }

    var plots = Math.max(1, Math.round(state.plots));

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

    // 现在立刻能合的
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

    var rLow = M.analyze(cfg(), 0.7).rounds;
    var rHigh = M.analyze(cfg(), 1.3).rounds;

    var h = '<div class="stat">' +
      "<div><b>" + res.targets.length + "</b><span>还缺图鉴</span></div>" +
      "<div><b>" + Math.ceil(res.totalSeed) + "</b><span>要种种子</span></div>" +
      "<div><b>" + res.rounds + "</b><span>地块·轮（" + plots + " 格）</span></div>" +
      "<div><b>" + rLow + "～" + rHigh + "</b><span>成功率 ±30% 范围</span></div>" +
      "</div>";

    h += '<p class="small muted">缺口：' + res.targets.map(function (f) {
      return '<span class="pill warn">' + esc(f) + "</span>";
    }).join(" ") + "　成功率整体 -30% → " + rLow + " 轮；+30% → " + rHigh + " 轮。</p>";

    // ① 种植
    h += "<h3>① 全局种植计划</h3>";
    if (!plantList.length) {
      h += '<p class="empty">不需要种种子，现有花材够合。</p>';
    } else {
      h += "<table><thead><tr><th>#</th><th>花种</th><th>现在种</th><th>合成产出种子</th><th>合计</th><th>层级</th></tr></thead><tbody>";
      plantList.forEach(function (x, i) {
        h += "<tr><td>" + (i + 1) + "</td><td>" + esc(x.f) +
          (x.d >= 2 ? '<span class="tag deep">关键</span>' : "") + "</td>" +
          '<td class="mono">' + Math.ceil(x.now) + "</td>" +
          '<td class="mono">' + Math.ceil(x.gen) + "</td>" +
          '<td class="mono">' + Math.ceil(x.n) + "</td>" +
          '<td class="mono">' + x.d + "</td></tr>";
      });
      h += "</tbody></table>";

      var c = Math.ceil(res.plant["初遇"] || 0);
      var m = Math.ceil(res.plant["谜题"] || 0);
      h += '<p class="small muted">合计 ' + Math.ceil(res.totalSeed) + " 颗，铺满 " + plots +
        " 格约 " + res.rounds + " 轮。" +
        ((c || m) ? ("基础种配比 初遇 " + c + " : 谜题 " + m + " ≈ " +
          (m ? (c / m).toFixed(2) : "∞") + " : 1。") : "") + "</p>";

      if (alloc.length) {
        h += '<p class="small">本轮建议：' + alloc.map(function (o) {
          return '<span class="pill">' + esc(o.f) + " ×" + o.n + "</span>";
        }).join(" ") + '<span class="muted">　稀有种子先各下 1 颗</span></p>';
      }
    }

    // ② 现在就能合
    h += "<h3>② 现在就能合的（按你手上的花材）</h3>";
    if (!canDo.length) {
      h += '<p class="empty">手上没有能直接配成一对的花材，先等种子成熟。</p>';
    } else {
      h += "<table><thead><tr><th>配方</th><th>成功率</th><th>能做</th><th>期望产物</th><th>建议</th></tr></thead><tbody>";
      canDo.slice(0, 14).forEach(function (c2) {
        var r = c2.r;
        var s = M.effS(r, state.fallback, 1);
        var expTxt = c2.outs.length
          ? c2.outs.map(function (o) { return esc(o[0]) + "×" + M.fmt(c2.n * s * o[1]); }).join("，")
          : '<span class="muted">结果未知</span>';
        var tip = c2.outs.length === 0
          ? '<span class="pill warn">值得试</span>'
          : (c2.useful ? '<span class="pill ok">推荐</span>' : '<span class="pill">已够</span>');
        h += "<tr><td class=\"small mono\">" + esc(r.a) + " × " + esc(r.b) + "</td>" +
          '<td class="mono">' + Math.round(s * 100) + "%" + (r.s == null ? "*" : "") + "</td>" +
          '<td class="mono">' + c2.n + "</td>" +
          '<td class="small">' + expTxt + "</td><td>" + tip + "</td></tr>";
      });
      h += '</tbody></table><p class="small muted">* = 成功率是默认值补的，不是实测。</p>';
    }

    // ③ 合成顺序
    h += "<h3>③ 合成顺序（按缺口，从材料往上）</h3>";
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

    // ④ 成本
    h += '<details style="margin-top:14px"><summary>④ 每种花的最优路线 / 期望成本</summary>' +
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
    h += '</tbody></table><p class="small muted">成本 = 折合基础种子，已含成功率、种子产出与失败返还。</p></details>';

    // ⑤ 待测
    var unknown = state.recipes.filter(function (r) {
      return !r.o1 || r.a === "?" || r.b === "?";
    });
    if (unknown.length) {
      h += '<details style="margin-top:10px"><summary>⑤ 还没填结果的配方（' + unknown.length + '）</summary><ul class="small mono">' +
        unknown.map(function (r) {
          return "<li>" + esc(r.a || "?") + " × " + esc(r.b || "?") + " → " + (r.o1 ? esc(r.o1) : "?") + "</li>";
        }).join("") + "</ul></details>";
    }

    box.innerHTML = h;
  }

  // ---------- 渲染 + 事件 ----------
  function renderAll() {
    renderStock();
    renderUnlock();
    renderRecipes();
  }

  function bindEvents() {
    $("#btnCalc").addEventListener("click", calc);
    $("#btnUndo").addEventListener("click", doUndo);
    $("#btnRedo").addEventListener("click", doRedo);
    $("#btnSave").addEventListener("click", saveRecipes);

    $("#btnAdd").addEventListener("click", function () {
      pushUndo();
      state.recipes.push({ a: "初遇", b: "初遇", o1: "", p1: 0.5, o2: "", p2: 0.5, s: null });
      renderRecipes(); calc();
    });

    $("#btnAll").addEventListener("click", function () {
      if (state.unlocked.size === state.flowers.length) state.unlocked.clear();
      else state.unlocked = new Set(state.flowers);
      saveMeta(); renderAll(); calc();
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
    bindEvents();
    renderAll();
    calc();
  }

  root.GPUI = { init: init, state: state };
})(window);
