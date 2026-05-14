// ===== 全局状态 =====
let grammar = {};
let terminals = new Set();
let nonTerminals = new Set();
let startSymbol = "";
let firstSets = {};
let followSets = {};
let parseTable = {};

// ===== 工具函数 =====

function loadExample() {
  document.getElementById("grammar-input").value = `E -> T E'
E' -> + T E' | ε
T -> F T'
T' -> * F T' | ε
F -> ( E ) | i`;
}

function clearAll() {
  document.getElementById("grammar-input").value = "";
  document.getElementById("output").classList.remove("visible");
  document.getElementById("error-msg").style.display = "none";
  document.getElementById("ll1-badge").style.display = "none";
}

function showError(msg) {
  const el = document.getElementById("error-msg");
  el.textContent = "错误：" + msg;
  el.style.display = "block";
}

function switchTab(name) {
  const names = ["first", "follow", "table", "trace"];
  document.querySelectorAll(".tab").forEach((t, i) => {
    t.classList.toggle("active", names[i] === name);
  });
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
}

// ===== 文法解析 =====

function parseGrammar(text) {
  grammar = {};
  terminals = new Set();
  nonTerminals = new Set();

  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  if (!lines.length) throw new Error("文法为空");

  lines.forEach((line, idx) => {
    const arrow = line.indexOf("->");
    if (arrow === -1) throw new Error(`第 ${idx + 1} 行缺少 ->`);
    const lhs = line.slice(0, arrow).trim();
    if (!lhs) throw new Error(`第 ${idx + 1} 行左部为空`);
    nonTerminals.add(lhs);
    if (idx === 0) startSymbol = lhs;
    const prods = line
      .slice(arrow + 2)
      .trim()
      .split("|")
      .map((p) =>
        p
          .trim()
          .split(/\s+/)
          .filter((s) => s),
      );
    grammar[lhs] = (grammar[lhs] || []).concat(prods);
  });

  Object.values(grammar)
    .flat()
    .flat()
    .forEach((sym) => {
      if (!nonTerminals.has(sym) && sym !== "ε") terminals.add(sym);
    });
  terminals.add("$");
}

// ===== 核心算法 =====

/**
 * 判断一个符号是否能推导出 ε
 * @param {string} sym - 符号
 * @param {Set} visited - 防止无限递归
 */
function canDeriveEpsilon(sym, visited = new Set()) {
  if (sym === "ε") return true;
  if (terminals.has(sym)) return false;
  if (visited.has(sym)) return false;
  visited.add(sym);

  for (let prod of grammar[sym] || []) {
    let allCanDerive = true;
    for (let ch of prod) {
      if (!canDeriveEpsilon(ch, new Set(visited))) {
        allCanDerive = false;
        break;
      }
    }
    if (allCanDerive) return true;
  }
  return false;
}

/**
 * 计算一个符号串的 FIRST 集
 * @param {string[]} seq - 符号数组，如 ['+', 'T', "E'"]
 * @returns {Set<string>}
 */
function firstOfSequence(seq) {
  const result = new Set();

  for (let sym of seq) {
    if (sym === "ε") continue;

    if (terminals.has(sym)) {
      result.add(sym);
      return result; // 终结符不能推 ε，直接停
    }

    if (nonTerminals.has(sym)) {
      // 把 FIRST(sym) - {ε} 加入结果
      for (let x of firstSets[sym] || []) {
        if (x !== "ε") result.add(x);
      }
      if (!canDeriveEpsilon(sym)) return result; // sym 不能推 ε，停止
      // sym 能推 ε，继续看下一个符号
    }
  }

  // 所有符号都能推出 ε
  result.add("ε");
  return result;
}

/**
 * 计算所有非终结符的 FIRST 集
 */
function computeFirst() {
  nonTerminals.forEach((nt) => (firstSets[nt] = new Set()));

  let changed = true;
  while (changed) {
    changed = false;
    for (let nt of nonTerminals) {
      for (let prod of grammar[nt]) {
        const before = firstSets[nt].size;
        for (let x of firstOfSequence(prod)) {
          firstSets[nt].add(x);
        }
        if (firstSets[nt].size > before) changed = true;
      }
    }
  }
}

/**
 * 计算所有非终结符的 FOLLOW 集
 */
function computeFollow() {
  nonTerminals.forEach((nt) => (followSets[nt] = new Set()));
  followSets[startSymbol].add("$");

  let changed = true;
  while (changed) {
    changed = false;
    for (let nt of nonTerminals) {
      for (let prod of grammar[nt]) {
        for (let i = 0; i < prod.length; i++) {
          const sym = prod[i];
          if (!nonTerminals.has(sym)) continue;

          const beta = prod.slice(i + 1); // sym 右边的串
          const before = followSets[sym].size;

          // 把 FIRST(beta) - {ε} 加入 FOLLOW(sym)
          for (let x of firstOfSequence(beta)) {
            if (x !== "ε") followSets[sym].add(x);
          }

          // 如果 beta 能全推出 ε，把 FOLLOW(nt) 加入 FOLLOW(sym)
          if (firstOfSequence(beta).has("ε")) {
            for (let x of followSets[nt]) followSets[sym].add(x);
          }

          if (followSets[sym].size > before) changed = true;
        }
      }
    }
  }
}

/**
 * 构建预测分析表
 */
function buildParseTable() {
  parseTable = {};
  nonTerminals.forEach((nt) => {
    parseTable[nt] = {};
    terminals.forEach((t) => (parseTable[nt][t] = []));
  });

  for (let nt of nonTerminals) {
    for (let prod of grammar[nt]) {
      const first = firstOfSequence(prod);

      // 对 FIRST(prod) - {ε} 中每个终结符填表
      for (let a of first) {
        if (a !== "ε") parseTable[nt][a].push(prod);
      }

      // 如果 prod 能推出 ε，对 FOLLOW(nt) 中每个终结符填表
      if (first.has("ε")) {
        for (let b of followSets[nt]) {
          parseTable[nt][b].push(prod);
        }
      }
    }
  }
}

/**
 * 判断是否是 LL(1) 文法
 */
function isLL1() {
  for (let nt of nonTerminals)
    for (let t of terminals)
      if ((parseTable[nt][t] || []).length > 1) return false;
  return true;
}

// ===== 主入口 =====

function analyze() {
  document.getElementById("error-msg").style.display = "none";
  try {
    parseGrammar(document.getElementById("grammar-input").value);
    computeFirst();
    computeFollow();
    buildParseTable();
    renderFirst();
    renderFollow();
    renderTable();

    const ll1 = isLL1();
    const badge = document.getElementById("ll1-badge");
    badge.style.display = "inline-block";
    badge.textContent = ll1 ? "LL(1) ✓" : "非 LL(1)";
    badge.className = "is-ll1-badge " + (ll1 ? "yes" : "no");

    document.getElementById("output").classList.add("visible");
  } catch (e) {
    showError(e.message);
  }
}

// ===== 渲染函数 =====

function renderFirst() {
  document.getElementById("first-grid").innerHTML = [...nonTerminals]
    .map(
      (nt) => `
    <div class="set-card">
      <div class="symbol">FIRST(${nt})</div>
      <div class="values">{ ${[...firstSets[nt]].join(", ") || "∅"} }</div>
    </div>`,
    )
    .join("");
}

function renderFollow() {
  document.getElementById("follow-grid").innerHTML = [...nonTerminals]
    .map(
      (nt) => `
    <div class="set-card">
      <div class="symbol">FOLLOW(${nt})</div>
      <div class="values">{ ${[...followSets[nt]].join(", ") || "∅"} }</div>
    </div>`,
    )
    .join("");
}

function renderTable() {
  const terms = [...terminals];
  const nts = [...nonTerminals];
  let html =
    "<tr><th></th>" + terms.map((t) => `<th>${t}</th>`).join("") + "</tr>";
  nts.forEach((nt) => {
    html += '<tr><td style="font-weight:600">' + nt + "</td>";
    terms.forEach((t) => {
      const cell = parseTable[nt][t] || [];
      if (!cell.length) {
        html += '<td class="empty">—</td>';
      } else if (cell.length > 1) {
        html += `<td class="conflict">${cell.map((p) => nt + " → " + p.join(" ")).join("<br>")}</td>`;
      } else {
        html += `<td>${nt} → ${cell[0].join(" ")}</td>`;
      }
    });
    html += "</tr>";
  });
  document.getElementById("parse-table").innerHTML = html;
}

// ===== 分析过程模拟 =====

function runTrace() {
  const inputStr = document.getElementById("input-string").value.trim();
  if (!inputStr) return;

  const tokens = inputStr.split(/\s+/).filter((s) => s);
  const result = document.getElementById("trace-result");

  const stack = ["$", startSymbol];
  let pos = 0,
    steps = [],
    accepted = false,
    errorMsg = "";

  while (true) {
    const top = stack[stack.length - 1];
    const cur = tokens[pos] || "$";
    const stackStr = [...stack].reverse().join(" ");
    const remaining = tokens.slice(pos).join(" ");

    if (top === "$" && cur === "$") {
      steps.push({
        stack: stackStr,
        input: remaining,
        action: "接受",
        badge: "accept",
      });
      accepted = true;
      break;
    }

    if (terminals.has(top)) {
      if (top === cur) {
        steps.push({
          stack: stackStr,
          input: remaining,
          action: `匹配 ${top}`,
          badge: "match",
        });
        stack.pop();
        pos++;
      } else {
        steps.push({
          stack: stackStr,
          input: remaining,
          action: `错误：期望 ${top}，遇到 ${cur}`,
          badge: "error",
        });
        errorMsg = `期望 ${top}，遇到 ${cur}`;
        break;
      }
    } else if (nonTerminals.has(top)) {
      const cell = (parseTable[top] || {})[cur] || [];
      if (!cell.length) {
        steps.push({
          stack: stackStr,
          input: remaining,
          action: `错误：M[${top}, ${cur}] 为空`,
          badge: "error",
        });
        errorMsg = `M[${top}, ${cur}] 为空`;
        break;
      }
      const prod = cell[0];
      steps.push({
        stack: stackStr,
        input: remaining,
        action: `${top} → ${prod.join(" ")}`,
        badge: "predict",
      });
      stack.pop();
      if (!(prod.length === 1 && prod[0] === "ε")) {
        for (let i = prod.length - 1; i >= 0; i--) stack.push(prod[i]);
      }
    } else {
      break;
    }

    if (steps.length > 200) {
      errorMsg = "步骤过多，可能存在问题";
      break;
    }
  }

  // 渲染结果
  let html = "";
  if (accepted) {
    html += '<div class="result-banner accept">✓ 接受 — 输入串合法</div>';
  } else {
    html += `<div class="result-banner reject">✗ 拒绝 — ${errorMsg}</div>`;
  }

  html += `
    <table class="trace-table">
      <tr><th>栈</th><th>剩余输入</th><th>动作</th></tr>`;
  steps.forEach((s) => {
    html += `<tr>
      <td>${s.stack}</td>
      <td>${s.input}</td>
      <td><span class="badge ${s.badge}">${s.action}</span></td>
    </tr>`;
  });
  html += "</table>";
  result.innerHTML = html;
}
