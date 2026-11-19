// 纯计算模块：不碰 DOM，方便单测。
// 输入一个 cfg 对象，输出“还差什么、要种什么、按什么顺序合”。
(function (root) {
  "use strict";

  function fmt(x) {
    if (!isFinite(x)) return "∞";
    if (x < 0.05) return "0";
    if (x < 10) return (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
    if (x < 1000) return String(Math.round(x));
    return (x / 1000).toFixed(1) + "k";
  }

  // 有效成功率：配方没填就用 fallback，再乘一个整体缩放（做敏感性分析用）
  function effS(r, fallback, scale) {
    var base = (r.s === null || r.s === undefined || !isFinite(r.s) || r.s <= 0)
      ? fallback : r.s;
    return Math.min(1, Math.max(0.005, base * (scale || 1)));
  }

  function usableRecipes(recipes, flowers) {
    return recipes.filter(function (r) {
      return r.a && r.b && r.a !== "?" && r.b !== "?" && r.o1 &&
        flowers.indexOf(r.a) >= 0 && flowers.indexOf(r.b) >= 0;
    });
  }

  // 每种花“折合多少基础种子”的最小成本
  function computeCosts(cfg, scale) {
    var flowers = cfg.flowers;
    var cost = {}, choice = {};
    flowers.forEach(function (f) { cost[f] = Infinity; });
    cost["初遇"] = 1;
    cost["谜题"] = 1;

    var recs = usableRecipes(cfg.recipes, flowers);
    // 一次成功 = 1 朵成品 + seedYield 颗种子；种子种下各收 harvestYield 朵
    var perSuccess = 1 + cfg.seedYield * cfg.harvestYield;

    for (var it = 0; it < flowers.length * 8 + 20; it++) {
      var changed = false;
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        var ca = cost[r.a], cb = cost[r.b];
        if (!isFinite(ca) || !isFinite(cb)) continue;

        var s = effS(r, cfg.fallback, scale);
        var mult = (1 - cfg.refund * (1 - s)) / s; // 失败返还后的期望倍数

        var pairs = [[r.o1, r.p1], [r.o2, r.p2]];
        for (var j = 0; j < 2; j++) {
          var f = pairs[j][0], p = pairs[j][1];
          if (!f || !(p > 0) || flowers.indexOf(f) < 0) continue;
          var c = (ca + cb) * mult / (p * perSuccess);
          if (c < cost[f] - 1e-9) {
            cost[f] = c;
            choice[f] = r;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return { cost: cost, choice: choice };
  }

  function computeDepth(choice, flowers) {
    var depth = {};
    flowers.forEach(function (f) {
      depth[f] = (f === "初遇" || f === "谜题") ? 0 : Infinity;
    });
    for (var it = 0; it < flowers.length * 8 + 20; it++) {
      var changed = false;
      for (var i = 0; i < flowers.length; i++) {
        var f = flowers[i];
        var r = choice[f];
        if (!r) continue;
        var d = Math.max(depth[r.a], depth[r.b]);
        if (isFinite(d) && d + 1 < depth[f]) {
          depth[f] = d + 1;
          changed = true;
        }
      }
      if (!changed) break;
    }
    return depth;
  }

  function analyze(cfg, scale) {
    scale = scale || 1;
    var flowers = cfg.flowers;

    var cc = computeCosts(cfg, scale);
    var cost = cc.cost, choice = cc.choice;
    var depth = computeDepth(choice, flowers);

    var unlocked = {};
    cfg.unlocked.forEach(function (f) { unlocked[f] = true; });
    var targets = flowers.filter(function (f) { return !unlocked[f]; });

    var need = {}, plant = {}, gen = {}, used = {};
    flowers.forEach(function (f) { need[f] = 0; plant[f] = 0; gen[f] = 0; });
    targets.forEach(function (f) { need[f] += 1; });

    // 从成品往基础种推：深度大的先处理
    var order = flowers.slice().sort(function (a, b) {
      var da = isFinite(depth[a]) ? depth[a] : -1;
      var db = isFinite(depth[b]) ? depth[b] : -1;
      return db - da;
    });

    var perSuccess = 1 + cfg.seedYield * cfg.harvestYield;

    order.forEach(function (f) {
      if (need[f] <= 0) return;

      // 1. 先用现成花材
      var avail = (cfg.stock.flower[f] || 0) + (cfg.stock.growing[f] || 0);
      var useStock = Math.min(need[f], avail);
      if (useStock > 0) need[f] -= useStock;
      if (need[f] <= 1e-9) return;

      // 2. 基础种直接种
      if (f === "初遇" || f === "谜题") {
        plant[f] += need[f];
        need[f] = 0;
        return;
      }

      // 3. 再用库存种子
      var seeds = cfg.stock.seed[f] || 0;
      var useSeed = Math.min(need[f], seeds);
      if (useSeed > 0) {
        plant[f] += useSeed;
        need[f] -= useSeed;
      }
      if (need[f] <= 1e-9) return;

      // 4. 剩下的靠合成
      var r = choice[f];
      if (!r) return;

      var p = (r.o1 === f) ? r.p1 : r.p2;
      var s = effS(r, cfg.fallback, scale);
      var mult = (1 - cfg.refund * (1 - s)) / s;
      var successes = Math.max(1, Math.ceil(need[f] / perSuccess));
      var material = successes * mult / (p > 0 ? p : 1);

      gen[f] += successes * cfg.seedYield;
      used[f] = { r: r, attempts: material, need: successes, s: s, p: p };
      need[r.a] += material;
      need[r.b] += material;
    });

    var totalSeed = flowers.reduce(function (s, f) {
      return s + (plant[f] || 0) + (gen[f] || 0);
    }, 0);
    var rounds = Math.ceil(totalSeed / Math.max(1, cfg.plots));

    var steps = flowers.filter(function (f) { return used[f]; })
      .sort(function (a, b) {
        var da = isFinite(depth[a]) ? depth[a] : 99;
        var db = isFinite(depth[b]) ? depth[b] : 99;
        return da - db;
      })
      .map(function (f) {
        var u = used[f];
        return {
          f: f, r: u.r, attempts: u.attempts, need: u.need,
          s: u.s, p: u.p, depth: depth[f]
        };
      });

    return {
      cost: cost, choice: choice, depth: depth, targets: targets,
      need: need, plant: plant, gen: gen, steps: steps,
      totalSeed: totalSeed, rounds: rounds
    };
  }

  root.GPModel = {
    analyze: analyze,
    fmt: fmt,
    effS: effS,
    usableRecipes: usableRecipes
  };
})(window);
