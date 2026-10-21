/* ============================================================
   PlanBlock —— 可选的回合计划协议（P74·A+ 第 3 层）
   ------------------------------------------------------------
   模型可以在正文末尾附一行：
     <<<PLAN>>>{"class":"conflict","escalation":"relationship","oocRisk":false}<<<END>>>
   声明「这一轮它自己认为发生了什么级别的变化」。引擎据此做两件事：
   1. 把这段从正文里**剥掉**（玩家永远看不到协议文本，历史里也不留）；
   2. 与工具结果对账（narrative_lint 的 escalation 检查）。

   设计取舍（重要，别随手改）：
   1. **不用 response_format / jsonMode**：那会把整轮输出变成 JSON，
      破坏流式、破坏【正文】/【选项】解析，也踩端点兼容（JSON_MODE_NOT_SUPPORTED）。
   2. **缺失即 fail-open**：没有 PLAN 块 ⇒ 视同 {class:'chat', escalation:'none'}，
      绝不因为模型没写而报错或阻断。
   3. 长度上限 200 字符：防止模型把整段计划塞进来（超限整块丢掉并标记 too-long）。
   4. 解析失败也只丢块、不丢正文：正文是玩家要的东西，协议是附加信息。
   ============================================================ */
var PlanBlock = (function () {
  'use strict';

  var START = '<<<PLAN>>>';
  var END = '<<<END>>>';
  var MAX_LEN = 200;

  function defaultPlan() {
    return { 'class': 'chat', escalation: 'none', oocRisk: false };
  }

  function validClass(v) {
    return (typeof TurnIntent !== 'undefined' && TurnIntent && typeof TurnIntent.isClass === 'function')
      ? TurnIntent.isClass(v)
      : (['chat', 'trade', 'conflict', 'care', 'probe', 'event'].indexOf(v) >= 0);
  }

  function validEscalation(v) {
    return (typeof TurnIntent !== 'undefined' && TurnIntent && typeof TurnIntent.isEscalation === 'function')
      ? TurnIntent.isEscalation(v)
      : (['none', 'relationship', 'major'].indexOf(v) >= 0);
  }

  // 白名单化：只认 class / escalation / oocRisk 三个键，其它一律丢弃。
  function normalize(obj) {
    var out = defaultPlan();
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    if (validClass(obj['class'])) out['class'] = obj['class'];
    if (validEscalation(obj.escalation)) out.escalation = obj.escalation;
    if (typeof obj.oocRisk === 'boolean') out.oocRisk = obj.oocRisk;
    else if (typeof obj.oocRisk === 'number') out.oocRisk = !!obj.oocRisk;
    return out;
  }

  // 主入口：consume(text) => {text（已剥块）, plan|null, ok, reason}
  //   reason: ok / absent / unclosed / too-long / bad-json / not-object
  function consume(text) {
    var src = (text === null || text === undefined) ? '' : String(text);
    var i = src.indexOf(START);
    if (i < 0) return { text: src, plan: null, ok: false, reason: 'absent' };

    var j = src.indexOf(END, i + START.length);
    if (j < 0) {
      // 没闭合：把从 START 到结尾整段丢掉，避免玩家看到半截协议
      var cutHead = src.slice(0, i).replace(/[ \t\r\n]+$/, '');
      return { text: cutHead, plan: null, ok: false, reason: 'unclosed' };
    }

    var inner = src.slice(i + START.length, j).trim();
    var head = src.slice(0, i).replace(/[ \t\r\n]+$/, '');
    var tail = src.slice(j + END.length).replace(/^[ \t\r\n]+/, '');
    var rest = head && tail ? (head + '\n' + tail) : (head || tail);

    var reason = 'ok';
    var plan = null;
    if (inner.length > MAX_LEN) {
      reason = 'too-long';
    } else {
      try {
        var obj = JSON.parse(inner);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
          reason = 'not-object';
        } else {
          plan = normalize(obj);
        }
      } catch (e) {
        reason = 'bad-json';
      }
    }
    if (!plan) return { text: rest, plan: null, ok: false, reason: reason };
    return { text: rest, plan: plan, ok: true, reason: reason };
  }

  function strip(text) {
    return consume(text).text;
  }

  // 系统提示里的协议说明（只有一行，避免 prompt 膨胀）
  function specLine() {
    return '可选协议：若本轮发生了关系或事件层面的变化，在正文之后附一行 '
      + START + '{"class":"chat|trade|conflict|care|probe|event","escalation":"none|relationship|major"}'
      + END + '；没有变化就完全不写。这一行不会显示给玩家。';
  }

  return {
    START: START,
    END: END,
    MAX_LEN: MAX_LEN,
    defaultPlan: defaultPlan,
    normalize: normalize,
    consume: consume,
    strip: strip,
    specLine: specLine
  };
})();

if (typeof window !== 'undefined') window.PlanBlock = PlanBlock;
if (typeof module !== 'undefined' && module.exports) module.exports = PlanBlock;
