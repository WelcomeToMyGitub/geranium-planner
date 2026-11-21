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
  function computeCosts(cfg, scale, force) {
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
    // 强制指定某个花走某条配方（用于“指定花材”模式下逐条比较路线）
    if (force) {
      Object.keys(force).forEach(function (f) {
        var r = force[f];
        if (!r) return;
        var ca = cost[r.a], cb = cost[r.b];
        if (!isFinite(ca) || !isFinite(cb)) return;
        var p = (r.o1 === f) ? r.p1 : r.p2;
        if (!(p > 0)) return;
        var s = effS(r, cfg.fallback, scale);
        var mult = (1 - cfg.refund * (1 - s)) / s;
        cost[f] = (ca + cb) * mult / (p * perSuccess);
        choice[f] = r;
      });
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

  function analyze(cfg, scale, opts) {
    scale = scale || 1;
    opts = opts || {};
    var flowers = cfg.flowers;

    var cc = computeCosts(cfg, scale, opts.force);
    var cost = cc.cost, choice = cc.choice;
    var depth = computeDepth(choice, flowers);

    var unlocked = {};
    cfg.unlocked.forEach(function (f) { unlocked[f] = true; });
    var targets = opts.targets || flowers.filter(function (f) { return !unlocked[f]; });

    var need = {}, plant = {}, gen = {}, used = {}, bought = {};
    var coinsSpent = 0, coinsEarned = 0;
    var coinsAvail = cfg.coinBudget || 0;
    flowers.forEach(function (f) { need[f] = 0; plant[f] = 0; gen[f] = 0; });
    if (opts.demand) {
      Object.keys(opts.demand).forEach(function (f) {
        need[f] = (need[f] || 0) + opts.demand[f];
      });
    } else {
      targets.forEach(function (f) { need[f] += 1; });
    }

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
        plant[f] += need[f] / Math.max(1, cfg.harvestYield);
        need[f] = 0;
        return;
      }

      // 3. 再用库存种子（1 颗种子收 harvestYield 朵）
      var H = Math.max(1, cfg.harvestYield);
      var seedsNeeded = Math.ceil(need[f] / H);
      var seeds = cfg.stock.seed[f] || 0;
      var useSeed = Math.min(seedsNeeded, seeds);
      if (useSeed > 0) {
        plant[f] += useSeed;
        need[f] -= useSeed * H;
        if (need[f] < 0) need[f] = 0;
      }
      if (need[f] <= 1e-9) return;

      // 3.5 用花花币买种子
      var price = cfg.seedPrice ? cfg.seedPrice[f] : 0;
      if (price > 0 && coinsAvail >= price) {
        var buySeeds = Math.ceil(need[f] / H);
        var afford = Math.floor(coinsAvail / price);
        var buy = Math.min(buySeeds, afford);
        if (buy > 0) {
          bought[f] = (bought[f] || 0) + buy;
          coinsSpent += buy * price;
          coinsAvail -= buy * price;
          need[f] -= buy * H;
          if (need[f] < 0) need[f] = 0;
        }
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

      var cs = r.cs || 0;
      var cf = (r.cf !== null && r.cf !== undefined) ? r.cf : (cfg.failReward || 0);
      var income = material * (s * cs + (1 - s) * cf);
      coinsEarned += income;
      if (cfg.useEarnedCoins) coinsAvail += income;

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
      need: need, plant: plant, gen: gen, bought: bought, steps: steps,
      totalSeed: totalSeed, rounds: rounds,
      coinsSpent: coinsSpent, coinsEarned: coinsEarned
    };
  }

  // 轮次排程：把所有要种的种子按依赖顺序铺到地块上，算出最少几轮、每轮种什么
  function schedule(cfg, res) {
    var H = Math.max(1, cfg.harvestYield || 1);
    var SY = Math.max(0, cfg.seedYield || 0);
    var P = Math.max(1, cfg.plots || 1);

    var flowers = {}, seeds = {}, target = {}, done = {};
    cfg.flowers.forEach(function (f) {
      flowers[f] = (cfg.stock.flower[f] || 0) + (cfg.stock.growing[f] || 0);
      seeds[f] = cfg.stock.seed[f] || 0;
      target[f] = Math.ceil((res.plant[f] || 0) + (res.gen[f] || 0));
      done[f] = 0;
    });

    var synth = res.steps.map(function (s) {
      return { f: s.f, r: s.r, left: Math.max(0, Math.ceil(s.need)) };
    });

    function remainSeeds() {
      var t = 0;
      cfg.flowers.forEach(function (f) { t += Math.max(0, target[f] - done[f]); });
      return t;
    }
    function remainSynth() {
      return synth.reduce(function (s, x) { return s + Math.max(0, x.left); }, 0);
    }

    var rounds = [], totalPlots = 0, guard = 0, stall = false;

    while (guard++ < 400) {
      if (remainSeeds() === 0 && remainSynth() === 0) break;

      var planted = {}, producedSeeds = 0, synthActs = {};

      // 1. 先把能合的合掉（实验室不占地）
      var changed = true;
      while (changed) {
        changed = false;
        for (var i = 0; i < synth.length; i++) {
          var st = synth[i];
          if (st.left <= 0) continue;
          if (flowers[st.r.a] >= 1 && flowers[st.r.b] >= 1) {
            flowers[st.r.a] -= 1;
            flowers[st.r.b] -= 1;
            flowers[st.f] += 1;
            seeds[st.f] += SY;
            st.left -= 1;
            producedSeeds += SY;
            synthActs[st.f] = (synthActs[st.f] || 0) + 1;
            changed = true;
          }
        }
      }

      // 2. 种：链深的先种，基础种兜底
      var order = cfg.flowers.slice().sort(function (a, b) {
        var da = isFinite(res.depth[a]) ? res.depth[a] : 0;
        var db = isFinite(res.depth[b]) ? res.depth[b] : 0;
        return db - da;
      });

      var used = 0;
      for (var k = 0; k < order.length && used < P; k++) {
        var f = order[k];
        var rem = target[f] - done[f];
        if (rem <= 0) continue;
        var avail;
        if (f === "初遇" || f === "谜题") avail = rem;
        else avail = Math.min(rem, Math.floor(seeds[f] + 1e-9));
        if (avail <= 0) continue;

        var n = Math.min(avail, P - used);
        planted[f] = (planted[f] || 0) + n;
        done[f] += n;
        seeds[f] -= n;
        used += n;
      }

      // 3. 收获：本轮种下的，下一轮才能用来合成
      Object.keys(planted).forEach(function (f) {
        flowers[f] += planted[f] * H;
      });

      totalPlots += used;
      rounds.push({ planted: planted, seeds: producedSeeds, synth: synthActs });

      if (used === 0 && producedSeeds === 0) { stall = true; break; }
    }

    if (remainSeeds() > 0 || remainSynth() > 0) stall = true;

    var totalTarget = cfg.flowers.reduce(function (s, f) {
      return s + Math.max(0, target[f]);
    }, 0);
    var lower = Math.ceil(totalTarget / P);

    return { rounds: rounds, totalPlots: totalPlots, lower: lower, stall: stall };
  }

  root.GPModel = {
    analyze: analyze,
    schedule: schedule,
    fmt: fmt,
    effS: effS,
    usableRecipes: usableRecipes
  };
})(window);
